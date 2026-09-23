export const DURACAO_ABERTURA_S = 3;
export const REGRESSO_APOS_S = 4;
export const DURACAO_EVENTO_S = 2.6;
const ORDEM = ['cauda', 'lado', 'livre'];

export function novaCamara(agoraS, { abertura = true } = {}) {
  return { inicioS: abertura ? agoraS : -Infinity, ultimaInteracaoS: null, eventoAteS: null, preferido: 'cauda' };
}

export function registarInteracao(c, agoraS) {
  return { ...c, ultimaInteracaoS: agoraS };
}

export function registarEvento(c, agoraS) {
  return { ...c, eventoAteS: agoraS + DURACAO_EVENTO_S };
}

export function alternarPreferido(c) {
  return { ...c, preferido: ORDEM[(ORDEM.indexOf(c.preferido) + 1) % ORDEM.length], ultimaInteracaoS: null };
}

export function modoCamara(c, agoraS) {
  if (c.ultimaInteracaoS != null && agoraS - c.ultimaInteracaoS < REGRESSO_APOS_S) return 'livre';
  if (c.preferido === 'livre') return 'livre';
  if (agoraS - c.inicioS < DURACAO_ABERTURA_S) return 'abertura';
  if (c.eventoAteS != null && agoraS < c.eventoAteS) return 'evento';
  return c.preferido;
}

/** Posição e mira da câmara para os modos automáticos (coordenadas locais). */
export function alvoCamara(modo, pose, { fit = 1, foco = null } = {}) {
  const fx = Math.sin(pose.heading);
  const fz = Math.cos(pose.heading);
  // Lado esquerdo do piloto (+X com heading 0), onde a pintura se lê de frente.
  const lx = fz;
  const lz = -fx;
  if (modo === 'abertura' || modo === 'lado') {
    const d = 34 / fit;
    return {
      pos: { x: pose.x + lx * d + fx * 4, y: pose.y + 3, z: pose.z + lz * d + fz * 4 },
      mira: { x: pose.x, y: pose.y + 0.5, z: pose.z },
    };
  }
  if (modo === 'evento' && foco) {
    return {
      pos: { x: pose.x - fx * (48 / fit) + lx * 14, y: pose.y + 16, z: pose.z - fz * (48 / fit) + lz * 14 },
      mira: { x: (pose.x + foco.x) / 2, y: (pose.y + foco.y) / 2, z: (pose.z + foco.z) / 2 },
    };
  }
  const back = 30 / fit;
  return {
    pos: { x: pose.x - fx * back, y: pose.y + 7.5 / fit, z: pose.z - fz * back },
    mira: { x: pose.x + fx * 46, y: pose.y + 2.2, z: pose.z + fz * 46 },
  };
}
