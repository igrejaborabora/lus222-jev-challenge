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

/** Nevoeiro pela visibilidade, limitado ao terreno carregado para não mostrar a borda. */
export function nevoeiroDe(visKm, alcanceTerrenoM) {
  const far = Math.round(Math.min(clamp(visKm * 1000, 800, 14000), alcanceTerrenoM * 0.95));
  return { near: Math.round(far * 0.18), far };
}

const NOITE_INICIAL = { porto: 0.35, sar: 0.2 };

export function noiteAlvo(cenario, luzDia) {
  return luzDia ? NOITE_INICIAL[cenario] ?? 0 : 1;
}

export function misturarCor(a, b, t) {
  const c = (s) => ((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t;
  return (Math.round(c(16)) << 16) | (Math.round(c(8)) << 8) | Math.round(c(0));
}

const DIA = { zenite: 0x3f6f9e, horizonte: 0xb8c6d2, nevoeiro: 0xa7b6c3, sol: 0xfff1d8 };
const NOITE = { zenite: 0x080b12, horizonte: 0x2a2f3c, nevoeiro: 0x1b2029, sol: 0xff9a5c };

export function paletaCeu(noite) {
  const n = clamp(noite, 0, 1);
  return {
    zenite: misturarCor(DIA.zenite, NOITE.zenite, n),
    horizonte: misturarCor(DIA.horizonte, NOITE.horizonte, n),
    nevoeiro: misturarCor(DIA.nevoeiro, NOITE.nevoeiro, n),
    corSol: misturarCor(DIA.sol, NOITE.sol, suave(0.2, 0.7, n)),
    intensidadeSol: 1.35 * (1 - 0.8 * n),
    intensidadeCeu: 1.05 * (1 - 0.6 * n),
    elevacaoSolRad: 0.9 - 0.98 * n,
    luzes: suave(0.45, 0.8, n),
  };
}

export function ventoNoMundo(ventoMs) {
  const x = -(ventoMs?.x ?? 0);
  const z = ventoMs?.z ?? 0;
  return { x, z, kt: Math.hypot(x, z) * 1.94384 };
}
