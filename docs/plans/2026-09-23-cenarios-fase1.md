# Cenários LUS-222 — Fase 1 (base comum) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pôr o mundo 3D da missão em escala 1:1 e do lado certo, com terreno em mosaicos, céu, nuvens, nevoeiro e vento gerados pelo estado da simulação, fita de rota, alfinetes e seta da manobra, câmara com abertura lateral e órbita manual, e sem fugas de memória gráfica.

**Architecture:** A lógica nova vive em módulos puros em `public/src/` (sem Three.js), reexportados em `lib/*.mjs` e testados com `node --test`: `escala.js`, `relevo.js`, `mosaicos.js`, `ambiente-visual.js`, `rota-visual.js` e `camara-modos.js`. Os módulos Three.js `terreno.js`, `ceu.js` e `marcas-missao.js` consomem-nos. `world.js` passa a expor `actualizarCena(mundo, visual, dt)`, e `main.js` constrói o estado visual a partir da missão em cada frame. A física, o JEV, o supervisor e os replays não mudam.

**Tech Stack:** JavaScript ES modules, Three.js 0.186 por importmap (CDN jsdelivr, `three/addons/` incluído, por isso `OrbitControls` não é uma dependência nova), testes `node --test lib/*.test.mjs`, `eslint`.

**Desenho:** `docs/plans/2026-09-23-cenarios-lus222-design.md`.

**Convenções do repositório:** nomes e comentários em português de Portugal, dois espaços, ponto e vírgula, funções pequenas. Cada módulo puro novo tem um reexport em `lib/<nome>.mjs` (ex.: `lib/lus222-forma.mjs`). Commits no imperativo, com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Servidor local:** `PORT=43200 node --env-file=.env <scratchpad>/devserver.mjs .` na raiz do repo (serve `public/` e `/api/jev`). Para verificar sem gastar Gateway, usar **Ver replay gravado**.

---

### Task 0: Linha de base

**Step 1:** `git switch feat/cenarios-fase1 && npm test && npm run lint`
Esperado: `pass 96`, `fail 0`, lint sem erros.

---

### Task 1: Escala 1:1 e lado certo (módulo `escala.js`)

O simulador usa `+xM` = direita do piloto ("direita" faz o rumo subir e o avião ir para +xM). No Three.js, com o nariz em +Z e a câmara atrás da cauda, a direita do ecrã é −X. Hoje `parametrosVoo()` copia `xM` sem espelhar, por isso quando o painel diz "Direita" o avião vira para a esquerda no ecrã.

**Files:**
- Create: `public/src/escala.js`
- Create: `lib/escala.mjs`
- Test: `lib/escala.test.mjs`

**Step 1: Write the failing test**

```js
// lib/escala.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { poseMissao, pontoMundo } from './escala.mjs';

const voo = { xM: 0, zM: 25000, altitudeM: 480, rumoRad: 0, bankRad: 0, pitchRad: 0, tempoS: 0 };

describe('escala 1:1 do mundo da missão', () => {
  it('altitude e distâncias em metros, sem compressão', () => {
    const p = poseMissao(voo);
    assert.equal(p.y, 480);
    assert.equal(p.z, 25000);
  });

  it('a direita do simulador (+xM) fica à direita do ecrã (−X)', () => {
    assert.ok(poseMissao({ ...voo, xM: 50 }).x < 0);
    assert.deepEqual(pontoMundo(22000, 135000), { x: -22000, z: 135000 });
  });

  it('o avião avança na direcção do seu heading no mundo', () => {
    const r = 0.3;
    const a = poseMissao({ ...voo, rumoRad: r });
    const b = poseMissao({ ...voo, rumoRad: r, xM: Math.sin(r) * 10, zM: voo.zM + Math.cos(r) * 10 });
    assert.ok(Math.abs(b.x - a.x - Math.sin(a.heading) * 10) < 1e-9);
    assert.ok(Math.abs(b.z - a.z - Math.cos(a.heading) * 10) < 1e-9);
  });

  it('pranchamento à direita baixa a asa direita (rotation.z positivo)', () => {
    assert.ok(poseMissao({ ...voo, bankRad: 0.3 }).bank > 0);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test lib/escala.test.mjs`
Expected: FAIL com `Cannot find module .../lib/escala.mjs`.

**Step 3: Write minimal implementation**

```js
// public/src/escala.js
/**
 * Mundo 3D da missão em metros (1:1). O simulador usa +xM = direita do
 * piloto; no Three.js, com o nariz em +Z e a câmara atrás da cauda, a
 * direita do ecrã é −X. O mundo espelha x e o rumo: o que o JEV chama
 * «direita» vê-se à direita.
 */
export function pontoMundo(xM, zM) {
  return { x: -xM, z: zM };
}

export function poseMissao(voo, comando = null) {
  return {
    x: -voo.xM,
    y: voo.altitudeM,
    z: voo.zM,
    heading: -voo.rumoRad,
    // Com x espelhado, bank positivo do simulador (direita) é rotation.z positivo (asa direita em baixo).
    bank: voo.bankRad,
    pitch: -voo.pitchRad,
    hélice: voo.tempoS * 16,
    dodge: Boolean(comando && voo.tempoS < comando.evasaoAteS),
  };
}
```

```js
// lib/escala.mjs
export { poseMissao, pontoMundo } from '../public/src/escala.js';
```

**Step 4: Run test to verify it passes**

Run: `node --test lib/escala.test.mjs`
Expected: PASS (4 testes).

**Step 5: Commit**

```bash
git add public/src/escala.js lib/escala.mjs lib/escala.test.mjs
git commit -m "Pôr a missão em escala 1:1 e com a direita do JEV à direita do ecrã"
```

---

### Task 2: Ligar a escala 1:1 à missão e aos balões

**Files:**
- Modify: `public/src/ameaca-visual.js` (inteiro, 8 linhas)
- Modify: `public/src/main.js:148-152` (`parametrosVoo`) e `public/src/main.js:534` (`mostrarAmeacas` do evento)
- Modify: `lib/simulacao.test.mjs:148-149` e `:158`

**Step 1: Actualizar o teste existente dos balões para 1:1**

Em `lib/simulacao.test.mjs`, substituir:

```js
    const p = posicaoVisualBaloes(antes, ameaca, { x: 0, y: 42, z: 0 });
    assert.ok(p.z > 50 && p.z < 55, '800 m são projetados a ~53 unidades locais');
```

por:

```js
    const p = posicaoVisualBaloes(antes, ameaca, { x: 0, y: 42, z: 0 });
    assert.ok(p.z > 790 && p.z < 810, '800 m à frente ficam a 800 m no mundo (1:1)');
    assert.ok(p.x < 0, 'margem à direita do simulador fica à direita do ecrã (−X)');
```

**Step 2: Run test to verify it fails**

Run: `node --test lib/simulacao.test.mjs`
Expected: FAIL em "800 m à frente ficam a 800 m".

**Step 3: Implementar**

`public/src/ameaca-visual.js` fica:

```js
/** Posição dos balões no mundo 1:1, relativa à pose (x espelhado, ver escala.js). */
export function posicaoVisualBaloes(voo, ameaca, pose) {
  return {
    x: pose.x - (ameaca.xM - voo.xM),
    y: pose.y + (ameaca.altitudeM - voo.altitudeM),
    z: pose.z + (ameaca.zM - voo.zM),
  };
}
```

Em `public/src/main.js`: acrescentar `import { poseMissao } from './escala.js';` junto dos outros imports e substituir `parametrosVoo()` por:

```js
function parametrosVoo() {
  if (emModoPiloto()) return poseAviao(estado.piloto.automato);
  return poseMissao(estado.missao.voo, estado.missao.comando);
}
```

Na linha 534, passar a escala 1:1: `estado.mundoApi.mostrarAmeacas(estado.mundo, entrada.geometria.obstaculos, parametrosVoo(), { escalaDistancia: 1 });`

Em `public/src/world.js`, na `criarCena`, para a escala real: `new THREE.WebGLRenderer({ ..., logarithmicDepthBuffer: true })` e `new THREE.PerspectiveCamera(48, 1, 0.5, 30000)`.

**Step 4: Correr os testes**

Run: `npm test && npm run lint`
Expected: todos passam.

**Step 5: Verificar no browser**

Replay São João: o avião voa a ~480 m e, no evento dos balões, a ordem "Direita + Subir" mostra o avião a pranchar e a virar para a **direita do ecrã**. (A geografia ainda é a antiga e fica minúscula; é esperado até à Task 5.)

**Step 6: Commit**

```bash
git add public/src/ameaca-visual.js public/src/main.js public/src/world.js lib/simulacao.test.mjs
git commit -m "Desenhar a missão e os balões em metros reais, do lado certo"
```

---

### Task 3: Relevo determinístico por cenário (módulo `relevo.js`)

**Files:**
- Create: `public/src/relevo.js`
- Create: `lib/relevo.mjs`
- Test: `lib/relevo.test.mjs`

**Step 1: Write the failing test**

```js
// lib/relevo.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alturaTerreno, perfilTerreno, pistasDaMissao, ruido2, PLANO_PISTA_M } from './relevo.mjs';
import { criarMissao } from './simulacao.mjs';

describe('relevo procedural', () => {
  it('ruído determinístico e limitado a [-1, 1]', () => {
    for (let i = 0; i < 200; i++) {
      const v = ruido2(i * 0.37, i * 0.71, 3);
      assert.ok(v >= -1 && v <= 1);
      assert.equal(v, ruido2(i * 0.37, i * 0.71, 3));
    }
  });

  it('costa do Porto: mar a oeste (+X, esquerda do piloto) e terra a leste', () => {
    const p = perfilTerreno('porto');
    assert.ok(alturaTerreno(p, 20000, 80000) < 0, 'mar');
    assert.ok(alturaTerreno(p, -8000, 80000) > 0, 'terra');
  });

  it('SAR: a rota passa sobre o mar, com a costa à direita (−X)', () => {
    const p = perfilTerreno('sar');
    assert.ok(alturaTerreno(p, 0, 90000) < 0);
    assert.ok(alturaTerreno(p, -12000, 90000) > 0);
  });

  it('pistas ficam planas e em terra, mesmo à beira-mar', () => {
    for (const cenario of ['porto', 'medevac', 'carga', 'sar']) {
      const m = criarMissao(cenario, 222);
      const p = perfilTerreno(cenario);
      for (const pista of pistasDaMissao(m.destinos)) {
        assert.equal(alturaTerreno(p, pista.x, pista.z, [pista]), PLANO_PISTA_M, `${cenario}/${pista.id}`);
        assert.ok(Math.abs(alturaTerreno(p, pista.x + 600, pista.z, [pista]) - PLANO_PISTA_M) < 1e-9);
      }
    }
  });

  it('o relevo nunca sobe até ao corredor de cruzeiro (480 m) perto da rota', () => {
    for (const cenario of ['porto', 'medevac', 'carga', 'sar']) {
      const p = perfilTerreno(cenario);
      let max = -Infinity;
      for (let z = 25000; z <= 165000; z += 500) for (let x = -1500; x <= 1500; x += 500) max = Math.max(max, alturaTerreno(p, x, z));
      assert.ok(max < 300, `${cenario}: ${max.toFixed(0)} m`);
    }
  });
});
```

Criar também `lib/simulacao.mjs` se ainda não existir: `export * from '../public/src/simulacao.js';` (confirmar com `ls lib/simulacao.mjs`; os testes actuais importam de `../public/src/simulacao.js`, e esse import directo também serve).

**Step 2: Run test to verify it fails**

Run: `node --test lib/relevo.test.mjs`
Expected: FAIL com `Cannot find module .../lib/relevo.mjs`.

**Step 3: Write minimal implementation**

```js
// public/src/relevo.js
import { pontoMundo } from './escala.js';

// Relevo procedural determinístico, em coordenadas do mundo (metros, x
// espelhado). Nível do mar = 0; terra ≥ 2 m. Sem dependências.
export const PLANO_PISTA_M = 2;

function hash(ix, iz, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

const suave = (t) => t * t * (3 - 2 * t);
const entre01 = (v) => Math.min(1, Math.max(0, v));

/** Ruído de valor 2D em [-1, 1]. */
export function ruido2(x, z, seed = 1) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const u = suave(x - ix);
  const v = suave(z - iz);
  const a = hash(ix, iz, seed);
  const b = hash(ix + 1, iz, seed);
  const c = hash(ix, iz + 1, seed);
  const d = hash(ix + 1, iz + 1, seed);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}

/** Ruído fractal em [0, 1]. */
export function fbm(x, z, seed = 1, oitavas = 4) {
  let soma = 0;
  let amp = 0.5;
  let freq = 1;
  let norma = 0;
  for (let i = 0; i < oitavas; i++) {
    soma += amp * ruido2(x * freq, z * freq, seed + i * 17);
    norma += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return 0.5 + 0.5 * (soma / norma);
}

// Posições do mundo (x já espelhado). Açores: ilhas afastadas da rota para
// o relevo não subir ao corredor de cruzeiro.
const PERFIS = {
  porto: { agua: 'costa', costaX: 7000, recorteM: 1800, amplitude: 90, escala: 1 / 2600, seed: 11 },
  sar: { agua: 'costa', costaX: -6000, recorteM: 1500, amplitude: 120, escala: 1 / 2200, seed: 23 },
  carga: { agua: 'terra', amplitude: 45, escala: 1 / 4200, seed: 31 },
  medevac: {
    agua: 'ilhas', escala: 1 / 1600, seed: 47,
    ilhas: [
      { x: 9000, z: -2000, raio: 16000, alturaM: 900 },
      { x: -14000, z: 170000, raio: 22000, alturaM: 950 },
      { x: 24000, z: 72000, raio: 7000, alturaM: 600 },
    ],
  },
  corredor: { agua: 'terra', amplitude: 6, escala: 1 / 500, seed: 5 },
};

export function perfilTerreno(cenario) {
  return PERFIS[cenario] ?? PERFIS.corredor;
}

function alturaBase(perfil, x, z) {
  const relevo = fbm(x * perfil.escala, z * perfil.escala, perfil.seed);
  if (perfil.agua === 'costa') {
    const costa = perfil.costaX + perfil.recorteM * ruido2(z / 7000, 3.7, perfil.seed + 5);
    const terra = costa - x; // metros para dentro de terra; mar para +X
    if (terra < 0) return Math.max(-40, terra * 0.05);
    const afastamentoRota = entre01((Math.abs(x) - 800) / 4000);
    return PLANO_PISTA_M + entre01(terra / 2500) * perfil.amplitude * relevo * (0.35 + 0.65 * afastamentoRota);
  }
  if (perfil.agua === 'ilhas') {
    let h = -40;
    for (const i of perfil.ilhas) {
      const d = Math.hypot(x - i.x, z - i.z) / i.raio;
      if (d < 1) h = Math.max(h, PLANO_PISTA_M + i.alturaM * (1 - d) ** 1.8 * (0.55 + 0.45 * relevo));
    }
    return h;
  }
  return PLANO_PISTA_M + perfil.amplitude * relevo;
}

/** Pistas (origem, destino e alternativos) em coordenadas do mundo. */
export function pistasDaMissao(destinos) {
  return destinos.map((d) => ({ id: d.id, ...pontoMundo(d.xM, d.zM), raioPlanoM: 1200 }));
}

/** Altura do terreno; à volta de cada pista o chão fica plano e seco. */
export function alturaTerreno(perfil, x, z, pistas = []) {
  let h = alturaBase(perfil, x, z);
  for (const p of pistas) {
    const d = Math.hypot(x - p.x, z - p.z);
    const raio = p.raioPlanoM ?? 1200;
    if (d < raio * 1.8) {
      const t = suave(entre01((d - raio) / (raio * 0.8)));
      h = PLANO_PISTA_M + (h - PLANO_PISTA_M) * t;
    }
  }
  return h;
}
```

```js
// lib/relevo.mjs
export { alturaTerreno, fbm, perfilTerreno, pistasDaMissao, ruido2, PLANO_PISTA_M } from '../public/src/relevo.js';
```

**Step 4: Run test to verify it passes**

Run: `node --test lib/relevo.test.mjs`
Expected: PASS. Se "o relevo nunca sobe ao corredor" falhar num cenário, baixar `amplitude` ou `alturaM` desse perfil (nunca afrouxar o limite de 300 m).

**Step 5: Commit**

```bash
git add public/src/relevo.js lib/relevo.mjs lib/relevo.test.mjs lib/simulacao.mjs
git commit -m "Gerar relevo determinístico por cenário, plano nas pistas e abaixo do cruzeiro"
```

---

### Task 4: Gestão de mosaicos (módulo `mosaicos.js`)

**Files:**
- Create: `public/src/mosaicos.js`, `lib/mosaicos.mjs`
- Test: `lib/mosaicos.test.mjs`

**Step 1: Write the failing test**

```js
// lib/mosaicos.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mosaicosNecessarios, planearMosaicos, TAMANHO_MOSAICO_M } from './mosaicos.mjs';

describe('mosaicos de terreno', () => {
  it('o mosaico do avião vem primeiro e o raio 2 cobre 21 mosaicos', () => {
    const lista = mosaicosNecessarios(TAMANHO_MOSAICO_M * 3.5, TAMANHO_MOSAICO_M * -0.5, { raio: 2 });
    assert.equal(lista.length, 21);
    assert.deepEqual([lista[0].i, lista[0].j], [3, -1]);
  });

  it('planeia só a diferença: cria os novos e remove os que saíram', () => {
    const antes = new Map(mosaicosNecessarios(0, 0, { raio: 1 }).map((m) => [m.chave, {}]));
    const plano = planearMosaicos(antes, mosaicosNecessarios(TAMANHO_MOSAICO_M, 0, { raio: 1 }));
    assert.deepEqual(plano.criar.map((m) => m.chave).sort(), ['2:-1', '2:0', '2:1']);
    assert.deepEqual(plano.remover.sort(), ['-1:-1', '-1:0', '-1:1']);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `node --test lib/mosaicos.test.mjs`
Expected: FAIL (módulo inexistente).

**Step 3: Write minimal implementation**

```js
// public/src/mosaicos.js
export const TAMANHO_MOSAICO_M = 2000;

export function chaveMosaico(i, j) {
  return `${i}:${j}`;
}

/** Mosaicos num disco de `raio` à volta de (x, z), do mais próximo ao mais longe. */
export function mosaicosNecessarios(x, z, { tamanho = TAMANHO_MOSAICO_M, raio = 3 } = {}) {
  const ci = Math.floor(x / tamanho);
  const cj = Math.floor(z / tamanho);
  const lista = [];
  for (let di = -raio; di <= raio; di++) {
    for (let dj = -raio; dj <= raio; dj++) {
      const d2 = di * di + dj * dj;
      if (d2 > raio * raio + 1) continue;
      lista.push({ i: ci + di, j: cj + dj, chave: chaveMosaico(ci + di, cj + dj), d2 });
    }
  }
  return lista.sort((a, b) => a.d2 - b.d2);
}

export function planearMosaicos(existentes, necessarios) {
  const quer = new Set(necessarios.map((m) => m.chave));
  return {
    criar: necessarios.filter((m) => !existentes.has(m.chave)),
    remover: [...existentes.keys()].filter((k) => !quer.has(k)),
  };
}
```

```js
// lib/mosaicos.mjs
export { chaveMosaico, mosaicosNecessarios, planearMosaicos, TAMANHO_MOSAICO_M } from '../public/src/mosaicos.js';
```

**Step 4:** `node --test lib/mosaicos.test.mjs` → PASS.

**Step 5: Commit**

```bash
git add public/src/mosaicos.js lib/mosaicos.mjs lib/mosaicos.test.mjs
git commit -m "Planear os mosaicos de terreno à volta do avião"
```

---

### Task 5: Terreno Three.js e substituição da geografia antiga

**Files:**
- Create: `public/src/terreno.js`
- Modify: `public/src/world.js:41-137` (apagar `campoFal`, `portoNoite`, `ilha`), `:477-488` (oceano e geografia em `criarCena`), e acrescentar `actualizarCena` e `largarCena`
- Modify: `public/src/main.js` (`criarMundo`, `desenharMundo`, `largarMundo`)

**Step 1: Criar `public/src/terreno.js`**

```js
import * as THREE from 'three';
import { alturaTerreno, PLANO_PISTA_M } from './relevo.js';
import { mosaicosNecessarios, planearMosaicos, TAMANHO_MOSAICO_M } from './mosaicos.js';

// Paleta dessaturada (identidade preto e branco): o relevo lê-se pela luz.
const COR = {
  praia: new THREE.Color(0xa9a38f),
  baixo: new THREE.Color(0x56604c),
  medio: new THREE.Color(0x767a70),
  alto: new THREE.Color(0xc9cdc6),
  pista: new THREE.Color(0x3c4146),
};

function corDe(h, alvo) {
  if (h <= PLANO_PISTA_M + 0.01) return alvo.copy(COR.pista).lerp(COR.baixo, 0.55);
  if (h < 8) return alvo.copy(COR.praia);
  if (h < 160) return alvo.copy(COR.baixo).lerp(COR.medio, h / 160);
  return alvo.copy(COR.medio).lerp(COR.alto, Math.min(1, (h - 160) / 500));
}

function geometriaMosaico(t, i, j) {
  const geo = new THREE.PlaneGeometry(TAMANHO_MOSAICO_M, TAMANHO_MOSAICO_M, t.segmentos, t.segmentos);
  geo.rotateX(-Math.PI / 2);
  const cx = (i + 0.5) * TAMANHO_MOSAICO_M;
  const cz = (j + 0.5) * TAMANHO_MOSAICO_M;
  const pos = geo.attributes.position;
  const cores = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const h = alturaTerreno(t.perfil, cx + pos.getX(k), cz + pos.getZ(k), t.pistas);
    pos.setY(k, Math.max(-6, h));
    corDe(h, c).toArray(cores, k * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cores, 3));
  geo.computeVertexNormals();
  return { geo, cx, cz };
}

export function criarTerreno({ perfil, pistas = [], leve = false }) {
  const grupo = new THREE.Group();
  grupo.name = 'terreno';
  const raio = leve ? 2 : 3;
  const lado = TAMANHO_MOSAICO_M * (2 * raio + 3);
  const mar = new THREE.Mesh(new THREE.PlaneGeometry(lado, lado), new THREE.MeshLambertMaterial({ color: 0x1f2e38 }));
  mar.rotation.x = -Math.PI / 2;
  grupo.add(mar);
  return {
    grupo, mar, perfil, pistas, raio,
    segmentos: leve ? 24 : 48,
    material: new THREE.MeshLambertMaterial({ vertexColors: true }),
    mosaicos: new Map(),
  };
}

/** Cria até `orcamento` mosaicos por chamada (evita saltos) e liberta os que saíram de vista. */
export function actualizarTerreno(t, x, z, orcamento = 1) {
  t.mar.position.set(x, 0, z);
  const plano = planearMosaicos(t.mosaicos, mosaicosNecessarios(x, z, { raio: t.raio }));
  for (const chave of plano.remover) {
    const mesh = t.mosaicos.get(chave);
    t.grupo.remove(mesh);
    mesh.geometry.dispose();
    t.mosaicos.delete(chave);
  }
  for (const m of plano.criar.slice(0, orcamento)) {
    const { geo, cx, cz } = geometriaMosaico(t, m.i, m.j);
    const mesh = new THREE.Mesh(geo, t.material);
    mesh.position.set(cx, 0, cz);
    t.grupo.add(mesh);
    t.mosaicos.set(m.chave, mesh);
  }
}

export function largarTerreno(t) {
  for (const mesh of t.mosaicos.values()) mesh.geometry.dispose();
  t.mosaicos.clear();
  t.material.dispose();
  t.mar.geometry.dispose();
  t.mar.material.dispose();
}
```

**Step 2: Ligar em `world.js`**

- Apagar `campoFal`, `portoNoite` e `ilha` (linhas 41–137) e, em `criarCena`, o bloco do `ocean` e o `if (cenario === 'porto') …` (≈ linhas 477–488).
- `criarCena(canvas, { leve, cenario, pose, pistas = [], apresentacao })`: depois de criar `geografia`, criar o terreno e preencher logo o arranque:

```js
  const terreno = criarTerreno({ perfil: perfilTerreno(cenario), pistas, leve });
  geografia.add(terreno.grupo);
  if (pose) actualizarTerreno(terreno, pose.x, pose.z, Infinity);
```

  Devolver `terreno` no objecto `mundo`. Acrescentar os imports de `./terreno.js` e `./relevo.js`.
- Nova função exportada, chamada por `main.js` em cada frame **antes** de `recentrarOrigem`, com a pose absoluta:

```js
export function actualizarCena(mundo, visual) {
  actualizarTerreno(mundo.terreno, visual.pose.x, visual.pose.z, 1);
}
```

- Nova função `largarCena(mundo)` (substitui só `renderer.dispose()`, e corrige a fuga de memória gráfica):

```js
export function largarCena(mundo) {
  largarTerreno(mundo.terreno);
  mundo.scene.traverse((o) => {
    o.geometry?.dispose();
    for (const m of [o.material].flat().filter(Boolean)) {
      m.map?.dispose();
      m.roughnessMap?.dispose();
      m.dispose();
    }
  });
  mundo.scene.environment?.dispose();
  mundo.renderer.dispose();
}
```

**Step 3: Ligar em `main.js`**

- `import { pistasDaMissao } from './relevo.js';`
- Em `criarMundo()`: `cenario: emModoPiloto() ? 'corredor' : estado.cenario`, e `pistas: emModoPiloto() ? [] : pistasDaMissao(estado.missao.destinos)`.
- `largarMundo()`:

```js
function largarMundo() {
  if (estado.mundo) estado.mundoApi?.largarCena(estado.mundo);
  estado.mundo = null; estado.mundoApi = null;
}
```

- Em `desenharMundo(dt)`, antes de `recentrarOrigem`: `const absoluta = parametrosVoo(); api.actualizarCena(estado.mundo, { pose: absoluta });` e usar `absoluta` em `recentrarOrigem`.

**Step 4: Verificar**

Run: `npm test && npm run lint` → passam.
Browser: replay de cada cenário, com captura. Porto: mar à esquerda e terra à direita; SAR: mar por baixo e costa à direita; Açores: mar com ilhas ao longe; Ponte de Sor: planície ondulada. Sem buracos ao avançar a 8×. Na consola: `performance.memory` estável depois de 3 entradas e saídas de missão (Chrome).

**Step 5: Commit**

```bash
git add public/src/terreno.js public/src/world.js public/src/main.js
git commit -m "Trocar a geografia primitiva por terreno em mosaicos e libertar a GPU ao sair"
```

---

### Task 6: Estado visual do céu (módulo `ambiente-visual.js`)

**Files:**
- Create: `public/src/ambiente-visual.js`, `lib/ambiente-visual.mjs`
- Test: `lib/ambiente-visual.test.mjs`

**Step 1: Write the failing test**

```js
// lib/ambiente-visual.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alturaNuvensM, nevoeiroDe, noiteAlvo, paletaCeu, ventoNoMundo } from './ambiente-visual.mjs';

describe('céu a partir do estado da simulação', () => {
  it('as nuvens ficam à altura real do tecto', () => {
    assert.equal(Math.round(alturaNuvensM(650)), 198);
    assert.equal(Math.round(alturaNuvensM(1800)), 549);
  });

  it('a visibilidade define o nevoeiro, sem passar do terreno carregado', () => {
    assert.equal(nevoeiroDe(4, 7000).far, 4000);
    assert.equal(nevoeiroDe(40, 7000).far, 6650);
    assert.ok(nevoeiroDe(4, 7000).near < 4000);
  });

  it('noite: São João começa ao crepúsculo e escurece quando a luz acaba', () => {
    assert.ok(noiteAlvo('porto', true) > 0 && noiteAlvo('porto', true) < 0.5);
    assert.equal(noiteAlvo('porto', false), 1);
    assert.equal(noiteAlvo('carga', true), 0);
  });

  it('as luzes acendem com a noite e o sol perde força', () => {
    assert.equal(paletaCeu(0).luzes, 0);
    assert.equal(paletaCeu(1).luzes, 1);
    assert.ok(paletaCeu(1).intensidadeSol < paletaCeu(0).intensidadeSol);
  });

  it('o vento é espelhado para o mundo como a posição', () => {
    const v = ventoNoMundo({ x: 6, z: -5 });
    assert.deepEqual([v.x, v.z], [-6, -5]);
    assert.equal(Math.round(v.kt), 15);
  });
});
```

**Step 2:** `node --test lib/ambiente-visual.test.mjs` → FAIL (módulo inexistente).

**Step 3: Write minimal implementation**

```js
// public/src/ambiente-visual.js
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const suave = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function alturaNuvensM(tetoFt) {
  return Math.max(60, Number(tetoFt) * 0.3048);
}

/** Nevoeiro pela visibilidade, limitado ao terreno carregado para não mostrar a borda. */
export function nevoeiroDe(visKm, alcanceTerrenoM) {
  const far = Math.round(Math.min(clamp(visKm * 1000, 800, 14000), alcanceTerrenoM * 0.95));
  return { near: Math.round(far * 0.18), far };
}

const NOITE_INICIAL = { porto: 0.35, sar: 0.2 };

export function noiteAlvo(cenario, luzDia) {
  return luzDia ? NOITE_INICIAL[cenario] ?? 0 : 1;
}

export function misturarCor(a, b, t) {
  const c = (s) => ((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t;
  return (Math.round(c(16)) << 16) | (Math.round(c(8)) << 8) | Math.round(c(0));
}

const DIA = { zenite: 0x3f6f9e, horizonte: 0xb8c6d2, nevoeiro: 0xa7b6c3, sol: 0xfff1d8 };
const NOITE = { zenite: 0x080b12, horizonte: 0x2a2f3c, nevoeiro: 0x1b2029, sol: 0xff9a5c };

export function paletaCeu(noite) {
  const n = clamp(noite, 0, 1);
  return {
    zenite: misturarCor(DIA.zenite, NOITE.zenite, n),
    horizonte: misturarCor(DIA.horizonte, NOITE.horizonte, n),
    nevoeiro: misturarCor(DIA.nevoeiro, NOITE.nevoeiro, n),
    corSol: misturarCor(DIA.sol, NOITE.sol, suave(0.2, 0.7, n)),
    intensidadeSol: 1.35 * (1 - 0.8 * n),
    intensidadeCeu: 1.05 * (1 - 0.6 * n),
    elevacaoSolRad: 0.9 - 0.98 * n,
    luzes: suave(0.45, 0.8, n),
  };
}

export function ventoNoMundo(ventoMs) {
  const x = -(ventoMs?.x ?? 0);
  const z = ventoMs?.z ?? 0;
  return { x, z, kt: Math.hypot(x, z) * 1.94384 };
}
```

```js
// lib/ambiente-visual.mjs
export { alturaNuvensM, misturarCor, nevoeiroDe, noiteAlvo, paletaCeu, ventoNoMundo } from '../public/src/ambiente-visual.js';
```

**Step 4:** `node --test lib/ambiente-visual.test.mjs` → PASS.

**Step 5: Commit**

```bash
git add public/src/ambiente-visual.js lib/ambiente-visual.mjs lib/ambiente-visual.test.mjs
git commit -m "Derivar nuvens, nevoeiro, luz e vento do estado da simulação"
```

---

### Task 7: Céu Three.js (cúpula, nuvens, vento e chuva, luzes do avião)

**Files:**
- Create: `public/src/ceu.js`
- Modify: `public/src/world.js` (`criarCena`: substituir `ceuDe`, `scene.fog` e as luzes pela chamada a `criarCeu`; `actualizarCena`; `largarCena`)
- Modify: `public/src/main.js` (`desenharMundo` passa `ambiente`, `cenario` e `emPiloto`)

**Step 1: Criar `public/src/ceu.js`**

```js
import * as THREE from 'three';
import { alturaNuvensM, nevoeiroDe, noiteAlvo, paletaCeu, ventoNoMundo } from './ambiente-visual.js';

const CAMPO_NUVENS_M = 9000;
const CAIXA_RASTOS_M = 420;

function cupula() {
  const material = new THREE.ShaderMaterial({
    uniforms: { zenite: { value: new THREE.Color() }, horizonte: { value: new THREE.Color() } },
    vertexShader: 'varying float vY; void main(){ vY = normalize(position).y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 zenite; uniform vec3 horizonte; varying float vY; void main(){ gl_FragColor = vec4(mix(horizonte, zenite, smoothstep(0.0, 0.55, vY)), 1.0); }',
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(24000, 24, 12), material);
  mesh.renderOrder = -1;
  return mesh;
}

function camadaNuvens(n) {
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const mat = new THREE.MeshLambertMaterial({ color: 0xdfe3e6, transparent: true, opacity: 0.92 });
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  const sementes = Array.from({ length: n }, (_, i) => ({
    x: ((i * 7919) % 1000) / 1000, z: ((i * 104729) % 1000) / 1000,
    sx: 260 + ((i * 37) % 9) * 60, sy: 40 + ((i * 13) % 5) * 12, sz: 180 + ((i * 53) % 7) * 50,
  }));
  return { mesh, sementes, m: new THREE.Matrix4(), q: new THREE.Quaternion(), s: new THREE.Vector3(), p: new THREE.Vector3() };
}

function rastos(n) {
  const pos = new Float32Array(n * 6);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, depthWrite: false });
  const linhas = new THREE.LineSegments(geo, mat);
  linhas.frustumCulled = false;
  const base = Array.from({ length: n }, (_, i) => [((i * 7919) % 997) / 997, ((i * 6007) % 991) / 991, ((i * 104729) % 983) / 983]);
  return { linhas, base, deriva: new THREE.Vector3() };
}

export function criarCeu(scene, { cenario, leve, alcanceTerrenoM }) {
  const ceu = {
    cenario, alcanceTerrenoM,
    cupula: cupula(),
    hemi: new THREE.HemisphereLight(0xd7e8ff, 0x2a3328, 1.05),
    nuvens: camadaNuvens(leve ? 24 : 60),
    rastos: rastos(leve ? 80 : 220),
    noite: noiteAlvo(cenario, true),
  };
  scene.fog = new THREE.Fog(0xa7b6c3, 1000, 6000);
  scene.background = null;
  scene.add(ceu.cupula, ceu.hemi, ceu.nuvens.mesh, ceu.rastos.linhas);
  return ceu;
}

/** Aplica o estado da simulação ao céu. `pose` em coordenadas locais (já recentradas). */
export function actualizarCeu(ceu, { scene, sol, camera, ambiente, pose, dt }) {
  const alvo = noiteAlvo(ceu.cenario, ambiente.luzDia !== false);
  ceu.noite += (alvo - ceu.noite) * Math.min(1, dt / 25); // ~25 s para escurecer
  const pal = paletaCeu(ceu.noite);
  ceu.cupula.position.copy(camera.position);
  ceu.cupula.material.uniforms.zenite.value.setHex(pal.zenite);
  ceu.cupula.material.uniforms.horizonte.value.setHex(pal.horizonte);
  const nev = nevoeiroDe(ambiente.visKm ?? 10, ceu.alcanceTerrenoM);
  scene.fog.color.setHex(pal.nevoeiro);
  scene.fog.near = nev.near;
  scene.fog.far = nev.far;
  ceu.hemi.intensity = pal.intensidadeCeu;
  sol.color.setHex(pal.corSol);
  sol.intensity = pal.intensidadeSol;

  // Nuvens: campo que acompanha o avião, à altura do tecto.
  const alt = alturaNuvensM(ambiente.tetoFt ?? 3000);
  const { mesh, sementes, m, q, s, p } = ceu.nuvens;
  mesh.visible = alt < 1600;
  for (let i = 0; i < sementes.length; i++) {
    const k = sementes[i];
    const wrap = (v, c) => c + ((((v - c) % CAMPO_NUVENS_M) + CAMPO_NUVENS_M * 1.5) % CAMPO_NUVENS_M) - CAMPO_NUVENS_M / 2;
    p.set(wrap(k.x * CAMPO_NUVENS_M, pose.x), alt + (i % 3) * 18, wrap(k.z * CAMPO_NUVENS_M, pose.z));
    s.set(k.sx, k.sy, k.sz);
    m.compose(p, q, s);
    mesh.setMatrixAt(i, m);
  }
  mesh.instanceMatrix.needsUpdate = true;

  // Rastos de vento e, com pouca visibilidade, chuva: segmentos numa caixa à volta do avião.
  const vento = ventoNoMundo(ambiente.ventoMs);
  const chuva = (ambiente.visKm ?? 10) < 5;
  const r = ceu.rastos;
  r.deriva.x += vento.x * dt;
  r.deriva.z += vento.z * dt;
  r.deriva.y -= (chuva ? 9 : 0) * dt;
  const pos = r.linhas.geometry.attributes.position.array;
  const comp = chuva ? 6 : Math.min(30, 2 + vento.kt * 0.9);
  const ux = vento.kt > 0.5 ? vento.x / (vento.kt / 1.94384) : 0;
  const uz = vento.kt > 0.5 ? vento.z / (vento.kt / 1.94384) : 0;
  for (let i = 0; i < r.base.length; i++) {
    const [bx, by, bz] = r.base[i];
    const wrap = (b, d) => ((((b * CAIXA_RASTOS_M + d) % CAIXA_RASTOS_M) + CAIXA_RASTOS_M) % CAIXA_RASTOS_M) - CAIXA_RASTOS_M / 2;
    const x = pose.x + wrap(bx, r.deriva.x);
    const y = pose.y + wrap(by, r.deriva.y) * 0.5;
    const z = pose.z + wrap(bz, r.deriva.z);
    pos.set([x, y, z, x - ux * comp, y + (chuva ? comp : 0), z - uz * comp], i * 6);
  }
  r.linhas.geometry.attributes.position.needsUpdate = true;
  r.linhas.material.opacity = chuva ? 0.45 : Math.min(0.35, vento.kt / 60);
  return pal;
}
```

**Step 2: Ligar em `world.js`**

- Apagar `ceuDe` e, em `criarCena`, as linhas `scene.fog = …`, `scene.background = …` e a `HemisphereLight`. Depois de criar o `sun`: `const ceu = criarCeu(scene, { cenario, leve, alcanceTerrenoM: TAMANHO_MOSAICO_M * (leve ? 2 : 3) });` e devolver `ceu` no `mundo`. O `setClearColor` passa a `0x000000`.
- Luzes de navegação do avião: depois de `criarLus222`, três esferas `MeshBasicMaterial` (vermelha na ponta da asa esquerda `x: +10.6, y: 1.65, z: 0.3`, verde na direita `x: -10.6`, branca na cauda `x: 0, y: 4.6, z: -7.6`; raio 0.18, coordenadas antes da escala 1,35 do grupo) acrescentadas ao `aviao`, guardadas em `mundo.luzesNav`. Confirmar as pontas no turntable (`?foco=3`).
- `actualizarCena(mundo, visual, dt)` recebe `visual = { pose, poseLocal, ambiente }`:

```js
  const pal = actualizarCeu(mundo.ceu, { scene: mundo.scene, sol: mundo.sol, camera: mundo.camera, ambiente: visual.ambiente, pose: visual.poseLocal, dt });
  for (const l of mundo.luzesNav) l.visible = pal.luzes > 0.05;
```

- `largarCena`: o `traverse` já liberta a cúpula, as nuvens e os rastos.

**Step 3: Ligar em `main.js`**

Em `desenharMundo(dt)`: calcular `pose = recentrarOrigem(…)` primeiro e chamar `api.actualizarCena(estado.mundo, { pose: absoluta, poseLocal: pose, ambiente }, dt)` depois, com `const ambiente = emModoPiloto() ? { tetoFt: 3000, visKm: 12, luzDia: true, ventoMs: { x: 0, z: 0 } } : estado.missao.ambiente;`. O terreno usa `pose` (absoluta) e o céu usa `poseLocal`.

**Step 4: Verificar**

Run: `npm test && npm run lint`.
Browser, replay MEDEVAC: no evento "O tempo mudou" (tecto 650 ft, vis 4 km), as nuvens descem para ~200 m, o nevoeiro fecha e aparece chuva. Replay SAR: o céu escurece ao longo de ~25 s e as luzes de navegação acendem. Replay Ponte de Sor: rastos de vento visíveis com 32 kt.

**Step 5: Commit**

```bash
git add public/src/ceu.js public/src/world.js public/src/main.js
git commit -m "Desenhar céu, nuvens, nevoeiro, vento e chuva a partir da simulação"
```

---

### Task 8: Rota, alcance e manobra (módulo `rota-visual.js`)

**Files:**
- Create: `public/src/rota-visual.js`, `lib/rota-visual.mjs`
- Test: `lib/rota-visual.test.mjs`

**Step 1: Write the failing test**

```js
// lib/rota-visual.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alcanceM, pontosFitaRota, setaManobra } from './rota-visual.mjs';
import { criarMissao } from '../public/src/simulacao.js';

describe('rota visível', () => {
  it('a fita vai do avião ao destino activo e desce para a pista', () => {
    const m = criarMissao('porto', 222);
    const destino = m.destinos.find((d) => d.id === m.destinoId);
    const pts = pontosFitaRota(m.voo, destino);
    assert.deepEqual([pts[0].x, pts[0].z], [-m.voo.xM, m.voo.zM]);
    assert.deepEqual([pts.at(-1).x, pts.at(-1).z], [-destino.xM, destino.zM]);
    assert.ok(pts.at(-1).y < 60 && pts[0].y > 400);
  });

  it('o alcance chega ao destino com reserva e encolhe com menos combustível', () => {
    const m = criarMissao('porto', 222);
    const destino = m.destinos.find((d) => d.id === m.destinoId);
    const d = Math.hypot(destino.xM - m.voo.xM, destino.zM - m.voo.zM);
    assert.ok(alcanceM(m) > d);
    const pouco = { ...m, voo: { ...m.voo, combustivelKg: 200 } };
    assert.ok(alcanceM(pouco) < alcanceM(m));
  });

  it('a seta traduz os eixos da ordem', () => {
    assert.deepEqual(setaManobra({ lateral: 'direita', vertical: 'subir' }), { lateral: 1, vertical: 1 });
    assert.deepEqual(setaManobra({ lateral: 'esquerda', vertical: 'descer' }), { lateral: -1, vertical: -1 });
    assert.equal(setaManobra({ lateral: 'manter', vertical: 'manter' }), null);
  });
});
```

**Step 2:** `node --test lib/rota-visual.test.mjs` → FAIL (módulo inexistente).

**Step 3: Write minimal implementation**

```js
// public/src/rota-visual.js
import { pontoMundo } from './escala.js';
import { combustivelNecessarioKg } from './simulacao.js';

/** Pontos da fita de rota (mundo), do avião ao destino; desce nos últimos 12 km. */
export function pontosFitaRota(voo, destino, { n = 24, descidaM = 12000 } = {}) {
  const a = pontoMundo(voo.xM, voo.zM);
  const b = pontoMundo(destino.xM, destino.zM);
  const total = Math.hypot(b.x - a.x, b.z - a.z);
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const falta = total * (1 - t);
    const y = falta > descidaM ? voo.altitudeM : 30 + (voo.altitudeM - 30) * (falta / descidaM);
    return { x: a.x + (b.x - a.x) * t, y, z: a.z + (b.z - a.z) * t };
  });
}

/** Distância máxima (m) que o combustível permite na direcção do destino activo. */
export function alcanceM(missao) {
  const destino = missao.destinos.find((d) => d.id === missao.destinoId) ?? missao.destinos[1];
  const dx = destino.xM - missao.voo.xM;
  const dz = destino.zM - missao.voo.zM;
  const n = Math.hypot(dx, dz) || 1;
  const ponto = (d) => ({ xM: missao.voo.xM + (dx / n) * d, zM: missao.voo.zM + (dz / n) * d });
  let lo = 0;
  let hi = 600000;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (combustivelNecessarioKg(missao, ponto(mid)) <= missao.voo.combustivelKg) lo = mid;
    else hi = mid;
  }
  return Math.round(lo);
}

const EIXO = { direita: 1, esquerda: -1, subir: 1, descer: -1 };

export function setaManobra(comando) {
  const lateral = EIXO[comando?.lateral] ?? 0;
  const vertical = EIXO[comando?.vertical] ?? 0;
  return lateral || vertical ? { lateral, vertical } : null;
}
```

```js
// lib/rota-visual.mjs
export { alcanceM, pontosFitaRota, setaManobra } from '../public/src/rota-visual.js';
```

**Step 4:** `node --test lib/rota-visual.test.mjs` → PASS.

**Step 5: Commit**

```bash
git add public/src/rota-visual.js lib/rota-visual.mjs lib/rota-visual.test.mjs
git commit -m "Calcular a fita de rota, o alcance e a seta da manobra"
```

---

### Task 9: Marcas da missão no mundo (fita, alfinetes, anel, seta)

**Files:**
- Create: `public/src/marcas-missao.js`
- Modify: `public/src/world.js` (`criarCena` e `actualizarCena`)
- Modify: `public/src/main.js` (estado visual e autoria da manobra)

**Step 1: Criar `public/src/marcas-missao.js`**

```js
import * as THREE from 'three';
import { pontoMundo } from './escala.js';

const AMBAR = 0xf2a23a;
const VERMELHO = 0xd8483f;
const BRANCO = 0xf4f6f8;

function etiqueta(texto) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = '600 44px "IBM Plex Sans", system-ui, sans-serif';
  ctx.fillStyle = 'rgba(8,11,14,.78)';
  ctx.fillRect(0, 0, 512, 96);
  ctx.fillStyle = '#f4f6f8';
  ctx.textBaseline = 'middle';
  ctx.fillText(texto, 24, 50);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, sizeAttenuation: false, depthTest: false, transparent: true }));
  s.scale.set(0.16, 0.03, 1);
  s.renderOrder = 5;
  return s;
}

function alfinete(destino, nome) {
  const g = new THREE.Group();
  const p = pontoMundo(destino.xM, destino.zM);
  g.position.set(p.x, 0, p.z);
  const haste = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 420, 6), new THREE.MeshBasicMaterial({ color: BRANCO, transparent: true, opacity: 0.55 }));
  haste.position.y = 210;
  const rotulo = etiqueta(nome);
  rotulo.position.y = 460;
  g.add(haste, rotulo);
  g.userData = { id: destino.id, haste };
  return g;
}

export function criarMarcas(scene, destinos, nomes) {
  const grupo = new THREE.Group();
  grupo.name = 'marcas-missao';
  const fita = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: BRANCO, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
  fita.frustumCulled = false;
  const anel = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 128), new THREE.MeshBasicMaterial({ color: BRANCO, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  anel.rotation.x = -Math.PI / 2;
  const seta = new THREE.Group();
  const corSeta = new THREE.MeshBasicMaterial({ color: BRANCO, depthTest: false });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 12), corSeta);
  cone.position.y = 9;
  const haste = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 9, 8), corSeta);
  haste.position.y = 4.5;
  seta.add(cone, haste);
  seta.renderOrder = 6;
  const alfinetes = destinos.map((d) => alfinete(d, nomes[d.id] ?? d.id));
  grupo.add(fita, anel, seta, ...alfinetes);
  scene.add(grupo);
  return { grupo, fita, anel, seta, corSeta, alfinetes, chave: '' };
}

function faixa(pontos, largura) {
  const pos = [];
  for (let i = 0; i < pontos.length - 1; i++) {
    const a = pontos[i];
    const b = pontos[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const n = Math.hypot(dx, dz) || 1;
    const ox = (-dz / n) * largura / 2;
    const oz = (dx / n) * largura / 2;
    pos.push(a.x + ox, a.y, a.z + oz, a.x - ox, a.y, a.z - oz, b.x + ox, b.y, b.z + oz);
    pos.push(a.x - ox, a.y, a.z - oz, b.x - ox, b.y, b.z - oz, b.x + ox, b.y, b.z + oz);
  }
  return new THREE.Float32BufferAttribute(pos, 3);
}

/**
 * `m`: { pontosRota (mundo), destinoAtivoId, alcanceM, reservaCurta, pose, poseLocal, origem, seta, autor }.
 * O grupo está em coordenadas do mundo; `origem` é a origem visual (recentragem).
 */
export function actualizarMarcas(marcas, m) {
  marcas.grupo.position.set(-m.origem.x, 0, -m.origem.z);
  const chave = `${m.destinoAtivoId}|${Math.round(m.pose.x / 200)}|${Math.round(m.pose.z / 200)}`;
  if (chave !== marcas.chave) {
    marcas.fita.geometry.setAttribute('position', faixa(m.pontosRota, 8));
    marcas.fita.geometry.attributes.position.needsUpdate = true;
    marcas.chave = chave;
  }
  for (const a of marcas.alfinetes) {
    const activo = a.userData.id === m.destinoAtivoId;
    a.userData.haste.material.color.setHex(activo ? AMBAR : BRANCO);
    a.userData.haste.material.opacity = activo ? 0.9 : 0.45;
  }
  marcas.anel.position.set(m.pose.x, 6, m.pose.z);
  marcas.anel.scale.setScalar(Math.max(500, m.alcanceM));
  marcas.anel.material.color.setHex(m.reservaCurta ? AMBAR : BRANCO);

  marcas.seta.visible = Boolean(m.seta);
  if (m.seta) {
    const fx = Math.sin(m.pose.heading);
    const fz = Math.cos(m.pose.heading);
    // Direita do piloto = −X com heading 0 (ver escala.js).
    const rx = -fz;
    const rz = fx;
    marcas.seta.position.set(m.pose.x + fx * 55 + rx * m.seta.lateral * 6, m.pose.y + 4, m.pose.z + fz * 55 + rz * m.seta.lateral * 6);
    const dir = new THREE.Vector3(rx * m.seta.lateral, m.seta.vertical * 0.8 + (m.seta.lateral ? 0 : 0.2), rz * m.seta.lateral).normalize();
    marcas.seta.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    marcas.corSeta.color.setHex(m.autor === 'jev' ? BRANCO : VERMELHO);
  }
}
```

**Step 2: Ligar em `world.js`**

- `criarCena(…, { destinos = [], nomesDestinos = {} })`: `const marcas = destinos.length ? criarMarcas(scene, destinos, nomesDestinos) : null;` devolvido no `mundo`.
- Em `actualizarCena`: `if (mundo.marcas && visual.marcas) actualizarMarcas(mundo.marcas, { ...visual.marcas, pose: visual.pose, origem: mundo.origemVisual });`

**Step 3: Ligar em `main.js`**

- Em `criarMundo()` (só missão): `destinos: estado.missao.destinos` e `nomesDestinos: LABEL_DESTINO`.
- Guardar a autoria quando se aplica uma decisão: em `processarEvento`, depois de `aplicarDecisao`, `estado.autorManobra = supervisor.interveio ? 'supervisor' : 'jev';` e no fluxo PIC `estado.autorManobra = 'pic';`.
- Em `desenharMundo`, na missão, montar `visual.marcas` com o alcance recalculado no máximo 2× por segundo:

```js
    const agora = performance.now();
    if (!estado.alcanceCache || agora - estado.alcanceCache.t > 500) {
      const alvo = estado.missao.destinos.find((d) => d.id === estado.missao.destinoId);
      const falta = Math.hypot(alvo.xM - estado.missao.voo.xM, alvo.zM - estado.missao.voo.zM);
      const alcance = alcanceM(estado.missao);
      estado.alcanceCache = { t: agora, alcance, curto: alcance < falta * 1.15, pontos: pontosFitaRota(estado.missao.voo, alvo) };
    }
    const m = estado.missao;
    visual.marcas = {
      pontosRota: estado.alcanceCache.pontos,
      destinoAtivoId: m.destinoId,
      alcanceM: estado.alcanceCache.alcance,
      reservaCurta: estado.alcanceCache.curto,
      seta: m.voo.tempoS < m.comando.evasaoAteS ? setaManobra(m.comando) : null,
      autor: estado.autorManobra ?? 'jev',
    };
```

  Acrescentar `import { alcanceM, pontosFitaRota, setaManobra } from './rota-visual.js';` e pôr `estado.alcanceCache = null` ao iniciar cada missão.

**Step 4: Verificar**

Run: `npm test && npm run lint`.
Browser, replay MEDEVAC: fita branca do avião para o destino; alfinete do destino activo em âmbar; se o JEV mudar de destino, a fita dobra para o novo alfinete. Replay São João, balões: seta "direita + subir" branca à frente do nariz, a apontar para a direita do ecrã e para cima. Intervenção PIC: seta vermelha.

**Step 5: Commit**

```bash
git add public/src/marcas-missao.js public/src/world.js public/src/main.js
git commit -m "Mostrar no mundo a rota, os destinos, o alcance e a manobra escolhida"
```

---

### Task 10: Modos de câmara (módulo `camara-modos.js`)

**Files:**
- Create: `public/src/camara-modos.js`, `lib/camara-modos.mjs`
- Test: `lib/camara-modos.test.mjs`

**Step 1: Write the failing test**

```js
// lib/camara-modos.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  alternarPreferido, alvoCamara, DURACAO_ABERTURA_S, DURACAO_EVENTO_S, modoCamara, novaCamara,
  registarEvento, registarInteracao, REGRESSO_APOS_S,
} from './camara-modos.mjs';

describe('modos de câmara', () => {
  it('abre de lado e depois vai para a cauda', () => {
    const c = novaCamara(0);
    assert.equal(modoCamara(c, 1), 'abertura');
    assert.equal(modoCamara(c, DURACAO_ABERTURA_S + 0.1), 'cauda');
    assert.equal(modoCamara(novaCamara(0, { abertura: false }), 0.1), 'cauda');
  });

  it('a órbita manual manda e volta à cauda depois de largar', () => {
    const c = registarInteracao(novaCamara(0), 10);
    assert.equal(modoCamara(c, 12), 'livre');
    assert.equal(modoCamara(c, 10 + REGRESSO_APOS_S + 0.1), 'cauda');
  });

  it('enquadra o evento e cede à interacção do utilizador', () => {
    const c = registarEvento(novaCamara(0), 20);
    assert.equal(modoCamara(c, 21), 'evento');
    assert.equal(modoCamara(c, 20 + DURACAO_EVENTO_S + 0.1), 'cauda');
    assert.equal(modoCamara(registarInteracao(c, 21), 21.5), 'livre');
  });

  it('o botão alterna cauda → lado → livre → cauda', () => {
    let c = novaCamara(0, { abertura: false });
    c = alternarPreferido(c);
    assert.equal(modoCamara(c, 1), 'lado');
    c = alternarPreferido(c);
    assert.equal(modoCamara(c, 1), 'livre');
    c = alternarPreferido(c);
    assert.equal(modoCamara(c, 1), 'cauda');
  });

  it('lado fica de través; cauda fica atrás e acima', () => {
    const pose = { x: 0, y: 480, z: 0, heading: 0 };
    const lado = alvoCamara('lado', pose);
    assert.ok(Math.abs(lado.pos.z) < 8 && Math.abs(lado.pos.x) > 25);
    const cauda = alvoCamara('cauda', pose);
    assert.ok(cauda.pos.z < -20 && cauda.pos.y > pose.y);
  });
});
```

**Step 2:** `node --test lib/camara-modos.test.mjs` → FAIL (módulo inexistente).

**Step 3: Write minimal implementation**

```js
// public/src/camara-modos.js
export const DURACAO_ABERTURA_S = 3;
export const REGRESSO_APOS_S = 4;
export const DURACAO_EVENTO_S = 2.6;
const ORDEM = ['cauda', 'lado', 'livre'];

export function novaCamara(agoraS, { abertura = true } = {}) {
  return { inicioS: abertura ? agoraS : -Infinity, ultimaInteracaoS: null, eventoAteS: null, preferido: 'cauda' };
}

export function registarInteracao(c, agoraS) {
  return { ...c, ultimaInteracaoS: agoraS };
}

export function registarEvento(c, agoraS) {
  return { ...c, eventoAteS: agoraS + DURACAO_EVENTO_S };
}

export function alternarPreferido(c) {
  return { ...c, preferido: ORDEM[(ORDEM.indexOf(c.preferido) + 1) % ORDEM.length], ultimaInteracaoS: null };
}

export function modoCamara(c, agoraS) {
  if (c.ultimaInteracaoS != null && agoraS - c.ultimaInteracaoS < REGRESSO_APOS_S) return 'livre';
  if (c.preferido === 'livre') return 'livre';
  if (agoraS - c.inicioS < DURACAO_ABERTURA_S) return 'abertura';
  if (c.eventoAteS != null && agoraS < c.eventoAteS) return 'evento';
  return c.preferido;
}

/** Posição e mira da câmara para os modos automáticos (coordenadas locais). */
export function alvoCamara(modo, pose, { fit = 1, foco = null } = {}) {
  const fx = Math.sin(pose.heading);
  const fz = Math.cos(pose.heading);
  // Lado esquerdo do piloto (+X com heading 0), onde a pintura se lê de frente.
  const lx = fz;
  const lz = -fx;
  if (modo === 'abertura' || modo === 'lado') {
    const d = 34 / fit;
    return {
      pos: { x: pose.x + lx * d + fx * 4, y: pose.y + 3, z: pose.z + lz * d + fz * 4 },
      mira: { x: pose.x, y: pose.y + 0.5, z: pose.z },
    };
  }
  if (modo === 'evento' && foco) {
    return {
      pos: { x: pose.x - fx * (48 / fit) + lx * 14, y: pose.y + 16, z: pose.z - fz * (48 / fit) + lz * 14 },
      mira: { x: (pose.x + foco.x) / 2, y: (pose.y + foco.y) / 2, z: (pose.z + foco.z) / 2 },
    };
  }
  const back = 30 / fit;
  return {
    pos: { x: pose.x - fx * back, y: pose.y + 7.5 / fit, z: pose.z - fz * back },
    mira: { x: pose.x + fx * 46, y: pose.y + 2.2, z: pose.z + fz * 46 },
  };
}
```

```js
// lib/camara-modos.mjs
export {
  alternarPreferido, alvoCamara, DURACAO_ABERTURA_S, DURACAO_EVENTO_S, modoCamara, novaCamara,
  registarEvento, registarInteracao, REGRESSO_APOS_S,
} from '../public/src/camara-modos.js';
```

**Step 4:** `node --test lib/camara-modos.test.mjs` → PASS.

**Step 5: Commit**

```bash
git add public/src/camara-modos.js lib/camara-modos.mjs lib/camara-modos.test.mjs
git commit -m "Definir os modos de câmara: abertura lateral, cauda, lado, livre e evento"
```

---

### Task 11: Câmara no mundo: órbita manual, abertura, evento e botão

**Files:**
- Modify: `public/src/world.js` (`criarCena`, `actualizarCamara`, novas `focarEvento` e `alternarCamara`, `largarCena`; apagar `APRESENTACAO_S` e `apresentacaoS`)
- Modify: `public/index.html:90-94` (botão no dock)
- Modify: `public/src/main.js` (handler do botão; `focarEvento` depois da decisão)

**Step 1: `world.js`**

- `import { OrbitControls } from 'three/addons/controls/OrbitControls.js';` e os imports de `./camara-modos.js`.
- Em `criarCena`:

```js
  const controlos = new OrbitControls(camera, renderer.domElement);
  Object.assign(controlos, { enablePan: false, enableDamping: true, dampingFactor: 0.08, minDistance: 14, maxDistance: 420 });
  const reduzido = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const mundo = { /* … campos existentes … */ controlos, camara: novaCamara(performance.now() / 1000, { abertura: apresentacao && !reduzido }), focoEvento: null, alvoAnterior: null };
  const tocar = () => { mundo.camara = registarInteracao(mundo.camara, performance.now() / 1000); };
  controlos.addEventListener('start', tocar);
  controlos.addEventListener('change', () => { if (mundo.arrastar) tocar(); });
  controlos.addEventListener('start', () => { mundo.arrastar = true; });
  controlos.addEventListener('end', () => { mundo.arrastar = false; tocar(); });
```

- `actualizarCamara(mundo, pose, dt)` passa a:

```js
export function actualizarCamara(mundo, pose, dt) {
  const cam = mundo.camera;
  const modo = modoCamara(mundo.camara, performance.now() / 1000);
  const ctl = mundo.controlos;
  if (modo === 'livre') {
    // Segue o avião: desloca a câmara com ele e roda à volta do alvo.
    if (mundo.alvoAnterior) cam.position.add(new THREE.Vector3(pose.x - mundo.alvoAnterior.x, pose.y - mundo.alvoAnterior.y, pose.z - mundo.alvoAnterior.z));
    ctl.target.set(pose.x, pose.y, pose.z);
    ctl.update();
  } else {
    const fit = Math.min(1, Math.max(0.42, (cam.aspect || 1) / 1.2));
    const alvo = alvoCamara(modo, pose, { fit, foco: mundo.focoEvento });
    const k = mundo.camaraPronta ? 1 - Math.exp(-3.4 * Math.min(dt, 0.08)) : 1;
    cam.position.x += (alvo.pos.x - cam.position.x) * k;
    cam.position.y += (alvo.pos.y - cam.position.y) * Math.max(k, 1 - Math.exp(-7 * Math.min(dt, 0.08)));
    cam.position.z += (alvo.pos.z - cam.position.z) * k;
    mundo.mira = mundo.mira ?? new THREE.Vector3(alvo.mira.x, alvo.mira.y, alvo.mira.z);
    mundo.mira.lerp(new THREE.Vector3(alvo.mira.x, alvo.mira.y, alvo.mira.z), k);
    cam.lookAt(mundo.mira);
    ctl.target.set(pose.x, pose.y, pose.z);
    mundo.camaraPronta = true;
  }
  mundo.alvoAnterior = { x: pose.x, y: pose.y, z: pose.z };
  return modo;
}

export function focarEvento(mundo, foco) {
  mundo.focoEvento = foco;
  mundo.camara = registarEvento(mundo.camara, performance.now() / 1000);
}

export function alternarCamara(mundo) {
  mundo.camara = alternarPreferido(mundo.camara);
  return mundo.camara.preferido;
}
```

  A mira à frente da cauda com desvio para a ameaça (`alvoLook`) mantém-se: quando `modo === 'cauda'` e `mundo.alvoLook` existe, aplicar à `alvo.mira` o mesmo desvio limitado que hoje existe em `actualizarCamara` (copiar o bloco `if (look) { … }`). `recentrarOrigem` também desloca `mundo.alvoAnterior` e `mundo.mira` (`-= x`, `-= z`), como faz com `alvoLook`.
- `largarCena`: `mundo.controlos.dispose();` no início.

**Step 2: `index.html`** — no dock, depois de `btn-speed`:

```html
        <button type="button" id="btn-camera" class="control-button" aria-label="Alternar câmara">Câmara: cauda</button>
```

**Step 3: `main.js`**

- Em `ligarUI()`:

```js
  $('btn-camera').addEventListener('click', () => {
    if (!estado.mundo) return;
    const modo = estado.mundoApi.alternarCamara(estado.mundo);
    $('btn-camera').textContent = `Câmara: ${modo}`;
  });
```

- Ao iniciar missão ou piloto: `$('btn-camera').textContent = 'Câmara: cauda';`.
- Em `processarEvento`, depois de mostrar a decisão: `if (estado.mundo) estado.mundoApi.focarEvento(estado.mundo, estado.missao.ameacaAtiva ? posicaoVisualBaloes(estado.missao.voo, estado.missao.ameacaAtiva, poseLocalActual) : null);`, onde `poseLocalActual` é a última pose local guardada em `desenharMundo` (`estado.poseLocal = pose`). Com `foco` nulo, o modo `evento` cai no enquadramento de cauda (não passa pelo lado).

**Step 4: Verificar**

Run: `npm test && npm run lint`.
Browser (desktop e `resize_window` mobile 390×844):
1. Início de missão: ~3 s de lado, com a pintura LUS-222 legível, e deslizar suave para trás da cauda.
2. Arrastar no canvas roda à volta do avião, que continua a voar; pinçar ou scroll faz zoom; 4 s depois de largar, volta à cauda.
3. Botão: "Câmara: lado" fica de lado até voltar a clicar; "livre" fica livre.
4. Evento dos balões: 2,6 s com avião e balões no mesmo quadro.
5. `prefers-reduced-motion` (DevTools → Rendering): sem abertura, começa na cauda.

**Step 5: Commit**

```bash
git add public/src/world.js public/index.html public/src/main.js
git commit -m "Abrir de lado, deixar orbitar à mão e enquadrar a ameaça no momento da decisão"
```

---

### Task 12: Layout — mais espaço para o 3D

**Files:**
- Modify: `public/styles.css:110` e `:152`
- Modify: `public/src/main.js:98` (`ecraLargo`)

**Step 1:** Em `public/styles.css`, na regra `.decision-panel` (linha 110) trocar `width:min(350px,34vw)` por `width:min(320px,27vw)`; na linha 152 trocar as duas ocorrências de `min(350px,34vw)` por `min(320px,27vw)`.

**Step 2:** Em `main.js:98`, a gaveta só abre por omissão em ecrãs largos a sério:

```js
function ecraLargo() { return matchMedia('(min-width: 1280px)').matches; }
```

**Step 3: Verificar** em 1440, 1024, 768 e 390 px: a 1024 e 768 a gaveta começa fechada e o botão "Decisão" abre-a; a 1440 começa aberta e mais estreita; nenhum controlo fora do ecrã (regra do README: `100dvh`, sem scroll de página).

**Step 4: Commit**

```bash
git add public/styles.css public/src/main.js
git commit -m "Dar mais espaço ao 3D: gaveta mais estreita e fechada abaixo de 1280 px"
```

---

### Task 13: Verificação final da fase

**Step 1:** `npm test && npm run lint` → tudo passa (96 testes anteriores + os novos).

**Step 2: Browser, replay de cada cenário** (desktop 1440 e mobile 390; com `resize_window`), com captura no arranque (abertura lateral), a meio e em cada evento:
- São João: mar à esquerda, crepúsculo que escurece no evento "anoitecer", luzes de navegação, balões com a seta do lado certo.
- MEDEVAC: frente com nuvens a ~200 m, nevoeiro e chuva.
- Ponte de Sor: rastos de vento a 32 kt; fita de rota e anel de alcance em âmbar se a reserva ficar curta.
- SAR: mar por baixo, costa à direita, escurecer.
- Prova contínua (corredor): terreno plano, obstáculos como antes, câmara com órbita.

**Step 3: fps** — no browser interno, em cada perfil (normal e `?leve` forçado via mobile 390):

```js
await new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else r(n / 5); }; requestAnimationFrame(f); });
```

Esperado: ≥ 55 fps no desktop; registar o valor do perfil leve (meta ≥ 30 num telemóvel real; o browser interno é só indicativo).

**Step 4:** `?sem-webgl=1` continua a mostrar a missão em 2D; consola sem erros; entrar e sair de 3 missões seguidas sem crescer `performance.memory.usedJSHeapSize` de forma contínua.

**Step 5:** Um voo ao vivo curto com o JEV (Iniciar JEV ao vivo, São João até ao evento dos balões).

**Step 6:** Actualizar `README.md`: escala 1:1, secção da câmara (abertura, órbita, botão) e as linhas novas da estrutura de ficheiros (`escala.js`, `relevo.js`, `mosaicos.js`, `terreno.js`, `ambiente-visual.js`, `ceu.js`, `rota-visual.js`, `marcas-missao.js`, `camara-modos.js`).

**Step 7: Commit e PR**

```bash
git add README.md
git commit -m "README: mundo em escala 1:1, céu a partir da simulação e câmara nova"
git push -u origin feat/cenarios-fase1
gh pr create --base main --title "Cenários, fase 1: escala 1:1, céu e eventos visíveis, câmara nova" --body-file <resumo com capturas e fps>
```
