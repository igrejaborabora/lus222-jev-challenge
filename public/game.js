/**
 * LUS 222 — JEV Challenge
 *
 * Duas rondas no mesmo corredor, gerado a partir da mesma semente:
 *   1) o piloto humano;
 *   2) o modelo `typesafe-ai/jev` (TypeSafe AI) através do Vercel AI Gateway,
 *      consultado a cada ~250 ms com o estado de voo e quatro perguntas tipadas.
 *
 * Tudo o que é físico está em metros e segundos; a conversão para píxeis acontece
 * apenas no momento de desenhar.
 */

// ---------------------------------------------------------------- constantes

const LARGURA = 960;
const ALTURA = 540;

const CEU_TOPO = 52;          // px — topo do corredor no canvas
const SOLO_Y = 486;           // px — solo no canvas
const TECTO_M = 1600;         // altitude máxima do corredor, em metros
const M_POR_PX_Y = TECTO_M / (SOLO_Y - CEU_TOPO);
const PX_POR_M_X = 2.0;       // escala horizontal

const V_AR = 140;             // m/s — velocidade no ar, constante
const ACC = 14;               // m/s² — aceleração vertical a pleno comando (~1,4 g)
const AMORTECIMENTO = 10;     // m/s² — regresso ao voo nivelado sem comando
const VY_MAX = 28;            // m/s — taxa de subida/descida máxima
const AVIAO_X_PX = 190;       // posição fixa do avião no ecrã
const AVIAO_COMP = 24;        // m — meia caixa de colisão horizontal
const AVIAO_ALT = 22;         // m — meia caixa de colisão vertical
const RADAR_M = 700;          // alcance do sensor de obstáculos
const DISTANCIA_ALVO = 8000;  // m — comprimento do percurso
const VIDAS = 3;
const INVULN_S = 1.6;

const DIFICULDADES = {
  treino:   { espaco: [700, 900], gap: 430, label: 'Treino' },
  linha:    { espaco: [480, 680], gap: 340, label: 'Linha' },
  alentejo: { espaco: [360, 520], gap: 275, label: 'Alentejo cerrado' },
};

const TIPOS = ['torre_eolica', 'drone', 'bando_aves', 'balao', 'torre_eolica', 'drone'];

// ---------------------------------------------------------------- utilitários

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** PRNG determinístico — a mesma semente dá exactamente o mesmo corredor. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const altParaY = (m) => SOLO_Y - m / M_POR_PX_Y;
const mParaPx = (m) => m / M_POR_PX_Y;

// ---------------------------------------------------------------- percurso

/**
 * Gera o corredor. O centro do corredor livre só pode variar entre obstáculos
 * consecutivos o que a aeronave consegue acompanhar — assim nenhuma semente
 * produz uma pista impossível.
 */
function gerarPercurso(seed, dificuldade) {
  const rnd = mulberry32(seed);
  const cfg = DIFICULDADES[dificuldade] ?? DIFICULDADES.linha;
  const obstaculos = [];

  let x = 900;
  let centro = TECTO_M * 0.5;

  while (x < DISTANCIA_ALVO - 400) {
    const espaco = lerp(cfg.espaco[0], cfg.espaco[1], rnd());
    const gap = cfg.gap * lerp(0.92, 1.12, rnd());

    // quanto é que a aeronave consegue subir/descer até ao próximo obstáculo
    const margemManobra = 0.55 * VY_MAX * (espaco / V_AR);
    const alvo = lerp(gap * 0.6, TECTO_M - gap * 0.6, rnd());
    centro = clamp(
      centro + clamp(alvo - centro, -margemManobra, margemManobra),
      gap * 0.55,
      TECTO_M - gap * 0.55,
    );

    const baseGap = centro - gap / 2;
    const topoGap = centro + gap / 2;
    const tipo = TIPOS[Math.floor(rnd() * TIPOS.length)];
    const largura = tipo === 'balao' ? 90 : tipo === 'bando_aves' ? 70 : 46;

    // obstáculo inferior (do solo até ao início do corredor livre)
    if (baseGap > 60) {
      obstaculos.push({
        x, largura,
        base: 0,
        topo: baseGap,
        tipo: tipo === 'balao' || tipo === 'drone' ? 'torre_eolica' : tipo,
        semente: rnd(),
      });
    }
    // obstáculo superior (do fim do corredor livre até ao tecto)
    if (topoGap < TECTO_M - 60) {
      obstaculos.push({
        x, largura,
        base: topoGap,
        topo: TECTO_M,
        tipo: tipo === 'torre_eolica' ? 'drone' : tipo,
        semente: rnd(),
      });
    }

    x += espaco;
  }

  // colinas de fundo, também determinísticas
  const colinas = [];
  for (let i = 0; i < 3; i++) {
    const pontos = [];
    for (let k = 0; k <= 40; k++) pontos.push(rnd());
    colinas.push(pontos);
  }

  return { obstaculos, colinas, cfg };
}

// ---------------------------------------------------------------- estado da ronda

function novaRonda(percurso, piloto) {
  return {
    piloto,                       // 'humano' | 'jev'
    t: 0,
    distancia: 0,
    altitude: TECTO_M * 0.5,
    vy: 0,
    comando: 0,                   // -1 descer | 0 manter | +1 subir
    intensidade: 1,
    vidas: VIDAS,
    invuln: 0,
    evitados: 0,
    embates: 0,
    desconforto: 0,
    gMax: 1,
    terminada: false,
    rasto: [],
    percurso,
    idx: 0,                       // primeiro obstáculo ainda não ultrapassado
    jev: {
      ultima: null,
      latencias: [],
      chamadas: 0,
      falhas: 0,
      proximaEm: 0,
      aviso: '',
      pendente: false,
    },
  };
}

// ---------------------------------------------------------------- sensores

/** O que o piloto (humano ou modelo) "vê" à frente, em metros. */
function lerSensores(r) {
  const lista = [];
  for (let i = r.idx; i < r.percurso.obstaculos.length; i++) {
    const o = r.percurso.obstaculos[i];
    const dist = o.x - r.distancia;
    if (dist < -o.largura) continue;
    if (dist > RADAR_M) break;

    const folgaCima = TECTO_M - o.topo;           // espaço livre acima do obstáculo
    const folgaBaixo = o.base;                    // espaço livre abaixo do obstáculo
    const emRota = r.altitude + AVIAO_ALT > o.base && r.altitude - AVIAO_ALT < o.topo;

    lista.push({
      tipo: nomeTipo(o.tipo),
      distancia_m: Math.max(0, Math.round(dist)),
      segundos_ate_ao_contacto: Number(Math.max(0, dist / V_AR).toFixed(1)),
      base_m: Math.round(o.base),
      topo_m: Math.round(o.topo),
      passagem_por_cima_m: Math.round(folgaCima > 0 ? TECTO_M - o.topo : -1),
      passagem_por_baixo_m: Math.round(folgaBaixo > 0 ? o.base : -1),
      em_rota_de_colisao: emRota,
      _ref: o,
    });
  }
  return lista;
}

function nomeTipo(t) {
  return {
    torre_eolica: 'torre eólica',
    drone: 'drone de carga',
    bando_aves: 'bando de aves',
    balao: 'balão meteorológico',
  }[t] ?? t;
}

function estadoParaModelo(r, sensores) {
  return {
    aeronave: {
      altitude_m: Math.round(r.altitude),
      velocidade_vertical_ms: Math.round(r.vy),
      velocidade_ar_ms: V_AR,
      carga_g: Number((1 + (r.comando * ACC * r.intensidade) / 9.81).toFixed(2)),
    },
    corredor: {
      altitude_minima_m: 0,
      altitude_maxima_m: TECTO_M,
      margem_ao_solo_m: Math.round(r.altitude),
      margem_ao_tecto_m: Math.round(TECTO_M - r.altitude),
    },
    obstaculos: sensores.slice(0, 4).map(({ _ref, ...o }) => o),
  };
}

// ---------------------------------------------------------------- piloto JEV

/** Réplica no cliente do piloto de reserva do servidor, para quando a rede falha. */
function decisaoLocal(sensores, altitude) {
  const ameaca = sensores.find((o) => o.em_rota_de_colisao);
  if (!ameaca) {
    // sem ameaça: converge devagar para o meio do corredor
    const desvio = TECTO_M * 0.5 - altitude;
    const escolha = Math.abs(desvio) < 90 ? 'manter' : desvio > 0 ? 'subir' : 'descer';
    return {
      manobra: { type: 'choice', choice: escolha, probabilities: { subir: 0, descer: 0, manter: 1 } },
      urgencia: { type: 'score', score: 0 },
      colisaoIminente: { type: 'boolean', probability: 0.02 },
      conforto: { type: 'boolean', probability: 1 },
    };
  }
  const cima = ameaca.passagem_por_cima_m;
  const baixo = ameaca.passagem_por_baixo_m;
  const escolha = cima >= baixo ? 'subir' : 'descer';
  const t = ameaca.segundos_ate_ao_contacto;
  return {
    manobra: {
      type: 'choice',
      choice: escolha,
      probabilities: { subir: escolha === 'subir' ? 1 : 0, descer: escolha === 'descer' ? 1 : 0, manter: 0 },
    },
    urgencia: { type: 'score', score: t < 2 ? 3 : t < 4 ? 2 : t < 6 ? 1 : 0 },
    colisaoIminente: { type: 'boolean', probability: 0.85 },
    conforto: { type: 'boolean', probability: t > 4 ? 0.9 : 0.15 },
  };
}

async function pedirDecisao(estado, timeoutMs = 1400) {
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

const INTENSIDADE_POR_URGENCIA = [0.35, 0.6, 0.88, 1];

function aplicarDecisao(r, payload) {
  const a = payload?.answers;
  if (!a?.manobra) return;
  r.jev.ultima = { ...payload, recebidaEm: performance.now() };
  if (payload.aviso) r.jev.aviso = payload.aviso;

  const escolha = a.manobra.choice;
  r.comando = escolha === 'subir' ? 1 : escolha === 'descer' ? -1 : 0;

  const score = clamp(Math.round(a.urgencia?.score ?? 0), 0, 3);
  let intensidade = INTENSIDADE_POR_URGENCIA[score];
  if ((a.colisaoIminente?.probability ?? 0) > 0.7) intensidade = 1;
  if ((a.conforto?.probability ?? 1) > 0.8) intensidade = Math.min(intensidade, 0.7);
  r.intensidade = intensidade;
}

function pilotarJev(r, agora, ritmoMs) {
  if (r.jev.pendente || agora < r.jev.proximaEm) return;

  const sensores = lerSensores(r);
  const estado = estadoParaModelo(r, sensores);
  r.jev.pendente = true;
  r.jev.proximaEm = agora + ritmoMs;
  r.jev.chamadas++;

  pedirDecisao(estado)
    .then((payload) => {
      if (typeof payload.latencia_ms === 'number') r.jev.latencias.push(payload.latencia_ms);
      aplicarDecisao(r, payload);
    })
    .catch(() => {
      r.jev.falhas++;
      r.jev.aviso = 'Sem resposta do Gateway — piloto de reserva geométrico.';
      aplicarDecisao(r, {
        fonte: 'reserva-local',
        latencia_ms: null,
        answers: decisaoLocal(sensores, r.altitude),
      });
    })
    .finally(() => { r.jev.pendente = false; });
}

// ---------------------------------------------------------------- física

function passo(r, dt) {
  if (r.terminada) return;

  const acelComandada = r.comando * ACC * r.intensidade;
  let acel = acelComandada;
  if (r.comando === 0) {
    acel = clamp(-r.vy * 3, -AMORTECIMENTO, AMORTECIMENTO);
  }

  r.vy = clamp(r.vy + acel * dt, -VY_MAX, VY_MAX);
  r.altitude += r.vy * dt;
  r.distancia += V_AR * dt;
  r.t += dt;
  if (r.invuln > 0) r.invuln -= dt;

  // conforto: integral da aceleração vertical sentida pelos passageiros
  const g = Math.abs(acelComandada) / 9.81;
  r.gMax = Math.max(r.gMax, 1 + g);
  r.desconforto += g * g * dt;

  // limites do corredor
  if (r.altitude < AVIAO_ALT) { r.altitude = AVIAO_ALT; r.vy = Math.max(0, r.vy); embater(r, 'solo'); }
  if (r.altitude > TECTO_M - AVIAO_ALT) { r.altitude = TECTO_M - AVIAO_ALT; r.vy = Math.min(0, r.vy); embater(r, 'tecto'); }

  // obstáculos
  const obs = r.percurso.obstaculos;
  while (r.idx < obs.length && obs[r.idx].x + obs[r.idx].largura < r.distancia - AVIAO_COMP) {
    r.idx++;
    r.evitados++;
  }
  for (let i = r.idx; i < obs.length; i++) {
    const o = obs[i];
    if (o.x - o.largura > r.distancia + AVIAO_COMP) break;
    const sobrepoeX = r.distancia + AVIAO_COMP > o.x - o.largura / 2 && r.distancia - AVIAO_COMP < o.x + o.largura / 2;
    const sobrepoeY = r.altitude + AVIAO_ALT > o.base && r.altitude - AVIAO_ALT < o.topo;
    if (sobrepoeX && sobrepoeY) embater(r, o.tipo);
  }

  r.rasto.push({ x: r.distancia, y: r.altitude });
  if (r.rasto.length > 90) r.rasto.shift();

  if (r.distancia >= DISTANCIA_ALVO || r.vidas <= 0) r.terminada = true;
}

function embater(r, tipo) {
  if (r.invuln > 0) return;
  r.invuln = INVULN_S;
  r.vidas--;
  r.embates++;
  r.ultimoEmbate = tipo;
  r.flash = 1;
  if (navigator.vibrate) navigator.vibrate(60);
}

// ---------------------------------------------------------------- pontuação

/**
 * Conforto a bordo: média da carga vertical extra imposta aos passageiros ao
 * longo do voo, não o total acumulado — senão um voo longo e suave pontuaria
 * pior do que um voo curto e brusco.
 */
function confortoDe(r) {
  const medio = r.desconforto / Math.max(1, r.t);
  return clamp(100 - medio * 15, 0, 100);
}

function pontuar(r) {
  const conforto = confortoDe(r);
  const total = Math.round(
    r.evitados * 120 +
    r.distancia * 0.05 +
    conforto * 4 -
    r.embates * 300,
  );
  return {
    total: Math.max(0, total),
    conforto: Math.round(conforto),
    distancia: Math.round(r.distancia),
    evitados: r.evitados,
    embates: r.embates,
  };
}

// ---------------------------------------------------------------- desenho

const canvas = $('canvas');
const ctx = canvas.getContext('2d');

function desenhar(r) {
  ctx.clearRect(0, 0, LARGURA, ALTURA);
  desenharCeu(r);
  desenharColinas(r);
  desenharSolo(r);
  desenharObstaculos(r);
  desenharRadar(r);
  desenharRasto(r);
  desenharAviao(r);
  if (r.piloto === 'jev') desenharIntencao(r);
  desenharEscala();
  if (r.flash > 0) {
    ctx.fillStyle = `rgba(255, 90, 82, ${r.flash * 0.45})`;
    ctx.fillRect(0, 0, LARGURA, ALTURA);
    r.flash = Math.max(0, r.flash - 0.05);
  }
}

function desenharCeu(r) {
  const prog = r.distancia / DISTANCIA_ALVO;
  const g = ctx.createLinearGradient(0, 0, 0, SOLO_Y);
  g.addColorStop(0, `hsl(${lerp(214, 200, prog)}, 48%, ${lerp(14, 20, prog)}%)`);
  g.addColorStop(0.55, `hsl(${lerp(205, 30, prog)}, ${lerp(40, 44, prog)}%, ${lerp(24, 32, prog)}%)`);
  g.addColorStop(1, `hsl(${lerp(28, 20, prog)}, 52%, ${lerp(40, 46, prog)}%)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LARGURA, SOLO_Y);

  // sol baixo do Alentejo
  const sx = LARGURA - 150;
  const sy = SOLO_Y - 96;
  const sol = ctx.createRadialGradient(sx, sy, 6, sx, sy, 130);
  sol.addColorStop(0, 'rgba(255, 216, 150, .85)');
  sol.addColorStop(1, 'rgba(255, 180, 90, 0)');
  ctx.fillStyle = sol;
  ctx.fillRect(sx - 140, sy - 140, 280, 280);
}

function desenharColinas(r) {
  const camadas = [
    { pontos: r.percurso.colinas[0], vel: 0.08, alt: 74, cor: 'rgba(24, 44, 46, .55)' },
    { pontos: r.percurso.colinas[1], vel: 0.16, alt: 54, cor: 'rgba(20, 38, 38, .75)' },
    { pontos: r.percurso.colinas[2], vel: 0.3,  alt: 36, cor: 'rgba(15, 30, 30, .95)' },
  ];
  for (const c of camadas) {
    const desloc = (r.distancia * PX_POR_M_X * c.vel) % 400;
    ctx.fillStyle = c.cor;
    ctx.beginPath();
    ctx.moveTo(-100, SOLO_Y);
    for (let i = 0; i <= 30; i++) {
      const px = -100 + i * 40 - desloc;
      const h = c.pontos[i % c.pontos.length] * c.alt;
      ctx.lineTo(px, SOLO_Y - 12 - h);
    }
    ctx.lineTo(LARGURA + 100, SOLO_Y);
    ctx.closePath();
    ctx.fill();
  }
}

function desenharSolo(r) {
  const g = ctx.createLinearGradient(0, SOLO_Y, 0, ALTURA);
  g.addColorStop(0, '#1b2a1d');
  g.addColorStop(1, '#0d1610');
  ctx.fillStyle = g;
  ctx.fillRect(0, SOLO_Y, LARGURA, ALTURA - SOLO_Y);

  ctx.strokeStyle = 'rgba(120, 180, 140, .22)';
  ctx.lineWidth = 1;
  const desloc = (r.distancia * PX_POR_M_X) % 60;
  ctx.beginPath();
  for (let x = -desloc; x < LARGURA; x += 60) {
    ctx.moveTo(x, SOLO_Y);
    ctx.lineTo(x - 26, ALTURA);
  }
  ctx.stroke();
}

function desenharObstaculos(r) {
  for (const o of r.percurso.obstaculos) {
    const dx = (o.x - r.distancia) * PX_POR_M_X + AVIAO_X_PX;
    if (dx < -120 || dx > LARGURA + 120) continue;
    const yTopo = altParaY(o.topo);
    const yBase = altParaY(o.base);
    const larguraPx = Math.max(10, o.largura * PX_POR_M_X * 0.5);

    switch (o.tipo) {
      case 'torre_eolica': desenharTorre(dx, yBase, yTopo, larguraPx, o, r); break;
      case 'drone': desenharDrone(dx, yBase, yTopo, larguraPx); break;
      case 'bando_aves': desenharAves(dx, yBase, yTopo, larguraPx, o, r); break;
      case 'balao': desenharBalao(dx, yBase, yTopo, larguraPx); break;
      default: desenharDrone(dx, yBase, yTopo, larguraPx);
    }
  }
}

function desenharTorre(x, yBase, yTopo, w, o, r) {
  ctx.fillStyle = '#d8e2ea';
  ctx.fillRect(x - w * 0.16, yTopo, w * 0.32, yBase - yTopo);
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.fillRect(x + w * 0.02, yTopo, w * 0.14, yBase - yTopo);

  // rotor
  const ang = (r.t * 1.4 + o.semente * 6) % (Math.PI * 2);
  ctx.save();
  ctx.translate(x, yTopo + 8);
  ctx.strokeStyle = '#eef4f8';
  ctx.lineWidth = Math.max(2, w * 0.1);
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const a = ang + (i * Math.PI * 2) / 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * w * 1.5, Math.sin(a) * w * 1.5);
    ctx.stroke();
  }
  ctx.restore();

  // luz de obstáculo
  const pisca = Math.sin(r.t * 4 + o.semente * 9) > 0.4;
  ctx.fillStyle = pisca ? '#ff5a52' : 'rgba(255,90,82,.25)';
  ctx.beginPath();
  ctx.arc(x, yTopo + 2, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function desenharDrone(x, yBase, yTopo, w) {
  const alturaPx = yBase - yTopo;
  const g = ctx.createLinearGradient(x - w, yTopo, x + w, yBase);
  g.addColorStop(0, '#39505f');
  g.addColorStop(1, '#22323d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x - w, yTopo, w * 2, alturaPx, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 181, 71, .5)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 181, 71, .75)';
  for (let y = yTopo + 16; y < yBase - 8; y += 34) {
    ctx.fillRect(x - w * 0.5, y, w, 3);
  }
}

function desenharAves(x, yBase, yTopo, w, o, r) {
  ctx.fillStyle = 'rgba(30, 40, 48, .5)';
  ctx.beginPath();
  ctx.roundRect(x - w, yTopo, w * 2, yBase - yTopo, 10);
  ctx.fill();

  ctx.strokeStyle = '#1b2630';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  const n = Math.max(3, Math.floor((yBase - yTopo) / 40));
  for (let i = 0; i < n; i++) {
    const bx = x + Math.sin(o.semente * 10 + i * 2.1) * w * 0.55;
    const by = yTopo + 18 + ((yBase - yTopo - 30) * i) / Math.max(1, n - 1);
    const bater = Math.sin(r.t * 7 + i) * 4;
    ctx.beginPath();
    ctx.moveTo(bx - 8, by);
    ctx.quadraticCurveTo(bx - 4, by - 4 - bater, bx, by);
    ctx.quadraticCurveTo(bx + 4, by - 4 - bater, bx + 8, by);
    ctx.stroke();
  }
}

function desenharBalao(x, yBase, yTopo, w) {
  ctx.fillStyle = 'rgba(232, 238, 245, .16)';
  ctx.strokeStyle = 'rgba(232, 238, 245, .55)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(x, (yTopo + yBase) / 2, w, (yBase - yTopo) / 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

/**
 * Faixa de radar na margem direita: mostra o que o sensor alcança para lá da
 * borda do ecrã, para que o piloto humano tenha a mesma antecipação que o
 * modelo recebe no campo `obstaculos`.
 */
function desenharRadar(r) {
  const X0 = LARGURA - 26;
  const visivelAte = (LARGURA - AVIAO_X_PX) / PX_POR_M_X; // metros já desenhados no ecrã

  ctx.save();
  ctx.fillStyle = 'rgba(8, 13, 20, .55)';
  ctx.fillRect(X0, CEU_TOPO, 26, SOLO_Y - CEU_TOPO);
  ctx.strokeStyle = 'rgba(232, 238, 245, .12)';
  ctx.lineWidth = 1;
  ctx.strokeRect(X0 + .5, CEU_TOPO + .5, 25, SOLO_Y - CEU_TOPO - 1);

  for (let i = r.idx; i < r.percurso.obstaculos.length; i++) {
    const o = r.percurso.obstaculos[i];
    const dist = o.x - r.distancia;
    if (dist < visivelAte) continue;
    if (dist > RADAR_M) break;

    const proximidade = 1 - (dist - visivelAte) / (RADAR_M - visivelAte);
    const emRota = r.altitude + AVIAO_ALT > o.base && r.altitude - AVIAO_ALT < o.topo;
    ctx.fillStyle = emRota
      ? `rgba(255, 90, 82, ${0.25 + proximidade * 0.5})`
      : `rgba(143, 163, 181, ${0.14 + proximidade * 0.34})`;
    ctx.fillRect(X0 + 3, altParaY(o.topo), 20, Math.max(2, mParaPx(o.topo - o.base)));
  }

  // referência da altitude actual na faixa
  ctx.strokeStyle = 'rgba(53, 214, 164, .85)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(X0, altParaY(r.altitude));
  ctx.lineTo(X0 + 26, altParaY(r.altitude));
  ctx.stroke();
  ctx.restore();
}

function desenharRasto(r) {
  if (r.rasto.length < 2) return;
  ctx.strokeStyle = r.piloto === 'jev' ? 'rgba(255, 181, 71, .35)' : 'rgba(53, 214, 164, .32)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  r.rasto.forEach((p, i) => {
    const px = (p.x - r.distancia) * PX_POR_M_X + AVIAO_X_PX;
    const py = altParaY(p.y);
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
  });
  ctx.stroke();
}

/** LUS 222: asa alta, dois turboélices, cauda em T. */
function desenharAviao(r) {
  const y = altParaY(r.altitude);
  const inclinacao = clamp(-r.vy / VY_MAX, -1, 1) * 0.32;
  const piscar = r.invuln > 0 && Math.floor(r.invuln * 12) % 2 === 0;

  ctx.save();
  ctx.translate(AVIAO_X_PX, y);
  ctx.rotate(-inclinacao);
  ctx.globalAlpha = piscar ? 0.35 : 1;

  // fuselagem
  ctx.fillStyle = '#f2f6fa';
  ctx.beginPath();
  ctx.moveTo(30, 0);
  ctx.quadraticCurveTo(24, -7, 2, -8);
  ctx.lineTo(-24, -7);
  ctx.quadraticCurveTo(-34, -6, -33, 0);
  ctx.quadraticCurveTo(-34, 6, -24, 7);
  ctx.lineTo(2, 8);
  ctx.quadraticCurveTo(24, 7, 30, 0);
  ctx.fill();

  // faixa verde/vermelha
  ctx.fillStyle = '#1e7a4c';
  ctx.fillRect(-22, 1, 40, 2.4);
  ctx.fillStyle = '#d7262b';
  ctx.fillRect(-22, 3.4, 40, 1.6);

  // cauda em T
  ctx.fillStyle = '#e4ebf2';
  ctx.beginPath();
  ctx.moveTo(-26, -6);
  ctx.lineTo(-34, -22);
  ctx.lineTo(-27, -22);
  ctx.lineTo(-19, -6);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(-38, -24, 17, 2.6);

  // asa alta
  ctx.fillStyle = '#dde6ee';
  ctx.beginPath();
  ctx.moveTo(8, -6);
  ctx.lineTo(-4, -11);
  ctx.lineTo(-22, -11);
  ctx.lineTo(-12, -5);
  ctx.closePath();
  ctx.fill();

  // motores + hélices
  const spin = (r.t * 26) % (Math.PI * 2);
  for (const ex of [-2, -14]) {
    ctx.fillStyle = '#b9c6d2';
    ctx.beginPath();
    ctx.roundRect(ex - 3, -12.5, 11, 5, 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(232, 238, 245, .55)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    const raio = 8 + Math.sin(spin + ex) * 1.2;
    ctx.ellipse(ex + 8, -10, 1.4, raio, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // janelas
  ctx.fillStyle = 'rgba(30, 60, 80, .8)';
  for (let i = 0; i < 9; i++) ctx.fillRect(-18 + i * 4.2, -3.6, 2.2, 2.6);
  ctx.fillStyle = 'rgba(120, 200, 230, .9)';
  ctx.beginPath();
  ctx.ellipse(23, -2.4, 4, 2.4, -0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** No voo da IA, mostra para onde o modelo quer levar a aeronave. */
function desenharIntencao(r) {
  const a = r.jev.ultima?.answers;
  if (!a?.manobra) return;
  const y = altParaY(r.altitude);
  const dir = a.manobra.choice === 'subir' ? -1 : a.manobra.choice === 'descer' ? 1 : 0;
  if (dir === 0) return;

  const urgente = (a.urgencia?.score ?? 0) >= 2;
  ctx.save();
  ctx.strokeStyle = urgente ? 'rgba(255, 90, 82, .9)' : 'rgba(255, 181, 71, .8)';
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  const base = y + dir * 24;
  const ponta = y + dir * 58;
  ctx.beginPath();
  ctx.moveTo(AVIAO_X_PX, base);
  ctx.lineTo(AVIAO_X_PX, ponta);
  ctx.moveTo(AVIAO_X_PX - 7, ponta - dir * 9);
  ctx.lineTo(AVIAO_X_PX, ponta);
  ctx.lineTo(AVIAO_X_PX + 7, ponta - dir * 9);
  ctx.stroke();
  ctx.restore();
}

function desenharEscala() {
  ctx.save();
  ctx.strokeStyle = 'rgba(232, 238, 245, .12)';
  ctx.fillStyle = 'rgba(232, 238, 245, .32)';
  ctx.font = '9px ui-monospace, monospace';
  ctx.lineWidth = 1;
  for (let m = 0; m <= TECTO_M; m += 400) {
    const y = altParaY(m);
    ctx.beginPath();
    ctx.moveTo(LARGURA - 74, y);
    ctx.lineTo(LARGURA - 66, y);
    ctx.stroke();
    ctx.fillText(`${m}`, LARGURA - 62, y + 3);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- HUD

function actualizarHud(r) {
  $('hud-dist').textContent = Math.round(r.distancia).toLocaleString('pt-PT');
  $('hud-evitados').textContent = r.evitados;
  $('hud-conforto').textContent = Math.round(confortoDe(r));
  const vidas = $('hud-vidas');
  vidas.textContent = '●'.repeat(Math.max(0, r.vidas)) + '○'.repeat(VIDAS - Math.max(0, r.vidas));
  vidas.classList.toggle('low', r.vidas <= 1);

  if (r.piloto !== 'jev') return;

  const a = r.jev.ultima?.answers;
  $('jev-lat').textContent = r.jev.ultima?.latencia_ms ?? '—';
  if (!a) return;

  $('jev-manobra').textContent = a.manobra.choice;
  const probs = a.manobra.probabilities ?? {};
  $('jev-bars').innerHTML = ['subir', 'manter', 'descer']
    .map((k) => {
      const v = clamp(Number(probs[k] ?? 0), 0, 1);
      return `<div class="bar-row"><span class="bar-name">${k}</span>` +
             `<span class="bar-track"><span class="bar-fill" style="width:${(v * 100).toFixed(0)}%"></span></span>` +
             `<span class="bar-val">${(v * 100).toFixed(0)}</span></div>`;
    })
    .join('');

  const urg = ['sem risco', 'vigiar', 'actuar já', 'emergência'];
  const s = clamp(Math.round(a.urgencia?.score ?? 0), 0, 3);
  $('jev-urgencia').textContent = `${urg[s]} (${(a.urgencia?.score ?? 0).toFixed(2)})`;
  $('jev-colisao').textContent = `${((a.colisaoIminente?.probability ?? 0) * 100).toFixed(0)}%`;
  $('jev-conforto').textContent = `${((a.conforto?.probability ?? 0) * 100).toFixed(0)}%`;
  $('jev-note').textContent = r.jev.aviso || '';
}

// ---------------------------------------------------------------- ciclo

const estado = {
  ecra: 'briefing',
  percurso: null,
  seed: 222,
  dificuldade: 'linha',
  ritmo: 250,
  ronda: null,
  resultados: { humano: null, jev: null },
  pausado: false,
  raf: 0,
  ultimo: 0,
  acumulador: 0,
};

function mostrarEcra(nome) {
  for (const s of document.querySelectorAll('.screen')) s.classList.remove('is-active');
  $(`screen-${nome}`).classList.add('is-active');
  estado.ecra = nome;
}

function iniciarRonda(piloto) {
  estado.ronda = novaRonda(estado.percurso, piloto);
  estado.pausado = false;
  estado.ultimo = performance.now();
  estado.acumulador = 0;

  $('hud-piloto-nome').textContent = piloto === 'jev' ? 'JEV' : 'HUMANO';
  $('hud-piloto-nome').classList.toggle('ia', piloto === 'jev');
  $('jev-panel').hidden = piloto !== 'jev';
  $('overlay').hidden = true;

  mostrarEcra('flight');
  cancelAnimationFrame(estado.raf);
  estado.raf = requestAnimationFrame(ciclo);
}

const PASSO = 1 / 120;

function ciclo(agora) {
  const r = estado.ronda;
  if (!r) return;

  if (!estado.pausado) {
    let dt = (agora - estado.ultimo) / 1000;
    if (dt > 0.25) dt = 0.25;
    estado.acumulador += dt;

    if (r.piloto === 'jev') pilotarJev(r, agora, estado.ritmo);

    while (estado.acumulador >= PASSO) {
      passo(r, PASSO);
      estado.acumulador -= PASSO;
      if (r.terminada) break;
    }
  }
  estado.ultimo = agora;

  desenhar(r);
  actualizarHud(r);

  if (r.terminada) { terminarRonda(r); return; }
  estado.raf = requestAnimationFrame(ciclo);
}

function terminarRonda(r) {
  const res = pontuar(r);
  if (r.piloto === 'jev') {
    const lats = r.jev.latencias.slice().sort((a, b) => a - b);
    res.chamadas = r.jev.chamadas;
    res.latencia = lats.length ? lats[Math.floor(lats.length / 2)] : null;
    res.aviso = r.jev.aviso;
    estado.resultados.jev = res;
    mostrarResultados();
  } else {
    estado.resultados.humano = res;
    mostrarTransicao(res);
  }
}

function mostrarTransicao(res) {
  $('overlay').hidden = false;
  $('overlay-title').textContent = res.embates >= VIDAS ? 'Aeronave perdida' : 'Ronda concluída';
  $('overlay-text').innerHTML =
    `Levaste o LUS 222 a <strong>${res.distancia.toLocaleString('pt-PT')} m</strong>, ` +
    `com ${res.evitados} obstáculos ultrapassados, ${res.embates} embate(s) e ` +
    `${res.conforto}% de conforto a bordo.<br><br>` +
    `Agora o mesmo corredor, voado pelo modelo <strong>typesafe-ai/jev</strong>.`;
  $('overlay-btn').textContent = 'Lançar a ronda do JEV';
  $('overlay-btn').onclick = () => iniciarRonda('jev');
}

function mostrarResultados() {
  const h = estado.resultados.humano;
  const j = estado.resultados.jev;

  $('score-humano').textContent = h.total.toLocaleString('pt-PT');
  $('r-h-dist').textContent = `${h.distancia.toLocaleString('pt-PT')} m`;
  $('r-h-evitados').textContent = h.evitados;
  $('r-h-embates').textContent = h.embates;
  $('r-h-conforto').textContent = `${h.conforto}%`;

  $('score-jev').textContent = j.total.toLocaleString('pt-PT');
  $('r-j-dist').textContent = `${j.distancia.toLocaleString('pt-PT')} m`;
  $('r-j-evitados').textContent = j.evitados;
  $('r-j-embates').textContent = j.embates;
  $('r-j-conforto').textContent = `${j.conforto}%`;
  $('r-j-chamadas').textContent = j.chamadas;
  $('r-j-lat').textContent = j.latencia != null ? `${j.latencia} ms` : '—';

  $('col-humano').classList.toggle('winner', h.total > j.total);
  $('col-jev').classList.toggle('winner', j.total >= h.total);

  const diff = Math.abs(h.total - j.total);
  let veredicto;
  if (h.total > j.total) {
    veredicto = `Ganhaste por ${diff.toLocaleString('pt-PT')} pontos. ` +
      `O Jev decide em ${j.latencia ?? '—'} ms por avaliação, mas decide por instantes: entre duas avaliações a aeronave segue o último comando.`;
  } else if (j.total > h.total) {
    veredicto = `O Jev ganhou por ${diff.toLocaleString('pt-PT')} pontos, com ${j.chamadas} avaliações tipadas ` +
      `(mediana de ${j.latencia ?? '—'} ms). Cada uma respondeu a quatro perguntas em paralelo — manobra, urgência, colisão iminente e conforto.`;
  } else {
    veredicto = 'Empate técnico. Muda a semente e volta a tentar.';
  }
  if (j.aviso) veredicto += ` · ${j.aviso}`;
  $('verdict').textContent = veredicto;

  $('result-title').textContent =
    h.total > j.total ? 'O piloto humano levou a melhor' :
    j.total > h.total ? 'O JEV levou a melhor' : 'Empate';

  mostrarEcra('results');
}

// ---------------------------------------------------------------- controlos

const teclas = new Set();

addEventListener('keydown', (e) => {
  if (estado.ecra !== 'flight') return;
  if (['ArrowUp', 'ArrowDown', 'w', 's', 'W', 'S', ' '].includes(e.key)) e.preventDefault();
  if (e.key === 'Escape') { alternarPausa(); return; }
  teclas.add(e.key);
  aplicarTeclas();
});

addEventListener('keyup', (e) => { teclas.delete(e.key); aplicarTeclas(); });

function aplicarTeclas() {
  const r = estado.ronda;
  if (!r || r.piloto !== 'humano') return;
  const sobe = teclas.has('ArrowUp') || teclas.has('w') || teclas.has('W');
  const desce = teclas.has('ArrowDown') || teclas.has('s') || teclas.has('S');
  r.comando = sobe && !desce ? 1 : desce && !sobe ? -1 : 0;
  r.intensidade = 1;
}

function comandoPorPonteiro(ev) {
  const r = estado.ronda;
  if (!r || r.piloto !== 'humano') return;
  const rect = canvas.getBoundingClientRect();
  const y = (ev.clientY - rect.top) / rect.height;
  r.comando = y < 0.5 ? 1 : -1;
  r.intensidade = 1;
}

canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); comandoPorPonteiro(e); });
canvas.addEventListener('pointermove', (e) => { if (e.pressure > 0 || e.buttons) comandoPorPonteiro(e); });
canvas.addEventListener('pointerup', () => { if (estado.ronda?.piloto === 'humano') estado.ronda.comando = 0; });
canvas.addEventListener('pointercancel', () => { if (estado.ronda?.piloto === 'humano') estado.ronda.comando = 0; });

function alternarPausa() {
  if (!estado.ronda || estado.ronda.terminada) return;
  estado.pausado = !estado.pausado;
  $('overlay').hidden = !estado.pausado;
  if (estado.pausado) {
    $('overlay-title').textContent = 'Pausa';
    $('overlay-text').textContent = 'O corredor continua onde o deixaste.';
    $('overlay-btn').textContent = 'Continuar';
    $('overlay-btn').onclick = alternarPausa;
  } else {
    estado.ultimo = performance.now();
    estado.raf = requestAnimationFrame(ciclo);
  }
}

// ---------------------------------------------------------------- arranque

async function verificarGateway() {
  const dot = $('dot-gateway');
  const txt = $('txt-gateway');
  try {
    const r = await fetch('/api/jev');
    const j = await r.json();
    if (j.gateway_configurado) {
      dot.classList.add('ok');
      txt.textContent = `AI Gateway ligado · modelo ${j.modelo}`;
    } else {
      dot.classList.add('warn');
      txt.textContent = 'AI Gateway sem credenciais — o JEV voa com o piloto de reserva geométrico.';
    }
  } catch {
    dot.classList.add('warn');
    txt.textContent = 'Endpoint /api/jev indisponível — o JEV voa com o piloto de reserva geométrico.';
  }
}

function arrancar() {
  estado.seed = Number($('input-seed').value) || 222;
  estado.dificuldade = $('select-dificuldade').value;
  estado.ritmo = Number($('select-ritmo').value);
  estado.percurso = gerarPercurso(estado.seed, estado.dificuldade);
  estado.resultados = { humano: null, jev: null };
  iniciarRonda('humano');
}

$('btn-start').addEventListener('click', arrancar);
$('btn-seed').addEventListener('click', () => {
  $('input-seed').value = String(Math.floor(Math.random() * 999999));
});
$('btn-again').addEventListener('click', () => mostrarEcra('briefing'));
$('btn-share').addEventListener('click', async () => {
  const h = estado.resultados.humano;
  const j = estado.resultados.jev;
  const texto =
    `LUS 222 — JEV Challenge (semente ${estado.seed}, ${DIFICULDADES[estado.dificuldade].label})\n` +
    `Humano: ${h.total} pts · ${h.distancia} m · ${h.embates} embates · conforto ${h.conforto}%\n` +
    `Jev:    ${j.total} pts · ${j.distancia} m · ${j.embates} embates · conforto ${j.conforto}%\n` +
    `${j.chamadas} avaliações typesafe-ai/jev, mediana ${j.latencia ?? '—'} ms`;
  try {
    await navigator.clipboard.writeText(texto);
    $('btn-share').textContent = 'Copiado ✓';
    setTimeout(() => { $('btn-share').textContent = 'Copiar resultado'; }, 1800);
  } catch {
    $('btn-share').textContent = 'Não foi possível copiar';
  }
});

// Em `?debug=1` o estado fica acessível na consola — usado também pelos testes automáticos.
if (location.search.includes('debug')) window.__lus222 = estado;

verificarGateway();
