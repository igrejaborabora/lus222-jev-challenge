/** Meteorologia ilustrativa e repetível; sem consultas externas nem relógio real. */
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const numero = (v, fallback, min, max) => Number.isFinite(v) ? clamp(v, min, max) : fallback;

export const CONFIGS_TEMPO = Object.freeze([
  { id: 'limpo', label: 'Clear skies', cobertura: 0, chuva: 0, turbulencia: 0.02, visKm: 24, tetoFt: 6500, ventoMs: { x: 1, z: -2 } },
  { id: 'poucas_nuvens', label: 'Few clouds', cobertura: 0.28, chuva: 0, turbulencia: 0.08, visKm: 18, tetoFt: 3800, ventoMs: { x: 3, z: -4 } },
  { id: 'nublado', label: 'Overcast', cobertura: 0.82, chuva: 0, turbulencia: 0.16, visKm: 11, tetoFt: 2300, ventoMs: { x: 5, z: -5 } },
  { id: 'chuva', label: 'Rain', cobertura: 0.88, chuva: 0.65, turbulencia: 0.3, visKm: 5, tetoFt: 1800, ventoMs: { x: 7, z: -8 } },
  { id: 'tempestade', label: 'Storm', cobertura: 1, chuva: 1, turbulencia: 0.8, visKm: 3, tetoFt: 1500, ventoMs: { x: 11, z: -13 } },
].map((p) => Object.freeze({ ...p, ventoMs: Object.freeze(p.ventoMs) })));

/** O anoitecer conserva luz ambiente suficiente para ler o terreno e a pista. */
export function ambienteMeteorologico(preset = 'poucas_nuvens', overrides = {}) {
  const p = CONFIGS_TEMPO.find((item) => item.id === preset) ?? CONFIGS_TEMPO[1];
  const periodo = ['dia', 'anoitecer', 'noite'].includes(overrides.periodo)
    ? overrides.periodo : overrides.luzDia === false ? 'noite' : 'anoitecer';
  return {
    tempo: p.id,
    periodo,
    luzDia: periodo !== 'noite',
    cobertura: numero(overrides.cobertura, p.cobertura, 0, 1),
    chuva: numero(overrides.chuva, p.chuva, 0, 1),
    turbulencia: numero(overrides.turbulencia, p.turbulencia, 0, 1),
    visKm: numero(overrides.visKm, p.visKm, 0.8, 40),
    tetoFt: numero(overrides.tetoFt, p.tetoFt, 200, 18000),
    ventoMs: {
      x: numero(overrides.ventoMs?.x, p.ventoMs.x, -35, 35),
      z: numero(overrides.ventoMs?.z, p.ventoMs.z, -35, 35),
    },
  };
}

/**
 * Vento nos eixos físicos (xM/zM), em m/s. As rajadas são ondas contínuas,
 * limitadas e sem ruído por frame: repetir tempo e semente repete o resultado.
 * O céu espelha x uma única vez, através de ventoNoMundo.
 */
export function ventoInstantaneo(ambiente, tempoS = 0, semente = 222) {
  const forca = numero(ambiente?.turbulencia, 0, 0, 1);
  const t = Number.isFinite(tempoS) ? tempoS : 0;
  const fase = (Number.isFinite(semente) ? semente : 222) * 0.61803398875;
  const onda = (velocidade, desvio) => Math.sin(t * velocidade + fase + desvio);
  return {
    x: numero(ambiente?.ventoMs?.x, 0, -35, 35) + forca * (3.4 * onda(0.43, 0) + 1.6 * onda(1.19, 1.2)),
    z: numero(ambiente?.ventoMs?.z, 0, -35, 35) + forca * (2.8 * onda(0.37, 2) + 1.2 * onda(1.37, 0.7)),
    vertical: forca ? forca * (1.3 * onda(0.61, 4) + 0.6 * onda(1.67, 2.1)) : 0,
  };
}
