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
