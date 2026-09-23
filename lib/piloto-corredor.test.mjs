import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERVALO_DECISAO_MS,
  MAX_PEDIDOS_EM_VOO,
  actualizarSeparacoes,
  concluirPasso,
  criarPercursoPiloto,
  deveDespacharPasso,
  estadoPassoPiloto,
  metricasPiloto,
  novoPipelinePiloto,
  reservarPasso,
  selecionarRespostaReplay,
} from '../public/src/piloto-corredor.js';
import { novoAutomato, passoAutomato } from './automato.mjs';

describe('percurso contínuo do piloto JEV', () => {
  it('gera um slalom determinístico com torres, aves e tráfego de época', () => {
    const a = criarPercursoPiloto(222);
    const b = criarPercursoPiloto(222);
    assert.deepEqual(a.obstaculos, b.obstaculos);
    assert.ok(a.obstaculos.length >= 7);
    assert.deepEqual(new Set(a.obstaculos.map((o) => o.visual)), new Set(['canyon', 'aves', 'guerra']));
    for (let i = 1; i < a.obstaculos.length; i++) {
      assert.ok(a.obstaculos[i].ao_longo_m - a.obstaculos[i - 1].ao_longo_m >= 145);
    }
  });

  it('envia 3–5 obstáculos próximos e folgas candidatas sem expor a pauta', () => {
    const percurso = criarPercursoPiloto(222);
    const aviao = novoAutomato();
    const entrada = estadoPassoPiloto(percurso, aviao);
    assert.ok(entrada.geometria.obstaculos.length >= 3);
    assert.ok(entrada.geometria.obstaculos.length <= 5);
    assert.ok(entrada.geometria.folgas_candidatas.length >= 3);
    assert.ok(entrada.geometria.folgas_candidatas.every((f) => f.id && f.vertical && f.lateral));
    assert.equal(JSON.stringify(entrada).includes('tese'), false);
  });

  it('mede a separação efectiva enquanto o controlador mantém a última ordem', () => {
    const percurso = criarPercursoPiloto(222);
    const aviao = novoAutomato();
    for (let i = 0; i < 120; i++) {
      passoAutomato(aviao, 0.08);
      actualizarSeparacoes(percurso, aviao);
    }
    const medidas = [...percurso.separacoes.values()];
    assert.ok(medidas.length > 0);
    assert.ok(medidas.every((n) => Number.isFinite(n) && n >= 0));
  });

  it('usa apenas respostas JEV gravadas do cenário visual equivalente', () => {
    const resposta = (id) => ({ fonte: 'jev', answers: { id } });
    const replays = {
      medevac: { eventos: { relevo: resposta('torres') } },
      carga: { eventos: { aves: resposta('aves') } },
      sar: { eventos: { trafego: resposta('época') } },
    };
    assert.equal(selecionarRespostaReplay(replays, 'canyon').answers.id, 'torres');
    assert.equal(selecionarRespostaReplay(replays, 'aves').answers.id, 'aves');
    assert.equal(selecionarRespostaReplay(replays, 'guerra').answers.id, 'época');
    assert.throws(
      () => selecionarRespostaReplay({ ...replays, carga: { eventos: { aves: { fonte: 'regra' } } } }, 'aves'),
      /replay_jev_invalido/,
    );
  });
});

describe('pipeline do piloto JEV', () => {
  it('despacha a cada 400 ms e nunca excede dois pedidos em voo', () => {
    assert.equal(INTERVALO_DECISAO_MS, 400);
    assert.equal(MAX_PEDIDOS_EM_VOO, 2);
    const pipeline = novoPipelinePiloto();
    assert.equal(deveDespacharPasso(pipeline, 0, 'a'), true);
    reservarPasso(pipeline, { passo: 0 }, 0, 'a');
    assert.equal(deveDespacharPasso(pipeline, 399, 'a'), false);
    assert.equal(deveDespacharPasso(pipeline, 400, 'a'), true);
    reservarPasso(pipeline, { passo: 1 }, 400, 'a');
    assert.equal(deveDespacharPasso(pipeline, 800, 'b'), false);
  });

  it('ignora uma resposta antiga que chega depois da mais recente', () => {
    const pipeline = novoPipelinePiloto();
    const primeiro = reservarPasso(pipeline, { passo: 0 }, 0, 'a');
    const segundo = reservarPasso(pipeline, { passo: 1 }, 400, 'b');
    const nova = concluirPasso(pipeline, segundo.id, { latencia_ms: 320 }, 720);
    const antiga = concluirPasso(pipeline, primeiro.id, { latencia_ms: 900 }, 900);
    assert.equal(nova.aplicar, true);
    assert.equal(antiga.aplicar, false);
    assert.equal(pipeline.ultimoAplicado, segundo.sequencia);
  });

  it('calcula mediana, p95, decisões por minuto e separação mínima', () => {
    const pipeline = novoPipelinePiloto();
    pipeline.iniciadoEm = 0;
    pipeline.historico.push(
      { latencia_ms: 300, separacao_min_m: 82 },
      { latencia_ms: 420, separacao_min_m: 54 },
      { latencia_ms: 900, separacao_min_m: 71 },
    );
    const m = metricasPiloto(pipeline, 60_000);
    assert.equal(m.latencia_mediana_ms, 420);
    assert.equal(m.latencia_p95_ms, 900);
    assert.equal(m.decisoes_por_minuto, 3);
    assert.equal(m.separacao_min_m, 54);
  });
});
