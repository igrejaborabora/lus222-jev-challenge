import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { aplicarIncidente, estadoInicial, gerarFita } from './fita.mjs';
import { CENARIOS } from './cenarios.mjs';
import { decisaoGeometrica } from './decisao.mjs';
import { registarIncidente, resumirMissao, teseCumprida } from './debrief.mjs';

describe('teseCumprida', () => {
  it('aceita acções alternativas da tese', () => {
    const tese = { acao: 'desviar_alternativo', acoesAceites: ['orbitar'], deveEscalar: false };
    assert.equal(
      teseCumprida(tese, { acaoMissao: { choice: 'orbitar' }, destinoPreferido: { choice: 'stol_proximo' } }, false),
      true,
    );
    assert.equal(
      teseCumprida(tese, { acaoMissao: { choice: 'prosseguir' }, destinoPreferido: { choice: 'planeado' } }, false),
      false,
    );
  });
});

describe('resumirMissao', () => {
  it('recusa comparar quando a missão é incompleta', () => {
    const r = resumirMissao({
      cenario: CENARIOS.medevac,
      semente: 222,
      restricoes: {},
      incidentes: [],
      incompleta: true,
      motivoIncompleta: 'o Gateway falhou a meio',
    });
    assert.equal(r.incompleta, true);
    assert.equal(r.fonte, 'bloqueio');
    assert.match(r.veredicto, /não é válida/);
  });

  it('no MEDEVAC a regra prossegue na frente meteorológica e o JEV pode provar a tese', () => {
    const fita = gerarFita('medevac', 222);
    const frente = fita.incidentes[0];
    const estado = aplicarIncidente(estadoInicial('medevac', { semente: 222 }), frente);
    const baseline = { answers: decisaoGeometrica(estado), fonte: 'regra-geometrica' };
    assert.equal(baseline.answers.acaoMissao.choice, 'prosseguir');

    const jev = {
      fonte: 'jev',
      latencia_ms: 900,
      answers: {
        acaoMissao: { choice: 'desviar_alternativo', probabilities: { desviar_alternativo: 0.8, prosseguir: 0.1, orbitar: 0.1, regressar_base: 0, abortar_emergencia: 0 } },
        destinoPreferido: { choice: 'stol_proximo' },
        precisaRevisaoPIC: { probability: 0.1 },
      },
    };
    const reg = registarIncidente({ estado, incidente: frente, jev, baseline, pic: { oferecido: false } });
    assert.equal(reg.tese_ok, true);
    const resumo = resumirMissao({
      cenario: CENARIOS.medevac,
      semente: 222,
      incidentes: [reg],
    });
    assert.equal(resumo.incompleta, false);
    assert.match(resumo.veredicto, /desviar|STOL|céu|regra/i);
    assert.ok(resumo.metricas.teses_acertadas_pct >= 100);
  });
});
