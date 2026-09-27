import * as THREE from 'three';
import { approachGates, approachReference, runwayReference } from './runway-reference.js';

function caixas(grupo, nome, itens, cor) {
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: cor }), itens.length);
  mesh.name = nome;
  const obj = new THREE.Object3D();
  for (let i = 0; i < itens.length; i++) {
    const [x, y, z, w, h, d] = itens[i];
    obj.position.set(x, y, z); obj.scale.set(w, h, d); obj.updateMatrix();
    mesh.setMatrixAt(i, obj.matrix);
  }
  mesh.computeBoundingSphere(); grupo.add(mesh);
  return mesh;
}

function pontos(grupo, nome, lista, tamanho) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(lista.flatMap(p => p.slice(0, 3)), 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(lista.flatMap(p => p.slice(3, 6)), 3));
  const mesh = new THREE.Points(geo, new THREE.PointsMaterial({ size: tamanho, sizeAttenuation: false, vertexColors: true, toneMapped: false }));
  mesh.name = nome; grupo.add(mesh);
  return mesh;
}

function numero(grupo, texto, z, direction) {
  const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e7e8d9'; ctx.font = 'bold 98px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(texto, 64, 64);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(15, 27), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }));
  mesh.rotation.set(-Math.PI / 2, 0, direction < 0 ? Math.PI : 0);
  mesh.position.set(0, 0.2, z); grupo.add(mesh);
}

function corredor(grupo, pista, direction) {
  const vertices = [];
  // A geometria é local à pista; a única transformação é a do grupo pai.
  const local = { ...pista, x: 0, z: 0, heading: 0, y: 0 };
  for (const g of approachGates(local, direction)) {
    const w = g.halfWidthM, h = g.halfHeightM;
    const cantos = [[-w, g.y - h, g.z], [w, g.y - h, g.z], [w, g.y + h, g.z], [-w, g.y + h, g.z]];
    for (let i = 0; i < 4; i++) vertices.push(...cantos[i], ...cantos[(i + 1) % 4]);
    // Centro vazio para manter visíveis a soleira e o ponto de mira.
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  const linhas = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x65dcca, transparent: true, opacity: 0.55, depthWrite: false }));
  linhas.name = `approach-guidance-${direction}`; linhas.visible = false; grupo.add(linhas);
  return linhas;
}

export function criarPistasVisuais(geografia, pistas, { leve = false } = {}) {
  return pistas.filter(p => (p.raioPlanoM ?? 0) >= 1900).map(p => {
    const pista = runwayReference(p);
    const grupo = new THREE.Group(); grupo.name = 'runway-reference';
    grupo.position.set(pista.x, pista.y, pista.z); grupo.rotation.y = pista.heading;
    const half = pista.comprimentoM / 2, width = pista.larguraM;
    caixas(grupo, 'runway-asphalt', [[0, 0.045, 0, width, 0.08, pista.comprimentoM], [-155, 0.045, 0, 22, 0.08, pista.comprimentoM - 260], [-290, 0.045, 300, 310, 0.08, 740], ...[-half + 180, 0, half - 180].map(z => [-82, 0.045, z, 160, 0.08, 22])], 0x353d41);
    const tinta = [[-width / 2 + 1, 0.1, 0, 0.5, 0.04, pista.comprimentoM], [width / 2 - 1, 0.1, 0, 0.5, 0.04, pista.comprimentoM]];
    for (let z = -half + 230; z < half - 230; z += 90) tinta.push([0, 0.1, z, 1.5, 0.04, 30]);
    for (const direction of [1, -1]) {
      const soleira = -direction * half;
      for (const side of [-1, 1]) {
        for (let i = 0; i < 4; i++) tinta.push([side * (5 + i * 4.5), 0.1, soleira + direction * 35, 2.7, 0.04, 30]);
        tinta.push([side * 12, 0.1, soleira + direction * 300, 6, 0.04, 45]);
        for (const dist of [450, 600, 750]) for (let i = 0; i < (dist < 600 ? 3 : dist < 750 ? 2 : 1); i++) tinta.push([side * (10 + i * 4), 0.1, soleira + direction * dist, 1.8, 0.04, 22]);
      }
      // Designação do rumo SIMULADO; não é uma carta do aeroporto real.
      const degrees = ((pista.heading + (direction < 0 ? Math.PI : 0)) * 180 / Math.PI + 360) % 360;
      const designacao = Math.round(degrees / 10) % 36 || 36;
      numero(grupo, String(designacao).padStart(2, '0'), soleira + direction * 110, direction);
    }
    caixas(grupo, 'runway-markings', tinta, 0xe4e5d7);
    const amarelo = [[-155, 0.11, 0, 0.4, 0.04, pista.comprimentoM - 300]];
    for (let z = -10; z <= 610; z += 110) amarelo.push([-300, 0.11, z, 140, 0.04, 0.6], [-235, 0.11, z - 20, 0.6, 0.04, 40]);
    caixas(grupo, 'taxiway-markings', amarelo, 0xc6b164);
    // Terminal, mangas e torre são volumes ilustrativos; nunca obstáculos físicos.
    caixas(grupo, 'airport-terminal', [[-480, 10, 300, 80, 20, 560], [-520, 6, 300, 110, 12, 250], [-440, 36, -180, 12, 72, 12], ...[30, 140, 250, 360, 470, 580].map(z => [-395, 8, z, 90, 6, 12])], 0xcbd0cb);
    caixas(grupo, 'airport-glass', [[-437, 11, 300, 3, 12, 540], [-440, 73, -180, 24, 12, 24]], 0x42626a);
    const lights = [];
    for (let z = -half; z <= half; z += leve ? 120 : 60) for (const side of [-1, 1]) lights.push([side * (width / 2 + 1), 0.65, z, 1, 0.9, 0.65]);
    const ends = [1, -1].map(direction => {
      const soleira = -direction * half;
      const approach = [];
      for (let x = -22; x <= 22; x += 5.5) approach.push([x, 0.7, soleira, 0.3, 1, 0.45]);
      for (let d = 60; d <= 720; d += 60) approach.push([0, 0.7, soleira - direction * d, 1, 0.93, 0.83]);
      for (const d of [300, 600]) for (let x = -22; x <= 22; x += 5.5) approach.push([x, 0.7, soleira - direction * d, 1, 0.93, 0.83]);
      const luzes = pontos(grupo, `runway-approach-lights-${direction}`, approach, leve ? 2 : 3);
      const papi = pontos(grupo, `runway-papi-${direction}`, [0, 1, 2, 3].map(i => [direction * (width / 2 + 18 + i * 7), 1, soleira + direction * 300, 1, 1, 1]), 5);
      return { direction, papi, luzes, guia: corredor(grupo, pista, direction), whites: -1 };
    });
    pontos(grupo, 'runway-edge-lights', lights, 2.4);
    geografia.add(grupo);
    return { pista, grupo, ends };
  });
}

export function actualizarPistasVisuais(pistas, pose, guiaVisual = false) {
  for (const p of pistas) {
    p.grupo.visible = Math.hypot(pose.x - p.pista.x, pose.z - p.pista.z) < 16000;
    if (!p.grupo.visible) continue;
    for (const end of p.ends) {
      const r = approachReference(p.pista, pose, end.direction);
      end.papi.visible = r.visible;
      end.luzes.visible = r.distanceM > -100;
      end.guia.visible = Boolean(guiaVisual) && r.distanceM > -150 && r.distanceM < 6000;
      if (r.whites === end.whites) continue;
      const colors = end.papi.geometry.attributes.color;
      for (let i = 0; i < 4; i++) colors.setXYZ(i, 1, i < r.whites ? 0.96 : 0.045, i < r.whites ? 0.85 : 0.025);
      colors.needsUpdate = true; end.whites = r.whites;
    }
  }
}
