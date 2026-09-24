import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { avaliarLinha, resumirLinhas } from '../public/src/avaliacao-sim.js';

const linha = (overrides = {}) => ({
  id: 'frente', cenario: 'medevac',
  entrada: { alternativas: [{ id: 'stol_proximo', pista_m: 520, pista_necessaria_m: 610, combustivel_necessario_kg: 180 }] },
  jev: { fonte: 'jev', answers: { acaoMissao: { choice: 'desviar_alternativo' }, destinoPreferido: { choice: 'stol_proximo' }, manobraVertical: { choice: 'manter' }, manobraLateral: { choice: 'manter' }, precisaRevisaoPIC: { probability: 0.85 } }, confidence: { acaoMissao: 0.62 } },
  supervisor: { interveio: true, motivo: 'Pista insuficiente' },
  pic: { interveio: false },
  ...overrides,
});

describe('avaliação independente', () => {
  it('expõe contradição de pista mesmo quando a ação geral é aceitável', () => {
    const r = avaliarLinha(linha());
    assert.equal(r.acao, 'conforme');
    assert.equal(r.destino, 'incompatível');
    assert.equal(r.limites, 'bloqueado');
    assert.match(r.alertas.join(' '), /pista/i);
  });

  it('não confunde revisão sugerida com intervenção humana', () => {
    const r = avaliarLinha(linha());
    assert.equal(r.picSugerido, true);
    assert.equal(r.picHumano, false);
    assert.equal(r.picConforme, false);
  });

  it('avalia a pista efetiva ao prosseguir, não a alternativa condicional', () => {
    const original = linha();
    const r = avaliarLinha({
      ...original,
      entrada: {
        missao: { destino: 'planeado' }, aeronave: { fuel_kg: 600 },
        alternativas: [
          { id: 'planeado', pista_m: 520, pista_necessaria_m: 575, combustivel_necessario_kg: 100 },
          { id: 'aeroporto_alternativo', pista_m: 1600, pista_necessaria_m: 575, combustivel_necessario_kg: 150 },
        ],
      },
      jev: { ...original.jev, answers: { ...original.jev.answers, acaoMissao: { choice: 'prosseguir' }, destinoPreferido: { choice: 'aeroporto_alternativo' } } },
    });
    assert.equal(r.destino, 'incompatível');
    assert.match(r.alertas.join(' '), /520 m para 575 m/);
  });

  it('resume dimensões separadas sem percentagem geral', () => {
    const r = resumirLinhas([linha()]);
    assert.equal(r.total, 1);
    assert.equal(r.limitesBloqueados, 1);
    assert.equal(r.picExcessivo, 1);
    assert.equal(r.sucessoGeral, undefined);
  });
});
