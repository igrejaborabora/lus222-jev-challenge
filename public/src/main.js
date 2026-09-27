import { cenarioUI, textoUI } from './copy-en.js';
import { CENARIOS_SIM, PERFIL, ambienteAposEvento, criarMissao, avancarMissao, aplicarDecisao, proximoEvento, estadoParaAvaliacao, combustivelNecessarioKg, pistaNecessariaM, vooInterpolado } from './simulacao.js';
import { validarRespostas } from './contrato-jev.js';
import { avaliarLinha, resumirLinhas } from './avaliacao-sim.js';
import { decisaoGeometrica, etiquetarAcao, etiquetarDestino, etiquetarManobraV, etiquetarManobraL, evasaoDeAnswers } from './decisao.js';
import { novoAutomato, passoAutomato, poseAviao } from './automato.js';
import { poseMissao } from './escala.js';
import { alcanceM, pontosFitaRota, setaManobra } from './rota-visual.js';
import { pistasDaMissao } from './relevo.js';
import { emLeitura, leituraAmeaca, posicaoVisualBaloes } from './ameaca-visual.js';
import { ameacaIminente, fatorTempo, TECTO_LEITURA } from './fator-tempo.js';
import { decimal, pintarPainel, pintarPergunta } from './painel-jev.js';
import { encaminhar, ROTULO_NIVEL } from './confianca.js';
import { criarSomMotor } from './som-motor.js';
import { criarSimuladorUI } from './simulador-ui.js';
import {
  actualizarSeparacoes,
  actualizarOrdemPiloto,
  aplicarOrdemPiloto,
  assinaturaObstaculos,
  concluirPasso,
  criarPercursoPiloto,
  deveDespacharNoPercurso,
  deveDespacharPasso,
  estadoPassoPiloto,
  falharPasso,
  metricasPiloto,
  novoControloPiloto,
  novoPipelinePiloto,
  obstaculosCenario,
  obstaculosVisiveis,
  percursoConcluido,
  reservarPasso,
  separacaoInstantanea,
  selecionarRespostaReplay,
  suspenderControloPiloto,
} from './piloto-corredor.js';

const $ = (id) => document.getElementById(id);
const FALHAS_ATE_PARAR = 5;
// Quando o JEV pede o PIC, o visitante tem este tempo antes de ficar a escolha do JEV.
const ESCALADA_S = 10;
// Tecto de pedidos ao Gateway por missão ou prova: uma rede de segurança, não o orçamento.
const MAX_PEDIDOS_MISSAO = 300;
const LABEL_DESTINO = { planeado: 'Planned destination', origem: 'Departure', hospital_alternativo: 'Alternative hospital', aeroporto_alternativo: 'Alternative airport', stol_proximo: 'Nearby STOL strip' };
// O corredor do piloto não tem meteorologia própria: tecto alto, bom tempo, sem vento.
const AMBIENTE_PILOTO = Object.freeze({ tetoFt: 3000, visKm: 12, luzDia: true, ventoMs: Object.freeze({ x: 0, z: 0 }) });
const estado = { ecra: 'splash', gateway: false, cenario: 'porto', modo: null, missao: null, log: null, replay: null, mundo: null, mundoApi: null, raf: 0, ultimoFrame: 0, ultimoUI: 0, pausa: false, espera: false, falha: false, incidentePendente: null, briefingPendente: false, revelarAte: 0, velocidade: 8, pedido: null, pedidosPiloto: new Map(), piloto: null, escalada: null, pedidosFeitos: 0, pausaAutomatica: false, escondidoEm: null, geracao: 0, autorManobra: 'jev', marcasCache: null, leitura: null };

// Um só contexto de áudio por página; criado no primeiro clique que inicia um voo.
const som = criarSomMotor();
const CHAVE_SOM = 'lus222-som';
function preferenciaSom() {
  try { return localStorage.getItem(CHAVE_SOM) !== 'desligado'; } catch { return true; }
}
function definirSom(ligado) {
  $('btn-som').setAttribute('aria-pressed', String(ligado));
  som.silenciar(!ligado);
  try { localStorage.setItem(CHAVE_SOM, ligado ? 'ligado' : 'desligado'); } catch { /* sem armazenamento: vale só nesta página */ }
}
/** Tem de correr dentro do clique: os browsers só deixam começar áudio depois de um gesto. */
function ligarSom() {
  som.silenciar(!preferenciaSom());
  som.ligar();
}
function distanciaCamaraM() {
  const m = estado.mundo;
  return m?.camera && m?.aviao ? m.camera.position.distanceTo(m.aviao.position) : 25;
}
/** Potência e velocidade do voo; na prova contínua, derivadas do autómato (mundo à escala do corredor). */
function atualizarSom() {
  if (estado.pausa || estado.falha || document.hidden) { som.suspender(); return; }
  som.retomar();
  if (emModoPiloto()) {
    const a = estado.piloto?.automato;
    som.actualizar({ potencia: 0.55 + 3 * (Number(a?.pitch) || 0), velocidadeMs: ((Number(a?.speed) || 38) / 38) * 88, distanciaCamaraM: distanciaCamaraM() });
    return;
  }
  const v = estado.missao?.voo;
  som.actualizar({ potencia: v?.potencia ?? 0.5, velocidadeMs: v?.velocidadeMs ?? 88, distanciaCamaraM: distanciaCamaraM() });
}

function mostrar(nome) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${nome}`));
  estado.ecra = nome;
  document.documentElement.classList.toggle('flight-active', nome === 'live');
  window.scrollTo(0, 0);
}
function numero(n, casas = 0) { return Number.isFinite(Number(n)) ? Number(n).toFixed(casas) : '—'; }
function tempo(n) { return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`; }
function safeClone(v) { return structuredClone(v); }
function nomeCenario() { return cenarioUI(estado.cenario).nome; }
function nomeDestino(id) { return id === 'planeado' && estado.cenario === 'porto' ? 'Francisco Sá Carneiro' : LABEL_DESTINO[id] ?? id; }
function emModoPiloto() { return estado.modo === 'pilot-live' || estado.modo === 'pilot-replay'; }
function emReplay() { return estado.modo === 'replay' || estado.modo === 'pilot-replay'; }
function definirPausa(pausa) {
  const proxima = Boolean(pausa);
  if (estado.pausa === proxima) return;
  if (emModoPiloto() && estado.piloto) {
    const agora = performance.now();
    if (proxima) estado.piloto.pausaIniciadaEm = agora;
    else if (estado.piloto.pausaIniciadaEm != null) {
      suspenderControloPiloto(estado.piloto.controlo, estado.piloto.pausaIniciadaEm, agora);
      estado.piloto.pausaIniciadaEm = null;
    }
  }
  estado.pausa = proxima;
  $('btn-pause').textContent = estado.pausa ? 'Resume' : 'Pause';
}

async function sondarGateway() {
  try {
    const r = await fetch('/api/jev', { cache: 'no-store' });
    const d = await r.json();
    estado.gateway = Boolean(d.gateway_configurado);
  } catch { estado.gateway = false; }
  $('gateway-status').textContent = estado.gateway ? '● Live JEV available' : '○ Live AI unavailable · replay available';
  $('mode-info').textContent = estado.gateway ? 'Live JEV is available. You can also explore a recorded replay.' : 'Live AI is unavailable. Explore a recorded replay, clearly labelled throughout the flight.';
  $('btn-launch').disabled = !estado.gateway;
  $('btn-pilot').textContent = estado.gateway ? 'JEV continuous flight ↗' : 'Watch recorded continuous flight ↗';
  $('btn-lab').disabled = !estado.gateway;
}

function criarCartoes() {
  const host = $('mission-cards');
  host.replaceChildren();
  const nums = { porto: '00', medevac: '01', carga: '02', sar: '03' };
  for (const [id, c] of Object.entries(CENARIOS_SIM)) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `mission-card${id === estado.cenario ? ' selected' : ''}`; b.dataset.id = id;
    b.setAttribute('aria-pressed', String(id === estado.cenario));
    const art = document.createElement('div'); art.className = 'mission-art';
    const cat = document.createElement('span'); cat.textContent = id === 'porto' ? 'FEATURED / SÃO JOÃO' : id === 'medevac' ? 'MEDEVAC / AÇORES' : id === 'carga' ? 'CARGO / ALENTEJO' : 'SAR / COAST';
    const num = document.createElement('span'); num.textContent = nums[id]; art.append(cat, num);
    const body = document.createElement('div'); body.className = 'mission-body';
    const h = document.createElement('h2'); h.textContent = cenarioUI(id).nome;
    const p = document.createElement('p'); p.textContent = cenarioUI(id).descricao;
    const thesis = document.createElement('span'); thesis.className = 'mission-thesis'; thesis.textContent = cenarioUI(id).subtitulo;
    body.append(h, p, thesis); b.append(art, body);
    b.addEventListener('click', () => { estado.cenario = id; $('input-payload').value = c.payloadKg; criarCartoes(); });
    host.append(b);
  }
  $('btn-setup-map').hidden = estado.cenario !== 'porto';
}

// A partir de 1280 px a gaveta de decisão abre por omissão; abaixo começa
// fechada, para dar espaço ao 3D. Anda a par da regra de styles.css para
// 761–1100 px, que estreita o selo e o desvia (com a etiqueta) para o lado da
// gaveta aberta: se mudares um dos limiares, revê o outro.
function ecraLargo() { return matchMedia('(min-width: 1280px)').matches; }
function abrirGaveta(aberta) {
  $('decision-panel').classList.toggle('is-open', aberta);
  $('btn-drawer').setAttribute('aria-expanded', String(aberta));
}
function manobraCurta(vertical, lateral) {
  const partes = [lateral && lateral !== 'manter' ? etiquetarManobraL(lateral) : null, vertical && vertical !== 'manter' ? etiquetarManobraV(vertical) : null].filter(Boolean);
  return partes.length ? partes.join(' + ') : 'axes held';
}
function selo(origem, escolha, ms, aEsperar = false, confianca = null) {
  $('seal-source').textContent = origem;
  $('seal-choice').textContent = escolha;
  const tempo = Number.isFinite(ms) ? `${Math.round(ms)} ms${emReplay() ? ' · recorded' : ''}` : '— ms';
  $('seal-ms').textContent = Number.isFinite(confianca) ? `${tempo} · conf ${decimal(confianca)}` : tempo;
  $('flight-seal').classList.toggle('is-waiting', aEsperar);
}
function origemSelo() { return emReplay() ? 'JEV / RECORDED REPLAY' : 'JEV / LIVE'; }
/** «CONFIDENCE 0,64 · AGE E ASSINALA»: a flag mostra o encaminhamento, não P(revisão). */
function mostrarEncaminhamento(rota) {
  $('decision-pic').textContent = `CONFIDENCE ${decimal(rota.confianca)} · ${ROTULO_NIVEL[rota.nivel].toUpperCase()}`;
  $('decision-pic').dataset.nivel = rota.nivel;
}

function configuracao() { return { payload_kg: Number($('input-payload').value), risco_maximo: $('select-risk').value, preferir_stol: $('check-stol').checked, nunca_desviar: $('check-no-divert').checked }; }
function semente() { return Math.min(999999999, Math.max(1, Number($('input-seed').value) || 222)); }

function erroLimite(mensagem) {
  const e = new Error(mensagem);
  e.codigo = 'limite';
  return e;
}
/** Conta um pedido ao Gateway; acima do tecto da missão, falha como limite. */
function contarPedido() {
  estado.pedidosFeitos += 1;
  if (estado.pedidosFeitos > MAX_PEDIDOS_MISSAO) throw erroLimite(`This mission has reached its limit of ${MAX_PEDIDOS_MISSAO} live requests.`);
}
async function avaliarJev(momento, entrada) {
  contarPedido();
  const ctrl = new AbortController(); estado.pedido = ctrl;
  const timeout = setTimeout(() => ctrl.abort(), 13000);
  try {
    const r = await fetch('/api/jev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ momento, estado: entrada }), signal: ctrl.signal });
    const d = await lerJson(r);
    // O 429 da firewall da Vercel não traz o nosso JSON: qualquer 429 é limite.
    if (d.erro === 'limite' || r.status === 429) throw erroLimite('Live AI request limit reached. Replay remains available.');
    if (!r.ok || d.fonte !== 'jev') throw new Error('Live JEV is unavailable. Please retry or choose a recorded replay.');
    const c = validarRespostas(momento, d.answers);
    if (!c.ok) throw new Error('JEV returned an incomplete response. Please retry.');
    return d;
  } catch (e) {
    if (e.codigo) throw e;
    throw new Error(e.name === 'AbortError' ? 'The request timed out.' : e.message, { cause: e });
  }
  finally { clearTimeout(timeout); if (estado.pedido === ctrl) estado.pedido = null; }
}

async function carregarReplay(id) {
  const r = await fetch(`./replays/${id}.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error('No recorded replay is available for this scenario.');
  const data = await r.json();
  if (data.cenario !== id || data.perfil !== PERFIL.versao || !data.briefing || !data.eventos) throw new Error('This replay does not match the current simulation version.');
  const b = validarRespostas('briefing', data.briefing.answers);
  if (!b.ok) throw new Error('The recorded briefing is incomplete.');
  return data;
}

async function carregarReplaysPiloto() {
  const ids = ['medevac', 'carga', 'sar'];
  const pares = await Promise.all(ids.map(async (id) => [id, await carregarReplay(id)]));
  return Object.fromEntries(pares);
}

function parametrosVoo() {
  if (emModoPiloto()) return poseAviao(estado.piloto.automato);
  // A física avança em passos de 0,1 s; o desenho interpola entre os dois últimos.
  return poseMissao(vooInterpolado(estado.missao), estado.missao.comando);
}
async function criarMundo() {
  try {
    if (new URLSearchParams(location.search).has('sem-webgl')) throw new Error('WebGL disabled for verification');
    const api = await import('./world.js');
    if (!api.webglDisponivel()) throw new Error('WebGL unavailable');
    estado.mundoApi = api;
    estado.mundo = api.criarCena($('flight-canvas'), {
      leve: api.perfilGraficoLeve(),
      cenario: emModoPiloto() ? 'corredor' : estado.cenario,
      pose: parametrosVoo(),
      pistas: emModoPiloto() ? [] : pistasDaMissao(estado.missao.destinos),
      apresentacao: !emModoPiloto(),
      // O piloto contínuo não tem destinos: sem marcas da missão.
      destinos: emModoPiloto() ? [] : estado.missao.destinos,
      nomesDestinos: emModoPiloto() ? {} : Object.fromEntries(estado.missao.destinos.map((d) => [d.id, nomeDestino(d.id)])),
    });
    ajustarMundo();
  } catch {
    estado.mundo = null;
    estado.mundoApi = null;
    $('flight-canvas').style.background = 'linear-gradient(155deg,#090b0e,#20262c 55%,#454d55)';
    $('flight-status').textContent = '2D view. The mission and JEV remain active.';
  }
  // Sem mundo 3D não há câmara para alternar.
  $('btn-camera').hidden = !estado.mundo;
}
function ajustarMundo() {
  if (!estado.mundo) return;
  const r = $('flight-canvas').getBoundingClientRect();
  if (r.width > 1 && r.height > 1) estado.mundoApi.redimensionar(estado.mundo, Math.round(r.width), Math.round(r.height));
}
function largarMundo() {
  try { if (estado.mundo) estado.mundoApi?.largarCena(estado.mundo); } catch { /* libertar a GPU nunca impede sair da missão */ }
  estado.mundo = null; estado.mundoApi = null;
}
/**
 * O céu mostra o ambiente que o JEV recebe: com um incidente à espera da
 * decisão, já é o ambiente depois do evento (estadoParaAvaliacao), embora
 * m.ambiente só mude quando a decisão é aplicada.
 */
function ambienteVisivel() {
  if (emModoPiloto()) return AMBIENTE_PILOTO;
  const m = estado.missao;
  return estado.incidentePendente ? ambienteAposEvento(m, estado.incidentePendente) : m.ambiente;
}
const RESERVA_FOLGADA = 1.15;
const REFRESCAR_MARCAS_MS = 500;
function classeReserva(alcance, distancia) {
  if (alcance >= RESERVA_FOLGADA * distancia) return 'ok';
  return alcance >= distancia ? 'curta' : 'insuficiente';
}
/**
 * Alcance (bissecção), reserva e distâncias no máximo a cada 500 ms, e já ao
 * mudar de destino. A fita e a seta são deste frame: com a fita de há 500 ms,
 * a 8× os portais saltavam ~120 m de lado durante uma evasão.
 */
function dadosMarcas() {
  const m = estado.missao;
  const agora = performance.now();
  let c = estado.marcasCache;
  if (!c || c.destinoId !== m.destinoId || agora - c.em >= REFRESCAR_MARCAS_MS) {
    const distancia = (d) => Math.hypot(d.xM - m.voo.xM, d.zM - m.voo.zM);
    const activo = m.destinos.find((d) => d.id === m.destinoId) ?? m.destinos[1];
    c = estado.marcasCache = {
      em: agora,
      destinoId: m.destinoId,
      destino: activo,
      reserva: classeReserva(alcanceM(m), distancia(activo)),
      distanciasKm: Object.fromEntries(m.destinos.map((d) => [d.id, distancia(d) / 1000])),
    };
  }
  return {
    pontosRota: pontosFitaRota(vooInterpolado(m), c.destino),
    destinoAtivoId: m.destinoId,
    distanciasKm: c.distanciasKm,
    reserva: c.reserva,
    seta: m.voo.tempoS < m.comando.evasaoAteS ? setaManobra(m.comando) : null,
    autor: estado.autorManobra ?? 'jev',
    // Anel à volta dos balões: o perímetro de protecção da simulação (36 m).
    raioBaloesM: m.ameacaAtiva?.raioProtecaoM ?? null,
  };
}
function desenharMundo(dt) {
  if (!estado.mundo) return;
  const api = estado.mundoApi;
  try {
    // Ordem: recentrar → pose → ameaças → câmara → cena (terreno com a pose
    // absoluta; céu com a local e a câmara deste frame) → desenhar.
    const absoluta = parametrosVoo();
    const pose = api.recentrarOrigem(estado.mundo, absoluta);
    api.aplicarPose(estado.mundo, pose);
    if (emModoPiloto() && estado.piloto) {
      api.mostrarAmeacas(
        estado.mundo,
        obstaculosCenario(estado.piloto.percurso, estado.piloto.automato),
        absoluta,
        { escalaDistancia: 1 },
      );
    } else if (!emModoPiloto()) api.posicionarBaloes(estado.mundo, estado.missao.ameacaAtiva, vooInterpolado(estado.missao), pose);
    api.actualizarAmeacas(estado.mundo, dt);
    api.actualizarCamara(estado.mundo, pose, dt);
    // Em pausa o céu congela (chuva, rastos e anoitecer); continua a desenhar.
    const marcas = emModoPiloto() ? null : dadosMarcas();
    api.actualizarCena(estado.mundo, { pose: absoluta, poseLocal: pose, ambiente: ambienteVisivel(), marcas }, estado.pausa ? 0 : dt);
    estado.mundo.renderer.render(estado.mundo.scene, estado.mundo.camera);
  } catch { /* falha visual não altera a decisão */ }
}

/** Todas as respostas tipadas, com a distribuição completa, a confiança e o custo da chamada. */
function mostrarRespostas(resposta) {
  pintarPainel($('typed-meta'), $('typed-answers'), resposta, { replay: emReplay() });
}
function entradaBreve(entrada) {
  const obstaculo = entrada.geometria.obstaculos[0];
  if (obstaculo) return `${textoUI(obstaculo.tipo)} · ${obstaculo.distancia_m} m · ${obstaculo.segundos_ate_ao_contacto} s`;
  return `${entrada.ambiente.tecto_ft} ft ceiling · ${entrada.ambiente.vento_kt} kt wind · ${entrada.aeronave.fuel_kg} kg fuel`;
}
/** Como se lê a passagem da ameaça deste evento; null sem balões nem leitura. */
function textoLeitura(evento) {
  // O tecto de 2× só existe quando a velocidade escolhida é maior.
  const ritmo = estado.velocidade > TECTO_LEITURA ? `Encounter shown at ${TECTO_LEITURA}×` : `Encounter at ${estado.velocidade}×`;
  if (evento.tipo === 'baloes') return `${ritmo}; lanterns shown to scale, with a label and clearance ring; separation calculated in metres.`;
  return estado.leitura ? `${ritmo}; ${textoUI(estado.leitura.tipo)} with a distance label.` : null;
}
/** A intervenção do supervisor aparece sempre; a leitura da ameaça junta-se-lhe. */
function textoEstadoVoo(evento, supervisor) {
  const bloqueio = supervisor.interveio ? 'The supervisor blocked the JEV decision to protect the flight path.' : null;
  return [bloqueio, textoLeitura(evento)].filter(Boolean).join(' ') || 'Decision applied to the mission and flight.';
}
function atualizarDecisao(evento, entrada, jev, supervisor, pic = {}) {
  $('event-number').textContent = String(estado.log.linhas.length).padStart(2, '0');
  $('event-title').textContent = evento.tipo === 'baloes' ? 'Lanterns on approach.' : evento.tipo === 'aproximacao' ? 'Runway in sight.' : evento.tipo === 'meteorologia' ? 'Weather has changed.' : evento.tipo === 'relevo' ? 'Obstacle on the route.' : evento.tipo === 'aves' ? 'Birds ahead.' : evento.tipo === 'trafego' ? 'Traffic in the area.' : evento.tipo === 'combustivel' ? 'Fuel reserve at risk.' : 'A decision is needed.';
  $('event-desc').textContent = textoUI(evento.resumo);
  $('flow-input').textContent = entradaBreve(entrada);
  $('flow-choice').textContent = etiquetarAcao(jev.answers.acaoMissao.choice);
  $('flow-detail').textContent = `Route: ${nomeDestino(supervisor.aplicada.destino)} · ${etiquetarManobraV(supervisor.aplicada.vertical)} / ${etiquetarManobraL(supervisor.aplicada.lateral)}`;
  const alvo = estado.missao.destinos.find((d) => d.id === estado.missao.destinoId);
  const distancia = Math.round(Math.hypot(estado.missao.voo.xM - alvo.xM, estado.missao.voo.zM - alvo.zM) / 1000);
  const reserva = Math.round(estado.missao.voo.combustivelKg - combustivelNecessarioKg(estado.missao, alvo));
  $('flow-effect').textContent = supervisor.interveio ? `Supervisor: ${textoUI(supervisor.motivo)}. ${nomeDestino(estado.missao.destinoId)} · ${distancia} km · reserve ${reserva} kg.` : supervisor.separacaoPrevistaM != null ? `Lanterns: predicted separation ${supervisor.separacaoPrevistaM} m (illustrative minimum 36 m). Encounter not yet completed.` : estado.missao.fase === 'orbita' ? `Hold for 90 s; ${distancia} km remaining and ${reserva} kg reserve.` : `${nomeDestino(estado.missao.destinoId)} · ${distancia} km remaining · calculated reserve ${reserva} kg.`;
  $('decision-origin').textContent = supervisor.interveio ? 'SUPERVISOR INTERVENED' : pic.interveio ? 'PILOT OVERRIDE' : estado.modo === 'replay' ? 'JEV / RECORDED REPLAY' : 'JEV / LIVE';
  mostrarEncaminhamento(encaminhar(jev));
  if (pic.escalado && pic.origem === 'replay') $('flow-effect').textContent += ` JEV requested pilot input (confidence ${decimal(pic.confianca)}); the replay uses the recorded decision.`;
  mostrarRespostas(jev);
  selo(supervisor.interveio ? 'SUPERVISOR INTERVENED' : pic.interveio ? 'PILOT OVERRIDE' : origemSelo(), `${etiquetarAcao(supervisor.aplicada.acao ?? jev.answers.acaoMissao.choice)} · ${manobraCurta(supervisor.aplicada.vertical, supervisor.aplicada.lateral)}`, jev.latencia_ms, false, jev.confidence?.acaoMissao);
  $('flight-status').textContent = textoEstadoVoo(evento, supervisor);
}
function atualizarTelemetria() {
  if (!estado.missao) return;
  if (emModoPiloto()) {
    const piloto = estado.piloto;
    const entrada = estadoPassoPiloto(piloto.percurso, piloto.automato);
    const restante = Math.max(0, piloto.percurso.distancia_total_m - entrada.voo.posicao_z_m);
    $('flight-phase').textContent = `continuous flight${estado.pausa ? ' · paused' : ''}`;
    $('tel-speed').textContent = Math.round(piloto.automato.speed * 1.94384);
    $('tel-alt').textContent = Math.round(piloto.automato.y * 3.28084).toLocaleString('en-GB');
    $('tel-fuel').textContent = '—';
    $('tel-eta').textContent = numero(restante / Math.max(1, piloto.automato.speed) / 60, 1);
    $('tel-time').textContent = tempo(entrada.voo.tempo_s);
    atualizarProvaPiloto();
    return;
  }
  const m = estado.missao, v = m.voo, d = m.destinos.find((x) => x.id === m.destinoId);
  const restante = Math.hypot(v.xM - d.xM, v.zM - d.zM);
  $('flight-phase').textContent = textoUI(m.fase) + (estado.pausa ? ' · paused' : m.ameacaAtiva && estado.velocidade > TECTO_LEITURA ? ` · ${TECTO_LEITURA}× lanterns` : estado.leitura && estado.velocidade > TECTO_LEITURA ? ` · ${TECTO_LEITURA}× ${textoUI(estado.leitura.tipo)}` : '');
  $('tel-speed').textContent = Math.round(v.velocidadeMs * 1.94384);
  $('tel-alt').textContent = Math.round(v.altitudeM * 3.28084).toLocaleString('en-GB');
  $('tel-fuel').textContent = Math.round(v.combustivelKg);
  $('tel-eta').textContent = Math.round(restante / Math.max(45, v.velocidadeMs + m.ambiente.ventoMs.z) / 60);
  $('tel-time').textContent = tempo(v.tempoS);
  $('map-destination').textContent = nomeDestino(m.destinoId);
  const origem = m.destinos.find((x) => x.id === 'origem');
  const planeado = m.destinos.find((x) => x.id === 'planeado');
  const maiorZ = Math.max(planeado.zM, d.zM, 1);
  const ponto = (p) => [20 + 228 * p.zM / maiorZ, 80 - 42 * p.xM / 30000];
  const [ox, oy] = ponto(origem), [px, py] = ponto(v), [dx, dy] = ponto(d), [fx, fy] = ponto(planeado);
  $('map-planned').setAttribute('d', `M${ox} ${oy} L${fx} ${fy}`);
  $('map-path').setAttribute('d', `M${ox} ${oy} L${px} ${py} L${dx} ${dy}`);
  $('map-plane').setAttribute('cx', String(px)); $('map-plane').setAttribute('cy', String(py));
  $('map-target').setAttribute('cx', String(dx)); $('map-target').setAttribute('cy', String(dy));
  $('map-caption').textContent = `${Math.round(restante / 1000)} km · estimated reserve ${Math.round(v.combustivelKg - combustivelNecessarioKg(m, d))} kg`;
  const baloes = m.separacoes.find((s) => s.id === 'baloes');
  if (baloes && estado.log?.linhas.at(-1)?.id === 'baloes') {
    $('flow-effect').textContent = `Encounter completed: minimum separation ${baloes.minimaM} m (illustrative minimum ${baloes.limiteM} m). ${nomeDestino(m.destinoId)} remains the destination.`;
    $('flight-status').textContent = 'Separation is calculated from the simulated trajectory; lanterns are shown to scale with a label and clearance ring.';
  }
}
function atualizarResultadoLinha() {
  const ultima = estado.log?.linhas.at(-1);
  if (ultima) ultima.depois = { tempoS: Math.round(estado.missao.voo.tempoS), fuelKg: Math.round(estado.missao.voo.combustivelKg), destino: estado.missao.destinoId, distanciaM: Math.round(estado.missao.voo.distanciaPercorridaM), separacoes: safeClone(estado.missao.separacoes) };
}
/**
 * Limite do Gateway ou tecto da missão: o resto da sessão segue em replay
 * gravado, identificado no cabeçalho. Nunca se finge uma decisão ao vivo.
 */
function passarAoReplay(motivo) {
  estado.gateway = false;
  $('gateway-status').textContent = '○ Live AI limit reached · replay available';
  $('btn-launch').disabled = true;
  $('btn-lab').disabled = true;
  $('btn-pilot').textContent = 'Watch recorded continuous flight ↗';
  const piloto = emModoPiloto();
  cancelarPedidos();
  void (piloto ? iniciarPiloto() : iniciar('replay')).then(() => {
    $('flight-source').textContent = piloto ? 'RECORDED JEV REPLAY · LIVE LIMIT REACHED' : 'RECORDED REPLAY · LIVE LIMIT REACHED';
    $('flight-status').textContent = `${motivo} Showing the recorded flight.`;
  });
}
function mostrarFalha(mensagem) {
  estado.falha = true; estado.espera = false;
  $('failure-reason').textContent = mensagem;
  $('failure-overlay').hidden = false;
  $('flight-status').textContent = 'Simulation paused. Ending now will leave the live comparison incomplete.';
}

function separacaoMinimaPiloto() {
  const valores = [...(estado.piloto?.percurso.separacoes.values() ?? [])].filter(Number.isFinite);
  return valores.length ? Math.min(...valores) : null;
}

function fecharOrdemActivaPiloto() {
  const activa = estado.piloto?.ordemActiva;
  if (!activa) return;
  activa.registo.separacao_min_m = Number.isFinite(activa.separacaoMinM) ? Math.round(activa.separacaoMinM * 10) / 10 : null;
  estado.piloto.ordemActiva = null;
}

function atualizarProvaPiloto() {
  if (!estado.piloto) return;
  const metricas = metricasPiloto(estado.piloto.pipeline, performance.now());
  $('pilot-stats').textContent = `${metricas.decisoes_por_minuto}/min · p50 ${metricas.latencia_mediana_ms ?? '—'} · p95 ${metricas.latencia_p95_ms ?? '—'} ms · sep ${metricas.separacao_min_m ?? '—'} m`;
  const fita = $('pilot-tape');
  fita.replaceChildren();
  estado.piloto.pipeline.historico.filter((row) => row.aplicar && !row.erro).slice(-4).reverse().forEach((row) => {
    const a = row.resposta.answers;
    const item = elemento('div', 'pilot-tape-row');
    item.append(
      elemento('time', '', `#${String(row.sequencia + 1).padStart(2, '0')}`),
      elemento('b', '', `${etiquetarManobraL(a.manobraLateral.choice)} + ${etiquetarManobraV(a.manobraVertical.choice)}`),
      elemento('span', '', `${row.latencia_ms} ms`),
    );
    fita.append(item);
  });
}

async function lerJson(r) {
  if (r.headers.get('content-type')?.includes('json')) return r.json();
  return { mensagem: `The service returned HTTP ${r.status}.` };
}

async function avaliarPassoPiloto(ticket, entrada) {
  contarPedido();
  const ctrl = new AbortController();
  estado.pedidosPiloto.set(ticket.id, ctrl);
  const timeout = setTimeout(() => ctrl.abort(), 13_000);
  try {
    const r = await fetch('/api/jev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ momento: 'incidente', estado: entrada }),
      signal: ctrl.signal,
    });
    const d = await lerJson(r);
    if (d.erro === 'limite' || r.status === 429) throw erroLimite('Live AI request limit reached. Replay remains available.');
    if (!r.ok || d.fonte !== 'jev') throw new Error('Live JEV is unavailable. Please retry or choose a recorded replay.');
    const contrato = validarRespostas('incidente', d.answers);
    if (!contrato.ok) throw new Error('JEV returned an incomplete response. Please retry.');
    return d;
  } catch (e) {
    if (e.codigo) throw e;
    throw new Error(e.name === 'AbortError' ? 'The pilot request exceeded 13 seconds.' : e.message, { cause: e });
  } finally {
    clearTimeout(timeout);
    estado.pedidosPiloto.delete(ticket.id);
  }
}

function mostrarPassoPiloto(registo) {
  const entrada = registo.entrada;
  const jev = registo.resposta;
  const answers = jev.answers;
  const obstaculo = entrada.geometria.obstaculos[0];
  const melhorFolga = entrada.geometria.folgas_candidatas[0];
  $('event-number').textContent = String(registo.sequencia + 1).padStart(2, '0');
  $('event-title').textContent = obstaculo ? `${textoUI(obstaculo.tipo)}.` : 'Clear corridor.';
  $('event-desc').textContent = 'JEV compares the available clearances and chooses a manoeuvre for the current corridor.';
  $('flow-input').textContent = obstaculo ? `${entrada.geometria.obstaculos.length} threats · nearest at ${obstaculo.distancia_m} m` : 'Corridor exit';
  $('flow-choice').textContent = `${etiquetarManobraL(answers.manobraLateral.choice)} + ${etiquetarManobraV(answers.manobraVertical.choice)}`;
  $('flow-detail').textContent = `Calculated clearance: ${textoUI(melhorFolga?.id ?? '—')} · ${melhorFolga?.folga_min_m ?? '—'} m`;
  $('flow-effect').textContent = registo.executou_manobra
    ? 'New command: the local controller sets lateral and altitude targets, with a heading change capped at 0.5 rad.'
    : 'JEV confirmed the command; the target stays in place. Without confirmation for 1.6 s, the aircraft returns to the centreline.';
  $('decision-origin').textContent = jev.replay_source
    ? `REPLAY ${textoUI(jev.replay_source.cenario).toUpperCase()} / ${textoUI(jev.replay_source.evento).toUpperCase()}`
    : 'JEV / LIVE · PIPELINE 2';
  // Na prova contínua não há pausa para o PIC: a confiança da lateral é só informativa.
  $('decision-pic').textContent = `LATERAL CONFIDENCE ${decimal(jev.confidence?.manobraLateral)}`;
  delete $('decision-pic').dataset.nivel;
  mostrarRespostas(jev);
  selo(origemSelo(), `${manobraCurta(answers.manobraVertical.choice, answers.manobraLateral.choice)} · clearance ${textoUI(melhorFolga?.id ?? 'clear')}`, jev.latencia_ms, false, jev.confidence?.manobraLateral);
  $('flight-status').textContent = 'JEV chooses; the local controller executes. This is an illustrative decision-making simulation.';
}

async function processarPassoPiloto(ticket, gen) {
  const piloto = estado.piloto;
  if (!piloto) return;
  let resposta;
  try {
    if (estado.modo === 'pilot-replay') {
      const visual = ticket.entrada.geometria.obstaculos[0]?.visual ?? 'canyon';
      resposta = safeClone(selecionarRespostaReplay(piloto.replays, visual));
      await new Promise((resolve) => setTimeout(resolve, Math.max(80, Number(resposta.latencia_ms) || 400)));
    } else {
      resposta = await avaliarPassoPiloto(ticket, ticket.entrada);
    }
  } catch (erro) {
    if (gen !== estado.geracao || estado.piloto !== piloto) return;
    if (erro.codigo === 'limite') { passarAoReplay(erro.message); return; }
    const agora = performance.now();
    falharPasso(piloto.pipeline, ticket.id, erro, agora);
    // Sem backoff, um Gateway em baixo ou em 429 recebia dois pedidos a cada 400 ms.
    piloto.falhasSeguidas += 1;
    piloto.pipeline.proximoEm = Math.max(piloto.pipeline.proximoEm, agora + Math.min(8000, 400 * 2 ** piloto.falhasSeguidas));
    atualizarProvaPiloto();
    if (piloto.falhasSeguidas >= FALHAS_ATE_PARAR) {
      terminarIncompleta(`${FALHAS_ATE_PARAR} consecutive steps without a JEV response: ${erro.message}`);
      return;
    }
    $('flight-status').textContent = `No response: ${erro.message} The aircraft holds its last command while a retry is scheduled.`;
    return;
  }
  piloto.falhasSeguidas = 0;
  while (estado.pausa && gen === estado.geracao && estado.ecra === 'live' && estado.piloto === piloto) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  if (gen !== estado.geracao || estado.ecra !== 'live' || estado.piloto !== piloto) {
    piloto.pipeline.emVoo.delete(ticket.id);
    return;
  }
  const resultado = concluirPasso(
    piloto.pipeline,
    ticket.id,
    resposta,
    performance.now(),
    { separacao_min_m: null },
  );
  if (!resultado.aplicar) return;
  const alvo = ticket.entrada.geometria.obstaculos[0]?.id;
  if (alvo && !obstaculosVisiveis(piloto.percurso, piloto.automato).some((o) => o.id === alvo)) {
    // A resposta chegou depois de o avião passar o obstáculo que a motivou:
    // fica no registo, mas não comanda a geometria seguinte.
    resultado.registo.aplicar = false;
    resultado.registo.motivo = 'obstaculo_ja_ultrapassado';
    estado.log.linhas.push(resultado.registo);
    atualizarProvaPiloto();
    return;
  }
  const executouManobra = aplicarOrdemPiloto(
    piloto.controlo,
    piloto.automato,
    evasaoDeAnswers(resposta.answers),
    performance.now(),
  );
  resultado.registo.executou_manobra = executouManobra;
  if (executouManobra) {
    fecharOrdemActivaPiloto();
    piloto.ordemActiva = {
      registo: resultado.registo,
      separacaoMinM: separacaoInstantanea(piloto.percurso, piloto.automato),
    };
  }
  estado.log.linhas.push(resultado.registo);
  mostrarPassoPiloto(resultado.registo);
  atualizarProvaPiloto();
}

function quadroPiloto(t, dt) {
  const piloto = estado.piloto;
  if (!piloto || estado.pausa || estado.falha) return;
  const factor = estado.velocidade === 8 ? 1.35 : estado.velocidade === 4 ? 1.15 : 1;
  if (actualizarOrdemPiloto(piloto.controlo, piloto.automato, t)) fecharOrdemActivaPiloto();
  passoAutomato(piloto.automato, dt * factor);
  actualizarSeparacoes(piloto.percurso, piloto.automato);
  const separacaoAgora = separacaoInstantanea(piloto.percurso, piloto.automato);
  if (piloto.ordemActiva && Number.isFinite(separacaoAgora)) {
    piloto.ordemActiva.separacaoMinM = Math.min(piloto.ordemActiva.separacaoMinM ?? Infinity, separacaoAgora);
  }
  if (deveDespacharPasso(piloto.pipeline, t) && deveDespacharNoPercurso(piloto.percurso, piloto.automato)) {
    const entrada = estadoPassoPiloto(piloto.percurso, piloto.automato, piloto.base);
    const assinatura = assinaturaObstaculos(entrada.geometria.obstaculos);
    const ticket = reservarPasso(piloto.pipeline, entrada, t, assinatura);
    void processarPassoPiloto(ticket, estado.geracao);
  }
  if (percursoConcluido(piloto.percurso, piloto.automato) && piloto.pipeline.emVoo.size === 0) {
    fecharOrdemActivaPiloto();
    estado.log.resultado = 'corredor_concluido';
    estado.missao.resultado = 'corredor_concluido';
  }
}

async function iniciarPiloto() {
  const gen = ++estado.geracao;
  if (estado.pedido) estado.pedido.abort();
  for (const ctrl of estado.pedidosPiloto.values()) ctrl.abort();
  estado.pedidosPiloto.clear();
  const modo = estado.gateway ? 'pilot-live' : 'pilot-replay';
  estado.modo = modo;
  let replays = null;
  if (modo === 'pilot-replay') {
    try {
      replays = await carregarReplaysPiloto();
    } catch (e) {
      $('mode-info').textContent = e.message;
      return;
    }
  }
  if (gen !== estado.geracao) return;
  const seed = semente();
  const percurso = criarPercursoPiloto(seed);
  const pipeline = novoPipelinePiloto();
  const automato = novoAutomato();
  const controlo = novoControloPiloto();
  estado.piloto = { percurso, pipeline, automato, controlo, ordemActiva: null, pausaIniciadaEm: null, falhasSeguidas: 0, replays, base: { restricoes: configuracao() } };
  estado.missao = { resultado: null };
  estado.log = { versao: 5, fonte: modo === 'pilot-replay' ? 'jev-replay-gravado-equivalente' : 'jev-ao-vivo', modelo: 'typesafe-ai/jev', perfil: PERFIL.versao, cenario: 'corredor-piloto', semente: seed, restricoes: configuracao(), linhas: [], incompleta: false, motivo: null, resultado: null };
  estado.pausa = false; estado.espera = false; estado.falha = false; estado.velocidade = 1; estado.pedidosFeitos = 0; estado.pausaAutomatica = false;
  $('failure-overlay').hidden = true; $('pic-overlay').hidden = true; $('map-overlay').hidden = true;
  $('btn-real-map').hidden = true; $('btn-pic').hidden = true; $('pilot-proof').hidden = false;
  $('btn-pause').textContent = 'Pause'; $('btn-speed').textContent = '1× speed'; $('btn-camera').textContent = 'Camera: chase';
  $('flight-name').textContent = 'LUS-222 autonomous corridor';
  $('flight-source').textContent = modo === 'pilot-replay' ? 'RECORDED JEV REPLAY · COMPARABLE SCENARIOS' : 'LIVE JEV · 400 MS STEPS';
  $('decision-origin').textContent = modo === 'pilot-replay' ? 'JEV / RECORDED COMPARABLE SCENARIO' : 'JEV / LIVE · PIPELINE 2';
  $('event-title').textContent = 'JEV has entered the corridor.';
  $('event-desc').textContent = 'Three to five obstacles, candidate clearances and a structured decision every 400 ms.';
  selo(origemSelo(), 'Reading the corridor…', null, true);
  document.documentElement.classList.add('pilot-active');
  abrirGaveta(ecraLargo());
  mostrar('live');
  largarMundo(); await criarMundo(); if (gen !== estado.geracao) return;
  cancelAnimationFrame(estado.raf); estado.ultimoFrame = performance.now(); estado.raf = requestAnimationFrame(quadro);
}

async function processarEvento(evento, gen) {
  estado.espera = true; estado.incidentePendente = evento;
  atualizarResultadoLinha();
  const entrada = estadoParaAvaliacao(estado.missao, evento);
  $('event-title').textContent = 'JEV is assessing the situation.';
  $('event-desc').textContent = textoUI(evento.resumo);
  $('flow-input').textContent = entradaBreve(entrada);
  $('flow-choice').textContent = 'Assessing…'; $('flow-detail').textContent = '—'; $('flow-effect').textContent = '—';
  selo(origemSelo(), 'Assessing…', null, true);
  $('flight-status').textContent = ameacaIminente(evento) ? 'Imminent threat: simulation time is paused while JEV assesses the situation.' : 'Flying at 1× under the previous command while the response arrives.';
  let jev;
  try {
    if (estado.modo === 'replay') {
      jev = estado.replay.eventos[evento.id];
      if (!jev) throw new Error(`The replay does not include event ${evento.id}.`);
      if (!validarRespostas('incidente', jev.answers).ok) throw new Error('The recorded response is invalid.');
    } else jev = await avaliarJev('incidente', entrada);
  } catch (e) {
    if (gen !== estado.geracao) return;
    if (e.codigo === 'limite') passarAoReplay(e.message); else mostrarFalha(e.message);
    return;
  }
  if (gen !== estado.geracao || estado.ecra !== 'live') return;
  // Confiança < 0,5 na acção de missão: ao vivo, o relógio pára e o visitante decide.
  const rota = encaminhar(jev);
  const pic = { interveio: false, escalado: rota.nivel === 'pic', confianca: rota.confianca };
  let respostas = jev.answers;
  let fonte = estado.modo === 'replay' ? 'jev-replay' : 'jev';
  if (pic.escalado && estado.modo === 'live') {
    const escolha = await pedirDecisaoPIC(jev, rota);
    if (gen !== estado.geracao || estado.ecra !== 'live') return;
    pic.escolha = escolha.acao;
    pic.origem = escolha.origem;
    if (escolha.origem === 'visitante' && escolha.acao !== jev.answers.acaoMissao.choice) {
      respostas = respostasDoPIC(jev.answers, escolha.acao);
      fonte = 'pic-humano';
      pic.interveio = true;
    }
  } else if (pic.escalado) pic.origem = 'replay';
  const estadoAntes = safeClone(estado.missao);
  const antes = { tempoS: Math.round(estado.missao.voo.tempoS), fuelKg: Math.round(estado.missao.voo.combustivelKg), destino: estado.missao.destinoId };
  const { missao, supervisor } = aplicarDecisao(estado.missao, respostas, fonte);
  estado.missao = missao;
  // Seta branca se a manobra é do JEV, vermelha se o supervisor ou o PIC a mudaram.
  estado.autorManobra = supervisor.interveio ? 'supervisor' : pic.interveio ? 'pic' : 'jev';
  const linha = { id: evento.id, cenario: estado.cenario, resumo: evento.resumo, entrada, jev, baseline: decisaoGeometrica(entrada), supervisor, antes, depois: null, estadoAntes, estadoDepois: safeClone(missao), pic };
  estado.log.linhas.push(linha);
  // Aves, tráfego e relevo lêem-se como os balões: no máximo a 2× até a
  // ameaça mais próxima ficar para trás (os balões seguem a ameacaAtiva da simulação).
  estado.leitura = evento.tipo === 'baloes' ? null : leituraAmeaca(missao.voo, entrada.geometria.obstaculos);
  atualizarDecisao(evento, entrada, jev, supervisor, pic);
  if (estado.mundo) {
    estado.mundoApi.mostrarAmeacas(estado.mundo, entrada.geometria.obstaculos, parametrosVoo(), { escalaDistancia: 1 });
    // Enquadra avião e ameaça no momento da decisão, com a pose deste instante.
    // Decide pelo tipo do evento, como a leitura acima: uns balões ainda
    // activos não roubam o enquadramento a uma ameaça nova.
    const ameaca = estado.missao.ameacaAtiva;
    const foco = evento.tipo === 'baloes'
      ? ameaca && posicaoVisualBaloes(estado.missao.voo, ameaca, estado.mundoApi.poseLocalAgora(estado.mundo, parametrosVoo()))
      : estado.leitura ? estado.mundoApi.focoAmeaca(estado.mundo, estado.leitura.tipo) : null;
    if (foco) estado.mundoApi.focarEvento(estado.mundo, foco);
  }
  estado.incidentePendente = null; estado.espera = false;
}
/** O destino que acompanha uma acção escolhida pelo PIC. */
function destinoParaAcao(acao, preferido = null) {
  if (acao === 'regressar_base') return 'origem';
  if (acao !== 'desviar_alternativo') return estado.missao.destinoId;
  if (preferido && preferido !== 'planeado' && preferido !== 'origem') return preferido;
  return { medevac: 'hospital_alternativo', porto: 'aeroporto_alternativo' }[estado.cenario] ?? 'stol_proximo';
}
/** As respostas do JEV com a acção do PIC: o destino segue a acção e os eixos de evasão ficam. */
function respostasDoPIC(answers, acao) {
  return { ...answers, acaoMissao: { choice: acao }, destinoPreferido: { choice: destinoParaAcao(acao, answers?.destinoPreferido?.choice) } };
}
function reporOverlayPIC() {
  $('pic-kicker').textContent = 'PILOT IN COMMAND';
  $('pic-title').textContent = 'Override the decision';
  $('pic-text').textContent = 'Your intervention is labelled in the record. The supervisor still checks the calculated limits.';
  $('pic-dist').hidden = true; $('pic-countdown').hidden = true;
  $('btn-pic-apply').textContent = 'Apply override'; $('btn-pic-cancel').textContent = 'Cancel';
}
/** Abre o overlay do PIC com a distribuição da acção; resolve com a escolha e a sua origem. */
function pedirDecisaoPIC(jev, rota) {
  const acaoJev = jev.answers.acaoMissao.choice;
  return new Promise((resolve) => {
    estado.escalada = { resolve, acaoJev, fimMs: performance.now() + ESCALADA_S * 1000, contagem: ESCALADA_S, focoAnterior: document.activeElement };
    $('pic-kicker').textContent = 'JEV REQUESTS PILOT INPUT';
    $('pic-title').textContent = `Confidence ${decimal(rota.confianca)} in the mission decision`;
    $('pic-text').textContent = `JEV requests your decision. After ${ESCALADA_S} s without input, its own choice (${etiquetarAcao(acaoJev)}) is checked by the supervisor and applied.`;
    pintarPergunta($('pic-dist'), jev, 'acaoMissao');
    $('pic-dist').hidden = false; $('pic-countdown').hidden = false; $('pic-countdown').textContent = `${ESCALADA_S} s`;
    $('pic-action').value = acaoJev;
    $('btn-pic-apply').textContent = 'Apply my decision'; $('btn-pic-cancel').textContent = 'Let JEV decide';
    $('pic-overlay').hidden = false; $('pic-action').focus();
    $('flight-status').textContent = 'JEV requested pilot input: simulation time is paused for your decision.';
  });
}
function fecharEscalada(acao, origem) {
  const e = estado.escalada;
  if (!e) return;
  estado.escalada = null;
  $('pic-overlay').hidden = true;
  reporOverlayPIC();
  // O foco volta a onde estava; se esse elemento já não se vê, aos controlos do voo.
  const foco = e.focoAnterior?.isConnected && e.focoAnterior.offsetParent !== null ? e.focoAnterior : $('btn-pause');
  foco?.focus?.();
  e.resolve({ acao: acao ?? e.acaoJev, origem });
}
async function processarBriefing(gen) {
  estado.espera = true; estado.briefingPendente = true;
  const entrada = estadoParaAvaliacao(estado.missao);
  $('event-title').textContent = 'JEV is reading the briefing.';
  $('event-desc').textContent = cenarioUI(estado.cenario).descricao;
  $('flow-input').textContent = entradaBreve(entrada);
  let resposta;
  try { resposta = estado.modo === 'replay' ? estado.replay.briefing : await avaliarJev('briefing', entrada); }
  catch (e) {
    if (gen !== estado.geracao) return;
    if (e.codigo === 'limite') passarAoReplay(e.message); else mostrarFalha(e.message);
    return;
  }
  if (gen !== estado.geracao || estado.ecra !== 'live') return;
  estado.log.briefing = { entrada, resposta };
  $('event-title').textContent = 'Briefing assessed.';
  $('event-desc').textContent = 'Four JEV answers establish the initial mission assessment.';
  $('flow-choice').textContent = textoUI(resposta.answers.prioridadeOperacional.choice);
  $('flow-detail').textContent = `Cabin ${textoUI(resposta.answers.configuracaoCabine.choice)} · runway P(true) ${numero(resposta.answers.pistaAdequada.probability, 2)}`;
  $('flow-effect').textContent = 'The flight starts with your chosen state. The first event is assessed next.';
  $('decision-origin').textContent = estado.modo === 'replay' ? 'JEV / RECORDED REPLAY' : 'JEV / LIVE';
  $('decision-pic').textContent = '4 STRUCTURED ANSWERS';
  delete $('decision-pic').dataset.nivel;
  mostrarRespostas(resposta);
  selo(origemSelo(), `Briefing · ${textoUI(resposta.answers.prioridadeOperacional.choice)}`, resposta.latencia_ms, false, resposta.confidence?.prioridadeOperacional);
  $('flight-status').textContent = 'Briefing complete. The first incident is approaching.';
  estado.revelarAte = performance.now() + 1800;
  estado.briefingPendente = false; estado.espera = false;
}

/** A ameaça da leitura ficou para trás (ou acabou o tempo previsto): volta à velocidade escolhida. */
function terminarLeitura() {
  const { tipo } = estado.leitura;
  estado.leitura = null;
  if (estado.espera) return;
  $('flight-status').textContent = estado.velocidade > TECTO_LEITURA ? `Encounter complete (${textoUI(tipo)}); the mission resumes at ${estado.velocidade}×.` : `Encounter complete (${textoUI(tipo)}).`;
}

function quadro(t) {
  if (estado.ecra !== 'live' || !estado.missao) return;
  estado.raf = requestAnimationFrame(quadro);
  const dt = Math.min(.1, Math.max(0, (t - estado.ultimoFrame) / 1000)); estado.ultimoFrame = t;
  if (emModoPiloto()) {
    quadroPiloto(t, dt);
    if (t - estado.ultimoUI > 100) { atualizarTelemetria(); atualizarSom(); estado.ultimoUI = t; }
    desenharMundo(dt);
    if (estado.missao.resultado && estado.piloto.pipeline.emVoo.size === 0) abrirDebrief();
    return;
  }
  if (estado.escalada) {
    const falta = Math.max(0, Math.ceil((estado.escalada.fimMs - t) / 1000));
    // Região aria-live: só se escreve quando o segundo muda.
    if (falta !== estado.escalada.contagem) { estado.escalada.contagem = falta; $('pic-countdown').textContent = `${falta} s`; }
    if (falta <= 0) fecharEscalada(null, 'tempo_esgotado');
  }
  if (!estado.pausa && !estado.falha && !estado.escalada && !estado.missao.resultado) {
    const fator = fatorTempo({
      espera: estado.espera,
      ameacaIminente: ameacaIminente(estado.incidentePendente),
      leitura: Boolean(estado.missao.ameacaAtiva || estado.leitura),
      velocidade: estado.velocidade,
    });
    if (!estado.briefingPendente) estado.missao = avancarMissao(estado.missao, dt * fator);
    if (estado.leitura && !emLeitura(estado.leitura, estado.missao.voo)) terminarLeitura();
    if (!estado.espera && t > estado.revelarAte) {
      const evento = proximoEvento(estado.missao);
      if (evento) void processarEvento(evento, estado.geracao);
    }
  }
  if (t - estado.ultimoUI > 100) { atualizarTelemetria(); atualizarSom(); estado.ultimoUI = t; }
  desenharMundo(dt);
  if (estado.missao.resultado && !estado.espera && !estado.falha) abrirDebrief();
}

async function iniciar(modo) {
  const gen = ++estado.geracao;
  if (estado.pedido) estado.pedido.abort();
  for (const ctrl of estado.pedidosPiloto.values()) ctrl.abort();
  estado.pedidosPiloto.clear();
  estado.piloto = null;
  document.documentElement.classList.remove('pilot-active');
  estado.modo = modo; estado.replay = null;
  if (modo === 'replay') {
    try { estado.replay = await carregarReplay(estado.cenario); }
    catch (e) { $('mode-info').textContent = e.message; return; }
  }
  if (gen !== estado.geracao) return;
  const seed = modo === 'replay' ? estado.replay.semente : semente();
  const restricoes = modo === 'replay' ? estado.replay.restricoes : configuracao();
  estado.missao = criarMissao(estado.cenario, seed, restricoes);
  estado.log = { versao: 4, fonte: modo === 'replay' ? 'jev-replay-gravado' : 'jev-ao-vivo', modelo: 'typesafe-ai/jev', perfil: PERFIL.versao, cenario: estado.cenario, semente: seed, restricoes, briefing: null, linhas: [], intervencoes: [], incompleta: false, motivo: null, resultado: null };
  estado.pausa = false; estado.espera = false; estado.falha = false; estado.incidentePendente = null; estado.briefingPendente = false; estado.revelarAte = 0; estado.velocidade = 8; estado.pedidosFeitos = 0; estado.pausaAutomatica = false;
  estado.autorManobra = 'jev'; estado.marcasCache = null; estado.leitura = null;
  $('failure-overlay').hidden = true; $('pic-overlay').hidden = true; $('map-overlay').hidden = true; $('pilot-proof').hidden = true; $('btn-pic').hidden = false; $('btn-real-map').hidden = estado.cenario !== 'porto'; $('btn-pause').textContent = 'Pause'; $('btn-speed').textContent = '8× speed'; $('btn-camera').textContent = 'Camera: chase';
  $('flight-name').textContent = nomeCenario(); $('flight-source').textContent = modo === 'replay' ? 'RECORDED REPLAY · NO NEW EVALUATION' : 'JEV · LIVE AI DECISIONS';
  $('decision-origin').textContent = modo === 'replay' ? 'JEV / RECORDED REPLAY' : 'JEV / LIVE';
  selo(origemSelo(), 'Reading the briefing…', null, true);
  abrirGaveta(ecraLargo());
  mostrar('live');
  largarMundo(); await criarMundo(); if (gen !== estado.geracao) return;
  cancelAnimationFrame(estado.raf); estado.ultimoFrame = performance.now(); estado.raf = requestAnimationFrame(quadro);
  void processarBriefing(gen);
}

function resultadoTexto(r) {
  return { chegou: 'Landed at destination', regressou: 'Landed at departure', emergencia_resolvida: 'Emergency landing', combustivel_esgotado: 'Fuel exhausted', limite_altitude: 'Altitude limit reached', separacao_perdida: 'Protected separation lost', tempo_esgotado: 'Mission time expired', interrompida: 'Mission interrupted' }[r] ?? 'Mission ended';
}
function resumoDecisao(linha) {
  const a = linha.jev.answers;
  return `${etiquetarAcao(a.acaoMissao.choice)} · route ${nomeDestino(linha.supervisor.aplicada.destino)}`;
}
function elemento(tag, classe, texto) { const e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = String(texto); return e; }
function renderDebriefPiloto() {
  const log = estado.log;
  const metricasPilotoFinal = metricasPiloto(estado.piloto.pipeline, performance.now());
  const separacao = separacaoMinimaPiloto();
  $('result-title').textContent = log.incompleta ? 'Flight interrupted.' : 'Corridor completed.';
  $('result-summary').textContent = log.fonte === 'jev-ao-vivo'
    ? `${log.linhas.length} structured decisions. JEV selected the manoeuvres and the local controller turned them into lateral and altitude targets. Each live response is linked to the state that prompted it.`
    : `${log.linhas.length} replayed decisions. Responses recorded in the comparable scenarios shown below were applied to corridor states. These are recorded responses, not fresh assessments of those states.`;
  $('result-mode').textContent = log.fonte === 'jev-ao-vivo' ? '● LIVE JEV / TWO REQUESTS IN FLIGHT' : '○ RECORDED JEV REPLAY / NO NEW RESPONSES';
  const metrics = $('result-metrics'); metrics.replaceChildren();
  const itens = [
    ['Decisions', metricasPilotoFinal.decisoes],
    ['Decisions/min', metricasPilotoFinal.decisoes_por_minuto],
    ['Median latency', `${metricasPilotoFinal.latencia_mediana_ms ?? '—'} ms`],
    ['p95 latency', `${metricasPilotoFinal.latencia_p95_ms ?? '—'} ms`],
    ['Minimum separation', `${separacao == null ? '—' : numero(separacao, 1)} m`],
    ['Step', '400 ms'],
    ['Pipeline', '2 requests'],
  ];
  for (const [nome, valor] of itens) { const box = elemento('div', 'metric'); box.append(elemento('span', '', nome), elemento('strong', '', valor)); metrics.append(box); }
  const list = $('decision-list'); list.replaceChildren();
  log.linhas.forEach((row, i) => {
    const a = row.resposta.answers;
    const obstaculo = row.entrada.geometria.obstaculos[0];
    const card = elemento('details', 'decision-record'); if (i === 0) card.open = true;
    const summary = elemento('summary');
    const name = elemento('span', 'record-name', textoUI(obstaculo?.tipo ?? 'Clear corridor'));
    name.append(elemento('small', '', `${row.entrada.geometria.obstaculos.length} threats in view · separation ${row.separacao_min_m ?? '—'} m`));
    summary.append(
      elemento('span', 'record-index', String(i + 1).padStart(2, '0')),
      name,
      elemento('span', 'record-choice', `${etiquetarManobraL(a.manobraLateral.choice)} + ${etiquetarManobraV(a.manobraVertical.choice)}`),
    );
    const body = elemento('div', 'record-body');
    const left = elemento('div'); left.append(
      elemento('h3', '', 'STRUCTURED STATE'),
      elemento('p', '', entradaBreve(row.entrada)),
      elemento('p', '', `Clearances: ${row.entrada.geometria.folgas_candidatas.slice(0, 3).map((f) => `${textoUI(f.id)} ${f.folga_min_m} m`).join(' · ')}`),
    );
    const right = elemento('div'); right.append(
      elemento('h3', '', 'DECISION AND EXECUTION'),
      elemento('p', '', `${etiquetarAcao(a.acaoMissao.choice)} · ${etiquetarManobraL(a.manobraLateral.choice)} / ${etiquetarManobraV(a.manobraVertical.choice)} · ${row.latencia_ms} ms · lateral confidence ${decimal(row.resposta.confidence?.manobraLateral)}.`),
      elemento('p', '', row.executou_manobra ? 'New command: lateral and altitude targets set from this state.' : 'Command reconfirmed; the target is unchanged.'),
      elemento('p', '', row.resposta.replay_source
        ? `Replay from ${textoUI(row.resposta.replay_source.cenario)} / ${textoUI(row.resposta.replay_source.evento)}, recorded ${row.resposta.replay_source.gravado_em ?? 'date unavailable'}; applied to this state.`
        : 'Manoeuvre applied by the local controller; the live response is linked to its input state.'),
    );
    body.append(left, right); card.append(summary, body); list.append(card);
  });
  $('btn-lab').disabled = true;
  $('btn-lab-open').disabled = true;
  $('lab-overlay').hidden = true;
}
function textoEscalada(pic) {
  const inicio = `JEV requested pilot input (confidence ${decimal(pic.confianca)}):`;
  if (pic.origem === 'visitante') return `${inicio} the pilot chose ${etiquetarAcao(pic.escolha)}.`;
  if (pic.origem === 'jev') return `${inicio} the pilot let JEV decide.`;
  if (pic.origem === 'tempo_esgotado') return `${inicio} no input within ${ESCALADA_S} s; the JEV decision was applied.`;
  return `${inicio} the replay applied the recorded decision.`;
}
function renderDebrief() {
  if (emModoPiloto()) { renderDebriefPiloto(); return; }
  const m = estado.missao, log = estado.log, stats = resumirLinhas(log.linhas);
  $('result-title').textContent = log.incompleta ? 'Mission incomplete.' : resultadoTexto(log.resultado) + '.';
  $('result-summary').textContent = log.incompleta ? log.motivo : `${log.linhas.length} ${log.linhas.length === 1 ? 'decision assessed' : 'decisions assessed'}. The flight ended at ${nomeDestino(m.destinoId)} with ${Math.round(m.voo.combustivelKg)} kg of fuel. Each decision below retains its original input and response.`;
  $('result-mode').textContent = log.fonte === 'jev-ao-vivo' ? '● JEV / LIVE AI DECISIONS' : '○ RECORDED REPLAY / NO NEW JEV RESPONSES';
  const metrics = $('result-metrics'); metrics.replaceChildren();
  const itens = [['Decisions', stats.total], ['Actions matched', stats.acoesConformes], ['Incompatible destinations', stats.destinosIncompativeis], ['Manoeuvres matched', stats.manobrasConformes], ['Limit interventions', stats.limitesBloqueados], ['Pilot requests matched', stats.picConforme], ['Extra pilot requests', stats.picExcessivo]];
  for (const [nome, valor] of itens) { const box = elemento('div', 'metric'); box.append(elemento('span', '', nome), elemento('strong', '', valor)); metrics.append(box); }
  const list = $('decision-list'); list.replaceChildren();
  if (log.briefing) {
    const b = log.briefing.resposta.answers;
    const card = elemento('details', 'decision-record');
    const sum = elemento('summary'); sum.append(elemento('span', 'record-index', '00'), elemento('span', 'record-name', 'Briefing · priority, cabin, runway and fuel'), elemento('span', 'record-choice', textoUI(b.prioridadeOperacional.choice)));
    const body = elemento('div', 'record-body'); body.append(elemento('p', '', `Cabin: ${textoUI(b.configuracaoCabine.choice)} · P(runway suitable): ${numero(b.pistaAdequada.probability, 2)} · P(fuel sufficient): ${numero(b.combustivelSuficiente.probability, 2)}`)); card.append(sum, body); list.append(card);
  }
  log.linhas.forEach((l, i) => {
    const a = avaliarLinha(l);
    const card = elemento('details', 'decision-record'); if (i === 0) card.open = true;
    const summary = elemento('summary'); const name = elemento('span', 'record-name', textoUI(l.resumo)); name.append(elemento('small', '', a.alertas.length ? a.alertas.map(textoUI).join(' ') : 'No supervisor intervention'));
    summary.append(elemento('span', 'record-index', String(i + 1).padStart(2, '0')), name, elemento('span', 'record-choice', resumoDecisao(l)));
    const body = elemento('div', 'record-body');
    const left = elemento('div'); left.append(elemento('h3', '', 'INPUT AND JEV'), elemento('p', '', entradaBreve(l.entrada)), elemento('p', '', `Action: ${etiquetarAcao(l.jev.answers.acaoMissao.choice)} · confidence ${decimal(l.jev.confidence?.acaoMissao)} (${ROTULO_NIVEL[encaminhar(l.jev).nivel]}) · diversion destination: ${etiquetarDestino(l.jev.answers.destinoPreferido.choice)}`), elemento('p', '', `Axes: ${etiquetarManobraV(l.jev.answers.manobraVertical.choice)} / ${etiquetarManobraL(l.jev.answers.manobraLateral.choice)} · outside envelope P(yes): ${numero(l.jev.answers.precisaRevisaoPIC.probability, 2)}`));
    const right = elemento('div'); right.append(elemento('h3', '', 'ASSESSMENT AND OUTCOME'), elemento('p', '', `Action ${textoUI(a.acao)}; destination ${textoUI(a.destino)}; manoeuvre ${textoUI(a.manobra)}.`), elemento('p', '', `Limited geometry rule: ${etiquetarAcao(l.baseline.acaoMissao.choice)}. Supervisor: ${textoUI(a.limites)}.`), elemento('p', '', `Fuel ${l.antes.fuelKg} → ${l.depois?.fuelKg ?? '—'} kg. Route ${nomeDestino(l.antes.destino)} → ${nomeDestino(l.depois?.destino) ?? '—'}.`));
    const separacao = l.depois?.separacoes?.find((s) => s.id === l.id);
    if (separacao) right.append(elemento('p', '', `Measured minimum separation: ${separacao.minimaM} m; illustrative protection radius: ${separacao.limiteM} m.`));
    if (l.pic?.escalado) right.append(elemento('p', '', textoEscalada(l.pic)));
    if (a.alertas.length) right.append(elemento('p', 'record-alert', a.alertas.map(textoUI).join(' ')));
    body.append(left, right); card.append(summary, body); list.append(card);
  });
  const select = $('lab-event'); select.replaceChildren();
  log.linhas.forEach((l, i) => { const opt = document.createElement('option'); opt.value = String(i); opt.textContent = `${i + 1}. ${textoUI(l.id)}`; select.append(opt); });
  $('btn-lab').disabled = !estado.gateway || !log.linhas.length;
  $('btn-lab-open').disabled = !log.linhas.length;
  $('lab-overlay').hidden = true;
  $('lab-result').replaceChildren();
}
function cancelarPedidos() {
  fecharEscalada(null, 'cancelada');
  if (estado.pedido) estado.pedido.abort();
  for (const ctrl of estado.pedidosPiloto.values()) ctrl.abort();
  estado.pedidosPiloto.clear();
}
function abrirDebrief() {
  if (estado.ecra !== 'live') return;
  // Pedidos ainda em voo continuariam a gastar o Gateway depois do fim.
  cancelarPedidos(); ++estado.geracao;
  estado.leitura = null;
  if (emModoPiloto()) fecharOrdemActivaPiloto();
  else atualizarResultadoLinha();
  estado.log.resultado = estado.missao.resultado;
  cancelAnimationFrame(estado.raf); largarMundo(); $('map-overlay').hidden = true;
  som.suspender();
  renderDebrief(); mostrar('debrief');
}
function terminarIncompleta(motivo) {
  if (!estado.missao) return;
  estado.log.incompleta = true; estado.log.motivo = motivo;
  estado.missao = { ...estado.missao, resultado: 'interrompida' }; estado.leitura = null;
  abrirDebrief();
}
async function reavaliar() {
  const linha = estado.log.linhas[Number($('lab-event').value)]; if (!linha || !estado.gateway) return;
  const campo = $('lab-variable').value, valor = Number($('lab-value').value);
  if (!Number.isFinite(valor)) { $('lab-result').textContent = 'Enter a valid number.'; return; }
  const entrada = safeClone(linha.entrada);
  const copia = safeClone(linha.estadoAntes);
  const anterior = campo === 'vento_kt' ? entrada.ambiente.vento_kt : campo === 'payload_kg' ? entrada.aeronave.payload_kg : campo === 'comprimento_pista_m' ? entrada.ambiente.comprimento_pista_m : entrada.missao.relogio_s;
  if (campo === 'vento_kt') {
    entrada.ambiente.vento_kt = Math.max(0, Math.min(80, valor));
    copia.ambiente.ventoMs = { x: 0, z: -entrada.ambiente.vento_kt / 1.94384 };
  } else if (campo === 'payload_kg') {
    entrada.aeronave.payload_kg = Math.max(0, Math.min(2700, valor));
    copia.voo.payloadKg = entrada.aeronave.payload_kg;
    copia.voo.massaKg = PERFIL.massaVaziaKg + copia.voo.combustivelKg + copia.voo.payloadKg;
  } else if (campo === 'comprimento_pista_m') {
    entrada.ambiente.comprimento_pista_m = Math.max(0, Math.min(4000, valor));
    copia.destinos.find((d) => d.id === copia.destinoId).pistaM = entrada.ambiente.comprimento_pista_m;
  } else entrada.missao.relogio_s = Math.max(0, Math.min(20000, valor));
  entrada.alternativas = copia.destinos.map((d) => ({ id: d.id, tipo: d.tipo, distancia_km: Math.round(Math.hypot(d.xM - copia.voo.xM, d.zM - copia.voo.zM) / 1000), pista_m: d.pistaM, superficie: d.superficie, pista_necessaria_m: pistaNecessariaM(copia, d), combustivel_necessario_kg: combustivelNecessarioKg(copia, d) }));
  $('btn-lab').disabled = true; $('lab-result').textContent = 'Requesting a new JEV assessment…';
  try {
    const nova = await avaliarJev('incidente', entrada);
    const aplicada = aplicarDecisao(copia, nova.answers);
    const avaliacao = avaliarLinha({ ...linha, entrada, jev: nova, supervisor: aplicada.supervisor });
    const host = $('lab-result'); host.replaceChildren();
    const box = elemento('div', 'lab-compare');
    const antigo = elemento('div', 'lab-side');
    antigo.append(elemento('small', '', `ORIGINAL · ${anterior}`), elemento('strong', '', resumoDecisao(linha)), elemento('p', '', `Manoeuvre ${textoUI(linha.jev.answers.manobraVertical.choice)} / ${textoUI(linha.jev.answers.manobraLateral.choice)} · confidence ${decimal(linha.jev.confidence?.acaoMissao)} (${ROTULO_NIVEL[encaminhar(linha.jev).nivel]})`));
    const novo = elemento('div', 'lab-side');
    novo.append(elemento('small', '', `CHANGED · ${valor}`), elemento('strong', '', `${etiquetarAcao(nova.answers.acaoMissao.choice)} · route ${nomeDestino(aplicada.supervisor.aplicada.destino)}`), elemento('p', '', `Diversion destination: ${etiquetarDestino(nova.answers.destinoPreferido.choice)}. Manoeuvre ${textoUI(nova.answers.manobraVertical.choice)} / ${textoUI(nova.answers.manobraLateral.choice)} · confidence ${decimal(nova.confidence?.acaoMissao)} (${ROTULO_NIVEL[encaminhar(nova).nivel]})`));
    if (avaliacao.alertas.length) novo.append(elemento('p', 'record-alert', avaliacao.alertas.map(textoUI).join(' ')));
    box.append(elemento('p', 'lab-delta', `Variable: ${textoUI(campo)}`), antigo, novo);
    host.append(box);
    estado.log.contrafactuais ??= []; estado.log.contrafactuais.push({ evento: linha.id, variavel: campo, anterior, novo: valor, entrada, resposta: nova });
  } catch (e) { $('lab-result').textContent = e.message; }
  finally { $('btn-lab').disabled = false; }
}
function descarregar() {
  const blob = new Blob([JSON.stringify(estado.log, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `jev-${estado.cenario}-${estado.log.semente}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function sair() {
  cancelarPedidos();
  ++estado.geracao; cancelAnimationFrame(estado.raf); largarMundo(); som.suspender(); estado.missao = null; estado.log = null; mostrar('commander');
  estado.piloto = null; document.documentElement.classList.remove('pilot-active'); $('pilot-proof').hidden = true; $('btn-pic').hidden = false;
}
// Simulador: ecrã próprio, o mesmo som e o mesmo mundo 3D (carregado a pedido).
const simulador = criarSimuladorUI({
  som,
  mostrar,
  aoSair: () => mostrar('splash'),
  gatewayDisponivel: () => estado.gateway,
  carregarMundo: async () => {
    if (new URLSearchParams(location.search).has('sem-webgl')) throw new Error('WebGL disabled for verification');
    const api = await import('./world.js');
    if (!api.webglDisponivel()) throw new Error('WebGL unavailable');
    return api;
  },
});

function ligarUI() {
  criarCartoes(); void sondarGateway();
  // O voo abre com o humano aos comandos. A IA é uma escolha explícita.
  // ?voo=gravado força o voo gravado (sempre igual e sem custo, para vídeo)
  // e ?desde=110 começa-o nesse segundo (a Foz), já com tudo o que aconteceu antes.
  const parametros = new URLSearchParams(location.search);
  const forcarGravado = parametros.get('voo') === 'gravado';
  const desdeS = Math.max(0, Number(parametros.get('desde')) || 0);
  $('btn-sim-abrir').addEventListener('click', () => { simulador.ligarSom(); void simulador.iniciar({ piloto: forcarGravado ? 'jev-gravado' : 'humano', desdeS }); });
  $('btn-open').addEventListener('click', () => mostrar('commander'));
  $('btn-home').addEventListener('click', () => mostrar('splash'));
  $('btn-launch').addEventListener('click', () => { if (!estado.gateway) return; ligarSom(); void iniciar('live'); });
  $('btn-replay').addEventListener('click', () => { ligarSom(); void iniciar('replay'); });
  $('btn-pilot').addEventListener('click', () => { ligarSom(); void iniciarPiloto(); });
  $('btn-som').setAttribute('aria-pressed', String(preferenciaSom()));
  $('btn-som').addEventListener('click', () => {
    const ligar = $('btn-som').getAttribute('aria-pressed') !== 'true';
    definirSom(ligar);
    if (ligar && estado.ecra === 'live') som.ligar();
  });
  // Separador escondido: o rAF pára, o motor cala-se e o voo entra em pausa
  // (nada de pedidos ao Gateway em segundo plano); ao voltar, retoma sozinho.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      som.suspender();
      estado.escondidoEm = performance.now();
      if (estado.ecra === 'live' && !estado.pausa) { definirPausa(true); estado.pausaAutomatica = true; }
      return;
    }
    // O tempo do PIC não corre com o separador escondido.
    if (estado.escalada && estado.escondidoEm != null) estado.escalada.fimMs += performance.now() - estado.escondidoEm;
    estado.escondidoEm = null;
    if (estado.pausaAutomatica) { estado.pausaAutomatica = false; definirPausa(false); }
  });
  $('btn-exit').addEventListener('click', () => terminarIncompleta('The pilot ended the mission before completion.'));
  $('btn-pause').addEventListener('click', () => { definirPausa(!estado.pausa); atualizarTelemetria(); });
  $('btn-speed').addEventListener('click', () => { estado.velocidade = estado.velocidade === 8 ? 1 : estado.velocidade === 1 ? 4 : 8; $('btn-speed').textContent = `${estado.velocidade}× speed`; });
  $('btn-camera').addEventListener('click', () => {
    if (!estado.mundo) return;
    const modo = estado.mundoApi.alternarCamara(estado.mundo);
    $('btn-camera').textContent = `Camera: ${textoUI(modo)}`;
  });
  $('btn-pic').addEventListener('click', () => { if (estado.escalada) return; estado.pausa = true; $('btn-pause').textContent = 'Resume'; $('pic-overlay').hidden = false; });
  const abrirMapa = (origem) => {
    estado.mapaOrigem = origem;
    if (estado.ecra === 'live') {
      estado.pausaAntesMapa = estado.pausa;
      estado.pausa = true;
      $('btn-pause').textContent = 'Resume';
    }
    const frame = $('map-overlay').querySelector('iframe');
    if (!frame.src) frame.src = frame.dataset.src;
    $('map-overlay').hidden = false;
    $('btn-map-close').focus();
  };
  $('btn-real-map').addEventListener('click', () => abrirMapa($('btn-real-map')));
  $('btn-setup-map').addEventListener('click', () => abrirMapa($('btn-setup-map')));
  $('btn-map-close').addEventListener('click', () => {
    $('map-overlay').hidden = true;
    if (estado.ecra === 'live') {
      estado.pausa = estado.pausaAntesMapa;
      $('btn-pause').textContent = estado.pausa ? 'Resume' : 'Pause';
    }
    estado.mapaOrigem?.focus();
  });
  $('btn-drawer').addEventListener('click', () => abrirGaveta(!$('decision-panel').classList.contains('is-open')));
  $('btn-lab-open').addEventListener('click', () => { $('lab-overlay').hidden = false; $('lab-event').focus(); });
  $('btn-lab-close').addEventListener('click', () => { $('lab-overlay').hidden = true; $('btn-lab-open').focus(); });
  $('btn-pic-cancel').addEventListener('click', () => { if (estado.escalada) { fecharEscalada(null, 'jev'); return; } $('pic-overlay').hidden = true; estado.pausa = false; $('btn-pause').textContent = 'Pause'; });
  $('btn-pic-apply').addEventListener('click', () => {
    if (estado.escalada) { fecharEscalada($('pic-action').value, 'visitante'); return; }
    const acao = $('pic-action').value;
    const original = estado.log.linhas.at(-1)?.jev.answers;
    const respostas = { ...(original ?? {}), acaoMissao: { choice: acao }, destinoPreferido: { choice: destinoParaAcao(acao) }, manobraVertical: { choice: 'manter' }, manobraLateral: { choice: 'manter' }, urgencia: { score: 1 } };
    const { missao, supervisor } = aplicarDecisao(estado.missao, respostas, 'pic-humano', false); estado.missao = missao; estado.autorManobra = 'pic';
    estado.log.intervencoes.push({ tempoS: missao.voo.tempoS, acao, supervisor });
    const ultima = estado.log.linhas.at(-1); if (ultima) ultima.pic.interveio = true;
    $('flow-effect').textContent = supervisor.interveio ? `Pilot requested ${etiquetarAcao(acao)}; supervisor blocked: ${textoUI(supervisor.motivo)}.` : `Pilot override: ${etiquetarAcao(acao)}. New route ${nomeDestino(missao.destinoId)}.`;
    $('decision-origin').textContent = supervisor.interveio ? 'PIC + SUPERVISOR' : 'HUMAN PILOT OVERRIDE';
    selo(supervisor.interveio ? 'PIC + SUPERVISOR' : 'HUMAN PILOT OVERRIDE', etiquetarAcao(supervisor.interveio ? supervisor.aplicada.acao : acao), null);
    $('pic-overlay').hidden = true; estado.pausa = false; $('btn-pause').textContent = 'Pause';
  });
  $('btn-retry').addEventListener('click', () => { $('failure-overlay').hidden = true; estado.falha = false; if (estado.briefingPendente) void processarBriefing(estado.geracao); else if (estado.incidentePendente) void processarEvento(estado.incidentePendente, estado.geracao); });
  $('btn-incomplete').addEventListener('click', () => terminarIncompleta($('failure-reason').textContent));
  $('btn-new').addEventListener('click', sair);
  $('btn-download').addEventListener('click', descarregar);
  $('btn-lab').addEventListener('click', () => void reavaliar());
  $('lab-variable').addEventListener('change', () => { const valores = { vento_kt: 40, payload_kg: 2600, comprimento_pista_m: 520, relogio_s: 480 }; $('lab-value').value = valores[$('lab-variable').value]; });
  addEventListener('resize', ajustarMundo);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('map-overlay').hidden) { $('btn-map-close').click(); return; } if (e.key === 'Escape' && !$('lab-overlay').hidden) { $('btn-lab-close').click(); return; } if (estado.ecra !== 'live') return; if (e.key === 'Escape' && !$('pic-overlay').hidden) { $('btn-pic-cancel').click(); } else if (e.key === 'Escape' && $('failure-overlay').hidden) { e.preventDefault(); $('btn-pause').click(); } });
}
ligarUI();
