import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decimal, linhasPainel, resumoCabecalho } from './painel-jev.mjs';

const porto = JSON.parse(await readFile(new URL('../public/replays/porto.json', import.meta.url)));

describe('painel JEV', () => {
  it('mostra a distribuição inteira de cada choice, não só a escolhida', () => {
    const { answers, confidence } = porto.eventos.baloes;
    const acao = linhasPainel(answers, confidence).find((l) => l.chave === 'acaoMissao');
    assert.equal(acao.tipo, 'choice');
    assert.equal(acao.distribuicao.length, Object.keys(answers.acaoMissao.probabilities).length);
    assert.equal(acao.distribuicao.filter((d) => d.escolhida).length, 1);
    assert.equal(acao.escolha, 'Prosseguir');
    assert.equal(acao.p, answers.acaoMissao.probabilities.prosseguir);
    assert.equal(acao.confianca, confidence.acaoMissao);
  });

  it('mantém a ordem das opções devolvida pelo JEV', () => {
    const probabilities = { orbitar: 0.2, prosseguir: 0.7, regressar_base: 0.1 };
    const [linha] = linhasPainel({ acaoMissao: { choice: 'prosseguir', probabilities } });
    assert.deepEqual(linha.distribuicao.map((d) => d.opcao), ['orbitar', 'prosseguir', 'regressar_base']);
  });

  it('score mostra o nível e o valor fraccionário; boolean mostra Sim/Não sem confiança', () => {
    const linhas = linhasPainel({
      urgencia: { score: 1.47, probabilities: { 0: 0.1, 1: 0.4, 2: 0.4, 3: 0.1 } },
      continuarVoo: { probability: 0.82 },
    }, { urgencia: 0.35, continuarVoo: 0.9 });
    const [urgencia, continuar] = linhas;
    assert.equal(urgencia.tipo, 'score');
    assert.equal(urgencia.escolha, 'Actuar · 1,47/3');
    assert.equal(urgencia.confianca, 0.35);
    assert.equal(continuar.tipo, 'boolean');
    assert.equal(continuar.escolha, 'Sim');
    assert.equal(continuar.confianca, null, 'o JEV não devolve confiança em booleanos');
    assert.equal(continuar.distribuicao[1].p.toFixed(2), '0.18');
    const [fora] = linhasPainel({ precisaRevisaoPIC: { probability: 0.41 } });
    assert.equal(fora.escolha, 'Não');
    assert.equal(fora.p.toFixed(2), '0.59', 'a probabilidade mostrada é a da resposta escolhida');
  });

  it('resume perguntas em paralelo, latência e tokens', () => {
    const texto = resumoCabecalho({ answers: { a: {}, b: {}, c: {} }, latencia_ms: 412.4, usage: { inputTokens: 3000, outputTokens: 85 } });
    assert.equal(texto, '3 perguntas em paralelo · 412 ms · 3,1 mil tokens');
    assert.match(resumoCabecalho({ answers: { a: {} }, latencia_ms: 380 }, { replay: true }), /1 pergunta · 380 ms gravados/);
  });

  it('formata com vírgula e duas casas', () => {
    assert.equal(decimal(0.5), '0,50');
    assert.equal(decimal(undefined), '—');
  });
});
