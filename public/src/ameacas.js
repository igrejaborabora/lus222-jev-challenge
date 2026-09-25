import { mulberry32 } from './decisao.js';

/**
 * Ameaças ancoradas no mundo, em metros SI no referencial da missão (x
 * lateral, z ao longo da rota, altitude em y). Nascem relativas ao avião no
 * gatilho do evento e daí em diante movem-se sozinhas; tudo é determinístico
 * pela semente, para os replays reproduzirem o mesmo céu.
 *
 * Comportamentos:
 *   constante — velocidade fixa (tráfego);
 *   viragem   — velocidade fixa que vira deltaRad em duracaoS a partir de emS
 *               (mudança de intenção que o preditor não conhece);
 *   vento     — deriva com o vento e sobe (balões de São João);
 *   vagueio   — velocidade base com oscilação lenta (bando de aves);
 *   celula    — deriva com o vento e cresce (célula meteorológica);
 *   deriva    — fracção do vento à superfície (contacto SAR).
 */
export const VISUAIS_AMEACA = Object.freeze(['trafego', 'baloes', 'aves', 'celula', 'contacto', 'relevo']);

const girar = (vx, vz, r) => [vx * Math.cos(r) + vz * Math.sin(r), vz * Math.cos(r) - vx * Math.sin(r)];

/** Semente estável por texto: a mesma missão e o mesmo evento dão as mesmas ameaças. */
export function sementeDe(semente, texto) {
  let h = (Number(semente) || 222) >>> 0;
  for (const c of String(texto)) h = Math.imul(h ^ c.charCodeAt(0), 2654435761) >>> 0;
  return h;
}

/** Perímetro de protecção de uma ameaça; num grupo soma a dispersão dos membros. */
export function raioEfectivoM(a) {
  return (Number(a?.raioProtecaoM) || 0) + (Number(a?.dispersaoM) || 0);
}

/**
 * Faz nascer as ameaças de um evento. `relativo.frenteM` conta ao longo do
 * rumo e `relativo.lateralM` para a direita do piloto (como offset_lateral_m);
 * `velocidade.rumoRelRad` é o rumo da ameaça relativo ao do avião (π = de frente).
 */
export function nascerAmeacas(defs, voo, { tempoS = voo?.tempoS ?? 0, semente = 222, proximoNumero = 1 } = {}) {
  return (defs ?? []).map((d, i) => {
    const rnd = mulberry32(sementeDe(semente, d.id));
    const h = voo.rumoRad;
    const frente = Number(d.relativo?.frenteM) || 0;
    const lateral = Number(d.relativo?.lateralM) || 0;
    const rumo = h + (Number(d.velocidade?.rumoRelRad) || 0);
    const ms = Number(d.velocidade?.ms) || 0;
    const vxMs = Math.sin(rumo) * ms;
    const vzMs = Math.cos(rumo) * ms;
    return {
      id: `a${proximoNumero + i}`,
      origem: d.id,
      tipo: d.tipo,
      visual: d.visual,
      xM: voo.xM + Math.sin(h) * frente + Math.cos(h) * lateral,
      zM: voo.zM + Math.cos(h) * frente - Math.sin(h) * lateral,
      altitudeM: Math.max(0, voo.altitudeM + (Number(d.relativo?.alturaM) || 0)),
      vxMs,
      vzMs,
      vyMs: Number(d.velocidade?.subidaMs) || 0,
      raioProtecaoM: Number(d.raioProtecaoM) || 30,
      membros: Number(d.membros) || 1,
      cilindro: Boolean(d.cilindro),
      dispersaoM: Number(d.dispersaoM) || 0,
      nascidaS: tempoS,
      vidaS: Number(d.vidaS) || 180,
      // A base guarda a velocidade de nascimento; as fases dão a cada ameaça o seu vagueio.
      comportamento: { tipo: 'constante', ...d.comportamento, baseVx: vxMs, baseVz: vzMs, fase: rnd() * Math.PI * 2, fase2: rnd() * Math.PI * 2 },
      sementeVisual: sementeDe(semente, `${d.id}:visual`),
      separacaoMinM: Infinity,
    };
  });
}

/** Um passo das ameaças: velocidade pelo comportamento e posição pela velocidade. */
export function passoAmeacas(ameacas, dt, { vento = { x: 0, z: 0 }, tempoS = 0 } = {}) {
  return (ameacas ?? []).map((a) => {
    const c = a.comportamento ?? {};
    const idade = tempoS - a.nascidaS;
    let { vxMs, vzMs, vyMs, raioProtecaoM } = a;
    if (c.tipo === 'vento') {
      vxMs = vento.x + (Number(c.derivaXMs) || 0);
      vzMs = vento.z + (Number(c.derivaZMs) || 0);
      vyMs = Number(c.subidaMs) || 0;
    } else if (c.tipo === 'viragem') {
      const inicio = Number(c.emS) || 0;
      const duracao = Math.max(0.1, Number(c.duracaoS) || 1);
      if (idade >= inicio && idade < inicio + duracao) [vxMs, vzMs] = girar(vxMs, vzMs, (Number(c.deltaRad) || 0) * dt / duracao);
    } else if (c.tipo === 'vagueio') {
      const amp = Number(c.amplitudeMs) || 3;
      vxMs = c.baseVx + amp * Math.sin(idade * 0.83 + c.fase);
      vzMs = c.baseVz + amp * Math.sin(idade * 0.57 + c.fase2);
      vyMs = (Number(c.amplitudeVerticalMs) || 0.8) * Math.sin(idade * 0.41 + c.fase);
    } else if (c.tipo === 'celula') {
      vxMs = vento.x * (c.fatorVento ?? 1);
      vzMs = vento.z * (c.fatorVento ?? 1);
      raioProtecaoM += (Number(c.crescimentoMs) || 0) * dt;
    } else if (c.tipo === 'deriva') {
      vxMs = vento.x * (c.fatorVento ?? 0.3);
      vzMs = vento.z * (c.fatorVento ?? 0.3);
      vyMs = 0;
    }
    return {
      ...a,
      vxMs,
      vzMs,
      vyMs,
      raioProtecaoM,
      xM: a.xM + vxMs * dt,
      zM: a.zM + vzMs * dt,
      altitudeM: Math.max(0, a.altitudeM + vyMs * dt),
    };
  });
}

/** Velocidade do avião em relação ao solo: a do ar mais o vento, como em passoFisico. */
export function velocidadeSolo(voo, vento = { x: 0, z: 0 }) {
  return {
    x: Math.sin(voo.rumoRad) * voo.velocidadeMs + vento.x,
    z: Math.cos(voo.rumoRad) * voo.velocidadeMs + vento.z,
    y: Number(voo.velocidadeVerticalMs) || 0,
  };
}

/** Distância ao centro; uma célula é um cilindro (subir não a evita), só conta a horizontal. */
export function distanciaM(voo, a) {
  if (a.cilindro) return Math.hypot(a.xM - voo.xM, a.zM - voo.zM);
  return Math.hypot(a.xM - voo.xM, a.zM - voo.zM, a.altitudeM - voo.altitudeM);
}

/**
 * Ponto de maior aproximação com as velocidades de agora (sem conhecer
 * viragens futuras): tempo até ao CPA, distância horizontal e vertical no CPA,
 * e se a ameaça converge ou já se afasta.
 */
export function cpa(voo, a, vento = { x: 0, z: 0 }) {
  const v = velocidadeSolo(voo, vento);
  const rx = a.xM - voo.xM;
  const rz = a.zM - voo.zM;
  const wx = a.vxMs - v.x;
  const wz = a.vzMs - v.z;
  const w2 = wx * wx + wz * wz;
  const aproxima = rx * wx + rz * wz < 0;
  const tcpaS = w2 > 1e-6 && aproxima ? -(rx * wx + rz * wz) / w2 : 0;
  const hx = rx + wx * tcpaS;
  const hz = rz + wz * tcpaS;
  const vertical = a.cilindro ? 0 : (a.altitudeM + a.vyMs * tcpaS) - (voo.altitudeM + v.y * tcpaS);
  return {
    tcpaS,
    horizontalM: Math.hypot(hx, hz),
    verticalM: vertical,
    distanciaCpaM: Math.hypot(hx, hz, vertical),
    distanciaAgoraM: distanciaM(voo, a),
    movimento: aproxima ? 'converge' : 'afasta',
  };
}
