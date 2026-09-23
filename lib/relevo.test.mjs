import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alcanceRampaM, alturaTerreno, perfilTerreno, pistasDaMissao, prepararPistas, ruido2, PLANO_PISTA_M } from './relevo.mjs';
import { criarMissao } from './simulacao.mjs';

const DIRECOES = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const PASSO_M = 50;

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
      for (let z = 0; z <= 170000; z += 500) for (let x = -1500; x <= 1500; x += 500) max = Math.max(max, alturaTerreno(p, x, z));
      assert.ok(max < 300, `${cenario}: ${max.toFixed(0)} m`);
    }
  });

  it('prepararPistas calcula a base uma vez e não muda o relevo', () => {
    for (const cenario of ['porto', 'medevac', 'carga', 'sar']) {
      const p = perfilTerreno(cenario);
      const cruas = pistasDaMissao(criarMissao(cenario, 222).destinos);
      const prontas = prepararPistas(p, cruas);
      assert.equal(prontas.length, cruas.length);
      for (const [i, pista] of prontas.entries()) {
        assert.equal(cruas[i].baseM, undefined, 'não altera as pistas recebidas');
        assert.equal(pista.baseM, alturaTerreno(p, pista.x, pista.z));
        for (let s = 0; s <= 6000; s += 750) {
          assert.equal(alturaTerreno(p, pista.x + s, pista.z - s / 2, prontas), alturaTerreno(p, pista.x + s, pista.z - s / 2, cruas));
        }
      }
    }
  });

  it('nenhuma pista fica a flutuar no mar: a 2 km há sempre terra', () => {
    for (const cenario of ['porto', 'medevac', 'carga', 'sar']) {
      const p = perfilTerreno(cenario);
      const pistas = pistasDaMissao(criarMissao(cenario, 222).destinos);
      for (const pista of pistas) {
        for (const [dx, dz] of DIRECOES) {
          const h = alturaTerreno(p, pista.x + dx * 2000, pista.z + dz * 2000, pistas);
          assert.ok(h >= 0, `${cenario}/${pista.id} (${dx}, ${dz}): ${h.toFixed(1)} m`);
        }
      }
    }
  });

  it('ilhéu baixo e sem rebordo: nunca levanta o terreno acima de PLANO + 1,5 m', () => {
    const TETO_M = PLANO_PISTA_M + 1.5;
    let comIlheu = 0;
    for (const cenario of ['porto', 'medevac', 'carga', 'sar']) {
      const p = perfilTerreno(cenario);
      const pistas = prepararPistas(p, pistasDaMissao(criarMissao(cenario, 222).destinos));
      for (const pista of pistas.filter((q) => q.ilheu)) {
        comIlheu++;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * 2 * Math.PI;
          for (let s = 0; s <= 3000; s += PASSO_M) {
            const x = pista.x + s * Math.cos(a);
            const z = pista.z + s * Math.sin(a);
            // Onde já há ilha natural mais alta (borda de ilha), o ilhéu não a toca.
            const limite = Math.max(TETO_M, alturaTerreno(p, x, z));
            const h = alturaTerreno(p, x, z, pistas);
            assert.ok(h <= limite + 1e-9, `${cenario}/${pista.id} rumo ${k}/16 a ${s} m: ${h.toFixed(2)} m`);
          }
        }
      }
    }
    assert.ok(comIlheu >= 5, 'há pistas com ilhéu para verificar');
  });

  it('rampas das pistas sem paredes: declive ≤ 8 % em 16 rumos, do plano ao fim da rampa', () => {
    for (const cenario of ['porto', 'medevac', 'carga', 'sar']) {
      const p = perfilTerreno(cenario);
      const pistas = prepararPistas(p, pistasDaMissao(criarMissao(cenario, 222).destinos));
      for (const pista of pistas) {
        const alcance = alcanceRampaM(pista);
        assert.ok(alcance > pista.raioPlanoM, `${cenario}/${pista.id}: alcance ${alcance} m`);
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * 2 * Math.PI;
          let anterior = alturaTerreno(p, pista.x, pista.z, pistas);
          for (let s = PASSO_M; s <= alcance; s += PASSO_M) {
            const h = alturaTerreno(p, pista.x + s * Math.cos(a), pista.z + s * Math.sin(a), pistas);
            assert.ok(Math.abs(h - anterior) <= 0.08 * PASSO_M, `${cenario}/${pista.id} rumo ${k}/16 a ${s} m: ${anterior.toFixed(1)} → ${h.toFixed(1)} m`);
            anterior = h;
          }
        }
      }
    }
  });
});
