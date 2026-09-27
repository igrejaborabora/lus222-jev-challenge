import { PLANO_PISTA_M } from './relevo.js';

// Referência visual da pista da simulação, não coordenadas geodésicas/cartas.
export const GLIDE_ANGLE_RAD = 3 * Math.PI / 180;
export const TOUCHDOWN_FROM_THRESHOLD_M = 300;
// Centro da aeronave acima das rodas. Mantém a referência do treino a 3°.
export const RUNWAY_AIRCRAFT_HEIGHT_M = 2.25;

export function runwayReference(pista) {
  return {
    x: pista.x, z: pista.z,
    heading: Number.isFinite(pista.heading) ? pista.heading : 0,
    comprimentoM: pista.comprimentoM ?? pista.pistaM ?? 3480,
    larguraM: pista.larguraM ?? 50,
    y: pista.y ?? PLANO_PISTA_M,
  };
}

/** +lateral é a esquerda do piloto, +along segue o rumo (eixos do mundo). */
export function runwayPoint(pista, lateral, along, altura = 0) {
  const c = Math.cos(pista.heading), s = Math.sin(pista.heading);
  return { x: pista.x + c * lateral + s * along, y: pista.y + altura, z: pista.z - s * lateral + c * along };
}

export function runwayCoordinates(pista, pose) {
  const dx = pose.x - pista.x, dz = pose.z - pista.z;
  const c = Math.cos(pista.heading), s = Math.sin(pista.heading);
  return { lateral: dx * c - dz * s, along: dx * s + dz * c };
}

/** direction +1 aproxima a soleira sul; -1 a soleira oposta. */
export function approachReference(pista, pose, direction = 1) {
  const local = runwayCoordinates(pista, pose);
  const distanceM = -local.along * direction - pista.comprimentoM / 2;
  const toTouchdownM = distanceM + TOUCHDOWN_FROM_THRESHOLD_M;
  const targetAltitudeM = pista.y + RUNWAY_AIRCRAFT_HEIGHT_M + Math.max(0, toTouchdownM) * Math.tan(GLIDE_ANGLE_RAD);
  const angleDeg = Math.atan2(pose.y - pista.y - RUNWAY_AIRCRAFT_HEIGHT_M, Math.max(0.01, toTouchdownM)) * 180 / Math.PI;
  const whites = [2.5, 2 + 5 / 6, 3 + 1 / 6, 3.5].filter(a => angleDeg >= a).length;
  // O PAPI só é legível na aproximação à sua cabeceira, nunca por trás.
  const visible = distanceM > -150 && distanceM < 6500 && Math.abs(local.lateral) < Math.max(120, toTouchdownM * 0.18);
  return { distanceM, lateralM: local.lateral * direction, targetAltitudeM, angleDeg, whites, reds: 4 - whites, visible };
}

/** Oito portais estáticos por sentido; o frame apenas escolhe a visibilidade. */
export function approachGates(pista, direction = 1) {
  return [250, 500, 850, 1250, 1750, 2300, 2900, 3500].map(distanceM => ({
    ...runwayPoint(pista, 0, -direction * (pista.comprimentoM / 2 + distanceM), RUNWAY_AIRCRAFT_HEIGHT_M + (distanceM + TOUCHDOWN_FROM_THRESHOLD_M) * Math.tan(GLIDE_ANGLE_RAD)),
    distanceM, halfWidthM: 25 + distanceM * 0.022, halfHeightM: 10 + distanceM * 0.006,
  }));
}
