/**
 * Estado de missão LUS-222 + baseline geométrico cego.
 *
 * O baseline só vê obstáculos em rota e integridade. Sem meteo, hospital,
 * payload, relógio MEDEVAC ou PIC — é isso que o debriefing confronta com o JEV.
 */

export const MODELO_JEV = 'typesafe-ai/jev';
export const TIPO_AERONAVE = 'LUS-222';
export const MAX_OBSTACULOS = 4;
export const LIMIAR_INTEGRIDADE_ABORTAR = 40;
export const LIMIAR_ESCALAR_PIC = 0.55;
export const LIMIAR_MAX_CHOICE = 0.55;
export const LIMIAR_PIC_PROB = 0.55;

export const ACOES = [
  'prosseguir',
  'desviar_alternativo',
  'orbitar',
  'regressar_base',
  'abortar_emergencia',
];

export const MANOBRAS_V = ['subir', 'descer', 'manter'];
export const MANOBRAS_L = ['esquerda', 'direita', 'manter'];
export const VISUAIS = ['torre', 'relevo', 'trafego', 'meteo', 'cabo', 'canyon', 'aves', 'guerra', 'baloes'];

export const DESTINOS = ['planeado', 'stol_proximo', 'hospital_alternativo', 'aeroporto_alternativo', 'origem'];
export const CABINES = ['medevac', 'carga', 'passageiros', 'mista'];
export const PRIORIDADES = ['tempo', 'combustivel', 'meteorologia', 'integridade', 'carga_critica'];
export const RISCOS = ['baixo', 'medio', 'alto'];
export const SUPERFICIES = ['pavimentada', 'nao_pavimentada'];
export const TIPOS_MISSAO = ['medevac', 'carga', 'sar', 'porto'];

export const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const round = (v, a, b, f = 0) => Math.round(clamp(num(v, f), a, b));

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function umDe(valor, lista, fallback) {
  const s = String(valor ?? '');
  return lista.includes(s) ? s : fallback;
}

function texto(v, fallback, max = 80) {
  const s = String(v ?? fallback).trim();
  return (s || fallback).slice(0, max);
}

function lerObstaculo(o) {
  const visualDefault = o?.em_rota || o?.em_rota_de_colisao ? 'torre' : 'meteo';
  return {
    tipo: texto(o?.tipo, 'desconhecido', 40),
    distancia_m: round(o?.distancia_m, 0, 8000, 200),
    segundos_ate_ao_contacto: Number(clamp(num(o?.segundos_ate_ao_contacto, 6), 0, 999).toFixed(1)),
    folga_por_cima_m: round(o?.folga_por_cima_m, -500, 500),
    folga_por_baixo_m: round(o?.folga_por_baixo_m, -500, 500),
    folga_pela_esquerda_m: round(o?.folga_pela_esquerda_m, -500, 500),
    folga_pela_direita_m: round(o?.folga_pela_direita_m, -500, 500),
    em_rota: Boolean(o?.em_rota ?? o?.em_rota_de_colisao),
    visual: umDe(o?.visual, VISUAIS, visualDefault),
    altura_m: round(o?.altura_m, 4, 220, 56),
    offset_lateral_m: o?.offset_lateral_m == null ? null : round(o.offset_lateral_m, -160, 160, 0),
  };
}

/** Offset de dados: esquerda (−) / direita (+) do rumo. O mundo espelha o sinal em pontoAmeaca. */
export function offsetLateral(o) {
  if (o?.offset_lateral_m != null) return o.offset_lateral_m;
  const esq = num(o?.folga_pela_esquerda_m, 0);
  const dir = num(o?.folga_pela_direita_m, 0);
  if (esq < dir) return -22;
  if (dir < esq) return 22;
  return 0;
}

const VISUAIS_NO_AR = new Set(['trafego', 'aves', 'guerra', 'baloes']);

export function pontoAmeaca(pose, obstaculo) {
  const d = num(obstaculo?.distancia_m, 200);
  // Câmara atrás da cauda: o +X da aeronave é a esquerda do ecrã. Sem este
  // sinal, «Esquerda» inclinava a asa que se vê à direita.
  const lat = -offsetLateral(obstaculo);
  const heading = num(pose?.heading, 0);
  const visual = umDe(obstaculo?.visual, VISUAIS, 'torre');
  return {
    x: num(pose?.x, 0) + Math.sin(heading) * d + Math.cos(heading) * lat,
    y: VISUAIS_NO_AR.has(visual) ? num(pose?.y, 42) : 0,
    z: num(pose?.z, 0) + Math.cos(heading) * d - Math.sin(heading) * lat,
    visual,
    altura: round(obstaculo?.altura_m, 4, 220, 56),
    rumo: heading,
    heading: heading + (visual === 'trafego' ? Math.PI / 2 : 0),
  };
}

/**
 * Eixos que a regra geométrica escolheria — só folgas.
 * Nunca manda o avião: o autómato lê só as answers do JEV.
 */
export function manobraGeometrica(obstaculo) {
  if (!obstaculo) return { vertical: 'manter', lateral: 'manter' };
  const cima = num(obstaculo.folga_por_cima_m, 0);
  const baixo = num(obstaculo.folga_por_baixo_m, 0);
  const esq = num(obstaculo.folga_pela_esquerda_m, 0);
  const dir = num(obstaculo.folga_pela_direita_m, 0);

  let vertical = 'manter';
  if (cima > baixo && cima > 8) vertical = 'subir';
  else if (baixo > cima && baixo > 8) vertical = 'descer';
  else if (cima >= 0 && (cima > 0 || baixo < 0)) vertical = 'subir';

  let lateral = 'manter';
  if (dir > esq && dir > 4) lateral = 'direita';
  else if (esq > dir && esq > 4) lateral = 'esquerda';

  return { vertical, lateral };
}

function inferirEixo(answers, eixo) {
  const acao = answers?.acaoMissao?.choice;
  if (eixo === 'vertical') {
    if (acao === 'abortar_emergencia') return 'descer';
    if (acao === 'desviar_alternativo') return 'subir';
    return 'manter';
  }
  if (acao === 'desviar_alternativo') return 'direita';
  if (acao === 'orbitar' || acao === 'regressar_base') return 'esquerda';
  return 'manter';
}

/** Lê a evasão do JEV. Se o modelo omitir um eixo, infere da acção — nunca do baseline. */
export function evasaoDeAnswers(answers) {
  const vertical = umDe(answers?.manobraVertical?.choice, MANOBRAS_V, null);
  const lateral = umDe(answers?.manobraLateral?.choice, MANOBRAS_L, null);
  return {
    acao: umDe(answers?.acaoMissao?.choice, ACOES, 'prosseguir'),
    vertical: vertical ?? inferirEixo(answers, 'vertical'),
    lateral: lateral ?? inferirEixo(answers, 'lateral'),
    urgencia: round(answers?.urgencia?.score, 0, 3, 1),
  };
}

export function lerEstado(body) {
  const src = body?.estado && typeof body.estado === 'object' ? body.estado : body ?? {};
  const a = src.aeronave ?? {};
  const m = src.missao ?? {};
  const e = src.ambiente ?? {};
  const g = src.geometria ?? {};
  const r = src.restricoes ?? {};
  const i = src.incidente ?? {};
  const v = src.voo ?? null;
  const alternativasRaw = Array.isArray(src.alternativas) ? src.alternativas : null;
  const obstaculosRaw = Array.isArray(g.obstaculos)
    ? g.obstaculos
    : Array.isArray(src.obstaculos)
      ? src.obstaculos
      : [];

  return {
    aeronave: {
      tipo: TIPO_AERONAVE,
      fuel_kg: round(a.fuel_kg, 0, 4000, 800),
      payload_kg: round(a.payload_kg, 0, 2700, 400),
      config_cabine: umDe(a.config_cabine, CABINES, 'carga'),
      tripulantes: round(a.tripulantes, 1, 2, 2),
      integridade: round(a.integridade ?? a.integridade_percent, 0, 100, 100),
      alcance_restante_km: round(a.alcance_restante_km, 0, 2500, 400),
    },
    missao: {
      tipo: umDe(m.tipo, TIPOS_MISSAO, 'carga'),
      origem: texto(m.origem, 'Ponte de Sor'),
      destino: texto(m.destino, 'destino'),
      almas: round(m.almas, 0, 22, 2),
      carga: texto(m.carga, 'carga geral'),
      relogio_s: round(m.relogio_s, 0, 20000, 0),
      prioridade_comandante: umDe(m.prioridade_comandante, PRIORIDADES, 'integridade'),
    },
    ambiente: {
      tecto_ft: round(e.tecto_ft, 0, 20000, 3000),
      vis_km: Number(clamp(num(e.vis_km, 10), 0, 80).toFixed(1)),
      vento_kt: round(e.vento_kt, 0, 80, 8),
      superficie_pista: umDe(e.superficie_pista, SUPERFICIES, 'pavimentada'),
      comprimento_pista_m: round(e.comprimento_pista_m, 0, 4000, 1200),
      luz_dia: Boolean(e.luz_dia ?? true),
    },
    geometria: {
      obstaculos: obstaculosRaw.slice(0, MAX_OBSTACULOS).map(lerObstaculo),
    },
    ...(v ? { voo: {
      posicao_x_m: round(v.posicao_x_m, -500000, 500000),
      posicao_z_m: round(v.posicao_z_m, -500000, 500000),
      altitude_m: round(v.altitude_m, 0, 12000),
      velocidade_ms: Number(clamp(num(v.velocidade_ms, 0), 0, 150).toFixed(1)),
      subida_ms: Number(clamp(num(v.subida_ms, 0), -30, 30).toFixed(1)),
      rumo_rad: Number(clamp(num(v.rumo_rad, 0), -10000, 10000).toFixed(3)),
      tempo_s: round(v.tempo_s, 0, 100000),
      fase: texto(v.fase, 'em_rota', 30),
    } } : {}),
    ...(alternativasRaw ? { alternativas: alternativasRaw.slice(0, 5).map((d) => ({
      id: umDe(d?.id, DESTINOS, 'planeado'),
      tipo: umDe(d?.tipo, DESTINOS, 'planeado'),
      distancia_km: round(d?.distancia_km, 0, 2500),
      pista_m: round(d?.pista_m, 0, 4000),
      superficie: umDe(d?.superficie, SUPERFICIES, 'pavimentada'),
      pista_necessaria_m: round(d?.pista_necessaria_m, 0, 4000),
      combustivel_necessario_kg: round(d?.combustivel_necessario_kg, 0, 4000),
    })) } : {}),
    restricoes: {
      nunca_desviar: Boolean(r.nunca_desviar),
      preferir_stol: Boolean(r.preferir_stol),
      risco_maximo: umDe(r.risco_maximo, RISCOS, 'medio'),
      pic_disponivel: r.pic_disponivel !== false,
    },
    incidente: {
      id: texto(i.id, 'briefing', 40),
      tipo: texto(i.tipo, 'briefing', 40),
      resumo: texto(i.resumo, 'Briefing de missão', 220),
    },
  };
}

/** Remove a tese (spoiler do debriefing) antes de enviar o estado ao JEV. */
export function estadoParaJev(estado) {
  const limpo = lerEstado(estado);
  return limpo;
}

export function probs(conjunto, escolhida) {
  return Object.fromEntries(conjunto.map((m) => [m, m === escolhida ? 1 : 0]));
}

export function maxProbabilidade(choiceAnswer) {
  const p = choiceAnswer?.probabilities;
  if (!p || typeof p !== 'object') return choiceAnswer?.choice ? 1 : 0;
  return Math.max(0, ...Object.values(p).map((v) => num(v, 0)));
}

export function deveEscalarPIC(answers) {
  const pic = num(answers?.precisaRevisaoPIC?.probability, 0);
  const maxAcao = maxProbabilidade(answers?.acaoMissao);
  return pic >= LIMIAR_PIC_PROB || maxAcao < LIMIAR_MAX_CHOICE;
}

function obstaculoEmRota(estado) {
  return (estado.geometria?.obstaculos ?? []).find((o) => o.em_rota) ?? null;
}

/**
 * Baseline cego: só geometria + integridade.
 * Sem meteo, hospital, payload, relógio, restrições do comandante ou PIC.
 */
export function decisaoGeometrica(estado, momento = 'incidente') {
  const integridade = estado.aeronave?.integridade ?? 100;
  const ameaca = obstaculoEmRota(estado);
  const abortar = integridade < LIMIAR_INTEGRIDADE_ABORTAR;

  if (momento === 'briefing') {
    return {
      configuracaoCabine: {
        type: 'choice',
        choice: 'carga',
        probabilities: probs(CABINES, 'carga'),
      },
      prioridadeOperacional: {
        type: 'choice',
        choice: 'integridade',
        probabilities: probs(PRIORIDADES, 'integridade'),
      },
      pistaAdequada: { type: 'boolean', probability: ameaca ? 0.2 : 0.95 },
      combustivelSuficiente: { type: 'boolean', probability: 0.95 },
    };
  }

  const acao = abortar ? 'abortar_emergencia' : ameaca ? 'desviar_alternativo' : 'prosseguir';
  const urgencia = abortar ? 3 : ameaca ? 2 : 0;
  const eixos = manobraGeometrica(ameaca);

  return {
    acaoMissao: { type: 'choice', choice: acao, probabilities: probs(ACOES, acao) },
    manobraVertical: {
      type: 'choice',
      choice: eixos.vertical,
      probabilities: probs(MANOBRAS_V, eixos.vertical),
    },
    manobraLateral: {
      type: 'choice',
      choice: eixos.lateral,
      probabilities: probs(MANOBRAS_L, eixos.lateral),
    },
    destinoPreferido: {
      type: 'choice',
      choice: 'planeado',
      probabilities: probs(DESTINOS, 'planeado'),
    },
    urgencia: { type: 'score', score: urgencia },
    riscoMeteorologico: { type: 'score', score: 0 },
    precisaRevisaoPIC: { type: 'boolean', probability: 0.02 },
    continuarVoo: { type: 'boolean', probability: abortar ? 0.08 : 0.96 },
  };
}

export function etiquetarAcao(acao) {
  switch (acao) {
    case 'prosseguir':
      return 'Prosseguir';
    case 'desviar_alternativo':
      return 'Desviar';
    case 'orbitar':
      return 'Orbitar';
    case 'regressar_base':
      return 'Regressar';
    case 'abortar_emergencia':
      return 'Emergência';
    default: {
      const _x = acao;
      return String(_x ?? '—');
    }
  }
}

export function etiquetarDestino(destino) {
  switch (destino) {
    case 'planeado':
      return 'Destino planeado';
    case 'stol_proximo':
      return 'STOL próximo';
    case 'hospital_alternativo':
      return 'Hospital alternativo';
    case 'aeroporto_alternativo':
      return 'Aeroporto alternativo';
    case 'origem':
      return 'Origem';
    default: {
      const _x = destino;
      return String(_x ?? '—');
    }
  }
}

export function etiquetarUrgencia(score) {
  const n = round(score, 0, 3, 0);
  return ['Vigiar', 'Actuar', 'Prioritário', 'Emergência de missão'][n] ?? 'Vigiar';
}

export function etiquetarRiscoMeteo(score) {
  const n = round(score, 0, 3, 0);
  return ['Calmo', 'Atenção', 'Adverso', 'Impedimento'][n] ?? 'Calmo';
}

export function etiquetarManobraV(manobra) {
  switch (manobra) {
    case 'subir':
      return 'Subir';
    case 'descer':
      return 'Descer';
    case 'manter':
      return 'Manter';
    default: {
      const _x = manobra;
      return String(_x ?? '—');
    }
  }
}

export function etiquetarManobraL(manobra) {
  switch (manobra) {
    case 'esquerda':
      return 'Esquerda';
    case 'direita':
      return 'Direita';
    case 'manter':
      return 'Manter';
    default: {
      const _x = manobra;
      return String(_x ?? '—');
    }
  }
}
