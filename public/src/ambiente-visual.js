/**
 * Céu visual derivado do estado da simulação (`ambiente`): o ecrã mostra o
 * mesmo tecto, visibilidade, luz e vento que o JEV recebe. Módulo puro; o
 * Three.js só consome estes números.
 */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const suave = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function alturaNuvensM(tetoFt) {
  return Math.max(60, Number(tetoFt) * 0.3048);
}

/**
 * Distância de (dx, dy, dz) — do centro do tufo ao ponto, em eixos do mundo —
 * em raios do elipsóide do tufo (1 = à superfície). `tufo` traz os raios
 * (sx, sy, sz) e o cos/sin do seu ângulo em Y; abaixo do centro o raio
 * vertical é achatado a `base` (a base plana do cúmulo). Sem alocações.
 */
export function distanciaNoTufo(dx, dy, dz, tufo, base = 1) {
  const x = (tufo.cos * dx - tufo.sin * dz) / tufo.sx;
  const y = dy / (dy < 0 ? tufo.sy * base : tufo.sy);
  const z = (tufo.sin * dx + tufo.cos * dz) / tufo.sz;
  return Math.hypot(x, y, z);
}

// Bolha à volta do avião e da câmara: dentro de 1,15 raios o tufo some; a
// partir de 1,9 fica inteiro. Encolhe para o centro sem nunca os alcançar.
const BOLHA_DENTRO = 1.15;
const BOLHA_FORA = 1.9;

/** Factor de escala de um tufo à distância `dNorm` (distanciaNoTufo) do ponto mais perto. */
export function escalaBolha(dNorm) {
  return suave(BOLHA_DENTRO, BOLHA_FORA, dNorm);
}

/** Nevoeiro pela visibilidade, limitado ao terreno carregado para não mostrar a borda. */
export function nevoeiroDe(visKm, alcanceTerrenoM) {
  const far = Math.round(Math.min(clamp(visKm * 1000, 800, 14000), alcanceTerrenoM * 0.95));
  return { near: Math.round(far * 0.18), far };
}

const NOITE_INICIAL = { porto: 0.35, sar: 0.2 };

export function noiteAlvo(cenario, luzDia, periodo) {
  if (periodo === 'dia') return 0;
  if (periodo === 'anoitecer') return 0.42;
  if (periodo === 'noite') return 1;
  return luzDia ? NOITE_INICIAL[cenario] ?? 0 : 1;
}

export function misturarCor(a, b, t) {
  const c = (s) => ((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t;
  return (Math.round(c(16)) << 16) | (Math.round(c(8)) << 8) | Math.round(c(0));
}

const DIA = { zenite: 0x3f6f9e, horizonte: 0xb8c6d2, nevoeiro: 0xa7b6c3, sol: 0xfff1d8 };
const NOITE = { zenite: 0x080b12, horizonte: 0x2a2f3c, nevoeiro: 0x1b2029, sol: 0xff9a5c };

export function paletaCeu(noite, ambiente = {}) {
  const n = clamp(noite, 0, 1);
  const cobertura = clamp(ambiente.cobertura ?? 0, 0, 1);
  const chuva = clamp(ambiente.chuva ?? 0, 0, 1);
  const cinza = cobertura * 0.38 + chuva * 0.18;
  const entardecer = suave(0.12, 0.42, n) * (1 - suave(0.5, 0.85, n));
  const horizonte = misturarCor(misturarCor(DIA.horizonte, NOITE.horizonte, n), 0xf2b48c, entardecer * (1 - cinza) * 0.55);
  return {
    zenite: misturarCor(misturarCor(DIA.zenite, NOITE.zenite, n), misturarCor(0x7d8998, 0x19202c, n), cinza),
    horizonte: misturarCor(horizonte, misturarCor(0xa0a8ae, 0x292f3a, n), cinza),
    nevoeiro: misturarCor(misturarCor(DIA.nevoeiro, NOITE.nevoeiro, n), misturarCor(0x929fa8, 0x242b34, n), cinza),
    corSol: misturarCor(DIA.sol, NOITE.sol, suave(0.2, 0.7, n)),
    intensidadeSol: 1.35 * (1 - 0.8 * n) * (1 - 0.72 * cobertura),
    // Luz difusa mantém a leitura do chão mesmo sob céu encoberto.
    intensidadeCeu: 1.05 * (1 - 0.6 * n) * (1 - 0.18 * chuva),
    // De dia ~37°, como a luz afinada; de noite abaixo do horizonte (só para o céu).
    elevacaoSolRad: 0.64 - 0.72 * n,
    luzes: suave(0.26, 0.8, n),
  };
}

export function ventoNoMundo(ventoMs) {
  const x = -(ventoMs?.x ?? 0);
  const z = ventoMs?.z ?? 0;
  return { x, z, kt: Math.hypot(x, z) * 1.94384 };
}
