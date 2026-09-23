import { CENARIOS_SIM, PERFIL, criarMissao, avancarMissao, aplicarDecisao, proximoEvento, estadoParaAvaliacao, combustivelNecessarioKg, pistaNecessariaM } from './simulacao.js';
import { validarRespostas } from './contrato-jev.js';
import { avaliarLinha, resumirLinhas } from './avaliacao-sim.js';
import { decisaoGeometrica, etiquetarAcao, etiquetarDestino, etiquetarManobraV, etiquetarManobraL } from './decisao.js';

const $ = (id) => document.getElementById(id);
const LABEL_DESTINO = { planeado: 'Destino planeado', origem: 'Origem', hospital_alternativo: 'Hospital alternativo', aeroporto_alternativo: 'Aeroporto alternativo', stol_proximo: 'Pista STOL próxima' };
const QUESTOES = { configuracaoCabine: 'Cabine', prioridadeOperacional: 'Prioridade', pistaAdequada: 'Pista adequada', combustivelSuficiente: 'Combustível suficiente', acaoMissao: 'Ação de missão', manobraVertical: 'Vertical', manobraLateral: 'Lateral', destinoPreferido: 'Destino se mudar rota', urgencia: 'Urgência', riscoMeteorologico: 'Risco meteorológico', precisaRevisaoPIC: 'Revisão PIC', continuarVoo: 'Continuar voo' };
const estado = { ecra: 'splash', gateway: false, cenario: 'porto', modo: null, missao: null, log: null, replay: null, mundo: null, mundoApi: null, raf: 0, ultimoFrame: 0, ultimoUI: 0, pausa: false, espera: false, falha: false, incidentePendente: null, briefingPendente: false, revelarAte: 0, velocidade: 8, pedido: null, geracao: 0 };

function mostrar(nome) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${nome}`));
  estado.ecra = nome;
  document.documentElement.classList.toggle('flight-active', nome === 'live');
  window.scrollTo(0, 0);
}
function numero(n, casas = 0) { return Number.isFinite(Number(n)) ? Number(n).toFixed(casas) : '—'; }
function tempo(n) { return `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`; }
function safeClone(v) { return structuredClone(v); }
function nomeCenario() { return CENARIOS_SIM[estado.cenario]?.nome ?? 'Missão'; }
function nomeDestino(id) { return id === 'planeado' && estado.cenario === 'porto' ? 'Francisco Sá Carneiro' : LABEL_DESTINO[id] ?? id; }

async function sondarGateway() {
  try {
    const r = await fetch('/api/jev', { cache: 'no-store' });
    const d = await r.json();
    estado.gateway = Boolean(d.gateway_configurado);
  } catch { estado.gateway = false; }
  $('gateway-status').textContent = estado.gateway ? '● AI Gateway ligado · JEV ao vivo' : '○ Gateway indisponível · replay disponível';
  $('mode-info').textContent = estado.gateway ? 'JEV ao vivo disponível. O replay também pode ser explorado.' : 'Sem Gateway: explora um replay gravado, identificado em todo o percurso.';
  $('btn-launch').disabled = !estado.gateway;
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
    const cat = document.createElement('span'); cat.textContent = id === 'porto' ? 'DESTAQUE / SÃO JOÃO' : id === 'medevac' ? 'MEDEVAC / AÇORES' : id === 'carga' ? 'CARGA / ALENTEJO' : 'SAR / COSTA';
    const num = document.createElement('span'); num.textContent = nums[id]; art.append(cat, num);
    const body = document.createElement('div'); body.className = 'mission-body';
    const h = document.createElement('h2'); h.textContent = c.nome;
    const p = document.createElement('p'); p.textContent = c.descricao;
    const thesis = document.createElement('span'); thesis.className = 'mission-thesis'; thesis.textContent = c.subtitulo;
    body.append(h, p, thesis); b.append(art, body);
    b.addEventListener('click', () => { estado.cenario = id; $('input-payload').value = c.payloadKg; criarCartoes(); });
    host.append(b);
  }
  $('btn-setup-map').hidden = estado.cenario !== 'porto';
}

function ecraLargo() { return matchMedia('(min-width: 761px)').matches; }
function abrirGaveta(aberta) {
  $('decision-panel').classList.toggle('is-open', aberta);
  $('btn-drawer').setAttribute('aria-expanded', String(aberta));
}
function manobraCurta(vertical, lateral) {
  const partes = [lateral && lateral !== 'manter' ? etiquetarManobraL(lateral) : null, vertical && vertical !== 'manter' ? etiquetarManobraV(vertical) : null].filter(Boolean);
  return partes.length ? partes.join(' + ') : 'eixos mantidos';
}
function selo(origem, escolha, ms, aEsperar = false) {
  $('seal-source').textContent = origem;
  $('seal-choice').textContent = escolha;
  $('seal-ms').textContent = Number.isFinite(ms) ? `${Math.round(ms)} ms${estado.modo === 'replay' ? ' · gravados' : ''}` : '— ms';
  $('flight-seal').classList.toggle('is-waiting', aEsperar);
}
function origemSelo() { return estado.modo === 'replay' ? 'JEV / REPLAY GRAVADO' : 'JEV / AO VIVO'; }

function configuracao() { return { payload_kg: Number($('input-payload').value), risco_maximo: $('select-risk').value, preferir_stol: $('check-stol').checked, nunca_desviar: $('check-no-divert').checked }; }
function semente() { return Math.min(999999999, Math.max(1, Number($('input-seed').value) || 222)); }

async function avaliarJev(momento, entrada) {
  const ctrl = new AbortController(); estado.pedido = ctrl;
  const timeout = setTimeout(() => ctrl.abort(), 13000);
  try {
    const r = await fetch('/api/jev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ momento, estado: entrada }), signal: ctrl.signal });
    const d = await r.json();
    if (!r.ok || d.fonte !== 'jev') throw new Error(d.mensagem || 'O JEV não respondeu.');
    const c = validarRespostas(momento, d.answers);
    if (!c.ok) throw new Error(`Contrato JEV inválido: ${c.erro}`);
    return d;
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'O pedido excedeu o tempo disponível.' : e.message, { cause: e }); }
  finally { clearTimeout(timeout); if (estado.pedido === ctrl) estado.pedido = null; }
}

async function carregarReplay(id) {
  const r = await fetch(`./replays/${id}.json`, { cache: 'no-store' });
  if (!r.ok) throw new Error('Não existe replay gravado para este cenário.');
  const data = await r.json();
  if (data.cenario !== id || data.perfil !== PERFIL.versao || !data.briefing || !data.eventos) throw new Error('O replay não corresponde à versão actual da simulação.');
  const b = validarRespostas('briefing', data.briefing.answers);
  if (!b.ok) throw new Error('O briefing gravado está incompleto.');
  return data;
}

function parametrosVoo() {
  const v = estado.missao.voo;
  return { x: v.xM / 210, y: v.altitudeM / 11.5, z: (v.zM - 25000) / 210, heading: v.rumoRad, bank: -v.bankRad, pitch: -v.pitchRad, hélice: v.tempoS * 16, dodge: v.tempoS < estado.missao.comando.evasaoAteS };
}
async function criarMundo() {
  try {
    if (new URLSearchParams(location.search).has('sem-webgl')) throw new Error('Modo de verificação sem WebGL');
    const api = await import('./world.js');
    if (!api.webglDisponivel()) throw new Error('WebGL indisponível');
    estado.mundoApi = api;
    estado.mundo = api.criarCena($('flight-canvas'), { leve: api.perfilGraficoLeve(), cenario: estado.cenario, pose: parametrosVoo() });
    ajustarMundo();
  } catch {
    estado.mundo = null;
    estado.mundoApi = null;
    $('flight-canvas').style.background = 'linear-gradient(155deg,#090b0e,#20262c 55%,#454d55)';
    $('flight-status').textContent = 'Visualização 2D. A missão e o JEV continuam.';
  }
}
function ajustarMundo() {
  if (!estado.mundo) return;
  const r = $('flight-canvas').getBoundingClientRect();
  if (r.width > 1 && r.height > 1) estado.mundoApi.redimensionar(estado.mundo, Math.round(r.width), Math.round(r.height));
}
function largarMundo() {
  if (estado.mundo?.renderer) estado.mundo.renderer.dispose();
  estado.mundo = null; estado.mundoApi = null;
}
function desenharMundo(dt) {
  if (!estado.mundo) return;
  const api = estado.mundoApi;
  try {
    const pose = api.recentrarOrigem(estado.mundo, parametrosVoo());
    api.aplicarPose(estado.mundo, pose);
    api.posicionarBaloes(estado.mundo, estado.missao.ameacaAtiva, estado.missao.voo, pose);
    api.actualizarAmeacas(estado.mundo, dt);
    api.actualizarCamara(estado.mundo, pose, dt);
    estado.mundo.renderer.render(estado.mundo.scene, estado.mundo.camera);
  } catch { /* falha visual não altera a decisão */ }
}

function mostrarRespostas(answers) {
  const host = $('typed-answers'); host.replaceChildren();
  for (const [key, value] of Object.entries(answers ?? {})) {
    const row = document.createElement('div'); row.className = 'typed-row';
    const label = document.createElement('span'); label.textContent = QUESTOES[key] ?? key;
    const v = document.createElement('b');
    const choice = value?.choice ?? (Number.isFinite(value?.score) ? `Score ${numero(value.score, 2)}/3` : Number.isFinite(value?.probability) ? `P(true) ${numero(value.probability, 2)}` : '—');
    const p = value?.probabilities?.[value.choice];
    v.textContent = p == null ? String(choice) : `${choice} · ${Math.round(p * 100)}%`;
    row.append(label, v); host.append(row);
  }
}
function entradaBreve(entrada) {
  const obstaculo = entrada.geometria.obstaculos[0];
  if (obstaculo) return `${obstaculo.tipo} · ${obstaculo.distancia_m} m · ${obstaculo.segundos_ate_ao_contacto} s`;
  return `${entrada.ambiente.tecto_ft} ft teto · ${entrada.ambiente.vento_kt} kt vento · ${entrada.aeronave.fuel_kg} kg fuel`;
}
function atualizarDecisao(evento, entrada, jev, supervisor) {
  $('event-number').textContent = String(estado.log.linhas.length).padStart(2, '0');
  $('event-title').textContent = evento.tipo === 'baloes' ? 'Balões na aproximação.' : evento.tipo === 'aproximacao' ? 'Pista à vista.' : evento.tipo === 'meteorologia' ? 'O tempo mudou.' : evento.tipo === 'relevo' ? 'Obstáculo na rota.' : evento.tipo === 'aves' ? 'Aves à frente.' : evento.tipo === 'trafego' ? 'Tráfego no sector.' : evento.tipo === 'combustivel' ? 'Reserva em risco.' : 'É preciso decidir.';
  $('event-desc').textContent = evento.resumo;
  $('flow-input').textContent = entradaBreve(entrada);
  $('flow-choice').textContent = etiquetarAcao(jev.answers.acaoMissao.choice);
  $('flow-detail').textContent = `Rota: ${nomeDestino(supervisor.aplicada.destino)} · ${etiquetarManobraV(supervisor.aplicada.vertical)} / ${etiquetarManobraL(supervisor.aplicada.lateral)}`;
  const alvo = estado.missao.destinos.find((d) => d.id === estado.missao.destinoId);
  const distancia = Math.round(Math.hypot(estado.missao.voo.xM - alvo.xM, estado.missao.voo.zM - alvo.zM) / 1000);
  const reserva = Math.round(estado.missao.voo.combustivelKg - combustivelNecessarioKg(estado.missao, alvo));
  $('flow-effect').textContent = supervisor.interveio ? `Supervisor: ${supervisor.motivo}. ${nomeDestino(estado.missao.destinoId)} · ${distancia} km · reserva ${reserva} kg.` : supervisor.separacaoPrevistaM != null ? `Balões: separação prevista ${supervisor.separacaoPrevistaM} m (mínimo ilustrativo 36 m). Passagem ainda por confirmar.` : estado.missao.fase === 'orbita' ? `Órbita por 90 s; ${distancia} km restantes e reserva ${reserva} kg.` : `${nomeDestino(estado.missao.destinoId)} · ${distancia} km restantes · reserva calculada ${reserva} kg.`;
  $('decision-origin').textContent = supervisor.interveio ? 'SUPERVISOR INTERVEIO' : estado.modo === 'replay' ? 'JEV / REPLAY GRAVADO' : 'JEV / AO VIVO';
  $('decision-pic').textContent = Number(jev.answers.precisaRevisaoPIC.probability) >= .55 ? 'JEV SUGERE REVISÃO PIC' : 'SEM REVISÃO SUGERIDA';
  mostrarRespostas(jev.answers);
  selo(supervisor.interveio ? 'SUPERVISOR INTERVEIO' : origemSelo(), `${etiquetarAcao(supervisor.aplicada.acao ?? jev.answers.acaoMissao.choice)} · ${manobraCurta(supervisor.aplicada.vertical, supervisor.aplicada.lateral)}`, jev.latencia_ms);
  $('flight-status').textContent = evento.tipo === 'baloes' ? 'Passagem apresentada a 2×; balões ampliados para leitura, separação calculada em metros.' : supervisor.interveio ? 'A escolha do JEV foi bloqueada; o supervisor protege a trajetória.' : 'Decisão aplicada à missão e ao voo.';
}
function atualizarTelemetria() {
  if (!estado.missao) return;
  const m = estado.missao, v = m.voo, d = m.destinos.find((x) => x.id === m.destinoId);
  const restante = Math.hypot(v.xM - d.xM, v.zM - d.zM);
  $('flight-phase').textContent = m.fase.replaceAll('_', ' ') + (estado.pausa ? ' · pausa' : m.ameacaAtiva && estado.velocidade > 2 ? ' · 2× balões' : '');
  $('tel-speed').textContent = Math.round(v.velocidadeMs * 1.94384);
  $('tel-alt').textContent = Math.round(v.altitudeM * 3.28084).toLocaleString('pt-PT');
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
  $('map-caption').textContent = `${Math.round(restante / 1000)} km · reserva estimada ${Math.round(v.combustivelKg - combustivelNecessarioKg(m, d))} kg`;
  const baloes = m.separacoes.find((s) => s.id === 'baloes');
  if (baloes && estado.log?.linhas.at(-1)?.id === 'baloes') {
    $('flow-effect').textContent = `Passagem confirmada: separação mínima ${baloes.minimaM} m (mínimo ilustrativo ${baloes.limiteM} m). ${nomeDestino(m.destinoId)} permanece na rota.`;
    $('flight-status').textContent = 'Separação calculada a partir da trajetória simulada; ícones dos balões ampliados para leitura.';
  }
}
function atualizarResultadoLinha() {
  const ultima = estado.log?.linhas.at(-1);
  if (ultima) ultima.depois = { tempoS: Math.round(estado.missao.voo.tempoS), fuelKg: Math.round(estado.missao.voo.combustivelKg), destino: estado.missao.destinoId, distanciaM: Math.round(estado.missao.voo.distanciaPercorridaM), separacoes: safeClone(estado.missao.separacoes) };
}
function mostrarFalha(mensagem) {
  estado.falha = true; estado.espera = false;
  $('failure-reason').textContent = mensagem;
  $('failure-overlay').hidden = false;
  $('flight-status').textContent = 'Simulação pausada. A comparação ao vivo fica incompleta se terminares.';
}
async function processarEvento(evento, gen) {
  estado.espera = true; estado.incidentePendente = evento;
  atualizarResultadoLinha();
  const entrada = estadoParaAvaliacao(estado.missao, evento);
  $('event-title').textContent = 'O JEV está a avaliar.';
  $('event-desc').textContent = evento.resumo;
  $('flow-input').textContent = entradaBreve(entrada);
  $('flow-choice').textContent = 'A avaliar…'; $('flow-detail').textContent = '—'; $('flow-effect').textContent = '—';
  selo(origemSelo(), 'A avaliar…', null, true);
  $('flight-status').textContent = evento.obstaculos?.some((o) => o.segundos_ate_ao_contacto <= 15) ? 'Ameaça iminente: relógio simulado suspenso enquanto o JEV avalia.' : 'Voo a 1× sob a intenção anterior enquanto chega a resposta.';
  let jev;
  try {
    if (estado.modo === 'replay') {
      jev = estado.replay.eventos[evento.id];
      if (!jev) throw new Error(`O replay não inclui o evento ${evento.id}.`);
      if (!validarRespostas('incidente', jev.answers).ok) throw new Error('Resposta gravada inválida.');
    } else jev = await avaliarJev('incidente', entrada);
  } catch (e) { if (gen === estado.geracao) mostrarFalha(e.message); return; }
  if (gen !== estado.geracao || estado.ecra !== 'live') return;
  const estadoAntes = safeClone(estado.missao);
  const antes = { tempoS: Math.round(estado.missao.voo.tempoS), fuelKg: Math.round(estado.missao.voo.combustivelKg), destino: estado.missao.destinoId };
  const { missao, supervisor } = aplicarDecisao(estado.missao, jev.answers, estado.modo === 'replay' ? 'jev-replay' : 'jev');
  estado.missao = missao;
  const linha = { id: evento.id, cenario: estado.cenario, resumo: evento.resumo, entrada, jev, baseline: decisaoGeometrica(entrada), supervisor, antes, depois: null, estadoAntes, estadoDepois: safeClone(missao), pic: { interveio: false } };
  estado.log.linhas.push(linha);
  atualizarDecisao(evento, entrada, jev, supervisor);
  if (estado.mundo) estado.mundoApi.mostrarAmeacas(estado.mundo, entrada.geometria.obstaculos, parametrosVoo());
  estado.incidentePendente = null; estado.espera = false;
}
async function processarBriefing(gen) {
  estado.espera = true; estado.briefingPendente = true;
  const entrada = estadoParaAvaliacao(estado.missao);
  $('event-title').textContent = 'O JEV lê o briefing.';
  $('event-desc').textContent = CENARIOS_SIM[estado.cenario].descricao;
  $('flow-input').textContent = entradaBreve(entrada);
  let resposta;
  try { resposta = estado.modo === 'replay' ? estado.replay.briefing : await avaliarJev('briefing', entrada); }
  catch (e) { if (gen === estado.geracao) mostrarFalha(e.message); return; }
  if (gen !== estado.geracao || estado.ecra !== 'live') return;
  estado.log.briefing = { entrada, resposta };
  $('event-title').textContent = 'Briefing lido.';
  $('event-desc').textContent = 'Quatro respostas reais do JEV definem a leitura inicial da missão.';
  $('flow-choice').textContent = resposta.answers.prioridadeOperacional.choice;
  $('flow-detail').textContent = `Cabine ${resposta.answers.configuracaoCabine.choice} · pista P(true) ${numero(resposta.answers.pistaAdequada.probability, 2)}`;
  $('flow-effect').textContent = 'O voo parte com o estado do comandante. O primeiro evento será avaliado a seguir.';
  $('decision-origin').textContent = estado.modo === 'replay' ? 'JEV / REPLAY GRAVADO' : 'JEV / AO VIVO';
  $('decision-pic').textContent = '4 RESPOSTAS TIPADAS';
  mostrarRespostas(resposta.answers);
  selo(origemSelo(), `Briefing · ${resposta.answers.prioridadeOperacional.choice}`, resposta.latencia_ms);
  $('flight-status').textContent = 'Briefing concluído. O primeiro incidente aproxima-se.';
  estado.revelarAte = performance.now() + 1800;
  estado.briefingPendente = false; estado.espera = false;
}

function quadro(t) {
  if (estado.ecra !== 'live' || !estado.missao) return;
  estado.raf = requestAnimationFrame(quadro);
  const dt = Math.min(.1, Math.max(0, (t - estado.ultimoFrame) / 1000)); estado.ultimoFrame = t;
  if (!estado.pausa && !estado.falha && !estado.missao.resultado) {
    const fator = estado.espera && estado.incidentePendente?.obstaculos?.some((o) => o.segundos_ate_ao_contacto <= 15) ? 0 : estado.espera ? 1 : estado.missao.ameacaAtiva && estado.velocidade > 2 ? 2 : estado.velocidade;
    if (!estado.briefingPendente) estado.missao = avancarMissao(estado.missao, dt * fator);
    if (!estado.espera && t > estado.revelarAte) {
      const evento = proximoEvento(estado.missao);
      if (evento) void processarEvento(evento, estado.geracao);
    }
  }
  if (t - estado.ultimoUI > 100) { atualizarTelemetria(); estado.ultimoUI = t; }
  desenharMundo(dt);
  if (estado.missao.resultado && !estado.espera && !estado.falha) abrirDebrief();
}

async function iniciar(modo) {
  const gen = ++estado.geracao;
  if (estado.pedido) estado.pedido.abort();
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
  estado.pausa = false; estado.espera = false; estado.falha = false; estado.incidentePendente = null; estado.briefingPendente = false; estado.revelarAte = 0; estado.velocidade = 8;
  $('failure-overlay').hidden = true; $('pic-overlay').hidden = true; $('map-overlay').hidden = true; $('btn-real-map').hidden = estado.cenario !== 'porto'; $('btn-pause').textContent = 'Pausar'; $('btn-speed').textContent = '8× velocidade';
  $('flight-name').textContent = nomeCenario(); $('flight-source').textContent = modo === 'replay' ? 'REPLAY GRAVADO · SEM NOVA AVALIAÇÃO' : 'JEV AO VIVO · AI GATEWAY';
  $('decision-origin').textContent = modo === 'replay' ? 'JEV / REPLAY GRAVADO' : 'JEV / AO VIVO';
  selo(origemSelo(), 'A ler o briefing…', null, true);
  abrirGaveta(ecraLargo());
  mostrar('live');
  largarMundo(); await criarMundo(); if (gen !== estado.geracao) return;
  cancelAnimationFrame(estado.raf); estado.ultimoFrame = performance.now(); estado.raf = requestAnimationFrame(quadro);
  void processarBriefing(gen);
}

function resultadoTexto(r) {
  return { chegou: 'Aterrou no destino', regressou: 'Aterrou na origem', emergencia_resolvida: 'Aterragem de emergência', combustivel_esgotado: 'Combustível esgotado', limite_altitude: 'Limite de altitude', separacao_perdida: 'Separação de proteção perdida', tempo_esgotado: 'Tempo de missão esgotado', interrompida: 'Missão interrompida' }[r] ?? 'Missão terminada';
}
function resumoDecisao(linha) {
  const a = linha.jev.answers;
  return `${etiquetarAcao(a.acaoMissao.choice)} · rota ${nomeDestino(linha.supervisor.aplicada.destino)}`;
}
function elemento(tag, classe, texto) { const e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = String(texto); return e; }
function renderDebrief() {
  const m = estado.missao, log = estado.log, stats = resumirLinhas(log.linhas);
  $('result-title').textContent = log.incompleta ? 'Missão incompleta.' : resultadoTexto(log.resultado) + '.';
  $('result-summary').textContent = log.incompleta ? log.motivo : `${log.linhas.length} ${log.linhas.length === 1 ? 'decisão avaliada' : 'decisões avaliadas'}. O percurso terminou em ${nomeDestino(m.destinoId)}, com ${Math.round(m.voo.combustivelKg)} kg de combustível. Cada escolha abaixo conserva a entrada e a resposta originais.`;
  $('result-mode').textContent = log.fonte === 'jev-ao-vivo' ? '● JEV AO VIVO / AI GATEWAY' : '○ REPLAY GRAVADO / SEM NOVAS RESPOSTAS JEV';
  const metrics = $('result-metrics'); metrics.replaceChildren();
  const itens = [['Decisões', stats.total], ['Ações conformes', stats.acoesConformes], ['Destinos incompatíveis', stats.destinosIncompativeis], ['Manobras conformes', stats.manobrasConformes], ['Limites bloqueados', stats.limitesBloqueados], ['PIC conforme', stats.picConforme], ['PIC excessivo', stats.picExcessivo]];
  for (const [nome, valor] of itens) { const box = elemento('div', 'metric'); box.append(elemento('span', '', nome), elemento('strong', '', valor)); metrics.append(box); }
  const list = $('decision-list'); list.replaceChildren();
  if (log.briefing) {
    const b = log.briefing.resposta.answers;
    const card = elemento('details', 'decision-record');
    const sum = elemento('summary'); sum.append(elemento('span', 'record-index', '00'), elemento('span', 'record-name', 'Briefing · prioridade, cabine, pista e combustível'), elemento('span', 'record-choice', b.prioridadeOperacional.choice));
    const body = elemento('div', 'record-body'); body.append(elemento('p', '', `Cabine: ${b.configuracaoCabine.choice} · P(pista adequada): ${numero(b.pistaAdequada.probability, 2)} · P(combustível suficiente): ${numero(b.combustivelSuficiente.probability, 2)}`)); card.append(sum, body); list.append(card);
  }
  log.linhas.forEach((l, i) => {
    const a = avaliarLinha(l);
    const card = elemento('details', 'decision-record'); if (i === 0) card.open = true;
    const summary = elemento('summary'); const name = elemento('span', 'record-name', l.resumo); name.append(elemento('small', '', a.alertas.length ? a.alertas.join(' ') : 'Sem intervenção do supervisor'));
    summary.append(elemento('span', 'record-index', String(i + 1).padStart(2, '0')), name, elemento('span', 'record-choice', resumoDecisao(l)));
    const body = elemento('div', 'record-body');
    const left = elemento('div'); left.append(elemento('h3', '', 'ENTRADA E JEV'), elemento('p', '', entradaBreve(l.entrada)), elemento('p', '', `Ação: ${etiquetarAcao(l.jev.answers.acaoMissao.choice)} · destino se mudar rota: ${etiquetarDestino(l.jev.answers.destinoPreferido.choice)}`), elemento('p', '', `Eixos: ${etiquetarManobraV(l.jev.answers.manobraVertical.choice)} / ${etiquetarManobraL(l.jev.answers.manobraLateral.choice)} · PIC P(true): ${numero(l.jev.answers.precisaRevisaoPIC.probability, 2)}`));
    const right = elemento('div'); right.append(elemento('h3', '', 'AVALIAÇÃO E CONSEQUÊNCIA'), elemento('p', '', `Ação ${a.acao}; destino ${a.destino}; manobra ${a.manobra}.`), elemento('p', '', `Regra geométrica limitada: ${etiquetarAcao(l.baseline.acaoMissao.choice)}. Supervisor: ${a.limites}.`), elemento('p', '', `Combustível ${l.antes.fuelKg} → ${l.depois?.fuelKg ?? '—'} kg. Rota ${nomeDestino(l.antes.destino)} → ${nomeDestino(l.depois?.destino) ?? '—'}.`));
    const separacao = l.depois?.separacoes?.find((s) => s.id === l.id);
    if (separacao) right.append(elemento('p', '', `Separação mínima medida: ${separacao.minimaM} m; perímetro de proteção ilustrativo: ${separacao.limiteM} m.`));
    if (a.alertas.length) right.append(elemento('p', 'record-alert', a.alertas.join(' ')));
    body.append(left, right); card.append(summary, body); list.append(card);
  });
  const select = $('lab-event'); select.replaceChildren();
  log.linhas.forEach((l, i) => { const opt = document.createElement('option'); opt.value = String(i); opt.textContent = `${i + 1}. ${l.id}`; select.append(opt); });
  $('btn-lab').disabled = !estado.gateway || !log.linhas.length;
  $('btn-lab-open').disabled = !log.linhas.length;
  $('lab-overlay').hidden = true;
  $('lab-result').replaceChildren();
}
function abrirDebrief() {
  if (estado.ecra !== 'live') return;
  atualizarResultadoLinha(); estado.log.resultado = estado.missao.resultado;
  cancelAnimationFrame(estado.raf); largarMundo(); $('map-overlay').hidden = true;
  renderDebrief(); mostrar('debrief');
}
function terminarIncompleta(motivo) {
  if (!estado.missao) return;
  estado.log.incompleta = true; estado.log.motivo = motivo;
  estado.missao = { ...estado.missao, resultado: 'interrompida' };
  abrirDebrief();
}
async function reavaliar() {
  const linha = estado.log.linhas[Number($('lab-event').value)]; if (!linha || !estado.gateway) return;
  const campo = $('lab-variable').value, valor = Number($('lab-value').value);
  if (!Number.isFinite(valor)) { $('lab-result').textContent = 'Introduz um número válido.'; return; }
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
  $('btn-lab').disabled = true; $('lab-result').textContent = 'A pedir nova avaliação ao JEV…';
  try {
    const nova = await avaliarJev('incidente', entrada);
    const aplicada = aplicarDecisao(copia, nova.answers);
    const avaliacao = avaliarLinha({ ...linha, entrada, jev: nova, supervisor: aplicada.supervisor });
    const host = $('lab-result'); host.replaceChildren();
    const box = elemento('div', 'lab-compare');
    const antigo = elemento('div', 'lab-side');
    antigo.append(elemento('small', '', `ORIGINAL · ${anterior}`), elemento('strong', '', resumoDecisao(linha)), elemento('p', '', `Manobra ${linha.jev.answers.manobraVertical.choice} / ${linha.jev.answers.manobraLateral.choice} · PIC ${numero(linha.jev.answers.precisaRevisaoPIC.probability, 2)}`));
    const novo = elemento('div', 'lab-side');
    novo.append(elemento('small', '', `ALTERADO · ${valor}`), elemento('strong', '', `${etiquetarAcao(nova.answers.acaoMissao.choice)} · rota ${nomeDestino(aplicada.supervisor.aplicada.destino)}`), elemento('p', '', `Alternativa se mudar rota: ${etiquetarDestino(nova.answers.destinoPreferido.choice)}. Manobra ${nova.answers.manobraVertical.choice} / ${nova.answers.manobraLateral.choice} · PIC ${numero(nova.answers.precisaRevisaoPIC.probability, 2)}`));
    if (avaliacao.alertas.length) novo.append(elemento('p', 'record-alert', avaliacao.alertas.join(' ')));
    box.append(elemento('p', 'lab-delta', `Variável: ${campo}`), antigo, novo);
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
  if (estado.pedido) estado.pedido.abort();
  ++estado.geracao; cancelAnimationFrame(estado.raf); largarMundo(); estado.missao = null; estado.log = null; mostrar('commander');
}
function ligarUI() {
  criarCartoes(); void sondarGateway();
  $('btn-open').addEventListener('click', () => mostrar('commander'));
  $('btn-home').addEventListener('click', () => mostrar('splash'));
  $('btn-launch').addEventListener('click', () => { if (estado.gateway) void iniciar('live'); });
  $('btn-replay').addEventListener('click', () => void iniciar('replay'));
  $('btn-exit').addEventListener('click', () => terminarIncompleta('O comandante terminou a missão antes do desfecho.'));
  $('btn-pause').addEventListener('click', () => { estado.pausa = !estado.pausa; $('btn-pause').textContent = estado.pausa ? 'Continuar' : 'Pausar'; atualizarTelemetria(); });
  $('btn-speed').addEventListener('click', () => { estado.velocidade = estado.velocidade === 8 ? 1 : estado.velocidade === 1 ? 4 : 8; $('btn-speed').textContent = `${estado.velocidade}× velocidade`; });
  $('btn-pic').addEventListener('click', () => { estado.pausa = true; $('btn-pause').textContent = 'Continuar'; $('pic-overlay').hidden = false; });
  const abrirMapa = (origem) => {
    estado.mapaOrigem = origem;
    if (estado.ecra === 'live') {
      estado.pausaAntesMapa = estado.pausa;
      estado.pausa = true;
      $('btn-pause').textContent = 'Continuar';
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
      $('btn-pause').textContent = estado.pausa ? 'Continuar' : 'Pausar';
    }
    estado.mapaOrigem?.focus();
  });
  $('btn-drawer').addEventListener('click', () => abrirGaveta(!$('decision-panel').classList.contains('is-open')));
  $('btn-lab-open').addEventListener('click', () => { $('lab-overlay').hidden = false; $('lab-event').focus(); });
  $('btn-lab-close').addEventListener('click', () => { $('lab-overlay').hidden = true; $('btn-lab-open').focus(); });
  $('btn-pic-cancel').addEventListener('click', () => { $('pic-overlay').hidden = true; estado.pausa = false; $('btn-pause').textContent = 'Pausar'; });
  $('btn-pic-apply').addEventListener('click', () => {
    const acao = $('pic-action').value;
    const original = estado.log.linhas.at(-1)?.jev.answers;
    const respostas = { ...(original ?? {}), acaoMissao: { choice: acao }, destinoPreferido: { choice: acao === 'regressar_base' ? 'origem' : acao === 'desviar_alternativo' ? (estado.cenario === 'medevac' ? 'hospital_alternativo' : estado.cenario === 'porto' ? 'aeroporto_alternativo' : 'stol_proximo') : estado.missao.destinoId }, manobraVertical: { choice: 'manter' }, manobraLateral: { choice: 'manter' }, urgencia: { score: 1 } };
    const { missao, supervisor } = aplicarDecisao(estado.missao, respostas, 'pic-humano', false); estado.missao = missao;
    estado.log.intervencoes.push({ tempoS: missao.voo.tempoS, acao, supervisor });
    const ultima = estado.log.linhas.at(-1); if (ultima) ultima.pic.interveio = true;
    $('flow-effect').textContent = supervisor.interveio ? `PIC pediu ${etiquetarAcao(acao)}; supervisor bloqueou: ${supervisor.motivo}.` : `PIC sobrepôs: ${etiquetarAcao(acao)}. Nova rota ${nomeDestino(missao.destinoId)}.`;
    $('decision-origin').textContent = supervisor.interveio ? 'PIC + SUPERVISOR' : 'INTERVENÇÃO HUMANA / PIC';
    selo(supervisor.interveio ? 'PIC + SUPERVISOR' : 'INTERVENÇÃO HUMANA / PIC', etiquetarAcao(supervisor.interveio ? supervisor.aplicada.acao : acao), null);
    $('pic-overlay').hidden = true; estado.pausa = false; $('btn-pause').textContent = 'Pausar';
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
