/** Momentos que o /api/jev aceita; qualquer outro valor dá 400. */
export const MOMENTOS = Object.freeze(['briefing', 'incidente', 'piloto']);

export function momentoDe(body) {
  const momento = body?.momento;
  return MOMENTOS.includes(momento) ? momento : null;
}

const DOMINIO_PUBLICO = 'lus222.pixelgrammar.com';
const ALIAS_PRODUCAO = 'lus222-jev-challenge.vercel.app';
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * Só o próprio site chama o JEV: o domínio público, o alias de produção e os
 * URLs deste deployment (VERCEL_*_URL, sem protocolo). Nunca um curinga
 * *.vercel.app, que aceitaria projectos alheios. Sem Origin (curl, gravador
 * de replays) só fora da Vercel ou no vercel dev.
 */
export function origemPermitida(origin, env = {}) {
  const local = !env.VERCEL_ENV || env.VERCEL_ENV === 'development';
  if (!origin) return local;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol === 'http:') return local && HOSTS_LOCAIS.has(url.hostname);
  if (url.protocol !== 'https:') return false;
  const permitidos = [DOMINIO_PUBLICO, ALIAS_PRODUCAO, env.VERCEL_URL, env.VERCEL_BRANCH_URL, env.VERCEL_PROJECT_PRODUCTION_URL]
    .filter(Boolean)
    .map((host) => String(host).toLowerCase());
  return permitidos.includes(url.host.toLowerCase());
}

/**
 * Classifica uma falha do Gateway pelo statusCode e pelo tipo, e não pela
 * mensagem solta: o AI SDK embrulha as tentativas (lastError) e as causas.
 * Orçamento ou quota esgotados e 429 contam como «limite».
 */
export function classificarErro(erro) {
  const cadeia = [];
  for (let e = erro, i = 0; e && i < 6; i += 1) {
    cadeia.push(e);
    e = e.lastError ?? e.cause;
  }
  if (cadeia.some((e) => e?.name === 'TimeoutError' || e?.name === 'AbortError')) return 'timeout';
  const estados = cadeia.map((e) => Number(e?.statusCode)).filter(Number.isFinite);
  const texto = cadeia
    .map((e) => `${e?.type ?? ''} ${e?.message ?? ''} ${typeof e?.responseBody === 'string' ? e.responseBody : ''}`)
    .join(' ');
  if (/quota_for_entity_exceeded|budget exceeded|quota limit exceeded|insufficient (funds|credits)/i.test(texto)) return 'limite';
  // 402 é orçamento; um 429 sem quota é congestionamento passageiro do Gateway, não o fim do modo ao vivo.
  if (estados.includes(402)) return 'limite';
  if (estados.includes(401) || estados.includes(403)) return 'gateway_nao_configurado';
  return 'gateway_indisponivel';
}
