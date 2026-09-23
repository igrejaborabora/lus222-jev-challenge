import { pontoMundo } from './escala.js';

// Relevo procedural determinístico, em coordenadas do mundo (metros, x
// espelhado). Nível do mar = 0; terra ≥ 2 m; da orla ao fundo (−40 m) desce
// a 5 %. Sem dependências.
export const PLANO_PISTA_M = 2;
const FUNDO_M = -40;
// Declive da plataforma submersa: a terra entra no mar sem paredes.
const PLATAFORMA = 0.05;
// Declive máximo da rampa entre o plano da pista e o relevo natural.
const RAMPA_MAX = 0.05;

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
  sar:{ agua: 'costa', costaX: -6000, recorteM: 1500, amplitude: 120, escala: 1 / 2200, seed: 23 },
  carga: { agua: 'terra', amplitude: 45, escala: 1 / 4200, seed: 31 },
  medevac: {
    agua: 'ilhas', escala: 1 / 1600, seed: 47,
    ilhas: [
      { x: 12000, z: -2000, raio: 16000, alturaM: 900 },
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
    if (terra < 0) return Math.max(FUNDO_M, PLANO_PISTA_M + terra * PLATAFORMA);
    const afastamentoRota = entre01((Math.abs(x) - 800) / 4000);
    return PLANO_PISTA_M + entre01(terra / 2500) * perfil.amplitude * relevo * (0.35 + 0.65 * afastamentoRota);
  }
  if (perfil.agua === 'ilhas') {
    let h = FUNDO_M;
    for (const i of perfil.ilhas) {
      const d = Math.hypot(x - i.x, z - i.z) / i.raio;
      const hi = d < 1
        ? PLANO_PISTA_M + i.alturaM * (1 - d) ** 1.8 * (0.55 + 0.45 * relevo)
        : PLANO_PISTA_M - (d - 1) * i.raio * PLATAFORMA;
      h = Math.max(h, hi);
    }
    return h;
  }
  return PLANO_PISTA_M + perfil.amplitude * relevo;
}

/** Pistas (origem, destino e alternativos) em coordenadas do mundo. */
export function pistasDaMissao(destinos) {
  return destinos.map((d) => ({ id: d.id, ...pontoMundo(d.xM, d.zM), raioPlanoM: 1200 }));
}

// Ilhéu da pista: uma pista junto ao mar assenta numa ilha rasa, em vez de
// um disco plano a flutuar. Nunca sobe mais de ONDULACAO_ILHEU_M acima do
// plano (sem rebordo à volta da pista) e a partir de RAIO_ILHEU_M a orla
// desce a 5 % até ao fundo.
const RAIO_ILHEU_M = 3000;
const ONDULACAO_ILHEU_M = 1.5;
const ALCANCE_ILHEU_M = RAIO_ILHEU_M + (PLANO_PISTA_M + ONDULACAO_ILHEU_M - FUNDO_M) / PLATAFORMA;
function ilheuDaPista(perfil, x, z, d) {
  const chao = PLANO_PISTA_M + ONDULACAO_ILHEU_M * fbm(x * perfil.escala, z * perfil.escala, perfil.seed);
  return chao - Math.max(0, d - RAIO_ILHEU_M) * PLATAFORMA;
}

// Há mar a menos de ~2 raios do centro? (a pista pode estar em terra, à beira-mar)
function haMarPerto(perfil, p) {
  for (let r = 400; r <= 2400; r += 400) {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * 2 * Math.PI;
      if (alturaBase(perfil, p.x + r * Math.cos(a), p.z + r * Math.sin(a)) < PLANO_PISTA_M) return true;
    }
  }
  return false;
}

function prepararPista(perfil, p) {
  const baseM = alturaBase(perfil, p.x, p.z);
  return { ...p, baseM, ilheu: baseM < PLANO_PISTA_M || haMarPerto(perfil, p) };
}

/**
 * Calcula uma vez por pista a altura natural no centro (baseM) e se leva
 * ilhéu. O construtor do terreno chama isto uma vez e não por vértice.
 */
export function prepararPistas(perfil, pistas) {
  return pistas.map((p) => prepararPista(perfil, p));
}

// Rede de segurança: pistas passadas sem preparar são preparadas uma só vez
// por objeto (e perfil), em vez de a cada vértice (~100 amostras por pista).
const jaPreparadas = new WeakMap();
function pistaPronta(perfil, p) {
  if (p.baseM !== undefined && p.ilheu !== undefined) return p;
  const guardada = jaPreparadas.get(p);
  if (guardada?.perfil === perfil) return guardada.pista;
  const pista = prepararPista(perfil, p);
  jaPreparadas.set(p, { perfil, pista });
  return pista;
}

// Desnível máximo permitido a d metros do centro da pista: zero no plano,
// depois uma rampa a RAMPA_MAX (a entrada arredonda em ARREDONDAR_M, sem
// aresta). Com o relevo à altura baseM, a rampa mede |baseM − plano| / RAMPA_MAX.
const ARREDONDAR_M = 400;
function folgaRampa(d, raio) {
  const e = d - raio;
  if (e <= 0) return 0;
  return RAMPA_MAX * (e < ARREDONDAR_M ? (e * e) / (2 * ARREDONDAR_M) : e - ARREDONDAR_M / 2);
}

/**
 * Até onde (m do centro) chega a rampa de uma pista preparada: plano, rampa a
 * RAMPA_MAX até à altura natural do centro (baseM) e a entrada arredondada.
 */
export function alcanceRampaM(pista) {
  if (typeof pista.baseM !== 'number') throw new TypeError('alcanceRampaM: pista sem baseM; usar prepararPistas');
  return (pista.raioPlanoM ?? 1200) + Math.abs(pista.baseM - PLANO_PISTA_M) / RAMPA_MAX + ARREDONDAR_M;
}

/**
 * Altura do terreno; à volta de cada pista o chão fica plano (PLANO_PISTA_M)
 * e liga-se ao relevo por uma rampa que nunca passa RAMPA_MAX, mesmo quando o
 * relevo sobe para lá do centro. Sem paredes, nem em terra nem debaixo de água.
 */
export function alturaTerreno(perfil, x, z, pistas = []) {
  let h = alturaBase(perfil, x, z);
  // Chamado por vértice: sem alocações. Primeiro todos os ilhéus, depois
  // todas as rampas (a ordem conta quando as zonas se sobrepõem).
  for (const q of pistas) {
    const p = pistaPronta(perfil, q);
    if (!p.ilheu) continue;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < ALCANCE_ILHEU_M) h = Math.max(h, ilheuDaPista(perfil, x, z, d));
  }
  for (const q of pistas) {
    const p = pistaPronta(perfil, q);
    const folga = folgaRampa(Math.hypot(x - p.x, z - p.z), p.raioPlanoM ?? 1200);
    h = Math.min(PLANO_PISTA_M + folga, Math.max(PLANO_PISTA_M - folga, h));
  }
  return h;
}
