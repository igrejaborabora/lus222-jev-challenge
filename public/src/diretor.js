import { mulberry32 } from './decisao.js';
import { nascerAmeacas, sementeDe, velocidadeSolo } from './ameacas.js';

/**
 * Director do voo livre: vai lançando ameaças à volta do LUS-222, de forma
 * determinística pela semente (o mesmo voo gravado reproduz o mesmo céu).
 * Cada ameaça é apontada a um encontro quase em rota daqui a 25–80 s, para
 * obrigar o piloto — humano ou JEV — a decidir. A dificuldade cresce: uma
 * ameaça no primeiro minuto, duas até aos três, depois três.
 */
export const RAIO_PASSAGEM_M = 900;

export function alvoSimultaneas(tempoS) {
  if (tempoS < 60) return 1;
  return tempoS < 180 ? 2 : 3;
}

const TIPOS = [['baloes', 0.3], ['cruzado', 0.25], ['helicoptero', 0.2], ['aves', 0.15], ['celula', 0.1]];

function escolherTipo(rnd) {
  let r = rnd();
  for (const [tipo, peso] of TIPOS) {
    r -= peso;
    if (r <= 0) return tipo;
  }
  return 'cruzado';
}

/** Ponto e rumo do mundo → referencial do avião (frente, lateral à direita, rumo relativo). */
function relativo(voo, x, z, rumoMundo) {
  const h = voo.rumoRad;
  const dx = x - voo.xM;
  const dz = z - voo.zM;
  return { frenteM: Math.sin(h) * dx + Math.cos(h) * dz, lateralM: Math.cos(h) * dx - Math.sin(h) * dz, rumoRelRad: rumoMundo - h };
}

/** Nasce em S de modo a passar por P (onde o avião vai estar) daqui a T s, falhando por `falhaM`. */
function aoEncontro(voo, P, rumo, ms, T, falhaM) {
  const ux = Math.sin(rumo);
  const uz = Math.cos(rumo);
  return relativo(voo, P.x - ux * ms * T + uz * falhaM, P.z - uz * ms * T - ux * falhaM, rumo);
}

/** Uma ameaça do tipo pedido, no formato de nascerAmeacas. */
export function planearAmeaca(m, rnd, tipo, numero) {
  const v = m.voo;
  const vento = m.ambiente.ventoMs;
  const vs = velocidadeSolo(v, vento);
  const onde = (T) => ({ x: v.xM + vs.x * T, z: v.zM + vs.z * T });
  const id = `${tipo}-${numero}`;
  // +1: vem da direita do piloto e segue para a esquerda.
  const lado = rnd() < 0.5 ? 1 : -1;
  if (tipo === 'cruzado' || tipo === 'helicoptero') {
    const T = 32 + rnd() * 14;
    const ms = tipo === 'cruzado' ? 55 + rnd() * 25 : 42 + rnd() * 8;
    const rumo = v.rumoRad - lado * (Math.PI / 2) * (0.55 + rnd() * 0.9);
    // O helicóptero parece passar à frente com folga e vira para a rota a meio.
    const falhaM = tipo === 'cruzado' ? (rnd() - 0.5) * 240 : lado * (380 + rnd() * 200);
    const r = aoEncontro(v, onde(T), rumo, ms, T, falhaM);
    return {
      id,
      tipo: tipo === 'cruzado' ? 'avião ligeiro' : 'helicóptero',
      visual: 'trafego',
      relativo: { frenteM: r.frenteM, lateralM: r.lateralM, alturaM: (rnd() - 0.5) * 40 },
      velocidade: { rumoRelRad: r.rumoRelRad, ms },
      raioProtecaoM: tipo === 'cruzado' ? 150 : 120,
      vidaS: 150,
      comportamento: tipo === 'helicoptero'
        ? { tipo: 'viragem', emS: Math.max(6, T - 16), duracaoS: 6, deltaRad: lado * 0.5 }
        : { tipo: 'constante' },
    };
  }
  if (tipo === 'baloes') {
    const T = 34 + rnd() * 12;
    const subidaMs = 1.1;
    const P = onde(T);
    const falhaM = (rnd() - 0.5) * 160;
    // O vento leva-os até à rota; nascem abaixo e sobem até à altitude do avião.
    const r = relativo(v, P.x - vento.x * T + falhaM, P.z - vento.z * T, v.rumoRad);
    return {
      id, tipo: 'balões de São João', visual: 'baloes',
      relativo: { frenteM: r.frenteM, lateralM: r.lateralM, alturaM: -subidaMs * T + (rnd() - 0.5) * 30 },
      velocidade: { rumoRelRad: 0, ms: 0 },
      raioProtecaoM: 30, membros: 14, dispersaoM: 45, vidaS: 240,
      comportamento: { tipo: 'vento', subidaMs },
    };
  }
  if (tipo === 'aves') {
    const T = 26 + rnd() * 10;
    const ms = 11 + rnd() * 4;
    const rumo = v.rumoRad - lado * (Math.PI / 2) * (0.7 + rnd() * 0.6);
    const r = aoEncontro(v, onde(T), rumo, ms, T, (rnd() - 0.5) * 120);
    return {
      id, tipo: 'bando de gaivotas', visual: 'aves',
      relativo: { frenteM: r.frenteM, lateralM: r.lateralM, alturaM: (rnd() - 0.5) * 30 },
      velocidade: { rumoRelRad: r.rumoRelRad, ms },
      raioProtecaoM: 20, membros: 22, dispersaoM: 35, vidaS: 180,
      comportamento: { tipo: 'vagueio', amplitudeMs: 3 },
    };
  }
  // Célula: à frente, deixando um lado livre; deriva com o vento e cresce.
  const T = 60 + rnd() * 20;
  const P = onde(T);
  const lateral = lado * (300 + rnd() * 600);
  const r = relativo(v, P.x + Math.cos(v.rumoRad) * lateral, P.z - Math.sin(v.rumoRad) * lateral, v.rumoRad);
  return {
    id, tipo: 'célula de trovoada', visual: 'celula',
    relativo: { frenteM: r.frenteM, lateralM: r.lateralM, alturaM: 0 },
    velocidade: { rumoRelRad: 0, ms: 0 },
    raioProtecaoM: 380 + rnd() * 220, cilindro: true, vidaS: 300,
    comportamento: { tipo: 'celula', crescimentoMs: 1.2 },
  };
}

/** Um passo do director: lança uma ameaça quando é hora e há lugar. */
export function passoDiretor(m) {
  const d = m.diretor;
  const t = m.voo.tempoS;
  if (!d || t < d.proximoS) return m;
  if ((m.ameacas?.length ?? 0) >= alvoSimultaneas(t)) return { ...m, diretor: { ...d, proximoS: t + 2 } };
  const rnd = mulberry32(sementeDe(m.semente, `diretor:${d.lancadas}`));
  const tipo = escolherTipo(rnd);
  const def = planearAmeaca(m, rnd, tipo, d.lancadas + 1);
  const proximoNumero = m.proximaAmeaca ?? 1;
  const nascidas = nascerAmeacas([def], m.voo, { tempoS: t, semente: m.semente, proximoNumero });
  return {
    ...m,
    ameacas: [...(m.ameacas ?? []), ...nascidas],
    proximaAmeaca: proximoNumero + nascidas.length,
    diretor: { ...d, lancadas: d.lancadas + 1, proximoS: t + 8 + rnd() * 10, ultima: tipo },
  };
}

/** Circuito do voo livre: ao passar a menos de 900 m do ponto activo, segue para o seguinte. */
export function avancarCircuito(m) {
  const alvo = m.destinos.find((d) => d.id === m.destinoId);
  if (!alvo || Math.hypot(alvo.xM - m.voo.xM, alvo.zM - m.voo.zM) > RAIO_PASSAGEM_M) return m;
  const ids = m.circuito;
  const i = ids.indexOf(m.destinoId);
  return {
    ...m,
    destinoId: ids[(i + 1) % ids.length],
    pontosPassados: [...(m.pontosPassados ?? []), { id: alvo.id, tempoS: Math.round(m.voo.tempoS) }],
    voltas: (m.voltas ?? 0) + (i === ids.length - 1 ? 1 : 0),
  };
}
