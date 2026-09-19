import * as THREE from 'three';

/**
 * Mundo 3D: corredor de voo semi-urbano gerado a partir de uma semente.
 *
 * Tudo é medido em metros. O drone avança ao longo de -Z; cada "portão" é um
 * conjunto de obstáculos com uma abertura livre no meio. Os sensores reportam
 * folgas relativas a essa abertura, e é sobre esses números que os três pilotos
 * — humano, baseline geométrico e Jev — decidem.
 */

export const CORREDOR = {
  LIMITE_LATERAL: 55,   // m — meia-largura do corredor
  ALT_MIN: 12,          // m — altitude mínima de voo
  ALT_MAX: 155,         // m — tecto do corredor
  RAIO_DRONE: 3.2,      // m — meia-caixa de colisão
};

export const DIFICULDADES = {
  ensaio:  { espaco: [170, 220], abertura: [26, 19], label: 'Ensaio' },
  entrega: { espaco: [115, 155], abertura: [19, 13], label: 'Entrega' },
  denso:   { espaco: [95, 125], abertura: [17, 12], label: 'Urbano denso' },
};

export const V_FRENTE = 26;         // m/s — velocidade de cruzeiro (~94 km/h)
export const DISTANCIA_ALVO = 1300; // m até ao ponto de entrega (~50 s por ronda)

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

const TIPOS_PORTAO = ['canyon', 'cabo', 'grua', 'trafego', 'canyon', 'grua'];

const NOMES = {
  edificio: 'edifício',
  cabo: 'cabo de alta tensão',
  grua: 'grua de construção',
  drone: 'drone em rota cruzada',
  antena: 'mastro de antena',
  laje: 'plataforma elevada',
};

/**
 * Gera os portões do corredor. A abertura só pode deslocar-se entre portões
 * consecutivos o que o drone consegue acompanhar — nenhuma semente produz um
 * percurso impossível.
 */
export function gerarPercurso(seed, dificuldade) {
  const rnd = mulberry32(seed);
  const cfg = DIFICULDADES[dificuldade] ?? DIFICULDADES.entrega;
  const { LIMITE_LATERAL: L, ALT_MIN, ALT_MAX } = CORREDOR;

  const portoes = [];
  let z = 200;
  let ax = 0;
  let ay = (ALT_MIN + ALT_MAX) / 2;

  while (z < DISTANCIA_ALVO - 110) {
    const espaco = lerp(cfg.espaco[0], cfg.espaco[1], rnd());
    const hw = cfg.abertura[0] * lerp(0.9, 1.15, rnd());
    const hh = cfg.abertura[1] * lerp(0.9, 1.15, rnd());

    // o quanto o drone consegue deslocar-se até ao próximo portão
    const alcance = 0.45 * 12 * (espaco / V_FRENTE);
    const alvoX = lerp(-L + hw + 6, L - hw - 6, rnd());
    const alvoY = lerp(ALT_MIN + hh + 4, ALT_MAX - hh - 4, rnd());

    ax = clamp(ax + clamp(alvoX - ax, -alcance, alcance), -L + hw + 6, L - hw - 6);
    ay = clamp(ay + clamp(alvoY - ay, -alcance, alcance), ALT_MIN + hh + 4, ALT_MAX - hh - 4);

    const tipo = TIPOS_PORTAO[Math.floor(rnd() * TIPOS_PORTAO.length)];
    portoes.push({
      z, tipo,
      abertura: { x: ax, y: ay, hw, hh },
      pecas: construirPecas(tipo, z, { x: ax, y: ay, hw, hh }, rnd),
      passado: false,
    });

    z += espaco;
  }

  // silhueta urbana de fundo, fora do corredor
  const cidade = [];
  for (let i = 0; i < 260; i++) {
    const lado = rnd() < 0.5 ? -1 : 1;
    const x = lado * (L + 25 + rnd() * 320);
    const zz = -rnd() * (DISTANCIA_ALVO + 500) + 250;
    const alt = 18 + rnd() * 110;
    const larg = 14 + rnd() * 26;
    cidade.push({ x, z: zz, alt, larg, prof: 14 + rnd() * 26, tom: rnd() });
  }

  return { portoes, cidade, cfg, seed };
}

/** As peças físicas que rodeiam a abertura. Cada uma é uma caixa em metros. */
function construirPecas(tipo, z, ab, rnd) {
  const { LIMITE_LATERAL: L, ALT_MIN, ALT_MAX } = CORREDOR;
  const pecas = [];
  const esqFim = ab.x - ab.hw;
  const dirIni = ab.x + ab.hw;
  const baixoFim = ab.y - ab.hh;
  const cimaIni = ab.y + ab.hh;

  const caixa = (nome, x, y, zz, sx, sy, sz, extra = {}) =>
    pecas.push({ nome, x, y, z: zz, sx, sy, sz, ...extra });

  if (tipo === 'canyon') {
    // torres de habitação dos dois lados, abertura entre elas
    if (esqFim > -L) caixa('edificio', (-L + esqFim) / 2, (ALT_MAX + ALT_MIN) / 2 - 10, z,
      Math.max(6, esqFim + L), ALT_MAX + 40, 13, { janelas: true, tom: rnd() });
    if (dirIni < L) caixa('edificio', (dirIni + L) / 2, (ALT_MAX + ALT_MIN) / 2 - 10, z,
      Math.max(6, L - dirIni), ALT_MAX + 40, 13, { janelas: true, tom: rnd() });
    if (baixoFim > ALT_MIN + 4) caixa('laje', ab.x, (ALT_MIN - 20 + baixoFim) / 2, z,
      ab.hw * 2, baixoFim - (ALT_MIN - 20), 20, { tom: rnd() });
    if (cimaIni < ALT_MAX - 4) caixa('laje', ab.x, (cimaIni + ALT_MAX + 40) / 2, z,
      ab.hw * 2, ALT_MAX + 40 - cimaIni, 20, { tom: rnd() });
  } else if (tipo === 'cabo') {
    // linha de alta tensão a atravessar o corredor: passa-se por cima ou por baixo
    if (baixoFim > ALT_MIN) caixa('cabo', 0, baixoFim - 1.2, z, L * 2 + 40, 2.4, 2.4, { cabo: true });
    if (cimaIni < ALT_MAX) caixa('cabo', 0, cimaIni + 1.2, z, L * 2 + 40, 2.4, 2.4, { cabo: true });
    caixa('antena', -L - 6, (ALT_MIN + ALT_MAX) / 2, z, 5, ALT_MAX + 40, 5, { tom: 0.3 });
    caixa('antena', L + 6, (ALT_MIN + ALT_MAX) / 2, z, 5, ALT_MAX + 40, 5, { tom: 0.3 });
    if (esqFim > -L) caixa('edificio', (-L + esqFim) / 2, (ALT_MIN + ALT_MAX) / 2 - 10, z,
      Math.max(4, esqFim + L), ALT_MAX + 40, 12, { janelas: true, tom: rnd() });
    if (dirIni < L) caixa('edificio', (dirIni + L) / 2, (ALT_MIN + ALT_MAX) / 2 - 10, z,
      Math.max(4, L - dirIni), ALT_MAX + 40, 12, { janelas: true, tom: rnd() });
  } else if (tipo === 'grua') {
    // torre + lança horizontal; a abertura fica de um dos lados da torre
    const ladoTorre = ab.x > 0 ? -1 : 1;
    const torreX = ladoTorre * (L * 0.45);
    caixa('grua', torreX, (ALT_MIN + ALT_MAX) / 2, z, 4.5, ALT_MAX + 30, 4.5, { grua: true });
    if (cimaIni < ALT_MAX - 4) caixa('grua', 0, cimaIni + 2.5, z, L * 2, 5, 5, { grua: true });
    if (baixoFim > ALT_MIN + 4) caixa('grua', 0, baixoFim - 2.5, z, L * 2, 5, 5, { grua: true });
    if (esqFim > -L) caixa('edificio', (-L + esqFim) / 2, (ALT_MIN + ALT_MAX) / 2 - 12, z,
      Math.max(4, esqFim + L), ALT_MAX + 40, 12, { janelas: true, tom: rnd() });
    if (dirIni < L) caixa('edificio', (dirIni + L) / 2, (ALT_MIN + ALT_MAX) / 2 - 12, z,
      Math.max(4, L - dirIni), ALT_MAX + 40, 12, { janelas: true, tom: rnd() });
  } else {
    // tráfego: drones parados em formação, abertura entre eles
    const n = 5;
    for (let i = 0; i < n; i++) {
      const dx = lerp(-L + 8, L - 8, i / (n - 1));
      if (Math.abs(dx - ab.x) < ab.hw + 5) continue;
      caixa('drone', dx, ab.y + (rnd() - 0.5) * 30, z, 7, 3, 7, { trafego: true });
    }
    if (baixoFim > ALT_MIN + 4) caixa('laje', ab.x, (ALT_MIN - 20 + baixoFim) / 2, z,
      ab.hw * 2.2, baixoFim - (ALT_MIN - 20), 16, { tom: rnd() });
    if (cimaIni < ALT_MAX - 4) caixa('drone', ab.x, cimaIni + 4, z, ab.hw * 2, 6, 7, { trafego: true });
    if (esqFim > -L) caixa('edificio', (-L + esqFim) / 2, (ALT_MIN + ALT_MAX) / 2 - 14, z,
      Math.max(4, esqFim + L), ALT_MAX + 40, 12, { janelas: true, tom: rnd() });
    if (dirIni < L) caixa('edificio', (dirIni + L) / 2, (ALT_MIN + ALT_MAX) / 2 - 14, z,
      Math.max(4, L - dirIni), ALT_MAX + 40, 12, { janelas: true, tom: rnd() });
  }

  return pecas;
}

export function nomeDoPortao(tipo) {
  return {
    canyon: NOMES.edificio,
    cabo: NOMES.cabo,
    grua: NOMES.grua,
    trafego: NOMES.drone,
  }[tipo] ?? 'obstáculo';
}

// ------------------------------------------------------------------ cena

export function criarCena(canvas, percurso) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  renderer.setClearColor(0x0d1620);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x16232f, 150, 620);

  const camera = new THREE.PerspectiveCamera(72, 16 / 9, 0.5, 1400);

  // luz: entardecer urbano
  scene.add(new THREE.HemisphereLight(0x9fc4e0, 0x2a2118, 1.9));
  const sol = new THREE.DirectionalLight(0xffd9a0, 1.5);
  sol.position.set(-60, 90, -150);
  scene.add(sol);

  // céu
  const ceu = new THREE.Mesh(
    new THREE.SphereGeometry(900, 24, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        alto: { value: new THREE.Color(0x0c1a28) },
        baixo: { value: new THREE.Color(0xd08a4e) },
      },
      vertexShader: 'varying float h; void main(){ h = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 alto; uniform vec3 baixo; varying float h; void main(){ gl_FragColor = vec4(mix(baixo, alto, clamp(h*1.5+0.18,0.0,1.0)), 1.0); }',
    }),
  );
  scene.add(ceu);

  // solo
  const solo = new THREE.Mesh(
    new THREE.PlaneGeometry(2600, 3200),
    new THREE.MeshLambertMaterial({ map: texturaSolo(), color: 0x6f7a6a }),
  );
  solo.rotation.x = -Math.PI / 2;
  solo.position.set(0, 0, -DISTANCIA_ALVO / 2);
  scene.add(solo);

  // silhueta urbana de fundo (uma só malha instanciada)
  const geoCaixa = new THREE.BoxGeometry(1, 1, 1);
  const cidade = new THREE.InstancedMesh(
    geoCaixa,
    new THREE.MeshLambertMaterial({ color: 0x4a5765 }),
    percurso.cidade.length,
  );
  const m4 = new THREE.Matrix4();
  const cor = new THREE.Color();
  percurso.cidade.forEach((b, i) => {
    m4.makeScale(b.larg, b.alt, b.prof);
    m4.setPosition(b.x, b.alt / 2, b.z);
    cidade.setMatrixAt(i, m4);
    cidade.setColorAt(i, cor.setHSL(0.58, 0.1, 0.16 + b.tom * 0.16));
  });
  cidade.instanceMatrix.needsUpdate = true;
  scene.add(cidade);

  // peças dos portões
  const matJanelas = new THREE.MeshLambertMaterial({ map: texturaFachada() });
  const matBetao = new THREE.MeshLambertMaterial({ color: 0x6b7480 });
  const matCabo = new THREE.MeshBasicMaterial({ color: 0x1b1f24 });
  const matGrua = new THREE.MeshLambertMaterial({ color: 0xe0a33a });
  const matDrone = new THREE.MeshLambertMaterial({ color: 0xcfd8e2 });

  for (const portao of percurso.portoes) {
    for (const p of portao.pecas) {
      const mat =
        p.cabo ? matCabo :
        p.grua ? matGrua :
        p.trafego ? matDrone :
        p.janelas ? matJanelas.clone() : matBetao.clone();

      if (p.janelas && mat.color) mat.color.setHSL(0.57, 0.08, 0.42 + (p.tom ?? 0.5) * 0.22);
      else if (!p.cabo && !p.grua && !p.trafego && mat.color) mat.color.setHSL(0.09, 0.06, 0.38 + (p.tom ?? 0.5) * 0.18);

      const malha = new THREE.Mesh(geoCaixa, mat);
      malha.scale.set(p.sx, p.sy, p.sz);
      malha.position.set(p.x, p.y, -p.z);
      if (p.janelas) {
        malha.material.map = texturaFachada();
        malha.material.map.repeat.set(Math.max(1, p.sx / 9), Math.max(1, p.sy / 9));
        malha.material.map.wrapS = malha.material.map.wrapT = THREE.RepeatWrapping;
      }
      scene.add(malha);
    }

    // moldura luminosa a marcar a abertura livre — quatro barras, porque a
    // espessura de linha do WebGL é sempre 1px e uma LineSegments desaparece à distância
    const ab = portao.abertura;
    const matMoldura = new THREE.MeshBasicMaterial({ color: 0x35d6a4, transparent: true, opacity: 0.55 });
    const E = 0.9;
    const barras = [
      [ab.hw * 2 + E, E, ab.x, ab.y + ab.hh],
      [ab.hw * 2 + E, E, ab.x, ab.y - ab.hh],
      [E, ab.hh * 2, ab.x - ab.hw, ab.y],
      [E, ab.hh * 2, ab.x + ab.hw, ab.y],
    ];
    const moldura = new THREE.Group();
    for (const [sx, sy, px, py] of barras) {
      const b = new THREE.Mesh(geoCaixa, matMoldura);
      b.scale.set(sx, sy, E);
      b.position.set(px, py, 0);
      moldura.add(b);
    }
    moldura.position.set(0, 0, -portao.z);
    scene.add(moldura);
    portao.moldura = moldura;
  }

  // ponto de entrega
  const destino = new THREE.Mesh(
    new THREE.CylinderGeometry(16, 16, 1.5, 24),
    new THREE.MeshBasicMaterial({ color: 0x35d6a4, transparent: true, opacity: 0.65 }),
  );
  destino.position.set(0, 1, -DISTANCIA_ALVO);
  scene.add(destino);

  const fpv = construirFpv();
  camera.add(fpv);
  scene.add(camera);

  return { renderer, scene, camera, fpv, destino };
}

/**
 * Estrutura do drone nos cantos do campo de visão, como numa câmara FPV real:
 * vêem-se as pontas dos braços e o disco das hélices, nada mais.
 */
function construirFpv() {
  const g = new THREE.Group();
  const matBraco = new THREE.MeshLambertMaterial({ color: 0x232c36 });
  const matHelice = new THREE.MeshBasicMaterial({
    color: 0x9fb4c6, transparent: true, opacity: 0.22, side: THREE.DoubleSide,
  });
  const geoBraco = new THREE.BoxGeometry(0.34, 0.028, 0.028);
  const geoHelice = new THREE.RingGeometry(0.085, 0.1, 24);

  // afastado do near plane e encostado aos cantos: só se vê o quadro, nunca o corredor
  const Z = -1.7;
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const x = sx * 1.34;
    const y = sy > 0 ? 0.62 : -0.74;

    const braco = new THREE.Mesh(geoBraco, matBraco);
    braco.position.set(x - sx * 0.15, y - sy * 0.04, Z);
    braco.rotation.z = -sx * sy * 0.36;
    g.add(braco);

    const helice = new THREE.Mesh(geoHelice, matHelice);
    helice.position.set(x, y, Z - 0.04);
    helice.rotation.x = -Math.PI / 2;   // plano puro: lê-se como disco de hélice, não como argola
    helice.userData.helice = true;
    g.add(helice);
  }

  return g;
}

function texturaSolo() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#3f4a3c';
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = '#55604f';
  for (let i = 0; i < 40; i++) {
    x.fillRect(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 40, 20 + Math.random() * 40);
  }
  x.strokeStyle = '#2b3329';
  x.lineWidth = 6;
  for (let i = 0; i <= 256; i += 64) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.stroke();
    x.beginPath(); x.moveTo(0, i); x.lineTo(256, i); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(40, 50);
  return t;
}

function texturaFachada() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#5a6472';
  x.fillRect(0, 0, 64, 64);
  for (let iy = 4; iy < 60; iy += 12) {
    for (let ix = 4; ix < 60; ix += 12) {
      const aceso = Math.random() < 0.34;
      x.fillStyle = aceso ? '#ffd79a' : '#39424d';
      x.fillRect(ix, iy, 7, 7);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Actualiza a câmara FPV a partir do estado de voo. */
export function actualizarCamara(mundo, voo, dt) {
  const { camera, fpv } = mundo;
  camera.position.set(voo.x, voo.y, -voo.s);

  // inclinação proporcional à velocidade: o veículo aponta para onde acelera
  const alvoRoll = -voo.vx / 62;
  const alvoPitch = voo.vy / 78;
  camera.rotation.z += (alvoRoll - camera.rotation.z) * Math.min(1, dt * 5);
  camera.rotation.x += (alvoPitch - camera.rotation.x) * Math.min(1, dt * 5);

  for (const filho of fpv.children) {
    if (filho.userData.helice) filho.rotation.z += dt * 40;
  }
}

export function redimensionar(mundo, largura, altura) {
  mundo.renderer.setSize(largura, altura, false);
  mundo.camera.aspect = largura / altura;
  mundo.camera.updateProjectionMatrix();
}
