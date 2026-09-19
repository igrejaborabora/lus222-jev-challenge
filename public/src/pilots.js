import { CORREDOR, DISTANCIA_ALVO, V_FRENTE, nomeDoPortao, mulberry32 } from './world.js';

/**
 * Física do drone, sensores e os três pilotos que voam o mesmo corredor:
 *
 *   humano    — teclado ou toque
 *   baseline  — regra geométrica determinística, local, à mesma cadência do modelo
 *   jev       — modelo `typesafe-ai/jev` consultado pelo AI Gateway
 *
 * O baseline existe para tornar a comparação honesta. Num problema puramente
 * geométrico com sensores limpos, uma regra local ganha — e deve ganhar. O que
 * o modelo acrescenta aparece onde a geometria não chega: obstáculos com
 * semântica diferente e a decisão de abortar, que depende do contexto da missão.
 */

export { V_FRENTE };
const ACC = 11;                 // m/s² — aceleração lateral e vertical
const V_LATERAL_MAX = 12;       // m/s
const RADAR_M = 180;            // m — alcance do sensor (~8 s)
const INTEGRIDADE_POR_EMBATE = 30;
const INVULN_S = 1.4;
const LIMIAR_ABORTAR = 0.75;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export function novaRonda(percurso, piloto, seedRuido = 7) {
  return {
    piloto,
    t: 0,
    s: 0,                                   // distância percorrida, m
    x: 0,
    y: (CORREDOR.ALT_MIN + CORREDOR.ALT_MAX) / 2,
    vx: 0,
    vy: 0,
    cmdX: 0,
    cmdY: 0,
    intensidade: 1,
    integridade: 100,
    embates: 0,
    portoesLimpos: 0,
    invuln: 0,
    energia: 0,                             // integral do comando, proxy de consumo
    terminada: false,
    desfecho: null,                         // 'entregue' | 'abortada' | 'perdida'
    percurso,
    idx: 0,
    ruido: mulberry32(seedRuido),
    log: [],
    jev: { ultima: null, latencias: [], chamadas: 0, falhas: 0, proximaEm: 0, pendente: false, aviso: '' },
  };
}

// ---------------------------------------------------------------- sensores

const HORIZONTE_S = 2.5;   // s — até onde se projecta a trajectória actual

/**
 * Folgas relativas à abertura do portão, medidas na posição PROJECTADA: onde o
 * drone estará se nada mudar. É o que qualquer sistema de separação faz — olhar
 * para a posição actual ignora a inércia, e o veículo entra na abertura a
 * derivar e sai pelo lado oposto antes de a travessia acontecer.
 *
 * Positivo = espaço disponível nessa direcção; negativo = já está fora por esse lado.
 */
function folgas(r, portao) {
  const ab = portao.abertura;
  const R = CORREDOR.RAIO_DRONE;
  const h = Math.min(Math.max(0, (portao.z - r.s) / V_FRENTE), HORIZONTE_S);
  const yp = r.y + r.vy * h;
  const xp = r.x + r.vx * h;
  return {
    cima: (ab.y + ab.hh) - yp - R,
    baixo: yp - (ab.y - ab.hh) - R,
    esquerda: xp - (ab.x - ab.hw) - R,
    direita: (ab.x + ab.hw) - xp - R,
  };
}

/** Ruído de sensor, para que a decisão não seja tomada sobre números perfeitos. */
function comRuido(r, valor, escala = 2) {
  return valor + (r.ruido() - 0.5) * escala;
}

export function lerSensores(r, adicionarRuido = false) {
  const lista = [];
  for (let i = r.idx; i < r.percurso.portoes.length; i++) {
    const p = r.percurso.portoes[i];
    const dist = p.z - r.s;
    if (dist < -10) continue;
    if (dist > RADAR_M) break;

    const f = folgas(r, p);
    const emRota = f.cima < 0 || f.baixo < 0 || f.esquerda < 0 || f.direita < 0;
    const d = adicionarRuido ? comRuido(r, dist, dist * 0.06) : dist;

    lista.push({
      tipo: nomeDoPortao(p.tipo),
      distancia_m: Math.max(0, Math.round(d)),
      segundos_ate_ao_contacto: Number(Math.max(0, d / V_FRENTE).toFixed(1)),
      folga_por_cima_m: Math.round(adicionarRuido ? comRuido(r, f.cima) : f.cima),
      folga_por_baixo_m: Math.round(adicionarRuido ? comRuido(r, f.baixo) : f.baixo),
      folga_pela_esquerda_m: Math.round(adicionarRuido ? comRuido(r, f.esquerda) : f.esquerda),
      folga_pela_direita_m: Math.round(adicionarRuido ? comRuido(r, f.direita) : f.direita),
      em_rota_de_colisao: emRota,
      _portao: p,
    });
  }
  return lista;
}

export function estadoParaModelo(r, sensores) {
  return {
    aeronave: {
      altitude_m: Math.round(r.y),
      desvio_lateral_m: Math.round(r.x),
      velocidade_ar_ms: V_FRENTE,
      velocidade_vertical_ms: Math.round(r.vy),
      velocidade_lateral_ms: Math.round(r.vx),
    },
    corredor: {
      altitude_minima_m: CORREDOR.ALT_MIN,
      altitude_maxima_m: CORREDOR.ALT_MAX,
      limite_lateral_m: CORREDOR.LIMITE_LATERAL,
      margem_ao_solo_m: Math.round(r.y - CORREDOR.ALT_MIN),
      margem_ao_tecto_m: Math.round(CORREDOR.ALT_MAX - r.y),
      margem_lateral_esquerda_m: Math.round(r.x + CORREDOR.LIMITE_LATERAL),
      margem_lateral_direita_m: Math.round(CORREDOR.LIMITE_LATERAL - r.x),
    },
    missao: {
      tipo: 'entrega de carga em meio semi-urbano',
      carga: 'material médico',
      distancia_ao_destino_m: Math.round(DISTANCIA_ALVO - r.s),
      embates_ate_agora: r.embates,
      integridade_percent: Math.round(r.integridade),
    },
    obstaculos: sensores.slice(0, 4).map(({ _portao, ...o }) => o),
  };
}

// ---------------------------------------------------------------- decisões

export const VERTICAIS = ['subir', 'descer', 'manter'];
export const LATERAIS = ['esquerda', 'direita', 'manter'];
const INTENSIDADE_POR_URGENCIA = [0.55, 0.75, 0.9, 1];

function probs(conjunto, escolhida) {
  return Object.fromEntries(conjunto.map((m) => [m, m === escolhida ? 1 : 0]));
}

/** Baseline determinístico — a mesma regra que corre no servidor como reserva. */
export function decisaoGeometrica(estado) {
  const ameaca = estado.obstaculos.find((o) => o.em_rota_de_colisao);
  if (!ameaca) {
    return {
      manobraVertical: { type: 'choice', choice: 'manter', probabilities: probs(VERTICAIS, 'manter') },
      manobraLateral: { type: 'choice', choice: 'manter', probabilities: probs(LATERAIS, 'manter') },
      urgencia: { type: 'score', score: 0 },
      colisaoIminente: { type: 'boolean', probability: 0.02 },
      abortarMissao: { type: 'boolean', probability: 0.02 },
    };
  }
  const vert = ameaca.folga_por_baixo_m < 0 ? 'subir' : ameaca.folga_por_cima_m < 0 ? 'descer' : 'manter';
  const lat = ameaca.folga_pela_direita_m < 0 ? 'esquerda' : ameaca.folga_pela_esquerda_m < 0 ? 'direita' : 'manter';
  const t = ameaca.segundos_ate_ao_contacto;
  // mesmo critério que o baseline do servidor, para que a comparação seja justa
  const degradado = estado.missao.integridade_percent < 40 || estado.missao.embates_ate_agora >= 2;

  return {
    manobraVertical: { type: 'choice', choice: vert, probabilities: probs(VERTICAIS, vert) },
    manobraLateral: { type: 'choice', choice: lat, probabilities: probs(LATERAIS, lat) },
    urgencia: { type: 'score', score: t < 2 ? 3 : t < 4 ? 2 : t < 6 ? 1 : 0 },
    colisaoIminente: { type: 'boolean', probability: 0.88 },
    abortarMissao: { type: 'boolean', probability: degradado ? 0.8 : 0.04 },
  };
}

export function aplicarDecisao(r, payload) {
  const a = payload?.answers;
  if (!a?.manobraVertical || !a?.manobraLateral) return;

  r.jev.ultima = payload;
  if (payload.aviso) r.jev.aviso = payload.aviso;

  const v = a.manobraVertical.choice;
  const l = a.manobraLateral.choice;
  r.cmdY = v === 'subir' ? 1 : v === 'descer' ? -1 : 0;
  r.cmdX = l === 'direita' ? 1 : l === 'esquerda' ? -1 : 0;

  const score = clamp(Math.round(a.urgencia?.score ?? 0), 0, 3);
  let intensidade = INTENSIDADE_POR_URGENCIA[score];
  if ((a.colisaoIminente?.probability ?? 0) > 0.7) intensidade = 1;
  r.intensidade = intensidade;

  if ((a.abortarMissao?.probability ?? 0) > LIMIAR_ABORTAR) {
    r.terminada = true;
    r.desfecho = 'abortada';
  }
}

async function pedirDecisao(estado, timeoutMs = 1500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch('/api/jev', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(estado),
      signal: ctrl.signal,
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
  } finally {
    clearTimeout(timer);
  }
}

export function pilotar(r, agora, ritmoMs) {
  if (r.piloto === 'humano' || r.terminada) return;

  if (r.piloto === 'baseline') {
    // Mesma cadência e mesmas amostras de sensor que o modelo, para que a
    // comparação isole o DECISOR e não a frequência de decisão. Num sistema
    // real esta regra correria localmente a 60 Hz — uma vantagem que aqui lhe
    // é deliberadamente retirada, e que o debriefing assinala.
    if (agora < r.jev.proximaEm) return;
    r.jev.proximaEm = agora + ritmoMs;
    r.jev.chamadas++;

    const sensores = lerSensores(r, true);
    const estado = estadoParaModelo(r, sensores);
    const answers = decisaoGeometrica(estado);
    const payload = { fonte: 'baseline', latencia_ms: 0, answers };
    aplicarDecisao(r, payload);
    registar(r, estado, payload);
    return;
  }

  // jev: uma avaliação a cada `ritmoMs`, sem bloquear o ciclo de render
  if (r.jev.pendente || agora < r.jev.proximaEm) return;

  const sensores = lerSensores(r, true);
  const estado = estadoParaModelo(r, sensores);
  r.jev.pendente = true;
  r.jev.proximaEm = agora + ritmoMs;
  r.jev.chamadas++;

  pedirDecisao(estado)
    .then((payload) => {
      if (typeof payload.latencia_ms === 'number') r.jev.latencias.push(payload.latencia_ms);
      aplicarDecisao(r, payload);
      registar(r, estado, payload);
    })
    .catch(() => {
      r.jev.falhas++;
      r.jev.aviso = 'Sem resposta do Gateway — decisão local de reserva.';
      const payload = { fonte: 'reserva-local', latencia_ms: null, answers: decisaoGeometrica(estado) };
      aplicarDecisao(r, payload);
      registar(r, estado, payload);
    })
    .finally(() => { r.jev.pendente = false; });
}

function registar(r, estado, payload) {
  r.log.push({
    t_s: Number(r.t.toFixed(2)),
    distancia_m: Math.round(r.s),
    piloto: r.piloto,
    fonte: payload.fonte,
    latencia_ms: payload.latencia_ms,
    estado,
    answers: payload.answers,
  });
}

// ---------------------------------------------------------------- física

export function passo(r, dt) {
  if (r.terminada) return;

  /**
   * Decisão e controlo são camadas separadas, como num veículo real: a decisão
   * (humana, geométrica ou do modelo) escolhe uma direcção e uma intensidade; o
   * controlador local converte isso numa velocidade-alvo e persegue-a a cada
   * passo. É isto que torna o sistema tolerante à latência da camada de decisão
   * — e é a razão pela qual essa camada pode ser um modelo e não um laço rígido.
   */
  const aplicaEixo = (v, cmd) => {
    const alvo = cmd * V_LATERAL_MAX * (cmd !== 0 ? r.intensidade : 0);
    const erro = alvo - v;
    const acel = clamp(erro * 3.5, -ACC, ACC);
    return clamp(v + acel * dt, -V_LATERAL_MAX, V_LATERAL_MAX);
  };

  r.vx = aplicaEixo(r.vx, r.cmdX);
  r.vy = aplicaEixo(r.vy, r.cmdY);
  r.x += r.vx * dt;
  r.y += r.vy * dt;
  r.s += V_FRENTE * dt;
  r.t += dt;
  if (r.invuln > 0) r.invuln -= dt;
  r.energia += (Math.abs(r.cmdX) + Math.abs(r.cmdY)) * r.intensidade * dt;

  // limites do corredor
  const L = CORREDOR.LIMITE_LATERAL - CORREDOR.RAIO_DRONE;
  if (r.x < -L) { r.x = -L; r.vx = Math.max(0, r.vx); embater(r, 'limite lateral'); }
  if (r.x > L) { r.x = L; r.vx = Math.min(0, r.vx); embater(r, 'limite lateral'); }
  if (r.y < CORREDOR.ALT_MIN) { r.y = CORREDOR.ALT_MIN; r.vy = Math.max(0, r.vy); embater(r, 'solo'); }
  if (r.y > CORREDOR.ALT_MAX) { r.y = CORREDOR.ALT_MAX; r.vy = Math.min(0, r.vy); embater(r, 'tecto'); }

  // portões ultrapassados
  const portoes = r.percurso.portoes;
  while (r.idx < portoes.length && portoes[r.idx].z < r.s - 14) {
    if (!portoes[r.idx].atingido) r.portoesLimpos++;
    r.idx++;
  }

  // colisão com as peças do portão que estamos a atravessar
  for (let i = r.idx; i < portoes.length; i++) {
    const p = portoes[i];
    if (p.z - r.s > 16) break;
    for (const peca of p.pecas) {
      if (Math.abs(p.z - r.s) > peca.sz / 2 + CORREDOR.RAIO_DRONE) continue;
      if (Math.abs(r.x - peca.x) > peca.sx / 2 + CORREDOR.RAIO_DRONE) continue;
      if (Math.abs(r.y - peca.y) > peca.sy / 2 + CORREDOR.RAIO_DRONE) continue;
      p.atingido = true;
      embater(r, peca.nome);
      break;
    }
  }

  if (r.s >= DISTANCIA_ALVO) { r.terminada = true; r.desfecho = 'entregue'; }
  if (r.integridade <= 0) { r.terminada = true; r.desfecho = 'perdida'; }
}

function embater(r, oQue) {
  if (r.invuln > 0) return;
  r.invuln = INVULN_S;
  r.integridade = Math.max(0, r.integridade - INTEGRIDADE_POR_EMBATE);
  r.embates++;
  r.ultimoEmbate = oQue;
  r.flash = 1;
  if (navigator.vibrate) navigator.vibrate(70);
}

// ---------------------------------------------------------------- pontuação

export function pontuar(r) {
  const entregue = r.desfecho === 'entregue';
  const total = Math.round(
    (entregue ? 1000 : 0) +
    r.s * 0.4 +
    r.portoesLimpos * 60 +
    r.integridade * 3 -
    r.embates * 200,
  );
  const lats = r.jev.latencias.slice().sort((a, b) => a - b);
  return {
    total: Math.max(0, total),
    desfecho: r.desfecho ?? 'incompleta',
    distancia: Math.round(r.s),
    portoes: r.portoesLimpos,
    embates: r.embates,
    integridade: Math.round(r.integridade),
    energia: Number(r.energia.toFixed(1)),
    chamadas: r.jev.chamadas,
    latencia: lats.length ? lats[Math.floor(lats.length / 2)] : null,
    aviso: r.jev.aviso,
    log: r.log,
  };
}
