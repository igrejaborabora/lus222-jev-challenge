/**
 * Mundo 3D da missão em metros (1:1). O simulador usa +xM = direita do
 * piloto; no Three.js, com o nariz em +Z e a câmara atrás da cauda, a
 * direita do ecrã é −X. O mundo espelha x e o rumo: o que o JEV chama
 * «direita» vê-se à direita.
 */
export function pontoMundo(xM, zM) {
  return { x: -xM, z: zM };
}

export function poseMissao(voo, comando = null) {
  return {
    x: -voo.xM,
    y: voo.altitudeM,
    z: voo.zM,
    heading: -voo.rumoRad,
    // Com x espelhado, bank positivo do simulador (direita) é rotation.z positivo (asa direita em baixo).
    bank: voo.bankRad,
    pitch: -voo.pitchRad,
    hélice: voo.tempoS * 16,
    dodge: Boolean(comando && voo.tempoS < comando.evasaoAteS),
  };
}
