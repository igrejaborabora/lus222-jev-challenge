import * as THREE from 'three';

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

/** Boneco honesto do LUS-222: asa alta, dois turboprops, T-tail, trem fixo. */
export function criarLus222() {
  const g = new THREE.Group();
  const white = mat(0xf3f5f7);
  const navy = mat(0x1a2744);
  const dark = mat(0x1c1f24);
  const glass = mat(0x1b2430, { transparent: true, opacity: 0.72 });
  const tyre = mat(0x151515);

  const fuse = new THREE.Mesh(new THREE.CapsuleGeometry(0.92, 8.4, 6, 14), white);
  fuse.rotation.z = Math.PI / 2;
  fuse.position.set(0, 0, 0);
  g.add(fuse);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.92, 14, 12, 0, Math.PI * 2, 0, Math.PI / 2), white);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, -0.04, 5.05);
  g.add(nose);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.62, 12, 10, 0, Math.PI * 2, 0, 1.2), glass);
  cockpit.scale.set(1.15, 0.72, 0.9);
  cockpit.position.set(0, 0.42, 3.7);
  g.add(cockpit);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.16, 2.3), white);
  wing.position.set(0, 1.05, 0.15);
  g.add(wing);

  const root = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 1.6), white);
  root.position.set(0, 0.72, 0.15);
  g.add(root);

  const props = [];
  for (const side of [-1, 1]) {
    const nacelle = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.5, 6, 10), white);
    nacelle.rotation.z = Math.PI / 2;
    nacelle.position.set(side * 3.15, 0.78, 0.85);
    g.add(nacelle);

    const spinner = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), dark);
    spinner.position.set(side * 3.15, 0.78, 1.78);
    g.add(spinner);

    const prop = new THREE.Group();
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.85, 0.16), dark);
    const blade2 = blade.clone();
    blade2.rotation.z = Math.PI / 2;
    prop.add(blade, blade2);
    prop.position.set(side * 3.15, 0.78, 1.86);
    g.add(prop);
    props.push(prop);
  }

  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.35, 1.35), navy);
  fin.position.set(0, 1.35, -4.15);
  g.add(fin);

  const tail = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.12, 1.05), white);
  tail.position.set(0, 2.48, -4.15);
  g.add(tail);

  const lus = placa('LUS+222', 1.15, 0.32, { fill: '#f4f6f8', size: 70, w: 512, h: 140 });
  lus.position.set(0.09, 1.45, -4.16);
  lus.rotation.y = Math.PI / 2;
  g.add(lus);
  const lus2 = lus.clone();
  lus2.position.x = -0.09;
  lus2.rotation.y = -Math.PI / 2;
  g.add(lus2);

  const eea = placa('EEAIRCRAFT', 1.7, 0.18, { fill: '#1a2744', size: 64, w: 640, h: 120 });
  eea.position.set(0.93, 0.12, 3.15);
  eea.rotation.y = Math.PI / 2;
  g.add(eea);
  const eea2 = eea.clone();
  eea2.position.x = -0.93;
  eea2.rotation.y = -Math.PI / 2;
  g.add(eea2);

  const reg = placa('CS-001', 0.95, 0.16, { fill: '#1a2744', size: 68, w: 512, h: 120 });
  reg.position.set(0.93, -0.15, -2.4);
  reg.rotation.y = Math.PI / 2;
  g.add(reg);
  const reg2 = reg.clone();
  reg2.position.x = -0.93;
  reg2.rotation.y = -Math.PI / 2;
  g.add(reg2);

  for (let i = 0; i < 9; i++) {
    const win = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.16, 4, 8), glass);
    win.rotation.z = Math.PI / 2;
    win.position.set(0.9, 0.18, 2.15 - i * 0.52);
    g.add(win);
    const win2 = win.clone();
    win2.position.x = -0.9;
    g.add(win2);
  }

  const leg = (x, y, z) => {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.15, 6), dark);
    strut.position.set(x, y, z);
    g.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10), tyre);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, y - 0.62, z);
    g.add(wheel);
  };
  leg(0, -0.85, 3.35);
  leg(1.15, -0.95, -0.35);
  leg(-1.15, -0.95, -0.35);

  g.userData.props = props;
  g.scale.set(1.15, 1.15, 1.15);
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
  camera.position.set(-18, 10, 22);

  const hemi = new THREE.HemisphereLight(pal.hemi, 0x2a3328, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(pal.dir, 1.05);
  sun.position.set(-80, 90, 40);
  scene.add(sun);

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

  return { renderer, scene, camera, aviao, leve, cenario };
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

export function actualizarCamara(mundo, pose, dt) {
  const cam = mundo.camera;
  const back = 18;
  const side = 10;
  const up = 6.5;
  const hx = pose.heading;
  const alvoX = pose.x - Math.sin(hx) * back + Math.cos(hx) * side;
  const alvoZ = pose.z - Math.cos(hx) * back - Math.sin(hx) * side;
  const alvoY = pose.y + up;
  const k = 1 - Math.exp(-3.2 * Math.min(dt, 0.08));
  cam.position.x += (alvoX - cam.position.x) * k;
  cam.position.y += (alvoY - cam.position.y) * k;
  cam.position.z += (alvoZ - cam.position.z) * k;
  cam.lookAt(pose.x, pose.y + 0.6, pose.z);
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
