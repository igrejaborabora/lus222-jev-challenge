import { experimental_evaluate as evaluate } from 'ai';

/**
 * /api/jev — camada de decisão de um drone de carga em corredor semi-urbano.
 *
 * Recebe o estado de voo e devolve uma decisão TIPADA do modelo `typesafe-ai/jev`
 * da TypeSafe AI, servido pelo Vercel AI Gateway:
 *
 *   manobraVertical   choice   subir | descer | manter
 *   manobraLateral    choice   esquerda | direita | manter
 *   urgencia          score    0..3 (sem risco -> evasão de emergência)
 *   colisaoIminente   boolean  probabilidade de embate mantendo a trajectória
 *   abortarMissao     boolean  probabilidade de a situação exigir abortar a entrega
 *
 * Os dois eixos são perguntas separadas porque corrigir altitude e desvio lateral
 * são decisões independentes — e o Jev responde às cinco em paralelo, num
 * único round-trip, devolvendo probabilidades em vez de texto. Cada resposta é
 * registável e reproduzível — é isso, e não a velocidade, que a torna defensável
 * perante quem tem de justificar o sistema a um regulador.
 *
 * NOTA DE ÂMBITO: esta é a camada de decisão de missão, não um sistema de
 * Detect-and-Avoid certificável. A terminação de voo e a separação mínima
 * continuam a pertencer a lógica determinística verificável.
 */

const MODEL = 'typesafe-ai/jev';
const MAX_OBSTACULOS = 4;
const VERTICAIS = ['subir', 'descer', 'manter'];
const LATERAIS = ['esquerda', 'direita', 'manter'];

const buckets = new Map();
const LIMITE_POR_MIN = Number(process.env.JEV_RATE_LIMIT_PER_MIN || 600);

function rateLimited(ip) {
  const janela = Math.floor(Date.now() / 60_000);
  const chave = `${ip}:${janela}`;
  const contagem = (buckets.get(chave) || 0) + 1;
  buckets.set(chave, contagem);
  if (buckets.size > 5_000) {
    for (const k of buckets.keys()) if (!k.endsWith(`:${janela}`)) buckets.delete(k);
  }
  return contagem > LIMITE_POR_MIN;
}

const num = (v, f = 0) => (Number.isFinite(Number(v)) ? Number(v) : f);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const round = (v, a, b, f = 0) => Math.round(clamp(num(v, f), a, b));

function lerEstado(body) {
  const a = body?.aeronave ?? {};
  const c = body?.corredor ?? {};
  const m = body?.missao ?? {};
  const obstaculos = Array.isArray(body?.obstaculos) ? body.obstaculos : [];

  return {
    aeronave: {
      altitude_m: round(a.altitude_m, -50, 500),
      desvio_lateral_m: round(a.desvio_lateral_m, -500, 500),
      velocidade_ar_ms: round(a.velocidade_ar_ms, 0, 120, 22),
      velocidade_vertical_ms: round(a.velocidade_vertical_ms, -40, 40),
      velocidade_lateral_ms: round(a.velocidade_lateral_ms, -40, 40),
    },
    corredor: {
      altitude_minima_m: round(c.altitude_minima_m, -50, 500, 10),
      altitude_maxima_m: round(c.altitude_maxima_m, 0, 500, 160),
      limite_lateral_m: round(c.limite_lateral_m, 0, 500, 60),
      margem_ao_solo_m: round(c.margem_ao_solo_m, -100, 500),
      margem_ao_tecto_m: round(c.margem_ao_tecto_m, -100, 500),
      margem_lateral_esquerda_m: round(c.margem_lateral_esquerda_m, -100, 500),
      margem_lateral_direita_m: round(c.margem_lateral_direita_m, -100, 500),
    },
    missao: {
      tipo: String(m.tipo ?? 'entrega de carga').slice(0, 60),
      carga: String(m.carga ?? 'material médico').slice(0, 60),
      distancia_ao_destino_m: round(m.distancia_ao_destino_m, 0, 20000),
      embates_ate_agora: round(m.embates_ate_agora, 0, 99),
      integridade_percent: round(m.integridade_percent, 0, 100, 100),
    },
    obstaculos: obstaculos.slice(0, MAX_OBSTACULOS).map((o) => ({
      tipo: String(o?.tipo ?? 'desconhecido').slice(0, 40),
      distancia_m: round(o?.distancia_m, 0, 2000),
      segundos_ate_ao_contacto: Number(clamp(num(o?.segundos_ate_ao_contacto, 99), 0, 999).toFixed(1)),
      folga_por_cima_m: round(o?.folga_por_cima_m, -500, 500),
      folga_por_baixo_m: round(o?.folga_por_baixo_m, -500, 500),
      folga_pela_esquerda_m: round(o?.folga_pela_esquerda_m, -500, 500),
      folga_pela_direita_m: round(o?.folga_pela_direita_m, -500, 500),
      em_rota_de_colisao: Boolean(o?.em_rota_de_colisao),
    })),
  };
}

const CONTEXTO =
  'És a camada de decisão de um drone de carga a voar num corredor semi-urbano com material médico a bordo. ' +
  'As folgas são medidas em relação à abertura livre do obstáculo mais próximo: um valor negativo significa que ' +
  'o drone já está fora da abertura por esse lado e tem de corrigir na direcção oposta. ';

const PERGUNTAS = {
  manobraVertical: {
    type: 'choice',
    instructions: CONTEXTO +
      'Escolhe a correcção no eixo VERTICAL a executar agora. Este eixo é independente do lateral — ' +
      'corrige-o mesmo que também seja preciso corrigir lateralmente.',
    criteria: {
      subir: 'ganhar altitude — a folga por baixo é negativa, ou a folga por cima é claramente maior',
      descer: 'perder altitude — a folga por cima é negativa, ou a folga por baixo é claramente maior',
      manter: 'manter a altitude — as folgas por cima e por baixo são ambas positivas e confortáveis',
    },
  },
  manobraLateral: {
    type: 'choice',
    instructions: CONTEXTO +
      'Escolhe a correcção no eixo LATERAL a executar agora. Este eixo é independente do vertical — ' +
      'corrige-o mesmo que também seja preciso corrigir em altitude.',
    criteria: {
      esquerda: 'desviar para a esquerda — a folga pela direita é negativa, ou a folga pela esquerda é claramente maior',
      direita: 'desviar para a direita — a folga pela esquerda é negativa, ou a folga pela direita é claramente maior',
      manter: 'manter o rumo lateral — as folgas dos dois lados são ambas positivas e confortáveis',
    },
  },
  urgencia: {
    type: 'score',
    instructions:
      'Avalia a urgência da correcção, tendo em conta os segundos até ao contacto e o tamanho das folgas negativas a corrigir.',
    criteria: [
      'sem risco: nenhum obstáculo em rota de colisão, ou mais de 6 segundos de folga',
      'vigiar: obstáculo em rota de colisão a 4-6 segundos, com folga confortável',
      'actuar já: obstáculo em rota de colisão a 2-4 segundos, ou folga reduzida',
      'evasão de emergência: menos de 2 segundos até ao contacto, ou folga quase nula',
    ],
  },
  colisaoIminente: {
    type: 'boolean',
    instructions: 'Mantendo exactamente a trajectória actual, o drone embate num obstáculo, no solo ou nos limites do corredor?',
    criteria: {
      true: 'a trajectória actual leva a embate dentro de poucos segundos',
      false: 'a trajectória actual passa livre de obstáculos e dos limites do corredor',
    },
  },
  abortarMissao: {
    type: 'boolean',
    instructions:
      'A entrega deve ser abortada e o drone regressar, em vez de prosseguir? Pondera os embates já sofridos, ' +
      'a integridade restante da aeronave e se o corredor à frente ainda oferece passagem.',
    criteria: {
      true: 'a aeronave já está degradada ou o corredor à frente não oferece passagem segura — prosseguir agrava o risco',
      false: 'a aeronave está em condições e há passagem à frente — a entrega deve prosseguir',
    },
  },
};

/** Baseline determinístico: escolhe a direcção com maior folga. Sem modelo, sem rede. */
export function decisaoGeometrica(estado) {
  const ameaca = estado.obstaculos.find((o) => o.em_rota_de_colisao) ?? null;

  if (!ameaca) {
    return {
      manobraVertical: { type: 'choice', choice: 'manter', probabilities: probs(VERTICAIS, 'manter') },
      manobraLateral: { type: 'choice', choice: 'manter', probabilities: probs(LATERAIS, 'manter') },
      urgencia: { type: 'score', score: 0 },
      colisaoIminente: { type: 'boolean', probability: 0.02 },
      abortarMissao: { type: 'boolean', probability: 0.02 },
    };
  }

  const cima = ameaca.folga_por_cima_m, baixo = ameaca.folga_por_baixo_m;
  const esq = ameaca.folga_pela_esquerda_m, dir = ameaca.folga_pela_direita_m;
  const vert = baixo < 0 ? 'subir' : cima < 0 ? 'descer' : 'manter';
  const lat = dir < 0 ? 'esquerda' : esq < 0 ? 'direita' : 'manter';
  const t = ameaca.segundos_ate_ao_contacto;
  const degradado = estado.missao.integridade_percent < 40 || estado.missao.embates_ate_agora >= 2;

  return {
    manobraVertical: { type: 'choice', choice: vert, probabilities: probs(VERTICAIS, vert) },
    manobraLateral: { type: 'choice', choice: lat, probabilities: probs(LATERAIS, lat) },
    urgencia: { type: 'score', score: t < 2 ? 3 : t < 4 ? 2 : t < 6 ? 1 : 0 },
    colisaoIminente: { type: 'boolean', probability: 0.9 },
    abortarMissao: { type: 'boolean', probability: degradado ? 0.8 : 0.05 },
  };
}

function probs(conjunto, escolhida) {
  return Object.fromEntries(conjunto.map((m) => [m, m === escolhida ? 1 : 0]));
}

export async function POST(request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anon';

  if (rateLimited(ip)) {
    return Response.json({ erro: 'rate_limit', mensagem: 'Demasiadas avaliações por minuto.' }, { status: 429 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ erro: 'json_invalido' }, { status: 400 });
  }

  const estado = lerEstado(body);
  const inicio = Date.now();

  try {
    const resultado = await evaluate({ model: MODEL, state: estado, questions: PERGUNTAS });
    return Response.json({
      fonte: 'jev',
      modelo: MODEL,
      latencia_ms: Date.now() - inicio,
      answers: resultado.answers,
      usage: resultado.usage ?? null,
    });
  } catch (erro) {
    const mensagem = String(erro?.message ?? erro);
    const semChave = /api key|unauthor|credential|401|403/i.test(mensagem);
    return Response.json(
      {
        fonte: 'reserva-geometrica',
        modelo: null,
        latencia_ms: Date.now() - inicio,
        aviso: semChave
          ? 'AI Gateway sem credenciais — a decisão veio do baseline geométrico.'
          : `Gateway indisponível (${mensagem.slice(0, 140)}) — a decisão veio do baseline geométrico.`,
        answers: decisaoGeometrica(estado),
      },
      { status: 200 },
    );
  }
}

export async function GET() {
  return Response.json({
    servico: 'Camada de decisão de missão — drone de carga semi-urbano',
    modelo: MODEL,
    gateway_configurado: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
    perguntas: Object.keys(PERGUNTAS),
    manobras: { vertical: VERTICAIS, lateral: LATERAIS },
    ambito: 'Decisão de missão e triagem. Não é um sistema de Detect-and-Avoid certificável.',
    como_usar: 'POST com { aeronave, corredor, missao, obstaculos[] }',
  });
}
