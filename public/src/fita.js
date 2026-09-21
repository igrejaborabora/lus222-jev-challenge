import { CENARIOS, cenarioPorId } from './cenarios.js';
import { CABINES, RISCOS, lerEstado, mulberry32, round } from './decisao.js';

function umDe(valor, lista, fallback) {
  return lista.includes(valor) ? valor : fallback;
}

export function lerRestricoes(raw = {}) {
  return {
    nunca_desviar: Boolean(raw.nunca_desviar),
    preferir_stol: Boolean(raw.preferir_stol),
    risco_maximo: umDe(raw.risco_maximo, RISCOS, 'medio'),
    pic_disponivel: raw.pic_disponivel !== false,
    tripulantes: round(raw.tripulantes, 1, 2, 2),
    config_cabine: umDe(raw.config_cabine, CABINES, null),
    semente: round(raw.semente, 1, 999_999_999, 222),
  };
}

export function estadoInicial(cenarioId, restricoesRaw = {}) {
  const cenario = cenarioPorId(cenarioId);
  const restricoes = lerRestricoes(restricoesRaw);
  const base = cenario.defaults;
  return lerEstado({
    aeronave: {
      ...base.aeronave,
      tripulantes: restricoes.tripulantes,
      config_cabine: restricoes.config_cabine ?? base.aeronave.config_cabine,
    },
    missao: {
      ...base.missao,
      prioridade_comandante:
        cenario.id === 'medevac'
          ? 'tempo'
          : cenario.id === 'carga'
            ? 'carga_critica'
            : 'tempo',
    },
    ambiente: { ...base.ambiente },
    geometria: { obstaculos: [] },
    restricoes: {
      nunca_desviar: restricoes.nunca_desviar,
      preferir_stol: restricoes.preferir_stol,
      risco_maximo: restricoes.risco_maximo,
      pic_disponivel: restricoes.pic_disponivel,
    },
    incidente: {
      id: 'briefing',
      tipo: 'briefing',
      resumo: `Briefing ${cenario.nome}. ${cenario.paragrafo}`,
    },
  });
}

function incidente(id, tipo, resumo, patch, tese) {
  return { id, tipo, resumo, patch, tese };
}

function trafegoGeometrico(id = 'trafego') {
  return incidente(
    id,
    'trafego',
    'Tráfego em rota de conflito a 90 s, folga lateral negativa. Único sítio em que a geometria chega.',
    {
      geometria: {
        obstaculos: [
          {
            tipo: 'tráfego em rota cruzada',
            distancia_m: 2200,
            segundos_ate_ao_contacto: 90,
            folga_por_cima_m: 40,
            folga_por_baixo_m: 30,
            folga_pela_esquerda_m: -8,
            folga_pela_direita_m: 60,
            em_rota: true,
          },
        ],
      },
    },
    {
      acao: 'desviar_alternativo',
      destinosAceites: ['planeado', 'stol_proximo'],
      deveEscalar: false,
      nota: 'A regra também acerta — obstáculo em rota.',
    },
  );
}

function fitaMedevac(rnd) {
  const tecto = 600 + Math.round(rnd() * 200);
  return [
    incidente(
      'frente_meteo',
      'meteorologia',
      `Frente no corredor para Ponta Delgada. Tecto ${tecto} ft, vis 3 km. Pista STOL a 12 min. Relógio MEDEVAC a correr.`,
      {
        ambiente: { tecto_ft: tecto, vis_km: 3, vento_kt: 28, luz_dia: true },
        missao: { relogio_s: 1680 },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'desviar_alternativo',
        acoesAceites: ['orbitar', 'desviar_alternativo'],
        destinosAceites: ['stol_proximo', 'hospital_alternativo'],
        deveEscalar: false,
        nota: 'A regra vê céu livre e manda prosseguir.',
      },
    ),
    incidente(
      'pista_curta',
      'pista',
      'Alternativa não pavimentada com 520 m — abaixo da tabela STOL para este peso.',
      {
        ambiente: {
          superficie_pista: 'nao_pavimentada',
          comprimento_pista_m: 520,
          tecto_ft: 800,
        },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'orbitar',
        acoesAceites: ['orbitar', 'desviar_alternativo'],
        destinosAceites: ['hospital_alternativo', 'stol_proximo'],
        deveEscalar: false,
        nota: 'Pista curta não é obstáculo geométrico.',
      },
    ),
    trafegoGeometrico(),
    incidente(
      'turbulencia',
      'integridade',
      'Turbulência à saída da frente. Integridade 62 %. PIC disponível.',
      {
        aeronave: { integridade: 62 },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'orbitar',
        acoesAceites: ['orbitar', 'desviar_alternativo', 'prosseguir'],
        deveEscalar: true,
        nota: '62 % não aborta por regra (<40). O PIC deve ver o compromisso.',
      },
    ),
    incidente(
      'relogio_clinico',
      'relogio',
      'Relógio clínico: 8 min. O destino planeado está a 18 min. Hospital alternativo a 11 min.',
      {
        missao: { relogio_s: 480 },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'desviar_alternativo',
        destinosAceites: ['hospital_alternativo', 'stol_proximo'],
        deveEscalar: false,
        nota: 'Sem obstáculo: a regra prossegue para um hospital que já não serve o relógio.',
      },
    ),
    incidente(
      'fuel_final',
      'combustivel',
      'Combustível justificado só até ao STOL; o planeado ficou fora de alcance com o desvio.',
      {
        aeronave: { fuel_kg: 210, alcance_restante_km: 95 },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'desviar_alternativo',
        acoesAceites: ['desviar_alternativo', 'regressar_base'],
        destinosAceites: ['stol_proximo', 'origem'],
        deveEscalar: false,
        nota: 'A regra não lê fuel.',
      },
    ),
  ];
}

function fitaCarga(rnd) {
  const payload = 2300 + Math.round(rnd() * 200);
  return [
    incidente(
      'sobrecarga',
      'payload',
      `Payload ${payload} kg e vento de frente 32 kt. Combustível não chega a Beja com esta massa.`,
      {
        aeronave: { payload_kg: payload, fuel_kg: 480, alcance_restante_km: 240 },
        ambiente: { vento_kt: 32 },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'regressar_base',
        acoesAceites: ['regressar_base', 'desviar_alternativo'],
        destinosAceites: ['origem', 'stol_proximo'],
        deveEscalar: false,
        nota: 'A regra ignora massa e manda prosseguir.',
      },
    ),
    incidente(
      'vento_frente',
      'meteorologia',
      'Vento de frente sobe a 38 kt. O alcance restante cai abaixo da etapa.',
      {
        ambiente: { vento_kt: 38, tecto_ft: 2200 },
        aeronave: { alcance_restante_km: 180 },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'desviar_alternativo',
        acoesAceites: ['regressar_base', 'desviar_alternativo'],
        destinosAceites: ['origem', 'stol_proximo'],
        deveEscalar: false,
        nota: 'Sem obstáculo: a regra prossegue.',
      },
    ),
    trafegoGeometrico(),
    incidente(
      'rampa',
      'carga',
      'Deslocamento na rampa. Integridade 78 %. A carga não está segura para o cruzeiro.',
      {
        aeronave: { integridade: 78 },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'orbitar',
        acoesAceites: ['orbitar', 'regressar_base'],
        destinosAceites: ['origem', 'planeado'],
        deveEscalar: true,
        nota: 'Integridade acima de 40 — a regra não aborta nem pergunta.',
      },
    ),
    incidente(
      'pista_terra',
      'pista',
      'Alternativa de terra com 700 m, molhada. Beja continua longe para o fuel que resta.',
      {
        ambiente: {
          superficie_pista: 'nao_pavimentada',
          comprimento_pista_m: 700,
        },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'desviar_alternativo',
        acoesAceites: ['desviar_alternativo', 'regressar_base', 'orbitar'],
        destinosAceites: ['stol_proximo', 'origem'],
        deveEscalar: false,
        nota: 'Superfície e comprimento não entram na regra.',
      },
    ),
    incidente(
      'descarregar',
      'payload',
      'Ainda 2400 kg a bordo. Sem descarregar, qualquer destino útil fica fora de reserva.',
      {
        aeronave: { payload_kg: 2400, fuel_kg: 360, alcance_restante_km: 150 },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'regressar_base',
        acoesAceites: ['regressar_base', 'abortar_emergencia'],
        destinosAceites: ['origem'],
        deveEscalar: false,
        nota: 'Recusar a sobrecarga é a tese. A regra não pesa.',
      },
    ),
  ];
}

function fitaSar(rnd) {
  const vis = Number((1.5 + rnd() * 1.2).toFixed(1));
  return [
    incidente(
      'luz_acabar',
      'luz',
      'Luz do dia a acabar. O sector SAR fica sem referência visual em menos de 20 min.',
      {
        ambiente: { luz_dia: false, vis_km: 4, tecto_ft: 1200 },
        missao: { relogio_s: 1100 },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'orbitar',
        acoesAceites: ['orbitar', 'desviar_alternativo'],
        deveEscalar: true,
        nota: 'Vidas vs luz: o JEV deve perguntar ao PIC, não automatizar.',
      },
    ),
    incidente(
      'contacto_incerto',
      'contacto',
      `Possível contacto visual, visibilidade ${vis} km. Não há confirmação. Dois tripulantes a bordo.`,
      {
        ambiente: { vis_km: vis, luz_dia: false },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'orbitar',
        acoesAceites: ['orbitar', 'desviar_alternativo', 'prosseguir'],
        deveEscalar: true,
        nota: 'Contacto incerto — escalar, não inventar certeza.',
      },
    ),
    trafegoGeometrico(),
    incidente(
      'mar_grosso',
      'ambiente',
      'Mar grosso, sem zona de amaragem. Integridade 70 % após turbulência baixa.',
      {
        aeronave: { integridade: 70 },
        ambiente: { vento_kt: 34, vis_km: 3 },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'orbitar',
        acoesAceites: ['orbitar', 'regressar_base'],
        deveEscalar: true,
        nota: 'A regra não lê o mar.',
      },
    ),
    incidente(
      'vidas_vs_asa',
      'integridade',
      'Pedido para descer à camada. Integridade 62 %. Almas no mar por confirmar.',
      {
        aeronave: { integridade: 62 },
        missao: { almas: 2, relogio_s: 600 },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'orbitar',
        acoesAceites: ['orbitar', 'desviar_alternativo', 'regressar_base'],
        deveEscalar: true,
        nota: 'Vidas vs integridade — a feature que a geometria não vende.',
      },
    ),
    incidente(
      'janela_fecha',
      'luz',
      'A janela visual fechou. Combustível para regresso com reserva curta.',
      {
        ambiente: { luz_dia: false, vis_km: 1.2 },
        aeronave: { fuel_kg: 240, alcance_restante_km: 140 },
        geometria: { obstaculos: [] },
      },
      {
        acao: 'regressar_base',
        acoesAceites: ['regressar_base', 'desviar_alternativo'],
        destinosAceites: ['origem', 'stol_proximo'],
        deveEscalar: true,
        nota: 'Sem contacto e sem luz: não insistir no sector.',
      },
    ),
  ];
}

const GERADORES = {
  medevac: fitaMedevac,
  carga: fitaCarga,
  sar: fitaSar,
};

export function gerarFita(cenarioId, semente = 222) {
  const id = CENARIOS[cenarioId] ? cenarioId : 'medevac';
  const rnd = mulberry32(Number(semente) || 222);
  const incidentes = GERADORES[id](rnd);
  return {
    cenario: id,
    semente: Number(semente) || 222,
    incidentes,
  };
}

export function aplicarIncidente(estado, incidente) {
  const patch = incidente.patch ?? {};
  const atual = lerEstado(estado);
  return lerEstado({
    aeronave: { ...atual.aeronave, ...(patch.aeronave ?? {}) },
    missao: { ...atual.missao, ...(patch.missao ?? {}) },
    ambiente: { ...atual.ambiente, ...(patch.ambiente ?? {}) },
    geometria: patch.geometria ?? { obstaculos: [] },
    restricoes: { ...atual.restricoes, ...(patch.restricoes ?? {}) },
    incidente: {
      id: incidente.id,
      tipo: incidente.tipo,
      resumo: incidente.resumo,
    },
  });
}

export function estadoPublico(estado) {
  return lerEstado(estado);
}
