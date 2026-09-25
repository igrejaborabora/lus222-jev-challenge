export const DURACAO_ABERTURA_S = 3;
export const REGRESSO_APOS_S = 4;
export const DURACAO_EVENTO_S = 2.6;
export const PLANO_CINEMA_S = 7;
const ORDEM = ['cauda', 'lado', 'cinema', 'livre'];
const PLANOS_CINEMA = ['alto', 'lado', 'frente', 'orbita'];

/** Plano da câmara cinema neste instante: muda a cada 7 s, sempre pela mesma ordem. */
export function planoCinema(agoraS) {
  return PLANOS_CINEMA[Math.floor(Math.max(0, agoraS) / PLANO_CINEMA_S) % PLANOS_CINEMA.length];
}

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

// Evento: a mira fica este ângulo abaixo da ameaça, que assim se projecta
// pouco acima do centro (NDC y ≈ +0,06 com o fov vertical de 48° de world.js).
// Mais acima, o selo de decisão (topo, ao centro) tapava-lhe a etiqueta.
const MIRA_ABAIXO_AMEACA_RAD = 1.5 * (Math.PI / 180);

/**
 * Evento: câmara atrás e acima, do lado oposto à ameaça (vista quase em fila,
 * avião e ameaça ficam próximos no quadro). Na horizontal, a mira segue a
 * bissectriz das direcções câmara→avião e câmara→ameaça (o ponto médio no
 * mundo puxava-a para a ameaça distante e deixava o avião fora do quadro no
 * telemóvel); na vertical, fica logo abaixo da ameaça, e o avião, mais perto
 * e abaixo da câmara, ocupa a metade de baixo.
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
  const horizontal = unitario({ x: a.x + b.x, y: 0, z: a.z + b.z });
  const inclinacao = Math.asin(b.y) - MIRA_ABAIXO_AMEACA_RAD;
  const h = Math.cos(inclinacao) * distancia;
  return {
    pos,
    mira: {
      x: pos.x + horizontal.x * h,
      y: pos.y + Math.sin(inclinacao) * distancia,
      z: pos.z + horizontal.z * h,
    },
  };
}

/**
 * Cinema, para vídeo: planos de 7 s em ciclo (perseguição alta a olhar a
 * paisagem, lado, frente com a cidade por trás, órbita lenta). Com um marco
 * perto e à frente (`foco`, o próximo ponto do circuito), fica atrás, alto e
 * de lado, com a mira no marco: o avião em baixo e o marco ao centro.
 */
function alvoCinema(pose, { fit, foco, agoraS, frente, esquerda }) {
  const junto = (f, e, cima) => ({ x: pose.x + frente.x * f + esquerda.x * e, y: pose.y + cima, z: pose.z + frente.z * f + esquerda.z * e });
  if (foco) {
    const lateral = (foco.x - pose.x) * esquerda.x + (foco.z - pose.z) * esquerda.z;
    return { pos: junto(-70 / fit, (lateral > 0 ? -1 : 1) * 30, 28), mira: { ...foco } };
  }
  const plano = planoCinema(agoraS);
  if (plano === 'alto') return { pos: junto(-80 / fit, 0, 40), mira: { ...junto(500, 0, 0), y: pose.y - 250 } };
  if (plano === 'lado') return { pos: junto(6, -38 / Math.max(fit, 0.5), 6), mira: junto(20, 0, 0) };
  if (plano === 'frente') return { pos: junto(55 / fit, 14, 5), mira: junto(0, 0, 2) };
  const a = agoraS * 0.22;
  const r = 65 / fit;
  return { pos: { x: pose.x + Math.sin(a) * r, y: pose.y + 18, z: pose.z + Math.cos(a) * r }, mira: { x: pose.x, y: pose.y, z: pose.z } };
}

/** Posição e mira da câmara para os modos automáticos (coordenadas locais). */
export function alvoCamara(modo, pose, { fit = 1, foco = null, agoraS = 0 } = {}) {
  const frente = { x: Math.sin(pose.heading), z: Math.cos(pose.heading) };
  // Esquerda do piloto: +X com rumo 0 (ver escala.js).
  const esquerda = { x: frente.z, z: -frente.x };
  if (modo === 'cinema') return alvoCinema(pose, { fit, foco, agoraS, frente, esquerda });
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
