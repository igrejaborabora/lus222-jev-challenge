import * as THREE from 'three';
import { FOTO_PORTO, coordenadasFotoPorto, pesoFotoPorto } from './porto-aerial.js';
import { alturaTerreno, perfilComAgua, prepararPistas, urbanoEm, ruido2, distanciaAoRio } from './relevo.js';
import { mosaicosAManter, mosaicosNecessarios, planearMosaicos, TAMANHO_MOSAICO_M } from './mosaicos.js';

// Paleta dessaturada (identidade preto e branco): o relevo lê-se pela luz,
// declive e transição entre praia, vale, rocha e cume.
const COR = {
  submerso: new THREE.Color(0x1f363d),
  espuma: new THREE.Color(0xc5c4b8),
  praia: new THREE.Color(0xb2ac97),
  baixo: new THREE.Color(0x4d5945),
  vale: new THREE.Color(0x5b6550),
  medio: new THREE.Color(0x73786d),
  rocha: new THREE.Color(0x646560),
  alto: new THREE.Color(0xcfd3cc),
  pista: new THREE.Color(0x3c4146),
};
// Plano da pista: asfalto esbatido no verde baixo, para não ser um disco preto.
const COR_PLANO = COR.baixo.clone();
const COR_MAR = new THREE.Color(0x213a46);
const COR_CIDADE = new THREE.Color(0x9a9485);
const FUNDO_VISIVEL_M = -6;
// Chão abaixo disto (acima do mar) é praia, mas só num perfil com água: no
// Alentejo e no corredor do piloto (2 a 8 m) é campo, não deserto.
const PRAIA_ATE_M = 8;

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

function corDe(h, x, z, ny, t, alvo) {
  if (noPlanoDaPista(t.pistas, x, z)) return alvo.copy(COR_PLANO);
  if (h < 0) {
    return alvo.copy(COR.submerso).lerp(COR.espuma, Math.max(0, Math.min(1, (h + 3.5) / 3.5)) * 0.45);
  }
  // Uma plataforma aeroportuária baixa no interior não é praia. A cor
  // costeira acompanha a costa/vale, sem alterar as alturas da simulação.
  const costa = t.perfil?.agua === 'costa';
  const pertoDaAgua = !costa || x > t.perfil.costaX + t.perfil.recorteM * ruido2(z / 7000, 3.7, t.perfil.seed + 5) - 180 || (t.perfil.rio && distanciaAoRio(t.perfil.rio, x, z) < 240);
  if (t.praia && h < PRAIA_ATE_M && pertoDaAgua) {
    const fPraia = Math.max(0, Math.min(1, (h - 0.8) / (PRAIA_ATE_M - 0.8)));
    alvo.copy(COR.espuma).lerp(COR.praia, Math.min(1, h / 1.8));
    return alvo.lerp(COR.baixo, fPraia * fPraia * 0.65);
  }
  const micro = ruido2(x / 320, z / 320, (t.perfil?.seed ?? 7) + 19) * 0.06;
  if (h < 70) alvo.copy(COR.baixo).lerp(COR.vale, Math.max(0, Math.min(1, h / 70 + micro)));
  else if (h < 180) alvo.copy(COR.vale).lerp(COR.medio, Math.max(0, Math.min(1, (h - 70) / 110 + micro)));
  else alvo.copy(COR.medio).lerp(COR.alto, Math.min(1, (h - 180) / 480));
  // Escarpas e encostas íngremes expõem granito/xisto.
  const declive = Math.max(0, Math.min(1, (0.985 - ny) * 14));
  if (declive > 0.01) alvo.lerp(COR.rocha, declive * 0.72);
  if (t.perfil?.cidade) alvo.lerp(COR_CIDADE, urbanoEm(t.perfil, x, z, h) * 0.58);
  return alvo;
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
      corDe(y, x0 + ix * passo, z0 + iy * passo, inv, t, c);
      cores[k * 3] = c.r;
      cores[k * 3 + 1] = c.g;
      cores[k * 3 + 2] = c.b;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  if (t.foto) {
    const uvPeso = new Float32Array(pos.count * 3);
    for (let k=0;k<pos.count;k++) {
      const x=cx+pos.getX(k),z=cz+pos.getZ(k),{u,v}=coordenadasFotoPorto(x,z);
      uvPeso.set([u,v,pesoFotoPorto(x,z,pos.getY(k),t.pistas)],k*3);
    }
    geo.setAttribute('fotoUVPeso',new THREE.BufferAttribute(uvPeso,3));
  }
  if (t.urbano) {
    const urbano = new Float32Array(pos.count);
    for (let iy = 0; iy <= seg; iy++) {
      for (let ix = 0; ix <= seg; ix++) {
        urbano[iy * (seg + 1) + ix] = urbanoEm(t.perfil, x0 + ix * passo, z0 + iy * passo, alturas[(iy + 1) * n + (ix + 1)]);
      }
    }
    geo.setAttribute('urbano', new THREE.BufferAttribute(urbano, 1));
  }
  return { geo, cx, cz };
}

/**
 * Com cidade no perfil, o chão ganha um brilho urbano quente de noite (atributo
 * `urbano` por vértice, intensidade num uniforme); sem cidade, o material de sempre.
 */
function materialDoTerreno(perfil) {
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  if (!perfil?.cidade) {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vAltTerreno;\nvarying float vDistCam;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAltTerreno = position.y;\nvec4 mvTerreno = modelViewMatrix * vec4(transformed, 1.0);\nvDistCam = -mvTerreno.z;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vAltTerreno;\nvarying float vDistCam;')
        .replace('#include <fog_fragment>', `#include <fog_fragment>
          #ifdef USE_FOG
            float brumaVale = exp(-max(0.0, vAltTerreno - 4.0) * 0.018) * smoothstep(260.0, 2600.0, vDistCam) * 0.28;
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, brumaVale);
          #endif`);
    };
    return { material, urbano: null };
  }
  const urbano = { value: 0 };
  const foto = { mapa:{value:null}, intensidade:{value:0}, pedida:false, textura:null, loading:null, libertada:false };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.brilhoUrbano = urbano;
    shader.uniforms.fotoPorto = foto.mapa;
    shader.uniforms.pesoFoto = foto.intensidade;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float urbano;\nvarying float vUrbano;\nattribute vec3 fotoUVPeso;\nvarying vec3 vFoto;\nvarying float vAltTerreno;\nvarying float vDistCam;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvUrbano = urbano; vFoto = fotoUVPeso; vAltTerreno = position.y;\nvec4 mvTerreno = modelViewMatrix * vec4(transformed, 1.0);\nvDistCam = -mvTerreno.z;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vUrbano;\nuniform float brilhoUrbano;\nvarying vec3 vFoto;\nuniform sampler2D fotoPorto;\nuniform float pesoFoto;\nvarying float vAltTerreno;\nvarying float vDistCam;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        if (pesoFoto > 0.0 && vFoto.z > 0.0) {
          vec3 foto = texture2D(fotoPorto, clamp(vFoto.xy, 0.0, 1.0)).rgb;
          float coberta = 1.0 - smoothstep(0.91, 0.99, min(foto.r, min(foto.g, foto.b)));
          diffuseColor.rgb = mix(diffuseColor.rgb, foto, vFoto.z * pesoFoto * coberta);
        }`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.62, 0.28) * pow(vUrbano, 1.5) * brilhoUrbano;')
      .replace('#include <fog_fragment>', `#include <fog_fragment>
        #ifdef USE_FOG
          float brumaVale = exp(-max(0.0, vAltTerreno - 3.0) * 0.022) * smoothstep(220.0, 2400.0, vDistCam) * 0.32;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, brumaVale);
        #endif`);
  };
  return { material, urbano, foto };
}

function materialDoMar() {
  const mat = new THREE.MeshLambertMaterial({ color: COR_MAR });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMarPos;\nvarying vec3 vMarView;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 marMundo = modelMatrix * vec4(transformed, 1.0);\nvMarPos = marMundo.xz;\nvMarView = cameraPosition - marMundo.xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vMarPos;\nvarying vec3 vMarView;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float onda1 = sin(vMarPos.x * 0.018 + vMarPos.y * 0.011) * cos(vMarPos.y * 0.021 - vMarPos.x * 0.007);
        float onda2 = sin(vMarPos.x * 0.065 - vMarPos.y * 0.048) * 0.5;
        float onda3 = cos(vMarPos.x * 0.14 + vMarPos.y * 0.11) * 0.25;
        float crista = smoothstep(0.30, 0.86, onda1 + onda2 * 0.45 + onda3 * 0.25);
        vec3 V = normalize(vMarView + vec3(0.0, 1e-4, 0.0));
        vec3 N = normalize(vec3((onda1 + onda2) * 0.09, 1.0, (onda2 - onda3) * 0.09));
        float fresnel = pow(1.0 - max(0.0, V.y), 3.2);
        vec3 solDirMar = normalize(vec3(-0.92, 0.28, 0.28));
        vec3 H = normalize(V + solDirMar);
        float spec = pow(max(0.0, dot(N, H)), 48.0) * 0.55;
        diffuseColor.rgb = mix(diffuseColor.rgb * (0.92 + 0.08 * onda1), diffuseColor.rgb * 1.32 + vec3(0.06, 0.09, 0.11), crista * 0.36);
        diffuseColor.rgb += vec3(0.10, 0.15, 0.18) * fresnel * 0.45 + vec3(1.0, 0.86, 0.62) * spec;
      `);
  };
  return mat;
}

export function criarTerreno({ perfil, pistas = [], leve = false }) {
  const grupo = new THREE.Group();
  grupo.name = 'terreno';
  const raio = leve ? 2 : 3;
  // Mar raso que acompanha o avião; o relevo submerso fica por baixo dele.
  const lado = TAMANHO_MOSAICO_M * (2 * raio + 3);
  const mar = new THREE.Mesh(new THREE.PlaneGeometry(lado, lado), materialDoMar());
  mar.rotation.x = -Math.PI / 2;
  grupo.add(mar);
  const { material, urbano, foto } = materialDoTerreno(perfil);
  return {
    grupo,
    mar,
    perfil,
    // Uma vez aqui (baseM, ilhéu), nunca por vértice.
    pistas: prepararPistas(perfil, pistas),
    praia: perfilComAgua(perfil),
    raio,
    segmentos: leve ? 24 : 48,
    material,
    urbano,
    foto,
    leve,
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

/**
 * De noite (`luzes` de 0 a 1, da paleta do céu) o chão e o mar escurecem para
 * as luzes das cidades se lerem; o avião e as nuvens ficam com a luz do céu.
 */
export function escurecerTerreno(t, luzes) {
  t.material.color.setScalar(1 - 0.42 * luzes);
  t.mar.material.color.copy(COR_MAR).multiplyScalar(1 - 0.28 * luzes);
  if (t.urbano) t.urbano.value = 0.1 * luzes;
}

/** Lazy and bounded: returning to illustrated ground never waits for a texture. */
export async function definirFotoTerreno(t, activa) {
  const f=t?.foto;
  if (!f || f.libertada) return 'off';
  f.pedida=activa;
  f.intensidade.value=activa && f.textura ? 1 : 0;
  if (!activa) return 'off';
  if (!f.textura && !f.loading) {
    f.loading=new THREE.TextureLoader().loadAsync(t.leve?FOTO_PORTO.mobile:FOTO_PORTO.desktop)
      .then(texture=>{
        if(f.libertada){texture.dispose();return;}
        texture.colorSpace=THREE.SRGBColorSpace;
        texture.anisotropy=4;
        f.textura=texture;f.mapa.value=texture;
        f.intensidade.value=f.pedida?1:0;
      }).finally(()=>{f.loading=null;});
  }
  try { await f.loading; } catch { return f.pedida?'error':'off'; }
  return f.libertada||!f.pedida?'off':'ready';
}

export function largarTerreno(t) {
  if(t.foto){t.foto.libertada=true;t.foto.textura?.dispose();t.foto.mapa.value=null;}
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
