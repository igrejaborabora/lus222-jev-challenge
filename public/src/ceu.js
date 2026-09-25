import * as THREE from 'three';
import { mulberry32 } from './decisao.js';
import { alturaNuvensM, distanciaNoTufo, escalaBolha, misturarCor, nevoeiroDe, noiteAlvo, paletaCeu, ventoNoMundo } from './ambiente-visual.js';

/**
 * Céu desenhado a partir do ambiente que o JEV recebe (ambiente-visual.js):
 * cúpula em gradiente, nevoeiro pela visibilidade, camada de nuvens no tecto,
 * rastos de vento (ou chuva, com pouca visibilidade) e a luz do sol.
 */
const CAMPO_NUVENS_M = 9000;
// De noite as nuvens escurecem para um cinzento quente, o reflexo da cidade.
const COR_NUVEM = 0xdfe3e6;
const COR_NUVEM_NOITE = 0x4f4640;
// Nas últimas centenas de metros antes de dar a volta ao campo, a nuvem
// encolhe até zero: reaparece do outro lado sem saltar à vista.
const ORLA_NUVENS_M = 900;
const NUVENS_ATE_M = 1600;
const MAX_TUFOS = 5;
// Metade de baixo de cada tufo achatada a este factor: base de cúmulo.
const BASE_TUFO = 0.25;
const EIXO_Y = new THREE.Vector3(0, 1, 0);
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

/**
 * Tufo de cúmulo: icosaedro (detalhe 2 = 180 triângulos; 1 = 80 no perfil
 * leve) com a metade de baixo achatada (base plana). Normais do elipsóide
 * inferior, para o sombreado continuar suave na junção.
 */
function geometriaTufo(detalhe) {
  const geo = new THREE.IcosahedronGeometry(1, detalhe);
  const pos = geo.getAttribute('position');
  const nor = geo.getAttribute('normal');
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    if (y >= 0) continue;
    pos.setY(i, y * BASE_TUFO);
    const l = Math.hypot(x, y / BASE_TUFO, z);
    nor.setXYZ(i, x / l, y / BASE_TUFO / l, z / l);
  }
  return geo;
}

/**
 * Cada nuvem é um cacho de 3 a 5 tufos (sementes fixas): desvio horizontal
 * até ±0,35 do tamanho, vertical de 0 a 0,4 da altura, tamanho 0,5 a 1.
 * Uma só InstancedMesh; `count` desenha só os tufos que existem.
 */
function camadaNuvens(n, detalhe) {
  const rnd = mulberry32(222);
  const nuvens = Array.from({ length: n }, () => {
    const c = {
      x: rnd() * CAMPO_NUVENS_M,
      z: rnd() * CAMPO_NUVENS_M,
      // Raios do cacho: tufos com ~2:1 de largura para altura (cúmulo baixo).
      sx: 160 + rnd() * 160,
      sy: 80 + rnd() * 70,
      sz: 140 + rnd() * 140,
      rumo: rnd() * Math.PI * 2,
    };
    const nTufos = 3 + Math.floor(rnd() * (MAX_TUFOS - 2));
    c.tufos = Array.from({ length: nTufos }, () => {
      const f = 0.5 + rnd() * 0.5;
      const dx = (rnd() * 2 - 1) * 0.35 * c.sx;
      const dz = (rnd() * 2 - 1) * 0.35 * c.sz;
      // Centro acima da base o bastante para o fundo achatado ficar no tecto.
      const dy = rnd() * 0.4 * c.sy + BASE_TUFO * f * c.sy;
      const angulo = rnd() * Math.PI;
      return {
        dx,
        dz,
        dy,
        sx: f * c.sx,
        sy: f * c.sy,
        sz: f * c.sz,
        q: new THREE.Quaternion().setFromAxisAngle(EIXO_Y, angulo),
        // Para a bolha (distanciaNoTufo): o ângulo do tufo em Y.
        cos: Math.cos(angulo),
        sin: Math.sin(angulo),
      };
    });
    return c;
  });
  const total = nuvens.reduce((acc, c) => acc + c.tufos.length, 0);
  const mat = new THREE.MeshLambertMaterial({ color: COR_NUVEM, transparent: true, opacity: 0.92 });
  const mesh = new THREE.InstancedMesh(geometriaTufo(detalhe), mat, n * MAX_TUFOS);
  mesh.count = total;
  mesh.name = 'ceu-nuvens';
  mesh.frustumCulled = false;
  return { mesh, nuvens, m: new THREE.Matrix4(), s: new THREE.Vector3(), p: new THREE.Vector3() };
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
export function criarCeu(scene, { cenario, leve = false, alcanceTerrenoM, luzDia = true }) {
  const ceu = {
    cenario,
    alcanceTerrenoM,
    cupula: cupula(),
    hemi: new THREE.HemisphereLight(0xd7e8ff, 0x2a3328, 1.05),
    // ~240 tufos × 180 triângulos ≈ 43 mil no desktop; ~100 × 80 no leve.
    nuvens: camadaNuvens(leve ? 24 : 60, leve ? 1 : 2),
    rastos: rastos(leve ? 80 : 220),
    // As missões abrem com a luz do cenário e escurecem; o simulador nasce já de noite.
    noite: noiteAlvo(cenario, luzDia),
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
  ceu.nuvens.mesh.material.color.setHex(misturarCor(COR_NUVEM, COR_NUVEM_NOITE, pal.luzes));

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
 * Quanto fica de um tufo (centro `p`, já encolhido `f` pela orla) com a
 * câmara e o avião por perto: conta o mais próximo dos dois, no espaço do
 * elipsóide do tufo. Sem alocações (corre por tufo, por frame).
 */
function bolha(t, p, f, cam, pose) {
  const dCam = distanciaNoTufo((cam.x - p.x) / f, (cam.y - p.y) / f, (cam.z - p.z) / f, t, BASE_TUFO);
  const dAviao = distanciaNoTufo((pose.x - p.x) / f, (pose.y - p.y) / f, (pose.z - p.z) / f, t, BASE_TUFO);
  return Math.max(0.001, escalaBolha(Math.min(dCam, dAviao)));
}

/**
 * Nuvens ancoradas no mundo ABSOLUTO (pose local + origem visual): recentrar
 * a origem não as arrasta com o avião. A base dos cachos fica no tecto. Com o
 * tecto à altura do voo, abre-se uma bolha: o tufo onde a câmara ou o avião
 * entrariam encolhe para o centro, e a camada continua à volta.
 */
function aplicarNuvens(ceu, ambiente, pose, origem, camera) {
  const { mesh, nuvens, m, s, p } = ceu.nuvens;
  const alt = alturaNuvensM(ambiente.tetoFt ?? 3000);
  mesh.visible = alt < NUVENS_ATE_M;
  if (!mesh.visible) return;
  const ax = pose.x + origem.x;
  const az = pose.z + origem.z;
  const meio = CAMPO_NUVENS_M / 2;
  let i = 0;
  for (const c of nuvens) {
    const dx = dobrar(c.x, ax, CAMPO_NUVENS_M);
    const dz = dobrar(c.z, az, CAMPO_NUVENS_M);
    const orla = Math.min(1, (meio - Math.max(Math.abs(dx), Math.abs(dz))) / ORLA_NUVENS_M);
    // O cacho inteiro encolhe para o centro junto à orla do campo.
    const f = Math.max(0.001, orla);
    const cos = Math.cos(c.rumo);
    const sin = Math.sin(c.rumo);
    for (const t of c.tufos) {
      p.set(
        pose.x + dx + (t.dx * cos + t.dz * sin) * f,
        alt + t.dy * f,
        pose.z + dz + (t.dz * cos - t.dx * sin) * f,
      );
      const e = f * bolha(t, p, f, camera.position, pose);
      s.set(t.sx * e, t.sy * e, t.sz * e);
      m.compose(p, t.q, s);
      mesh.setMatrixAt(i++, m);
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
}

/** Rastos numa caixa à volta do avião, a derivar com o vento; com visibilidade < 5 km, chuva. */
function aplicarRastos(ceu, ambiente, pose, dt) {
  const vento = ventoNoMundo(ambiente.ventoMs);
  const chuva = (ambiente.visKm ?? 10) < 5;
  const r = ceu.rastos;
  // Até 10 kt não há rastos; aos 32 kt chegam ao máximo (0,35).
  const opacidade = chuva ? 0.45 : Math.min(0.35, Math.max(0, (vento.kt - 10) / 40));
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
  aplicarNuvens(ceu, ambiente, pose, origem, camera);
  aplicarRastos(ceu, ambiente, pose, dt);
  return pal;
}
