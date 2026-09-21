import { LISTA_CENARIOS, cenarioPorId } from './cenarios.js';
import { estadoInicial, gerarFita, lerRestricoes } from './fita.js';
import { estadoAteIndice, planoDoBeat, podeVoltar } from './fita-correr.js';
import { decisaoGeometrica, deveEscalarPIC, evasaoDeAnswers, maxProbabilidade } from './decisao.js';
import { registarIncidente, resumirMissao } from './debrief.js';
import { aplicarAcao, aplicarEvasao, novoAutomato, passoAutomato, poseAviao } from './automato.js';
import {
  actualizarAmeacas,
  actualizarCamara,
  aplicarPose,
  criarCena,
  ancorarVisuais,
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
  const vv = window.visualViewport;
  return {
    largura: Math.round(canvas.clientWidth || vv?.width || window.innerWidth),
    altura: Math.round(canvas.clientHeight || vv?.height || window.innerHeight),
  };
}

function ajustarCanvas() {
  if (!estado.mundo) return;
  const { largura, altura } = medidasCanvas();
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

function pintarCartoes() {
  const box = $('cartas');
  box.replaceChildren();
  for (const c of LISTA_CENARIOS) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'carta' + (c.id === estado.cenario ? ' is-on' : '');
    btn.dataset.id = c.id;
    const fig = document.createElement('div');
    fig.className = 'carta-foto';
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
  let dt = (agora - estado.ultimo) / 1000;
  if (dt > 0.08) dt = 0.08;
  estado.ultimo = agora;
  if (!estado.pausado && estado.aviao) {
    passoAutomato(estado.aviao, dt);
    const pose = poseAviao(estado.aviao);
    aplicarPose(estado.mundo, pose);
    actualizarAmeacas(estado.mundo, dt);
    ancorarVisuais(estado.mundo, pose);
    actualizarCamara(estado.mundo, pose, dt);
  }
  estado.mundo.renderer.render(estado.mundo.scene, estado.mundo.camera);
  estado.raf = requestAnimationFrame(ciclo);
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
    mostrarMundoActual(ameacas);

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
    mostrarChipJev(maxP, pediriaPic, evasao, { repetido });
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
      estado.mundo = criarCena($('canvas'), { leve: perfilGraficoLeve(), cenario: cenario.id });
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
  $('btn-voltar-splash').addEventListener('click', () => mostrar('splash'));
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
  });
  $('btn-repetir').addEventListener('click', () => lancarMissao());
  $('btn-log').addEventListener('click', descarregarLog);
  $('btn-retry-webgl').addEventListener('click', () => {
    if (webglDisponivel() && estado.missao) {
      $('webgl-block').hidden = true;
      try {
        estado.mundo = criarCena($('canvas'), { leve: perfilGraficoLeve(), cenario: estado.cenario });
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
