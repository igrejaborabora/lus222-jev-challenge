import { experimental_evaluate as evaluate } from 'ai';
import { decisaoGeometrica, estadoParaJev, MODELO_JEV } from '../lib/decisao.mjs';
import { PERGUNTAS_BRIEFING, PERGUNTAS_INCIDENTE, perguntasPara } from '../lib/perguntas.mjs';
import { validarRespostas } from '../public/src/contrato-jev.js';

/**
 * /api/jev — JEV comanda o LUS-222.
 *
 * POST { momento: 'briefing' | 'incidente', estado }
 * Sucesso: { fonte: 'jev', answers, usage }
 * Falha: HTTP 503 { fonte: 'bloqueio' } — nunca devolve a regra geométrica
 * como se fosse JEV. A regra corre no cliente, em paralelo, para o debriefing.
 */

const MODEL = MODELO_JEV;
const TIMEOUT_MS = 12_000;
// No corredor contínuo uma resposta com mais de ~3 s já descreve outra geometria.
const TIMEOUT_PILOTO_MS = 3_000;
const buckets = new Map();
const LIMITE_POR_MIN = Number(process.env.JEV_RATE_LIMIT_PER_MIN || 400);

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

function gatewayConfigurado() {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}


function momentoDe(body) {
  return body?.momento === 'briefing' ? 'briefing' : 'incidente';
}

export async function POST(request) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'anon';

  if (rateLimited(ip)) {
    return Response.json(
      { fonte: 'bloqueio', erro: 'rate_limit', mensagem: 'Demasiadas avaliações por minuto.' },
      { status: 429 },
    );
  }

  if (!gatewayConfigurado()) {
    return Response.json(
      {
        fonte: 'bloqueio',
        erro: 'gateway_nao_configurado',
        mensagem: 'AI Gateway sem credenciais. A regra geométrica não se vende como JEV — a missão não arranca.',
      },
      { status: 503 },
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ fonte: 'bloqueio', erro: 'json_invalido' }, { status: 400 });
  }

  const momento = momentoDe(body);
  const estado = estadoParaJev(body?.estado ?? body);
  const questions = perguntasPara(momento, estado);
  const piloto = estado?.voo?.fase === 'piloto_continuo';
  const inicio = Date.now();

  try {
    // abortSignal cancela mesmo o pedido ao Gateway (um Promise.race deixava-o
    // a correr e a ser cobrado). No piloto, repetir um passo não tem valor.
    const resultado = await evaluate({
      model: MODEL,
      state: estado,
      questions,
      abortSignal: AbortSignal.timeout(piloto ? TIMEOUT_PILOTO_MS : TIMEOUT_MS),
      maxRetries: piloto ? 0 : 2,
    });
    const contrato = validarRespostas(momento, resultado.answers);
    if (!contrato.ok) {
      return Response.json(
        { fonte: 'bloqueio', erro: 'contrato_invalido', mensagem: `Resposta JEV inválida: ${contrato.erro}` },
        { status: 502 },
      );
    }
    return Response.json({
      versao_contrato: 3,
      fonte: 'jev',
      modelo: MODEL,
      momento,
      latencia_ms: Date.now() - inicio,
      answers: resultado.answers,
      usage: resultado.usage ?? null,
      confidence: resultado.providerMetadata?.typesafe?.confidence ?? null,
    });
  } catch (erro) {
    const mensagem = String(erro?.message ?? erro);
    const semChave = /api key|unauthor|credential|401|403/i.test(mensagem);
    const expirou = erro?.name === 'TimeoutError' || erro?.name === 'AbortError' || /timeout|abort/i.test(mensagem);
    if (!semChave && !expirou) console.error('[api/jev] gateway', mensagem.slice(0, 300));
    return Response.json(
      {
        fonte: 'bloqueio',
        modelo: null,
        momento,
        latencia_ms: Date.now() - inicio,
        erro: semChave ? 'gateway_nao_configurado' : expirou ? 'timeout' : 'gateway_indisponivel',
        mensagem: semChave
          ? 'AI Gateway sem credenciais. A regra geométrica não se vende como JEV.'
          : expirou
            ? 'O JEV não respondeu a tempo. A missão fica incompleta — não se finge uma decisão JEV.'
            : 'Gateway indisponível. A missão não continua como JEV.',
      },
      { status: 503 },
    );
  }
}

export async function GET() {
  return Response.json({
    servico: 'JEV comanda o LUS-222 — decisão tipada de missão',
    modelo: MODEL,
    gateway_configurado: gatewayConfigurado(),
    perguntas_briefing: Object.keys(PERGUNTAS_BRIEFING),
    perguntas_incidente: Object.keys(PERGUNTAS_INCIDENTE),
    acoes: ['prosseguir', 'desviar_alternativo', 'orbitar', 'regressar_base', 'abortar_emergencia'],
    manobras_verticais: ['subir', 'descer', 'manter'],
    manobras_laterais: ['esquerda', 'direita', 'manter'],
    destinos: ['planeado', 'stol_proximo', 'hospital_alternativo', 'aeroporto_alternativo', 'origem'],
    ambito:
      'Demo independente: o JEV aplica evasão (vertical/lateral) de imediato. Não é DAA certificável, não é autopiloto, não é produto oficial EEA/CEiiA salvo autorização escrita.',
    como_usar: "POST { momento: 'briefing' | 'incidente', estado }",
    aviso:
      'Sem Gateway a missão JEV não arranca. A regra geométrica corre em paralelo no cliente para o debriefing e nunca se apresenta como JEV.',
    baseline: 'decisaoGeometrica — só obstáculos em rota e integridade < 40',
  });
}

/** Exposto só para testes do contrato, nunca como resposta de sucesso do POST. */
export { decisaoGeometrica };
