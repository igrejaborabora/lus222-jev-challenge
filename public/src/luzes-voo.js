/** Luzes pequenas no avião; tempo de simulação mantém pausa e replay coerentes. */
export function faseLuzes(tempoS, reduzido = false) {
  if (reduzido) return { beacon: true, estrobo: true };
  const t = ((tempoS % 1.4) + 1.4) % 1.4;
  return { beacon: t < 0.3, estrobo: t < 0.07 || (t >= 0.16 && t < 0.23) };
}
