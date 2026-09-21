const CRUZEIRO = 38;
const ORBITA = 22;

export function novoAutomato() {
  return {
    x: -80,
    y: 42,
    z: 40,
    heading: 0.15,
    bank: 0,
    pitch: 0,
    speed: CRUZEIRO,
    acao: 'prosseguir',
    orbit: 0,
    hélice: 0,
  };
}

export function aplicarAcao(aviao, acao) {
  aviao.acao = acao ?? 'prosseguir';
}

export function passoAutomato(aviao, dt) {
  const t = Math.min(dt, 0.08);
  let alvoBank = 0;
  let alvoPitch = 0.04;
  let alvoSpeed = CRUZEIRO;
  let alvoAlt = 42;
  let turn = 0;

  switch (aviao.acao) {
    case 'prosseguir':
      turn = 0.04;
      alvoAlt = 46;
      break;
    case 'desviar_alternativo':
      turn = 0.55;
      alvoBank = -0.38;
      alvoAlt = 52;
      break;
    case 'orbitar':
      turn = 0.85;
      alvoBank = -0.45;
      alvoSpeed = ORBITA;
      alvoAlt = 48;
      aviao.orbit += t;
      break;
    case 'regressar_base':
      turn = 0.7;
      alvoBank = 0.32;
      alvoAlt = 40;
      break;
    case 'abortar_emergencia':
      turn = 0.5;
      alvoPitch = -0.18;
      alvoAlt = 18;
      alvoSpeed = 28;
      alvoBank = 0.2;
      break;
    default: {
      const _x = aviao.acao;
      void _x;
      break;
    }
  }

  aviao.heading += turn * t;
  aviao.bank += (alvoBank - aviao.bank) * 2.2 * t;
  aviao.pitch += (alvoPitch - aviao.pitch) * 1.8 * t;
  aviao.speed += (alvoSpeed - aviao.speed) * 1.4 * t;
  aviao.y += (alvoAlt - aviao.y) * 0.7 * t;
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
  };
}
