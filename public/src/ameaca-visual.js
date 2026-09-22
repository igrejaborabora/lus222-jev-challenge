/** Projeção local ampliada: todo o deslocamento relativo usa a mesma escala. */
export function posicaoVisualBaloes(voo, ameaca, pose) {
  return {
    x: pose.x + (ameaca.xM - voo.xM) / 15,
    y: pose.y + (ameaca.altitudeM - voo.altitudeM) / 11.5,
    z: pose.z + (ameaca.zM - voo.zM) / 15,
  };
}
