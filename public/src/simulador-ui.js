import { poseMissao } from './escala.js';
import { avancarMissao, vooInterpolado } from './simulacao.js';
import { criarVooLivre, NOMES_CIRCUITO } from './simulador.js';
import { actuacaoDeManobra, actuacaoEfectiva, darOrdem, ordemDeTeclas, POTENCIAS, RETENCAO_HUMANO_S, RETENCAO_JEV_S } from './piloto-sim.js';
import { estadoPiloto, limparOrdens, textoEstado } from './estado-piloto.js';
import { concluirPasso, deveDespacharPasso, falharPasso, metricasPiloto, novoPipelinePiloto, reservarPasso } from './piloto-corredor.js';
import { actualizarPainel, decimal } from './painel-jev.js';
import { pontosFitaRota, setaManobra } from './rota-visual.js';
import { alturaTerreno, perfilTerreno, pistasDaMissao, prepararPistas } from './relevo.js';
import { raioEfectivoM } from './ameacas.js';

/**
 * Ecrã do simulador: o motor da missão com o piloto aos comandos (humano ou
 * JEV), o mundo 3D, a actuação acesa, os contadores e o mapa. O relógio corre
 * a 1×, sempre: o mundo não espera por ninguém.
 */
const $ = (id) => document.getElementById(id);
const TECLAS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyE', 'KeyQ', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight']);
const RESULTADOS = {
  limite_altitude: ['Colisão com o terreno.', 'O LUS-222 desceu até ao chão fora de uma pista.'],
  separacao_perdida: ['Separação perdida.', 'Uma ameaça entrou no perímetro de protecção.'],
  combustivel_esgotado: ['Sem combustível.', 'O voo terminou por falta de combustível.'],
  chegou: ['Aterrou em Sá Carneiro.', 'O LUS-222 pousou na pista do Francisco Sá Carneiro.'],
  tempo_esgotado: ['Tempo esgotado.', 'O voo livre chegou ao limite de tempo.'],
};
const MAPA = { x0: -19000, z1: 168000, lado: 31000 };
// JEV piloto: ~3 pedidos por segundo, dois em voo, 0,042 USD por milhão de tokens de entrada.
const INTERVALO_JEV_MS = 330;
const CUSTO_TOKEN_USD = 0.042 / 1e6;
const LIMITE_AO_VIVO_MS = 5 * 60 * 1000;
// Uma resposta sobre um estado com mais de 1,5 s de simulação já não comanda.
const IDADE_MAX_S = 1.5;

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
    teclas: new Set(), toque: new Map(), trilho: [], supervisor: 0, ultimoSupervisor: null,
    ultimoFoco: -Infinity, geracao: 0, mapa: null,
    ordens: '', jev: null, aviso: null,
  };
  // O tempo de voo ao vivo do JEV conta por visita (página), não por voo.
  let aoVivoMs = 0;

  function novoJev() {
    return { pipeline: novoPipelinePiloto({ intervaloMs: INTERVALO_JEV_MS, maxEmVoo: 2 }), pedidos: new Map(), falhas: 0, decisoes: 0, custoUsd: 0 };
  }

  function avisar(texto) {
    s.aviso = texto;
    $('sim-meta').textContent = texto;
  }

  function cancelarPedidosJev() {
    for (const ctrl of s.jev?.pedidos.values() ?? []) ctrl.abort();
    s.jev?.pedidos.clear();
  }

  function marcarPiloto(tipo) {
    $('sim-piloto-humano').setAttribute('aria-pressed', String(tipo === 'humano'));
    $('sim-piloto-jev').setAttribute('aria-pressed', String(tipo === 'jev'));
    $('sim-fonte').textContent = tipo === 'jev' ? 'O JEV pilota · ao vivo · Porto, noite de São João' : 'Piloto humano · voo livre · Porto, noite de São João';
  }

  /** Volta a pôr o humano aos comandos; o JEV deixa de receber pedidos. */
  function pararJev(motivo) {
    cancelarPedidosJev();
    if (s.m) s.m = { ...s.m, piloto: { ...s.m.piloto, tipo: 'humano', fonte: 'humano' } };
    marcarPiloto('humano');
    if (motivo) avisar(motivo);
  }

  function entregarAoJev() {
    if (!s.m) return;
    if (!gatewayDisponivel()) { avisar('Sem ligação ao JEV neste momento: continua o piloto humano.'); return; }
    if (aoVivoMs >= LIMITE_AO_VIVO_MS) { avisar('Terminaram os 5 minutos de voo ao vivo do JEV nesta visita.'); return; }
    s.jev = novoJev();
    s.m = { ...s.m, piloto: { ...s.m.piloto, tipo: 'jev', fonte: 'jev' } };
    s.teclas.clear();
    s.toque.clear();
    marcarPiloto('jev');
    avisar('O JEV assumiu os comandos…');
  }

  function despacharJev(agora) {
    const estado = estadoPiloto(s.m, { ordens: s.ordens });
    $('sim-estado').textContent = textoEstado(estado);
    const ticket = reservarPasso(s.jev.pipeline, { estado, tempoS: s.m.voo.tempoS, passo: s.m.passo }, agora);
    void pedirJev(ticket, s.geracao, s.jev);
  }

  async function pedirJev(ticket, gen, jev) {
    const ctrl = new AbortController();
    jev.pedidos.set(ticket.id, ctrl);
    const limite = setTimeout(() => ctrl.abort(), 3500);
    try {
      const r = await fetch('/api/jev', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ momento: 'piloto', estado: ticket.entrada.estado }), signal: ctrl.signal });
      const d = await r.json().catch(() => ({}));
      if (d.erro === 'limite' || r.status === 429) throw Object.assign(new Error('Limite de voo ao vivo atingido.'), { codigo: 'limite' });
      if (!r.ok || d.fonte !== 'jev') throw new Error(d.mensagem || 'O JEV não respondeu.');
      if (!respostaValida(d.answers, ticket.entrada.estado)) throw new Error('Resposta do JEV fora do contrato.');
      if (gen !== s.geracao || jev !== s.jev) return;
      aplicarJev(ticket, d);
    } catch (e) {
      if (gen !== s.geracao || jev !== s.jev) return;
      falharJev(ticket, e);
    } finally {
      clearTimeout(limite);
      jev.pedidos.delete(ticket.id);
    }
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
    if (s.m.voo.tempoS - ticket.entrada.tempoS > IDADE_MAX_S) return;
    const eixos = actuacaoDeManobra(d.answers.manobra.choice);
    s.m = { ...s.m, piloto: darOrdem(s.m.piloto, { ...eixos, potencia: d.answers.potencia.choice, fonte: 'jev' }, s.m.voo.tempoS, RETENCAO_JEV_S) };
  }

  function falharJev(ticket, erro) {
    const jev = s.jev;
    falharPasso(jev.pipeline, ticket.id, erro, performance.now());
    if (erro.codigo === 'limite') { pararJev('Limite de voo ao vivo atingido: continua o piloto humano.'); return; }
    jev.falhas += 1;
    jev.pipeline.proximoEm = Math.max(jev.pipeline.proximoEm, performance.now() + Math.min(8000, 400 * 2 ** jev.falhas));
    if (jev.falhas >= 5) { pararJev(`Cinco pedidos seguidos sem resposta do JEV (${erro.message}); continua o piloto humano.`); return; }
    avisar(`Sem resposta do JEV (${erro.message}); o avião estabiliza e o supervisor vigia.`);
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
      pontosRota: pontosFitaRota(voo, destino),
      destinoAtivoId: s.m.destinoId,
      distanciasKm: Object.fromEntries(s.m.destinos.map((d) => [d.id, Math.hypot(d.xM - voo.xM, d.zM - voo.zM) / 1000])),
      reserva: 'ok',
      seta: setaManobra(c),
      autor: c.fonte === 'supervisor' ? 'supervisor' : 'jev',
      raioBaloesM: null,
    };
  }

  function desenhar(dt) {
    const { api, mundo } = s;
    if (!mundo) return;
    try {
      const voo = vooInterpolado(s.m);
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
      api.actualizarCamara(mundo, pose, dt);
      api.actualizarCena(mundo, { pose: absoluta, poseLocal: pose, ambiente: s.m.ambiente, marcas: marcas(voo) }, s.pausa ? 0 : dt);
      mundo.renderer.render(mundo.scene, mundo.camera);
    } catch { /* uma falha visual não pára o voo */ }
  }

  function aplicarHumano() {
    const ordem = ordemDeTeclas(s.teclas);
    for (const [eixo, valor] of s.toque) ordem[eixo] = valor;
    if (ordem.lateral === 'nivelar' && ordem.vertical === 'manter' && ordem.potencia === 'manter') return;
    s.m = { ...s.m, piloto: darOrdem(s.m.piloto, { ...ordem, fonte: 'humano' }, s.m.voo.tempoS, RETENCAO_HUMANO_S) };
  }

  function contarSupervisor() {
    const sup = s.m.piloto.supervisor;
    if (sup && sup !== s.ultimoSupervisor && s.m.voo.tempoS < sup.ateS) s.supervisor += 1;
    s.ultimoSupervisor = sup;
  }

  function actualizarLampadas() {
    const a = actuacaoEfectiva(s.m.piloto, s.m.voo.tempoS);
    for (const b of document.querySelectorAll('#sim-actuacao [data-eixo]')) b.classList.toggle('is-on', a[b.dataset.eixo] === b.dataset.valor);
    $('sim-supervisor').classList.toggle('is-on', a.fonte === 'supervisor');
    $('sim-supervisor').textContent = a.fonte === 'supervisor' ? (a.motivo === 'terreno' ? 'SUPERVISOR · TERRENO' : 'SUPERVISOR · TCAS') : 'SUPERVISOR';
  }

  function actualizarHud() {
    const v = s.m.voo;
    $('sim-vel').textContent = Math.round(v.velocidadeMs * 1.94384);
    $('sim-alt').textContent = Math.round(v.altitudeM * 3.28084).toLocaleString('pt-PT');
    $('sim-rumo').textContent = String(Math.round(((v.rumoRad * 180) / Math.PI % 360 + 360) % 360)).padStart(3, '0');
    $('sim-pot').textContent = Math.round((v.acelerador ?? 0.55) * 100);
    $('sim-fuel').textContent = Math.round(v.combustivelKg);
    const d = s.m.destinos.find((x) => x.id === s.m.destinoId);
    const km = Math.hypot(d.xM - v.xM, d.zM - v.zM) / 1000;
    $('sim-objetivo').textContent = `Próximo: ${NOMES_CIRCUITO[d.id] ?? d.id} · ${km.toFixed(1).replace('.', ',')} km · ${s.m.pontosPassados.length} pontos passados`;
  }

  function actualizarContadores() {
    const seps = s.m.separacoes;
    const margem = seps.length ? Math.min(...seps.map((r) => r.minimaM - r.limiteM)) : null;
    const itens = [
      ['TEMPO', tempo(s.m.voo.tempoS)],
      ['PILOTO', s.m.piloto.tipo === 'jev' ? 'JEV' : 'Humano'],
      ['AMEAÇAS PASSADAS', seps.length],
      ['MARGEM MÍNIMA', margem == null ? '—' : `${margem} m`],
      ['SUPERVISOR', `${s.supervisor}×`],
      ['EM VOO', s.m.ameacas.length],
    ];
    if (s.jev) {
      const met = metricasPiloto(s.jev.pipeline, performance.now());
      itens.push(
        ['DECISÕES JEV', s.jev.decisoes],
        ['DECISÕES/S', decimal((met.decisoes_por_minuto ?? 0) / 60).replace(/0$/, '')],
        ['LATÊNCIA P50', met.latencia_mediana_ms == null ? '—' : `${met.latencia_mediana_ms} ms`],
        ['CUSTO', `${s.jev.custoUsd.toFixed(4).replace('.', ',')} USD`],
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
      t.textContent = NOMES_CIRCUITO[d.id]?.replace('Aeroporto Francisco ', '') ?? d.id;
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
    som.actualizar({ potencia: s.m.voo.acelerador ?? 0.55, velocidadeMs: s.m.voo.velocidadeMs, distanciaCamaraM: dist });
  }

  function mostrarFim() {
    s.fim = true;
    cancelarPedidosJev();
    const [titulo, texto] = RESULTADOS[s.m.resultado] ?? ['Fim do voo.', '—'];
    $('sim-fim-titulo').textContent = titulo;
    const seps = s.m.separacoes;
    const margem = seps.length ? Math.min(...seps.map((r) => r.minimaM - r.limiteM)) : null;
    $('sim-fim-texto').textContent = `${texto} ${tempo(s.m.voo.tempoS)} de voo, ${s.m.pontosPassados.length} pontos do circuito, ${seps.length} ameaças passadas${margem == null ? '' : `, margem mínima ${margem} m`}; o supervisor interveio ${s.supervisor}×.`;
    $('sim-fim').hidden = false;
    $('sim-repetir').focus();
  }

  function quadro(t) {
    if (!s.m) return;
    s.raf = requestAnimationFrame(quadro);
    const dt = Math.min(0.1, Math.max(0, (t - s.ultimo) / 1000));
    s.ultimo = t;
    if (!s.pausa && !s.m.resultado) {
      if (s.m.piloto.tipo === 'humano') aplicarHumano();
      else if (s.jev) {
        aoVivoMs += dt * 1000;
        if (aoVivoMs >= LIMITE_AO_VIVO_MS) pararJev('Terminaram os 5 minutos de voo ao vivo do JEV nesta visita: continua o piloto humano.');
        else if (deveDespacharPasso(s.jev.pipeline, t)) despacharJev(t);
      }
      s.m = avancarMissao(s.m, dt);
      contarSupervisor();
    }
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
    if (!s.mundo) return;
    const r = $('sim-canvas').getBoundingClientRect();
    if (r.width > 1 && r.height > 1) s.api.redimensionar(s.mundo, Math.round(r.width), Math.round(r.height));
  }

  function largarMundo() {
    try { if (s.mundo) s.api?.largarCena(s.mundo); } catch { /* sair nunca falha por causa da GPU */ }
    s.mundo = null;
  }

  function definirPausa(p) {
    s.pausa = Boolean(p);
    $('sim-pausa').textContent = s.pausa ? 'Continuar' : 'Pausar';
  }

  async function iniciar({ semente = 222, piloto = 'humano' } = {}) {
    const gen = ++s.geracao;
    cancelAnimationFrame(s.raf);
    cancelarPedidosJev();
    s.jev = null;
    s.m = criarVooLivre(semente, { piloto: 'humano' });
    s.fim = false; s.trilho = []; s.supervisor = 0; s.ultimoSupervisor = null; s.ultimoFoco = -Infinity;
    $('sim-julgamentos').replaceChildren(document.createTextNode('Com «Humano» aos comandos o JEV não decide. Escolhe «JEV» em cima para ele pilotar.'));
    $('sim-julgamentos').classList.add('sim-vazio');
    $('sim-meta').textContent = '';
    $('sim-estado').textContent = '—';
    s.teclas.clear(); s.toque.clear();
    definirPausa(false);
    $('sim-fim').hidden = true;
    marcarPiloto('humano');
    if (piloto === 'jev') entregarAoJev();
    mostrar('sim');
    largarMundo();
    try {
      const api = await carregarMundo();
      if (gen !== s.geracao) return;
      s.api = api;
      s.mundo = api.criarCena($('sim-canvas'), {
        leve: api.perfilGraficoLeve(),
        cenario: s.m.cenario,
        pose: poseMissao(s.m.voo, null),
        pistas: pistasDaMissao(s.m.pistas),
        apresentacao: true,
        destinos: s.m.destinos,
        nomesDestinos: NOMES_CIRCUITO,
      });
      ajustar();
    } catch {
      s.mundo = null;
      $('sim-canvas').style.background = 'linear-gradient(155deg,#090b0e,#20262c 55%,#454d55)';
    }
    prepararMapa();
    s.ultimo = performance.now();
    s.raf = requestAnimationFrame(quadro);
  }

  function sair() {
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
    if (!activo() || e.target?.closest?.('input, textarea')) return;
    if (TECLAS.has(e.code)) { s.teclas.add(e.code); e.preventDefault(); }
    else if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); if (!s.fim) definirPausa(!s.pausa); }
    else if (e.code === 'KeyC') $('sim-camara').click();
  });
  addEventListener('keyup', (e) => { s.teclas.delete(e.code); });
  addEventListener('blur', () => s.teclas.clear());
  addEventListener('resize', ajustar);
  document.addEventListener('visibilitychange', () => { if (document.hidden && activo()) definirPausa(true); });

  // Toque e rato nas lâmpadas: carregar é segurar a ordem.
  for (const b of document.querySelectorAll('#sim-actuacao [data-eixo]')) {
    const largar = () => { if (s.toque.get(b.dataset.eixo) === b.dataset.valor) s.toque.delete(b.dataset.eixo); };
    b.addEventListener('pointerdown', (e) => {
      if (s.m?.piloto.tipo !== 'humano') return;
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      s.toque.set(b.dataset.eixo, b.dataset.valor);
    });
    b.addEventListener('pointerup', largar);
    b.addEventListener('pointercancel', largar);
    b.addEventListener('lostpointercapture', largar);
  }

  $('sim-pausa').addEventListener('click', () => { if (!s.fim) definirPausa(!s.pausa); });
  $('sim-camara').addEventListener('click', () => {
    if (!s.mundo) return;
    $('sim-camara').textContent = `Câmara: ${s.api.alternarCamara(s.mundo)}`;
  });
  $('sim-sair').addEventListener('click', sair);
  $('sim-fim-sair').addEventListener('click', sair);
  $('sim-repetir').addEventListener('click', () => { ligarSomAgora(); void iniciar({ semente: (s.m?.semente ?? 222) + 1, piloto: s.m?.piloto.tipo ?? 'humano' }); });
  $('sim-piloto-humano').addEventListener('click', () => { if (s.m?.piloto.tipo === 'jev') pararJev('O humano retomou os comandos.'); });
  $('sim-piloto-jev').addEventListener('click', () => { if (s.m?.piloto.tipo !== 'jev') entregarAoJev(); });
  const darOrdens = (texto) => {
    s.ordens = limparOrdens(texto);
    $('sim-ordens').value = s.ordens;
    $('sim-ordem-activa').textContent = s.ordens ? `Ordem activa: «${s.ordens}»` : 'Sem ordens.';
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

  return { iniciar, sair, activo, ligarSom: ligarSomAgora, estado: () => s };
}
