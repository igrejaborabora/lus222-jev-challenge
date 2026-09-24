/**
 * Som procedimental de um turbo-hélice bimotor, só com Web Audio, sem
 * ficheiros: tom de passagem das pás e harmónico, dois motores ligeiramente
 * desafinados (o batimento típico de bimotor), assobio de turbina e ruído de
 * vento. A potência e a velocidade da simulação e a distância da câmara mexem
 * na frequência, no ganho e no filtro. Valores ilustrativos, não medidos.
 */
export const PAS = 4;
export const RPM_MIN = 1650;
export const RPM_MAX = 2000;
const TAU_S = 0.12;

const limitar = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

/** Mapeamento puro do voo para o som. A potência vai de 0,24 (ralenti) a 1. */
export function parametrosSom({ potencia = 0.5, velocidadeMs = 80, distanciaCamaraM = 20 } = {}) {
  const p = limitar((Number(potencia) - 0.24) / 0.76);
  const v = limitar((Number(velocidadeMs) - 30) / 85);
  const d = Math.max(0, Number(distanciaCamaraM) || 0);
  // 1 com a câmara colada ao avião, a cair devagar com a distância.
  const perto = 1 / (1 + Math.max(0, d - 15) / 80);
  const rpm = RPM_MIN + (RPM_MAX - RPM_MIN) * p;
  return {
    rpm,
    fPas: (rpm * PAS) / 60,
    batimentoHz: 0.5 + 0.6 * p,
    ganhoTom: 0.16 + 0.2 * p,
    ganhoTurbina: 0.012 + 0.025 * p,
    fTurbina: 3000 + 900 * p,
    corteRuidoHz: 350 + 2600 * v * (0.35 + 0.65 * perto),
    ganhoRuido: 0.08 + 0.16 * v,
    ganhoTotal: 0.45 * (0.3 + 0.7 * perto),
  };
}

function ruidoCastanho(ctx) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const dados = buffer.getChannelData(0);
  let ultimo = 0;
  for (let i = 0; i < dados.length; i += 1) {
    ultimo = (ultimo + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    dados[i] = ultimo * 3.5;
  }
  const fonte = ctx.createBufferSource();
  fonte.buffer = buffer;
  fonte.loop = true;
  return fonte;
}

function motor(ctx, destino, pan) {
  const tom = ctx.createOscillator();
  tom.type = 'sawtooth';
  const harmonico = ctx.createOscillator();
  harmonico.type = 'sine';
  const ganhoHarmonico = ctx.createGain();
  ganhoHarmonico.gain.value = 0.35;
  const filtro = ctx.createBiquadFilter();
  filtro.type = 'lowpass';
  filtro.Q.value = 0.8;
  const ganho = ctx.createGain();
  ganho.gain.value = 0;
  tom.connect(filtro);
  harmonico.connect(ganhoHarmonico).connect(filtro);
  filtro.connect(ganho);
  if (ctx.createStereoPanner) {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    ganho.connect(panner).connect(destino);
  } else ganho.connect(destino);
  tom.start();
  harmonico.start();
  return { tom, harmonico, filtro, ganho };
}

/**
 * Controlador do som. `ligar()` tem de correr dentro do clique que inicia a
 * missão (regra de autoplay); `suspender()` e `retomar()` são idempotentes.
 */
export function criarSomMotor() {
  let ctx = null;
  let grafo = null;
  let ligado = false;
  let silenciado = false;
  let ultimo = parametrosSom();
  let pedidoSuspensao = 0;

  function construir() {
    const Contexto = globalThis.AudioContext ?? globalThis.webkitAudioContext;
    if (!Contexto) return false;
    try {
      // iOS: sem isto o interruptor de silêncio cala o Web Audio.
      if (globalThis.navigator?.audioSession) globalThis.navigator.audioSession.type = 'playback';
    } catch { /* opcional */ }
    ctx = new Contexto();
    const mestre = ctx.createGain();
    mestre.gain.value = 0;
    mestre.connect(ctx.createDynamicsCompressor()).connect(ctx.destination);
    const motores = [motor(ctx, mestre, -0.35), motor(ctx, mestre, 0.35)];
    const turbina = ctx.createOscillator();
    turbina.type = 'sine';
    const ganhoTurbina = ctx.createGain();
    ganhoTurbina.gain.value = 0;
    turbina.connect(ganhoTurbina).connect(mestre);
    turbina.start();
    const ruido = ruidoCastanho(ctx);
    const filtroRuido = ctx.createBiquadFilter();
    filtroRuido.type = 'lowpass';
    const ganhoRuido = ctx.createGain();
    ganhoRuido.gain.value = 0;
    ruido.connect(filtroRuido).connect(ganhoRuido).connect(mestre);
    ruido.start();
    grafo = { mestre, motores, turbina, ganhoTurbina, filtroRuido, ganhoRuido };
    aplicar(ultimo, 0.01);
    return true;
  }

  function rampa(param, valor, tau = TAU_S) {
    param.setTargetAtTime(valor, ctx.currentTime, tau);
  }

  function ganhoAlvo() {
    return ligado && !silenciado ? ultimo.ganhoTotal : 0;
  }

  function aplicar(s, tau = TAU_S) {
    if (!grafo) return;
    grafo.motores.forEach((m, i) => {
      const f = s.fPas + (i ? s.batimentoHz : 0);
      rampa(m.tom.frequency, f, tau);
      rampa(m.harmonico.frequency, 2 * f, tau);
      rampa(m.filtro.frequency, 4 * f, tau);
      rampa(m.ganho.gain, s.ganhoTom / 2, tau);
    });
    rampa(grafo.turbina.frequency, s.fTurbina, tau);
    rampa(grafo.ganhoTurbina.gain, s.ganhoTurbina, tau);
    rampa(grafo.filtroRuido.frequency, s.corteRuidoHz, tau);
    rampa(grafo.ganhoRuido.gain, s.ganhoRuido, tau);
  }

  function fade(segundos) {
    const g = grafo.mestre.gain;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(ganhoAlvo(), t + segundos);
  }

  return {
    /** Cria ou retoma o contexto e sobe o som em 1,5 s. Devolve false sem Web Audio. */
    ligar() {
      if (!ctx && !construir()) return false;
      pedidoSuspensao += 1;
      ligado = true;
      void ctx.resume().catch(() => {});
      fade(1.5);
      return true;
    },
    actualizar(voo) {
      ultimo = parametrosSom(voo);
      if (!ctx || !ligado) return;
      aplicar(ultimo);
      rampa(grafo.mestre.gain, ganhoAlvo(), 0.3);
    },
    suspender() {
      if (!ctx || !ligado) return;
      ligado = false;
      fade(0.2);
      const pedido = ++pedidoSuspensao;
      setTimeout(() => { if (pedido === pedidoSuspensao && !ligado) void ctx.suspend().catch(() => {}); }, 250);
    },
    retomar() {
      if (!ctx || ligado) return;
      pedidoSuspensao += 1;
      ligado = true;
      void ctx.resume().catch(() => {});
      fade(0.4);
    },
    silenciar(valor) {
      silenciado = Boolean(valor);
      if (ctx) fade(0.25);
    },
    get estado() {
      return { contexto: ctx?.state ?? 'inexistente', ligado, silenciado };
    },
  };
}
