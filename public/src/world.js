import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { alternarPreferido, alvoCamara, modoCamara, novaCamara, registarEvento, registarInteracao } from './camara-modos.js';
import { criarAves, criarCanyon, criarGuerra } from './cenas.js';
import { actualizarHelices, criarLus222 } from './lus222.js';
import { offsetLateral, pontoAmeaca } from './decisao.js';
import { posicaoVisualBaloes } from './ameaca-visual.js';
import { actualizarTerreno, criarTerreno, largarTerreno } from './terreno.js';
import { alturaTerreno, perfilTerreno } from './relevo.js';
import { TAMANHO_MOSAICO_M } from './mosaicos.js';
import { actualizarCeu, criarCeu } from './ceu.js';
import { actualizarMarcas, criarMarcas } from './marcas-missao.js';

// Suavização do desvio da câmara em relação ao avião (por segundo); a vertical
// é quase rígida para não largar a cauda na subida/descida do dodge.
const K_CAMARA = 3.4;
const K_VERTICAL = 7;
// Folga mínima da câmara acima do relevo (ou do mar, a y = 0).
const FOLGA_CHAO_M = 5;

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

function ameacaFixa(o) {
  return Number.isFinite(Number(o?.mundo_x)) && Number.isFinite(Number(o?.mundo_z));
}

function pontoResolvido(o, pose, mundo) {
  if (!ameacaFixa(o)) return { ...pontoAmeaca(pose, o), fixa: false };
  const rumo = Number.isFinite(Number(o.mundo_rumo)) ? Number(o.mundo_rumo) : numHeading(pose);
  const visual = o.visual;
  const noAr = visual === 'aves' || visual === 'guerra' || visual === 'trafego' || visual === 'baloes';
  const origem = mundo?.origemVisual ?? { x: 0, z: 0 };
  return {
    x: Number(o.mundo_x) - (origem.x || 0),
    y: noAr ? (Number(o.mundo_y) || Number(pose?.y) || 42) : 0,
    z: Number(o.mundo_z) - (origem.z || 0),
    visual,
    altura: Math.max(4, Math.min(220, Number(o.altura_m) || 56)),
    rumo,
    heading: rumo + (visual === 'trafego' ? Math.PI / 2 : 0),
    fixa: true,
  };
}

function meshAmeaca(o, pose, leve, mundo) {
  const p = pontoResolvido(o, pose, mundo);
  const g = new THREE.Group();
  g.position.set(p.x, 0, p.z);
  g.userData.visual = p.visual;
  g.userData.fixa = p.fixa;
  // Texto da etiqueta de leitura (marcas-missao.js): «relevo», «bando», …
  g.userData.tipo = o?.tipo ?? p.visual;

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
      // Ícones ampliados para leitura à distância; o centro e a passagem
      // seguem a posição SI da ameaça calculada no motor de voo.
      const cores = [0xffa65d, 0xf7d394, 0xdf775e, 0xe8b875];
      g.position.y = p.y;
      g.userData.baloes = true;
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * 1.0;
        const y = i % 2 ? 0.65 : -0.45;
        const z = (i % 2) * 0.7;
        const envelope = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 8), new THREE.MeshLambertMaterial({ color: cores[i], emissive: cores[i], emissiveIntensity: 0.65 }));
        envelope.scale.set(0.85, 1.35, 0.85);
        envelope.position.set(x, y, z);
        const chama = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffdb8e }));
        chama.position.set(x, y - 1.45, z);
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

  // Ameaça do corredor: fica no chão (ou à altitude do obstáculo) uma vez.
  // Sem isto, a cidade acompanhava a altitude e o rumo do LUS-222.
  if (p.fixa && g.userData.ancora) {
    g.userData.ancora.position.y = p.visual === 'canyon' ? 0 : p.y;
  }

  return g;
}

function mostrarAmeacasFixas(mundo, lista, local) {
  const ids = new Set(lista.map((o) => o.id));
  for (const child of [...mundo.ameaças.children]) {
    if (!ids.has(child.userData.id)) mundo.ameaças.remove(child);
  }
  for (const o of lista) {
    if (mundo.ameaças.children.some((child) => child.userData.id === o.id)) continue;
    const mesh = meshAmeaca(o, local, mundo.leve, mundo);
    mesh.userData.id = o.id;
    mundo.ameaças.add(mesh);
  }
  const fx = Math.sin(numHeading(local));
  const fz = Math.cos(numHeading(local));
  let foco = null;
  let melhor = Infinity;
  for (const child of mundo.ameaças.children) {
    const frente = (child.position.x - local.x) * fx + (child.position.z - local.z) * fz;
    if (frente > 24 && frente < melhor) {
      melhor = frente;
      foco = child;
    }
  }
  mundo.alvoLook = foco ? { x: foco.position.x, y: local.y + 2, z: foco.position.z } : null;
}

export function mostrarAmeacas(mundo, obstaculos, pose, opcoes = {}) {
  if (!mundo?.ameaças) return;
  const local = poseLocalAgora(mundo, pose);
  const lista = (Array.isArray(obstaculos) ? obstaculos : []).filter((o) => o && o.em_rota);
  if (lista.some(ameacaFixa)) {
    mostrarAmeacasFixas(mundo, lista, local);
    return;
  }
  limparGrupo(mundo.ameaças);
  mundo.alvoLook = null;
  const escalaDistancia = Math.max(0.1, Number(opcoes.escalaDistancia) || 15);
  const distanciaMinima = Math.max(25, Number(opcoes.distanciaMinima) || 25);
  const projectadas = lista
    .map((o) => ({ ...o, distancia_m: Math.max(distanciaMinima, o.distancia_m / escalaDistancia) }));
  for (const o of projectadas) {
    mundo.ameaças.add(meshAmeaca(o, local, mundo.leve, mundo));
  }
  const foco = projectadas[0];
  if (foco) mundo.alvoLook = pontoAmeaca(local, foco);
  // Uma vez, no instante do incidente: a malha fica no mundo e o avião
  // aproxima-se. Repetir isto em cada frame cola a ameaça ao nariz.
  ancorarVisuais(mundo, local);
}

export function posicionarBaloes(mundo, ameaca, voo, pose) {
  const marcador = mundo?.ameaças?.children.find((child) => child.userData.baloes);
  if (!marcador) return;
  if (!ameaca) {
    limparGrupo(mundo.ameaças);
    mundo.alvoLook = null;
    return;
  }
  const p = posicaoVisualBaloes(voo, ameaca, pose);
  marcador.position.set(p.x, p.y, p.z);
  // A câmara só aponta para uma ameaça ainda à frente da aeronave.
  mundo.alvoLook = (ameaca.zM - voo.zM) > 0 ? p : null;
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
    if (child.userData.fixa) continue;
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

/**
 * Ponto (coordenadas locais) a enquadrar na primeira ameaça: a posição da
 * malha (o pontoAmeaca do evento) à altura do seu topo — o voo do tráfego e
 * das aves, o cume do relevo. Uma vez por evento, não por frame.
 */
export function focoAmeaca(mundo) {
  const primeira = mundo?.ameaças?.children[0];
  if (!primeira) return null;
  const topo = new THREE.Box3().setFromObject(primeira).max.y;
  return { x: primeira.position.x, y: topo, z: primeira.position.z };
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

/**
 * Luzes de navegação em coordenadas do modelo (antes da escala 1,35 do
 * grupo; nariz em +Z, esquerda do piloto em +X): vermelha na ponta da asa
 * esquerda, verde na direita (pontas em x = ±7,9, corda da ponta de z 0,77 a
 * −0,34) e branca em (0; 0,6; −6,84), logo atrás do fim do cone de cauda
 * (z −6,72).
 */
const LUZES_NAV = [
  { nome: 'luz-nav-vermelha', cor: 0xff2a2a, pos: [7.96, 1.24, 0.5] },
  { nome: 'luz-nav-verde', cor: 0x2aff66, pos: [-7.96, 1.24, 0.5] },
  { nome: 'luz-nav-branca', cor: 0xffffff, pos: [0, 0.6, -6.84] },
];

function luzesNavegacao(aviao) {
  const geo = new THREE.SphereGeometry(0.18, 10, 8);
  return LUZES_NAV.map(({ nome, cor, pos }) => {
    const luz = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: cor }));
    luz.name = nome;
    luz.position.set(...pos);
    luz.visible = false;
    aviao.add(luz);
    return luz;
  });
}

export function criarCena(canvas, { leve = false, cenario = 'medevac', pose = null, pistas = [], apresentacao = true, destinos = [], nomesDestinos = {} } = {}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !leve,
    alpha: false,
    powerPreference: leve ? 'low-power' : 'default',
    logarithmicDepthBuffer: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, leve ? 1.25 : 1.75));
  // A cúpula do céu cobre todo o fundo; o preto só se vê se ela falhar.
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(48, 1, 0.5, 30000);
  camera.position.set(-95, 50, 22);

  // Cor, intensidade e direcção do sol vêm do céu (actualizarCeu), por frame.
  const sun = new THREE.DirectionalLight(0xfff1d8, 1.35);
  sun.position.set(-90, 70, 30);
  scene.add(sun, sun.target);
  // Cúpula, nevoeiro, luz hemisférica, nuvens e rastos; o nevoeiro fecha
  // antes da orla dos mosaicos carregados.
  const ceu = criarCeu(scene, { cenario, leve, alcanceTerrenoM: TAMANHO_MOSAICO_M * (leve ? 2 : 3) });

  let ambienteRT = null;
  // Só o LUS-222 usa MeshStandardMaterial: o ambiente dá-lhe reflexos suaves
  // sem mexer no resto da cena (Lambert).
  if (!leve) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const sala = new RoomEnvironment();
    // Guarda o render target: libertar só a textura não liberta o framebuffer.
    ambienteRT = pmrem.fromScene(sala, 0.04);
    scene.environment = ambienteRT.texture;
    scene.environmentIntensity = cenario === 'porto' ? 0.3 : 0.7;
    sala.dispose?.();
    pmrem.dispose();
    // Sombra própria do avião (asa sobre a fuselagem), com a câmara de sombra a seguir a pose.
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 140 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
  }
  const fill = new THREE.DirectionalLight(0xffffff, 0.35);
  fill.position.set(40, 30, -20);
  scene.add(fill);

  // Relevo em mosaicos com coordenadas absolutas; recentrarOrigem desloca o
  // grupo inteiro, por isso o terreno recebe sempre a pose absoluta.
  const geografia = new THREE.Group();
  const terreno = criarTerreno({ perfil: perfilTerreno(cenario), pistas, leve });
  geografia.add(terreno.grupo);
  if (pose) actualizarTerreno(terreno, pose.x, pose.z, Infinity);
  scene.add(geografia);

  const aviao = criarLus222({ leve });
  if (!leve) {
    aviao.traverse((o) => {
      if (o.isMesh && o.material?.isMeshStandardMaterial) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }
  const luzesNav = luzesNavegacao(aviao);
  scene.add(aviao);

  const ameaças = new THREE.Group();
  scene.add(ameaças);
  // Rota, destinos e seta da manobra (só nas missões; o piloto não tem destinos).
  const marcas = destinos.length ? criarMarcas(scene, destinos, nomesDestinos) : null;

  // Órbita à mão à volta do LUS-222 (arrastar, pinçar, roda). Sem pan: o
  // centro é sempre o avião; actualizarCamara move-o com o voo. Deixa ver o
  // avião por baixo (como no render oficial); o chão limita-se à parte.
  const controlos = new OrbitControls(camera, renderer.domElement);
  Object.assign(controlos, { enablePan: false, enableDamping: true, dampingFactor: 0.08, minDistance: 14, maxDistance: 420, maxPolarAngle: Math.PI * 0.8 });
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const mundo = {
    renderer,
    scene,
    camera,
    aviao,
    ameaças,
    geografia,
    terreno,
    marcas,
    ambienteRT,
    sol: sun,
    fill,
    // Valores de dia: a noite escala-os (escurecerAviao) sem os perder.
    intensidadesDia: { ambiente: scene.environmentIntensity, fill: fill.intensity },
    ceu,
    luzesNav,
    origemVisual: { x: 0, z: 0 },
    alvoLook: null,
    tAmeaca: 0,
    leve,
    cenario,
    controlos,
    camara: novaCamara(performance.now() / 1000, { abertura: apresentacao && !reduzido }),
    // Foco do evento em coordenadas ABSOLUTAS: sobrevive a recentrarOrigem.
    focoEvento: null,
    // Desvios da câmara e da mira em relação ao avião (não precisam de recentrar).
    desvioCamara: null,
    desvioMira: null,
    // Posição LOCAL do avião no frame anterior (recentrarOrigem desloca-a).
    alvoAnterior: null,
    arrastar: false,
  };
  // Os 4 s de regresso contam a partir de largar o gesto: enquanto arrasta,
  // cada 'change' renova a interacção.
  const tocar = () => { mundo.camara = registarInteracao(mundo.camara, performance.now() / 1000); };
  controlos.addEventListener('start', () => { mundo.arrastar = true; tocar(); });
  controlos.addEventListener('change', () => { if (mundo.arrastar) tocar(); });
  controlos.addEventListener('end', () => { mundo.arrastar = false; tocar(); });
  return mundo;
}

/**
 * Por frame, DEPOIS de recentrarOrigem e de actualizarCamara, com
 * `visual = { pose, poseLocal, ambiente, marcas? }`: o terreno carrega e larga
 * mosaicos com a pose ABSOLUTA (vivem em coordenadas absolutas dentro de
 * `geografia`, por isso a ordem face ao recentrar não importa); o céu usa a
 * pose LOCAL e a câmara já deste frame (a cúpula segue-a); as marcas da
 * missão (marcas-missao.js) usam a pose absoluta e a origem visual.
 */
export function actualizarCena(mundo, visual, dt = 0) {
  if (!mundo?.terreno) return;
  actualizarTerreno(mundo.terreno, visual.pose.x, visual.pose.z, 1);
  if (mundo.ceu && visual.poseLocal && visual.ambiente) actualizarCeuEAviao(mundo, visual, dt);
  // Depois do céu: os portais param no far do nevoeiro deste frame.
  if (mundo.marcas && visual.marcas) {
    actualizarMarcas(mundo.marcas, {
      ...visual.marcas,
      pose: visual.pose,
      poseLocal: visual.poseLocal,
      origem: mundo.origemVisual,
      ameacas: mundo.ameaças,
      ecra: { camera: mundo.camera, larguraPx: mundo.mundoLargura, alturaPx: mundo.mundoAltura },
    });
  }
}

function actualizarCeuEAviao(mundo, visual, dt) {
  const pal = actualizarCeu(mundo.ceu, {
    scene: mundo.scene,
    sol: mundo.sol,
    camera: mundo.camera,
    ambiente: visual.ambiente,
    pose: visual.poseLocal,
    origem: mundo.origemVisual,
    dt,
  });
  const acesas = pal.luzes > 0.05;
  for (const luz of mundo.luzesNav) luz.visible = acesas;
  escurecerAviao(mundo, pal);
}

/**
 * De noite os reflexos do ambiente e a luz de enchimento baixam até 25 %
 * (relativamente aos valores de dia de cada cenário): o avião escurece e as
 * luzes de navegação lêem-se. De dia (luzes = 0) nada muda.
 */
function escurecerAviao(mundo, pal) {
  const f = 1 - 0.75 * pal.luzes;
  mundo.scene.environmentIntensity = mundo.intensidadesDia.ambiente * f;
  mundo.fill.intensity = mundo.intensidadesDia.fill * f;
}

/**
 * Liberta a GPU ao sair da missão: o canvas reutiliza o mesmo contexto WebGL,
 * e renderer.dispose() sozinho deixava lá geometrias, texturas e sombras.
 * Materiais partilhados são libertados mais de uma vez; em Three isso é inócuo.
 */
export function largarCena(mundo) {
  if (!mundo) return;
  // O canvas é reutilizado na missão seguinte: tira-lhe os ouvintes da órbita.
  mundo.controlos?.dispose();
  if (mundo.terreno) largarTerreno(mundo.terreno);
  mundo.scene.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat().filter(Boolean)) {
      m.map?.dispose();
      m.roughnessMap?.dispose();
      m.dispose();
    }
    // Mapa de sombra do sol (render target próprio) e matrizes das nuvens.
    if (o.isLight || o.isInstancedMesh) o.dispose?.();
  });
  mundo.scene.environment?.dispose();
  mundo.ambienteRT?.dispose();
  mundo.renderer.dispose();
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
    if (mundo.alvoAnterior) {
      mundo.alvoAnterior.x -= x;
      mundo.alvoAnterior.z -= z;
    }
    origem.x = pose.x;
    origem.z = pose.z;
  }
  return poseLocalAgora(mundo, pose);
}

/** Pose absoluta → local com a origem visual actual (sem recentrar). */
export function poseLocalAgora(mundo, pose) {
  const o = mundo.origemVisual;
  return { ...pose, x: pose.x - o.x, z: pose.z - o.z };
}

export function aplicarPose(mundo, pose) {
  if (!mundo?.aviao) return;
  mundo.aviao.position.set(pose.x, pose.y, pose.z);
  mundo.aviao.rotation.order = 'YXZ';
  mundo.aviao.rotation.y = pose.heading;
  mundo.aviao.rotation.z = pose.bank;
  mundo.aviao.rotation.x = pose.pitch;
  actualizarHelices(mundo.aviao, pose.hélice);
  // O sol (direcção fixa no mundo, alvo no avião) é posto pelo céu: actualizarCena.
}

/**
 * Com ameaça à frente, puxa a mira da cauda um pouco para ela (limitado a
 * ~19°) sem virar a vista; ameaça já atrás do nariz não arrasta a câmara.
 */
function puxarMiraParaAmeaca(mira, pose, look, fit) {
  const fx = Math.sin(pose.heading);
  const fz = Math.cos(pose.heading);
  const peso = 0.06 * fit;
  const ax = mira.x + (look.x - mira.x) * peso - pose.x;
  const az = mira.z + (look.z - mira.z) * peso - pose.z;
  const frente = ax * fx + az * fz;
  const fade = Math.max(0, Math.min(1, (frente - 24) / 60));
  if (fade <= 0) return;
  const lat = az * fx - ax * fz;
  const latMax = frente * 0.18;
  const latC = Math.max(-latMax, Math.min(latMax, lat)) * fade;
  mira.x = pose.x + fx * frente - fz * latC;
  mira.z = pose.z + fz * frente + fx * latC;
}

/** Nunca abaixo do relevo nem do mar: uma consulta ao perfil por frame. */
function limitarAoChao(mundo) {
  const t = mundo.terreno;
  if (!t) return;
  const cam = mundo.camera;
  const o = mundo.origemVisual;
  const chao = Math.max(0, alturaTerreno(t.perfil, cam.position.x + o.x, cam.position.z + o.z, t.pistas)) + FOLGA_CHAO_M;
  if (cam.position.y < chao) cam.position.y = chao;
}

function focoLocal(mundo) {
  const f = mundo.focoEvento;
  if (!f) return null;
  return { x: f.x - mundo.origemVisual.x, y: f.y, z: f.z - mundo.origemVisual.z };
}

/**
 * Mão livre: a câmara acompanha o avião com o desvio que o utilizador
 * escolheu. Os eventos do OrbitControls já rodaram/afastaram a câmara entre
 * frames à volta da posição anterior; aqui soma-se só o avanço do avião.
 */
function seguirLivre(mundo, pose) {
  const cam = mundo.camera;
  const ctl = mundo.controlos;
  const ant = mundo.alvoAnterior;
  cam.position.x += pose.x - ant.x;
  cam.position.y += pose.y - ant.y;
  cam.position.z += pose.z - ant.z;
  ctl.target.set(pose.x, pose.y, pose.z);
  ctl.update();
  limitarAoChao(mundo);
  cam.lookAt(ctl.target);
  // Ao voltar a um modo automático, desliza a partir daqui (o livre só
  // corre depois do primeiro enquadrar, que cria os desvios).
  const d = mundo.desvioCamara;
  d.x = cam.position.x - pose.x;
  d.y = cam.position.y - pose.y;
  d.z = cam.position.z - pose.z;
  const m = mundo.desvioMira;
  m.x = 0;
  m.y = 0;
  m.z = 0;
}

/**
 * Modos automáticos: suaviza o DESVIO em relação ao avião, não a posição
 * absoluta. A 1:1 e a 8× (~700 m/s) a suavização absoluta deixava a câmara
 * ~200 m atrás; assim a distância não depende da velocidade.
 */
function enquadrar(mundo, modo, pose, dt) {
  const cam = mundo.camera;
  // Ecrã estreito (telemóvel em pé): afasta a câmara para a asa caber no quadro.
  const fit = Math.min(1, Math.max(0.42, (cam.aspect || 1) / 1.2));
  const alvo = alvoCamara(modo, pose, { fit, foco: modo === 'evento' ? focoLocal(mundo) : null });
  if (modo === 'cauda' && mundo.alvoLook) puxarMiraParaAmeaca(alvo.mira, pose, mundo.alvoLook, fit);
  const cx = alvo.pos.x - pose.x;
  const cy = alvo.pos.y - pose.y;
  const cz = alvo.pos.z - pose.z;
  const mx = alvo.mira.x - pose.x;
  const my = alvo.mira.y - pose.y;
  const mz = alvo.mira.z - pose.z;
  const dc = mundo.desvioCamara;
  const dm = mundo.desvioMira;
  if (!dc || !dm) {
    mundo.desvioCamara = { x: cx, y: cy, z: cz };
    mundo.desvioMira = { x: mx, y: my, z: mz };
  } else {
    const t = Math.min(dt, 0.08);
    const k = 1 - Math.exp(-K_CAMARA * t);
    const ky = 1 - Math.exp(-K_VERTICAL * t);
    dc.x += (cx - dc.x) * k;
    dc.y += (cy - dc.y) * ky;
    dc.z += (cz - dc.z) * k;
    dm.x += (mx - dm.x) * k;
    dm.y += (my - dm.y) * ky;
    dm.z += (mz - dm.z) * k;
  }
  const d = mundo.desvioCamara;
  const m = mundo.desvioMira;
  cam.position.set(pose.x + d.x, pose.y + d.y, pose.z + d.z);
  limitarAoChao(mundo);
  cam.lookAt(pose.x + m.x, pose.y + m.y, pose.z + m.z);
  // Um arrasto a meio de um modo automático roda à volta do avião.
  mundo.controlos.target.set(pose.x, pose.y, pose.z);
}

/**
 * Câmara por frame, com a pose LOCAL. Modos (camara-modos.js): abertura de
 * lado com a pintura legível, cauda, lado, evento (avião e ameaça no mesmo
 * quadro) e livre (órbita à mão, volta ao modo preferido 4 s depois de largar).
 * Devolve o modo aplicado.
 */
export function actualizarCamara(mundo, pose, dt) {
  const modo = modoCamara(mundo.camara, performance.now() / 1000);
  if (modo === 'livre' && mundo.alvoAnterior) seguirLivre(mundo, pose);
  else enquadrar(mundo, modo === 'livre' ? 'cauda' : modo, pose, dt);
  const ant = mundo.alvoAnterior ?? (mundo.alvoAnterior = { x: 0, y: 0, z: 0 });
  ant.x = pose.x;
  ant.y = pose.y;
  ant.z = pose.z;
  return modo;
}

/**
 * Enquadra avião e ameaça durante DURACAO_EVENTO_S (foco em coordenadas
 * locais). Sem ameaça não há enquadramento: o modo escolhido mantém-se.
 */
export function focarEvento(mundo, foco) {
  if (!mundo?.camara || !foco) return;
  const o = mundo.origemVisual;
  mundo.focoEvento = { x: foco.x + o.x, y: foco.y, z: foco.z + o.z };
  mundo.camara = registarEvento(mundo.camara, performance.now() / 1000);
}

/** Botão do dock: cauda → lado → livre. Devolve o novo modo preferido. */
export function alternarCamara(mundo) {
  mundo.camara = alternarPreferido(mundo.camara);
  return mundo.camara.preferido;
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
