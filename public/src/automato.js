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

function comandarAltitude(aviao, proposta) {
  const chave = `${aviao.acao}|${aviao.vertical}`;
  if (aviao.altChave !== chave) {
    aviao.altChave = chave;
    aviao.altComando = proposta;
  }
  return aviao.altComando;
}

export function passoAutomato(aviao, dt) {
  const t = Math.min(dt, 0.08);
  const u = 0.62 + aviao.urgencia * 0.28;
  // O eixo pedido mantém-se até o controlador o neutralizar. dodgeT já
  // não força curva nem zoom de câmara depois de «manter».
  aviao.dodgeT = Math.max(0, aviao.dodgeT - t);

  let alvoBank = 0;
  let alvoPitch = 0;
  let alvoSpeed = CRUZEIRO;
  let alvoAlt = aviao.y;

  // Na câmara atrás da cauda, heading a subir vira para a esquerda do ecrã
  // e bank negativo baixa essa asa. O rumo é a curva coordenada do bank
  // (g·tan(bank)/V): o nariz não guina mais depressa do que a asa desce.
  // Pitch negativo levanta o nariz. A altitude pedida fica presa no
  // instante da ordem — não persegue o próprio y, senão o nariz oscila.
  const banco = 0.22 * Math.min(u, 1.1);
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
      alvoAlt = comandarAltitude(aviao, Math.min(68, aviao.y + 12));
      alvoPitch = -0.08;
      break;
    case 'descer':
      alvoAlt = comandarAltitude(aviao, Math.max(18, aviao.y - 10));
      alvoPitch = 0.07;
      break;
    case 'manter':
      alvoAlt = comandarAltitude(aviao, aviao.y);
      break;
    default: {
      const _x = aviao.vertical;
      void _x;
      break;
    }
  }

  switch (aviao.acao) {
    case 'prosseguir':
      // Alvo de altitude do piloto contínuo; o modo de missão não o define.
      if (aviao.vertical === 'manter' && Number.isFinite(aviao.altitudeAlvo)) alvoAlt = aviao.altitudeAlvo;
      if (aviao.lateral === 'manter' && Number.isFinite(aviao.rumoAlvo)) {
        const delta = Math.atan2(
          Math.sin(aviao.rumoAlvo - aviao.heading),
          Math.cos(aviao.rumoAlvo - aviao.heading),
        );
        alvoBank = Math.max(-0.16, Math.min(0.16, -delta * 0.55));
      }
      break;
    case 'desviar_alternativo':
      if (aviao.lateral === 'manter') alvoBank = -0.18;
      if (aviao.vertical === 'manter') alvoAlt = Math.max(alvoAlt, 58);
      break;
    case 'orbitar':
      alvoBank = 0.2;
      alvoSpeed = ORBITA;
      if (aviao.vertical === 'manter') alvoAlt = 48;
      aviao.orbit += t;
      break;
    case 'regressar_base':
      if (aviao.lateral === 'manter') alvoBank = 0.16;
      if (aviao.vertical === 'manter') alvoAlt = 40;
      break;
    case 'abortar_emergencia':
      alvoPitch = 0.1;
      alvoAlt = Math.min(alvoAlt, 22);
      alvoSpeed = 28;
      if (aviao.lateral === 'manter') alvoBank = 0.12;
      break;
    default: {
      const _x = aviao.acao;
      void _x;
      break;
    }
  }

  if (aviao.vertical === 'manter' && aviao.acao !== 'abortar_emergencia') {
    const erroAlt = alvoAlt - aviao.y;
    alvoPitch = Math.max(-0.06, Math.min(0.05, -erroAlt * 0.008));
  }

  aviao.bank += (alvoBank - aviao.bank) * 1.15 * t;
  aviao.bank = Math.max(-0.4, Math.min(0.4, aviao.bank));
  const taxaRumo = (9.81 * Math.tan(aviao.bank)) / Math.max(24, aviao.speed);
  aviao.heading += -taxaRumo * t;
  aviao.pitch += (alvoPitch - aviao.pitch) * 1.2 * t;
  aviao.speed += (alvoSpeed - aviao.speed) * 1.1 * t;
  const taxaVertical = Math.max(-3.2, Math.min(3.2, (alvoAlt - aviao.y) * 0.45));
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
