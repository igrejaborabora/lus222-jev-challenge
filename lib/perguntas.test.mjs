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

  it('só acrescenta instruções multi-obstáculo no piloto contínuo', () => {
    const normal = perguntasPara('incidente', { voo: { fase: 'cruzeiro' } });
    const piloto = perguntasPara('incidente', { voo: { fase: 'piloto_continuo' } });
    assert.doesNotMatch(normal.manobraLateral.instructions, /folgas_candidatas/);
    assert.match(piloto.manobraLateral.instructions, /folgas_candidatas/);
    assert.match(piloto.manobraVertical.instructions, /três a cinco obstáculos/i);
  });

  it('o contexto não proíbe o PIC e não cola frases', () => {
    const acao = PERGUNTAS_INCIDENTE.acaoMissao.instructions;
    assert.doesNotMatch(acao, /Nunca esperas Accept\/Reject/);
    assert.match(acao, /geometria\. Escolhe a acção/);
  });

  it('fora do envelope julga só o estado, sem depender de outras respostas', () => {
    // As perguntas correm isoladas: esta não vê a distribuição de acaoMissao.
    assert.doesNotMatch(PERGUNTAS_INCIDENTE.precisaRevisaoPIC.instructions, /probabilidade|melhor acção/i);
  });
});
