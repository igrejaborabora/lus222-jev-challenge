import { iniciarAterragemAI, cancelarAterragemAI, pedirBorregoAI, decidirAterragemAI, estadoAterragem, LANDING_FRESH_S } from './ai-landing.js';
import { respostaAterragemValida } from './landing-contract.js';
import { actualizarAterragemUI } from './ai-landing-ui.js';
import { criarAssinaturaUI } from './flight-signature-ui.js';
import { criarFlightLabUI } from './flight-lab-ui.js';
import { criarCockpitUI } from './cockpit-ui.js';
import { painelGuardado, guardarPainel, desvioDoPainel } from './cockpit-model.js';
import { criarComandosUI } from './comandos-ui.js';
import { PERFIL_PROGRESSIVO, novosControlos, protecaoActiva } from './voo-progressivo.js';
import { criarInstrumentosUI } from './instrumentos-ui.js';
import { poseMissao } from './escala.js';
import { avancarMissao, PERFIL, vooInterpolado } from './simulacao.js';
import { criarVooProgressivo, NOMES_CIRCUITO } from './simulador.js';
import { actuacaoDeManobra, actuacaoEfectiva, darOrdem, novoPiloto, ordemHumana, seleccionarVertical, POTENCIAS, RETENCAO_HUMANO_S, RETENCAO_JEV_S } from './piloto-sim.js';
import { estadoPiloto, limparOrdens } from './estado-piloto.js';
import { textoUI } from './copy-en.js';
import { concluirPasso, deveDespacharPasso, falharPasso, metricasPiloto, novoPipelinePiloto, reservarPasso } from './piloto-corredor.js';
import { actualizarPainel, decimal, etiquetaOpcao } from './painel-jev.js';
import { iniciarReproducao, reproduzir } from './voo-gravado.js';
import { pontosFitaRota, setaManobra } from './rota-visual.js';
import { alturaTerreno, perfilTerreno, pistasDaMissao, prepararPistas } from './relevo.js';
import { raioEfectivoM } from './ameacas.js';

/**
 * Ecrã do simulador: o motor da missão com o piloto aos comandos (humano ou
 * JEV), o mundo 3D, a actuação acesa, os contadores e o mapa. O relógio corre
 * a 1×, sempre: o mundo não espera por ninguém.
 */
const $ = (id) => document.getElementById(id);
const TECLAS = new Set(['KeyZ', 'KeyX', 'KeyB', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyE', 'KeyQ', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight']);
const RESULTADOS = {
  aterragem_dura: ['Hard landing.', 'Touchdown exceeded the simulated limits for speed, descent rate or alignment.'],
  limite_altitude: ['Terrain collision.', 'The LUS-222 hit the ground outside a runway.'],
  separacao_perdida: ['Separation lost.', 'A hazard entered the protected separation zone.'],
  combustivel_esgotado: ['Out of fuel.', 'The flight ended after the fuel ran out.'],
  chegou: ['Landed at Sá Carneiro.', 'The LUS-222 landed on the runway at Francisco Sá Carneiro Airport.'],
  tempo_esgotado: ['Time limit reached.', 'Free flight reached its time limit.'],
  fim_gravacao: ['Recorded flight complete.', 'JEV piloted this flight using actual AI decisions, recorded and replayed step by step.'],
};
const MAPA = { x0: -19000, z1: 168000, lado: 31000 };
// JEV piloto: ~3 pedidos por segundo, dois em voo, 0,042 USD por milhão de tokens de entrada.
const INTERVALO_JEV_MS = 330;
const CUSTO_TOKEN_USD = 0.042 / 1e6;
// A bounded request allowance gives the slower landing controller time for a go-around.
const LIMITE_PEDIDOS_JEV = 900;
// Uma resposta sobre um estado com mais de 1,5 s de simulação já não comanda.
const IDADE_MAX_S = 1.5;
// Voo real do JEV, gravado com scripts/gravar-voo-jev.mjs, para quem não tem voo ao vivo.
const VOO_GRAVADO = './voos/porto-sao-joao-222.json';

function el(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto != null) e.textContent = String(texto);
  return e;
}
function svg(tag, attrs = {}) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}
const tempo = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/** Presentation only: keep the validated Portuguese state sent to JEV intact. */
function textoEstadoUI(e) {
  const linhas = [
    `ROUTE  ${textoUI(e.rota.proximo_ponto)} · ${textoUI(e.rota.direcao)} · deviation ${textoUI(e.rota.desvio)} · ${textoUI(e.rota.distancia)}`,
    `FLIGHT altitude ${textoUI(e.voo.altitude)} · ${textoUI(e.voo.velocidade)} (${textoUI(e.voo.tendencia)}) · throttle ${textoUI(e.voo.potencia)} · terrain ${textoUI(e.voo.chao)}`,
    `ORDER  ${textoUI(e.ordens_do_comandante)}`,
  ];
  for (const a of e.ameacas) {
    const posicao = a.posicao.replace(/(\d+) horas?/, "$1 o'clock");
    linhas.push(`${a.id.padEnd(6)} ${textoUI(a.tipo)} · ${posicao} · ${textoUI(a.movimento)} · closest approach ${textoUI(a.tempo_ate_cpa)} · ${textoUI(a.cpa_se_manter)} if course held · ${textoUI(a.altura_relativa)} · ${textoUI(a.intencao)}`);
  }
  for (const [c, x] of Object.entries(e.manobras)) {
    const extras = [x.regra_do_ar !== 'neutra' ? `right of way ${textoUI(x.regra_do_ar)}` : null,
      x.nuvem === 'entra' ? 'enters cloud' : null, x.terreno === 'perto' ? 'terrain nearby' : null,
      `route ${textoUI(x.rota)}`, `altitude ${textoUI(x.altitude)}`].filter(Boolean).join(', ');
    linhas.push(`${etiquetaOpcao('manobra', c).padEnd(14)} ${textoUI(x.separacao)}${x.ameaca_critica !== 'nenhuma' ? ` (${x.ameaca_critica})` : ''} · ${extras}`);
  }
  return linhas.join('\n');
}

/** Linha de costa do mapa: onde o relevo do Porto desce abaixo de 2 m, de sul para norte. */
function linhaDeCosta(m) {
  const perfil = perfilTerreno(m.cenario);
  const pistas = prepararPistas(perfil, pistasDaMissao(m.pistas ?? []));
  const pontos = [];
  for (let z = MAPA.z1 - MAPA.lado; z <= MAPA.z1; z += 1000) {
    let x = -2500;
    while (x > MAPA.x0 && alturaTerreno(perfil, -x, z, pistas) >= 2) x -= 100;
    pontos.push([x, -z]);
  }
  return pontos;
}

/** Resposta do piloto dentro do contrato: manobra entre as candidatas enviadas, potência válida. */
function respostaValida(answers, estado) {
  const m = answers?.manobra?.choice;
  return Boolean(m && estado?.manobras?.[m] && POTENCIAS.includes(answers?.potencia?.choice));
}

export function criarSimuladorUI({ som, mostrar, aoSair, carregarMundo, gatewayDisponivel = () => false }) {
  const s = {
    m: null, api: null, mundo: null, raf: 0, ultimo: 0, ultimoUI: 0, pausa: false, fim: false,
    teclas: new Set(), toque: new Map(), verticalSeleccionada: 'manter', trilho: [], supervisor: 0, ultimoSupervisor: null,
    ultimoFoco: -Infinity, geracao: 0, mapa: null,
    decisaoVisivel: null, ordens: '', jev: null, aviso: null, gravacao: null, cursor: null,
  };
  const storage = { getItem:key=>localStorage.getItem(key), setItem:(key,value)=>localStorage.setItem(key,value) };
  let instrumentosVisiveis = painelGuardado(storage);
  const cockpit = criarCockpitUI($('sim-instrumentos'), { onLayout:()=>requestAnimationFrame(ajustar), onInteract:()=>som.clicar() });
  const instrumentos = criarInstrumentosUI($('screen-sim'));
  cockpit.setVisible(instrumentosVisiveis);
  $('sim-instrumentos-toggle').textContent=instrumentosVisiveis?'Hide panel [I]':'Show panel [I]';
  $('sim-instrumentos-toggle').setAttribute('aria-expanded',String(instrumentosVisiveis));
  const comandos = criarComandosUI({ estado: () => s, assumir: assumirComandos, iniciar, avisar });
  const lab = criarFlightLabUI({ estado:()=>s, assumir:assumirComandos, iniciar, pause:definirPausa, panelVisible:()=>instrumentosVisiveis, sound:som, liveAvailable:()=>gatewayDisponivel()&&pedidosAoVivo<LIMITE_PEDIDOS_JEV });
  const assinatura=criarAssinaturaUI($('sim-signature'),$('sim-signature-enabled'));
  let pedidoFoto=0;
  async function aplicarFoto() {
    const pedido=++pedidoFoto,mundo=s.mundo;
    $('sim-aerial-credit').hidden=true;
    if(!mundo)return;
    const activa=$('sim-ground').value==='aerial';
    $('sim-ground-status').textContent=activa?'Loading Porto aerial imagery…':'Illustrated terrain.';
    const estado=await s.api.definirFotoPorto(mundo,activa);
    if(pedido!==pedidoFoto||s.mundo!==mundo)return;
    $('sim-ground-status').textContent=estado==='ready'?'DGT / IFAP 2025 photo active · adapted to illustrative geography.':estado==='error'?'Photo unavailable. Illustrated terrain remains active; select again to retry.':'Illustrated terrain.';
    $('sim-aerial-credit').hidden=estado!=='ready';
  }
  $('sim-ground').addEventListener('change',()=>{void aplicarFoto();});
  let painelManual = false;
  // Requests count across flights in this page visit; pausing does not reset the allowance.
  let pedidosAoVivo = 0;

  function novoJev(aterragem = false) {
    return { pipeline: novoPipelinePiloto({ intervaloMs: aterragem ? 1500 : INTERVALO_JEV_MS, maxEmVoo: aterragem ? 1 : 2 }), pedidos: new Map(), falhas: 0, decisoes: 0, custoUsd: 0 };
  }

  function avisar(texto) {
    s.aviso = texto;
    s.avisoAte = performance.now()+8000;
    $('sim-meta').textContent = texto;
  }

  function cancelarPedidosJev() {
    for (const ctrl of s.jev?.pedidos.values() ?? []) ctrl.abort();
    s.jev?.pedidos.clear();
  }

  function marcarPiloto(tipo) {
    s.teclas.clear();
    s.toque.clear();
    s.verticalSeleccionada = 'manter';
    if (!painelManual) definirPainel(tipo !== 'humano' && !s.m.aiLanding);
    $('sim-decisao').hidden = tipo === 'humano';
    if(tipo !== 'humano') {
      $('sim-decisao-fonte').textContent = tipo === 'jev-gravado' ? 'AI · JEV · RECORDED' : 'AI CONTROL · JEV LIVE';
      $('sim-decisao-manobra').textContent = 'Waiting for a decision…';
      $('sim-decisao-detalhe').textContent = tipo === 'jev-gravado' ? 'Recorded AI decisions; no new assessment.' : 'JEV selects the manoeuvre and throttle setting.';
    }
    $('sim-piloto-humano').setAttribute('aria-pressed', String(tipo === 'humano'));
    $('sim-piloto-jev').setAttribute('aria-pressed', String(tipo !== 'humano'));
    const data = s.gravacao?.gravadoEm ? new Date(s.gravacao.gravadoEm).toLocaleDateString('en-GB') : '';
    $('sim-fonte').textContent = tipo === 'jev' ? 'JEV is flying · live · Porto, São João'
      : tipo === 'jev-gravado' ? `JEV is flying · recorded flight${data ? ` on ${data}` : ''} · no new AI decisions`
        : 'Human pilot · free flight · Porto, São João';
  }

  async function carregarGravacao() {
    if (s.gravacao) return s.gravacao;
    const r = await fetch(VOO_GRAVADO, { cache: 'no-store' });
    if (!r.ok) throw new Error('No recorded JEV flight is available.');
    s.gravacao = await r.json();
    return s.gravacao;
  }

  function pintarDecisaoGravada(d) {
    const host = $('sim-julgamentos');
    if (!host.querySelector('.typed-row')) { host.replaceChildren(); host.classList.remove('sim-vazio'); }
    actualizarPainel($('sim-meta'), host, { answers: d.r, confidence: d.c, latencia_ms: d.ms, usage: { inputTokens: d.tok, outputTokens: 0 } }, { replay: true });
  }

  function contarDecisaoGravada(d) {
    s.gravado.decisoes += 1;
    s.gravado.custoUsd += d.tok * CUSTO_TOKEN_USD;
    s.gravado.latencias.push(d.ms);
  }

  /** Painel e contadores a partir de uma decisão gravada, como se chegasse ao vivo. */
  function mostrarDecisaoGravada(d) {
    pintarDecisaoGravada(d);
    mostrarDecisaoNoVoo(d.r, d.ms, true);
    contarDecisaoGravada(d);
  }

  /**
   * Salta a reprodução até `desdeS` sem desenhar (?desde= no endereço, para
   * gravar o vídeo a partir da Foz): a simulação é a mesma, passo a passo;
   * contadores, rasto do mapa e painel ficam como se o voo tivesse sido visto.
   */
  function saltarGravacao(desdeS) {
    let estado = null;
    let ultima = null;
    while (s.m.voo.tempoS < desdeS && !s.m.resultado && s.cursor.i < s.gravacao.decisoes.length) {
      const r = reproduzir(s.m, s.gravacao, s.cursor, PERFIL.passoS);
      s.m = r.m;
      s.cursor = r.cursor;
      for (const e of r.eventos) {
        if (e.tipo === 'leitura') estado = e.estado;
        else { ultima = e.decisao; contarDecisaoGravada(e.decisao); }
      }
      contarSupervisor();
      const v = s.m.voo;
      if (!s.trilho.length || v.tempoS - s.trilho.at(-1).t >= 1) s.trilho.push({ t: v.tempoS, x: v.xM, z: v.zM });
    }
    if (estado) $('sim-estado').textContent = textoEstadoUI(estado);
    if (ultima) { pintarDecisaoGravada(ultima); mostrarDecisaoNoVoo(ultima.r, ultima.ms, true); }
  }

  /** Volta a pôr o humano aos comandos; o JEV deixa de receber pedidos. */
  function pararJev(motivo) {
    cancelarPedidosJev();
    if (s.m) s.m = cancelarAterragemAI(s.m);
    s.jev = null;
    if (s.m) s.m = { ...s.m, piloto: { ...novoPiloto('humano'), supervisor: s.m.piloto.supervisor } };
    if (s.m && s.m.perfil !== PERFIL_PROGRESSIVO) s.m = { ...s.m, perfil: PERFIL_PROGRESSIVO, controlos: novosControlos() };
    if (s.m) s.m = { ...s.m, controlos: { ...s.m.controlos, modo:'avancado', protecao:false, altitudeM:null, verticalMs:null, rumoRad:null, aproximacao:false }, voo:{...s.m.voo,pitchManualRad:s.m.voo.pitchRad}, piloto:{...s.m.piloto,supervisor:null} };
    marcarPiloto('humano');
    if (motivo) avisar(motivo);
  }

  function entregarAoJev(objectivo = $('sim-ai-objective').value) {
    if (!s.m || s.fim || s.m.resultado) return;
    if (!gatewayDisponivel() || pedidosAoVivo >= LIMITE_PEDIDOS_JEV) { avisar('Live JEV is unavailable or this visit has reached its limit. You keep the controls. A recorded route is available from the landing page.'); return; }
    if (s.m.voo.emSolo || (s.m.treino && objectivo !== 'aterrar')) { avisar('Start free flight to use AI route control. Landing guidance can take over an airborne approach.'); return; }
    cancelarPedidosJev();
    if (s.m.piloto.tipo === 'jev-gravado') { avisar('This is a recording. Start a live flight from the landing page.'); return; }
    s.m=cancelarAterragemAI(s.m);
    $('sim-ai-objective').value=objectivo;
    s.m = { ...s.m, controlos: { ...novosControlos(), motores:s.m.controlos?.motores??novosControlos().motores, flaps: s.m.voo.flaps ?? 0 }, piloto:novoPiloto('jev') };
    if(objectivo==='aterrar')s.m=iniciarAterragemAI(s.m);
    s.jev = novoJev(Boolean(s.m.aiLanding));
    s.teclas.clear(); s.toque.clear();
    marcarPiloto('jev');
    avisar(objectivo==='aterrar'?'JEV objective: land at Porto. Guidance will join the approach.':'JEV objective: fly the route.');
  }

  function despacharJev(agora) {
    const estado = s.m.aiLanding ? estadoAterragem(s.m) : estadoPiloto(s.m, { ordens: s.ordens });
    $('sim-estado').textContent = s.m.aiLanding ? JSON.stringify(estado,null,2) : textoEstadoUI(estado);
    const ticket = reservarPasso(s.jev.pipeline, { estado, tempoS: s.m.voo.tempoS, passo: s.m.passo }, agora);
    pedidosAoVivo += 1;
    void pedirJev(ticket, s.geracao, s.jev);
  }

  async function pedirJev(ticket, gen, jev) {
    const ctrl = new AbortController();
    jev.pedidos.set(ticket.id, ctrl);
    const limite = setTimeout(() => ctrl.abort(), 3500);
    try {
      const r = await fetch('/api/jev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ momento: ticket.entrada.estado.phase ? 'aterragem' : 'piloto', estado: ticket.entrada.estado }), signal: ctrl.signal });
      const d = await r.json().catch(() => ({}));
      if (d.erro === 'limite' || r.status === 429) throw Object.assign(new Error('The live AI flight limit has been reached.'), { codigo: 'limite' });
      if (!r.ok || d.fonte !== 'jev') throw new Error('JEV could not respond. Please try again.');
      if (!(ticket.entrada.estado.phase ? respostaAterragemValida(d.answers) : respostaValida(d.answers, ticket.entrada.estado))) throw new Error('JEV returned an unusable decision.');
      if (ctrl.signal.aborted || s.pausa || gen !== s.geracao || jev !== s.jev || s.m?.piloto.tipo !== 'jev') return;
      aplicarJev(ticket, d);
    } catch (e) {
      if (s.pausa || gen !== s.geracao || jev !== s.jev || s.m?.piloto.tipo !== 'jev') return;
      falharJev(ticket, e);
    } finally {
      clearTimeout(limite);
      jev.pedidos.delete(ticket.id);
    }
  }

  function mostrarDecisaoNoVoo(answers, ms, gravada = false) {
    s.decisaoVisivel = { tempoS:s.m.voo.tempoS, gravada };
    lab.observarDecisao(s.m,etiquetaOpcao('manobra',answers.manobra?.choice),gravada);
    $('sim-decisao-manobra').textContent = etiquetaOpcao('manobra', answers.manobra?.choice);
    $('sim-decisao-detalhe').textContent = `Throttle: ${etiquetaOpcao('potencia',answers.potencia?.choice).toLowerCase()}${answers.plano?.choice ? ` · ${etiquetaOpcao('plano',answers.plano.choice)}` : ''} · ${Math.round(ms??0)} ms`;
  }

  function aplicarJev(ticket, d) {
    const jev = s.jev;
    const res = concluirPasso(jev.pipeline, ticket.id, d, performance.now());
    jev.falhas = 0;
    jev.decisoes += 1;
    jev.custoUsd += (Number(d.usage?.inputTokens) || 0) * CUSTO_TOKEN_USD;
    s.aviso = null;
    const host = $('sim-julgamentos');
    if (!host.querySelector('.typed-row')) { host.replaceChildren(); host.classList.remove('sim-vazio'); }
    actualizarPainel($('sim-meta'), host, d);
    // Uma resposta mais antiga que chega depois de uma nova fica no painel, não nos comandos.
    if (!res.aplicar || s.m.piloto.tipo !== 'jev' || s.m.resultado) return;
    if (s.m.voo.tempoS - ticket.entrada.tempoS > (s.m.aiLanding ? LANDING_FRESH_S : IDADE_MAX_S)) return;
    if(s.m.aiLanding) {
      const next=decidirAterragemAI(s.m,d.answers.landingDecision.choice,{phase:ticket.entrada.estado.phase,tempoS:ticket.entrada.tempoS});
      if(next!==s.m){s.m=next;s.decisaoVisivel={tempoS:s.m.voo.tempoS,gravada:false};lab.observarDecisao(s.m,etiquetaOpcao('landingDecision',d.answers.landingDecision.choice),false);}
      return;
    }
    mostrarDecisaoNoVoo(d.answers, d.latencia_ms);
    const eixos = actuacaoDeManobra(d.answers.manobra.choice);
    s.m = { ...s.m, piloto: darOrdem(s.m.piloto, { ...eixos, potencia: d.answers.potencia.choice, fonte: 'jev' }, s.m.voo.tempoS, RETENCAO_JEV_S) };
  }

  function falharJev(ticket, erro) {
    const jev = s.jev;
    falharPasso(jev.pipeline, ticket.id, erro, performance.now());
    if (erro.codigo === 'limite') { interromperJev('The live AI allowance has been reached.'); return; }
    jev.falhas += 1;
    jev.pipeline.proximoEm = Math.max(jev.pipeline.proximoEm, performance.now() + Math.min(8000, 400 * 2 ** jev.falhas));
    if (jev.falhas >= 5) { interromperJev(`JEV is unavailable after repeated attempts (${erro.message}).`); return; }
    avisar(`No response from JEV (${erro.message}). The aircraft stabilises while protection remains active.`);
  }

  function interromperJev(reason) {
    pararJev(`${reason} Flight paused. Resume to fly manually.`);
    definirPausa(true);
  }

  function ligarSomAgora() {
    try { som.silenciar($('sim-som').getAttribute('aria-pressed') !== 'true'); som.ligar(); } catch { /* sem áudio */ }
  }

  function comandoVisual() {
    const a = actuacaoEfectiva(s.m.piloto, s.m.voo.tempoS);
    return { lateral: a.lateral === 'nivelar' ? 'manter' : a.lateral, vertical: a.vertical, fonte: a.fonte };
  }

  function marcas(voo) {
    const destino = s.m.destinos.find((d) => d.id === s.m.destinoId);
    const c = comandoVisual();
    return {
      guiaVisual: lab.guiaVisual(),
      pontosRota: pontosFitaRota(voo, destino),
      destinoAtivoId: s.m.destinoId,
      distanciasKm: Object.fromEntries(s.m.destinos.map((d) => [d.id, Math.hypot(d.xM - voo.xM, d.zM - voo.zM) / 1000])),
      reserva: 'ok',
      seta: setaManobra(c),
      autor: c.fonte === 'supervisor' ? 'supervisor' : 'jev',
      raioBaloesM: null,
    };
  }

  /**
   * O próximo ponto do circuito, entre 300 m e 2,5 km e à frente do nariz, em
   * coordenadas do mundo: o modo cinema enquadra-o com o avião (a ponte ao chegar).
   */
  function marcoCinema(voo) {
    const alvo = s.m.destinos.find((d) => d.id === s.m.destinoId);
    if (!alvo) return null;
    const dx = alvo.xM - voo.xM;
    const dz = alvo.zM - voo.zM;
    const d = Math.hypot(dx, dz);
    const erro = Math.atan2(dx, dz) - voo.rumoRad;
    if (d < 300 || d > 2500 || Math.cos(erro) < 0.35) return null;
    const x = -alvo.xM;
    return { x, y: Math.max(0, alturaTerreno(perfilTerreno(s.m.cenario), x, alvo.zM)) + 40, z: alvo.zM };
  }

  function desenhar(dt) {
    const { api, mundo } = s;
    const voo = vooInterpolado(s.m);
    if(instrumentosVisiveis)instrumentos.atitude(voo);
    if (!mundo) return;
    try {
      const absoluta = poseMissao(voo, null);
      const pose = api.recentrarOrigem(mundo, absoluta);
      api.aplicarPose(mundo, pose);
      const atrasoS = s.m.vooAnterior ? (s.m.acumuladorS ?? 0) - 0.1 : 0;
      const novas = api.sincronizarAmeacas(mundo, s.m.ameacas, { atrasoS, dt: s.pausa ? 0 : dt });
      // Uma ameaça nova enquadra-se com o avião (no máximo de 8 em 8 s).
      if (novas.length && s.m.voo.tempoS - s.ultimoFoco > 8) {
        const g = mundo.malhasAmeacas.get(novas.at(-1));
        if (g) { api.focarEvento(mundo, { x: g.position.x, y: g.position.y, z: g.position.z }); s.ultimoFoco = s.m.voo.tempoS; }
      }
      api.definirMarcoCinema(mundo, marcoCinema(voo));
      api.actualizarCamara(mundo, pose, dt, { manual: s.m.piloto.tipo === 'humano' });
      api.actualizarCena(mundo, { pose: absoluta, poseLocal: pose, ambiente: s.m.ambiente, voo, semente: s.m.semente, controlos: s.m.controlos, marcas: marcas(voo) }, s.pausa ? 0 : dt);
      mundo.renderer.render(mundo.scene, mundo.camera);
    } catch { /* uma falha visual não pára o voo */ }
  }

  function aplicarHumano() {
    const ordem = ordemHumana(s.teclas, s.verticalSeleccionada, s.toque);
    const gamepad = comandos.gamepad();
    if (gamepad?.activo) {
      for (const k of ['bankInput','pitchInput','rudder','potenciaDelta','travao']) if (gamepad[k]) ordem[k] = gamepad[k];
    }
    if (s.m.controlos?.modo === 'avancado') {
      if (s.teclas.has('KeyZ') || s.teclas.has('KeyX')) ordem.rudder = Number(s.teclas.has('KeyX')) - Number(s.teclas.has('KeyZ'));
    }
    if (s.teclas.has('KeyB')) ordem.travao = 1;
    if (!s.m.controlos && ordem.lateral === 'nivelar' && ordem.vertical === 'manter' && ordem.potencia === 'manter') return;
    s.m = { ...s.m, piloto: darOrdem(s.m.piloto, { ...ordem, fonte: 'humano' }, s.m.voo.tempoS, RETENCAO_HUMANO_S) };
  }

  function contarSupervisor() {
    const sup = s.m.piloto.supervisor;
    if (sup && sup !== s.ultimoSupervisor && s.m.voo.tempoS < sup.ateS) s.supervisor += 1;
    s.ultimoSupervisor = sup;
  }

  function actualizarLampadas() {
    const a = actuacaoEfectiva(s.m.piloto, s.m.voo.tempoS);
    if(s.m.piloto.tipo !== 'humano') {
      const idade = s.decisaoVisivel ? s.m.voo.tempoS - s.decisaoVisivel.tempoS : Infinity;
      $('sim-decisao-estado').textContent = a.fonte === 'supervisor' ? `Protection active: ${a.motivo === 'terreno' ? 'terrain avoidance' : 'traffic separation'}.` : a.fonte === 'estabilizador' ? 'Waiting for a current decision · aircraft stabilised.' : `Decision applied${s.decisaoVisivel?.gravada ? ' from recording' : ''} · ${idade.toFixed(1)} s.`;
    }
    const atitudeManual=s.m.piloto.tipo==='humano' && s.m.controlos?.modo==='avancado' && s.m.voo.pitchManualRad!=null;
    const verticalReal=s.m.voo.velocidadeVerticalMs>0.15?'subir':s.m.voo.velocidadeVerticalMs < -0.15?'descer':'manter';
    const actuacao=atitudeManual?{...a,vertical:verticalReal}:a;
    for (const b of document.querySelectorAll('#sim-actuacao [data-eixo]')) b.classList.toggle('is-on', actuacao[b.dataset.eixo] === b.dataset.valor);
    const pedido = ordemHumana(s.teclas, s.verticalSeleccionada, s.toque);
    if(atitudeManual)pedido.vertical=verticalReal;
    for (const b of document.querySelectorAll('#sim-actuacao [data-eixo="vertical"]')) {
      const seleccionado = s.m.piloto.tipo === 'humano' && pedido.vertical === b.dataset.valor;
      b.setAttribute('aria-pressed', String(seleccionado));
      b.classList.toggle('is-selected', seleccionado);
    }
    $('sim-comando-manual').textContent = s.pausa ? 'Flight paused · select Resume to fly.'
      : s.m.piloto.tipo !== 'humano' ? 'Use a flight control to take over.'
        : s.m.controlos?.modo==='avancado' ? `${atitudeManual ? 'Nose target '+(s.m.voo.pitchManualRad*180/Math.PI).toFixed(0)+'°' : 'Level hold'} · ↓ S: nose up · ↑ W: nose down · L: level · release keeps attitude.`
        : s.verticalSeleccionada !== 'manter' ? `Continuous ${s.verticalSeleccionada === 'subir' ? 'climb' : 'descent'} · select Level to hold altitude.`
          : 'Click Climb / Descend · hold arrow keys or WASD to fly.';
    $('sim-supervisor').classList.toggle('is-on', a.fonte === 'supervisor');
    $('sim-supervisor').textContent = a.fonte === 'supervisor' ? (a.motivo === 'terreno' ? 'PROTECTION · TERRAIN' : 'PROTECTION · TRAFFIC') : protecaoActiva(s.m) ? 'PROTECTION ON' : 'PROTECTION OFF';
  }

  function actualizarHud() {
    const v = s.m.voo;
    instrumentos.actualizar(s.m, vooInterpolado(s.m));
    comandos.actualizar();
    cockpit.actualizar(s.m);
    actualizarAterragemUI(s.m);
    $('sim-notice').hidden=!s.aviso||(!s.pausa&&performance.now()>s.avisoAte);
    $('sim-notice').textContent=s.aviso??'';
    const d = s.m.destinos.find((x) => x.id === s.m.destinoId);
    const km = Math.hypot(d.xM - v.xM, d.zM - v.zM) / 1000;
    $('sim-objetivo').textContent = s.m.aiLanding ? `AI objective: land at Porto · ${km.toFixed(1)} km to airport` : `Next: ${textoUI(NOMES_CIRCUITO[d.id] ?? d.id)} · ${km.toFixed(1)} km · ${s.m.pontosPassados.length} waypoints passed`;
  }

  function actualizarContadores() {
    const seps = s.m.separacoes;
    const margem = seps.length ? Math.min(...seps.map((r) => r.minimaM - r.limiteM)) : null;
    const itens = [
      ['TIME', tempo(s.m.voo.tempoS)],
      ['PILOT', s.m.piloto.tipo === 'jev' ? 'JEV live' : s.m.piloto.tipo === 'jev-gravado' ? 'JEV recorded' : 'Human'],
      ['HAZARDS PASSED', seps.length],
      ['MINIMUM CLEARANCE', margem == null ? '—' : `${margem} m`],
      ['PROTECTION', `${s.supervisor}×`],
      ['ACTIVE HAZARDS', s.m.ameacas.length],
    ];
    if (s.m.piloto.tipo === 'jev-gravado' && s.gravado) {
      const ord = [...s.gravado.latencias].sort((a, b) => a - b);
      itens.push(
        ['JEV DECISIONS', s.gravado.decisoes],
        ['DECISIONS/S', decimal(s.gravado.decisoes / Math.max(1, s.m.voo.tempoS)).replace(/0$/, '')],
        ['RESPONSE TIME P50', ord.length ? `${ord[Math.floor(ord.length / 2)]} ms` : '—'],
        ['RECORDED COST', `${s.gravado.custoUsd.toFixed(4)} USD`],
      );
    } else if (s.jev) {
      const met = metricasPiloto(s.jev.pipeline, performance.now());
      itens.push(
        ['JEV DECISIONS', s.jev.decisoes],
        ['DECISIONS/S', decimal((met.decisoes_por_minuto ?? 0) / 60).replace(/0$/, '')],
        ['RESPONSE TIME P50', met.latencia_mediana_ms == null ? '—' : `${met.latencia_mediana_ms} ms`],
        ['COST', `${s.jev.custoUsd.toFixed(4)} USD`],
      );
    }
    const host = $('sim-contadores');
    host.replaceChildren(...itens.map(([k, v]) => { const d = el('div'); d.append(el('dt', '', k), el('dd', '', v)); return d; }));
  }

  function prepararMapa() {
    const host = $('sim-mapa');
    host.setAttribute('viewBox', `${MAPA.x0} ${-MAPA.z1} ${MAPA.lado} ${MAPA.lado}`);
    host.replaceChildren();
    const costa = linhaDeCosta(s.m);
    const mar = [[MAPA.x0, costa[0][1]], ...costa, [MAPA.x0, costa.at(-1)[1]]];
    host.append(svg('polygon', { points: mar.map((p) => p.join(',')).join(' '), fill: '#101a24' }));
    host.append(svg('polyline', { points: costa.map((p) => p.join(',')).join(' '), fill: 'none', stroke: '#3b4650', 'stroke-width': 60 }));
    const circuito = [...s.m.destinos, s.m.destinos[0]].map((d) => `${d.xM},${-d.zM}`).join(' ');
    host.append(svg('polyline', { points: circuito, fill: 'none', stroke: 'rgba(255,255,255,.35)', 'stroke-width': 70, 'stroke-dasharray': '300 240' }));
    const pontos = s.m.destinos.map((d) => {
      const g = svg('g');
      g.append(svg('circle', { cx: d.xM, cy: -d.zM, r: 380, fill: 'none', stroke: '#9fa9b2', 'stroke-width': 70 }));
      const t = svg('text', { x: d.xM + 520, y: -d.zM + 180, fill: '#cfd6dc', 'font-size': 700, 'font-family': 'IBM Plex Mono, monospace' });
      t.textContent = textoUI(NOMES_CIRCUITO[d.id] ?? d.id).replace('Francisco Sá Carneiro Airport', 'Sá Carneiro');
      g.append(t);
      host.append(g);
      return { id: d.id, circulo: g.firstChild };
    });
    const trilho = svg('polyline', { fill: 'none', stroke: 'rgba(255,255,255,.55)', 'stroke-width': 60 });
    const ameacas = svg('g');
    const aviao = svg('path', { d: 'M0,-700 L420,500 L0,260 L-420,500 Z', fill: '#f4f6f8' });
    host.append(trilho, ameacas, aviao);
    s.mapa = { trilho, ameacas, aviao, pontos };
  }

  function actualizarMapa() {
    if (!s.mapa) return;
    const v = s.m.voo;
    const ultimo = s.trilho.at(-1);
    if (!ultimo || v.tempoS - ultimo.t >= 1) {
      s.trilho.push({ t: v.tempoS, x: v.xM, z: v.zM });
      if (s.trilho.length > 600) s.trilho.shift();
    }
    s.mapa.trilho.setAttribute('points', s.trilho.map((p) => `${p.x},${-p.z}`).join(' '));
    s.mapa.aviao.setAttribute('transform', `translate(${v.xM},${-v.zM}) rotate(${(v.rumoRad * 180) / Math.PI})`);
    for (const p of s.mapa.pontos) p.circulo.setAttribute('stroke', p.id === s.m.destinoId ? '#f4f6f8' : '#5d6770');
    s.mapa.ameacas.replaceChildren(...s.m.ameacas.map((a) => {
      const g = svg('g');
      g.append(svg('circle', { cx: a.xM, cy: -a.zM, r: Math.max(150, raioEfectivoM(a)), fill: 'rgba(240,164,49,.18)', stroke: '#f0a431', 'stroke-width': 50 }));
      if (!a.cilindro) g.append(svg('line', { x1: a.xM, y1: -a.zM, x2: a.xM + a.vxMs * 30, y2: -(a.zM + a.vzMs * 30), stroke: '#f0a431', 'stroke-width': 50, 'stroke-dasharray': '160 120' }));
      return g;
    }));
  }

  function actualizarSom() {
    if (s.pausa || s.fim || document.hidden) { som.suspender(); return; }
    som.retomar();
    const m = s.mundo;
    const dist = m?.camera && m?.aviao ? m.camera.position.distanceTo(m.aviao.position) : 25;
    som.actualizar({ potencia: s.m.voo.potencia ?? s.m.voo.acelerador ?? 0.55, motores:s.m.voo.motores, velocidadeMs: s.m.voo.velocidadeMs, distanciaCamaraM: dist });
  }

  function mostrarFim() {
    s.fim = true;
    cancelarPedidosJev();
    const [titulo, texto] = RESULTADOS[s.m.resultado] ?? ['Flight complete.', '—'];
    $('sim-fim-titulo').textContent = titulo;
    const seps = s.m.separacoes;
    const margem = seps.length ? Math.min(...seps.map((r) => r.minimaM - r.limiteM)) : null;
    $('sim-fim-texto').textContent = `${texto} Flight time ${tempo(s.m.voo.tempoS)}, ${s.m.pontosPassados.length} waypoints, ${seps.length} hazards passed${margem == null ? '' : `, minimum clearance ${margem} m`}; protection intervened ${s.supervisor}×.`;
    $('sim-fim').hidden = false;
    $('sim-repetir').focus();
  }

  function quadro(t) {
    if (!s.m) return;
    s.raf = requestAnimationFrame(quadro);
    const dt = Math.min(0.1, lab.remaining(), Math.max(0, (t - s.ultimo) / 1000));
    const previousFlight=s.m.voo;
    const agl=previousFlight.altitudeM-alturaTerreno(perfilTerreno(s.m.cenario),-previousFlight.xM,previousFlight.zM);
    assinatura.actualizar(dt,{activa:!s.pausa&&!s.m.resultado,ocupado:previousFlight.stall||s.m.ameacaAtiva!=null||(!previousFlight.emSolo&&agl<120)||(previousFlight.emSolo&&previousFlight.velocidadeMs>10)||previousFlight.fonteActuacao==='supervisor'});
    s.ultimo = t;
    if (!s.pausa && !s.m.resultado) {
      if (s.m.piloto.tipo === 'jev-gravado') comandos.gamepad();
      if (s.m.piloto.tipo === 'jev-gravado' && s.gravacao) {
        const r = reproduzir(s.m, s.gravacao, s.cursor, dt);
        s.m = r.m;
        s.cursor = r.cursor;
        for (const e of r.eventos) {
          if (e.tipo === 'leitura') $('sim-estado').textContent = textoEstadoUI(e.estado);
          else mostrarDecisaoGravada(e.decisao);
        }
        if (s.cursor.i >= s.gravacao.decisoes.length && !s.m.resultado) s.m = { ...s.m, resultado: 'fim_gravacao' };
        contarSupervisor();
        lab.actualizar(s.m,{previousFlight});
        desenhar(dt);
        if (t - s.ultimoUI > 100) { s.ultimoUI = t; actualizarLampadas(); actualizarHud(); actualizarContadores(); actualizarMapa(); actualizarSom(); }
        if (s.m.resultado && !s.fim) mostrarFim();
        return;
      }
      if (s.m.piloto.tipo !== 'humano') comandos.gamepad();
      if (s.m.piloto.tipo === 'humano') aplicarHumano();
      else if (s.jev) {
        if (!(s.m.aiLanding && s.m.voo.emSolo) && pedidosAoVivo >= LIMITE_PEDIDOS_JEV) interromperJev('This visit has reached its live AI request allowance.');
        else if (!(s.m.aiLanding && s.m.voo.emSolo) && deveDespacharPasso(s.jev.pipeline, t)) despacharJev(t);
      }
      s.m = avancarMissao(s.m, dt);
      contarSupervisor();
    }
    lab.actualizar(s.m,{previousFlight});
    desenhar(dt);
    if (t - s.ultimoUI > 100) {
      s.ultimoUI = t;
      actualizarLampadas();
      actualizarHud();
      actualizarContadores();
      actualizarMapa();
      actualizarSom();
    }
    if (s.m.resultado && !s.fim) mostrarFim();
  }

  function ajustar() {
    const r = $('sim-canvas').getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return;
    const instrumentosEl = $('sim-instrumentos');
    const comandos = $('screen-sim').querySelector('.sim-comandos').getBoundingClientRect();
    instrumentosEl.style.bottom = `${Math.max(0, r.bottom - comandos.top) + 16}px`;
    cockpit.resize();
    if (!s.mundo) return;
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    s.api.redimensionar(s.mundo, w, h);
    // Reserva a parte inferior para instrumentos sem esconder o avião atrás deles.
    const painel = $('sim-instrumentos').getBoundingClientRect();
    const deslocamento = desvioDoPainel({visible:instrumentosVisiveis,viewportHeight:h,coveredHeight:r.bottom-painel.top});
    if(instrumentosVisiveis) s.mundo.camera.setViewOffset(w,h,0,deslocamento,w,h);
    else s.mundo.camera.clearViewOffset();
  }

  function largarMundo() {
    ++pedidoFoto;
    $('sim-aerial-credit').hidden=true;
    try { if (s.mundo) s.api?.largarCena(s.mundo); } catch { /* sair nunca falha por causa da GPU */ }
    s.mundo = null;
  }

  function definirPausa(p) {
    s.teclas.clear();
    s.toque.clear();
    s.verticalSeleccionada = 'manter';
    comandos.limpar();
    if(s.m?.piloto.tipo === 'humano') s.m = { ...s.m, piloto: { ...s.m.piloto, ateS: 0 } };
    if(p && s.jev) {cancelarPedidosJev();s.jev={...s.jev,pedidos:new Map(),pipeline:novoJev(Boolean(s.m?.aiLanding)).pipeline};}
    s.pausa = Boolean(p);
    $('sim-pausa').textContent = s.pausa ? 'Resume [P]' : 'Pause [P]';
  }

  async function iniciar({ semente = 222, piloto = 'humano', objectivo = 'aterrar', desdeS = 0, exercicio = 'livre', tempo = 'poucas_nuvens', ambiente = {}, primeiroVoo=false, guiaVisual=false, comparacao=false } = {}) {
    const gen = ++s.geracao;
    cockpit.parar();
    cancelAnimationFrame(s.raf);
    cancelarPedidosJev();
    s.jev = null;
    s.gravado = null;
    let gravacao = null;
    if (piloto === 'jev-gravado') {
      try { gravacao = await carregarGravacao(); } catch { piloto = 'humano'; }
      if (gen !== s.geracao) return;
    }
    try { s.m = gravacao ? iniciarReproducao(gravacao) : criarVooProgressivo(semente, { exercicio, tempo, ambiente }); }
    catch { gravacao = null; piloto = 'humano'; s.m = criarVooProgressivo(semente, { exercicio, tempo, ambiente }); }
    if(comparacao) { s.m={...s.m,controlos:{...novosControlos(),flaps:s.m.voo.flaps??0}}; s.ordens=''; $('sim-ordens').value=''; $('sim-ordem-activa').textContent='No instructions.'; }
    $('sim-ai-objective').value=comparacao?'rota':objectivo;
    comandos.iniciar();
    s.cursor = { i: 0, lido: false };
    if (gravacao) s.gravado = { decisoes: 0, custoUsd: 0, latencias: [] };
    s.decisaoVisivel = null;
    s.fim = false; s.trilho = []; s.supervisor = 0; s.ultimoSupervisor = null; s.ultimoFoco = -Infinity;
    $('sim-julgamentos').replaceChildren(document.createTextNode('You have the controls. Select AI control to let JEV fly and see its decisions.'));
    $('sim-julgamentos').classList.add('sim-vazio');
    $('sim-meta').textContent = '';
    $('sim-estado').textContent = '—';
    s.teclas.clear(); s.toque.clear();
    definirPausa(false);
    $('sim-fim').hidden = true;
    $('sim-camara').textContent = 'Camera: Chase [C]';
    marcarPiloto(gravacao ? 'jev-gravado' : 'humano');
    if (gravacao && desdeS > 0) saltarGravacao(Math.min(desdeS, (gravacao.duracaoS ?? 0) - 5));
    if (piloto === 'jev') {
      if(comparacao&&(!gatewayDisponivel()||pedidosAoVivo>=LIMITE_PEDIDOS_JEV)) { comparacao=false; avisar('Live AI is unavailable. You have the controls.'); }
      else entregarAoJev(comparacao?'rota':objectivo);
    }
    assinatura.reiniciar();
    lab.iniciar(s.m,{primeiroVoo,guiaVisual,comparacao});
    mostrar('sim');
    cockpit.iniciar();
    largarMundo();
    try {
      const api = await carregarMundo();
      if (gen !== s.geracao) return;
      s.api = api;
      s.mundo = api.criarCena($('sim-canvas'), {
        leve: api.perfilGraficoLeve(),
        cenario: s.m.cenario,
        pose: poseMissao(s.m.voo, null),
        pistas: pistasDaMissao(s.m.pistas).map((p,i)=>({...p,comprimentoM:s.m.pistas[i].pistaM,heading:-(s.m.pistas[i].rumoRad??0)})),
        apresentacao: true,
        destinos: s.m.destinos,
        nomesDestinos: Object.fromEntries(Object.entries(NOMES_CIRCUITO).map(([id, nome]) => [id, textoUI(nome)])),
        luzDia: s.m.ambiente.luzDia !== false,
        periodo: s.m.ambiente.periodo,
      });
      ajustar();
      void aplicarFoto();
    } catch {
      s.mundo = null;
      $('sim-canvas').style.background = 'linear-gradient(155deg,#090b0e,#20262c 55%,#454d55)';
    }
    prepararMapa();
    s.ultimo = performance.now();
    s.raf = requestAnimationFrame(quadro);
  }

  function sair() {
    assinatura.reiniciar();
    cockpit.parar();
    cancelarPedidosJev();
    ++s.geracao;
    cancelAnimationFrame(s.raf);
    largarMundo();
    som.suspender();
    s.m = null;
    aoSair();
  }

  function activo() {
    return Boolean(s.m) && document.getElementById('screen-sim').classList.contains('active');
  }

  // Teclado: só com o ecrã do simulador à vista.
  addEventListener('keydown', (e) => {
    if (!activo() || e.metaKey || e.altKey || e.target?.closest?.('input, textarea, select, [contenteditable="true"], summary')) return;
    if (TECLAS.has(e.code)) {
      e.preventDefault();
      if (!assumirComandos()) return;
      comandos.preparar();
      if (['ArrowUp', 'ArrowDown', 'KeyW', 'KeyS'].includes(e.code)) { s.verticalSeleccionada = 'manter'; comandos.cancelarEixo('vertical'); }
      if (['ArrowLeft','ArrowRight','KeyA','KeyD','KeyZ','KeyX'].includes(e.code)) comandos.cancelarEixo('lateral');
      if (['KeyE','KeyQ','ShiftLeft','ShiftRight','ControlLeft','ControlRight'].includes(e.code)) comandos.cancelarEixo('potencia');
      s.teclas.add(e.code);
    }
    else if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); if (!s.fim) definirPausa(!s.pausa); }
    else if (e.code === 'KeyL' && !e.repeat) { e.preventDefault(); document.querySelector('#sim-actuacao [data-valor=manter]').click(); }
    else if (e.code === 'KeyC') $('sim-camara').click();
    else if (e.code === 'KeyI' && !e.repeat) { e.preventDefault(); definirInstrumentos(!instrumentosVisiveis); }
  });
  addEventListener('keyup', (e) => { s.teclas.delete(e.code); });
  addEventListener('blur', () => { s.teclas.clear(); s.toque.clear(); s.verticalSeleccionada = 'manter'; comandos.limpar(); if(s.m?.piloto.tipo === 'humano') s.m = { ...s.m, piloto: { ...s.m.piloto, ateS: 0 } }; });
  addEventListener('resize', ajustar);
  document.addEventListener('visibilitychange', () => { if (document.hidden && activo()) definirPausa(true); });

  function assumirComandos(configuracao = false) {
    if (!activo() || (s.pausa && !configuracao) || s.fim) return false;
    if (s.m.piloto.tipo !== 'humano') pararJev('You have taken the controls.');
    return true;
  }

  // Clique (inclui toque, Enter e Espaço): selecciona uma intenção vertical persistente.
  for (const b of document.querySelectorAll('#sim-actuacao [data-eixo="vertical"]')) {
    b.addEventListener('click', () => {
      if (!assumirComandos()) return;
      comandos.preparar(); comandos.cancelarEixo('vertical');
      if(comandos.vertical(b.dataset.valor)) { actualizarLampadas(); actualizarHud(); return; }
      s.verticalSeleccionada = seleccionarVertical(s.verticalSeleccionada, b.dataset.valor);
      // Nivelar deve cancelar já a ordem anterior, sem aguardar a retenção.
      s.m = { ...s.m, piloto: darOrdem(s.m.piloto, { ...ordemHumana(s.teclas, s.verticalSeleccionada, s.toque), fonte: 'humano' }, s.m.voo.tempoS, RETENCAO_HUMANO_S) };
      actualizarLampadas();
      actualizarHud();
    });
  }

  // Lateral e potência continuam a actuar enquanto se segura o botão.
  for (const b of document.querySelectorAll('#sim-actuacao [data-eixo]:not([data-eixo="vertical"])')) {
    const largar = () => { if (s.toque.get(b.dataset.eixo) === b.dataset.valor) s.toque.delete(b.dataset.eixo); };
    b.addEventListener('pointerdown', (e) => {
      if (!assumirComandos()) return;
      comandos.preparar(); comandos.cancelarEixo(b.dataset.eixo);
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      s.toque.set(b.dataset.eixo, b.dataset.valor);
    });
    b.addEventListener('pointerup', largar);
    b.addEventListener('pointercancel', largar);
    b.addEventListener('lostpointercapture', largar);
  }

  function definirInstrumentos(visivel) {
    instrumentosVisiveis=visivel;
    cockpit.setVisible(visivel);
    guardarPainel(storage,visivel);
    $('sim-instrumentos-toggle').textContent=visivel?'Hide panel [I]':'Show panel [I]';
    $('sim-instrumentos-toggle').setAttribute('aria-expanded',String(visivel));
    requestAnimationFrame(ajustar);
  }
  $('sim-instrumentos-toggle').addEventListener('click',()=>definirInstrumentos(!instrumentosVisiveis));

  function definirPainel(aberto) {
    $('sim-painel').hidden = !aberto;
    $('screen-sim').classList.toggle('sem-painel', !aberto);
    $('sim-painel-toggle').setAttribute('aria-expanded', String(aberto));
    requestAnimationFrame(() => { ajustar(); if(aberto && window.innerWidth <= 760) $('sim-painel').scrollIntoView({block:'start'}); });
  }

  $('sim-voltar-voo').addEventListener('click', () => { painelManual = true; definirPainel(false); $('screen-sim').scrollTo({top:0}); });
  $('sim-painel-toggle').addEventListener('click', () => {
    painelManual = true;
    definirPainel($('sim-painel').hidden);
  });

  $('sim-pausa').addEventListener('click', () => { if (!s.fim) definirPausa(!s.pausa); });
  $('sim-camara').addEventListener('click', () => {
    if (!s.mundo) return;
    $('sim-camara').textContent = `Camera: ${{ cauda: 'Chase', cockpit: 'Cockpit', lado: 'Side', cinema: 'Cinema', livre: 'Free' }[s.api.alternarCamara(s.mundo)]} [C]`;
  });
  $('sim-sair').addEventListener('click', sair);
  $('sim-fim-sair').addEventListener('click', sair);
  $('sim-repetir').addEventListener('click', () => { ligarSomAgora(); void iniciar({ semente: (s.m?.semente ?? 222) + 1, piloto: s.m?.piloto.tipo ?? 'humano', objectivo:$('sim-ai-objective').value, exercicio:s.m?.treino?.tipo??'livre', tempo:s.m?.ambiente.tempo??'poucas_nuvens', ambiente:s.m?.ambiente??{} }); });
  $('sim-piloto-humano').addEventListener('click', () => { if (s.m && s.m.piloto.tipo !== 'humano') pararJev('You have retaken the controls.'); });
  $('sim-ai-start').addEventListener('click',()=>entregarAoJev());
  $('sim-ai-objective').addEventListener('change',()=>{if(s.m?.piloto.tipo==='jev')entregarAoJev();});
  $('sim-ai-go-around').addEventListener('click',()=>{if(s.m?.aiLanding&&!s.m.voo.emSolo){s.m=pedirBorregoAI(s.m);}});
  $('sim-ai-takeover').addEventListener('click',()=>{if(s.m?.piloto.tipo!=='humano')pararJev('You have taken the controls.');});
  $('sim-piloto-jev').addEventListener('click', () => { if (s.m?.piloto.tipo === 'humano') entregarAoJev(); });
  const darOrdens = (texto) => {
    s.ordens = limparOrdens(texto);
    $('sim-ordens').value = s.ordens;
    $('sim-ordem-activa').textContent = s.ordens ? `Active instruction: “${s.ordens}”` : 'No instructions.';
  };
  $('sim-ordens-form').addEventListener('submit', (e) => { e.preventDefault(); darOrdens($('sim-ordens').value); });
  for (const b of document.querySelectorAll('#sim-atalhos button')) b.addEventListener('click', () => darOrdens(b.textContent));
  $('sim-som').setAttribute('aria-pressed', String((() => { try { return localStorage.getItem('lus222-som') !== 'desligado'; } catch { return true; } })()));
  $('sim-som').addEventListener('click', () => {
    const ligar = $('sim-som').getAttribute('aria-pressed') !== 'true';
    $('sim-som').setAttribute('aria-pressed', String(ligar));
    som.silenciar(!ligar);
    try { localStorage.setItem('lus222-som', ligar ? 'ligado' : 'desligado'); } catch { /* só nesta página */ }
    if (ligar && activo()) som.ligar();
  });

  return { iniciar, sair, activo, liveAvailable:()=>gatewayDisponivel()&&pedidosAoVivo<LIMITE_PEDIDOS_JEV, ligarSom: ligarSomAgora, estado: () => s };
}
