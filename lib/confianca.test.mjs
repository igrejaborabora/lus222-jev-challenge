import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { confiancaDe, encaminhar, nivelDe, revisaoSugerida } from './confianca.mjs';
import { picEsperado } from '../public/src/avaliacao-sim.js';

const replays = Object.fromEntries(await Promise.all(['porto', 'medevac', 'carga', 'sar'].map(async (id) => [
  id,
  JSON.parse(await readFile(new URL(`../public/replays/${id}.json`, import.meta.url))),
])));

describe('encaminhamento por confiança', () => {
  it('age a partir de 0,9, assinala entre 0,5 e 0,9 e pede o PIC abaixo', () => {
    assert.equal(nivelDe(0.97), 'agir');
    assert.equal(nivelDe(0.9), 'agir');
    assert.equal(nivelDe(0.64), 'assinalar');
    assert.equal(nivelDe(0.5), 'assinalar');
    assert.equal(nivelDe(0.46), 'pic');
    assert.equal(nivelDe(null), 'agir', 'sem sinal não se escala');
  });

  it('usa a confiança do Gateway e, sem ela, a probabilidade máxima', () => {
    const answers = { acaoMissao: { choice: 'orbitar', probabilities: { orbitar: 0.47, prosseguir: 0.4, regressar_base: 0.13 } } };
    assert.deepEqual(confiancaDe({ answers, confidence: { acaoMissao: 0.62 } }), { valor: 0.62, fonte: 'confidence' });
    assert.deepEqual(confiancaDe({ answers }), { valor: 0.47, fonte: 'probabilidade' });
    assert.deepEqual(confiancaDe({ answers: { acaoMissao: { choice: 'orbitar' } } }), { valor: null, fonte: null });
    assert.equal(encaminhar({ answers }).nivel, 'pic');
  });

  it('nos replays gravados pede o PIC no máximo uma vez por missão, na luz do SAR', () => {
    const pedidos = [];
    for (const [id, r] of Object.entries(replays)) {
      const nestaMissao = Object.entries(r.eventos).filter(([, resposta]) => encaminhar(resposta).nivel === 'pic');
      assert.ok(nestaMissao.length <= 1, `${id}: ${nestaMissao.length} escaladas`);
      pedidos.push(...nestaMissao.map(([ev]) => `${id}/${ev}`));
    }
    assert.deepEqual(pedidos, ['sar/luz']);
  });

  it('a revisão por confiança concorda mais com a rubrica do que P(revisão PIC) ≥ 0,55', () => {
    let porConfianca = 0;
    let porPergunta = 0;
    let total = 0;
    for (const [id, r] of Object.entries(replays)) {
      for (const [ev, jev] of Object.entries(r.eventos)) {
        const esperado = picEsperado(id, ev);
        if (esperado == null) continue;
        total += 1;
        if (revisaoSugerida(jev) === esperado) porConfianca += 1;
        if ((jev.answers.precisaRevisaoPIC.probability >= 0.55) === esperado) porPergunta += 1;
      }
    }
    assert.equal(total, 15);
    assert.equal(porConfianca, 12);
    assert.equal(porPergunta, 7);
  });
});
