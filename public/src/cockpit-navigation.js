import { ventoInstantaneo } from './meteorologia.js';
import { perfilTerreno, ruido2 } from './relevo.js';
import { textoUI } from './copy-en.js';

export const NM_M = 1852;
export const ALCANCES_NM = Object.freeze([2, 5, 10, 20]);
const KT_MS = 3600 / NM_M;
const FT_M = 1 / 0.3048;
const numero = (n, fallback = 0) => Number.isFinite(n) ? n : fallback;
const graus = r => ((numero(r) * 180 / Math.PI) % 360 + 360) % 360;
const alcance = n => ALCANCES_NM.includes(n) ? n : 5;
const valido = p => Number.isFinite(p?.xM) && Number.isFinite(p?.zM);
const lista = a => Array.isArray(a) ? a : [];

/** Screen coordinates in range radii: +x east/right, -y north/up; no 3D x mirror. */
export function projectarNavegacao(ponto, voo = {}, { rangeNm = 5, headingUp = false } = {}) {
  if (!valido(ponto)) return null;
  const dx = ponto.xM - numero(voo.xM), dz = ponto.zM - numero(voo.zM);
  const distanciaM = Math.hypot(dx, dz);
  if (!Number.isFinite(distanciaM)) return null;
  const h = headingUp ? numero(voo.rumoRad) : 0;
  const raioM = alcance(rangeNm) * NM_M;
  return { x: (dx * Math.cos(h) - dz * Math.sin(h)) / raioM,
    y: -(dx * Math.sin(h) + dz * Math.cos(h)) / raioM,
    distanciaM, dentro: distanciaM <= raioM, bearingGraus: graus(Math.atan2(dx, dz)) };
}

/** Progressive physics uses total airspeed; subtract the vertical component before wind. */
export function velocidadeSoloNavegacao(m = {}) {
  const v = m.voo ?? {};
  const velocidade = Math.max(0, numero(v.velocidadeMs));
  const vertical = v.emSolo ? 0 : Math.min(velocidade, Math.abs(numero(v.velocidadeVerticalMs)));
  // Historical recordings used speed as a horizontal component and steady wind.
  const historico = m.perfil === 'ilustrativo-3';
  const horizontalArMs = historico ? velocidade : Math.sqrt(Math.max(0, velocidade ** 2 - vertical ** 2));
  const vento = historico ? { x: numero(m.ambiente?.ventoMs?.x), z: numero(m.ambiente?.ventoMs?.z), vertical: 0 }
    : ventoInstantaneo(m.ambiente, numero(v.tempoS), numero(m.semente, 222));
  const xMs = Math.sin(numero(v.rumoRad)) * horizontalArMs + (v.emSolo ? 0 : vento.x);
  const zMs = Math.cos(numero(v.rumoRad)) * horizontalArMs + (v.emSolo ? 0 : vento.z);
  const soloMs = Math.hypot(xMs, zMs);
  return { xMs, zMs, horizontalArMs, soloMs, soloKt: soloMs * KT_MS,
    rumoGraus: graus(v.rumoRad), trajetoGraus: soloMs > .01 ? graus(Math.atan2(xMs, zMs)) : graus(v.rumoRad), vento };
}

const TIPOS = { trafego: 'TRAFFIC', baloes: 'LANTERNS', aves: 'BIRDS', celula: 'WEATHER', contacto: 'CONTACT', relevo: 'TERRAIN' };
const label = p => String(textoUI(p.nome ?? p.id ?? 'Waypoint'));
const ROTULOS_MAPA = { foz: 'FOZ', ponte: 'DOM LUÍS I', aeroporto: 'AIRPORT', matosinhos: 'MATOSINHOS' };

/** All readings are derived from one flight snapshot, with no writes to the simulator. */
export function dadosNavegacao(m = {}, opts = {}) {
  const v = m.voo ?? {};
  const rangeNm = alcance(opts.rangeNm), headingUp = Boolean(opts.headingUp);
  const projecto = p => projectarNavegacao(p, v, { rangeNm, headingUp });
  const movimento = velocidadeSoloNavegacao(m);
  const destinos = lista(m.destinos).filter(valido);
  const activo = destinos.find(p => p.id === m.destinoId);
  let destino = null;
  if (activo) {
    const p = projecto(activo);
    if (p) {
      const aproximacaoMs = p.distanciaM > 0 ? ((activo.xM - numero(v.xM)) * movimento.xMs + (activo.zM - numero(v.zM)) * movimento.zMs) / p.distanciaM : 0;
      destino = { ...p, id: activo.id, label: label(activo), distanceNm: p.distanciaM / NM_M,
        etaS: p.distanciaM < 1 ? 0 : aproximacaoMs > 1 ? p.distanciaM / aproximacaoMs : null };
    }
  }
  const ordenados = lista(m.circuito).length ? m.circuito.map(id => destinos.find(p => p.id === id)).filter(Boolean) : destinos;
  const rota = ordenados.map(p => ({ ...projecto(p), id: p.id, label: label(p), active: p.id === m.destinoId }));
  const pistas = lista(m.pistas ?? m.destinos).filter(p => valido(p) && Number.isFinite(p.pistaM) && p.pistaM > 0).map(p => ({
    id: p.id, label: label(p), centro: projecto(p),
    inicio: projecto({ xM: p.xM, zM: p.zM - p.pistaM / 2 }),
    fim: projecto({ xM: p.xM, zM: p.zM + p.pistaM / 2 }),
  }));
  let ameacasFora = 0;
  const ameacas = [];
  for (const a of lista(m.ameacas)) {
    const p = projecto(a);
    if (!p) continue;
    if (!p.dentro) { ameacasFora++; continue; }
    const altitudeConhecida = Number.isFinite(a.altitudeM) && !a.cilindro;
    const relativeAltitudeFt = altitudeConhecida ? (a.altitudeM - numero(v.altitudeM)) * FT_M : null;
    const centena = relativeAltitudeFt == null ? null : Math.round(relativeAltitudeFt / 100);
    const separationM = a.cilindro ? p.distanciaM : Math.hypot(p.distanciaM, numero(a.altitudeM, numero(v.altitudeM)) - numero(v.altitudeM));
    const raioM = Math.max(0, numero(a.raioProtecaoM)) + Math.max(0, numero(a.dispersaoM));
    ameacas.push({ ...p, id: a.id, label: TIPOS[a.visual] ?? TIPOS[a.tipo] ?? 'HAZARD', relativeAltitudeFt,
      altitudeLabel: centena == null ? '—' : `${centena < 0 ? '−' : '+'}${String(Math.abs(centena)).padStart(2, '0')}`,
      separationM, distanceNm: p.distanciaM / NM_M, raio: raioM / (rangeNm * NM_M),
      close: separationM < raioM + 200, cilindro: Boolean(a.cilindro) });
  }
  ameacas.sort((a, b) => a.distanciaM - b.distanciaM);
  return { rangeNm, headingUp, headingGraus: movimento.rumoGraus, trackGraus: movimento.trajetoGraus,
    groundSpeedKt: movimento.soloKt, windSpeedKt: Math.hypot(movimento.vento.x, movimento.vento.z) * KT_MS,
    windFromGraus: graus(Math.atan2(-movimento.vento.x, -movimento.vento.z)), vento: movimento.vento,
    destino, rota, pistas, ameacas, ameacasFora };
}

// Same procedural coastline/river as the 3D Porto scene. These are not charts or imagery.
function geografiaPorto() {
  const perfil = perfilTerreno('porto');
  const costa = [];
  for (let zM = 90000; zM <= 220000; zM += 700) {
    costa.push({ xM: -(perfil.costaX + perfil.recorteM * ruido2(zM / 7000, 3.7, perfil.seed + 5)), zM });
  }
  return { costa, rio: perfil.rio.pontos.map(([x, zM]) => ({ xM: -x, zM })), larguraM: perfil.rio.larguraM };
}
const PORTO = geografiaPorto();
const MARCOS = [{ xM: -2200, zM: 153800, label: 'PORTO' }, { xM: -6200, zM: 157800, label: 'MATOSINHOS' }, { xM: -1500, zM: 151300, label: 'GAIA' }];
const rumoTexto = g => String(Math.round(g) % 360).padStart(3, '0');
const tempoTexto = s => s == null || s >= 6000 ? '—' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Rectangular chart viewport keeps compact 350×142 displays useful. */
export function geometriaNavegacao(width, height) {
  const w = Math.max(1, numero(width, 350)), h = Math.max(1, numero(height, 184));
  const top = 19, bottom = 17;
  return { cx: w / 2, cy: h * .53, radius: Math.max(12, Math.min(w / 2 - 18, h * 1.15)),
    top, bottom, chartHeight: Math.max(1, h - top - bottom) };
}

/** Canvas display, updated by the existing cockpit cadence; it creates no animation loop. */
export function criarNavegacaoCockpit(canvas) {
  let ctx = null;
  try { ctx = canvas?.getContext('2d'); } catch { /* The surrounding cockpit remains usable. */ }
  let estado = null, rangeNm = 5, headingUp = false, width = 0, height = 0, dpr = 1, disposed = false;
  function medir() {
    if (disposed || !ctx) return false;
    const r = canvas.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const nextDpr = Math.min(1.5, Math.max(1, numero(globalThis.devicePixelRatio, 1)));
    if (r.width !== width || r.height !== height || dpr !== nextDpr) {
      width = r.width; height = r.height; dpr = nextDpr;
      canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
    }
    return true;
  }
  function desenhar() {
    if (!estado || !medir()) return;
    const d = dadosNavegacao(estado, { rangeNm, headingUp });
    const { cx, cy, radius, top: chartTop, bottom: chartBottom, chartHeight } = geometriaNavegacao(width, height);
    const point = p => [cx + p.x * radius, cy + p.y * radius];
    const project = p => projectarNavegacao(p, estado.voo ?? {}, { rangeNm, headingUp });
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#091416'; ctx.fillRect(0, 0, width, height);
    ctx.font = '10px ui-monospace, SFMono-Regular, Consolas, monospace';
    ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const path = pts => {
      ctx.beginPath();
      pts.forEach((p, i) => { const [x, y] = point(p); if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    };
    const geoPath = pts => path(pts.map(project).filter(Boolean));
    const text = (value, x, y, colour = '#a0b9b7', align = 'left') => { ctx.fillStyle = colour; ctx.textAlign = align; ctx.fillText(value, x, y); };
    const occupied = [{ left: cx - 14, right: cx + 14, top: cy - 13, bottom: cy + 15 }];
    const mapLabel = (value, x, y, colour, positions = [[7, -6], [7, 16], [-7, -6], [-7, 16], [14, -18], [-14, -18], [14, 29], [-14, 29]]) => {
      const tw = ctx.measureText(value).width;
      for (const [dx, dy] of positions) {
        const left = x + dx - (dx < 0 ? tw : 0), right = left + tw, top = y + dy - 9, bottom = y + dy + 2;
        if (left < 5 || right > width - 5 || top < chartTop + 4 || bottom > height - chartBottom - 4) continue;
        if (occupied.some(b => left < b.right + 3 && right > b.left - 3 && top < b.bottom + 2 && bottom > b.top - 2)) continue;
        text(value, left, y + dy, colour); occupied.push({ left, right, top, bottom }); return;
      }
    };
    const clipped = (value, max) => { let s = value; while (s.length > 1 && ctx.measureText(s).width > max) s = s.slice(0, -1); return s === value ? value : `${s.slice(0, -1)}…`; };
    ctx.save(); ctx.beginPath(); ctx.rect(0, chartTop, width, chartHeight); ctx.clip();
    if (estado.cenario === 'porto') {
      geoPath([{ xM: -100000, zM: 90000 }, ...PORTO.costa, { xM: -100000, zM: 220000 }]);
      ctx.closePath(); ctx.fillStyle = '#081c29'; ctx.fill();
      geoPath(PORTO.costa); ctx.strokeStyle = '#325458'; ctx.lineWidth = 1.2; ctx.stroke();
      geoPath(PORTO.rio); ctx.strokeStyle = '#284958'; ctx.lineWidth = Math.max(2, PORTO.larguraM / (rangeNm * NM_M) * radius); ctx.stroke();
      // City names are subdued context; waypoint/traffic labels are drawn later.
      for (const marco of MARCOS) { const p = project(marco); if (p?.dentro && p.distanciaM > rangeNm * NM_M * .35 && !d.rota.some(w => Math.hypot(w.x - p.x, w.y - p.y) * radius < 24)) { const [x, y] = point(p); text(marco.label, x, y, '#496062', 'center'); } }
    }
    for (const fraction of [.5, 1]) {
      ctx.beginPath(); ctx.arc(cx, cy, radius * fraction, 0, Math.PI * 2); ctx.strokeStyle = '#37504e'; ctx.lineWidth = 1; ctx.setLineDash([2, 4]); ctx.stroke(); ctx.setLineDash([]);
    }
    ctx.strokeStyle = '#1d3433'; path([{ x: -1, y: 0 }, { x: 1, y: 0 }]); ctx.stroke(); path([{ x: 0, y: -1 }, { x: 0, y: 1 }]); ctx.stroke();
    if (d.rota.length > 1) { path(d.rota); ctx.strokeStyle = '#585476'; ctx.setLineDash([3, 5]); ctx.stroke(); ctx.setLineDash([]); }
    if (d.destino) { path([{ x: 0, y: 0 }, d.destino]); ctx.strokeStyle = '#b393e6'; ctx.lineWidth = 1.5; ctx.stroke(); }
    for (const p of d.pistas) {
      path([p.inicio, p.fim]); ctx.lineWidth = 4; ctx.strokeStyle = '#a1ad9d'; ctx.stroke();
      path([p.inicio, p.fim]); ctx.lineWidth = 1; ctx.strokeStyle = '#0a161a'; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      if (p.centro.dentro) { const [x, y] = point(p.centro); text('RWY', x + 7, y - 3, '#a1ad9d'); }
    }
    for (const p of d.rota.filter(p => p.dentro)) {
      const [x, y] = point(p); ctx.strokeStyle = p.active ? '#d4b5ff' : '#737384'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.stroke();
      mapLabel(clipped(ROTULOS_MAPA[p.id] ?? p.label.toUpperCase(), 78), x, y, p.active ? '#d4b5ff' : '#737384', [[6, 13], [6, -6], [-6, 13], [-6, -6]]);
    }
    for (const a of d.ameacas.slice(0, 20)) {
      const [x, y] = point(a), colour = a.close ? '#ffb66b' : '#6dc2c5';
      ctx.strokeStyle = colour; ctx.lineWidth = 1;
      if (a.raio * radius > 4) { ctx.beginPath(); ctx.arc(x, y, a.raio * radius, 0, Math.PI * 2); ctx.stroke(); }
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.closePath(); ctx.stroke();
      // Relative altitude in hundreds of feet, matching standard traffic notation.
      if (a.distanciaM < rangeNm * NM_M * .84) {
        mapLabel(`${a.altitudeLabel} ${(a.separationM / NM_M).toFixed(1)}NM`, x, y, colour);
        if (a.close && width > 290) mapLabel(a.label, x, y, colour, [[7, 28], [-7, 28], [7, -18], [-7, -18]]);
      }
    }
    // Ground-track vector includes drift. Ownship stays aligned with aircraft heading.
    const rotacao = headingUp ? d.headingGraus : 0;
    const track = (d.trackGraus - rotacao) * Math.PI / 180;
    const ahead = Math.min(radius * .65, Math.max(14, d.groundSpeedKt / 3600 * 30 / rangeNm * radius));
    ctx.strokeStyle = '#e1be76'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(track) * ahead, cy - Math.cos(track) * ahead); ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate((d.headingGraus - rotacao) * Math.PI / 180);
    ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(3, -1); ctx.lineTo(11, 4); ctx.lineTo(11, 6); ctx.lineTo(2, 3); ctx.lineTo(2, 9); ctx.lineTo(5, 12); ctx.lineTo(-5, 12); ctx.lineTo(-2, 9); ctx.lineTo(-2, 3); ctx.lineTo(-11, 6); ctx.lineTo(-11, 4); ctx.lineTo(-3, -1); ctx.closePath();
    ctx.fillStyle = '#edf3e9'; ctx.strokeStyle = '#081416'; ctx.lineWidth = 2; ctx.stroke(); ctx.fill(); ctx.restore();
    // Only compass labels inside the rectangular viewport are shown. The north
    // pointer remains visible when the north point of the range ring is off-screen.
    for (let deg = 0; deg < 360; deg += 30) {
      const rad = (deg - (headingUp ? d.headingGraus : 0)) * Math.PI / 180;
      const x = Math.sin(rad), y = -Math.cos(rad);
      ctx.strokeStyle = '#62756c'; ctx.beginPath(); ctx.moveTo(cx + x * (radius - 4), cy + y * (radius - 4)); ctx.lineTo(cx + x * radius, cy + y * radius); ctx.stroke();
      const lx = cx + x * (radius + 10), ly = cy + y * (radius + 10) + 3;
      if (ly > chartTop + 10 && ly < height - chartBottom - 5 && lx > 7 && lx < width - 7) {
        text(({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' })[deg] ?? String(deg / 10).padStart(2, '0'), lx, ly, deg === 0 ? '#ead398' : '#798d83', 'center');
      }
    }
    text(`${rangeNm / 2} NM`, cx + radius * .5 - 5, cy + 12, '#829d8d', 'right');
    const north = -(headingUp ? d.headingGraus : 0) * Math.PI / 180;
    const nx = width - 25, ny = chartTop + 21;
    ctx.save(); ctx.translate(nx, ny); ctx.rotate(north);
    ctx.strokeStyle = '#cfbc8c'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, 8); ctx.lineTo(0, -8); ctx.moveTo(-3, -4); ctx.lineTo(0, -8); ctx.lineTo(3, -4); ctx.stroke(); ctx.restore();
    text('N', nx + Math.sin(north) * 15, ny - Math.cos(north) * 15 + 3, '#cfbc8c', 'center');
    ctx.restore();
    // DOM already owns orientation/range, destination distance and ground speed.
    ctx.fillStyle = '#091416'; ctx.fillRect(0, 0, width, chartTop); ctx.fillRect(0, height - chartBottom, width, chartBottom);
    text(`TRK ${rumoTexto(d.trackGraus)}°`, 8, 12, '#c9d5c7');
    text(`WIND ${rumoTexto(d.windFromGraus)}°/${Math.round(d.windSpeedKt)}KT`, width - 8, 12, '#8aa6a3', 'right');
    text('SCHEMATIC · ALT ×100FT', 8, height - 5, '#72847b');
    const dest = d.destino;
    text(`ETE ${tempoTexto(dest?.etaS)}`, width - 8, height - 5, '#c9d5c7', 'right');
    canvas.setAttribute('aria-label', `Navigation, ${headingUp ? 'heading up' : 'north up'}, ${rangeNm} nautical mile range. Ground speed ${Math.round(d.groundSpeedKt)} knots, track ${rumoTexto(d.trackGraus)} degrees.${dest ? ` ${dest.label}, ${dest.distanceNm.toFixed(1)} nautical miles, bearing ${rumoTexto(dest.bearingGraus)} degrees.` : ''} ${d.ameacas.length} nearby hazards.`);
  }
  return {
    actualizar(m) { if (!disposed) { estado = m; desenhar(); } },
    resize() { desenhar(); },
    setRange(nm) { rangeNm = alcance(Number(nm)); desenhar(); return rangeNm; },
    setHeadingUp(value) { headingUp = Boolean(value); desenhar(); },
    dispose() { disposed = true; estado = null; ctx = null; },
  };
}
