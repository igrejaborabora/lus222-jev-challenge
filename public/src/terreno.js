import * as THREE from 'three';
import { alturaTerreno, prepararPistas } from './relevo.js';
import { mosaicosAManter, mosaicosNecessarios, planearMosaicos, TAMANHO_MOSAICO_M } from './mosaicos.js';

// Paleta dessaturada (identidade preto e branco): o relevo lê-se pela luz.
const COR = {
  praia: new THREE.Color(0xa9a38f),
  baixo: new THREE.Color(0x56604c),
  medio: new THREE.Color(0x767a70),
  alto: new THREE.Color(0xc9cdc6),
  pista: new THREE.Color(0x3c4146),
};
// Plano da pista: asfalto esbatido no verde baixo, para não ser um disco preto.
const COR_PLANO = COR.pista.clone().lerp(COR.baixo, 0.55);
const FUNDO_VISIVEL_M = -6;

// A cor da pista vem da distância a uma pista (dentro do raio do plano) e não
// da altura: senão a orla, entre 0 e o plano da pista (2 m), pintava-se de asfalto.
function noPlanoDaPista(pistas, x, z) {
  for (const p of pistas) {
    const dx = x - p.x;
    const dz = z - p.z;
    const r = p.raioPlanoM ?? 1200;
    if (dx * dx + dz * dz <= r * r) return true;
  }
  return false;
}

function corDe(h, x, z, pistas, alvo) {
  if (noPlanoDaPista(pistas, x, z)) return alvo.copy(COR_PLANO);
  if (h < 8) return alvo.copy(COR.praia);
  if (h < 160) return alvo.copy(COR.baixo).lerp(COR.medio, h / 160);
  return alvo.copy(COR.medio).lerp(COR.alto, Math.min(1, (h - 160) / 500));
}

/**
 * Alturas numa grelha com um vértice de margem à volta do mosaico: as normais
 * saem de diferenças centrais e ficam iguais dos dois lados de cada fronteira
 * (computeVertexNormals só vê um lado e deixava costuras na luz).
 */
function alturasComMargem(t, x0, z0, passo) {
  const n = t.segmentos + 3;
  const alturas = new Float32Array(n * n);
  for (let r = 0; r < n; r++) {
    const z = z0 + (r - 1) * passo;
    for (let c = 0; c < n; c++) {
      const h = alturaTerreno(t.perfil, x0 + (c - 1) * passo, z, t.pistas);
      alturas[r * n + c] = Math.max(FUNDO_VISIVEL_M, h);
    }
  }
  return alturas;
}

function geometriaMosaico(t, i, j) {
  const T = TAMANHO_MOSAICO_M;
  const seg = t.segmentos;
  const geo = new THREE.PlaneGeometry(T, T, seg, seg);
  // Depois de rodar, o vértice (ix, iy) fica em x = ix·passo − T/2, z = iy·passo − T/2.
  geo.rotateX(-Math.PI / 2);
  const cx = (i + 0.5) * T;
  const cz = (j + 0.5) * T;
  const passo = T / seg;
  const x0 = cx - T / 2;
  const z0 = cz - T / 2;
  const n = seg + 3;
  const alturas = alturasComMargem(t, x0, z0, passo);
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const cores = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let iy = 0; iy <= seg; iy++) {
    for (let ix = 0; ix <= seg; ix++) {
      const k = iy * (seg + 1) + ix;
      const g = (iy + 1) * n + (ix + 1);
      const y = alturas[g];
      pos.setY(k, y);
      // Normal de um campo de alturas: (−∂h/∂x, 1, −∂h/∂z), normalizada.
      const nx = (alturas[g - 1] - alturas[g + 1]) / (2 * passo);
      const nz = (alturas[g - n] - alturas[g + n]) / (2 * passo);
      const inv = 1 / Math.hypot(nx, 1, nz);
      nor.setXYZ(k, nx * inv, inv, nz * inv);
      corDe(y, x0 + ix * passo, z0 + iy * passo, t.pistas, c);
      cores[k * 3] = c.r;
      cores[k * 3 + 1] = c.g;
      cores[k * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  return { geo, cx, cz };
}

export function criarTerreno({ perfil, pistas = [], leve = false }) {
  const grupo = new THREE.Group();
  grupo.name = 'terreno';
  const raio = leve ? 2 : 3;
  // Mar raso que acompanha o avião; o relevo submerso fica por baixo dele.
  const lado = TAMANHO_MOSAICO_M * (2 * raio + 3);
  const mar = new THREE.Mesh(new THREE.PlaneGeometry(lado, lado), new THREE.MeshLambertMaterial({ color: 0x1f2e38 }));
  mar.rotation.x = -Math.PI / 2;
  grupo.add(mar);
  return {
    grupo,
    mar,
    perfil,
    // Uma vez aqui (baseM, ilhéu), nunca por vértice.
    pistas: prepararPistas(perfil, pistas),
    raio,
    segmentos: leve ? 24 : 48,
    material: new THREE.MeshLambertMaterial({ vertexColors: true }),
    mosaicos: new Map(),
    // Célula (mosaico) onde o avião estava no último plano; NaN obriga a planear.
    celulaI: NaN,
    celulaJ: NaN,
    // Mosaicos do último plano ainda por criar (do mais próximo ao mais longe).
    porCriar: [],
    proximo: 0,
  };
}

/**
 * Posição ABSOLUTA do avião (metros do mundo): os mosaicos vivem no grupo da
 * geografia, que recentrarOrigem desloca como um todo. Só volta a planear
 * quando o avião muda de célula (o plano só depende dela); entretanto cria até
 * `orcamento` mosaicos por chamada da lista pendente, do mais próximo ao mais
 * longe. Ao replanear, liberta os que saíram do anel de histerese.
 */
export function actualizarTerreno(t, x, z, orcamento = 1) {
  t.mar.position.set(x, 0, z);
  const ci = Math.floor(x / TAMANHO_MOSAICO_M);
  const cj = Math.floor(z / TAMANHO_MOSAICO_M);
  if (ci !== t.celulaI || cj !== t.celulaJ) {
    t.celulaI = ci;
    t.celulaJ = cj;
    const plano = planearMosaicos(
      t.mosaicos,
      mosaicosNecessarios(x, z, { raio: t.raio }),
      mosaicosAManter(x, z, { raio: t.raio }),
    );
    for (const chave of plano.remover) {
      const mesh = t.mosaicos.get(chave);
      t.grupo.remove(mesh);
      mesh.geometry.dispose();
      t.mosaicos.delete(chave);
    }
    t.porCriar = plano.criar;
    t.proximo = 0;
  }
  // Sem célula nova e sem pendentes, isto não aloca nada.
  let criados = 0;
  while (criados < orcamento && t.proximo < t.porCriar.length) {
    const m = t.porCriar[t.proximo++];
    if (t.mosaicos.has(m.chave)) continue;
    const { geo, cx, cz } = geometriaMosaico(t, m.i, m.j);
    const mesh = new THREE.Mesh(geo, t.material);
    mesh.name = `mosaico ${m.chave}`;
    mesh.position.set(cx, 0, cz);
    t.grupo.add(mesh);
    t.mosaicos.set(m.chave, mesh);
    criados++;
  }
}

export function largarTerreno(t) {
  for (const mesh of t.mosaicos.values()) {
    t.grupo.remove(mesh);
    mesh.geometry.dispose();
  }
  t.mosaicos.clear();
  t.porCriar = [];
  t.proximo = 0;
  t.celulaI = NaN;
  t.celulaJ = NaN;
  t.material.dispose();
  t.mar.geometry.dispose();
  t.mar.material.dispose();
}
