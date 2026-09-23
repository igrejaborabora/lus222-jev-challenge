/** Posição dos balões no mundo 1:1, relativa à pose (x espelhado, ver escala.js). */
export function posicaoVisualBaloes(voo, ameaca, pose) {
  return {
    x: pose.x - (ameaca.xM - voo.xM),
    y: pose.y + (ameaca.altitudeM - voo.altitudeM),
    z: pose.z + (ameaca.zM - voo.zM),
  };
}
