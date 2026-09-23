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
  percursoConcluido,
  novoControloPiloto,
  novoPipelinePiloto,
  obstaculosCenario,
  obstaculosVisiveis,
  reservarPasso,
  separacaoInstantanea,
  selecionarRespostaReplay,
  suspenderControloPiloto,
} from '../public/src/piloto-corredor.js';
import { novoAutomato, passoAutomato } from './automato.mjs';

/** Põe o avião no referencial do corredor: lateral positivo = direita do piloto. */
function colocarNoCurso(aviao, percurso, aoLongo, lateral = 0) {
  const h = percurso.origem.heading;
  aviao.x = percurso.origem.x + Math.sin(h) * aoLongo - Math.cos(h) * lateral;
  aviao.z = percurso.origem.z + Math.cos(h) * aoLongo + Math.sin(h) * lateral;
}

/** Voa `segundos` com uma ordem lateral fixa e devolve a separação mínima ao alvo. */
function separacaoComOrdem(lateral, alvoId) {
  const percurso = criarPercursoPiloto(222);
  const alvo = percurso.obstaculos.find((o) => o.id === alvoId);
  const aviao = novoAutomato();
  colocarNoCurso(aviao, percurso, alvo.ao_longo_m - 260);
  aviao.heading = percurso.origem.heading;
  aviao.y = alvo.altitude_m;
  const controlo = novoControloPiloto();
  for (let i = 0; i < 110; i++) {
    // O pipeline reconfirma a ordem a cada 400 ms.
    if (i % 5 === 0) aplicarOrdemPiloto(controlo, aviao, { acao: 'prosseguir', vertical: 'manter', lateral, urgencia: 2 }, i * 80);
    actualizarOrdemPiloto(controlo, aviao, i * 80);
    passoAutomato(aviao, 0.08);
    actualizarSeparacoes(percurso, aviao);
  }
  return percurso.separacoes.get(alvo.id);
}

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

  it('mantém no cenário uma ameaça já ultrapassada que a janela do JEV largou', () => {
    const percurso = criarPercursoPiloto(222);
    const aviao = novoAutomato();
    const alvo = percurso.obstaculos[0];
    const distancia = alvo.ao_longo_m + 80;
    aviao.x = percurso.origem.x + Math.sin(percurso.origem.heading) * distancia;
    aviao.z = percurso.origem.z + Math.cos(percurso.origem.heading) * distancia;
    const janela = obstaculosVisiveis(percurso, aviao).map((o) => o.id);
    const cenario = obstaculosCenario(percurso, aviao).map((o) => o.id);
    assert.equal(janela.includes(alvo.id), false);
    assert.equal(cenario.includes(alvo.id), true);
  });

  it('fixa as ameaças no corredor mesmo quando o avião guina', () => {
    const percurso = criarPercursoPiloto(222);
    const a = novoAutomato();
    const b = novoAutomato();
    b.heading += 0.9;
    b.x += 40;
    b.y += 12;
    const oa = estadoPassoPiloto(percurso, a).geometria.obstaculos;
    const ob = estadoPassoPiloto(percurso, b).geometria.obstaculos;
    assert.ok(oa.length >= 3);
    for (const item of oa) {
      const outro = ob.find((o) => o.id === item.id);
      assert.ok(outro, item.id);
      assert.equal(outro.mundo_x, item.mundo_x);
      assert.equal(outro.mundo_z, item.mundo_z);
      assert.equal(outro.mundo_rumo, percurso.origem.heading);
      assert.ok(Number.isFinite(item.mundo_y));
    }
  });

  it('a folga anunciada do lado certo é a que de facto separa (sinal lateral)', () => {
    const percurso = criarPercursoPiloto(222);
    for (const alvo of percurso.obstaculos.filter((o) => o.folga !== 'alta').slice(0, 2)) {
      const aviao = novoAutomato();
      colocarNoCurso(aviao, percurso, alvo.ao_longo_m - 150);
      aviao.y = alvo.altitude_m;
      const o = estadoPassoPiloto(percurso, aviao).geometria.obstaculos.find((x) => x.id === alvo.id);
      const ladoAnunciado = o.folga_pela_direita_m > o.folga_pela_esquerda_m ? 'direita' : 'esquerda';
      assert.equal(ladoAnunciado, alvo.folga, `${alvo.id}: folgas apontam para ${ladoAnunciado}`);
      const outro = ladoAnunciado === 'direita' ? 'esquerda' : 'direita';
      assert.ok(
        separacaoComOrdem(ladoAnunciado, alvo.id) > separacaoComOrdem(outro, alvo.id),
        `${alvo.id}: seguir a folga ${ladoAnunciado} tem de separar mais do que ${outro}`,
      );
    }
  });

  it('as folgas por obstáculo mudam com a posição do avião', () => {
    const percurso = criarPercursoPiloto(222);
    const aviao = novoAutomato();
    const antes = estadoPassoPiloto(percurso, aviao).geometria.obstaculos[0];
    aviao.y += 30;
    const depois = estadoPassoPiloto(percurso, aviao).geometria.obstaculos[0];
    assert.notEqual(antes.folga_por_cima_m, depois.folga_por_cima_m);
  });

  it('não envia obstáculos já ultrapassados', () => {
    const percurso = criarPercursoPiloto(222);
    const aviao = novoAutomato();
    colocarNoCurso(aviao, percurso, percurso.obstaculos[0].ao_longo_m + 5);
    const ids = estadoPassoPiloto(percurso, aviao).geometria.obstaculos.map((o) => o.id);
    assert.ok(!ids.includes(percurso.obstaculos[0].id));
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
    colocarNoCurso(aviao, percurso, alvo.ao_longo_m, alvo.lateral_m);
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

  it('mantém o alvo enquanto o JEV confirma e regressa ao eixo sem confirmações', () => {
    const percurso = criarPercursoPiloto(222);
    const aviao = novoAutomato();
    const controlo = novoControloPiloto();
    const evasao = { acao: 'prosseguir', vertical: 'subir', lateral: 'direita', urgencia: 2 };
    assert.equal(aplicarOrdemPiloto(controlo, aviao, evasao, 0), true);
    assert.equal(aplicarOrdemPiloto(controlo, aviao, evasao, 400), false);
    for (let ms = 0; ms <= 16_000; ms += 16) {
      if (ms % 400 === 0) aplicarOrdemPiloto(controlo, aviao, evasao, ms);
      actualizarOrdemPiloto(controlo, aviao, ms);
      passoAutomato(aviao, 0.016);
    }
    const confirmado = estadoPassoPiloto(percurso, aviao).voo;
    assert.ok(confirmado.posicao_x_m > 35, `lateral ${confirmado.posicao_x_m} m à direita`);
    assert.ok(confirmado.altitude_m > 70, `altitude ${confirmado.altitude_m} m`);
    let expirou = false;
    for (let ms = 16_016; ms <= 36_000; ms += 16) {
      expirou = actualizarOrdemPiloto(controlo, aviao, ms) || expirou;
      passoAutomato(aviao, 0.016);
    }
    assert.equal(expirou, true);
    const eixo = estadoPassoPiloto(percurso, aviao).voo;
    assert.ok(Math.abs(eixo.posicao_x_m) < 12, `regresso ao eixo: ${eixo.posicao_x_m} m`);
  });

  it('uma ordem sempre igual não chicoteia nem vira uma curva permanente', () => {
    const aviao = novoAutomato();
    const controlo = novoControloPiloto();
    const evasao = { acao: 'prosseguir', vertical: 'manter', lateral: 'direita', urgencia: 3 };
    let pico = 0;
    let desvio = 0;
    for (let ms = 0; ms <= 30_000; ms += 16) {
      if (ms % 400 === 0) aplicarOrdemPiloto(controlo, aviao, evasao, ms);
      actualizarOrdemPiloto(controlo, aviao, ms);
      const antes = aviao.heading;
      passoAutomato(aviao, 0.016);
      pico = Math.max(pico, Math.abs(aviao.heading - antes) / 0.016);
      desvio = Math.max(desvio, Math.abs(aviao.heading - 0.7));
    }
    assert.ok(pico < 0.5, `yaw ${pico} rad/s`);
    assert.ok(desvio <= 0.5, `rumo afastou-se ${desvio} rad do corredor`);
  });

  it('suspende a retenção da ordem durante uma pausa', () => {
    const aviao = novoAutomato();
    const controlo = novoControloPiloto();
    aplicarOrdemPiloto(controlo, aviao, { acao: 'prosseguir', vertical: 'subir', lateral: 'direita', urgencia: 2 }, 0);
    suspenderControloPiloto(controlo, 400, 5_400);
    assert.equal(actualizarOrdemPiloto(controlo, aviao, 5_500), false);
    assert.equal(controlo.neutralizada, false);
    assert.equal(actualizarOrdemPiloto(controlo, aviao, 6_700), true);
    assert.equal(controlo.neutralizada, true);
  });

  for (const latenciaMs of [450, 1500]) {
    it(`ciclo fechado: seguir as folgas separa de todos os obstáculos (${latenciaMs} ms)`, () => {
      const percurso = criarPercursoPiloto(222);
      const aviao = novoAutomato();
      const controlo = novoControloPiloto();
      const pipeline = novoPipelinePiloto();
      const fila = [];
      for (let t = 0; t < 90_000 && !percursoConcluido(percurso, aviao); t += 16) {
        for (const pedido of fila.filter((f) => f.chega <= t)) {
          fila.splice(fila.indexOf(pedido), 1);
          if (concluirPasso(pipeline, pedido.ticket.id, { latencia_ms: latenciaMs }, t).aplicar) {
            aplicarOrdemPiloto(controlo, aviao, pedido.ordem, t);
          }
        }
        actualizarOrdemPiloto(controlo, aviao, t);
        passoAutomato(aviao, 0.016);
        actualizarSeparacoes(percurso, aviao);
        if (deveDespacharPasso(pipeline, t) && deveDespacharNoPercurso(percurso, aviao)) {
          const entrada = estadoPassoPiloto(percurso, aviao);
          const o = entrada.geometria.obstaculos[0];
          const lateral = o.folga_pela_direita_m > o.folga_pela_esquerda_m ? 'direita' : 'esquerda';
          fila.push({
            ticket: reservarPasso(pipeline, entrada, t),
            ordem: { acao: 'prosseguir', vertical: 'subir', lateral, urgencia: 2 },
            chega: t + latenciaMs,
          });
        }
      }
      assert.equal(percursoConcluido(percurso, aviao), true);
      for (const o of percurso.obstaculos.slice(0, -2)) {
        assert.ok(percurso.separacoes.get(o.id) > 5, `${o.id}: ${percurso.separacoes.get(o.id)} m`);
      }
    });
  }
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
