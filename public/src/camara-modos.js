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

/** O evento corta a abertura: acabado o enquadramento, segue para o modo preferido. */
export function registarEvento(c, agoraS) {
  return { ...c, inicioS: -Infinity, eventoAteS: agoraS + DURACAO_EVENTO_S };
}

export function alternarPreferido(c) {
  return { ...c, preferido: ORDEM[(ORDEM.indexOf(c.preferido) + 1) % ORDEM.length], ultimaInteracaoS: null };
}

/** Prioridade: livre (mão ou botão) > evento > abertura > modo preferido. */
export function modoCamara(c, agoraS) {
  if (c.ultimaInteracaoS != null && agoraS - c.ultimaInteracaoS < REGRESSO_APOS_S) return 'livre';
  if (c.preferido === 'livre') return 'livre';
  if (c.eventoAteS != null && agoraS < c.eventoAteS) return 'evento';
  if (agoraS - c.inicioS < DURACAO_ABERTURA_S) return 'abertura';
  return c.preferido;
}

const subtrair = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });

function unitario(v) {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

/**
 * Evento: câmara atrás e acima, do lado oposto à ameaça (vista quase em fila,
 * avião e ameaça ficam próximos no quadro), a mirar a bissectriz das direcções
 * câmara→avião e câmara→ameaça. O ponto médio no mundo puxava a mira para a
 * ameaça distante e deixava o avião fora do quadro no telemóvel.
 */
function enquadrarEvento(pose, foco, fit, frente, esquerda) {
  const lateral = (foco.x - pose.x) * esquerda.x + (foco.z - pose.z) * esquerda.z;
  const lado = lateral > 0 ? -1 : 1;
  const atras = 48 / fit;
  const pos = {
    x: pose.x - frente.x * atras + lado * esquerda.x * 14,
    y: pose.y + 16,
    z: pose.z - frente.z * atras + lado * esquerda.z * 14,
  };
  const paraAviao = subtrair(pose, pos);
  const distancia = Math.hypot(paraAviao.x, paraAviao.y, paraAviao.z);
  const a = unitario(paraAviao);
  const b = unitario(subtrair(foco, pos));
  const bissectriz = unitario({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
  return {
    pos,
    mira: {
      x: pos.x + bissectriz.x * distancia,
      y: pos.y + bissectriz.y * distancia,
      z: pos.z + bissectriz.z * distancia,
    },
  };
}

/** Posição e mira da câmara para os modos automáticos (coordenadas locais). */
export function alvoCamara(modo, pose, { fit = 1, foco = null } = {}) {
  const frente = { x: Math.sin(pose.heading), z: Math.cos(pose.heading) };
  // Esquerda do piloto: +X com rumo 0 (ver escala.js).
  const esquerda = { x: frente.z, z: -frente.x };
  if (modo === 'abertura' || modo === 'lado') {
    // Lado direito do piloto (−X com rumo 0): é o flanco que o sol de world.js
    // ilumina; a pintura lê-se sem espelho dos dois lados. Perto, para o texto
    // se ler; no telemóvel em pé afasta até ao dobro para o avião caber.
    const d = 24 / Math.max(fit, 0.5);
    return {
      pos: { x: pose.x - esquerda.x * d + frente.x * 4, y: pose.y + 3, z: pose.z - esquerda.z * d + frente.z * 4 },
      mira: { x: pose.x, y: pose.y + 0.5, z: pose.z },
    };
  }
  if (modo === 'evento' && foco) return enquadrarEvento(pose, foco, fit, frente, esquerda);
  const back = 30 / fit;
  return {
    pos: { x: pose.x - frente.x * back, y: pose.y + 7.5 / fit, z: pose.z - frente.z * back },
    mira: { x: pose.x + frente.x * 46, y: pose.y + 2.2, z: pose.z + frente.z * 46 },
  };
}
