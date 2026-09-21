import * as THREE from 'three';
import { pontoAmeaca } from './decisao.js';

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

/** Boneco honesto do LUS-222: nariz +Z, asa alta, dois turboprops, T-tail, trem fixo. */
export function criarLus222() {
  const g = new THREE.Group();
  const white = mat(0xf4f6f8);
  const navy = mat(0x1a2744);
  const dark = mat(0x1c1f24);
  const glass = mat(0x101820);
  const tyre = mat(0x151515);

  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.78, 8.4, 18), white);
  fuse.rotation.x = Math.PI / 2;
  g.add(fuse);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.82, 16, 12), white);
  nose.scale.set(1, 0.92, 1.35);
  nose.position.z = 4.25;
  g.add(nose);

  const tailcone = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.22, 2.6, 14), white);
  tailcone.rotation.x = Math.PI / 2;
  tailcone.position.z = -5.3;
  g.add(tailcone);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 10), glass);
  cockpit.scale.set(1.05, 0.62, 0.85);
  cockpit.position.set(0, 0.48, 3.55);
  g.add(cockpit);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(16.8, 0.13, 2.7), white);
  wing.position.set(0, 1.18, 0.25);
  g.add(wing);
  const root = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, 1.8), white);
  root.position.set(0, 0.82, 0.2);
  g.add(root);

  const props = [];
  for (const side of [-1, 1]) {
    const nacelle = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.26, 2.05, 12), white);
    nacelle.rotation.x = Math.PI / 2;
    nacelle.position.set(side * 3.45, 0.78, 0.95);
    g.add(nacelle);

    const spinner = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), dark);
    spinner.position.set(side * 3.45, 0.78, 2.08);
    g.add(spinner);

    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.05, 18),
      mat(0x2a2e33, { transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
    );
    disc.position.set(side * 3.45, 0.78, 2.12);
    g.add(disc);

    const prop = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.05, 0.14), dark);
    const blade2 = blade.clone();
    blade2.rotation.z = Math.PI / 2;
    prop.add(blade, blade2);
    prop.position.set(side * 3.45, 0.78, 2.16);
    g.add(prop);
    props.push(prop);
  }

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.7, 1.55), navy);
  fin.position.set(0, 1.55, -5.55);
  g.add(fin);
  const stab = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.12, 1.25), white);
  stab.position.set(0, 2.9, -5.55);
  g.add(stab);

  const lus = placa('LUS+222', 1.2, 0.34, { fill: '#f4f6f8', size: 70, w: 512, h: 140 });
  lus.position.set(0.08, 1.55, -5.56);
  lus.rotation.y = Math.PI / 2;
  g.add(lus);
  const lus2 = lus.clone();
  lus2.position.x = -0.08;
  lus2.rotation.y = -Math.PI / 2;
  g.add(lus2);

  const eea = placa('EEAIRCRAFT', 1.8, 0.18, { fill: '#1a2744', size: 64, w: 640, h: 120 });
  eea.position.set(0.83, 0.1, 2.9);
  eea.rotation.y = Math.PI / 2;
  g.add(eea);
  const eea2 = eea.clone();
  eea2.position.x = -0.83;
  eea2.rotation.y = -Math.PI / 2;
  g.add(eea2);

  const reg = placa('CS-001', 0.95, 0.16, { fill: '#1a2744', size: 68, w: 512, h: 120 });
  reg.position.set(0.8, -0.12, -2.5);
  reg.rotation.y = Math.PI / 2;
  g.add(reg);
  const reg2 = reg.clone();
  reg2.position.x = -0.8;
  reg2.rotation.y = -Math.PI / 2;
  g.add(reg2);

  for (let i = 0; i < 9; i++) {
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.32), glass);
    win.position.set(0.8, 0.18, 2.2 - i * 0.52);
    g.add(win);
    const win2 = win.clone();
    win2.position.x = -0.8;
    g.add(win2);
  }

  const leg = (x, y, z) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.2, 6), dark);
    strut.position.set(x, y, z);
    g.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10), tyre);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y - 0.65, z);
    g.add(wheel);
  };
  leg(0, -0.88, 3.2);
  leg(1.2, -0.98, -0.4);
  leg(-1.2, -0.98, -0.4);

  g.userData.props = props;
  g.scale.set(1.35, 1.35, 1.35);
  return g;
}

function ceuDe(cenario) {
  switch (cenario) {
    case 'sar':
      return { top: 0x1a2744, fog: 0x243044, hemi: 0x8aa0b8, dir: 0xffc48a };
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

function meshAmeaca(o, pose) {
  const p = pontoAmeaca(pose, o);
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  g.userData.visual = p.visual;

  switch (p.visual) {
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
  limparGrupo(mundo.ameaças);
  mundo.alvoLook = null;
  const lista = Array.isArray(obstaculos) ? obstaculos : [];
  for (const o of lista) {
    mundo.ameaças.add(meshAmeaca(o, pose));
  }
  if (lista[0]) mundo.alvoLook = pontoAmeaca(pose, lista[0]);
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
  scene.fog = new THREE.Fog(pal.fog, 80, 520);
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

  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(2400, 2400),
    mat(cenario === 'sar' ? 0x1c3348 : 0x2a6f9a),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -12;
  scene.add(ocean);

  scene.add(ilha(leve));

  const aviao = criarLus222();
  scene.add(aviao);

  const ameaças = new THREE.Group();
  scene.add(ameaças);

  return { renderer, scene, camera, aviao, ameaças, alvoLook: null, tAmeaca: 0, leve, cenario };
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
 * Vista chase: cravada atrás e ligeiramente acima da cauda do LUS-222, a
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
  const fit = Math.min(1, Math.max(0.55, (cam.aspect || 1) / 1.2));
  const back = (dodge ? 36 : 24) / fit;
  const up = (dodge ? 11 : 8) / fit;
  const ahead = dodge ? 56 : 48;
  const fx = Math.sin(pose.heading);
  const fz = Math.cos(pose.heading);

  const alvoX = pose.x - fx * back;
  const alvoY = pose.y + up;
  const alvoZ = pose.z - fz * back;
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
