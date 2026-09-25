import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pontuar, resumir } from './avaliacao-jev.mjs';
import { perguntasTatico, PERGUNTAS_INCIDENTE } from './perguntas.mjs';
import { perguntasTaticoEn, PERGUNTAS_INCIDENTE_EN } from './perguntas-en.mjs';
import { MANOBRAS_TATICAS } from './decisao.mjs';
import { CASOS_TATICO } from '../scripts/casos-tatico.mjs';

const ENUMS = {
  separacao: ['conflito', 'marginal', 'folgada'],
  regra_do_ar: ['cumpre', 'neutra', 'incumpre'],
  nuvem: ['livre', 'entra'],
  terreno: ['livre', 'perto'],
  desvio_rota: ['nenhum', 'pequeno', 'grande'],
  conforto: ['suave', 'brusca'],
};

describe('pontuação do banco de casos', () => {
  it('acerto, massa nas aceites e confiança', () => {
    const answers = { manobraTactica: { choice: 'direita', probabilities: { direita: 0.7, subir: 0.2, manter: 0.1 } } };
    const r = pontuar(answers, { manobraTactica: 0.62 }, 'manobraTactica', ['direita', 'subir']);
    assert.deepEqual(r, { escolha: 'direita', acerto: true, massa: 0.8999999999999999, confianca: 0.62 });
    assert.equal(pontuar(answers, null, 'manobraTactica', ['manter']).acerto, false);
  });

  it('resume acerto, brier e faixas de confiança', () => {
    const s = resumir([
      { acerto: true, massa: 1, confianca: 0.95, latencia_ms: 300, tokens: 2000 },
      { acerto: false, massa: 0.2, confianca: 0.4, latencia_ms: 500, tokens: 2200 },
    ]);
    assert.equal(s.acerto, 0.5);
    assert.equal(s.brier, 0.32);
    assert.deepEqual(s.confianca.alta, { n: 1, acertos: 1 });
    assert.deepEqual(s.confianca.baixa, { n: 1, acertos: 0 });
    assert.equal(s.latencia_p95_ms, 500);
    assert.equal(s.tokens_medios, 2100);
  });
});

describe('casos tácticos', () => {
  it('cada caso tem categorias válidas e aceites entre as candidatas', () => {
    const ids = new Set();
    for (const c of CASOS_TATICO) {
      assert.ok(!ids.has(c.id), `id repetido ${c.id}`);
      ids.add(c.id);
      const candidatas = Object.keys(c.estado.manobras);
      assert.ok(candidatas.every((m) => MANOBRAS_TATICAS.includes(m)), c.id);
      assert.ok(c.aceites.length && c.aceites.every((m) => candidatas.includes(m)), `${c.id}: aceites fora das candidatas`);
      const ameacas = new Set(c.estado.ameacas.map((a) => a.id));
      for (const [nome, m] of Object.entries(c.estado.manobras)) {
        for (const [campo, valores] of Object.entries(ENUMS)) assert.ok(valores.includes(m[campo]), `${c.id}/${nome}/${campo}=${m[campo]}`);
        assert.ok(m.ameaca_critica === 'nenhuma' || ameacas.has(m.ameaca_critica), `${c.id}/${nome}: ameaça crítica desconhecida`);
        // Nenhuma manobra aceite está em conflito: a primeira prioridade é a separação.
        if (c.aceites.includes(nome)) assert.notEqual(m.separacao, 'conflito', `${c.id}/${nome}`);
      }
    }
    assert.ok(CASOS_TATICO.length >= 12);
  });
});

describe('perguntas tácticas', () => {
  it('as opções são só as candidatas do estado, sem prioritária quando não há ameaças', () => {
    const final = CASOS_TATICO.find((c) => c.id === 'final_trafego');
    assert.deepEqual(Object.keys(perguntasTatico(final.estado).manobraTactica.criteria), MANOBRAS_TATICAS.filter((m) => m !== 'descer'));
    const livre = CASOS_TATICO.find((c) => c.id === 'sem_ameacas');
    assert.equal(perguntasTatico(livre.estado).ameacaPrioritaria, undefined);
    const duas = CASOS_TATICO.find((c) => c.id === 'duas_ameacas');
    assert.deepEqual(Object.keys(perguntasTatico(duas.estado).ameacaPrioritaria.criteria), ['a1', 'a2']);
  });

  it('português e inglês têm as mesmas chaves, tipos e opções', () => {
    for (const c of CASOS_TATICO) {
      const pt = perguntasTatico(c.estado);
      const en = perguntasTaticoEn(c.estado);
      assert.deepEqual(Object.keys(en), Object.keys(pt));
      for (const k of Object.keys(pt)) {
        assert.equal(en[k].type, pt[k].type);
        assert.deepEqual(Object.keys(en[k].criteria), Object.keys(pt[k].criteria));
      }
    }
    for (const [k, p] of Object.entries(PERGUNTAS_INCIDENTE)) {
      assert.equal(PERGUNTAS_INCIDENTE_EN[k].type, p.type, k);
      assert.deepEqual(Object.keys(PERGUNTAS_INCIDENTE_EN[k].criteria), Object.keys(p.criteria), k);
    }
  });
});
