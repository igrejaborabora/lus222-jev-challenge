// Geometria pura do LUS-222 (sem Three.js): estações da fuselagem, anéis
// superelipse por comprimento de arco, loft genérico com normais e UV.
// Nariz em +Z, Y para cima, lado direito da aeronave em +X.

/**
 * Estações da fuselagem tiradas das vistas lateral e frontal da render.
 * z · meia-largura w · centro yc · alturas acima/abaixo do centro · expoentes
 * da superelipse (topo arredondado, flancos quase planos, ventre plano).
 */
export const ESTACOES_FUSELAGEM = [
  { z: 5.34, w: 0.05, yc: -0.36, hTop: 0.04, hBot: 0.04, nTop: 2, nBot: 2 },
  { z: 5.18, w: 0.24, yc: -0.33, hTop: 0.16, hBot: 0.13, nTop: 2.2, nBot: 2.6 },
  { z: 4.9, w: 0.46, yc: -0.27, hTop: 0.33, hBot: 0.27, nTop: 2.4, nBot: 3.2 },
  { z: 4.45, w: 0.7, yc: -0.18, hTop: 0.56, hBot: 0.5, nTop: 2.6, nBot: 3.8 },
  { z: 3.9, w: 0.9, yc: -0.08, hTop: 0.82, hBot: 0.74, nTop: 2.8, nBot: 4.2 },
  { z: 3.25, w: 1.01, yc: -0.02, hTop: 1.0, hBot: 0.88, nTop: 3, nBot: 4.6 },
  { z: 2.4, w: 1.05, yc: 0, hTop: 1.07, hBot: 0.95, nTop: 3.1, nBot: 4.8 },
  { z: -2.7, w: 1.05, yc: 0, hTop: 1.07, hBot: 0.95, nTop: 3.1, nBot: 4.8 },
  { z: -3.55, w: 1.0, yc: 0.13, hTop: 0.95, hBot: 0.8, nTop: 3, nBot: 4.2 },
  { z: -4.45, w: 0.86, yc: 0.36, hTop: 0.74, hBot: 0.52, nTop: 2.8, nBot: 3.4 },
  { z: -5.35, w: 0.62, yc: 0.62, hTop: 0.5, hBot: 0.3, nTop: 2.6, nBot: 2.8 },
  { z: -6.2, w: 0.33, yc: 0.86, hTop: 0.28, hBot: 0.14, nTop: 2.3, nBot: 2.4 },
  { z: -6.72, w: 0.07, yc: 0.97, hTop: 0.06, hBot: 0.04, nTop: 2, nBot: 2 },
];

const CHAVES = ['w', 'yc', 'hTop', 'hBot', 'nTop', 'nBot'];

/** Hermite monotónico (Fritsch–Carlson): suave e sem ultrapassar as estações. */
export function interpolarMonotono(xs, ys, x) {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = [d[0]];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
  m.push(d[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  let k = 0;
  while (x > xs[k + 1]) k++;
  const h = xs[k + 1] - xs[k];
  const t = (x - xs[k]) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[k] + (t3 - 2 * t2 + t) * h * m[k]
    + (-2 * t3 + 3 * t2) * ys[k + 1] + (t3 - t2) * h * m[k + 1];
}

/** Secção interpolada em qualquer z entre as estações. */
export function seccaoEm(z, estacoes = ESTACOES_FUSELAGEM) {
  const ord = [...estacoes].sort((a, b) => a.z - b.z);
  const zs = ord.map((e) => e.z);
  const sec = { z };
  for (const k of CHAVES) sec[k] = interpolarMonotono(zs, ord.map((e) => e[k]), z);
  return sec;
}

function potencia(v, p) {
  return Math.sign(v) * Math.abs(v) ** p;
}

/**
 * Anel superelipse reamostrado por comprimento de arco: começa no ventre
 * (x = 0), sobe pelo lado direito (+X), passa no topo e desce pelo esquerdo.
 * Devolve `pontos` [[x, y]] com n + 1 entradas (a última repete a primeira)
 * e `perimetro`.
 */
export function anelSuperelipse(sec, n = 40, amostras = 360) {
  const denso = [];
  for (let i = 0; i <= amostras; i++) {
    const t = -Math.PI / 2 + (i / amostras) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const cima = s >= 0;
    const e = 2 / (cima ? sec.nTop : sec.nBot);
    denso.push([sec.w * potencia(c, e), sec.yc + (cima ? sec.hTop : sec.hBot) * potencia(s, e)]);
  }
  const arcos = [0];
  for (let i = 1; i < denso.length; i++) {
    arcos.push(arcos[i - 1] + Math.hypot(denso[i][0] - denso[i - 1][0], denso[i][1] - denso[i - 1][1]));
  }
  const perimetro = arcos[arcos.length - 1];
  const pontos = [];
  let k = 0;
  for (let j = 0; j <= n; j++) {
    const alvo = (j / n) * perimetro;
    while (k < arcos.length - 2 && arcos[k + 1] < alvo) k++;
    const f = (alvo - arcos[k]) / Math.max(1e-9, arcos[k + 1] - arcos[k]);
    pontos.push([
      denso[k][0] + (denso[k + 1][0] - denso[k][0]) * f,
      denso[k][1] + (denso[k + 1][1] - denso[k][1]) * f,
    ]);
  }
  pontos[n] = [...pontos[0]];
  return { pontos, perimetro };
}

/** Fracção de arco (coordenada V) onde o flanco `lado` (+1 dir, -1 esq) passa em y. */
export function vEmY(anel, y, lado) {
  const p = anel.pontos;
  const n = p.length - 1;
  const meio = n / 2;
  const [ini, fim, passo] = lado > 0 ? [0, meio, 1] : [n, meio, -1];
  if (y <= p[ini][1]) return ini / n;
  for (let j = ini; j !== fim; j += passo) {
    const a = p[j][1];
    const b = p[j + passo][1];
    if (y >= a && y <= b) {
      const f = b === a ? 0 : (y - a) / (b - a);
      return (j + f * passo) / n;
    }
  }
  return 0.5;
}

/** V a partir de uma distância de arco medida desde o topo (positiva para +X). */
export function vDoTopo(anel, dArco) {
  return 0.5 - dArco / anel.perimetro;
}

/** Perfil NACA de 4 dígitos com bordo de fuga fechado, do BF pelo extradorso e de volta. */
export function perfilNaca({ m = 0.02, p = 0.4, t = 0.14, n = 24 } = {}) {
  const meio = Math.max(4, Math.floor(n / 2));
  const espessura = (x) => 5 * t * (0.2969 * Math.sqrt(x) - 0.126 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4);
  const camber = (x) => {
    if (!m) return [0, 0];
    if (x < p) return [(m / p ** 2) * (2 * p * x - x * x), (2 * m / p ** 2) * (p - x)];
    return [(m / (1 - p) ** 2) * (1 - 2 * p + 2 * p * x - x * x), (2 * m / (1 - p) ** 2) * (p - x)];
  };
  const ponto = (x, sinal) => {
    const yt = espessura(x);
    const [yc, dy] = camber(x);
    const th = Math.atan(dy);
    return [x - sinal * yt * Math.sin(th), yc + sinal * yt * Math.cos(th)];
  };
  const pts = [];
  for (let i = 0; i <= meio; i++) {
    const x = 0.5 * (1 + Math.cos((i / meio) * Math.PI));
    pts.push(ponto(x, 1));
  }
  for (let i = 1; i <= meio; i++) {
    const x = 0.5 * (1 - Math.cos((i / meio) * Math.PI));
    pts.push(ponto(x, -1));
  }
  pts[pts.length - 1] = [...pts[0]];
  return pts;
}

/**
 * Loft de anéis 3D com o mesmo número de pontos (último = primeiro).
 * `us` dá a coordenada U de cada anel. Tampa as pontas com leque ao centróide
 * e orienta as normais para fora (regra do centróide do anel). A costura em
 * V = 0/1 partilha a normal para não criar vinco.
 */
export function loft(aneis, { us = null, tampaInicio = false, tampaFim = false } = {}) {
  const nA = aneis.length;
  const nP = aneis[0].length;
  if (nA < 2 || aneis.some((a) => a.length !== nP)) throw new Error('loft: anéis inválidos');
  const posicoes = [];
  const uvs = [];
  for (let i = 0; i < nA; i++) {
    const u = us ? us[i] : i / (nA - 1);
    for (let j = 0; j < nP; j++) {
      posicoes.push(...aneis[i][j]);
      uvs.push(u, j / (nP - 1));
    }
  }
  const indices = [];
  for (let i = 0; i < nA - 1; i++) {
    for (let j = 0; j < nP - 1; j++) {
      const a = i * nP + j;
      const b = a + nP;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const centroide = (anel) => {
    const c = [0, 0, 0];
    for (let j = 0; j < nP - 1; j++) for (let k = 0; k < 3; k++) c[k] += anel[j][k] / (nP - 1);
    return c;
  };
  const tampas = [];
  if (tampaInicio) tampas.push({ anel: 0, c: centroide(aneis[0]), inicio: true });
  if (tampaFim) tampas.push({ anel: nA - 1, c: centroide(aneis[nA - 1]), inicio: false });
  for (const tampa of tampas) {
    const centro = posicoes.length / 3;
    posicoes.push(...tampa.c);
    uvs.push(us ? us[tampa.anel] : tampa.anel / (nA - 1), 0.5);
    for (let j = 0; j < nP - 1; j++) {
      const a = tampa.anel * nP + j;
      if (tampa.inicio) indices.push(centro, a + 1, a);
      else indices.push(centro, a, a + 1);
    }
  }

  let normais = calcularNormais(posicoes, indices, nA, nP);
  // Orientação: comparar as normais do corpo com a direcção centróide → vértice.
  let soma = 0;
  for (let i = 0; i < nA; i++) {
    const c = centroide(aneis[i]);
    for (let j = 0; j < nP - 1; j++) {
      const k = (i * nP + j) * 3;
      soma += (posicoes[k] - c[0]) * normais[k] + (posicoes[k + 1] - c[1]) * normais[k + 1] + (posicoes[k + 2] - c[2]) * normais[k + 2];
    }
  }
  if (soma < 0) {
    for (let t = 0; t < indices.length; t += 3) {
      const x = indices[t + 1];
      indices[t + 1] = indices[t + 2];
      indices[t + 2] = x;
    }
    normais = normais.map((v) => -v);
  }
  return { posicoes, normais, uvs, indices };
}

function calcularNormais(pos, idx, nA, nP) {
  const n = new Array(pos.length).fill(0);
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    const e1 = [pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]];
    const e2 = [pos[c] - pos[a], pos[c + 1] - pos[a + 1], pos[c + 2] - pos[a + 2]];
    const f = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) for (let k = 0; k < 3; k++) n[v + k] += f[k];
  }
  for (let i = 0; i < nA; i++) {
    const a = i * nP * 3;
    const b = (i * nP + nP - 1) * 3;
    for (let k = 0; k < 3; k++) {
      const s = n[a + k] + n[b + k];
      n[a + k] = s;
      n[b + k] = s;
    }
  }
  for (let v = 0; v < n.length; v += 3) {
    const l = Math.hypot(n[v], n[v + 1], n[v + 2]) || 1;
    n[v] /= l;
    n[v + 1] /= l;
    n[v + 2] /= l;
  }
  return n;
}

/** Anéis 3D da fuselagem e U normalizado ao longo de z (cauda 0 → nariz 1). */
export function aneisFuselagem({ nAneis = 48, nPontos = 40, estacoes = ESTACOES_FUSELAGEM } = {}) {
  const zs = estacoes.map((e) => e.z);
  const zMin = Math.min(...zs);
  const zMax = Math.max(...zs);
  const aneis = [];
  const us = [];
  const planos = [];
  for (let i = 0; i < nAneis; i++) {
    // Mais anéis no nariz e na cauda, onde a secção muda depressa.
    const t = i / (nAneis - 1);
    const z = zMin + (zMax - zMin) * (t - (0.6 * Math.sin(2 * Math.PI * t)) / (2 * Math.PI));
    const anel = anelSuperelipse(seccaoEm(z, estacoes), nPontos);
    planos.push(anel);
    aneis.push(anel.pontos.map(([x, y]) => [x, y, z]));
    us.push((z - zMin) / (zMax - zMin));
  }
  return { aneis, us, planos, zMin, zMax };
}
