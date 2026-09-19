import { experimental_evaluate as evaluate } from 'ai';

/**
 * /api/jev — camada de decisão de evasão de obstáculos do LUS 222.
 *
 * Recebe o estado de voo (aeronave + corredor + obstáculos detectados) e devolve
 * uma decisão TIPADA do modelo `typesafe-ai/jev` da TypeSafe AI, servido pelo
 * Vercel AI Gateway:
 *
 *   manobra           choice   subir | descer | manter
 *   urgencia          score    0..3 (sem risco -> evasão de emergência)
 *   colisaoIminente   boolean  probabilidade de embate se nada mudar
 *   conforto          boolean  probabilidade de a manobra ser tolerável para os passageiros
 *
 * O Jev é um modelo "System One": avalia as quatro perguntas em paralelo, num único
 * round-trip, e devolve probabilidades em vez de texto. É isso que o torna utilizável
 * dentro de um ciclo de jogo — não há tokens a serem gerados em sequência.
 */

const MODEL = 'typesafe-ai/jev';
const MAX_OBSTACULOS = 4;

// Rate limit em memória (best-effort: cada instância da função tem o seu contador).
const buckets = new Map();
const LIMITE_POR_MIN = Number(process.env.JEV_RATE_LIMIT_PER_MIN || 400);

function rateLimited(ip) {
  const agora = Date.now();
  const janela = Math.floor(agora / 60_000);
  const chave = `${ip}:${janela}`;
  const contagem = (buckets.get(chave) || 0) + 1;
  buckets.set(chave, contagem);
  if (buckets.size > 5_000) {
    for (const k of buckets.keys()) {
      if (!k.endsWith(`:${janela}`)) buckets.delete(k);
    }
  }
  return contagem > LIMITE_POR_MIN;
}

const num = (v, fallback = 0) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Normaliza o que vem do browser: nunca confiar no cliente. */
function lerEstado(body) {
  const a = body?.aeronave ?? {};
  const c = body?.corredor ?? {};
  const obstaculos = Array.isArray(body?.obstaculos) ? body.obstaculos : [];

  return {
    aeronave: {
      altitude_m: Math.round(clamp(num(a.altitude_m), -100, 20000)),
      velocidade_vertical_ms: Math.round(clamp(num(a.velocidade_vertical_ms), -60, 60)),
      velocidade_ar_ms: Math.round(clamp(num(a.velocidade_ar_ms, 80), 0, 300)),
      carga_g: Number(clamp(num(a.carga_g, 1), -3, 5).toFixed(2)),
    },
    corredor: {
      altitude_minima_m: Math.round(clamp(num(c.altitude_minima_m), -100, 20000)),
      altitude_maxima_m: Math.round(clamp(num(c.altitude_maxima_m, 3000), 0, 20000)),
      margem_ao_solo_m: Math.round(clamp(num(c.margem_ao_solo_m), -500, 20000)),
      margem_ao_tecto_m: Math.round(clamp(num(c.margem_ao_tecto_m), -500, 20000)),
    },
    obstaculos: obstaculos.slice(0, MAX_OBSTACULOS).map((o) => ({
      tipo: String(o?.tipo ?? 'desconhecido').slice(0, 40),
      distancia_m: Math.round(clamp(num(o?.distancia_m), 0, 20000)),
      segundos_ate_ao_contacto: Number(clamp(num(o?.segundos_ate_ao_contacto, 99), 0, 999).toFixed(1)),
      base_m: Math.round(clamp(num(o?.base_m), -100, 20000)),
      topo_m: Math.round(clamp(num(o?.topo_m), -100, 20000)),
      passagem_por_cima_m: Math.round(clamp(num(o?.passagem_por_cima_m), -20000, 20000)),
      passagem_por_baixo_m: Math.round(clamp(num(o?.passagem_por_baixo_m), -20000, 20000)),
      em_rota_de_colisao: Boolean(o?.em_rota_de_colisao),
    })),
  };
}

const PERGUNTAS = {
  manobra: {
    type: 'choice',
    instructions:
      'És o sistema de evasão de obstáculos de um avião regional LUS 222 com 19 passageiros a bordo. ' +
      'Olha para o obstáculo mais próximo que esteja em rota de colisão e escolhe a manobra vertical a executar agora. ' +
      'Prefere a folga maior; se já estás em segurança, mantém o nível para poupar os passageiros.',
    criteria: {
      subir:
        'ganhar altitude — o obstáculo é ultrapassável por cima com folga, ou a aeronave está demasiado próxima do solo',
      descer:
        'perder altitude — o obstáculo é ultrapassável por baixo com folga, ou a aeronave está demasiado próxima do tecto do corredor',
      manter:
        'manter o nível de voo — não há obstáculo em rota de colisão, ou a trajectória actual já passa com folga',
    },
  },
  urgencia: {
    type: 'score',
    instructions:
      'Avalia a urgência da manobra de evasão tendo em conta os segundos até ao contacto e a folga vertical disponível.',
    criteria: [
      'sem risco: nenhum obstáculo em rota de colisão, ou mais de 8 segundos de folga',
      'vigiar: obstáculo em rota de colisão a 5-8 segundos, com folga vertical confortável',
      'actuar já: obstáculo em rota de colisão a 2-5 segundos, ou folga vertical reduzida',
      'evasão de emergência: menos de 2 segundos até ao contacto, ou folga vertical quase nula',
    ],
  },
  colisaoIminente: {
    type: 'boolean',
    instructions: 'Mantendo exactamente a trajectória actual, a aeronave embate num obstáculo, no solo ou no tecto?',
    criteria: {
      true: 'a trajectória actual leva a embate dentro de poucos segundos',
      false: 'a trajectória actual passa livre de obstáculos, solo e tecto',
    },
  },
  conforto: {
    type: 'boolean',
    instructions:
      'A manobra pode ser feita de forma suave, sem submeter os 19 passageiros a uma carga vertical desconfortável?',
    criteria: {
      true: 'há tempo e folga para uma correcção gradual, abaixo de 1,5 g',
      false: 'a situação exige uma manobra brusca, acima de 1,5 g',
    },
  },
};

/** Piloto de reserva puramente geométrico, usado quando o Gateway não responde. */
function decisaoGeometrica(estado) {
  const ameaca = estado.obstaculos.find((o) => o.em_rota_de_colisao) ?? null;
  if (!ameaca) {
    return {
      manobra: { type: 'choice', choice: 'manter', probabilities: { subir: 0, descer: 0, manter: 1 } },
      urgencia: { type: 'score', score: 0 },
      colisaoIminente: { type: 'boolean', probability: 0 },
      conforto: { type: 'boolean', probability: 1 },
    };
  }
  const porCima = ameaca.passagem_por_cima_m;
  const porBaixo = ameaca.passagem_por_baixo_m;
  const escolha = porCima >= porBaixo ? 'subir' : 'descer';
  const t = ameaca.segundos_ate_ao_contacto;
  const score = t < 2 ? 3 : t < 5 ? 2 : t < 8 ? 1 : 0;
  return {
    manobra: {
      type: 'choice',
      choice: escolha,
      probabilities: { subir: escolha === 'subir' ? 1 : 0, descer: escolha === 'descer' ? 1 : 0, manter: 0 },
    },
    urgencia: { type: 'score', score },
    colisaoIminente: { type: 'boolean', probability: 0.9 },
    conforto: { type: 'boolean', probability: t > 4 ? 0.9 : 0.2 },
  };
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
    const resultado = await evaluate({
      model: MODEL,
      state: estado,
      questions: PERGUNTAS,
    });

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
          ? 'AI Gateway sem credenciais — a usar o piloto de reserva geométrico.'
          : `Gateway indisponível (${mensagem.slice(0, 140)}) — a usar o piloto de reserva geométrico.`,
        answers: decisaoGeometrica(estado),
      },
      { status: 200 },
    );
  }
}

export async function GET() {
  return Response.json({
    servico: 'LUS 222 — camada de decisão JEV',
    modelo: MODEL,
    gateway_configurado: Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN),
    perguntas: Object.keys(PERGUNTAS),
    como_usar: 'POST com { aeronave, corredor, obstaculos[] }',
  });
}
