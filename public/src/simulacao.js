import { mulberry32, offsetLateral } from './decisao.js';

/** Parâmetros ilustrativos, não são dados certificados do LUS-222. */
export const PERFIL = Object.freeze({
  versao: 'ilustrativo-3',
  massaVaziaKg: 8500,
  areaAsaM2: 45,
  clMax: 2.8,
  cd0: 0.035,
  kInduzido: 0.055,
  empuxoMaxN: 26000,
  combustivelMaxKg: 1800,
  velocidadeMaxMs: 115,
  passoS: 0.1,
});
// Consumo de planeamento (kg/s), o mínimo antes da margem ×1,25: dá o combustível
// necessário por destino, o alcance restante enviado ao JEV e o tecto do
// alcance em rota-visual.js.
export const CONSUMO_MIN_KG_S = 0.09;
const G = 9.80665;
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const dist = (a, b) => Math.hypot(a.xM - b.xM, a.zM - b.zM);
const angulo = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const P = (id, tipo, xM, zM, pistaM, superficie = 'pavimentada') => ({ id, tipo, xM, zM, pistaM, superficie });

export const CENARIOS_SIM = {
  porto: {
    nome: 'São João / Porto',
    subtitulo: 'Balões, crepúsculo e aproximação ao Sá Carneiro',
    descricao: 'Aproximação ilustrativa ao Aeroporto Francisco Sá Carneiro no anoitecer de São João. Balões hipotéticos entram no corredor com o vento.',
    origem: P('origem', 'origem', 0, 0, 1800),
    planeado: P('planeado', 'planeado', 0, 165000, 3180),
    alternativas: [P('aeroporto_alternativo', 'aeroporto_alternativo', -25000, 130000, 1600)],
    fuelKg: 650, payloadKg: 620, almas: 8, tempoLimiteS: 2200, ventoMs: { x: 6, z: -5 },
    eventos: [
      { id: 'baloes', tipo: 'baloes', resumo: 'Balões de São João, nesta hipótese empurrados pelo vento, aproximam-se do corredor de chegada. Há margem lateral à direita.', gatilho: { tipo: 'posicao', valor: 32000 }, rota: 'planeado', obstaculos: [{ tipo: 'balões iluminados', visual: 'baloes', em_rota: true, distancia_m: 800, segundos_ate_ao_contacto: 12, folga_por_cima_m: 35, folga_por_baixo_m: -15, folga_pela_esquerda_m: 25, folga_pela_direita_m: 95, altura_m: 18 }] },
      { id: 'trafego_porto', tipo: 'trafego', resumo: 'Uma chegada comercial entra na sequência de aproximação. O JEV tem de gerir tempo e separação.', gatilho: { tipo: 'posicao', valor: 85000 }, rota: 'planeado', obstaculos: [{ tipo: 'tráfego de chegada', visual: 'trafego', em_rota: true, distancia_m: 950, segundos_ate_ao_contacto: 14, folga_por_cima_m: 70, folga_por_baixo_m: -20, folga_pela_esquerda_m: 85, folga_pela_direita_m: 30, altura_m: 14 }] },
      { id: 'anoitecer', tipo: 'luz', resumo: 'A luz cai sobre a aproximação. É preciso rever a visibilidade e a reserva antes de prosseguir.', gatilho: { tipo: 'tempo', valor: 1050 }, rota: 'planeado', visKm: 5, tetoFt: 1250 },
      { id: 'vento_porto', tipo: 'meteorologia', resumo: 'O vento de frente aumenta na aproximação final ao Porto. Pista e reserva são recalculadas.', gatilho: { tipo: 'tempo', valor: 1450 }, rota: 'planeado', ventoKt: 26 },
      { id: 'final_porto', tipo: 'aproximacao', resumo: 'A pista 17 aproxima-se. A visibilidade e o combustível ainda permitem a chegada?', gatilho: { tipo: 'posicao', valor: 151000 }, rota: 'planeado' },
    ],
  },
  medevac: {
    nome: 'MEDEVAC Açores',
    subtitulo: 'Janela clínica, frente atlântica e alternativos',
    descricao: 'Da Terceira para São Miguel. O tempo clínico compete com meteorologia e pistas alternativas.',
    origem: P('origem', 'origem', 0, 0, 1800),
    planeado: P('planeado', 'planeado', 0, 162000, 1400),
    alternativas: [P('hospital_alternativo', 'hospital_alternativo', 22000, 135000, 1250), P('stol_proximo', 'stol_proximo', -18000, 70000, 520, 'nao_pavimentada')],
    fuelKg: 720, payloadKg: 380, almas: 4, tempoLimiteS: 1800, ventoMs: { x: 5, z: -7 },
    eventos: [
      { id: 'frente', tipo: 'meteorologia', resumo: 'Uma frente reduz o teto e a visibilidade no corredor. A janela clínica continua a fechar.', gatilho: { tipo: 'tempo', valor: 0 }, ventoKt: 28, tetoFt: 650, visKm: 3 },
      { id: 'relevo', tipo: 'relevo', resumo: 'Relevo costeiro à frente; a margem lateral é maior a estibordo.', gatilho: { tipo: 'posicao', valor: 58000 }, rota: 'planeado', obstaculos: [{ tipo: 'relevo', visual: 'relevo', em_rota: true, distancia_m: 900, segundos_ate_ao_contacto: 14, folga_por_cima_m: 110, folga_por_baixo_m: -80, folga_pela_esquerda_m: 20, folga_pela_direita_m: 90, altura_m: 90 }] },
      { id: 'relogio', tipo: 'relogio', resumo: 'O tempo clínico aproxima-se do limite. O hospital alternativo fica mais próximo.', gatilho: { tipo: 'tempo', valor: 1000 }, rota: 'planeado' },
    ],
  },
  carga: {
    nome: 'Carga Ponte de Sor', subtitulo: 'Massa, vento e aves na saída da FAL',
    descricao: 'Carga para Beja. A massa e o vento alteram o alcance; aves atravessam a rota de partida.',
    origem: P('origem', 'origem', 0, 0, 1800), planeado: P('planeado', 'planeado', 0, 140000, 1600),
    alternativas: [P('stol_proximo', 'stol_proximo', 18000, 85000, 800, 'nao_pavimentada')],
    fuelKg: 540, payloadKg: 2400, almas: 2, tempoLimiteS: 2400, ventoMs: { x: 0, z: -9 },
    eventos: [
      { id: 'massa', tipo: 'payload', resumo: 'Carga elevada e vento de frente reduzem a margem de combustível até Beja.', gatilho: { tipo: 'tempo', valor: 0 }, ventoKt: 32 },
      { id: 'aves', tipo: 'aves', resumo: 'Bando de aves cruza a trajetória; há mais folga pela direita.', gatilho: { tipo: 'posicao', valor: 40000 }, rota: 'planeado', obstaculos: [{ tipo: 'bando', visual: 'aves', em_rota: true, distancia_m: 600, segundos_ate_ao_contacto: 9, folga_por_cima_m: 65, folga_por_baixo_m: -10, folga_pela_esquerda_m: 15, folga_pela_direita_m: 70, altura_m: 8 }] },
      { id: 'vento', tipo: 'meteorologia', resumo: 'Vento de frente aumenta; recalcular alcance e reserva.', gatilho: { tipo: 'tempo', valor: 850 }, rota: 'planeado', ventoKt: 38 },
    ],
  },
  sar: {
    nome: 'SAR costa', subtitulo: 'Contacto incerto, luz e reserva para regresso',
    descricao: 'Busca ao largo da Figueira da Foz. A visibilidade cai enquanto a reserva de regresso diminui.',
    origem: P('origem', 'origem', 0, 0, 1400), planeado: P('planeado', 'planeado', 0, 145000, 1400),
    alternativas: [P('stol_proximo', 'stol_proximo', 28000, 60000, 900)],
    fuelKg: 680, payloadKg: 220, almas: 2, tempoLimiteS: 2100, ventoMs: { x: 4, z: -3 },
    eventos: [
      { id: 'luz', tipo: 'luz', resumo: 'A luz do dia termina antes do fim previsto da busca.', gatilho: { tipo: 'tempo', valor: 0 }, visKm: 4 },
      { id: 'contacto', tipo: 'contacto', resumo: 'Possível contacto visual no mar, ainda sem confirmação.', gatilho: { tipo: 'posicao', valor: 45000 }, rota: 'planeado', visKm: 2.3 },
      { id: 'trafego', tipo: 'trafego', resumo: 'Tráfego civil cruza o setor SAR; é preciso preservar separação.', gatilho: { tipo: 'posicao', valor: 70000 }, rota: 'planeado', obstaculos: [{ tipo: 'tráfego civil', visual: 'trafego', em_rota: true, distancia_m: 800, segundos_ate_ao_contacto: 12, folga_por_cima_m: 60, folga_por_baixo_m: -10, folga_pela_esquerda_m: 80, folga_pela_direita_m: 20, altura_m: 12 }] },
      { id: 'reserva', tipo: 'combustivel', resumo: 'A reserva para regressar aproxima-se do mínimo assumido.', gatilho: { tipo: 'tempo', valor: 1100 }, rota: 'planeado' },
    ],
  },
};

export function pistaNecessariaM(missao, destino) {
  const massa = missao.voo.massaKg;
  const ventoFrente = Math.max(0, -missao.ambiente.ventoMs.z);
  const base = 465 + (massa - 9000) * 0.085 + ventoFrente * 4;
  return Math.round(base * (destino.superficie === 'nao_pavimentada' ? 1.24 : 1));
}

export function combustivelNecessarioKg(missao, destino) {
  const d = dist(missao.voo, destino);
  const vento = Math.max(50, 88 + missao.ambiente.ventoMs.z);
  return Math.ceil((d / vento) * CONSUMO_MIN_KG_S * 1.25 + 70);
}

function destinos(c) { return [c.origem, c.planeado, ...c.alternativas]; }
function destinoDe(m, id) { return m.destinos.find((d) => d.id === id) ?? m.destinos[1]; }

/** Ambiente que o JEV recebe com o evento `e` (m.ambiente só muda em aplicarDecisao). */
export function ambienteAposEvento(m, e) {
  return {
    ...m.ambiente,
    ventoMs: e?.ventoKt == null ? m.ambiente.ventoMs : { x: m.ambiente.ventoMs.x, z: -e.ventoKt / 1.94384 },
    tetoFt: e?.tetoFt ?? m.ambiente.tetoFt,
    visKm: e?.visKm ?? m.ambiente.visKm,
    luzDia: e?.tipo === 'luz' ? false : m.ambiente.luzDia,
  };
}

export function criarMissao(cenarioId = 'medevac', semente = 222, restricoes = {}) {
  const c = CENARIOS_SIM[cenarioId] ?? CENARIOS_SIM.medevac;
  const id = CENARIOS_SIM[cenarioId] ? cenarioId : 'medevac';
  const rnd = mulberry32(Number(semente) || 222);
  const payload = clamp(Number(restricoes.payload_kg ?? c.payloadKg), 0, 2700);
  const fuel = c.fuelKg;
  return {
    versao: 3, cenario: id, semente: Number(semente) || 222, perfil: PERFIL.versao,
    fase: 'em_rota', destinoId: 'planeado', origemId: 'origem', resultado: null,
    restricoes: { nunca_desviar: Boolean(restricoes.nunca_desviar), preferir_stol: Boolean(restricoes.preferir_stol), risco_maximo: restricoes.risco_maximo ?? 'medio', pic_disponivel: true },
    destinos: destinos(c),
    ambiente: { ventoMs: { ...c.ventoMs }, tetoFt: 1800, visKm: 10, luzDia: true },
    voo: { xM: 0, zM: 25000, altitudeM: 480, velocidadeMs: 88, velocidadeVerticalMs: 0, rumoRad: 0, bankRad: 0, pitchRad: 0, combustivelKg: fuel, payloadKg: payload, massaKg: PERFIL.massaVaziaKg + fuel + payload, distanciaPercorridaM: 0, tempoS: 0, integridade: 100 },
    missao: { almas: c.almas, tempoLimiteS: c.tempoLimiteS, prioridade: id === 'carga' ? 'carga_critica' : id === 'porto' ? 'integridade' : 'tempo' },
    eventosPendentes: c.eventos.map((e) => ({ ...e, gatilho: { ...e.gatilho }, variacao: Math.round((rnd() - 0.5) * 8) })),
    eventosTratados: [],
    comando: { acao: 'prosseguir', vertical: 'manter', lateral: 'manter', urgencia: 1, evasaoAteS: 0 },
    orbitaRestanteS: 0,
    ameacaAtiva: null,
    separacoes: [],
    passo: 0,
    acumuladorS: 0,
    vooAnterior: null,
  };
}

/** Centro e perímetro de proteção ilustrativos do grupo de balões, em metros SI. */
export function localizarBaloes(voo, obstaculo) {
  const d = obstaculo.distancia_m;
  const lateral = offsetLateral(obstaculo);
  const ameaca = {
    id: 'baloes',
    xM: voo.xM + Math.sin(voo.rumoRad) * d + Math.cos(voo.rumoRad) * lateral,
    zM: voo.zM + Math.cos(voo.rumoRad) * d - Math.sin(voo.rumoRad) * lateral,
    altitudeM: voo.altitudeM,
    raioProtecaoM: 36,
  };
  return { ...ameaca, separacaoMinM: distanciaAmeacaM(voo, ameaca) };
}

export function distanciaAmeacaM(voo, ameaca) {
  return Math.hypot(voo.xM - ameaca.xM, voo.zM - ameaca.zM, voo.altitudeM - ameaca.altitudeM);
}

function separacaoPrevistaM(m, comando, ameaca) {
  let sim = { ...m, comando };
  let minimo = distanciaAmeacaM(sim.voo, ameaca);
  // Mesma integração e mesmo passo do voo; a prévia não muta a missão.
  for (let i = 0; i < 180; i++) {
    sim = { ...sim, voo: passoFisico(sim, PERFIL.passoS) };
    minimo = Math.min(minimo, distanciaAmeacaM(sim.voo, ameaca));
  }
  return minimo;
}

export function proximoEvento(m) {
  if (m.resultado) return null;
  return m.eventosPendentes.find((e) => {
    if (e.rota && e.rota !== m.destinoId) return false;
    if (e.gatilho.tipo === 'tempo') return m.voo.tempoS >= e.gatilho.valor;
    if (e.gatilho.tipo === 'posicao') return m.voo.zM >= e.gatilho.valor;
    if (e.gatilho.tipo === 'combustivel') return m.voo.combustivelKg <= e.gatilho.valor;
    return false;
  }) ?? null;
}

export function estadoParaAvaliacao(m, evento = null) {
  const c = CENARIOS_SIM[m.cenario];
  const e = evento ?? { id: 'briefing', tipo: 'briefing', resumo: c.descricao };
  const ambiente = ambienteAposEvento(m, e);
  const contexto = { ...m, ambiente };
  return {
    aeronave: { tipo: 'LUS-222', fuel_kg: Math.round(m.voo.combustivelKg), payload_kg: m.voo.payloadKg, config_cabine: m.cenario === 'medevac' ? 'medevac' : m.cenario === 'porto' ? 'passageiros' : m.cenario === 'sar' ? 'mista' : 'carga', tripulantes: 2, integridade: m.voo.integridade, alcance_restante_km: Math.round(m.voo.combustivelKg / CONSUMO_MIN_KG_S * 88 / 1000) },
    voo: { posicao_x_m: Math.round(m.voo.xM), posicao_z_m: Math.round(m.voo.zM), altitude_m: Math.round(m.voo.altitudeM), velocidade_ms: Number(m.voo.velocidadeMs.toFixed(1)), subida_ms: Number(m.voo.velocidadeVerticalMs.toFixed(1)), rumo_rad: Number(m.voo.rumoRad.toFixed(3)), tempo_s: Math.round(m.voo.tempoS), fase: m.fase },
    missao: { tipo: m.cenario, origem: c.origem.id, destino: destinoDe(m, m.destinoId).id, almas: m.missao.almas, carga: c.descricao, relogio_s: Math.max(0, Math.round(m.missao.tempoLimiteS - m.voo.tempoS)), prioridade_comandante: m.missao.prioridade },
    ambiente: { tecto_ft: ambiente.tetoFt, vis_km: ambiente.visKm, vento_kt: e.ventoKt ?? Math.round(Math.hypot(ambiente.ventoMs.x, ambiente.ventoMs.z) * 1.944), superficie_pista: destinoDe(m, m.destinoId).superficie, comprimento_pista_m: destinoDe(m, m.destinoId).pistaM, luz_dia: ambiente.luzDia },
    geometria: { obstaculos: e.obstaculos ?? [] },
    alternativas: m.destinos.map((d) => ({ id: d.id, tipo: d.tipo, distancia_km: Math.round(dist(m.voo, d) / 1000), pista_m: d.pistaM, superficie: d.superficie, pista_necessaria_m: pistaNecessariaM(contexto, d), combustivel_necessario_kg: combustivelNecessarioKg(contexto, d) })),
    restricoes: { ...m.restricoes },
    incidente: { id: e.id, tipo: e.tipo, resumo: e.resumo },
  };
}

export function aplicarDecisao(m, answers, fonte = 'jev', consumirEvento = true) {
  const evento = consumirEvento ? proximoEvento(m) : null;
  const ambiente = ambienteAposEvento(m, evento);
  const contexto = { ...m, ambiente };
  let destinoId = m.destinoId;
  let fase = m.fase;
  let motivo = null;
  const acao = answers?.acaoMissao?.choice ?? 'prosseguir';
  const preferido = answers?.destinoPreferido?.choice;
  if (acao === 'regressar_base') { destinoId = 'origem'; fase = 'regresso'; }
  else if (acao === 'abortar_emergencia') {
    const viable = m.destinos.filter((d) => d.id !== 'planeado' && d.pistaM >= pistaNecessariaM(contexto, d) && m.voo.combustivelKg >= combustivelNecessarioKg(contexto, d));
    destinoId = viable.sort((a, b) => dist(m.voo, a) - dist(m.voo, b))[0]?.id ?? 'origem';
    fase = 'emergencia';
  } else if (acao === 'orbitar') fase = 'orbita';
  else if (acao === 'desviar_alternativo' && preferido && preferido !== 'planeado') {
    const escolhido = destinoDe(m, preferido);
    if (escolhido.id !== preferido) motivo = 'Destino alternativo indisponível';
    else if (escolhido.pistaM < pistaNecessariaM(contexto, escolhido)) motivo = 'Pista insuficiente para a massa e vento calculados';
    else if (m.voo.combustivelKg < combustivelNecessarioKg(contexto, escolhido)) motivo = 'Combustível insuficiente com reserva';
    else { destinoId = preferido; fase = preferido === 'origem' ? 'regresso' : 'desvio'; }
  } else if (acao === 'desviar_alternativo') {
    motivo = 'Desvio sem destino alternativo válido';
  }
  if (acao === 'prosseguir') {
    const destino = destinoDe(m, m.destinoId);
    if (destino.pistaM < pistaNecessariaM(contexto, destino)) motivo = 'Pista insuficiente para a massa e vento calculados';
    else if (m.voo.combustivelKg < combustivelNecessarioKg(contexto, destino)) motivo = 'Combustível insuficiente com reserva';
  }
  if (acao === 'regressar_base') {
    const origem = destinoDe(m, 'origem');
    if (m.voo.combustivelKg < combustivelNecessarioKg(contexto, origem)) motivo = 'Combustível insuficiente para regressar com reserva';
  }
  const bloqueioRota = Boolean(motivo);
  let lateral = answers?.manobraLateral?.choice ?? 'manter';
  let vertical = answers?.manobraVertical?.choice ?? 'manter';
  if (!motivo && vertical === 'descer' && m.voo.altitudeM < 180) {
    motivo = 'Descida bloqueada pelo limite de altitude';
    vertical = 'manter';
  }
  const baloes = evento?.tipo === 'baloes' ? localizarBaloes(m.voo, evento.obstaculos[0]) : null;
  let separacaoPrevista = null;
  if (baloes) {
    const base = { ...m, destinoId, fase, ambiente };
    const prever = (lado, eixo) => separacaoPrevistaM(base, {
      acao, lateral: lado, vertical: eixo, urgencia: answers?.urgencia?.score ?? 1,
      evasaoAteS: m.voo.tempoS + 22,
    }, baloes);
    separacaoPrevista = prever(lateral, vertical);
    if (separacaoPrevista < baloes.raioProtecaoM) {
      const opcoes = [
        [baloes.xM < m.voo.xM ? 'direita' : 'esquerda', vertical],
        ['direita', 'subir'], ['esquerda', 'subir'], ['direita', 'manter'], ['esquerda', 'manter'],
      ];
      const segura = opcoes.map(([lado, eixo]) => ({ lado, eixo, separacao: prever(lado, eixo) }))
        .find((opcao) => opcao.separacao >= baloes.raioProtecaoM);
      motivo = `Ameaça iminente: separação prevista ${Math.round(separacaoPrevista)} m, mínimo ilustrativo ${baloes.raioProtecaoM} m`;
      if (segura) {
        lateral = segura.lado; vertical = segura.eixo; separacaoPrevista = segura.separacao;
      }
    }
  }
  if (bloqueioRota) {
    const validos = m.destinos.filter((d) => d.id !== 'stol_proximo' && d.pistaM >= pistaNecessariaM(contexto, d) && m.voo.combustivelKg >= combustivelNecessarioKg(contexto, d));
    destinoId = validos.sort((a, b) => dist(m.voo, a) - dist(m.voo, b))[0]?.id ?? m.destinoId;
    fase = destinoId === 'origem' ? 'regresso' : destinoId === m.destinoId ? 'orbita' : 'desvio';
  }
  const pendentes = m.eventosPendentes.filter((e) => e.id !== evento?.id && (!e.rota || e.rota === destinoId));
  const comando = { acao: bloqueioRota ? 'orbitar' : acao, vertical, lateral, urgencia: answers?.urgencia?.score ?? 1, evasaoAteS: m.voo.tempoS + 22 };
  return {
    missao: { ...m, destinoId, fase, ambiente, eventosPendentes: pendentes, eventosTratados: evento ? [...m.eventosTratados, evento.id] : m.eventosTratados, comando, orbitaRestanteS: fase === 'orbita' ? 90 : m.orbitaRestanteS, ameacaAtiva: baloes ?? m.ameacaAtiva },
    supervisor: { interveio: Boolean(motivo), motivo, separacaoPrevistaM: separacaoPrevista == null ? null : Math.round(separacaoPrevista), proposta: { acao, destino: preferido, vertical: answers?.manobraVertical?.choice, lateral: answers?.manobraLateral?.choice }, aplicada: { acao: comando.acao, destino: destinoId, vertical, lateral }, fonte: motivo ? 'supervisor' : fonte },
  };
}

function passoFisico(m, dt) {
  const v = m.voo;
  const d = destinoDe(m, m.destinoId);
  const rumoDesejado = Math.atan2(d.xM - v.xM, d.zM - v.zM);
  const evasao = v.tempoS < m.comando.evasaoAteS;
  const bancoAlvo = m.fase === 'orbita' ? 0.34 : evasao && m.comando.lateral !== 'manter' ? (m.comando.lateral === 'direita' ? 0.38 : -0.38) : clamp(angulo(rumoDesejado - v.rumoRad) * 1.7, -0.42, 0.42);
  const bank = v.bankRad + clamp(bancoAlvo - v.bankRad, -0.15 * dt, 0.15 * dt);
  const massa = PERFIL.massaVaziaKg + v.payloadKg + v.combustivelKg;
  const rho = 1.225 * Math.exp(-v.altitudeM / 8500);
  const q = 0.5 * rho * v.velocidadeMs ** 2;
  const cl = massa * G / Math.max(1, q * PERFIL.areaAsaM2 * Math.cos(bank));
  const drag = q * PERFIL.areaAsaM2 * (PERFIL.cd0 + PERFIL.kInduzido * Math.min(cl, PERFIL.clMax) ** 2);
  const distanciaDestino = dist(v, d);
  const alvoV = m.fase === 'orbita' ? 72 : distanciaDestino < 12000 ? 65 : m.fase === 'emergencia' ? 78 : 88;
  const potencia = clamp(Math.max(0.42 + (alvoV - v.velocidadeMs) * 0.025, evasao && m.comando.vertical === 'subir' ? 0.82 : 0), 0.24, 1);
  const empuxo = PERFIL.empuxoMaxN * potencia * Math.max(0.55, 1 - v.altitudeM / 13000);
  const speed = clamp(v.velocidadeMs + ((empuxo - drag) / massa) * dt, 31, PERFIL.velocidadeMaxMs);
  const altitudeRota = m.fase === 'orbita' ? 480 : distanciaDestino < 16000 ? Math.max(20, (distanciaDestino - 3000) * 0.04) : 480;
  const altitudeAlvo = evasao && m.comando.vertical === 'subir' ? 610 : evasao && m.comando.vertical === 'descer' ? 360 : altitudeRota;
  const excesso = Math.max(0, (empuxo - drag) * speed / Math.max(1, massa * G));
  const subida = cl > PERFIL.clMax ? -4 : clamp((altitudeAlvo - v.altitudeM) * 0.025, -3.5, Math.min(4, excesso));
  const altitude = Math.max(0, v.altitudeM + subida * dt);
  const heading = v.rumoRad + G * Math.tan(bank) / Math.max(31, speed) * dt;
  const consumo = (0.026 + 0.115 * potencia) * dt;
  const fuel = Math.max(0, v.combustivelKg - consumo);
  const dx = (Math.sin(heading) * speed + m.ambiente.ventoMs.x) * dt;
  const dz = (Math.cos(heading) * speed + m.ambiente.ventoMs.z) * dt;
  // potencia só sai para o som do motor; não entra no passo seguinte.
  return { ...v, xM: v.xM + dx, zM: v.zM + dz, altitudeM: altitude, velocidadeMs: speed, velocidadeVerticalMs: subida, rumoRad: heading, bankRad: bank, pitchRad: Math.asin(clamp(subida / speed, -0.2, 0.2)), combustivelKg: fuel, massaKg: PERFIL.massaVaziaKg + v.payloadKg + fuel, distanciaPercorridaM: v.distanciaPercorridaM + Math.hypot(dx, dz), tempoS: v.tempoS + dt, potencia };
}

/** Um passo da missão: física, órbita, resultado e separação à ameaça activa. */
function passoMissao(atual, dt) {
  const voo = passoFisico(atual, dt);
  const orbitaRestanteS = Math.max(0, atual.orbitaRestanteS - (atual.fase === 'orbita' ? dt : 0));
  const fase = atual.fase === 'orbita' && orbitaRestanteS === 0 ? 'em_rota' : atual.fase;
  const destino = destinoDe(atual, atual.destinoId);
  let resultado = null;
  if (voo.combustivelKg <= 0) resultado = 'combustivel_esgotado';
  else if (voo.altitudeM <= 0 && dist(voo, destino) >= 250) resultado = 'limite_altitude';
  else if (fase !== 'orbita' && dist(voo, destino) < 250 && voo.altitudeM <= 50) resultado = atual.destinoId === 'origem' ? 'regressou' : fase === 'emergencia' ? 'emergencia_resolvida' : 'chegou';
  else if (voo.tempoS >= 2800) resultado = 'tempo_esgotado';
  let ameacaAtiva = atual.ameacaAtiva;
  let separacoes = atual.separacoes;
  if (ameacaAtiva) {
    const minima = Math.min(ameacaAtiva.separacaoMinM, distanciaAmeacaM(voo, ameacaAtiva));
    ameacaAtiva = { ...ameacaAtiva, separacaoMinM: minima };
    if (minima < ameacaAtiva.raioProtecaoM) resultado = 'separacao_perdida';
    if (voo.zM > ameacaAtiva.zM + 120 || resultado) {
      separacoes = [...separacoes, { id: ameacaAtiva.id, minimaM: Math.round(minima), limiteM: ameacaAtiva.raioProtecaoM }];
      ameacaAtiva = null;
    }
  }
  return { ...atual, voo, fase, orbitaRestanteS, resultado, ameacaAtiva, separacoes };
}

/**
 * Relógio de passo fixo: o tempo acumula-se e a missão avança só em passos
 * inteiros de PERFIL.passoS, por isso o estado é função do número de passos
 * (`m.passo`) e das decisões aplicadas, seja qual for o ritmo dos frames.
 * `ate` pára num passo exacto (para aplicar lá uma decisão gravada); `parar`
 * pára antes do passo em que devolve verdadeiro. O tempo que sobra fica em
 * `acumuladorS` para a chamada seguinte.
 */
export function avancarMissao(m, segundos, { ate = Infinity, parar = null } = {}) {
  if (m.resultado || !Number.isFinite(segundos) || segundos < 0) return m;
  let atual = m;
  let passo = m.passo ?? 0;
  let anterior = m.vooAnterior ?? null;
  let acumulador = (m.acumuladorS ?? 0) + Math.min(segundos, 60);
  while (acumulador >= PERFIL.passoS - 1e-9 && passo < ate && !atual.resultado) {
    if (parar?.(atual)) break;
    anterior = atual.voo;
    passo += 1;
    // passo actualizado em cada estado intermédio: `parar` pode lê-lo.
    atual = { ...passoMissao(atual, PERFIL.passoS), passo };
    acumulador -= PERFIL.passoS;
  }
  return { ...atual, passo, acumuladorS: atual.resultado ? 0 : Math.max(0, acumulador), vooAnterior: anterior };
}

/**
 * O voo a desenhar entre o passo anterior e o actual, pela fracção do
 * acumulador: a física avança a 10 Hz e o desenho a 60 sem saltos.
 */
export function vooInterpolado(m) {
  const a = m?.vooAnterior;
  const b = m?.voo;
  if (!a || !b) return b;
  const t = Math.min(1, Math.max(0, (m.acumuladorS ?? 0) / PERFIL.passoS));
  const mix = (x, y) => x + (y - x) * t;
  return {
    ...b,
    xM: mix(a.xM, b.xM),
    zM: mix(a.zM, b.zM),
    altitudeM: mix(a.altitudeM, b.altitudeM),
    rumoRad: a.rumoRad + angulo(b.rumoRad - a.rumoRad) * t,
    bankRad: mix(a.bankRad, b.bankRad),
    pitchRad: mix(a.pitchRad, b.pitchRad),
    tempoS: mix(a.tempoS, b.tempoS),
  };
}
