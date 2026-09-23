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
