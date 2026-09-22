import * as THREE from 'three';
import { criarAves, criarCanyon, criarGuerra } from './cenas.js';
import { offsetLateral, pontoAmeaca } from './decisao.js';

export function perfilGraficoLeve() {
  if (typeof window === 'undefined') return true;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    window.matchMedia('(max-width: 720px)').matches ||
    (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4)
  );
}

function mat(color, extras = {}) {
  return new THREE.MeshLambertMaterial({ color, ...extras });
}

function textoDecalque(texto, { w = 512, h = 128, fill = '#f4f6f8', bg = null, size = 72 } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (bg) {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
  } else {
    ctx.clearRect(0, 0, w, h);
  }
  ctx.fillStyle = fill;
  ctx.font = `600 ${size}px "IBM Plex Sans", system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function placa(texto, w, h, opts) {
  const geo = new THREE.PlaneGeometry(w, h);
  const map = textoDecalque(texto, opts);
  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshBasicMaterial({ map, transparent: true, side: THREE.DoubleSide, depthWrite: false }),
  );
  return mesh;
}

function latheMesh(pares, material, segs = 16) {
  const perfil = pares[0][1] > pares[pares.length - 1][1] ? [...pares].reverse() : pares;
  const geo = new THREE.LatheGeometry(
    perfil.map(([r, s]) => new THREE.Vector2(r, s)),
    segs,
  );
  const mesh = new THREE.Mesh(geo, material);
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function extrudeMesh(shape, depth, material, bevel = 0) {
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 8,
    steps: 1,
  });
  return new THREE.Mesh(geo, material);
}

function painelCurvo(cantos, raio, material) {
  const vertices = [];
  const indices = [];
  const n = 12;
  for (let row = 0; row <= n; row++) {
    const v = row / n;
    for (let col = 0; col <= n; col++) {
      const u = col / n;
      const baixo = {
        a: cantos[0].a + (cantos[1].a - cantos[0].a) * u,
        z: cantos[0].z + (cantos[1].z - cantos[0].z) * u,
      };
      const cima = {
        a: cantos[3].a + (cantos[2].a - cantos[3].a) * u,
        z: cantos[3].z + (cantos[2].z - cantos[3].z) * u,
      };
      const a = baixo.a + (cima.a - baixo.a) * v;
      const z = baixo.z + (cima.z - baixo.z) * v;
      const r = raio(z) + 0.06;
      vertices.push(Math.sin(a) * r, Math.cos(a) * r, z);
    }
  }
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const i = row * (n + 1) + col;
      indices.push(i, i + 1, i + n + 1, i + 1, i + n + 2, i + n + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

function painelCabine(side, zFrente, material) {
  const cantos = [
    [0.12, 0.48], [0.64, 0.42], [0.7, 0.75], [0.14, 0.85],
  ];
  const vertices = [];
  const indices = [];
  const n = 5;
  for (let row = 0; row <= n; row++) {
    const v = row / n;
    for (let col = 0; col <= n; col++) {
      const u = col / n;
      const baixoX = cantos[0][0] + (cantos[1][0] - cantos[0][0]) * u;
      const baixoY = cantos[0][1] + (cantos[1][1] - cantos[0][1]) * u;
      const cimaX = cantos[3][0] + (cantos[2][0] - cantos[3][0]) * u;
      const cimaY = cantos[3][1] + (cantos[2][1] - cantos[3][1]) * u;
      const x = baixoX + (cimaX - baixoX) * v;
      const y = baixoY + (cimaY - baixoY) * v;
      vertices.push(side * x, y, zFrente(Math.hypot(x, y)) + 0.04);
    }
  }
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const i = row * (n + 1) + col;
      indices.push(i, i + 1, i + n + 1, i + 1, i + n + 2, i + n + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

function janelaOval(material) {
  const s = new THREE.Shape();
  s.moveTo(-0.1, -0.17);
  s.quadraticCurveTo(-0.16, -0.17, -0.16, -0.08);
  s.lineTo(-0.16, 0.08);
  s.quadraticCurveTo(-0.16, 0.17, -0.1, 0.17);
  s.lineTo(0.1, 0.17);
  s.quadraticCurveTo(0.16, 0.17, 0.16, 0.08);
  s.lineTo(0.16, -0.08);
  s.quadraticCurveTo(0.16, -0.17, 0.1, -0.17);
  s.closePath();
  return new THREE.Mesh(new THREE.ShapeGeometry(s, 5), material);
}

function painelRampa(larguraFrente, larguraTras, desvioY, material) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([
    -larguraFrente / 2, -0.89 + desvioY, -4.62,
    larguraFrente / 2, -0.89 + desvioY, -4.62,
    -larguraTras / 2, -0.48 + desvioY, -6.03,
    larguraTras / 2, -0.48 + desvioY, -6.03,
  ], 3));
  geo.setIndex([0, 1, 2, 1, 3, 2]);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material);
}

/**
 * Interpretação leve do LUS-222 branco CS-001: nariz +Z, asa alta, dois
 * turboprops, cauda em T e trem triciclo fixo. Só decalques tipográficos.
 */
export function criarLus222() {
  const g = new THREE.Group();
  const white = mat(0xf3f5f7);
  const navy = mat(0x152033);
  const navyPaint = mat(0x152033, { side: THREE.DoubleSide });
  const dark = mat(0x1c1f24);
  const glass = new THREE.MeshBasicMaterial({ color: 0x111b23, side: THREE.DoubleSide });
  const tyre = mat(0x151515);
  const ramp = mat(0xc4c7cb, { side: THREE.DoubleSide });
  const perfil = [
    [0, 4.9], [0.36, 4.82], [0.68, 4.56], [0.91, 4.13],
    [1.01, 3.65], [1.05, 2.9], [1.07, 1.6], [1.06, 0.2],
    [1.04, -1.4], [0.98, -3.15], [0.91, -4.55],
    [0.74, -5.35], [0.49, -6.05], [0.18, -6.48], [0, -6.6],
  ];
  const raio = (z) => {
    for (let i = 1; i < perfil.length; i++) {
      const [r0, z0] = perfil[i - 1];
      const [r1, z1] = perfil[i];
      if (z >= z1) return r0 + (r1 - r0) * (z0 - z) / (z0 - z1);
    }
    return 0;
  };
  const zFrente = (r) => {
    for (let i = 1; i < perfil.length; i++) {
      const [r0, z0] = perfil[i - 1];
      const [r1, z1] = perfil[i];
      if (r <= r1) return z0 + (z1 - z0) * (r - r0) / (r1 - r0);
    }
    return perfil[5][1];
  };
  g.add(latheMesh(perfil, white, 24));

  // Os painéis seguem a curvatura do nariz, com o pilar central em branco.
  for (const side of [-1, 1]) {
    g.add(painelCurvo([
      { a: side * 2.2, z: -3.65 },
      { a: side * Math.PI, z: -3.65 },
      { a: side * Math.PI, z: -6.24 },
      { a: side * 0.55, z: -6.24 },
    ], raio, navyPaint));
    g.add(painelCabine(side, zFrente, glass));
    for (let i = 0; i < 7; i++) {
      const z = 1.55 - i * 0.7;
      const win = janelaOval(glass);
      win.position.set(side * (Math.sqrt(raio(z) ** 2 - 0.19 ** 2) + 0.025), 0.19, z);
      win.rotation.y = side * Math.PI / 2;
      g.add(win);
    }
  }

  // A envergadura e a posição dos motores seguem a proporção da vista frontal.
  const plano = new THREE.Shape();
  plano.moveTo(-7.05, 0.78);
  plano.lineTo(-7.05, -0.5);
  plano.lineTo(-0.55, -1.16);
  plano.lineTo(0.55, -1.16);
  plano.lineTo(7.05, -0.5);
  plano.lineTo(7.05, 0.78);
  plano.lineTo(0.55, 1.45);
  plano.lineTo(-0.55, 1.45);
  plano.closePath();
  const wing = extrudeMesh(plano, 0.18, white, 0.045);
  wing.geometry.rotateX(Math.PI / 2);
  wing.position.set(0, 1.29, 0.12);
  g.add(wing);

  const ponta = new THREE.Shape();
  ponta.moveTo(7.02, -0.5);
  ponta.lineTo(7.65, -0.44);
  ponta.quadraticCurveTo(7.88, -0.39, 7.89, -0.2);
  ponta.lineTo(7.89, 0.45);
  ponta.quadraticCurveTo(7.88, 0.66, 7.65, 0.73);
  ponta.lineTo(7.02, 0.78);
  ponta.closePath();
  const pontaDir = extrudeMesh(ponta, 0.18, navy, 0.035);
  pontaDir.geometry.rotateX(Math.PI / 2);
  pontaDir.position.set(0, 1.29, 0.12);
  const pontaEsq = pontaDir.clone();
  pontaEsq.scale.x = -1;
  g.add(pontaDir, pontaEsq);

  const fair = new THREE.Mesh(new THREE.SphereGeometry(0.75, 14, 10), white);
  fair.scale.set(1.13, 0.5, 1.55);
  fair.position.set(0, 1.02, 0.12);
  g.add(fair);

  const props = [];
  const pa = new THREE.Shape();
  pa.moveTo(-0.055, 0.12);
  pa.quadraticCurveTo(-0.19, 0.34, -0.16, 0.68);
  pa.quadraticCurveTo(-0.12, 0.96, -0.035, 1.04);
  pa.quadraticCurveTo(0.035, 1.08, 0.09, 0.99);
  pa.quadraticCurveTo(0.18, 0.64, 0.13, 0.34);
  pa.lineTo(0.055, 0.12);
  pa.closePath();
  const bladeGeo = new THREE.ShapeGeometry(pa, 6);
  const bladeMat = mat(0x1c1f24, { side: THREE.DoubleSide });
  const discMat = mat(0x2a2e33, { transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  for (const side of [-1, 1]) {
    const x = side * 2.66;
    const y = 0.77;
    const nacelle = latheMesh([
      [0, 2.17], [0.29, 2.08], [0.46, 1.83], [0.51, 1.38],
      [0.49, 0.68], [0.43, 0.04], [0.28, -0.75], [0, -1.08],
    ], white, 16);
    nacelle.position.set(x, y, 0);
    g.add(nacelle);

    const spinner = latheMesh([[0.24, 0], [0.24, 0.12], [0.16, 0.27], [0, 0.38]], white, 12);
    spinner.position.set(x, y, 2.18);
    g.add(spinner);

    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.04, 20), discMat);
    disc.position.set(x, y, 2.29);
    g.add(disc);

    const prop = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const blade = new THREE.Mesh(bladeGeo, bladeMat);
      blade.rotation.z = (i * Math.PI) / 2;
      prop.add(blade);
    }
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), dark);
    hub.scale.z = 1.25;
    prop.add(hub);
    prop.position.set(x, y, 2.34);
    g.add(prop);
    props.push(prop);
  }

  // Deriva em T: bordo de ataque ligeiramente recuado, topo arredondado, meia marinha.
  const deriva = new THREE.Shape();
  deriva.moveTo(-0.2, 0.02);
  deriva.lineTo(-1.22, 0.02);
  deriva.quadraticCurveTo(-1.38, 0.2, -1.02, 2.48);
  deriva.quadraticCurveTo(-0.52, 2.82, 0.18, 2.58);
  deriva.lineTo(0.52, 0.38);
  deriva.quadraticCurveTo(0.32, 0.02, -0.2, 0.02);
  const fin = extrudeMesh(deriva, 0.16, navy);
  fin.geometry.translate(0, 0, -0.08);
  fin.rotation.y = Math.PI / 2;
  fin.position.set(0, 0.52, -5.28);
  g.add(fin);

  const fillet = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.85, 1.25), navy);
  fillet.position.set(0, 0.72, -5.18);
  g.add(fillet);

  const cauda = new THREE.Shape();
  cauda.moveTo(-3.0, -0.68);
  cauda.lineTo(-0.55, -0.98);
  cauda.lineTo(0.55, -0.98);
  cauda.lineTo(3.0, -0.68);
  cauda.quadraticCurveTo(3.14, -0.62, 3.08, -0.43);
  cauda.lineTo(2.94, 0.19);
  cauda.lineTo(0.55, 0.48);
  cauda.lineTo(-0.55, 0.48);
  cauda.lineTo(-2.94, 0.19);
  cauda.quadraticCurveTo(-3.14, -0.43, -3.0, -0.68);
  const stab = extrudeMesh(cauda, 0.14, navy, 0.025);
  stab.geometry.rotateX(Math.PI / 2);
  stab.position.set(0, 3.28, -5.22);
  g.add(stab);

  // A rampa acompanha a inclinação do cone traseiro, sem criar uma placa saliente.
  const vinco = painelRampa(1.42, 0.62, -0.08, mat(0x313943, { side: THREE.DoubleSide }));
  const porta = painelRampa(1.31, 0.54, -0.1, ramp);
  g.add(vinco, porta);

  const antena = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.55, 5), dark);
  antena.position.set(0, 1.18, 2.15);
  g.add(antena);

  const lus = placa('LUS+222', 1.28, 0.36, { fill: '#f4f6f8', size: 70, w: 512, h: 140 });
  lus.position.set(0.11, 1.85, -5.32);
  lus.rotation.y = Math.PI / 2;
  const lus2 = lus.clone();
  lus2.position.x = -0.11;
  lus2.rotation.y = -Math.PI / 2;
  g.add(lus, lus2);

  const eea = placa('EEAIRCRAFT', 1.75, 0.17, { fill: '#152033', size: 64, w: 640, h: 120 });
  eea.position.set(1.09, 0.08, 2.85);
  eea.rotation.y = Math.PI / 2;
  const eea2 = eea.clone();
  eea2.position.x = -1.09;
  eea2.rotation.y = -Math.PI / 2;
  g.add(eea, eea2);

  const reg = placa('CS-001', 0.92, 0.15, { fill: '#152033', size: 68, w: 512, h: 120 });
  reg.position.set(1.04, -0.18, -2.65);
  reg.rotation.y = Math.PI / 2;
  const reg2 = reg.clone();
  reg2.position.x = -1.04;
  reg2.rotation.y = -Math.PI / 2;
  g.add(reg, reg2);

  const strutGeo = new THREE.CylinderGeometry(0.055, 0.07, 1.14, 8);
  const wheelNoseGeo = new THREE.CylinderGeometry(0.23, 0.23, 0.12, 12);
  const wheelMainGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.16, 12);
  const hubGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.15, 12);
  const leg = (x, y, z, wheelGeo) => {
    const strut = new THREE.Mesh(strutGeo, dark);
    strut.position.set(x, y, z);
    g.add(strut);
    const wheel = new THREE.Mesh(wheelGeo, tyre);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y - 0.64, z);
    g.add(wheel);
    const hub = new THREE.Mesh(hubGeo, ramp);
    hub.rotation.z = Math.PI / 2;
    hub.position.copy(wheel.position);
    g.add(hub);
  };
  leg(0, -0.96, 3.2, wheelNoseGeo);
  leg(1.18, -0.99, -0.65, wheelMainGeo);
  leg(-1.18, -0.99, -0.65, wheelMainGeo);

  g.userData.props = props;
  g.scale.set(1.35, 1.35, 1.35);
  return g;
}

function ceuDe(cenario) {
  switch (cenario) {
    case 'porto':
      return { top: 0x29364b, fog: 0x566071, hemi: 0xe1b6a4, dir: 0xffbb80 };
    case 'sar':
      return { top: 0x2a3c58, fog: 0x3a4e68, hemi: 0xb7c6d4, dir: 0xffd2a8 };
    case 'medevac':
      return { top: 0x4d6a82, fog: 0x6a8496, hemi: 0xc5d4de, dir: 0xf0e6d0 };
    case 'carga':
      return { top: 0x3d7ec9, fog: 0x6ea0d4, hemi: 0xd7e8ff, dir: 0xfff4dc };
    default: {
      const _x = cenario;
      void _x;
      return { top: 0x3d7ec9, fog: 0x6ea0d4, hemi: 0xd7e8ff, dir: 0xfff4dc };
    }
  }
}

function campoFal(leve) {
  const g = new THREE.Group();
  const relva = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), mat(0x6d7a46));
  relva.rotation.x = -Math.PI / 2;
  relva.position.y = -0.6;
  g.add(relva);
  const pista = new THREE.Mesh(new THREE.BoxGeometry(22, 0.3, 420), mat(0x3e4348));
  pista.position.set(40, -0.2, -80);
  g.add(pista);
  const n = leve ? 4 : 8;
  for (let i = 0; i < n; i++) {
    const seara = new THREE.Mesh(new THREE.BoxGeometry(80, 0.2, 36), mat(i % 2 ? 0x8a7a40 : 0x5e6a38));
    seara.position.set(-180 + (i % 4) * 90, -0.35, -200 + Math.floor(i / 4) * 80);
    g.add(seara);
  }
  return g;
}

function portoNoite(leve) {
  const g = new THREE.Group();
  const solo = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), mat(0x29363a));
  solo.rotation.x = -Math.PI / 2;
  solo.position.y = -0.8;
  g.add(solo);
  const asfalto = mat(0x1d2832);
  const luz = new THREE.MeshBasicMaterial({ color: 0xffd397 });
  const brilho = new THREE.MeshBasicMaterial({ color: 0xffecb6 });
  // A escala visual da pista é ampliada para ser legível na câmara de missão.
  const pista = new THREE.Mesh(new THREE.BoxGeometry(17, 0.25, 160), asfalto);
  pista.position.set(0, -0.4, 665);
  g.add(pista);
  for (let i = 0; i < 19; i++) {
    const z = 590 + i * 8;
    if (i % 2 === 0) {
      const marca = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 3.2), brilho);
      marca.position.set(0, -0.16, z);
      g.add(marca);
    }
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.6, 6, 5), luz);
      lamp.position.set(side * 9.2, 0.3, z);
      g.add(lamp);
    }
  }
  const n = leve ? 28 : 70;
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * (36 + (i * 37) % 280);
    const z = -80 + (i * 97) % 920;
    const h = 3 + (i * 13) % 18;
    const bloco = new THREE.Mesh(new THREE.BoxGeometry(5 + i % 6, h, 5 + (i * 3) % 9), mat(i % 3 ? 0x303c43 : 0x3f4647));
    bloco.position.set(x, h / 2 - 0.4, z);
    const janela = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.4, 0.2), luz);
    janela.position.set(x, h * 0.55, z + 4.6);
    g.add(bloco, janela);
  }
  return g;
}

function ilha(leve) {
  const g = new THREE.Group();
  const land = mat(0x6b7a4e);
  const sand = mat(0xb59a6a);
  const dirt = mat(0x7a5a38);
  const rock = mat(0x5a5e58);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(220, 260, 10, leve ? 10 : 20), land);
  body.position.set(30, -6, -40);
  g.add(body);

  const beach = new THREE.Mesh(new THREE.CylinderGeometry(250, 280, 3, leve ? 10 : 18), sand);
  beach.position.set(30, -10.2, -40);
  g.add(beach);

  const strip = new THREE.Mesh(new THREE.BoxGeometry(18, 0.4, 140), dirt);
  strip.position.set(-10, -0.4, 10);
  strip.rotation.y = 0.18;
  g.add(strip);

  const marks = 6;
  for (let i = 0; i < marks; i++) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.42, 8), mat(0xe8d8b0));
    dash.position.set(-10 + i * 0.4, -0.18, 50 - i * 18);
    dash.rotation.y = 0.18;
    g.add(dash);
  }

  const n = leve ? 4 : 9;
  for (let i = 0; i < n; i++) {
    const h = 8 + (i % 4) * 5;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(16 + i * 2, h, 6), rock);
    hill.position.set(-40 + i * 28, h / 2 - 4, -90 - (i % 3) * 20);
    g.add(hill);
  }

  return g;
}

function limparGrupo(grupo) {
  if (!grupo) return;
  while (grupo.children.length) {
    const c = grupo.children[0];
    grupo.remove(c);
    c.traverse((o) => {
      o.geometry?.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        m.map?.dispose?.();
        m.dispose?.();
      }
    });
  }
}

function anelChao(cor) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(10, 16, 28),
    new THREE.MeshBasicMaterial({ color: cor, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.4;
  return ring;
}

function meshAmeaca(o, pose, leve) {
  const p = pontoAmeaca(pose, o);
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  g.userData.visual = p.visual;

  switch (p.visual) {
    case 'canyon':
    case 'aves':
    case 'guerra': {
      const construir = {
        canyon: criarCanyon,
        aves: criarAves,
        guerra: criarGuerra,
      }[p.visual];
      const opcoes = p.visual === 'aves' ? { corredorX: offsetLateral(o) } : {};
      const cena = construir(p, o, leve, opcoes);
      g.add(cena);
      g.userData.ancora = cena;
      g.userData.obstaculo = o;
      g.userData.rumo0 = numHeading(pose);
      if (cena.userData.birds) g.userData.birds = cena.userData.birds;
      if (cena.userData.avioes) g.userData.avioes = cena.userData.avioes;
      break;
    }
    case 'torre': {
      const h = p.altura;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.6, h, 8), mat(0x2a2e33));
      mast.position.y = h / 2;
      const beacon = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xff3b3b, emissive: 0xff2222, emissiveIntensity: 0.9 }),
      );
      beacon.position.y = h + 0.6;
      g.add(mast, beacon, anelChao(0xe07a4a));
      g.userData.beacon = beacon;
      break;
    }
    case 'relevo': {
      const h = p.altura;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(24, h, 7), mat(0x5a5e58));
      hill.position.y = h / 2 - 2;
      g.add(hill, anelChao(0xc4a574));
      break;
    }
    case 'trafego': {
      const alt = Math.max(28, p.y || 42);
      const body = new THREE.Mesh(new THREE.BoxGeometry(10, 1.4, 12), mat(0xe8c36a));
      body.position.y = alt;
      const wing = new THREE.Mesh(new THREE.BoxGeometry(20, 0.25, 3.4), mat(0xf0d48a));
      wing.position.y = alt;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 2.2), mat(0x1a2744));
      fin.position.set(0, alt + 1.6, -5);
      g.add(body, wing, fin, anelChao(0xe8c36a));
      g.rotation.y = p.heading;
      g.userData.trafego = { heading: p.heading, speed: 28 };
      break;
    }
    case 'baloes': {
      const cores = [0xffa65d, 0xf7d394, 0xdf775e, 0xe8b875];
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 11;
        const y = (p.y || 42) + (i % 2 ? 6 : -3);
        const z = (i % 2) * 9;
        const envelope = new THREE.Mesh(new THREE.SphereGeometry(3.4, 10, 8), new THREE.MeshLambertMaterial({ color: cores[i], emissive: cores[i], emissiveIntensity: 0.3 }));
        envelope.scale.set(0.85, 1.35, 0.85);
        envelope.position.set(x, y, z);
        const chama = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffdb8e }));
        chama.position.set(x, y - 5, z);
        g.add(envelope, chama);
      }
      break;
    }
    case 'meteo': {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(110, 78, 22),
        new THREE.MeshLambertMaterial({ color: 0x8aa0b8, transparent: true, opacity: 0.48 }),
      );
      wall.position.y = 38;
      g.add(wall, anelChao(0x8aa0b8));
      break;
    }
    case 'cabo': {
      const h = p.altura;
      for (const side of [-18, 18]) {
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, h, 6), mat(0x2a2e33));
        pole.position.set(side, h / 2, 0);
        g.add(pole);
      }
      const wire = new THREE.Mesh(new THREE.BoxGeometry(36, 0.18, 0.18), mat(0x151515));
      wire.position.y = h * 0.86;
      g.add(wire, anelChao(0xe07a4a));
      break;
    }
    default: {
      const _x = p.visual;
      void _x;
      const mark = new THREE.Mesh(new THREE.SphereGeometry(6, 10, 8), mat(0xe07a4a));
      mark.position.y = 8;
      g.add(mark, anelChao(0xe07a4a));
      break;
    }
  }

  return g;
}

export function mostrarAmeacas(mundo, obstaculos, pose) {
  if (!mundo?.ameaças) return;
  const local = { ...pose, x: pose.x - mundo.origemVisual.x, z: pose.z - mundo.origemVisual.z };
  limparGrupo(mundo.ameaças);
  mundo.alvoLook = null;
  const lista = (Array.isArray(obstaculos) ? obstaculos : []).filter((o) => o && o.em_rota)
    .map((o) => ({ ...o, distancia_m: Math.max(25, o.distancia_m / 15) }));
  for (const o of lista) {
    mundo.ameaças.add(meshAmeaca(o, local, mundo.leve));
  }
  const foco = lista[0];
  if (foco) mundo.alvoLook = pontoAmeaca(local, foco);
  // Uma vez, no instante do incidente: a malha fica no mundo e o avião
  // aproxima-se. Repetir isto em cada frame cola a ameaça ao nariz.
  ancorarVisuais(mundo, local);
}

function numHeading(pose) {
  const h = Number(pose?.heading);
  return Number.isFinite(h) ? h : 0;
}

/** Mantém canyon, bando e formação à frente do nariz e à altitude do LUS-222. */
export function ancorarVisuais(mundo, pose) {
  if (!mundo?.ameaças || !pose) return;
  const h = numHeading(pose);
  const y = Number.isFinite(Number(pose.y)) ? Number(pose.y) : 42;
  for (const child of mundo.ameaças.children) {
    const ancora = child.userData.ancora;
    const o = child.userData.obstaculo;
    if (!ancora || !o) continue;
    const p = pontoAmeaca(pose, o);
    child.position.set(p.x, 0, p.z);
    ancora.rotation.y = h;
    ancora.position.y = ancora.userData.kind === 'canyon' ? y - 16 : y;
    const hero = ancora.userData.hero;
    if (!hero) continue;
    const base = Number(ancora.userData.heroBaseX) || 0;
    const dH = h - (Number(child.userData.rumo0) || h);
    const deriva = o.em_rota ? Math.max(-48, Math.min(48, -dH * 52)) : 0;
    hero.position.x = base + deriva;
  }
}

export function definirAlvoLook(mundo, ponto) {
  if (mundo) mundo.alvoLook = ponto ?? null;
}

export function actualizarAmeacas(mundo, dt) {
  if (!mundo?.ameaças) return;
  mundo.tAmeaca = (mundo.tAmeaca ?? 0) + dt;
  const pulse = 0.35 + 0.65 * Math.abs(Math.sin(mundo.tAmeaca * 6));
  for (const child of mundo.ameaças.children) {
    if (child.userData.beacon?.material) {
      child.userData.beacon.material.emissiveIntensity = pulse;
    }
    const tr = child.userData.trafego;
    if (tr) {
      child.position.x += Math.sin(tr.heading) * tr.speed * dt;
      child.position.z += Math.cos(tr.heading) * tr.speed * dt;
    }
    const aves = child.userData.birds;
    if (aves) {
      for (const b of aves) {
        const fase = mundo.tAmeaca * b.rate + b.phase;
        b.pivL.rotation.z = Math.sin(fase) * 0.5;
        b.pivR.rotation.z = -Math.sin(fase) * 0.5;
        b.g.position.y = b.baseY + Math.sin(fase * 0.45) * 0.45;
      }
    }
    const formacao = child.userData.avioes;
    if (formacao) {
      for (const pl of formacao) {
        pl.group.position.x += Math.sin(pl.yaw) * pl.speed * dt;
        pl.group.position.z += Math.cos(pl.yaw) * pl.speed * dt;
        for (const prop of pl.props) prop.rotation.z += dt * 22;
      }
    }
  }
}

export function criarCena(canvas, { leve = false, cenario = 'medevac' } = {}) {
  const pal = ceuDe(cenario);
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !leve,
    alpha: false,
    powerPreference: leve ? 'low-power' : 'default',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, leve ? 1.25 : 1.75));
  renderer.setClearColor(pal.top, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(pal.fog, 160, 980);
  scene.background = new THREE.Color(pal.top);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.4, 2000);
  camera.position.set(-95, 50, 22);

  const hemi = new THREE.HemisphereLight(pal.hemi, 0x2a3328, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(pal.dir, 1.35);
  sun.position.set(-90, 70, 30);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(40, 30, -20);
  scene.add(fill);

  const geografia = new THREE.Group();
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    mat(cenario === 'sar' ? 0x1c3348 : 0x2a6f9a),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -12;
  geografia.add(ocean);

  if (cenario === 'porto') geografia.add(portoNoite(leve));
  else if (cenario === 'carga') geografia.add(campoFal(leve));
  else geografia.add(ilha(leve));
  scene.add(geografia);

  const aviao = criarLus222();
  scene.add(aviao);

  const ameaças = new THREE.Group();
  scene.add(ameaças);

  return {
    renderer,
    scene,
    camera,
    aviao,
    ameaças,
    geografia,
    origemVisual: { x: 0, z: 0 },
    alvoLook: null,
    tAmeaca: 0,
    leve,
    cenario,
  };
}

/** Mantém a câmara perto da origem numérica sem alterar coordenadas da missão. */
export function recentrarOrigem(mundo, pose) {
  const origem = mundo.origemVisual;
  const x = pose.x - origem.x;
  const z = pose.z - origem.z;
  if (Math.hypot(x, z) > 240) {
    mundo.geografia.position.x -= x;
    mundo.geografia.position.z -= z;
    mundo.camera.position.x -= x;
    mundo.camera.position.z -= z;
    for (const ameaca of mundo.ameaças.children) {
      ameaca.position.x -= x;
      ameaca.position.z -= z;
    }
    if (mundo.alvoLook) {
      mundo.alvoLook.x -= x;
      mundo.alvoLook.z -= z;
    }
    origem.x = pose.x;
    origem.z = pose.z;
  }
  return { ...pose, x: pose.x - origem.x, z: pose.z - origem.z };
}

export function aplicarPose(mundo, pose) {
  if (!mundo?.aviao) return;
  mundo.aviao.position.set(pose.x, pose.y, pose.z);
  mundo.aviao.rotation.order = 'YXZ';
  mundo.aviao.rotation.y = pose.heading;
  mundo.aviao.rotation.z = pose.bank;
  mundo.aviao.rotation.x = pose.pitch;
  const props = mundo.aviao.userData.props ?? [];
  for (const p of props) p.rotation.z = pose.hélice;
}

/**
 * Vista chase: ligeiramente à esquerda e acima da cauda do LUS-222, a
 * olhar para a rota à frente do nariz — o comandante vê o que o piloto vê,
 * mas de fora, como num simulador de voo. O avião fica no terço inferior
 * do quadro, os obstáculos entram pelo fundo e o dodge lê-se no bank e na
 * fuga da ameaça para a borda. Só contas escalares por frame (sem alocações)
 * para aguentar o perfil leve no telemóvel.
 */
export function actualizarCamara(mundo, pose, dt) {
  const cam = mundo.camera;
  const look = mundo.alvoLook;
  const dodge = Boolean(pose.dodge || look);
  // Ecrã estreito (telemóvel em pé): afasta a cauda para a asa caber no quadro.
  const fit = Math.min(1, Math.max(0.42, (cam.aspect || 1) / 1.2));
  const back = (dodge ? 38 : 28) / fit;
  const up = (dodge ? 10 : 7) / fit;
  const ahead = dodge ? 56 : 48;
  const fx = Math.sin(pose.heading);
  const fz = Math.cos(pose.heading);
  const lado = -4 * Math.max(0, (fit - 0.5) / 0.5);

  const alvoX = pose.x - fx * back + fz * lado;
  const alvoY = pose.y + up;
  const alvoZ = pose.z - fz * back - fx * lado;
  if (!mundo.camaraPronta) {
    cam.position.set(alvoX, alvoY, alvoZ);
    mundo.camaraPronta = true;
  } else {
    const t = Math.min(dt, 0.08);
    const k = 1 - Math.exp(-3.4 * t);
    const ky = 1 - Math.exp(-7 * t); // vertical quase rígido: não larga a cauda na subida/descida do dodge
    cam.position.x += (alvoX - cam.position.x) * k;
    cam.position.y += (alvoY - cam.position.y) * ky;
    cam.position.z += (alvoZ - cam.position.z) * k;
  }

  // Mira à frente do nariz, ao nível do avião — a rota fica no centro e a
  // subida/descida lê-se contra o horizonte. Com ameaça à frente, puxa a
  // mira um pouco para ela (limitado a ~19°) sem virar a vista; ameaça já
  // atrás do nariz não arrasta a câmara.
  let miraX = pose.x + fx * ahead;
  const miraY = pose.y + 2.2;
  let miraZ = pose.z + fz * ahead;
  if (look) {
    const peso = 0.3 * fit; // ecrã estreito: menos puxão, o avião não encosta à borda
    const ax = miraX + (look.x - miraX) * peso - pose.x;
    const az = miraZ + (look.z - miraZ) * peso - pose.z;
    const frente = ax * fx + az * fz;
    if (frente > 12) {
      const lat = az * fx - ax * fz;
      const latMax = frente * 0.35;
      const latC = Math.max(-latMax, Math.min(latMax, lat));
      miraX = pose.x + fx * frente - fz * latC;
      miraZ = pose.z + fz * frente + fx * latC;
    }
  }
  cam.lookAt(miraX, miraY, miraZ);
}

export function redimensionar(mundo, largura, altura) {
  if (!mundo) return;
  const w = Math.max(1, largura);
  const h = Math.max(1, altura);
  mundo.camera.aspect = w / h;
  mundo.camera.updateProjectionMatrix();
  mundo.mundoLargura = w;
  mundo.mundoAltura = h;
  mundo.renderer.setSize(w, h, false);
}

export function webglDisponivel() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}
