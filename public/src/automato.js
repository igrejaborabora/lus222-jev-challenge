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
  const dodge = aviao.dodgeT > 0 ? 1 : 0.32;
  aviao.dodgeT = Math.max(0, aviao.dodgeT - t);

  let alvoBank = 0;
  let alvoPitch = 0.04;
  let alvoSpeed = CRUZEIRO;
  let alvoAlt = 46;
  let turn = 0.03;

  switch (aviao.lateral) {
    case 'esquerda':
      turn = -0.78 * u * dodge;
      alvoBank = 0.52 * u;
      break;
    case 'direita':
      turn = 0.78 * u * dodge;
      alvoBank = -0.52 * u;
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
      alvoAlt = aviao.y + 26 * dodge + 10;
      alvoPitch = 0.2 * u;
      break;
    case 'descer':
      alvoAlt = Math.max(16, aviao.y - 16 * dodge);
      alvoPitch = -0.15 * u;
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
      if (aviao.lateral === 'manter') turn = 0.03;
      if (aviao.vertical === 'manter') alvoAlt = 46;
      break;
    case 'desviar_alternativo':
      if (aviao.lateral === 'manter') {
        turn = 0.62 * u * dodge;
        alvoBank = -0.4;
      }
      if (aviao.vertical === 'manter') alvoAlt = Math.max(alvoAlt, 58);
      break;
    case 'orbitar':
      turn += -0.62;
      alvoBank = 0.44;
      alvoSpeed = ORBITA;
      if (aviao.vertical === 'manter') alvoAlt = 48;
      aviao.orbit += t;
      break;
    case 'regressar_base':
      if (aviao.lateral === 'manter') {
        turn = -0.68;
        alvoBank = 0.34;
      }
      if (aviao.vertical === 'manter') alvoAlt = 40;
      break;
    case 'abortar_emergencia':
      alvoPitch = -0.18;
      alvoAlt = Math.min(alvoAlt, 18);
      alvoSpeed = 28;
      if (aviao.lateral === 'manter') alvoBank = 0.2;
      break;
    default: {
      const _x = aviao.acao;
      void _x;
      break;
    }
  }

  aviao.heading += turn * t;
  aviao.bank += (alvoBank - aviao.bank) * 2.4 * t;
  aviao.pitch += (alvoPitch - aviao.pitch) * 2.0 * t;
  aviao.speed += (alvoSpeed - aviao.speed) * 1.4 * t;
  aviao.y += (alvoAlt - aviao.y) * 0.85 * t;
  aviao.x += Math.sin(aviao.heading) * aviao.speed * t;
  aviao.z += Math.cos(aviao.heading) * aviao.speed * t;
  aviao.hélice += aviao.speed * t * 18;
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
    dodge: aviao.dodgeT > 0,
  };
}
