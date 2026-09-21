import {
  etiquetarAcao,
  etiquetarDestino,
  etiquetarManobraL,
  etiquetarManobraV,
  etiquetarRiscoMeteo,
  etiquetarUrgencia,
  maxProbabilidade,
} from './decisao.js';

const $ = (id) => document.getElementById(id);

export function barras(el, probabilities = {}, escolhida) {
  el.replaceChildren();
  const entradas = Object.entries(probabilities);
  if (!entradas.length) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  for (const [nome, p] of entradas) {
    const row = document.createElement('div');
    row.className = 'bar-row' + (nome === escolhida ? ' is-on' : '');
    const lab = document.createElement('span');
    lab.className = 'bar-name';
    lab.textContent = etiquetarAcao(nome);
    const track = document.createElement('span');
    track.className = 'bar-track';
    const fill = document.createElement('span');
    fill.className = 'bar-fill';
    fill.style.width = `${Math.round(Number(p) * 100)}%`;
    track.append(fill);
    const val = document.createElement('span');
    val.className = 'bar-val';
    val.textContent = Number(p).toFixed(2);
    row.append(lab, track, val);
    el.append(row);
  }
}

export function actualizarRail({ answers, latencia_ms, fonte, incidente }) {
  $('rail-fonte').textContent = fonte === 'jev' ? 'JEV' : 'BLOQUEIO';
  $('rail-fonte').className = 'chip-fonte' + (fonte === 'jev' ? ' is-jev' : ' is-block');
  $('rail-lat').textContent = Number.isFinite(latencia_ms) ? `${latencia_ms} ms` : '—';
  $('rail-incidente').textContent = incidente?.resumo ?? '—';

  const acao = answers?.acaoMissao?.choice ?? '—';
  $('rail-acao').textContent = etiquetarAcao(acao);
  barras($('rail-barras'), answers?.acaoMissao?.probabilities ?? {}, acao);
  const vertical = answers?.manobraVertical?.choice;
  const lateral = answers?.manobraLateral?.choice;
  if ($('rail-vertical')) $('rail-vertical').textContent = etiquetarManobraV(vertical);
  if ($('rail-lateral')) $('rail-lateral').textContent = etiquetarManobraL(lateral);
  if ($('hud-evasao')) {
    $('hud-evasao').textContent =
      vertical || lateral ? `${etiquetarManobraV(vertical)} · ${etiquetarManobraL(lateral)}` : '—';
  }
  $('rail-destino').textContent = etiquetarDestino(answers?.destinoPreferido?.choice);
  $('rail-urgencia').textContent = etiquetarUrgencia(answers?.urgencia?.score);
  $('rail-meteo').textContent = etiquetarRiscoMeteo(answers?.riscoMeteorologico?.score);
  const pic = answers?.precisaRevisaoPIC?.probability;
  $('rail-pic').textContent = Number.isFinite(pic) ? Number(pic).toFixed(2) : '—';
  const maxP = maxProbabilidade(answers?.acaoMissao);
  $('rail-maxp').textContent = maxP ? maxP.toFixed(2) : '—';
}

export function actualizarHud(estado, { fase, fonte, proximo }) {
  $('hud-fase').textContent = fase;
  $('hud-destino').textContent = estado.missao.destino;
  $('hud-fuel').textContent = `${estado.aeronave.fuel_kg} kg`;
  $('hud-payload').textContent = `${estado.aeronave.payload_kg} kg`;
  $('hud-almas').textContent = String(estado.missao.almas);
  $('hud-meteo').textContent = `${estado.ambiente.tecto_ft} ft · ${estado.ambiente.vento_kt} kt`;
  $('hud-relogio').textContent = estado.missao.relogio_s
    ? `${Math.floor(estado.missao.relogio_s / 60)}:${String(estado.missao.relogio_s % 60).padStart(2, '0')}`
    : '—';
  $('hud-proximo').textContent = proximo ?? '—';
  $('hud-fonte').textContent = fonte === 'jev' ? 'JEV' : fonte === 'bloqueio' ? 'BLOQUEIO' : '…';
  $('hud-fonte').className = 'hud-fonte' + (fonte === 'jev' ? ' is-jev' : fonte === 'bloqueio' ? ' is-block' : '');
}

export function pintarDebrief(resumo) {
  $('debrief-title').textContent = resumo.incompleta ? 'Missão incompleta' : 'Debriefing';
  $('verdict').replaceChildren();
  const p = document.createElement('p');
  p.textContent = resumo.veredicto;
  if (resumo.incompleta) p.className = 'aviso';
  $('verdict').append(p);

  const m = resumo.metricas;
  $('kpi-teses').textContent = resumo.incompleta ? '—' : `${m.teses_acertadas_pct} %`;
  $('kpi-escala').textContent = resumo.incompleta ? '—' : `${m.escalacoes_correctas_pct} %`;
  $('kpi-lat').textContent = m.latencia_mediana_ms == null ? '—' : `${m.latencia_mediana_ms} ms`;
  $('kpi-fonte').textContent = resumo.fonte;

  const lista = $('debrief-lista');
  lista.replaceChildren();
  if (resumo.incompleta) {
    const box = document.createElement('div');
    box.className = 'debrief-block';
    const h = document.createElement('h3');
    h.textContent = 'Comparação recusada';
    const t = document.createElement('p');
    t.textContent =
      'O Gateway falhou. Não há coluna JEV para confrontar com a regra. A reserva geométrica não entra neste quadro.';
    box.append(h, t);
    lista.append(box);
    return;
  }

  for (const inc of resumo.incidentes) {
    lista.append(cartaoIncidente(inc));
  }
}

function cartaoIncidente(inc) {
  const art = document.createElement('article');
  art.className = 'debrief-inc' + (inc.tese_ok ? ' is-ok' : '');
  const head = document.createElement('header');
  const h = document.createElement('h3');
  h.textContent = inc.resumo;
  const meta = document.createElement('p');
  meta.className = 'inc-meta';
  meta.textContent =
    (inc.tese_ok ? 'Tese cumprida' : 'Tese em falta') +
    (inc.escalou ? ' · escalou ao PIC' : ' · automatizado') +
    (inc.pic?.sobreposto ? ' · comandante sobrepôs' : '');
  head.append(h, meta);

  const cols = document.createElement('div');
  cols.className = 'debrief-cols';
  cols.append(
    coluna('JEV', inc.jev?.answers, inc.jev?.latencia_ms),
    coluna('Regra geométrica', inc.baseline?.answers, 0),
  );

  const st = document.createElement('p');
  st.className = 'inc-estado';
  const r = inc.estado_resumo ?? {};
  st.textContent = `Fuel ${r.fuel_kg} kg · payload ${r.payload_kg} kg · integridade ${r.integridade} % · tecto ${r.tecto_ft} ft · obstáculo em rota: ${r.obstaculo_em_rota ? 'sim' : 'não'}`;

  art.append(head, cols, st);
  return art;
}

function coluna(titulo, answers, lat) {
  const d = document.createElement('div');
  d.className = 'debrief-col';
  const h = document.createElement('h4');
  h.textContent = titulo;
  const ul = document.createElement('ul');
  const linhas = [
    ['Acção', etiquetarAcao(answers?.acaoMissao?.choice)],
    ['Vertical', etiquetarManobraV(answers?.manobraVertical?.choice)],
    ['Lateral', etiquetarManobraL(answers?.manobraLateral?.choice)],
    ['Destino', etiquetarDestino(answers?.destinoPreferido?.choice)],
    ['Urgência', etiquetarUrgencia(answers?.urgencia?.score)],
    ['Meteo', etiquetarRiscoMeteo(answers?.riscoMeteorologico?.score)],
    ['PIC P(true)', Number.isFinite(answers?.precisaRevisaoPIC?.probability) ? answers.precisaRevisaoPIC.probability.toFixed(2) : '—'],
  ];
  if (titulo === 'JEV' && Number.isFinite(lat)) linhas.push(['Latência', `${lat} ms`]);
  for (const [k, v] of linhas) {
    const li = document.createElement('li');
    const dt = document.createElement('span');
    dt.textContent = k;
    const dd = document.createElement('strong');
    dd.textContent = v;
    li.append(dt, dd);
    ul.append(li);
  }
  d.append(h, ul);
  return d;
}

export function mostrarChipJev(_maxP, _pediriaPic, evasao, { latencia_ms = null } = {}) {
  const chip = $('jev-chip');
  if (!chip) return;
  const manobra = $('selo-manobra');
  const ms = $('selo-ms');
  const vertical = etiquetarManobraV(evasao?.vertical);
  const lateral = etiquetarManobraL(evasao?.lateral);
  if (manobra) manobra.textContent = `${vertical} · ${lateral}`;
  if (ms) ms.textContent = Number.isFinite(latencia_ms) ? `${Math.round(latencia_ms)} ms` : '— ms';
  chip.hidden = false;
}

export function esconderChipJev() {
  const chip = $('jev-chip');
  if (chip) chip.hidden = true;
  const ov = $('pic-override');
  if (ov) ov.hidden = true;
}
