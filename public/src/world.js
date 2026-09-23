import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { criarAves, criarCanyon, criarGuerra } from './cenas.js';
import { actualizarHelices, criarLus222 } from './lus222.js';
import { offsetLateral, pontoAmeaca } from './decisao.js';
import { posicaoVisualBaloes } from './ameaca-visual.js';

const APRESENTACAO_S = 2;

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
  const local = { ...pose, x: pose.x - mundo.origemVisual.x, z: pose.z - mundo.origemVisual.z };
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

export function criarCena(canvas, { leve = false, cenario = 'medevac', apresentacao = true } = {}) {
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
  scene.add(sun, sun.target);

  // Só o LUS-222 usa MeshStandardMaterial: o ambiente dá-lhe reflexos suaves
  // sem mexer no resto da cena (Lambert).
  if (!leve) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = cenario === 'porto' ? 0.3 : 0.7;
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

  const aviao = criarLus222({ leve });
  if (!leve) {
    aviao.traverse((o) => {
      if (o.isMesh && o.material?.isMeshStandardMaterial) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }
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
    sol: sun,
    origemVisual: { x: 0, z: 0 },
    alvoLook: null,
    tAmeaca: 0,
    leve,
    cenario,
    apresentacaoS: apresentacao === false || matchMedia('(prefers-reduced-motion: reduce)').matches ? APRESENTACAO_S : 0,
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
  actualizarHelices(mundo.aviao, pose.hélice);
  const sol = mundo.sol;
  if (sol?.castShadow) {
    sol.target.position.set(pose.x, pose.y, pose.z);
    sol.position.set(pose.x - 54, pose.y + 42, pose.z + 18);
  }
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
  if (mundo.apresentacaoS < APRESENTACAO_S) {
    // Plano de apresentação: meia órbita lenta à volta do LUS-222 antes da vista chase.
    mundo.apresentacaoS += Math.min(dt, 0.08);
    const u = mundo.apresentacaoS / APRESENTACAO_S;
    const ang = pose.heading + Math.PI * (0.62 - 0.55 * u);
    const raio = 30 + 10 * u;
    cam.position.set(pose.x + Math.sin(ang) * raio, pose.y + 6 + 5 * u, pose.z + Math.cos(ang) * raio);
    cam.lookAt(pose.x, pose.y + 0.6, pose.z);
    mundo.camaraPronta = true;
    return;
  }
  const look = mundo.alvoLook;
  // Distância fixa: abrir o enquadramento a cada dodge fazia a vista saltar.
  // Ecrã estreito (telemóvel em pé): afasta a cauda para a asa caber no quadro.
  const fit = Math.min(1, Math.max(0.42, (cam.aspect || 1) / 1.2));
  const back = 30 / fit;
  const up = 7.5 / fit;
  const ahead = 46;
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
    const peso = 0.06 * fit;
    const ax = miraX + (look.x - miraX) * peso - pose.x;
    const az = miraZ + (look.z - miraZ) * peso - pose.z;
    const frente = ax * fx + az * fz;
    const fade = Math.max(0, Math.min(1, (frente - 24) / 60));
    if (fade > 0) {
      const lat = az * fx - ax * fz;
      const latMax = frente * 0.18;
      const latC = Math.max(-latMax, Math.min(latMax, lat)) * fade;
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
