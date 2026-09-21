import { LISTA_CENARIOS, cenarioPorId } from './cenarios.js';
import { estadoInicial, gerarFita, lerRestricoes } from './fita.js';
import { estadoAteIndice, planoDoBeat, podeVoltar } from './fita-correr.js';
import { decisaoGeometrica, deveEscalarPIC, evasaoDeAnswers, maxProbabilidade } from './decisao.js';
import { registarIncidente, resumirMissao } from './debrief.js';
import { aplicarAcao, aplicarEvasao, novoAutomato, passoAutomato, poseAviao } from './automato.js';
import {
  actualizarAmeacas,
  actualizarCamara,
  actualizarFluxo,
  aplicarPose,
  criarCena,
  mostrarAmeacas,
  perfilGraficoLeve,
  redimensionar,
  webglDisponivel,
} from './world.js';
import {
  actualizarHud,
  actualizarRail,
  esconderChipJev,
  pintarDebrief,
  mostrarChipJev,
} from './ui.js';

const $ = (id) => document.getElementById(id);
const TIMEOUT_JEV_MS = 4000;

const estado = {
  ecra: 'splash',
  gateway: null,
  cenario: 'medevac',
  fita: null,
  missao: null,
  aviao: null,
  mundo: null,
  pausado: false,
  corrida: 0,
  indice: -1,
  abortJev: null,
  raf: 0,
  ultimo: 0,
  log: null,
};

function mostrar(nome) {
  for (const s of document.querySelectorAll('.screen')) s.classList.remove('is-active');
  $(`screen-${nome}`).classList.add('is-active');
  estado.ecra = nome;
  document.documentElement.classList.toggle('flight-active', nome === 'live');
  if (nome === 'live') ajustarCanvas();
}

function medidasCanvas() {
  const canvas = $('canvas');
  const r = canvas.getBoundingClientRect();
  return {
    largura: Math.round(r.width || window.innerWidth),
    altura: Math.round(r.height || window.innerHeight),
  };
}

function ajustarCanvas() {
  if (!estado.mundo) return;
  const { largura, altura } = medidasCanvas();
  if (largura < 2 || altura < 2) return;
  if (estado.mundo.mundoLargura === largura && estado.mundo.mundoAltura === altura) return;
  redimensionar(estado.mundo, largura, altura);
}

addEventListener('resize', ajustarCanvas);
addEventListener('orientationchange', () => setTimeout(ajustarCanvas, 120));
if (window.visualViewport) visualViewport.addEventListener('resize', ajustarCanvas);

async function sondarGateway() {
  const dot = $('dot-gateway');
  const txt = $('txt-gateway');
  const btn = $('btn-entrar');
  const btnMissao = $('btn-missao');
  try {
    const res = await fetch('/api/jev', { cache: 'no-store' });
    const data = await res.json();
    estado.gateway = data;
    if (data.gateway_configurado) {
      dot.className = 'dot ok';
      txt.textContent = `AI Gateway ligado · ${data.modelo}`;
      btn.disabled = false;
      btnMissao.disabled = false;
      $('gateway-block').hidden = true;
      return true;
    }
  } catch {
    estado.gateway = { gateway_configurado: false };
  }
  dot.className = 'dot warn';
  txt.textContent = 'AI Gateway em baixo — a missão JEV não arranca';
  btn.disabled = true;
  btnMissao.disabled = true;
  $('gateway-block').hidden = false;
  return false;
}

const NS = 'http://www.w3.org/2000/svg';

const MINIATURAS = {
  medevac: `<rect width="320" height="148" fill="#243646"/>
    <polygon points="160,148 132,148 118,72 202,72 188,148" fill="#2a3138"/>
    <g fill="#3c4652"><rect x="6" y="8" width="42" height="140"/><rect x="52" y="28" width="30" height="120"/><rect x="86" y="46" width="24" height="102"/></g>
    <g fill="#2c3542"><rect x="214" y="40" width="26" height="108"/><rect x="246" y="18" width="32" height="130"/><rect x="282" y="4" width="34" height="144"/></g>
    <g fill="#e4c48a"><rect x="16" y="22" width="6" height="8"/><rect x="28" y="40" width="6" height="8"/><rect x="62" y="48" width="5" height="7"/><rect x="258" y="36" width="6" height="8"/><rect x="292" y="24" width="6" height="8"/><rect x="224" y="62" width="5" height="7"/></g>
    <rect y="116" width="320" height="32" fill="#070b12" fill-opacity="0.72"/>
    <text x="14" y="138" fill="#f4f1ea" font-size="15" font-family="IBM Plex Sans, sans-serif" font-weight="600" letter-spacing="1.5">CANYON DE TORRES</text>`,
  carga: `<rect width="320" height="96" fill="#8ec8ef"/>
    <rect y="96" width="320" height="52" fill="#6a7544"/>
    <rect x="146" y="96" width="28" height="52" fill="#3a3e42"/>
    <g fill="#e6e2d6"><rect x="156" y="104" width="8" height="10"/><rect x="156" y="122" width="8" height="10"/><rect x="156" y="140" width="8" height="8"/></g>
    <rect x="18" y="108" width="46" height="22" fill="#8a7358"/><rect x="250" y="112" width="50" height="20" fill="#8a7358"/>
    <g fill="none" stroke="#14171b" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
      <path d="M48 34 l10 -8 l10 8"/><path d="M78 48 l10 -8 l10 8"/><path d="M108 30 l10 -8 l10 8"/>
      <path d="M150 42 l11 -9 l11 9"/><path d="M188 28 l10 -8 l10 8"/><path d="M214 50 l10 -8 l10 8"/>
      <path d="M246 36 l10 -8 l10 8"/><path d="M36 62 l9 -7 l9 7"/><path d="M96 66 l9 -7 l9 7"/>
      <path d="M168 64 l9 -7 l9 7"/><path d="M230 70 l9 -7 l9 7"/>
    </g>
    <rect y="116" width="320" height="32" fill="#070b12" fill-opacity="0.72"/>
    <text x="14" y="138" fill="#f4f1ea" font-size="15" font-family="IBM Plex Sans, sans-serif" font-weight="600" letter-spacing="1.5">BANDO NA FAL</text>`,
  sar: `<defs><linearGradient id="sar-ceu" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#243044"/><stop offset="0.62" stop-color="#c46a3a"/><stop offset="1" stop-color="#1c3348"/></linearGradient></defs>
    <rect width="320" height="148" fill="url(#sar-ceu)"/>
    <rect y="112" width="320" height="36" fill="#163044"/>
    <g fill="#5c6840"><ellipse cx="92" cy="58" rx="40" ry="8"/><polygon points="70,56 18,74 18,48"/><polygon points="118,56 168,66 168,50"/><rect x="58" y="36" width="4" height="18"/><rect x="74" y="36" width="4" height="18"/><rect x="52" y="34" width="28" height="4"/></g>
    <g fill="#c2b48a"><ellipse cx="230" cy="78" rx="34" ry="7"/><polygon points="214,76 168,90 168,68"/><polygon points="250,76 292,84 292,70"/><rect x="200" y="58" width="3" height="16"/><rect x="214" y="58" width="3" height="16"/><rect x="196" y="56" width="24" height="3"/><g fill="#111"><rect x="188" y="74" width="10" height="3"/><rect x="202" y="74" width="10" height="3"/><rect x="216" y="74" width="10" height="3"/></g></g>
    <rect y="116" width="320" height="32" fill="#070b12" fill-opacity="0.72"/>
    <text x="14" y="138" fill="#f4f1ea" font-size="15" font-family="IBM Plex Sans, sans-serif" font-weight="600" letter-spacing="1.5">AVIÕES DE ÉPOCA</text>`,
};

function miniatura(id) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 320 148');
  svg.setAttribute('aria-hidden', 'true');
  const html = MINIATURAS[id] ?? MINIATURAS.medevac;
  svg.innerHTML = html;
  return svg;
}

function pintarCartoes() {
  const box = $('cartas');
  box.replaceChildren();
  for (const c of LISTA_CENARIOS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'carta' + (c.id === estado.cenario ? ' is-on' : '');
    btn.dataset.id = c.id;
    const fig = document.createElement('div');
    fig.className = 'carta-foto carta-foto-' + c.id;
    fig.append(miniatura(c.id));
    const h = document.createElement('h2');
    h.textContent = c.nome;
    const p = document.createElement('p');
    p.textContent = c.paragrafo;
    const tese = document.createElement('p');
    tese.className = 'carta-tese';
    tese.textContent = c.tese;
    btn.append(fig, h, p, tese);
    btn.addEventListener('click', () => {
      estado.cenario = c.id;
      pintarCartoes();
      syncCabine();
    });
    box.append(btn);
  }
}

function syncCabine() {
  const c = cenarioPorId(estado.cenario);
  const sel = $('select-cabine');
  if (![...sel.options].some((o) => o.value === c.defaults.aeronave.config_cabine)) return;
  if (!sel.dataset.tocado) sel.value = c.defaults.aeronave.config_cabine;
  $('select-trip').value = String(c.defaults.aeronave.tripulantes);
}

function restricoesUI() {
  return lerRestricoes({
    nunca_desviar: $('chk-nunca').checked,
    preferir_stol: $('chk-stol').checked,
    risco_maximo: $('select-risco').value,
    tripulantes: Number($('select-trip').value),
    config_cabine: $('select-cabine').value,
    semente: Number($('input-seed').value) || 222,
  });
}

function cancelarPedido() {
  if (!estado.abortJev) return;
  estado.abortJev.motivo = 'navegação';
  estado.abortJev.abort();
  estado.abortJev = null;
}

async function avaliarJev(momento, estadoMissao) {
  if (estado.abortJev) {
    estado.abortJev.motivo = 'navegação';
    estado.abortJev.abort();
  }
  const ctrl = new AbortController();
  ctrl.motivo = 'navegação';
  estado.abortJev = ctrl;
  const t = setTimeout(() => {
    ctrl.motivo = 'timeout';
    ctrl.abort();
  }, TIMEOUT_JEV_MS);
  try {
    const res = await fetch('/api/jev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ momento, estado: estadoMissao }),
      signal: ctrl.signal,
    });
    const data = await res.json();
    if (!res.ok || data.fonte !== 'jev') {
      const err = new Error(data.mensagem || 'bloqueio');
      err.bloqueio = data;
      throw err;
    }
    return data;
  } catch (erro) {
    if (erro?.name === 'AbortError' && ctrl.motivo !== 'timeout') {
      const cancel = new Error('cancelado');
      cancel.cancelado = true;
      throw cancel;
    }
    throw erro;
  } finally {
    clearTimeout(t);
  }
}

function vivo(gen) {
  return gen === estado.corrida && estado.ecra === 'live';
}

function esperar(ms, gen) {
  return new Promise((resolve) => {
    let acc = 0;
    let last = performance.now();
    const tick = (now) => {
      if (gen !== estado.corrida || estado.ecra !== 'live') return resolve();
      const dt = Math.min(80, now - last);
      last = now;
      if (!estado.pausado) acc += dt;
      if (acc >= ms) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

function pintarPausa() {
  const b = $('btn-pause');
  b.textContent = estado.pausado ? '▶' : 'II';
  b.setAttribute('aria-label', estado.pausado ? 'Continuar' : 'Pausar');
  b.setAttribute('aria-pressed', estado.pausado ? 'true' : 'false');
  $('pausa-banner').hidden = !estado.pausado;
}

function syncAnterior() {
  $('btn-anterior').disabled = !(estado.ecra === 'live' && podeVoltar(estado.indice));
}

function alternarPausa() {
  if (estado.ecra !== 'live') return;
  estado.pausado = !estado.pausado;
  pintarPausa();
}

function ciclo(agora) {
  if (estado.ecra !== 'live' || !estado.mundo) return;
  estado.raf = requestAnimationFrame(ciclo);
  let dt = (agora - estado.ultimo) / 1000;
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  if (dt > 0.08) dt = 0.08;
  estado.ultimo = agora;
  try {
    ajustarCanvas();
    if (!estado.pausado && estado.aviao) {
      passoAutomato(estado.aviao, dt);
      const pose = poseAviao(estado.aviao);
      aplicarPose(estado.mundo, pose);
      actualizarAmeacas(estado.mundo, dt);
      actualizarFluxo(estado.mundo, pose, dt);
      actualizarCamara(estado.mundo, pose, dt);
    }
    estado.mundo.renderer.render(estado.mundo.scene, estado.mundo.camera);
  } catch {
    /* o pedido ao JEV não pode matar o frame seguinte */
  }
}

function arrancarLoop() {
  cancelAnimationFrame(estado.raf);
  estado.ultimo = performance.now();
  estado.raf = requestAnimationFrame(ciclo);
}

function largarMundo() {
  cancelAnimationFrame(estado.raf);
  if (estado.mundo?.renderer) estado.mundo.renderer.dispose();
  estado.mundo = null;
}

function mostrarMundoActual(obstaculos) {
  if (estado.mundo && estado.aviao) {
    mostrarAmeacas(estado.mundo, obstaculos, poseAviao(estado.aviao));
  }
}

async function correrFita(desde) {
  cancelarPedido();
  const gen = ++estado.corrida;
  const fita = estado.fita;
  for (let i = desde; i < fita.incidentes.length; i++) {
    if (!vivo(gen)) return;
    estado.indice = i;
    syncAnterior();
    const inc = fita.incidentes[i];
    const missao = estadoAteIndice(estado.missaoBase, fita.incidentes, i);
    estado.missao = missao;
    const proximo = fita.incidentes[i + 1]?.resumo ?? 'Fim da fita';
    const plano = planoDoBeat(estado.log.incidentes, i);
    const repetido = plano.modo === 'replay';
    actualizarHud(missao, {
      fase: `Incidente ${i + 1}/${fita.incidentes.length}${repetido ? ' · repetido' : ''}`,
      fonte: 'jev',
      proximo,
    });

    const ameacas = missao.geometria?.obstaculos ?? [];

    let jev = plano.jev;
    if (!repetido) {
      try {
        jev = await avaliarJev('incidente', missao);
      } catch (erro) {
        if (erro?.cancelado || !vivo(gen)) return;
        return fecharIncompleta(erro.message || 'O Gateway falhou a meio da fita.');
      }
      if (!vivo(gen)) return;
      const pediriaPic = deveEscalarPIC(jev.answers);
      const pic = {
        autonomo: true,
        pediria_pic: pediriaPic,
        oferecido: pediriaPic,
        forcado: false,
        aceite: null,
        sobreposto: false,
      };
      estado.log.incidentes[i] = registarIncidente({
        estado: missao,
        incidente: inc,
        jev,
        baseline: { fonte: 'regra-geometrica', answers: decisaoGeometrica(missao, 'incidente') },
        pic,
      });
    }

    actualizarRail({ answers: jev.answers, latencia_ms: jev.latencia_ms, fonte: 'jev', incidente: inc });
    const maxP = maxProbabilidade(jev.answers.acaoMissao);
    const pediriaPic = deveEscalarPIC(jev.answers);
    const evasao = repetido ? plano.evasao : evasaoDeAnswers(jev.answers);
    mostrarChipJev(maxP, pediriaPic, evasao, { repetido, latencia_ms: jev.latencia_ms });
    mostrarMundoActual(ameacas);
    if (estado.aviao) aplicarEvasao(estado.aviao, evasao);
    await esperar(ameacas.length ? 3800 : 2600, gen);
  }

  if (vivo(gen)) abrirDebrief();
}

function voltarIncidente() {
  if (!podeVoltar(estado.indice) || estado.ecra !== 'live') return;
  const alvo = estado.indice - 1;
  estado.indice = alvo;
  syncAnterior();
  correrFita(alvo);
}

function voltarAoBriefing() {
  estado.corrida += 1;
  cancelarPedido();
  estado.pausado = false;
  estado.indice = -1;
  pintarPausa();
  syncAnterior();
  esconderChipJev();
  largarMundo();
  mostrar('commander');
  const ecra = $('screen-commander');
  if (ecra) ecra.scrollTop = 0;
}

async function lancarMissao() {
  if (!estado.gateway?.gateway_configurado) {
    mostrar('splash');
    await sondarGateway();
    return;
  }

  cancelarPedido();
  const gen = ++estado.corrida;
  const restricoes = restricoesUI();
  const cenario = cenarioPorId(estado.cenario);
  const fita = gerarFita(cenario.id, restricoes.semente);
  const missao = estadoInicial(cenario.id, restricoes);
  estado.fita = fita;
  estado.missaoBase = missao;
  estado.missao = missao;
  estado.aviao = novoAutomato();
  estado.pausado = false;
  estado.indice = -1;
  pintarPausa();
  syncAnterior();
  estado.log = {
    cenario,
    semente: restricoes.semente,
    restricoes,
    briefing: null,
    incidentes: [],
    incompleta: false,
    motivoIncompleta: null,
  };

  $('webgl-block').hidden = true;
  esconderChipJev();
  mostrar('live');
  largarMundo();

  if (!webglDisponivel()) {
    $('webgl-block').hidden = false;
  } else {
    try {
      estado.mundo = criarCena($('canvas'), {
        leve: perfilGraficoLeve(),
        cenario: cenario.id,
        pose: poseAviao(estado.aviao),
      });
      ajustarCanvas();
      aplicarPose(estado.mundo, poseAviao(estado.aviao));
      arrancarLoop();
    } catch {
      $('webgl-block').hidden = false;
    }
  }

  actualizarHud(missao, { fase: 'Briefing', fonte: '…', proximo: fita.incidentes[0]?.resumo });
  $('rail-incidente').textContent = 'JEV a ler o briefing…';
  mostrarMundoActual([]);

  try {
    const jev = await avaliarJev('briefing', missao);
    if (!vivo(gen)) return;
    estado.log.briefing = {
      jev,
      baseline: { fonte: 'regra-geometrica', answers: decisaoGeometrica(missao, 'briefing') },
    };
    actualizarHud(missao, { fase: 'Briefing', fonte: 'jev', proximo: fita.incidentes[0]?.resumo });
    actualizarRail({
      answers: {
        acaoMissao: {
          choice: 'prosseguir',
          probabilities: { prosseguir: 1 },
        },
        destinoPreferido: { choice: 'planeado' },
        urgencia: { score: 0 },
        riscoMeteorologico: { score: 0 },
        precisaRevisaoPIC: { probability: 0 },
      },
      latencia_ms: jev.latencia_ms,
      fonte: 'jev',
      incidente: missao.incidente,
    });
  } catch (erro) {
    if (erro?.cancelado || !vivo(gen)) return;
    return fecharIncompleta(erro.message || 'O Gateway falhou no briefing.');
  }

  await esperar(900, gen);
  if (!vivo(gen)) return;
  await correrFita(0);
}

function fecharIncompleta(motivo) {
  estado.log.incompleta = true;
  estado.log.motivoIncompleta = motivo;
  actualizarHud(estado.missao ?? estadoInicial(estado.cenario, restricoesUI()), {
    fase: 'Bloqueio',
    fonte: 'bloqueio',
    proximo: '—',
  });
  abrirDebrief();
}

function abrirDebrief() {
  esconderChipJev();
  const resumo = resumirMissao(estado.log);
  estado.ultimoResumo = resumo;
  pintarDebrief(resumo);
  mostrar('debrief');
}

function descarregarLog() {
  const blob = new Blob([JSON.stringify(estado.ultimoResumo ?? estado.log, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `lus222-jev-${estado.cenario}-${restricoesUI().semente}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function ligarUI() {
  pintarCartoes();
  syncCabine();

  $('btn-entrar').addEventListener('click', () => {
    if (!estado.gateway?.gateway_configurado) return;
    mostrar('commander');
  });
  $('btn-retry-gateway').addEventListener('click', () => sondarGateway());
  $('btn-voltar-splash').addEventListener('click', () => {
    $('splash')?.classList.add('is-ready');
    mostrar('splash');
    window.scrollTo(0, 0);
  });
  $('select-cabine').addEventListener('change', () => {
    $('select-cabine').dataset.tocado = '1';
  });
  $('btn-seed').addEventListener('click', () => {
    $('input-seed').value = String(1 + Math.floor(Math.random() * 900));
  });
  $('btn-missao').addEventListener('click', () => lancarMissao());

  $('btn-pause').addEventListener('click', () => alternarPausa());
  $('btn-anterior').addEventListener('click', () => voltarIncidente());
  $('btn-briefing').addEventListener('click', () => voltarAoBriefing());
  $('btn-pic').addEventListener('click', () => {
    const last = estado.log?.incidentes?.[estado.indice];
    if (last) {
      last.pic = { ...(last.pic ?? {}), forcado: true };
      last.escalou = true;
    }
    $('pic-override').hidden = false;
  });
  $('btn-pic-rumo').addEventListener('click', () => {
    aplicarAcao(estado.aviao, 'prosseguir');
    const last = estado.log?.incidentes?.[estado.indice];
    if (last) last.pic = { ...(last.pic ?? {}), forcado: true, sobreposto: true };
    $('pic-override').hidden = true;
  });
  $('btn-pic-fechar').addEventListener('click', () => {
    $('pic-override').hidden = true;
  });
  $('btn-abrir-rail').addEventListener('click', () => {
    $('rail').classList.toggle('is-open');
  });

  $('btn-outro').addEventListener('click', () => {
    largarMundo();
    mostrar('commander');
    const ecra = $('screen-commander');
    if (ecra) ecra.scrollTop = 0;
  });
  $('btn-repetir').addEventListener('click', () => lancarMissao());
  $('btn-log').addEventListener('click', descarregarLog);
  $('btn-retry-webgl').addEventListener('click', () => {
    if (webglDisponivel() && estado.missao) {
      $('webgl-block').hidden = true;
      try {
        estado.mundo = criarCena($('canvas'), {
          leve: perfilGraficoLeve(),
          cenario: estado.cenario,
          pose: estado.aviao ? poseAviao(estado.aviao) : undefined,
        });
        ajustarCanvas();
        mostrarMundoActual(estado.missao?.geometria?.obstaculos ?? []);
        arrancarLoop();
      } catch {
        $('webgl-block').hidden = false;
      }
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (estado.ecra !== 'live') return;
    if (ev.key === 'Escape') {
      ev.preventDefault();
      alternarPausa();
    } else if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      voltarIncidente();
    }
  });

  setTimeout(() => $('splash').classList.add('is-ready'), 2200);
}

ligarUI();
sondarGateway();
