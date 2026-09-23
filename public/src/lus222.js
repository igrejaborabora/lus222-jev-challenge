import * as THREE from 'three';
import {
  aneisFuselagem,
  anelSuperelipse,
  loft,
  perfilNaca,
  seccaoEm,
  vDoTopo,
  vEmY,
} from './lus222-forma.js';

const BRANCO = '#ebeef1';
const MARINHO = '#152033';
const VERMELHO = '#c8423a';

function geometria({ posicoes, normais, uvs, indices }) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posicoes, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(normais, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

function malhaLoft(aneis, material, opcoes) {
  return new THREE.Mesh(geometria(loft(aneis, opcoes)), material);
}

/** Loft de secções superelipse ao longo de z, centrado em (cx, 0). */
function corpoSuperelipse(estacoes, material, { cx = 0, nAneis = 16, nPontos = 24 } = {}) {
  const zs = estacoes.map((e) => e.z);
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  const aneis = [];
  for (let i = 0; i < nAneis; i++) {
    const z = zMin + ((zMax - zMin) * i) / (nAneis - 1);
    const { pontos } = anelSuperelipse(seccaoEm(z, estacoes), nPontos, 120);
    aneis.push(pontos.map(([x, y]) => [cx + x, y, z]));
  }
  return malhaLoft(aneis, material, { tampaInicio: true, tampaFim: true });
}

/**
 * Superfície sustentadora: perfis NACA ao longo de um eixo. Cada estação dá
 * posição no eixo `s`, bordo de ataque, corda e escala de espessura.
 * `plano` diz como (s, corda, espessura) viram coordenadas 3D.
 */
function superficie(estacoes, perfil, material, plano, { tampaInicio = false, tampaFim = false } = {}) {
  const aneis = estacoes.map((e) => perfil.map(([c, t]) => plano(e, c, t)));
  return malhaLoft(aneis, material, { tampaInicio, tampaFim });
}

function textoCanvas(texto, { w = 512, h = 128, fill = '#f4f6f8', size = 72 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = fill;
  ctx.font = `600 ${size}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function placa(texto, w, h, opts) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: textoCanvas(texto, opts),
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    }),
  );
}

/**
 * Pintura da fuselagem numa CanvasTexture. U segue z (cauda → nariz), V
 * segue o arco a partir do ventre (lado direito em V < 0,5). Visto de fora,
 * o lado esquerdo lê o canvas direito; o direito lê-o rodado 180°.
 */
function pinturaFuselagem(zMin, zMax, leve) {
  const W = leve ? 1024 : 2048;
  const H = leve ? 512 : 1024;
  const cor = document.createElement('canvas');
  cor.width = W;
  cor.height = H;
  const ctx = cor.getContext('2d');
  const rug = leve ? null : document.createElement('canvas');
  const rctx = rug?.getContext('2d');
  if (rug) {
    rug.width = W / 4;
    rug.height = H / 4;
    rctx.fillStyle = 'rgb(122,122,122)';
    rctx.fillRect(0, 0, rug.width, rug.height);
    rctx.scale(0.25, 0.25);
  }

  const cache = new Map();
  const anelEm = (z) => {
    const k = Math.round(z * 100);
    if (!cache.has(k)) cache.set(k, anelSuperelipse(seccaoEm(k / 100), 160));
    return cache.get(k);
  };
  const px = (z) => ((z - zMin) / (zMax - zMin)) * W;
  const py = (v) => v * H;
  const lado = (z, y, s) => [px(z), py(vEmY(anelEm(z), y, s))];
  const topo = (z, d) => [px(z), py(vDoTopo(anelEm(z), d))];
  const poligono = (pts, fill, vidro = false) => {
    for (const [c, f] of [[ctx, fill], ...(vidro && rctx ? [[rctx, 'rgb(28,28,28)']] : [])]) {
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.closePath();
      c.fillStyle = f;
      c.fill();
    }
  };

  ctx.fillStyle = BRANCO;
  ctx.fillRect(0, 0, W, H);

  // Ventre e cone de cauda marinho: fronteira diagonal do fim dos sponsons à deriva.
  const zIni = -2.85;
  const yFronteira = (z) => -0.98 + ((zIni - z) / (zIni + 5.3)) * 2.13;
  for (const s of [1, -1]) {
    const borda = [];
    for (let z = zIni; z >= zMin - 0.01; z -= 0.05) {
      borda.push([px(z), py(vEmY(anelEm(z), yFronteira(z), s))]);
    }
    const base = s > 0 ? 0 : H;
    poligono([[px(zIni), base], ...borda, [0, borda[borda.length - 1][1]], [0, base]], MARINHO);
  }

  // Rampa de carga: contorno no ventre marinho.
  ctx.strokeStyle = '#2d3b57';
  ctx.lineWidth = W / 700;
  for (const [a, b] of [[0, 1], [H, -1]]) {
    const meia = (z) => (0.5 / anelEm(z).perimetro) * H;
    ctx.beginPath();
    ctx.moveTo(px(-3.45), a);
    ctx.lineTo(px(-3.45), a + b * meia(-3.45));
    ctx.lineTo(px(-5.6), a + b * meia(-5.6) * 0.8);
    ctx.lineTo(px(-5.6), a);
    ctx.stroke();
  }

  // Para-brisas em dois painéis com pilar central, e janelas laterais da cabine.
  const vidro = '#121a22';
  for (const s of [1, -1]) {
    poligono([topo(3.98, s * 0.06), topo(3.98, s * 0.6), topo(4.46, s * 0.5), topo(4.46, s * 0.05)], vidro, true);
    poligono([lado(3.84, 0.5, s), lado(3.36, 0.56, s), lado(3.38, 0.82, s), lado(3.82, 0.74, s)], vidro, true);
    poligono([lado(4.28, 0.3, s), lado(3.92, 0.44, s), lado(3.93, 0.68, s), lado(4.18, 0.54, s)], vidro, true);

    // Vigias da cabine: seis por lado, de cantos arredondados.
    for (let i = 0; i < 6; i++) {
      const z = 1.25 - i * 0.66;
      const [x0, ya] = lado(z + 0.12, 0.05, s);
      const [x1, yb] = lado(z - 0.12, 0.39, s);
      const x = Math.min(x0, x1);
      const y = Math.min(ya, yb);
      const w = Math.abs(x1 - x0);
      const h = Math.abs(yb - ya);
      for (const [c, f] of [[ctx, vidro], ...(rctx ? [[rctx, 'rgb(28,28,28)']] : [])]) {
        c.beginPath();
        c.roundRect(x, y, w, h, Math.min(w, h) * 0.42);
        c.fillStyle = f;
        c.fill();
      }
    }

    // Porta dianteira: só o contorno.
    const porta = [lado(2.28, -0.72, s), lado(1.74, -0.72, s), lado(1.74, 0.78, s), lado(2.28, 0.78, s)];
    ctx.strokeStyle = '#c9ced4';
    ctx.lineWidth = W / 900;
    ctx.beginPath();
    porta.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.stroke();

    texto(s, [['EEA', MARINHO], ['+', VERMELHO], ['AIRCRAFT', MARINHO]], 3.4, 2.38, -0.04, 0.2);
    texto(s, [['CS-001', MARINHO]], -1.32, -2.0, -0.08, 0.13);
  }

  function texto(s, partes, zA, zB, y, altura) {
    const zc = (zA + zB) / 2;
    const anel = anelEm(zc);
    const cx = px(zc);
    const cy = py(vEmY(anel, y, s));
    const largura = Math.abs(px(zA) - px(zB));
    const alt = (altura / anel.perimetro) * H;
    ctx.save();
    ctx.translate(cx, cy);
    if (s > 0) ctx.rotate(Math.PI);
    ctx.font = `700 ${alt * 1.25}px "IBM Plex Sans", system-ui, sans-serif`;
    ctx.textBaseline = 'middle';
    const total = partes.reduce((acc, [t]) => acc + ctx.measureText(t).width, 0);
    ctx.scale(largura / total, 1);
    let x = -total / 2;
    for (const [t, f] of partes) {
      ctx.fillStyle = f;
      ctx.fillText(t, x, 0);
      x += ctx.measureText(t).width;
    }
    ctx.restore();
  }

  const map = new THREE.CanvasTexture(cor);
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = false;
  map.anisotropy = leve ? 1 : 4;
  let roughnessMap = null;
  if (rug) {
    roughnessMap = new THREE.CanvasTexture(rug);
    roughnessMap.flipY = false;
  }
  return { map, roughnessMap };
}

function materiais(leve) {
  const std = (color, roughness, extras = {}) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.04, ...extras });
  return {
    branco: std(0xebeef1, 0.48),
    marinho: std(0x152033, 0.82, { envMapIntensity: 0.22 }),
    escuro: std(0x1c1f24, 0.55),
    metal: std(0xb9bec4, 0.35, { metalness: 0.5 }),
    pneu: std(0x141414, 0.9),
    pa: std(0x1b1e22, 0.5, { transparent: true }),
    leve,
  };
}

const ESTACOES_NACELE = [
  { z: 2.36, w: 0.17, yc: 0.84, hTop: 0.17, hBot: 0.17, nTop: 2, nBot: 2 },
  { z: 2.22, w: 0.33, yc: 0.84, hTop: 0.34, hBot: 0.34, nTop: 2.2, nBot: 2.2 },
  { z: 1.7, w: 0.43, yc: 0.86, hTop: 0.44, hBot: 0.48, nTop: 2.4, nBot: 2.4 },
  { z: 0.7, w: 0.44, yc: 0.88, hTop: 0.44, hBot: 0.5, nTop: 2.5, nBot: 2.5 },
  { z: -0.5, w: 0.38, yc: 0.92, hTop: 0.38, hBot: 0.4, nTop: 2.4, nBot: 2.4 },
  { z: -1.45, w: 0.22, yc: 1.02, hTop: 0.22, hBot: 0.2, nTop: 2.2, nBot: 2.2 },
  { z: -2.0, w: 0.06, yc: 1.1, hTop: 0.05, hBot: 0.05, nTop: 2, nBot: 2 },
];

const ESTACOES_SPONSON = [
  { z: 0.55, w: 0.08, yc: -0.62, hTop: 0.1, hBot: 0.1, nTop: 2, nBot: 2 },
  { z: 0.2, w: 0.3, yc: -0.62, hTop: 0.28, hBot: 0.3, nTop: 2.4, nBot: 3 },
  { z: -0.6, w: 0.4, yc: -0.6, hTop: 0.34, hBot: 0.38, nTop: 2.6, nBot: 3.4 },
  { z: -1.5, w: 0.38, yc: -0.58, hTop: 0.32, hBot: 0.36, nTop: 2.6, nBot: 3.4 },
  { z: -2.3, w: 0.16, yc: -0.5, hTop: 0.18, hBot: 0.2, nTop: 2.2, nBot: 2.4 },
  { z: -2.65, w: 0.04, yc: -0.46, hTop: 0.04, hBot: 0.04, nTop: 2, nBot: 2 },
];

const ESTACOES_CARENAGEM = [
  { z: 2.05, w: 0.1, yc: 0.95, hTop: 0.12, hBot: 0.1, nTop: 2, nBot: 2 },
  { z: 1.55, w: 0.72, yc: 0.98, hTop: 0.3, hBot: 0.12, nTop: 2.6, nBot: 3 },
  { z: -1.0, w: 0.8, yc: 0.98, hTop: 0.3, hBot: 0.12, nTop: 2.6, nBot: 3 },
  { z: -1.75, w: 0.46, yc: 0.98, hTop: 0.2, hBot: 0.1, nTop: 2.4, nBot: 3 },
  { z: -2.2, w: 0.06, yc: 0.98, hTop: 0.05, hBot: 0.05, nTop: 2, nBot: 2 },
];

function helice(m, geoPa) {
  const prop = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const pa = new THREE.Mesh(geoPa, m.pa);
    pa.rotation.z = (i * Math.PI) / 2 + Math.PI / 4;
    prop.add(pa);
  }
  const disco = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 1.05, 40),
    new THREE.MeshBasicMaterial({ color: 0x8a939c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
  );
  disco.renderOrder = 2;
  prop.add(disco);
  prop.userData.disco = disco;
  return prop;
}

/** Pá com torção: corda e passo variam com o raio. */
function geometriaPa() {
  const perfil = perfilNaca({ m: 0, t: 0.1, n: 12 });
  const raios = [0.16, 0.3, 0.5, 0.75, 0.95, 1.05];
  const corda = (r) => 0.13 + 0.14 * Math.sin(Math.PI * Math.min(1, r / 1.1)) * (1 - r * 0.45);
  const passo = (r) => THREE.MathUtils.degToRad(56 - 38 * ((r - 0.16) / 0.89));
  const aneis = raios.map((r) => {
    const c = r === 1.05 ? corda(r) * 0.55 : corda(r);
    const b = passo(r);
    return perfil.map(([f, t]) => {
      const x = (f - 0.3) * c;
      const zt = t * c;
      return [x * Math.cos(b) - zt * Math.sin(b), r, x * Math.sin(b) + zt * Math.cos(b)];
    });
  });
  return geometria(loft(aneis, { tampaFim: true }));
}

/**
 * LUS-222 branco CS-001, nariz em +Z. Fuselagem em loft de secções
 * superelipse, sponsons, asa alta com perfil NACA e pontas marinhas, dois
 * turbo-hélices de quatro pás com disco de desfoque, cauda em T marinha e
 * trem triciclo fixo. Só decalques tipográficos.
 */
export function criarLus222({ leve = false } = {}) {
  const g = new THREE.Group();
  g.name = 'LUS-222';
  const m = materiais(leve);

  const fus = aneisFuselagem({ nAneis: leve ? 36 : 56, nPontos: leve ? 32 : 48 });
  const pintura = pinturaFuselagem(fus.zMin, fus.zMax, leve);
  const pele = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: pintura.map,
    roughness: 1,
    roughnessMap: pintura.roughnessMap,
    metalness: 0.04,
  });
  if (!pintura.roughnessMap) pele.roughness = 0.48;
  const fuselagem = malhaLoft(fus.aneis, pele, { us: fus.us, tampaInicio: true, tampaFim: true });
  fuselagem.name = 'fuselagem';
  g.add(fuselagem);

  g.add(corpoSuperelipse(ESTACOES_CARENAGEM, m.branco, { nAneis: 10 }));
  for (const s of [-1, 1]) g.add(corpoSuperelipse(ESTACOES_SPONSON, m.branco, { cx: s * 1.0, nAneis: 12 }));

  // Asa alta recta com afinamento; pontas marinhas a partir de 63 % da semi-envergadura.
  const perfilAsa = perfilNaca({ m: 0.02, p: 0.4, t: 0.15, n: leve ? 18 : 28 });
  const asa = (x) => {
    const f = Math.min(1, Math.abs(x) / 7.9);
    return { s: x, le: 1.5 - 0.65 * f, corda: 2.7 - 1.35 * f, esp: 1 - 0.25 * f };
  };
  const planoAsa = (e, c, t) => [e.s, 1.22 + t * e.corda * e.esp, e.le - c * e.corda];
  g.add(superficie([asa(-5), asa(5)], perfilAsa, m.branco, planoAsa));
  for (const s of [-1, 1]) {
    const ponta = { ...asa(s * 7.9), corda: asa(7.9).corda * 0.82, le: asa(7.9).le - 0.08, esp: 0.45 };
    g.add(superficie([asa(s * 5), asa(s * 7.62), ponta], perfilAsa, m.marinho, planoAsa, { tampaFim: true }));
  }

  // Naceles centradas na asa, perto da fuselagem, como na vista frontal.
  const props = [];
  const geoPa = geometriaPa();
  for (const s of [-1, 1]) {
    const x = s * 2.45;
    g.add(corpoSuperelipse(ESTACOES_NACELE, m.branco, { cx: x, nAneis: 14 }));
    const spinner = new THREE.Mesh(
      new THREE.LatheGeometry([[0.2, 0], [0.2, 0.08], [0.15, 0.24], [0.07, 0.36], [0, 0.4]].map(([r, y]) => new THREE.Vector2(r, y)), 16),
      m.branco,
    );
    spinner.rotation.x = Math.PI / 2;
    spinner.position.set(x, 0.84, 2.34);
    g.add(spinner);
    const prop = helice(m, geoPa);
    prop.position.set(x, 0.84, 2.5);
    g.add(prop);
    props.push(prop);
  }

  // Deriva marinha enflechada com filete dorsal; estabilizador no topo (T).
  const perfilCauda = perfilNaca({ m: 0, t: 0.11, n: leve ? 16 : 22 });
  const planoDeriva = (e, c, t) => [t * e.corda, e.s, e.le - c * e.corda];
  g.add(superficie([
    { s: 0.9, le: -3.55, corda: 2.85 },
    { s: 1.35, le: -4.3, corda: 2.1 },
    { s: 3.3, le: -5.5, corda: 1.3 },
    { s: 3.42, le: -5.58, corda: 1.12 },
  ], perfilCauda, m.marinho, planoDeriva, { tampaFim: true }));
  const planoEstab = (e, c, t) => [e.s, 3.4 + t * e.corda, e.le - c * e.corda];
  const estab = (x) => {
    const f = Math.min(1, Math.abs(x) / 2.9);
    return { s: x, le: -5.18 - 0.42 * f, corda: 1.32 - 0.55 * f };
  };
  for (const s of [-1, 1]) {
    const ponta = { ...estab(s * 2.9), corda: estab(2.9).corda * 0.8, le: estab(2.9).le - 0.05 };
    g.add(superficie([estab(0), estab(s * 2.75), ponta], perfilCauda, m.marinho, planoEstab, { tampaFim: true }));
  }

  const lus = placa('LUS+222', 1.5, 0.34, { fill: '#f4f6f8', size: 76, w: 560, h: 128 });
  for (const s of [-1, 1]) {
    const suporte = new THREE.Group();
    suporte.position.set(s * 0.125, 2.05, -5.25);
    suporte.rotation.y = (s * Math.PI) / 2;
    const p = s > 0 ? lus : lus.clone();
    p.rotation.z = s > 0 ? 1.08 : -1.08;
    suporte.add(p);
    g.add(suporte);
  }

  // Trem fixo: roda de nariz e rodas principais meio embutidas nos sponsons.
  const trem = (x, y, z, raio, largura, perna) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, perna, 8), m.metal);
    strut.position.set(x, y + perna / 2, z);
    const roda = new THREE.Mesh(new THREE.CylinderGeometry(raio, raio, largura, 18), m.pneu);
    roda.rotation.z = Math.PI / 2;
    roda.position.set(x, y, z);
    const cubo = new THREE.Mesh(new THREE.CylinderGeometry(raio * 0.42, raio * 0.42, largura + 0.02, 14), m.metal);
    cubo.rotation.z = Math.PI / 2;
    cubo.position.copy(roda.position);
    g.add(strut, roda, cubo);
  };
  trem(0, -1.42, 3.85, 0.24, 0.14, 0.72);
  for (const s of [-1, 1]) trem(s * 1.4, -1.06, -0.72, 0.36, 0.2, 0.4);

  const antena = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.02, 0.5, 5), m.escuro);
  antena.position.set(0, 1.3, 2.35);
  antena.rotation.x = -0.35;
  g.add(antena);

  g.userData.props = props;
  g.userData.heliceAnterior = null;
  g.scale.setScalar(1.35);
  return g;
}

/**
 * Roda as hélices e, a rotação alta, troca as pás sólidas por pás
 * translúcidas e um disco de desfoque, para não parecerem paradas.
 */
export function actualizarHelices(aviao, angulo, agoraMs = performance.now()) {
  const props = aviao?.userData?.props ?? [];
  const ant = aviao.userData.heliceAnterior;
  let rapido = aviao.userData.heliceRapida ?? 0;
  if (ant && agoraMs > ant.t) {
    const w = Math.abs(angulo - ant.a) / ((agoraMs - ant.t) / 1000);
    const alvo = w > 6 ? 1 : 0;
    rapido += (alvo - rapido) * Math.min(1, (agoraMs - ant.t) / 250);
  }
  aviao.userData.heliceAnterior = { a: angulo, t: agoraMs };
  aviao.userData.heliceRapida = rapido;
  for (const p of props) {
    p.rotation.z = angulo;
    const disco = p.userData.disco;
    if (disco) disco.material.opacity = 0.2 * rapido;
    const pa = p.children[0];
    if (pa?.material) pa.material.opacity = 1 - 0.62 * rapido;
  }
}
