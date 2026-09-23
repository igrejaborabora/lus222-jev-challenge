const CRUZEIRO = 38;
const ORBITA = 22;

export function novoAutomato() {
  return {
    x: -80,
    y: 42,
    z: 40,
    heading: 0.7,
    bank: 0,
    pitch: 0,
    speed: CRUZEIRO,
    acao: 'prosseguir',
    vertical: 'manter',
    lateral: 'manter',
    urgencia: 1,
    dodgeT: 0,
    orbit: 0,
    hélice: 0,
  };
}

export function aplicarAcao(aviao, acao) {
  aviao.acao = acao ?? 'prosseguir';
}

export function aplicarEvasao(aviao, { acao, vertical, lateral, urgencia } = {}) {
  aviao.acao = acao ?? 'prosseguir';
  aviao.vertical = vertical ?? 'manter';
  aviao.lateral = lateral ?? 'manter';
  const u = Number(urgencia);
  aviao.urgencia = Number.isFinite(u) ? Math.min(3, Math.max(0, Math.round(u))) : 1;
  aviao.dodgeT = 3.4;
}

export function passoAutomato(aviao, dt) {
  const t = Math.min(dt, 0.08);
  const u = 0.62 + aviao.urgencia * 0.28;
  // O eixo pedido mantém-se até o controlador o neutralizar. dodgeT já
  // não força curva nem zoom de câmara depois de «manter».
  const eixo = aviao.lateral !== 'manter' || aviao.vertical !== 'manter';
  const dodge = eixo ? 1 : 0.32;
  aviao.dodgeT = Math.max(0, aviao.dodgeT - t);

  let alvoBank = 0;
  let alvoPitch = 0;
  let alvoSpeed = CRUZEIRO;
  let alvoAlt = 46;

  // Na câmara atrás da cauda, heading a subir vira para a esquerda do ecrã
  // e bank negativo baixa essa asa. O rumo sai do bank — nunca de um yaw seco.
  // Pitch negativo levanta o nariz.
  const banco = 0.32 * Math.min(u, 1.2) * Math.max(dodge, 0.85);
  switch (aviao.lateral) {
    case 'esquerda':
      alvoBank = -banco;
      break;
    case 'direita':
      alvoBank = banco;
      break;
    case 'manter':
      break;
    default: {
      const _x = aviao.lateral;
      void _x;
      break;
    }
  }

  switch (aviao.vertical) {
    case 'subir':
      alvoAlt = aviao.y + 16;
      alvoPitch = -0.12;
      break;
    case 'descer':
      alvoAlt = Math.max(16, aviao.y - 12);
      alvoPitch = 0.1;
      break;
    case 'manter':
      break;
    default: {
      const _x = aviao.vertical;
      void _x;
      break;
    }
  }

  switch (aviao.acao) {
    case 'prosseguir':
      if (aviao.vertical === 'manter') alvoAlt = 46;
      if (aviao.lateral === 'manter' && Number.isFinite(aviao.rumoAlvo)) {
        const delta = Math.atan2(
          Math.sin(aviao.rumoAlvo - aviao.heading),
          Math.cos(aviao.rumoAlvo - aviao.heading),
        );
        alvoBank = Math.max(-0.24, Math.min(0.24, -delta * 0.7));
      }
      break;
    case 'desviar_alternativo':
      if (aviao.lateral === 'manter') alvoBank = -0.26;
      if (aviao.vertical === 'manter') alvoAlt = Math.max(alvoAlt, 58);
      break;
    case 'orbitar':
      alvoBank = 0.3;
      alvoSpeed = ORBITA;
      if (aviao.vertical === 'manter') alvoAlt = 48;
      aviao.orbit += t;
      break;
    case 'regressar_base':
      if (aviao.lateral === 'manter') alvoBank = 0.24;
      if (aviao.vertical === 'manter') alvoAlt = 40;
      break;
    case 'abortar_emergencia':
      alvoPitch = 0.12;
      alvoAlt = Math.min(alvoAlt, 18);
      alvoSpeed = 28;
      if (aviao.lateral === 'manter') alvoBank = 0.16;
      break;
    default: {
      const _x = aviao.acao;
      void _x;
      break;
    }
  }

  if (aviao.vertical === 'manter' && aviao.acao !== 'abortar_emergencia') {
    const erroAlt = alvoAlt - aviao.y;
    alvoPitch = Math.max(-0.1, Math.min(0.08, -erroAlt * 0.01));
  }

  aviao.bank += (alvoBank - aviao.bank) * 1.5 * t;
  aviao.heading += -aviao.bank * 0.95 * t;
  aviao.pitch += (alvoPitch - aviao.pitch) * 1.6 * t;
  aviao.speed += (alvoSpeed - aviao.speed) * 1.4 * t;
  const taxaVertical = Math.max(-4.5, Math.min(4.5, (alvoAlt - aviao.y) * 0.45));
  aviao.y += taxaVertical * t;
  aviao.x += Math.sin(aviao.heading) * aviao.speed * t;
  aviao.z += Math.cos(aviao.heading) * aviao.speed * t;
  // ~2,5 voltas/s. O ritmo antigo (velocidade × 18) caía perto da simetria
  // da cruz e a hélice lia-se parada.
  aviao.hélice += t * 16;
  return aviao;
}

export function poseAviao(aviao) {
  return {
    x: aviao.x,
    y: aviao.y,
    z: aviao.z,
    heading: aviao.heading,
    bank: aviao.bank,
    pitch: aviao.pitch,
    hélice: aviao.hélice,
    dodge: aviao.lateral !== 'manter' || aviao.vertical !== 'manter',
  };
}
