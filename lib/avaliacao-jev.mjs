/**
 * Pontuação do banco de casos (scripts/avaliar-jev.mjs). Um caso tem um
 * conjunto de respostas aceites; mede-se se a escolha lá cai, quanta massa de
 * probabilidade o JEV lá põe e se a confiança acompanha o acerto.
 */

export function pontuar(answers, confidence, chave, aceites) {
  const resposta = answers?.[chave];
  const escolha = resposta?.choice ?? null;
  const probabilidades = resposta?.probabilities && typeof resposta.probabilities === 'object'
    ? resposta.probabilities
    : escolha ? { [escolha]: 1 } : {};
  const massa = aceites.reduce((soma, opcao) => soma + (Number(probabilidades[opcao]) || 0), 0);
  const c = Number(confidence?.[chave]);
  return {
    escolha,
    acerto: aceites.includes(escolha),
    massa: Math.min(1, massa),
    confianca: Number.isFinite(c) ? c : null,
  };
}

function percentil(valores, p) {
  const ordenados = valores.filter(Number.isFinite).sort((a, b) => a - b);
  if (!ordenados.length) return null;
  return ordenados[Math.min(ordenados.length - 1, Math.max(0, Math.ceil((p / 100) * ordenados.length) - 1))];
}

const arred = (v, casas = 3) => (Number.isFinite(v) ? Math.round(v * 10 ** casas) / 10 ** casas : null);

/**
 * Resumo de um conjunto de linhas pontuadas. brier é a média de (1 − massa)²:
 * 0 quando o JEV põe toda a probabilidade nas respostas aceites.
 */
export function resumir(linhas) {
  const n = linhas.length;
  const faixa = (f) => {
    const l = linhas.filter(f);
    return { n: l.length, acertos: l.filter((x) => x.acerto).length };
  };
  return {
    casos: n,
    acertos: linhas.filter((l) => l.acerto).length,
    acerto: n ? arred(linhas.filter((l) => l.acerto).length / n) : null,
    massa_media: n ? arred(linhas.reduce((s, l) => s + l.massa, 0) / n) : null,
    brier: n ? arred(linhas.reduce((s, l) => s + (1 - l.massa) ** 2, 0) / n) : null,
    confianca: {
      alta: faixa((l) => l.confianca != null && l.confianca >= 0.9),
      media: faixa((l) => l.confianca != null && l.confianca >= 0.5 && l.confianca < 0.9),
      baixa: faixa((l) => l.confianca != null && l.confianca < 0.5),
    },
    latencia_p50_ms: percentil(linhas.map((l) => l.latencia_ms), 50),
    latencia_p95_ms: percentil(linhas.map((l) => l.latencia_ms), 95),
    tokens_medios: n ? Math.round(linhas.reduce((s, l) => s + (Number(l.tokens) || 0), 0) / n) : null,
  };
}
