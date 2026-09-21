import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PERGUNTAS_BRIEFING, PERGUNTAS_INCIDENTE, perguntasPara } from './perguntas.mjs';

describe('perguntas', () => {
  it('mantém ≤12 perguntas por chamada', () => {
    assert.ok(Object.keys(PERGUNTAS_BRIEFING).length <= 12);
    assert.ok(Object.keys(PERGUNTAS_INCIDENTE).length <= 12);
    assert.deepEqual(Object.keys(perguntasPara('briefing')), Object.keys(PERGUNTAS_BRIEFING));
    assert.deepEqual(Object.keys(perguntasPara('incidente')), Object.keys(PERGUNTAS_INCIDENTE));
  });

  it('o incidente cobre acção, eixos de evasão, destino, rubricas e PIC', () => {
    for (const k of [
      'acaoMissao',
      'manobraVertical',
      'manobraLateral',
      'destinoPreferido',
      'urgencia',
      'riscoMeteorologico',
      'precisaRevisaoPIC',
      'continuarVoo',
    ]) {
      assert.ok(PERGUNTAS_INCIDENTE[k], k);
    }
    assert.equal(PERGUNTAS_INCIDENTE.manobraVertical.type, 'choice');
    assert.equal(PERGUNTAS_INCIDENTE.manobraLateral.type, 'choice');
    assert.equal(PERGUNTAS_INCIDENTE.acaoMissao.type, 'choice');
    assert.equal(PERGUNTAS_INCIDENTE.urgencia.type, 'score');
    assert.equal(PERGUNTAS_INCIDENTE.precisaRevisaoPIC.type, 'boolean');
    assert.equal(PERGUNTAS_INCIDENTE.urgencia.criteria.length, 4);
  });
});
