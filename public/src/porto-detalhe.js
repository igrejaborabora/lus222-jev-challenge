import * as THREE from 'three';
import { alturaTerreno, distanciaAoRio } from './relevo.js';
import { mulberry32 } from './decisao.js';

/**
 * Porto ilustrativo no referencial já usado pelo Douro e pelas pontes.
 * Quarteirões, vias, parques e volumes reconhecíveis, sem imagens de mapa ou
 * falsa precisão cartográfica. Toda a geometria fica ancorada à geografia.
 * Edifícios, telhados e árvores usam instâncias; vias usam uma malha única.
 */
const BAIRROS = [
  { x: 2000, z: 154450, rx: 3400, rz: 1700, passo: 170, altura: 15 },
  { x: 2150, z: 150800, rx: 2400, rz: 1300, passo: 200, altura: 12 },
  { x: 5600, z: 157700, rx: 1300, rz: 1800, passo: 190, altura: 20 },
];
const PARQUES = [
  { x: 6050, z: 155950, rx: 600, rz: 750 },
  { x: 3800, z: 153650, rx: 250, rz: 220 },
];
const MARCOS = [
  { id: 'clerigos', x: 2750, z: 153650, raio: 95 },
  { id: 'casa-da-musica', x: 4450, z: 155050, raio: 120 },
  { id: 'estadio', x: -800, z: 155500, raio: 220 },
];
const VIAS = [
  { pontos: [[2900, 153200], [3100, 154150], [3500, 154650], [4450, 155050], [6200, 155950]], largura: 28 },
  { pontos: [[900, 154850], [2500, 155200], [4450, 155050], [6100, 155300]], largura: 22 },
  { pontos: [[-700, 153600], [100, 154600], [800, 156000], [1100, 158000], [300, 161800]], largura: 30 },
  { pontos: [[5550, 153300], [6000, 154450], [6200, 156000], [5900, 157800], [5450, 159500]], largura: 24 },
  { pontos: [[2000, 150000], [3400, 150750], [4700, 151500]], largura: 24 },
];
const PALETA_CASAS = [0xc3bba8, 0xe1d9c5, 0xbab8af, 0xc8b59a, 0xd5cabc, 0xa9b0b3];
const PALETA_TELHADOS = [0x996149, 0xac7254, 0x785b50, 0x9b8063, 0x747679];

const dentro = (p, x, z, margem = 0) => ((x - p.x) / (p.rx + margem)) ** 2 + ((z - p.z) / (p.rz + margem)) ** 2 < 1;

function distanciaSegmento(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

function faixaLivre(x, z, pistas, margem = 0) {
  return !pistas.some((p) => Math.hypot(x - p.x, z - p.z) < (p.raioPlanoM ?? 1200) + 250 + margem);
}

function loteLivre(perfil, pistas, x, z, margem = 0) {
  if (!faixaLivre(x, z, pistas, margem) || alturaTerreno(perfil, x, z, pistas) < 10) return false;
  if (perfil.rio && distanciaAoRio(perfil.rio, x, z) < 330 + margem) return false;
  if (PARQUES.some((p) => dentro(p, x, z, margem))) return false;
  if (MARCOS.some((p) => Math.hypot(x - p.x, z - p.z) < p.raio + margem)) return false;
  return !VIAS.some((via) => via.pontos.some((p, i) => i > 0 && distanciaSegmento(x, z, via.pontos[i - 1], p) < via.largura / 2 + margem));
}

function instancias(grupo, nome, geometria, material, itens) {
  const mesh = new THREE.InstancedMesh(geometria, material, itens.length);
  mesh.name = nome;
  const obj = new THREE.Object3D();
  const cor = new THREE.Color();
  itens.forEach((item, i) => {
    obj.position.set(item.x, item.y, item.z);
    obj.scale.set(item.largura, item.altura, item.fundo);
    obj.rotation.set(0, item.rotacao ?? 0, 0);
    obj.updateMatrix();
    mesh.setMatrixAt(i, obj.matrix);
    mesh.setColorAt(i, cor.setHex(item.cor ?? 0xffffff));
  });
  mesh.computeBoundingSphere();
  grupo.add(mesh);
  return mesh;
}

function cidade(grupo, perfil, pistas, leve) {
  const rnd = mulberry32(130222);
  const casas = [];
  const telhados = [];
  for (const bairro of BAIRROS) {
    const passo = bairro.passo;
    for (let x = bairro.x - bairro.rx; x < bairro.x + bairro.rx; x += passo) {
      for (let z = bairro.z - bairro.rz; z < bairro.z + bairro.rz; z += passo) {
        if (!dentro(bairro, x, z)) continue;
        for (let k = 0; k < (leve ? 2 : 4); k++) {
          const bx = x + (k % 2 ? 1 : -1) * passo * 0.22 + (rnd() - 0.5) * 12;
          const bz = z + (k < 2 ? -1 : 1) * passo * 0.22 + (rnd() - 0.5) * 12;
          if (!loteLivre(perfil, pistas, bx, bz, 35)) continue;
          const h = bairro.altura * (0.65 + rnd() * 1.2);
          const y = alturaTerreno(perfil, bx, bz, pistas);
          const largura = 22 + rnd() * 21;
          const fundo = 28 + rnd() * 24;
          const rotacao = (Math.round(rnd() * 4) - 2) * 0.08;
          casas.push({ x: bx, z: bz, y: y + h / 2 - 3, largura, fundo, altura: h + 6, rotacao, cor: PALETA_CASAS[Math.floor(rnd() * PALETA_CASAS.length)] });
          telhados.push({ x: bx, z: bz, y: y + h + 1, largura: largura + 2, fundo: fundo + 2, altura: 3, rotacao, cor: PALETA_TELHADOS[Math.floor(rnd() * PALETA_TELHADOS.length)] });
        }
      }
    }
  }
  instancias(grupo, 'porto-quarteiroes', new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), casas);
  instancias(grupo, 'porto-telhados', new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial(), telhados);
}

/** Faixas trianguladas de 30 m acompanham o relevo, sem estradas a atravessar o rio. */
function vias(grupo, perfil, pistas) {
  const vertices = [];
  const faixas = [...VIAS];
  for (const b of BAIRROS) {
    for (let x = b.x - b.rx + b.passo / 2; x < b.x + b.rx; x += b.passo) {
      faixas.push({ pontos: [[x, b.z - b.rz], [x, b.z + b.rz]], largura: 10 });
    }
    for (let z = b.z - b.rz + b.passo / 2; z < b.z + b.rz; z += b.passo) {
      faixas.push({ pontos: [[b.x - b.rx, z], [b.x + b.rx, z]], largura: 10 });
    }
  }
  const valido = (x, z) => alturaTerreno(perfil, x, z, pistas) > 9 && faixaLivre(x, z, pistas, 0) && (!perfil.rio || distanciaAoRio(perfil.rio, x, z) > 290) && !PARQUES.some((p) => dentro(p, x, z)) && !MARCOS.some((p) => Math.hypot(x - p.x, z - p.z) < p.raio);
  for (const via of faixas) {
    for (let i = 1; i < via.pontos.length; i++) {
      const a = via.pontos[i - 1];
      const b = via.pontos[i];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      const n = Math.ceil(len / 30);
      const nx = -dz / len * via.largura / 2;
      const nz = dx / len * via.largura / 2;
      for (let k = 0; k < n; k++) {
        const x1 = a[0] + dx * k / n;
        const z1 = a[1] + dz * k / n;
        const x2 = a[0] + dx * (k + 1) / n;
        const z2 = a[1] + dz * (k + 1) / n;
        if (!valido(x1, z1) || !valido(x2, z2)) continue;
        const pontos = [[x1 + nx, z1 + nz], [x1 - nx, z1 - nz], [x2 + nx, z2 + nz], [x2 - nx, z2 - nz]];
        const v = pontos.map(([x, z]) => [x, alturaTerreno(perfil, x, z, pistas) + 1.4, z]);
        for (const indice of [0, 2, 1, 1, 2, 3]) vertices.push(...v[indice]);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: 0x626263, side: THREE.DoubleSide }));
  mesh.name = 'porto-ruas-e-avenidas';
  grupo.add(mesh);
}

function parques(grupo, perfil, pistas, leve) {
  const rnd = mulberry32(170222);
  const copas = [];
  for (const p of PARQUES) {
    const passo = leve ? 90 : 60;
    for (let x = p.x - p.rx; x <= p.x + p.rx; x += passo) {
      for (let z = p.z - p.rz; z <= p.z + p.rz; z += passo) {
        const bx = x + (rnd() - 0.5) * passo;
        const bz = z + (rnd() - 0.5) * passo;
        const y = alturaTerreno(perfil, bx, bz, pistas);
        if (!dentro(p, bx, bz) || y < 10) continue;
        const h = 9 + rnd() * 9;
        copas.push({ x: bx, z: bz, y: y + h * 0.5, largura: h, fundo: h, altura: h, cor: rnd() < 0.5 ? 0x445a43 : 0x627249 });
      }
    }
  }
  instancias(grupo, 'porto-parques', new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial(), copas);
}

function marcos(grupo, perfil, pistas) {
  const pedra = new THREE.MeshLambertMaterial({ color: 0xd8ccaf });
  const branco = new THREE.MeshLambertMaterial({ color: 0xe0dfd1 });
  const vidro = new THREE.MeshLambertMaterial({ color: 0x3c5661 });
  const relva = new THREE.MeshLambertMaterial({ color: 0x577244 });
  const adicionar = (g, geo, mat, x, y, z) => {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    g.add(mesh);
    return mesh;
  };
  for (const p of MARCOS) {
    const g = new THREE.Group();
    g.name = `porto-${p.id}`;
    g.position.set(p.x, alturaTerreno(perfil, p.x, p.z, pistas), p.z);
    if (p.id === 'clerigos') {
      adicionar(g, new THREE.BoxGeometry(25, 22, 55), pedra, 0, 10, -30);
      adicionar(g, new THREE.BoxGeometry(17, 46, 17), pedra, 0, 22, 12);
      adicionar(g, new THREE.BoxGeometry(13, 18, 13), pedra, 0, 51, 12);
      adicionar(g, new THREE.CylinderGeometry(4, 7, 12, 8), pedra, 0, 66, 12);
      adicionar(g, new THREE.ConeGeometry(4, 8, 8), branco, 0, 76, 12);
    } else if (p.id === 'casa-da-musica') {
      // Poliedro inclinado e abertura envidraçada: silhueta, não uma réplica arquitetónica.
      const casa = adicionar(g, new THREE.DodecahedronGeometry(45, 0), branco, 0, 28, 0);
      casa.scale.set(1.18, 0.82, 0.9);
      casa.rotation.y = 0.2;
      adicionar(g, new THREE.BoxGeometry(33, 22, 2), vidro, 0, 23, 33);
    } else {
      const campo = adicionar(g, new THREE.BoxGeometry(110, 1, 72), relva, 0, 1, 0);
      campo.rotation.y = -0.2;
      for (const lado of [-1, 1]) {
        adicionar(g, new THREE.BoxGeometry(165, 22, 20), branco, 0, 11, lado * 55);
        const cobertura = adicionar(g, new THREE.BoxGeometry(170, 3, 32), branco, 0, 25, lado * 51);
        cobertura.rotation.x = lado * 0.18;
        adicionar(g, new THREE.BoxGeometry(20, 16, 95), pedra, lado * 76, 8, 0);
      }
    }
    grupo.add(g);
  }
}

export function criarPortoDetalhe(geografia, { perfil, pistas = [], leve = false } = {}) {
  const grupo = new THREE.Group();
  grupo.name = 'porto-detalhe';
  if (!perfil?.rio) return grupo;
  cidade(grupo, perfil, pistas, leve);
  vias(grupo, perfil, pistas);
  parques(grupo, perfil, pistas, leve);
  marcos(grupo, perfil, pistas);
  geografia.add(grupo);
  return grupo;
}
