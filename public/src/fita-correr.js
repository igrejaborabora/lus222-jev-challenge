import { evasaoDeAnswers } from './decisao.js';
import { aplicarIncidente } from './fita.js';

/** Estado da missão no incidente `indice`, reaplicando a fita desde o briefing. */
export function estadoAteIndice(base, incidentes, indice) {
  let estado = base;
  const n = Array.isArray(incidentes) ? incidentes.length : 0;
  const fim = Math.min(Math.max(indice, -1), n - 1);
  for (let i = 0; i <= fim; i++) estado = aplicarIncidente(estado, incidentes[i]);
  return estado;
}

/**
 * Se a decisão deste beat já está no log, repete-a.
 * Não volta a pedir ao Gateway.
 */
export function planoDoBeat(registos, indice) {
  const row = Array.isArray(registos) ? registos[indice] : undefined;
  if (row?.jev?.answers) {
    return {
      modo: 'replay',
      jev: row.jev,
      baseline: row.baseline ?? null,
      pic: row.pic ?? null,
      evasao: evasaoDeAnswers(row.jev.answers),
    };
  }
  return { modo: 'evaluate', jev: null, baseline: null, pic: null, evasao: null };
}

export function podeVoltar(indice) {
  return Number.isInteger(indice) && indice > 0;
}
