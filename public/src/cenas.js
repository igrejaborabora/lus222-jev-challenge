import * as THREE from 'three';
import { planoBando } from './bando.js';

function mat(color, extras = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extras });
}

function ladoTapado(o) {
  const esq = Number(o?.folga_pela_esquerda_m ?? 0);
  const dir = Number(o?.folga_pela_direita_m ?? 0);
  if (esq < dir) return -1;
  if (dir < esq) return 1;
  return 0;
}

function texturaJanelas() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#343b44';
  ctx.fillRect(0, 0, 64, 128);
  for (let y = 3; y < 128; y += 9) {
    for (let x = 3; x < 64; x += 8) {
      const acesa = (x * 3 + y * 5) % 17 === 0;
      ctx.fillStyle = acesa ? '#e4c48a' : '#141a22';
      ctx.fillRect(x, y, 4, 5);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 6);
  return tex;
}

function letreiro(texto, w, h) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1c2430';
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = '#f4f1ea';
  ctx.font = '600 64px "IBM Plex Sans", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }),
  );
  return mesh;
}

function torre({ x, z, w, d, h, pedra, vidro }) {
  const g = new THREE.Group();
  const h1 = h * 0.58;
  const h2 = h * 0.27;
  const h3 = h * 0.15;
  const base = new THREE.Mesh(new THREE.BoxGeometry(w, h1, d), pedra);
  base.position.y = h1 / 2;
  const meio = new THREE.Mesh(new THREE.BoxGeometry(w * 0.74, h2, d * 0.74), vidro);
  meio.position.y = h1 + h2 / 2;
  const topo = new THREE.Mesh(new THREE.BoxGeometry(w * 0.4, h3, d * 0.4), pedra);
  topo.position.y = h1 + h2 + h3 / 2;
  const antena = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 5), mat(0x1a1c1e));
  antena.position.y = h + 3.2;
  g.add(base, meio, topo, antena);
  if (h < 100) {
    const tanque = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 2.4, 8), mat(0x5c5348));
    tanque.position.y = h + 1.4;
    g.add(tanque);
  }
  g.position.set(x, 0, z);
  return g;
}

const TORRES = [
  { x: -24, z: -78, w: 16, d: 18, h: 72 },
  { x: -30, z: -28, w: 18, d: 22, h: 118 },
  { x: -22, z: 24, w: 14, d: 16, h: 84 },
  { x: -32, z: 78, w: 20, d: 24, h: 146 },
  { x: -24, z: 132, w: 16, d: 18, h: 96 },
  { x: 26, z: -64, w: 18, d: 20, h: 128 },
  { x: 22, z: -8, w: 14, d: 18, h: 76 },
  { x: 32, z: 42, w: 22, d: 20, h: 158 },
  { x: 24, z: 98, w: 16, d: 16, h: 92 },
  { x: 28, z: 154, w: 18, d: 22, h: 134 },
];

const BLOCOS = [
  { x: -16, z: -48, w: 12, d: 14, h: 24 },
  { x: 15, z: 8, w: 11, d: 12, h: 18 },
  { x: -15, z: 52, w: 12, d: 16, h: 28 },
  { x: 16, z: 68, w: 10, d: 12, h: 22 },
];

/** Canyon tipo Nova Iorque: rua, quarteirões e torres à frente do nariz. y=0 é a rua. */
export function criarCanyon(p, o, leve, opcoes = {}) {
  const g = new THREE.Group();
  g.rotation.y = p.rumo ?? 0;
  const aperto = opcoes.aperto ? 0.55 : 1;
  const pedra = mat(0x6b655c);
  const pedra2 = mat(0x4e4840);
  const vidro = new THREE.MeshLambertMaterial({ color: 0xd5dde6, map: texturaJanelas() });
  const lista = leve ? TORRES.filter((_, i) => i % 2 === 0) : TORRES;
  lista.forEach((t, i) => {
    g.add(torre({ ...t, x: t.x * aperto, pedra: i % 2 ? pedra2 : pedra, vidro }));
  });
  const blocos = leve ? BLOCOS.slice(0, 2) : BLOCOS;
  for (const b of blocos) g.add(torre({ ...b, x: b.x * aperto, pedra: pedra2, vidro }));
  if (opcoes.aperto) {
    g.add(torre({ x: -11, z: 40, w: 14, d: 16, h: 118, pedra, vidro }));
    g.add(torre({ x: 12, z: 86, w: 16, d: 18, h: 140, pedra: pedra2, vidro }));
    if (!leve) g.add(torre({ x: -12, z: 132, w: 14, d: 15, h: 96, pedra, vidro }));
  }

  if (o?.em_rota) {
    const lado = ladoTapado(o);
    const h = Math.max(96, Math.min(150, p.altura || 120));
    const piv = new THREE.Group();
    piv.add(torre({ x: lado * 6, z: -6, w: 16, d: 18, h, pedra, vidro }));
    g.add(piv);
    g.userData.hero = piv;
  }

  const placa = new THREE.Mesh(new THREE.BoxGeometry(210, 0.3, 340), mat(0x2a312c));
  placa.position.set(0, 0.05, 28);
  const rua = new THREE.Mesh(new THREE.BoxGeometry(26, 0.25, 320), mat(0x2c3136));
  rua.position.set(0, 0.28, 24);
  g.add(placa, rua);
  for (const sx of [-15.5, 15.5]) {
    const passeio = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.28, 320), mat(0x6a645c));
    passeio.position.set(sx, 0.32, 24);
    g.add(passeio);
  }
  const nTracos = leve ? 8 : 14;
  for (let i = 0; i < nTracos; i++) {
    const traco = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.08, 7), mat(0xd2b15a));
    traco.position.set(0, 0.46, -90 + i * 18);
    g.add(traco);
  }
  for (const z of [-40, 36, 112]) {
    const cruz = new THREE.Mesh(new THREE.BoxGeometry(70, 0.08, 14), mat(0x23282c));
    cruz.position.set(0, 0.44, z);
    g.add(cruz);
  }
  g.userData.kind = 'canyon';
  return g;
}

/** Ave legível: corpo roliço, asas curtas com diedro. A ponta fica dentro do raio de planoBando. */
function criarAve(cor) {
  const g = new THREE.Group();
  const corpo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 8, 6), mat(cor));
  corpo.scale.set(0.72, 0.58, 1.35);
  const bico = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.26, 5), mat(0xc4a574));
  bico.rotation.x = Math.PI / 2;
  bico.position.set(0, 0.02, 0.52);
  const pivL = new THREE.Group();
  const pivR = new THREE.Group();
  pivL.position.set(-0.16, 0.08, 0.02);
  pivR.position.set(0.16, 0.08, 0.02);
  const asaL = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.34), mat(cor));
  asaL.position.set(-0.46, 0, 0);
  asaL.rotation.z = 0.22;
  const asaR = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.34), mat(cor));
  asaR.position.set(0.46, 0, 0);
  asaR.rotation.z = -0.22;
  pivL.add(asaL);
  pivR.add(asaR);
  const cauda = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.045, 0.4), mat(cor));
  cauda.position.set(0, 0.06, -0.46);
  g.add(corpo, bico, pivL, pivR, cauda);
  return { g, pivL, pivR };
}

const CORES_AVE = [0x14171b, 0x1c1814, 0x2a241c, 0x101418, 0x3a332c, 0x1a1e24];

function aerodromo() {
  const g = new THREE.Group();
  const relva = new THREE.Mesh(new THREE.BoxGeometry(150, 0.4, 260), mat(0x6a7544));
  relva.position.set(0, 0.1, 10);
  const pista = new THREE.Mesh(new THREE.BoxGeometry(16, 0.25, 220), mat(0x3a3e42));
  pista.position.set(0, 0.4, 16);
  g.add(relva, pista);
  for (let i = 0; i < 10; i++) {
    const marca = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 8), mat(0xe6e2d6));
    marca.position.set(0, 0.58, -70 + i * 18);
    g.add(marca);
  }
  const numero = letreiro('01', 6, 1.6);
  numero.rotation.x = -Math.PI / 2;
  numero.position.set(0, 0.62, -88);
  g.add(numero);
  for (const side of [-1, 1]) {
    const hangar = new THREE.Group();
    const corpo = new THREE.Mesh(new THREE.BoxGeometry(22, 8, 16), mat(0x8a7358));
    corpo.position.y = 4;
    const tecto = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 22, 10, 1, false, 0, Math.PI), mat(0x5c4e40));
    tecto.rotation.z = Math.PI / 2;
    tecto.position.y = 8;
    hangar.add(corpo, tecto);
    hangar.position.set(side * 28, 0, side < 0 ? -20 : 24);
    g.add(hangar);
  }
  const mastro = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.18, 10, 6), mat(0x2a2e32));
  mastro.position.set(22, 5, -55);
  const manga = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.2, 6), mat(0xc4553a));
  manga.rotation.z = -Math.PI / 2;
  manga.position.set(24.2, 9.2, -55);
  const placa = letreiro('PONTE DE SOR', 16, 3.2);
  placa.position.set(-34, 6, -6);
  g.add(mastro, manga, placa);
  return g;
}

/** +1 = esquerda do ecrã. O ladoTapado das torres fica no referencial antigo dos dados. */
function ladoEcra(o) {
  const esq = Number(o?.folga_pela_esquerda_m ?? 0);
  const dir = Number(o?.folga_pela_direita_m ?? 0);
  if (esq < dir) return 1;
  if (dir < esq) return -1;
  return 0;
}

/** Bando em Ponte de Sor — aves soltas à altitude de voo, pista da FAL por baixo. */
export function criarAves(p, o, leve, opcoes = {}) {
  const g = new THREE.Group();
  g.rotation.y = p.rumo ?? 0;
  if (opcoes.solo !== false) {
    const solo = aerodromo();
    solo.position.set(0, -18, -24);
    g.add(solo);
  }
  const plano = planoBando({
    n: leve ? 12 : 16,
    ladoEcra: ladoEcra(o),
    corredorX: Number(opcoes.corredorX) || 0,
  });
  const birds = [];
  for (let i = 0; i < plano.length; i++) {
    const slot = plano[i];
    const ave = criarAve(CORES_AVE[i % CORES_AVE.length]);
    ave.g.position.set(slot.x, slot.y, slot.z);
    ave.g.scale.setScalar(slot.escala);
    ave.g.rotation.y = slot.yaw;
    g.add(ave.g);
    birds.push({
      g: ave.g,
      pivL: ave.pivL,
      pivR: ave.pivR,
      baseY: slot.y,
      rate: slot.rate,
      phase: slot.phase,
      yaw: slot.yaw,
      speed: 0,
    });
  }
  g.userData.kind = 'aves';
  g.userData.birds = birds;
  return g;
}

function helices(x, y, z, raio) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const pa = new THREE.Mesh(new THREE.BoxGeometry(0.12, raio * 2, 0.16), mat(0x1a1c1e));
  const pb = pa.clone();
  pb.rotation.z = Math.PI / 2;
  const disco = new THREE.Mesh(
    new THREE.CircleGeometry(raio * 0.92, 14),
    mat(0x2a2e33, { transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
  );
  disco.position.z = 0.05;
  pivot.add(pa, pb, disco);
  return pivot;
}

function bimotor(cor, listras) {
  const g = new THREE.Group();
  const props = [];
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.66, 9.2, 12), mat(cor));
  fus.rotation.x = Math.PI / 2;
  const nariz = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), mat(0x1e2a28));
  nariz.scale.set(1, 0.85, 1.3);
  nariz.position.z = 4.7;
  const asa = new THREE.Mesh(new THREE.BoxGeometry(22, 0.16, 3.3), mat(cor));
  asa.position.set(0, -0.15, 0.4);
  const barriga = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 6), mat(0xc2b8a4));
  barriga.position.set(0, -0.7, 0.2);
  g.add(fus, nariz, asa, barriga);
  for (const side of [-1, 1]) {
    const nacele = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.62, 1.5, 10), mat(0x2a2622));
    nacele.rotation.x = Math.PI / 2;
    nacele.position.set(side * 4.3, -0.15, 1.5);
    g.add(nacele);
    const prop = helices(side * 4.3, -0.15, 2.35, 1.35);
    g.add(prop);
    props.push(prop);
  }
  const stab = new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.12, 1.5), mat(cor));
  stab.position.set(0, 0.35, -4.3);
  g.add(stab);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.15, 1.15), mat(cor));
    fin.position.set(side * 2.15, 1.35, -4.35);
    g.add(fin);
  }
  if (listras) {
    for (let i = 0; i < 3; i++) {
      const faixa = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.2, 0.35), mat(i % 2 ? 0x111111 : 0xe8e4dc));
      faixa.position.set((i - 1) * 2.4, 0.02, 0.5);
      g.add(faixa);
    }
  }
  return { g, props };
}

function asaAlta(cor) {
  const g = new THREE.Group();
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.5, 7.4, 10), mat(cor));
  fus.rotation.x = Math.PI / 2;
  const asa = new THREE.Mesh(new THREE.BoxGeometry(16.5, 0.14, 2.35), mat(cor));
  asa.position.set(0, 1.15, 0.15);
  const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 1.15, 10), mat(0x241e1a));
  motor.rotation.x = Math.PI / 2;
  motor.position.set(0, 0.05, 3.5);
  const cabine = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 1.1), mat(0x152028));
  cabine.position.set(0, 0.55, 1.6);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.7, 1.2), mat(cor));
  fin.position.set(0, 0.9, -3.35);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.1, 1.15), mat(cor));
  stab.position.set(0, 0.35, -3.3);
  g.add(fus, asa, motor, cabine, fin, stab);
  for (const side of [-1, 1]) {
    const escora = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.15, 0.08), mat(0x2a2a2a));
    escora.position.set(side * 2.4, 0.55, 0.1);
    const perna = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 5), mat(0x1a1a1a));
    perna.position.set(side * 1.3, -0.85, 0.3);
    const roda = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.1, 8), mat(0x111111));
    roda.rotation.z = Math.PI / 2;
    roda.position.set(side * 1.3, -1.45, 0.3);
    g.add(escora, perna, roda);
  }
  const prop = helices(0, 0.05, 4.15, 1.25);
  g.add(prop);
  return { g, props: [prop] };
}

const FORMACAO = [
  { tipo: 'bimotor', cor: 0x6d7a42, listras: true, x: 0, y: 1, z: -16, yaw: 0.08, speed: 0, escala: 4.4 },
  { tipo: 'bimotor', cor: 0xd2c4a4, listras: false, x: -34, y: 3, z: -4, yaw: Math.PI / 2, speed: 14, escala: 3.6 },
  { tipo: 'asaAlta', cor: 0xa89462, x: 22, y: -2, z: 6, yaw: -0.2, speed: 0, escala: 3.5 },
  { tipo: 'bimotor', cor: 0x4a5534, listras: false, x: -18, y: 7, z: 36, yaw: 0.22, speed: 0, escala: 2.8 },
  { tipo: 'asaAlta', cor: 0x2e3424, x: 12, y: 5, z: 58, yaw: -0.08, speed: 0, escala: 2.6 },
];

/** Bimotores e asa alta de época — não são o LUS-222. */
export function criarGuerra(p, o, leve) {
  const g = new THREE.Group();
  g.rotation.y = p.rumo ?? 0;
  const lado = ladoTapado(o);
  const bloqueia = Boolean(o?.em_rota);
  const specs = (leve ? FORMACAO.slice(0, 3) : FORMACAO).map((s, i) => {
    const copia = { ...s };
    if (bloqueia && i === 0) copia.x = lado * 4;
    if (bloqueia && i === 1) {
      copia.x = lado * 28;
      copia.yaw = lado < 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (!bloqueia && i === 0) copia.x = 18;
    return copia;
  });
  const avioes = [];
  specs.forEach((s, i) => {
    const pl = s.tipo === 'bimotor' ? bimotor(s.cor, s.listras) : asaAlta(s.cor);
    pl.g.position.set(i === 0 ? 0 : s.x, s.y, s.z);
    pl.g.rotation.y = s.yaw;
    pl.g.scale.setScalar(s.escala);
    if (i === 0) {
      const piv = new THREE.Group();
      piv.position.x = s.x;
      piv.add(pl.g);
      g.add(piv);
      g.userData.hero = piv;
      g.userData.heroBaseX = s.x;
    } else {
      g.add(pl.g);
    }
    avioes.push({ group: pl.g, props: pl.props, yaw: s.yaw, speed: s.speed });
  });
  g.userData.kind = 'guerra';
  g.userData.avioes = avioes;
  return g;
}
