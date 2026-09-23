import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  INTERVALO_DECISAO_MS,
  MAX_PEDIDOS_EM_VOO,
  actualizarSeparacoes,
  actualizarOrdemPiloto,
  aplicarOrdemPiloto,
  assinaturaObstaculos,
  concluirPasso,
  criarPercursoPiloto,
  deveDespacharPasso,
  deveDespacharNoPercurso,
  estadoPassoPiloto,
  metricasPiloto,
  novoControloPiloto,
  novoPipelinePiloto,
  reservarPasso,
  separacaoInstantanea,
  selecionarRespostaReplay,
  suspenderControloPiloto,
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

  it('mantém três obstáculos na janela até concluir a prova', () => {
    const percurso = criarPercursoPiloto(222);
    const aviao = novoAutomato();
    for (let i = 0; i < 600 && aviao.z < percurso.distancia_total_m + 500; i++) {
      passoAutomato(aviao, 0.08);
      const entrada = estadoPassoPiloto(percurso, aviao);
      const terminou = entrada.voo.posicao_z_m >= percurso.distancia_total_m;
      if (!terminou) assert.ok(entrada.geometria.obstaculos.length >= 3);
    }
  });

  it('deixa de criar snapshots assim que cruza a saída do percurso', () => {
    const percurso = criarPercursoPiloto(222);
    const aviao = novoAutomato();
    assert.equal(deveDespacharNoPercurso(percurso, aviao), true);
    const distancia = percurso.distancia_total_m + 1;
    aviao.x = percurso.origem.x + Math.sin(percurso.origem.heading) * distancia;
    aviao.z = percurso.origem.z + Math.cos(percurso.origem.heading) * distancia;
    assert.equal(deveDespacharNoPercurso(percurso, aviao), false);
  });

  it('recalcula as folgas quando o avião muda de posição lateral', () => {
    const percurso = criarPercursoPiloto(222);
    const aviao = novoAutomato();
    const antes = estadoPassoPiloto(percurso, aviao).geometria.folgas_candidatas;
    aviao.x += 45;
    const depois = estadoPassoPiloto(percurso, aviao).geometria.folgas_candidatas;
    assert.notDeepEqual(antes, depois);
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

  it('mede separação ao envelope e devolve zero dentro do volume protegido', () => {
    const percurso = criarPercursoPiloto(222);
    const alvo = percurso.obstaculos[0];
    const aviao = novoAutomato();
    aviao.x = percurso.origem.x + Math.sin(percurso.origem.heading) * alvo.ao_longo_m + Math.cos(percurso.origem.heading) * alvo.lateral_m;
    aviao.z = percurso.origem.z + Math.cos(percurso.origem.heading) * alvo.ao_longo_m - Math.sin(percurso.origem.heading) * alvo.lateral_m;
    aviao.y = alvo.altitude_m;
    assert.equal(separacaoInstantanea(percurso, aviao), 0);
    actualizarSeparacoes(percurso, aviao);
    assert.equal(percurso.separacoes.get(alvo.id), 0);
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

  it('preserva cenário, evento e data na proveniência do replay', () => {
    const resposta = { fonte: 'jev', answers: { id: 'aves' } };
    const replays = {
      carga: { gravadoEm: '2026-09-22T11:44:28.817Z', eventos: { aves: resposta } },
      medevac: { eventos: { relevo: resposta } },
      sar: { eventos: { trafego: resposta } },
    };
    const replay = selecionarRespostaReplay(replays, 'aves');
    assert.deepEqual(replay.replay_source, {
      cenario: 'carga',
      evento: 'aves',
      gravado_em: '2026-09-22T11:44:28.817Z',
    });
  });

  it('só antecipa um passo quando muda a janela de obstáculos, não a distância', () => {
    const a = assinaturaObstaculos([{ id: 'torre-1', distancia_m: 180 }, { id: 'aves-2', distancia_m: 420 }]);
    const b = assinaturaObstaculos([{ id: 'torre-1', distancia_m: 151 }, { id: 'aves-2', distancia_m: 391 }]);
    const c = assinaturaObstaculos([{ id: 'aves-2', distancia_m: 390 }, { id: 'guerra-3', distancia_m: 650 }]);
    assert.equal(a, b);
    assert.notEqual(a, c);
  });

  it('neutraliza uma ordem repetida depois da manobra finita e continua a avançar', () => {
    const aviao = novoAutomato();
    const controlo = novoControloPiloto();
    const evasao = { acao: 'prosseguir', vertical: 'subir', lateral: 'direita', urgencia: 2 };
    aplicarOrdemPiloto(controlo, aviao, evasao, 0, 'janela-a');
    assert.equal(aplicarOrdemPiloto(controlo, aviao, evasao, 80, 'janela-a'), false);
    for (let ms = 0; ms <= 12_000; ms += 80) {
      aplicarOrdemPiloto(controlo, aviao, evasao, ms, 'janela-a');
      actualizarOrdemPiloto(controlo, aviao, ms);
      passoAutomato(aviao, 0.08);
    }
    assert.equal(aviao.vertical, 'manter');
    assert.equal(aviao.lateral, 'manter');
    assert.ok(Math.hypot(aviao.x + 80, aviao.z - 40) > 350);
    assert.ok(aviao.y < 80);
  });

  it('uma janela nova com os mesmos eixos não reinicia a manobra nem chicoteia o rumo', () => {
    const aviao = novoAutomato();
    const controlo = novoControloPiloto();
    const evasao = { acao: 'prosseguir', vertical: 'subir', lateral: 'direita', urgencia: 2 };
    assert.equal(aplicarOrdemPiloto(controlo, aviao, evasao, 0, 'janela-a'), true);
    for (let ms = 0; ms <= 1_200; ms += 16) {
      actualizarOrdemPiloto(controlo, aviao, ms);
      passoAutomato(aviao, 0.016);
    }
    assert.equal(aviao.lateral, 'manter');
    const heading = aviao.heading;
    assert.equal(aplicarOrdemPiloto(controlo, aviao, evasao, 1_200, 'janela-b'), false);
    let pico = 0;
    for (let ms = 1_216; ms <= 3_000; ms += 16) {
      actualizarOrdemPiloto(controlo, aviao, ms);
      const antes = aviao.heading;
      passoAutomato(aviao, 0.016);
      pico = Math.max(pico, Math.abs(aviao.heading - antes) / 0.016);
    }
    assert.ok(pico < 0.5, `yaw ${pico} rad/s com o selo em manter`);
    assert.ok(Math.abs(aviao.heading - heading) < 0.9);
    assert.equal(aviao.lateral, 'manter');
  });

  it('recentra o rumo entre janelas sucessivas e chega ao fim do corredor', () => {
    const aviao = novoAutomato();
    const controlo = novoControloPiloto();
    const evasao = { acao: 'prosseguir', vertical: 'subir', lateral: 'direita', urgencia: 2 };
    for (let ms = 0; ms <= 30_000; ms += 80) {
      const janela = `janela-${Math.floor(ms / 2_000)}`;
      aplicarOrdemPiloto(controlo, aviao, evasao, ms, janela);
      actualizarOrdemPiloto(controlo, aviao, ms);
      passoAutomato(aviao, 0.08);
    }
    const percurso = criarPercursoPiloto(222);
    assert.equal(estadoPassoPiloto(percurso, aviao).voo.posicao_z_m >= percurso.distancia_total_m, true);
    assert.ok(Math.abs(aviao.heading - percurso.origem.heading) < 0.6);
  });

  it('suspende o relógio da manobra durante uma pausa', () => {
    const aviao = novoAutomato();
    const controlo = novoControloPiloto();
    aplicarOrdemPiloto(controlo, aviao, { acao: 'prosseguir', vertical: 'subir', lateral: 'direita', urgencia: 2 }, 0, 'janela-a');
    suspenderControloPiloto(controlo, 400, 5_400);
    assert.equal(actualizarOrdemPiloto(controlo, aviao, 5_500), false);
    assert.equal(aviao.lateral, 'direita');
    assert.equal(actualizarOrdemPiloto(controlo, aviao, 6_100), true);
    assert.equal(aviao.lateral, 'manter');
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
    assert.equal(deveDespacharPasso(pipeline, 200, 'b'), false);
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

  it('usa a média dos dois valores centrais na mediana par', () => {
    const pipeline = novoPipelinePiloto();
    pipeline.iniciadoEm = 0;
    pipeline.historico.push({ latencia_ms: 300 }, { latencia_ms: 420 });
    assert.equal(metricasPiloto(pipeline, 60_000).latencia_mediana_ms, 360);
  });

  it('não transforma uma separação ainda aberta em zero metros', () => {
    const pipeline = novoPipelinePiloto();
    pipeline.iniciadoEm = 0;
    pipeline.historico.push({ latencia_ms: 300, separacao_min_m: null });
    assert.equal(metricasPiloto(pipeline, 60_000).separacao_min_m, null);
  });
});
