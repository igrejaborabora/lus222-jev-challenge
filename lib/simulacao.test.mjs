import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { criarMissao, avancarMissao, aplicarDecisao, proximoEvento, estadoParaAvaliacao } from '../public/src/simulacao.js';
import { validarRespostas } from '../public/src/contrato-jev.js';

const decisao = (acao = 'prosseguir', destino = 'planeado') => ({
  acaoMissao: { choice: acao, probabilities: { [acao]: 1 } },
  manobraVertical: { choice: 'manter', probabilities: { manter: 1 } },
  manobraLateral: { choice: 'manter', probabilities: { manter: 1 } },
  destinoPreferido: { choice: destino, probabilities: { [destino]: 1 } },
  urgencia: { score: 1 },
  riscoMeteorologico: { score: 1 },
  precisaRevisaoPIC: { probability: 0.1 },
  continuarVoo: { probability: 0.9 },
});

describe('simulação causal', () => {
  it('é determinística e consome combustível ao progredir', () => {
    const run = () => {
      let m = criarMissao('medevac', 222);
      for (let i = 0; i < 100; i++) m = avancarMissao(m, 0.1);
      return m;
    };
    const a = run();
    assert.deepEqual(a, run());
    assert.ok(a.voo.combustivelKg < criarMissao('medevac', 222).voo.combustivelKg);
    assert.ok(a.voo.distanciaPercorridaM > 0);
    assert.ok(a.voo.velocidadeMs > 0 && a.voo.altitudeM > 0);
  });

  it('muda rota e eventos possíveis quando regressa', () => {
    let m = criarMissao('carga', 222);
    const antes = m.destinoId;
    const r = aplicarDecisao(m, decisao('regressar_base', 'origem'));
    m = r.missao;
    assert.notEqual(m.destinoId, antes);
    assert.equal(m.destinoId, 'origem');
    assert.equal(m.fase, 'regresso');
    assert.equal(r.supervisor.interveio, false);
    assert.ok(!m.eventosPendentes.some((e) => e.rota === 'planeado'));
  });

  it('orbitar gasta recursos e abortar termina a missão', () => {
    let m = aplicarDecisao(criarMissao('sar', 222), decisao('orbitar')).missao;
    assert.equal(m.fase, 'orbita');
    const f = m.voo.combustivelKg;
    m = avancarMissao(m, 30);
    assert.ok(m.voo.combustivelKg < f);
    m = aplicarDecisao(m, decisao('abortar_emergencia', 'origem')).missao;
    assert.equal(m.fase, 'emergencia');
    assert.ok(m.destinoId !== 'planeado');
  });

  it('não oferece de novo um evento já tratado', () => {
    let m = criarMissao('medevac', 222);
    const e = proximoEvento(m);
    assert.ok(e);
    m = aplicarDecisao(m, decisao()).missao;
    assert.notEqual(proximoEvento(m)?.id, e.id);
  });

  it('bloqueia pista insuficiente e atribui a proteção ao supervisor', () => {
    const m = criarMissao('medevac', 222);
    const r = aplicarDecisao(m, decisao('desviar_alternativo', 'stol_proximo'));
    assert.equal(r.supervisor.interveio, true);
    assert.match(r.supervisor.motivo, /pista/i);
    assert.notEqual(r.missao.destinoId, 'stol_proximo');
  });

  it('envia estado físico e alternativas sem enviar a rubrica', () => {
    const m = criarMissao('carga', 222);
    const entrada = estadoParaAvaliacao(m, proximoEvento(m));
    assert.ok(entrada.voo.velocidade_ms > 0);
    assert.ok(entrada.alternativas.length > 0);
    assert.equal(entrada.tese, undefined);
    assert.equal(entrada.incidente.tese, undefined);
  });
});

describe('contrato JEV', () => {
  it('recusa respostas incompletas ou probabilidades inválidas', () => {
    assert.equal(validarRespostas('incidente', { acaoMissao: { choice: 'prosseguir' } }).ok, false);
    const bad = decisao();
    bad.acaoMissao.probabilities.prosseguir = 1.4;
    assert.equal(validarRespostas('incidente', bad).ok, false);
  });

  it('aceita respostas tipadas completas', () => {
    assert.equal(validarRespostas('incidente', decisao()).ok, true);
  });
});
