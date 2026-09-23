import * as THREE from 'three';
import { mulberry32 } from './decisao.js';
import { alturaNuvensM, nevoeiroDe, noiteAlvo, paletaCeu, ventoNoMundo } from './ambiente-visual.js';

/**
 * Céu desenhado a partir do ambiente que o JEV recebe (ambiente-visual.js):
 * cúpula em gradiente, nevoeiro pela visibilidade, camada de nuvens no tecto,
 * rastos de vento (ou chuva, com pouca visibilidade) e a luz do sol.
 */
const CAMPO_NUVENS_M = 9000;
// Nas últimas centenas de metros antes de dar a volta ao campo, a nuvem
// encolhe até zero: reaparece do outro lado sem saltar à vista.
const ORLA_NUVENS_M = 900;
const NUVENS_ATE_M = 1600;
const CAIXA_RASTOS_M = 420;
const RAMPA_NOITE_S = 60;
// Direcção horizontal do sol fixa no MUNDO (não segue o rumo): o flanco
// direito do piloto (−X), onde abre a câmara, fica sempre iluminado.
const SOL_H = { x: -0.949, z: 0.316 };
const DISTANCIA_SOL_M = 70;
// Abaixo disto a luz rasaria o avião; o céu usa a elevação verdadeira.
const ELEVACAO_MIN_LUZ = 0.15;

const VERTICE_CUPULA = `
varying float vY;
void main() {
  vY = normalize(position).y;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

// Abaixo do horizonte e junto dele, a cor do nevoeiro: o terreno esbatido
// encontra a cúpula sem costura. Com pouca visibilidade a faixa sobe.
const FRAGMENTO_CUPULA = `
uniform vec3 zenite;
uniform vec3 horizonte;
uniform vec3 nevoeiro;
uniform float denso;
varying float vY;
void main() {
  vec3 baixo = mix(nevoeiro, horizonte, smoothstep(-0.02, 0.1 + 0.3 * denso, vY));
  gl_FragColor = vec4(mix(baixo, zenite, smoothstep(0.0, 0.55, vY)), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function cupula() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      zenite: { value: new THREE.Color() },
      horizonte: { value: new THREE.Color() },
      nevoeiro: { value: new THREE.Color() },
      denso: { value: 0 },
    },
    vertexShader: VERTICE_CUPULA,
    fragmentShader: FRAGMENTO_CUPULA,
    side: THREE.BackSide,
    depthWrite: false,
    // Desenhada primeiro e sem teste de profundidade: é o fundo, e o shader
    // não escreve a profundidade logarítmica do resto da cena.
    depthTest: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(24000, 24, 12), material);
  mesh.name = 'ceu-cupula';
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  return mesh;
}

function camadaNuvens(n) {
  // Detalhe 2 (320 triângulos): de perto a silhueta não parece uma pedra;
  // 60 nuvens ≈ 19 mil triângulos numa só chamada de desenho.
  const geo = new THREE.IcosahedronGeometry(1, 2);
  // Normais radiais (esfera unitária): sombreado suave em vez de facetas.
  geo.setAttribute('normal', geo.getAttribute('position').clone());
  const mat = new THREE.MeshLambertMaterial({ color: 0xdfe3e6, transparent: true, opacity: 0.92 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'ceu-nuvens';
  mesh.frustumCulled = false;
  const rnd = mulberry32(222);
  const eixoY = new THREE.Vector3(0, 1, 0);
  const sementes = Array.from({ length: n }, () => ({
    x: rnd() * CAMPO_NUVENS_M,
    z: rnd() * CAMPO_NUVENS_M,
    sx: 260 + rnd() * 480,
    sy: 40 + rnd() * 48,
    sz: 180 + rnd() * 300,
    subida: Math.floor(rnd() * 3) * 18,
    q: new THREE.Quaternion().setFromAxisAngle(eixoY, rnd() * Math.PI),
  }));
  return { mesh, sementes, m: new THREE.Matrix4(), s: new THREE.Vector3(), p: new THREE.Vector3() };
}

function rastos(n) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
  const linhas = new THREE.LineSegments(geo, mat);
  linhas.name = 'ceu-rastos';
  linhas.frustumCulled = false;
  const rnd = mulberry32(2222);
  const base = Array.from({ length: n }, () => [rnd(), rnd(), rnd()]);
  return { linhas, base, deriva: { x: 0, y: 0, z: 0 } };
}

/** Desvio de `v` em relação a `c`, dobrado para [−campo/2, campo/2). */
function dobrar(v, c, campo) {
  return ((((v - c) % campo) + campo * 1.5) % campo) - campo / 2;
}

/**
 * Cria o céu e o nevoeiro da cena (substitui scene.background). `alcanceTerrenoM`
 * é o raio dos mosaicos carregados: o nevoeiro fecha antes da orla.
 */
export function criarCeu(scene, { cenario, leve = false, alcanceTerrenoM }) {
  const ceu = {
    cenario,
    alcanceTerrenoM,
    cupula: cupula(),
    hemi: new THREE.HemisphereLight(0xd7e8ff, 0x2a3328, 1.05),
    nuvens: camadaNuvens(leve ? 24 : 60),
    rastos: rastos(leve ? 80 : 220),
    noite: noiteAlvo(cenario, true),
  };
  const nev = nevoeiroDe(10, alcanceTerrenoM);
  scene.fog = new THREE.Fog(paletaCeu(ceu.noite).nevoeiro, nev.near, nev.far);
  scene.background = null;
  scene.add(ceu.cupula, ceu.hemi, ceu.nuvens.mesh, ceu.rastos.linhas);
  return ceu;
}

function aplicarLuz(ceu, { scene, sol, camera, ambiente, pose }, pal) {
  const u = ceu.cupula.material.uniforms;
  u.zenite.value.setHex(pal.zenite);
  u.horizonte.value.setHex(pal.horizonte);
  u.nevoeiro.value.setHex(pal.nevoeiro);
  const visKm = ambiente.visKm ?? 10;
  u.denso.value = Math.min(1, Math.max(0, (10 - visKm) / 9));
  ceu.cupula.position.copy(camera.position);

  const nev = nevoeiroDe(visKm, ceu.alcanceTerrenoM);
  scene.fog.color.setHex(pal.nevoeiro);
  scene.fog.near = nev.near;
  scene.fog.far = nev.far;
  ceu.hemi.intensity = pal.intensidadeCeu;

  if (!sol) return;
  sol.color.setHex(pal.corSol);
  sol.intensity = pal.intensidadeSol;
  const e = Math.max(pal.elevacaoSolRad, ELEVACAO_MIN_LUZ);
  const h = Math.cos(e) * DISTANCIA_SOL_M;
  sol.target.position.set(pose.x, pose.y, pose.z);
  sol.position.set(pose.x + SOL_H.x * h, pose.y + Math.sin(e) * DISTANCIA_SOL_M, pose.z + SOL_H.z * h);
  // De noite a sombra própria do avião desaparece com a luz.
  if (sol.castShadow) sol.shadow.intensity = 1 - pal.luzes;
}

/**
 * Nuvens ancoradas no mundo ABSOLUTO (pose local + origem visual): recentrar
 * a origem não as arrasta com o avião. A base fica no tecto.
 */
function aplicarNuvens(ceu, ambiente, pose, origem) {
  const { mesh, sementes, m, s, p } = ceu.nuvens;
  const alt = alturaNuvensM(ambiente.tetoFt ?? 3000);
  mesh.visible = alt < NUVENS_ATE_M;
  if (!mesh.visible) return;
  const ax = pose.x + origem.x;
  const az = pose.z + origem.z;
  const meio = CAMPO_NUVENS_M / 2;
  for (let i = 0; i < sementes.length; i++) {
    const k = sementes[i];
    const dx = dobrar(k.x, ax, CAMPO_NUVENS_M);
    const dz = dobrar(k.z, az, CAMPO_NUVENS_M);
    const orla = Math.min(1, (meio - Math.max(Math.abs(dx), Math.abs(dz))) / ORLA_NUVENS_M);
    const f = Math.max(0.001, orla);
    p.set(pose.x + dx, alt + k.sy + k.subida, pose.z + dz);
    s.set(k.sx * f, k.sy * f, k.sz * f);
    m.compose(p, k.q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/** Rastos numa caixa à volta do avião, a derivar com o vento; com visibilidade < 5 km, chuva. */
function aplicarRastos(ceu, ambiente, pose, dt) {
  const vento = ventoNoMundo(ambiente.ventoMs);
  const chuva = (ambiente.visKm ?? 10) < 5;
  const r = ceu.rastos;
  const opacidade = chuva ? 0.45 : Math.min(0.35, vento.kt / 60);
  r.linhas.visible = opacidade > 0.01;
  if (!r.linhas.visible) return;
  r.linhas.material.opacity = opacidade;
  const d = r.deriva;
  d.x = (d.x + vento.x * dt) % CAIXA_RASTOS_M;
  d.z = (d.z + vento.z * dt) % CAIXA_RASTOS_M;
  d.y = (d.y - (chuva ? 9 : 0) * dt) % CAIXA_RASTOS_M;
  const velocidade = Math.hypot(vento.x, vento.z);
  const ux = velocidade > 0.25 ? vento.x / velocidade : 0;
  const uz = velocidade > 0.25 ? vento.z / velocidade : 0;
  const comp = chuva ? 6 : Math.min(30, 2 + vento.kt * 0.9);
  const pos = r.linhas.geometry.getAttribute('position');
  const a = pos.array;
  for (let i = 0; i < r.base.length; i++) {
    const [bx, by, bz] = r.base[i];
    const x = pose.x + dobrar(bx * CAIXA_RASTOS_M + d.x, 0, CAIXA_RASTOS_M);
    const y = pose.y + dobrar(by * CAIXA_RASTOS_M + d.y, 0, CAIXA_RASTOS_M) * 0.5;
    const z = pose.z + dobrar(bz * CAIXA_RASTOS_M + d.z, 0, CAIXA_RASTOS_M);
    const j = i * 6;
    a[j] = x;
    a[j + 1] = y;
    a[j + 2] = z;
    a[j + 3] = x - ux * comp;
    a[j + 4] = y + (chuva ? comp : 0);
    a[j + 5] = z - uz * comp;
  }
  pos.needsUpdate = true;
}

/**
 * Por frame, depois da câmara: `pose` LOCAL (já recentrada) e `origem` a
 * origem visual. A noite aproxima-se do alvo em ~60 s (vê-se o anoitecer).
 * Devolve a paleta aplicada.
 */
export function actualizarCeu(ceu, { scene, sol, camera, ambiente, pose, origem = { x: 0, z: 0 }, dt = 0 }) {
  const alvo = noiteAlvo(ceu.cenario, ambiente.luzDia !== false);
  ceu.noite += (alvo - ceu.noite) * Math.min(1, dt / RAMPA_NOITE_S);
  const pal = paletaCeu(ceu.noite);
  aplicarLuz(ceu, { scene, sol, camera, ambiente, pose }, pal);
  aplicarNuvens(ceu, ambiente, pose, origem);
  aplicarRastos(ceu, ambiente, pose, dt);
  return pal;
}
