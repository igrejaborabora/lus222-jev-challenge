import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { actualizarHelices, criarLus222 } from './lus222.js';

const canvas = document.getElementById('tt');
const botoes = {
  rodar: document.getElementById('rodar'),
  silhueta: document.getElementById('silhueta'),
  leve: document.getElementById('leve'),
};
const estado = { rodar: false, silhueta: false, leve: false, angulo: 0 };
// ?foco=0..3 mostra uma só vista (lado, frente, 3/4, cima) em ecrã inteiro.
const focoParam = Number.parseInt(new URLSearchParams(location.search).get('foco') ?? '', 10);
const foco = focoParam >= 0 && focoParam <= 3 ? focoParam : null;
if (foco !== null) document.querySelector('.grelha').style.display = 'none';

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
} catch {
  document.getElementById('erro').style.display = 'grid';
  throw new Error('Sem WebGL');
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setScissorTest(true);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;
scene.add(new THREE.HemisphereLight(0xd7e8ff, 0x2a3328, 1.05));
const sol = new THREE.DirectionalLight(0xfff4dc, 1.35);
sol.position.set(-54, 42, 18);
sol.castShadow = true;
sol.shadow.mapSize.set(2048, 2048);
Object.assign(sol.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 140 });
sol.shadow.bias = -0.0004;
sol.shadow.normalBias = 0.04;
scene.add(sol, sol.target);
const fill = new THREE.DirectionalLight(0xffffff, 0.35);
fill.position.set(40, 30, -20);
scene.add(fill);

const silhueta = new THREE.MeshBasicMaterial({ color: 0x0b0f15 });
const ceu = new THREE.Color(0x3a6ea8);
const papel = new THREE.Color(0xe8ecf1);

let aviao = null;
function montar() {
  if (aviao) {
    scene.remove(aviao);
    aviao.traverse((o) => {
      o.geometry?.dispose();
      const mats = o.material ? [o.material].flat() : [];
      for (const m of mats) {
        m.map?.dispose();
        m.roughnessMap?.dispose();
        m.dispose();
      }
    });
  }
  aviao = criarLus222({ leve: estado.leve });
  aviao.traverse((o) => {
    if (o.isMesh && o.material?.isMeshStandardMaterial) {
      o.castShadow = !estado.leve;
      o.receiveShadow = !estado.leve;
    }
  });
  scene.add(aviao);
}
montar();

const orto = (x, y, z, up = [0, 1, 0]) => {
  const c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  c.position.set(x, y, z);
  c.up.set(...up);
  c.lookAt(0, 0.9, 0);
  return c;
};
const vistas = [
  { cam: orto(40, 0.9, 0), meia: 9.8 },
  { cam: orto(0, 0.9, 40), meia: 11.6 },
  { cam: new THREE.PerspectiveCamera(30, 1, 0.1, 200), persp: true },
  { cam: orto(0, 40, 0, [0, 0, 1]), meia: 11.6 },
];

function redimensionar() {
  const { clientWidth: w, clientHeight: h } = canvas;
  renderer.setSize(w, h, false);
}
new ResizeObserver(redimensionar).observe(canvas);
redimensionar();

let ultimo = performance.now();
function frame(agora) {
  const dt = Math.min(0.05, (agora - ultimo) / 1000);
  ultimo = agora;
  if (estado.rodar) estado.angulo += dt * 0.5;
  actualizarHelices(aviao, estado.rodar ? agora / 1000 * 16 : 0.35, agora);

  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const vw = Math.floor(w / (foco === null ? 2 : 1));
  const vh = Math.floor(h / (foco === null ? 2 : 1));
  scene.background = estado.silhueta ? papel : ceu;
  scene.overrideMaterial = estado.silhueta ? silhueta : null;
  for (const p of aviao.userData.props) p.userData.disco.visible = !estado.silhueta;

  vistas.forEach((v, i) => {
    if (foco !== null && i !== foco) return;
    const x = foco === null ? (i % 2) * vw : 0;
    const y = foco === null && i < 2 ? h - vh : 0;
    const aspect = vw / vh;
    if (v.persp) {
      const r = 26;
      const a = 0.72 + estado.angulo;
      v.cam.aspect = aspect;
      v.cam.position.set(Math.sin(a) * r, -7.5, Math.cos(a) * r * 0.9);
      v.cam.lookAt(0, 0.7, 0);
      v.cam.updateProjectionMatrix();
    } else {
      const meiaH = Math.max(v.meia / aspect, v.meia * 0.36);
      const meiaW = meiaH * aspect;
      Object.assign(v.cam, { left: -meiaW, right: meiaW, top: meiaH, bottom: -meiaH });
      v.cam.updateProjectionMatrix();
    }
    renderer.setViewport(x, y, vw, vh);
    renderer.setScissor(x, y, vw, vh);
    renderer.render(scene, v.cam);
  });
  window.__lus222Pronto = true;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

for (const [chave, botao] of Object.entries(botoes)) {
  botao.addEventListener('click', () => {
    estado[chave] = !estado[chave];
    botao.setAttribute('aria-pressed', String(estado[chave]));
    if (chave === 'leve') montar();
  });
}
