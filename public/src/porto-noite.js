import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { alturaTerreno } from './relevo.js';

/**
 * A noite de São João no Porto, em coordenadas absolutas do mundo (x = −xM da
 * missão), dentro do grupo da geografia (recentrarOrigem desloca-o inteiro):
 * Ponte D. Luís I e Ponte da Arrábida sobre o Douro escavado no relevo,
 * casario da Ribeira e do cais de Gaia com janelas acesas, luzes da cidade,
 * balizagem da pista do Sá Carneiro, lanternas a subir do rio e fogo de
 * artifício. As lanternas e o fogo ficam abaixo dos 300 m e são só cenário:
 * as ameaças vêm do director e da física. Tudo acende com a noite do céu.
 * Cada peça é uma só chamada de desenho (geometrias fundidas ou instâncias).
 */
// A D. Luís I é um arco em crescente (Seyrig, escola Eiffel): duas cordas que se
// juntam nas rótulas dos arranques, com a treliça entre elas.
const LUIS_I = { x: 2200, vaoM: 172, flechaM: 44.6, tabuleiroMinM: 48, larguraM: 8, inferiorM: 8, crescenteM: 12 };
const ARRABIDA = { x: 4400, vaoM: 270, flechaM: 52, tabuleiroMinM: 66, larguraM: 26, inferiorM: null };
const AEROPORTO = { x: 0, z: 165000, comprimentoM: 3480, meiaLarguraM: 25 };
const ALTURA_MAX_LANTERNA_M = 300;

function aleatorio(semente) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let BRILHO = null;
function texturaBrilho() {
  if (BRILHO) return BRILHO;
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  BRILHO = new THREE.CanvasTexture(c);
  return BRILHO;
}

function materialLuz(tamanho) {
  return new THREE.PointsMaterial({
    size: tamanho, map: texturaBrilho(), vertexColors: true, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: false,
  });
}

function pontosLuz(posicoes, cores, tamanho) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(posicoes, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cores, 3));
  return new THREE.Points(geo, materialLuz(tamanho));
}

/**
 * Eixo do rio junto a x (os pontos vão da foz para montante): centro, sentido
 * para montante e a perpendicular para a margem norte (Porto).
 */
export function eixosDoRio(rio, x) {
  const pts = rio.pontos;
  let i = 1;
  while (i < pts.length - 1 && pts[i][0] > x) i++;
  const [a, b] = [pts[i - 1], pts[i]];
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const montante = { x: (b[0] - a[0]) / len, z: (b[1] - a[1]) / len };
  const t = (x - a[0]) / (b[0] - a[0]);
  return { centro: { x, z: a[1] + (b[1] - a[1]) * t }, montante, norte: { x: montante.z, z: -montante.x } };
}

const arco = (p, s) => p.flechaM * (1 - (2 * s / p.vaoM) ** 2);

function caixa(largura, altura, fundo, x, y, z) {
  return new THREE.BoxGeometry(largura, altura, fundo).translate(x, y, z);
}

/**
 * Ponte em arco no referencial local (x ao longo do rio, z de margem a margem,
 * para norte). O tabuleiro superior vai de escarpa a escarpa: acaba onde o
 * terreno chega à sua altura; onde não chega, desce em pilares.
 */
function criarPonte(perfil, pistas, p, { ferro, pedra, corLuz, leve }) {
  const { centro, norte } = eixosDoRio(perfil.rio, p.x);
  const chao = (s) => alturaTerreno(perfil, centro.x + norte.x * s, centro.z + norte.z * s, pistas);
  // O arco arranca da linha de água; onde a margem é mais alta, nasce de dentro da rocha.
  const y = (s) => arco(p, s);
  const topo = Math.max(p.tabuleiroMinM, p.flechaM + 3);
  const fim = (sinal) => {
    let s = p.vaoM / 2;
    while (s < 600 && chao(sinal * s) < topo - 1) s += 5;
    return sinal * (s + 4);
  };
  const [sSul, sNorte] = [fim(-1), fim(1)];
  const partes = [];
  const n = leve ? 20 : 40;
  const meia = p.larguraM / 2;
  const raio = p.vaoM > 200 ? 2.2 : 1.4;
  // Corda de baixo do crescente (sem crescente, o arco é uma só corda).
  const yBaixo = (s) => y(s) - (p.crescenteM ?? 0) * (1 - (2 * s / p.vaoM) ** 2);
  const corda = (f, lado) => {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const s = -p.vaoM / 2 + (p.vaoM * i) / n;
      pts.push(new THREE.Vector3(lado, f(s), s));
    }
    return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), n, raio, leve ? 4 : 6, false);
  };
  for (const lado of [-meia, meia]) {
    partes.push(corda(y, lado));
    if (p.crescenteM) {
      partes.push(corda(yBaixo, lado));
      // Treliça: montantes e diagonais em zigue-zague entre as cordas.
      const passoT = leve ? 12 : 6;
      for (let s = -p.vaoM / 2 + passoT; s < p.vaoM / 2 - passoT / 2; s += passoT) {
        const [cima, baixo] = [y(s), yBaixo(s)];
        partes.push(caixa(0.6, cima - baixo, 0.6, lado, (cima + baixo) / 2, s));
        const s2 = s + passoT;
        const a1 = new THREE.Vector3(lado, baixo, s);
        const a2 = new THREE.Vector3(lado, y(s2), s2);
        const comprimento = a1.distanceTo(a2);
        const diagonal = new THREE.BoxGeometry(0.5, comprimento, 0.5);
        diagonal.rotateX(Math.atan2(s2 - s, a2.y - a1.y));
        partes.push(diagonal.translate(lado, (a1.y + a2.y) / 2, (s + s2) / 2));
      }
    }
  }
  partes.push(caixa(p.larguraM + 2, 1.8, sNorte - sSul, 0, topo, (sNorte + sSul) / 2));
  if (p.inferiorM) {
    partes.push(caixa(p.larguraM + 2, 1.4, p.vaoM + 12, 0, p.inferiorM, 0));
    // Tabuleiro inferior suspenso da corda de baixo.
    for (let s = -p.vaoM / 2 + 14; s <= p.vaoM / 2 - 14; s += 14) {
      const alto = yBaixo(s) - p.inferiorM;
      if (alto > 2) for (const lado of [-meia, meia]) partes.push(caixa(0.5, alto, 0.5, lado, p.inferiorM + alto / 2, s));
    }
  }
  // Montantes do arco ao tabuleiro superior e pilares nas encostas.
  const passo = p.vaoM > 200 ? 18 : 12;
  for (let s = -p.vaoM / 2 + passo / 2; s < p.vaoM / 2; s += passo) {
    const alto = topo - y(s);
    if (alto > 1.5) partes.push(caixa(p.larguraM, alto, 0.9, 0, y(s) + alto / 2, s));
  }
  // Os pilares entram 20 m no chão: a malha do terreno (42 m entre vértices)
  // não segue a escarpa e deixava-os pendurados.
  for (const sinal of [-1, 1]) {
    for (let s = p.vaoM / 2 + 24; s < Math.abs(sinal < 0 ? sSul : sNorte) - 6; s += 30) {
      const pe = chao(sinal * s) - 20;
      if (topo - pe > 23) partes.push(caixa(4, topo - pe, 4, 0, (topo + pe) / 2, sinal * s));
    }
  }
  const grupo = new THREE.Group();
  grupo.position.set(centro.x, 0, centro.z);
  grupo.rotation.y = Math.atan2(norte.x, norte.z);
  const estrutura = new THREE.Mesh(mergeGeometries(partes), ferro);
  partes.forEach((g) => g.dispose());
  grupo.add(estrutura);
  // Pilares de granito nos arranques do arco (só na D. Luís I).
  if (pedra) {
    const pilares = [-1, 1].map((sinal) => caixa(p.larguraM + 6, topo + 8, 10, 0, topo / 2 - 4, sinal * (p.vaoM / 2 + 5)));
    grupo.add(new THREE.Mesh(mergeGeometries(pilares), pedra));
    pilares.forEach((g) => g.dispose());
  }
  const pos = [];
  const cor = [];
  for (let s = sSul; s <= sNorte; s += leve ? 12 : 6) {
    for (const lado of [-meia - 1, meia + 1]) { pos.push(lado, topo + 1.4, s); cor.push(...corLuz); }
  }
  for (let s = -p.vaoM / 2; s <= p.vaoM / 2; s += leve ? 8 : 4) {
    for (const lado of [-meia, meia]) { pos.push(lado, y(s) + 1.8, s); cor.push(...corLuz); }
  }
  const luzes = pontosLuz(pos, cor, leve ? 3.5 : 4.5);
  grupo.add(luzes);
  return { grupo, luzes, material: ferro, topo };
}

/**
 * Fachadas à esquerda (fundo quente e janelas acesas, algumas apagadas) e
 * negro à direita, para os telhados: com mipmaps, as duas metades não se
 * misturam até a casa ter um píxel.
 */
function texturaFachadas() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, 128, 64);
  // Fachadas iluminadas pelos candeeiros do cais: um fundo quente que se lê ao longe.
  ctx.fillStyle = '#4a2e14';
  ctx.fillRect(0, 0, 64, 64);
  const rnd = aleatorio(7);
  for (let r = 0; r < 4; r++) {
    for (let k = 0; k < 4; k++) {
      if (rnd() < 0.78) {
        ctx.fillStyle = rnd() < 0.8 ? '#ffc070' : '#fff0d0';
        ctx.fillRect(4 + k * 15, 5 + r * 15, 7, 9);
      }
    }
  }
  return new THREE.CanvasTexture(c);
}

/**
 * Casario da Ribeira e do cais de Gaia: fileiras contínuas de fachadas
 * estreitas viradas ao rio, do cais encosta acima (a jusante da ponte); em
 * Gaia, a primeira fileira são os armazéns compridos das caves.
 */
function criarCasario(perfil, pistas, leve) {
  const { centro, montante, norte } = eixosDoRio(perfil.rio, LUIS_I.x);
  const rnd = aleatorio(19);
  const fileiras = [];
  for (let k = 0; k < (leve ? 5 : 8); k++) fileiras.push({ sinal: 1, lado: 100 + k * 17, ate: 950 - k * 40, armazem: false });
  for (let k = 0; k < (leve ? 2 : 4); k++) fileiras.push({ sinal: -1, lado: 100 + k * 20, ate: 700 - k * 60, armazem: k === 0 });
  const maximo = fileiras.reduce((n, f) => n + Math.ceil(f.ate / 5), 0);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  // Faces: +x, −x, +y, −y, +z, −z (4 vértices cada). Paredes na metade das
  // janelas; telhado e chão num ponto da metade negra.
  const uv = geo.attributes.uv;
  for (let k = 0; k < uv.count; k++) {
    if (k >= 8 && k < 16) uv.setXY(k, 0.75, 0.5);
    else uv.setX(k, uv.getX(k) * 0.5);
  }
  const casas = new THREE.InstancedMesh(
    geo,
    new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveMap: texturaFachadas(), emissiveIntensity: 0 }),
    maximo,
  );
  const cores = [0xb86b4b, 0xd9a55a, 0x6c7fa0, 0xc9c2b0, 0x8f4a45, 0xd6c28a, 0x5f7f73, 0xe2d6c0];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(montante.x, montante.z));
  const cor = new THREE.Color();
  let i = 0;
  for (const f of fileiras) {
    // «ao» conta ao longo do rio a partir da ponte; negativo é a jusante.
    let ao = -45;
    while (-ao < f.ate && i < maximo) {
      const largura = f.armazem ? 22 + rnd() * 16 : 5 + rnd() * 4;
      const meio = ao - largura / 2;
      ao -= largura + 0.4;
      if (rnd() < 0.05) { ao -= 6; continue; }
      const lado = f.sinal * (f.lado + rnd() * 4);
      const x = centro.x + montante.x * meio + norte.x * lado;
      const z = centro.z + montante.z * meio + norte.z * lado;
      const h = alturaTerreno(perfil, x, z, pistas);
      if (h < 0.5) continue;
      const altura = f.armazem ? 7 + rnd() * 3 : 9 + rnd() * 11;
      const fundo = f.armazem ? 30 : 10 + rnd() * 3;
      // 8 m enterrados: a malha do terreno (42 m entre vértices) não segue a encosta.
      m4.compose(new THREE.Vector3(x, h - 8 + (altura + 8) / 2, z), q, new THREE.Vector3(fundo, altura + 8, largura));
      casas.setMatrixAt(i, m4);
      casas.setColorAt(i, cor.setHex(cores[Math.floor(rnd() * cores.length)]));
      i += 1;
    }
  }
  casas.count = i;
  return casas;
}

/**
 * Luzes da cidade (Porto, Gaia, Matosinhos) ao longo de ruas: cada rua é uma
 * fila de candeeiros de sódio ou LED numa malha que roda devagar de bairro para
 * bairro; mais ruas perto da Ribeira, nenhuma na água (a rua acaba no cais).
 */
function criarCidade(perfil, pistas, leve) {
  const rnd = aleatorio(31);
  const n = leve ? 8000 : 22000;
  const pos = [];
  const cor = [];
  for (let tentativa = 0; pos.length / 3 < n && tentativa < n; tentativa++) {
    const x0 = -4000 + rnd() * 14000;
    const z0 = 138000 + rnd() * 24000;
    const r = Math.hypot(x0 - LUIS_I.x, z0 - 152700);
    if (rnd() > 0.15 + 0.85 * Math.exp(-r / 3500)) continue;
    const malha = 0.6 * Math.sin(x0 / 2300) + 0.5 * Math.cos(z0 / 1900);
    const rumo = malha + (rnd() < 0.5 ? 0 : Math.PI / 2) + (rnd() - 0.5) * 0.12;
    const [dx, dz] = [Math.sin(rumo), Math.cos(rumo)];
    const sodio = rnd() < 0.6;
    const passo = 16 + rnd() * 8;
    const candeeiros = 4 + Math.floor(rnd() * 9);
    for (let k = 0; k < candeeiros; k++) {
      const x = x0 + dx * passo * k;
      const z = z0 + dz * passo * k;
      const h = alturaTerreno(perfil, x, z, pistas);
      if (h < 2) break;
      const b = 0.75 + 0.25 * rnd();
      pos.push(x, h + 5, z);
      if (sodio) cor.push(b, 0.68 * b, 0.34 * b);
      else cor.push(0.82 * b, 0.88 * b, b);
    }
    // Uma janela acesa solta de vez em quando, entre as ruas.
    if (rnd() < 0.25) {
      const x = x0 + (rnd() - 0.5) * 60;
      const z = z0 + (rnd() - 0.5) * 60;
      const h = alturaTerreno(perfil, x, z, pistas);
      if (h >= 2) { pos.push(x, h + 8, z); cor.push(1, 0.42, 0.32); }
    }
  }
  return pontosLuz(pos, cor, leve ? 2 : 2.5);
}

/** Balizagem da pista do Sá Carneiro (norte–sul): bordos, soleiras verdes, fim vermelho e aproximação. */
function criarPista(perfil, pistas, leve) {
  const { x, z, comprimentoM, meiaLarguraM } = AEROPORTO;
  const pos = [];
  const cor = [];
  const luz = (px, pz, c) => { pos.push(px, Math.max(0, alturaTerreno(perfil, px, pz, pistas)) + 0.8, pz); cor.push(...c); };
  const meio = comprimentoM / 2;
  for (let s = -meio; s <= meio; s += leve ? 120 : 60) for (const l of [-meiaLarguraM, meiaLarguraM]) luz(x + l, z + s, [1, 0.92, 0.75]);
  for (let l = -meiaLarguraM; l <= meiaLarguraM; l += 5) {
    luz(x + l, z - meio, [0.3, 1, 0.45]);
    luz(x + l, z + meio, [1, 0.25, 0.2]);
  }
  for (let d = 60; d <= 900; d += 60) luz(x, z - meio - d, [1, 1, 1]);
  return pontosLuz(pos, cor, leve ? 3 : 3.5);
}

/** Lanternas de São João a subir do rio e da Ribeira (cenário, abaixo dos 300 m). */
function criarLanternas(leve) {
  const n = leve ? 70 : 180;
  const rnd = aleatorio(47);
  const dados = [];
  const cor = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    dados.push({ ao: -rnd() * 1300, lado: (rnd() - 0.3) * 500, y: rnd() * ALTURA_MAX_LANTERNA_M, sobe: 0.8 + rnd() * 0.9 });
    cor.set([1, 0.62 + rnd() * 0.2, 0.3], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(cor, 3));
  const pontos = new THREE.Points(geo, materialLuz(leve ? 6 : 8));
  pontos.frustumCulled = false;
  return { pontos, dados, rnd };
}

/** Fogo de artifício sobre o Douro: até quatro rebentamentos ao mesmo tempo. */
function criarFogo(leve) {
  const porRebentamento = leve ? 70 : 140;
  const n = porRebentamento * 4;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const pontos = new THREE.Points(geo, materialLuz(leve ? 5 : 7));
  pontos.material.opacity = 1;
  pontos.frustumCulled = false;
  const particulas = Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, vida: 0, cintila: false, r: 1, g: 1, b: 1 }));
  return { pontos, particulas, porRebentamento, slots: 4, slot: 0, proximo: 1.5, relogio: 0, rnd: aleatorio(59) };
}

export function criarPortoNoite(geografia, { perfil, pistas = [], leve = false } = {}) {
  if (!perfil?.rio) return null;
  const ferro = new THREE.MeshLambertMaterial({ color: 0x3a3f45, emissive: 0xb07a35, emissiveIntensity: 0 });
  const pedra = new THREE.MeshLambertMaterial({ color: 0x8c877d, emissive: 0x6b5030, emissiveIntensity: 0 });
  const betao = new THREE.MeshLambertMaterial({ color: 0xb8b4aa, emissive: 0x6f7a88, emissiveIntensity: 0 });
  const luisI = criarPonte(perfil, pistas, LUIS_I, { ferro, pedra, corLuz: [1, 0.8, 0.5], leve });
  const arrabida = criarPonte(perfil, pistas, ARRABIDA, { ferro: betao, pedra: null, corLuz: [0.85, 0.9, 1], leve });
  const casario = criarCasario(perfil, pistas, leve);
  const cidade = criarCidade(perfil, pistas, leve);
  const pista = criarPista(perfil, pistas, leve);
  const lanternas = criarLanternas(leve);
  const fogo = criarFogo(leve);
  const grupo = new THREE.Group();
  grupo.name = 'porto-noite';
  grupo.add(luisI.grupo, arrabida.grupo, casario, cidade, pista, lanternas.pontos, fogo.pontos);
  geografia.add(grupo);
  return {
    grupo,
    pontes: [{ ...luisI, brilho: 0.55 }, { ...arrabida, brilho: 0.25 }],
    materiais: { pedra },
    casario,
    cidade,
    pista,
    lanternas,
    fogo,
    eixos: eixosDoRio(perfil.rio, LUIS_I.x),
  };
}

const PALETA_FOGO = [[1, 0.35, 0.25], [1, 0.8, 0.35], [0.5, 0.75, 1], [0.7, 1, 0.55], [1, 0.5, 0.9], [1, 1, 1]];

function rebentar(fogo, eixos) {
  const { rnd } = fogo;
  const { centro, montante, norte } = eixos;
  // Sobre a água, entre a ponte e a Ribeira (as barcaças do São João).
  const ao = 150 - rnd() * 1300;
  const lado = (rnd() - 0.5) * 120;
  const cx = centro.x + montante.x * ao + norte.x * lado;
  const cz = centro.z + montante.z * ao + norte.z * lado;
  const cy = 150 + rnd() * 90;
  const [r, g, b] = PALETA_FOGO[Math.floor(rnd() * PALETA_FOGO.length)];
  const cintila = rnd() < 0.5;
  const inicio = fogo.slot * fogo.porRebentamento;
  for (let i = 0; i < fogo.porRebentamento; i++) {
    const u = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const v = 22 + rnd() * 14;
    Object.assign(fogo.particulas[inicio + i], {
      x: cx, y: cy, z: cz, vx: s * Math.cos(a) * v, vy: u * v, vz: s * Math.sin(a) * v,
      vida: 2 + rnd() * 1, cintila, r, g, b,
    });
  }
  fogo.slot = (fogo.slot + 1) % fogo.slots;
  fogo.proximo = 2 + rnd() * 5;
}

function acender(obj, opacidade) {
  obj.visible = opacidade > 0.01;
  obj.material.opacity = opacidade;
}

/**
 * Por frame: acende com a noite (`luzes` de 0 a 1, da paleta do céu), sobe as
 * lanternas com o vento (no referencial do mundo) e anima o fogo. Com dt = 0
 * (pausa) tudo fica parado.
 */
export function actualizarPortoNoite(porto, dt, { luzes = 1, vento = { x: 0, z: 0 } } = {}) {
  if (!porto) return;
  const noite = Math.max(0, Math.min(1, luzes));
  for (const p of porto.pontes) {
    acender(p.luzes, noite);
    p.material.emissiveIntensity = p.brilho * noite;
  }
  porto.materiais.pedra.emissiveIntensity = 0.35 * noite;
  // De noite as casas vêem-se pela luz própria (janelas e fachadas), não pela do céu.
  porto.casario.material.emissiveIntensity = noite;
  porto.casario.material.color.setScalar(1 - 0.7 * noite);
  acender(porto.cidade, 0.95 * noite);
  acender(porto.pista, noite);
  acender(porto.lanternas.pontos, noite);
  porto.fogo.pontos.visible = noite > 0.01;

  const { centro, montante, norte } = porto.eixos;
  const l = porto.lanternas;
  const pos = l.pontos.geometry.attributes.position;
  const aoVento = (vento.x * montante.x + vento.z * montante.z) * 0.5;
  const ladoVento = (vento.x * norte.x + vento.z * norte.z) * 0.5;
  l.dados.forEach((d, i) => {
    d.y += d.sobe * dt;
    d.ao += aoVento * dt;
    d.lado += ladoVento * dt;
    if (d.y > ALTURA_MAX_LANTERNA_M) Object.assign(d, { y: 4, ao: -l.rnd() * 1300, lado: (l.rnd() - 0.3) * 500 });
    pos.setXYZ(i, centro.x + montante.x * d.ao + norte.x * d.lado, d.y, centro.z + montante.z * d.ao + norte.z * d.lado);
  });
  pos.needsUpdate = true;

  const fogo = porto.fogo;
  if (dt <= 0) return;
  fogo.relogio += dt;
  fogo.proximo -= dt;
  if (noite > 0.6 && fogo.proximo <= 0) rebentar(fogo, porto.eixos);
  const fp = fogo.pontos.geometry.attributes.position;
  const fc = fogo.pontos.geometry.attributes.color;
  const travao = Math.exp(-1.1 * dt);
  fogo.particulas.forEach((p, i) => {
    if (p.vida <= 0) {
      fc.setXYZ(i, 0, 0, 0);
      return;
    }
    p.vida -= dt;
    p.vx *= travao;
    p.vz *= travao;
    p.vy = p.vy * travao - 9.8 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    const brilho = Math.max(0, Math.min(1, p.vida / 1.2)) * noite * (p.cintila && p.vida < 1 ? 0.5 + 0.5 * Math.sin(fogo.relogio * 40 + i) : 1);
    fp.setXYZ(i, p.x, p.y, p.z);
    fc.setXYZ(i, p.r * brilho, p.g * brilho, p.b * brilho);
  });
  fp.needsUpdate = true;
  fc.needsUpdate = true;
}
