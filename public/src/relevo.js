import { pontoMundo } from './escala.js';

// Relevo procedural determinístico, em coordenadas do mundo (metros, x
// espelhado). Nível do mar = 0; terra ≥ 2 m. Sem dependências.
export const PLANO_PISTA_M = 2;

function hash(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const suave = (t) => t * t * (3 - 2 * t);
const entre01 = (v) => Math.min(1, Math.max(0, v));

/** Ruído de valor 2D em [-1, 1]. */
export function ruido2(x, z, seed = 1) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const u = suave(x - ix);
  const v = suave(z - iz);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

/** Ruído fractal em [0, 1]. */
export function fbm(x, z, seed = 1, oitavas = 4) {
  let soma = 0;
  let amp = 0.5;
  let freq = 1;
  let norma = 0;
  for (let i = 0; i < oitavas; i++) {
    soma += amp * ruido2(x * freq, z * freq, seed + i * 17);
    norma += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return 0.5 + 0.5 * (soma / norma);
}

// Posições do mundo (x já espelhado). Açores: ilhas afastadas da rota para
// o relevo não subir ao corredor de cruzeiro.
const PERFIS = {
  porto: { agua: 'costa', costaX: 7000, recorteM: 1800, amplitude: 90, escala: 1 / 2600, seed: 11 },
  sar: { agua: 'costa', costaX: -6000, recorteM: 1500, amplitude: 120, escala: 1 / 2200, seed: 23 },
  carga: { agua: 'terra', amplitude: 45, escala: 1 / 4200, seed: 31 },
  medevac: {
    agua: 'ilhas', escala: 1 / 1600, seed: 47,
    ilhas: [
      { x: 9000, z: -2000, raio: 16000, alturaM: 900 },
      { x: -14000, z: 170000, raio: 22000, alturaM: 950 },
      { x: 24000, z: 72000, raio: 7000, alturaM: 600 },
    ],
  },
  corredor: { agua: 'terra', amplitude: 6, escala: 1 / 500, seed: 5 },
};

export function perfilTerreno(cenario) {
  return PERFIS[cenario] ?? PERFIS.corredor;
}

function alturaBase(perfil, x, z) {
  const relevo = fbm(x * perfil.escala, z * perfil.escala, perfil.seed);
  if (perfil.agua === 'costa') {
    const costa = perfil.costaX + perfil.recorteM * ruido2(z / 7000, 3.7, perfil.seed + 5);
    const terra = costa - x; // metros para dentro de terra; mar para +X
    if (terra < 0) return Math.max(-40, terra * 0.05);
    const afastamentoRota = entre01((Math.abs(x) - 800) / 4000);
    return PLANO_PISTA_M + entre01(terra / 2500) * perfil.amplitude * relevo * (0.35 + 0.65 * afastamentoRota);
  }
  if (perfil.agua === 'ilhas') {
    let h = -40;
    for (const i of perfil.ilhas) {
      const d = Math.hypot(x - i.x, z - i.z) / i.raio;
      if (d < 1) h = Math.max(h, PLANO_PISTA_M + i.alturaM * (1 - d) ** 1.8 * (0.55 + 0.45 * relevo));
    }
    return h;
  }
  return PLANO_PISTA_M + perfil.amplitude * relevo;
}

/** Pistas (origem, destino e alternativos) em coordenadas do mundo. */
export function pistasDaMissao(destinos) {
  return destinos.map((d) => ({ id: d.id, ...pontoMundo(d.xM, d.zM), raioPlanoM: 1200 }));
}

/** Altura do terreno; à volta de cada pista o chão fica plano e seco. */
export function alturaTerreno(perfil, x, z, pistas = []) {
  let h = alturaBase(perfil, x, z);
  for (const p of pistas) {
    const d = Math.hypot(x - p.x, z - p.z);
    const raio = p.raioPlanoM ?? 1200;
    if (d < raio * 1.8) {
      const t = suave(entre01((d - raio) / (raio * 0.8)));
      h = PLANO_PISTA_M + (h - PLANO_PISTA_M) * t;
    }
  }
  return h;
}
