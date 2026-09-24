import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mosaicosAManter, mosaicosNecessarios, planearMosaicos, TAMANHO_MOSAICO_M } from './mosaicos.mjs';

function aplicar(existentes, plano) {
  for (const m of plano.criar) existentes.set(m.chave, {});
  for (const k of plano.remover) existentes.delete(k);
}

function planoCom(existentes, x, z, opcoes) {
  return planearMosaicos(existentes, mosaicosNecessarios(x, z, opcoes), mosaicosAManter(x, z, opcoes));
}

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

  it('não larga nem recria mosaicos ao voar ao longo da fronteira x = 0', () => {
    // As rotas da missão seguem x ≈ 0, a fronteira entre as colunas i = −1 e i = 0.
    for (const raio of [2, 3]) {
      const opcoes = { raio };
      const existentes = new Map();
      aplicar(existentes, planoCom(existentes, -1, 0, opcoes));
      for (let n = 0; n < 10; n++) {
        const x = n % 2 === 0 ? 1 : -1;
        const plano = planoCom(existentes, x, 0, opcoes);
        aplicar(existentes, plano);
        assert.equal(plano.remover.length, 0, `raio ${raio}, travessia ${n}: removeu ${plano.remover}`);
        if (n > 0) assert.equal(plano.criar.length, 0, `raio ${raio}, travessia ${n}: criou de novo`);
      }
    }
  });

  it('larga os mosaicos quando o avião se afasta de verdade', () => {
    const opcoes = { raio: 2 };
    const existentes = new Map();
    aplicar(existentes, planoCom(existentes, -1, 0, opcoes));
    const plano = planoCom(existentes, -1 + 3 * TAMANHO_MOSAICO_M, 0, opcoes);
    assert.ok(plano.remover.includes('-3:0'), 'a coluna mais atrás sai');
    // Fora do raio 2 do mosaico novo, mas ainda dentro do anel extra: fica.
    assert.ok(!plano.remover.includes('-1:0'));
  });
});
