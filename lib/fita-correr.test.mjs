import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estadoInicial, gerarFita } from './fita.mjs';
import { estadoAteIndice, planoDoBeat, podeVoltar } from './fita-correr.mjs';

describe('recuar na fita', () => {
  it('só volta quando já há um incidente anterior', () => {
    assert.equal(podeVoltar(-1), false);
    assert.equal(podeVoltar(0), false);
    assert.equal(podeVoltar(1), true);
    assert.equal(podeVoltar(1.5), false);
  });

  it('repete a decisão registada e não pede evaluate', () => {
    const jev = {
      answers: {
        acaoMissao: { choice: 'desviar_alternativo' },
        manobraVertical: { choice: 'subir' },
        manobraLateral: { choice: 'direita' },
        urgencia: { score: 2 },
      },
    };
    const replay = planoDoBeat([{ jev }], 0);
    assert.equal(replay.modo, 'replay');
    assert.equal(replay.evasao.vertical, 'subir');
    assert.equal(replay.evasao.lateral, 'direita');
    assert.equal(planoDoBeat([{ jev }], 1).modo, 'evaluate');
    assert.equal(planoDoBeat([], 0).modo, 'evaluate');
  });

  it('reconstrói o estado do beat sem depender do ponteiro actual', () => {
    const fita = gerarFita('medevac', 222);
    const base = estadoInicial('medevac', { semente: 222 });
    const noFim = estadoAteIndice(base, fita.incidentes, 2);
    assert.equal(noFim.incidente.id, fita.incidentes[2].id);
    assert.ok(noFim.geometria.obstaculos.some((o) => o.visual === 'canyon' && o.em_rota));
    const outraVez = estadoAteIndice(base, fita.incidentes, 2);
    assert.equal(outraVez.incidente.id, noFim.incidente.id);
  });
});
