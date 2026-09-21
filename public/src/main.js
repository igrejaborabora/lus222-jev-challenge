import { LISTA_CENARIOS, cenarioPorId } from './cenarios.js';
import { aplicarIncidente, estadoInicial, gerarFita, lerRestricoes } from './fita.js';
import { decisaoGeometrica, deveEscalarPIC, evasaoDeAnswers, maxProbabilidade } from './decisao.js';
import { registarIncidente, resumirMissao } from './debrief.js';
import { aplicarAcao, aplicarEvasao, novoAutomato, passoAutomato, poseAviao } from './automato.js';
import {
  actualizarAmeacas,
  actualizarCamara,
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

async function avaliarJev(momento, estadoMissao) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_JEV_MS);
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
  } finally {
    clearTimeout(t);
  }
}

function esperar(ms) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = (now) => {
      if (estado.ecra !== 'live') return resolve();
      if (!estado.pausado && now - t0 >= ms) return resolve();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
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

async function lancarMissao() {
  if (!estado.gateway?.gateway_configurado) {
    mostrar('splash');
    await sondarGateway();
    return;
  }

  const restricoes = restricoesUI();
  const cenario = cenarioPorId(estado.cenario);
  const fita = gerarFita(cenario.id, restricoes.semente);
  let missao = estadoInicial(cenario.id, restricoes);
  estado.fita = fita;
  estado.aviao = novoAutomato();
  estado.pausado = false;
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

  try {
    const jev = await avaliarJev('briefing', missao);
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
    return fecharIncompleta(erro.message || 'O Gateway falhou no briefing.');
  }

  await esperar(900);

  for (let i = 0; i < fita.incidentes.length; i++) {
    const inc = fita.incidentes[i];
    missao = aplicarIncidente(missao, inc);
    estado.missao = missao;
    const proximo = fita.incidentes[i + 1]?.resumo ?? 'Fim da fita';
    actualizarHud(missao, { fase: `Incidente ${i + 1}/${fita.incidentes.length}`, fonte: 'jev', proximo });

    const ameacas = missao.geometria?.obstaculos ?? [];
    if (estado.mundo && estado.aviao) {
      mostrarAmeacas(estado.mundo, ameacas, poseAviao(estado.aviao));
    }

    let jev;
    try {
      jev = await avaliarJev('incidente', missao);
    } catch (erro) {
      return fecharIncompleta(erro.message || 'O Gateway falhou a meio da fita.');
    }

    const baseline = { fonte: 'regra-geometrica', answers: decisaoGeometrica(missao, 'incidente') };
    actualizarRail({ answers: jev.answers, latencia_ms: jev.latencia_ms, fonte: 'jev', incidente: inc });

    const maxP = maxProbabilidade(jev.answers.acaoMissao);
    const pediriaPic = deveEscalarPIC(jev.answers);
    const pic = {
      autonomo: true,
      pediria_pic: pediriaPic,
      oferecido: pediriaPic,
      forcado: false,
      aceite: null,
      sobreposto: false,
    };
    const evasao = evasaoDeAnswers(jev.answers);
    mostrarChipJev(maxP, pediriaPic, evasao);
    aplicarEvasao(estado.aviao, evasao);

    estado.log.incidentes.push(registarIncidente({ estado: missao, incidente: inc, jev, baseline, pic }));
    await esperar(ameacas.length ? 3800 : 2200);
  }

  abrirDebrief();
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

  $('btn-pause').addEventListener('click', () => {
    estado.pausado = !estado.pausado;
    $('btn-pause').textContent = estado.pausado ? '▶' : 'II';
    $('btn-pause').setAttribute('aria-label', estado.pausado ? 'Continuar' : 'Pausar');
  });
  $('btn-pic').addEventListener('click', () => {
    const last = estado.log?.incidentes?.at(-1);
    if (last) {
      last.pic = { ...(last.pic ?? {}), forcado: true };
      last.escalou = true;
    }
    $('pic-override').hidden = false;
  });
  $('btn-pic-rumo').addEventListener('click', () => {
    aplicarAcao(estado.aviao, 'prosseguir');
    const last = estado.log?.incidentes?.at(-1);
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
        arrancarLoop();
      } catch {
        $('webgl-block').hidden = false;
      }
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && estado.ecra === 'live') {
      estado.pausado = !estado.pausado;
      $('btn-pause').textContent = estado.pausado ? '▶' : 'II';
    }
  });

  setTimeout(() => $('splash').classList.add('is-ready'), 2200);
}

ligarUI();
sondarGateway();
