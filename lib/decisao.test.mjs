import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ACOES,
  LIMIAR_INTEGRIDADE_ABORTAR,
  MANOBRAS_L,
  MANOBRAS_V,
  decisaoGeometrica,
  deveEscalarPIC,
  evasaoDeAnswers,
  lerEstado,
  manobraGeometrica,
  maxProbabilidade,
  pontoAmeaca,
} from './decisao.mjs';

describe('lerEstado', () => {
  it('fixa o tipo LUS-222 e clampeia lixo', () => {
    const e = lerEstado({
      aeronave: { tipo: 'drone', fuel_kg: -9, payload_kg: 99999, tripulantes: 8, integridade: 140 },
      missao: { tipo: 'espionagem', almas: -3, relogio_s: 'x' },
      ambiente: { vis_km: 'alta', vento_kt: 400 },
      geometria: { obstaculos: [{ em_rota: 1, distancia_m: -4 }, { tipo: 'a' }, { tipo: 'b' }, { tipo: 'c' }, { tipo: 'd' }, { tipo: 'e' }] },
    });
    assert.equal(e.aeronave.tipo, 'LUS-222');
    assert.equal(e.aeronave.fuel_kg, 0);
    assert.equal(e.aeronave.payload_kg, 2700);
    assert.equal(e.aeronave.tripulantes, 2);
    assert.equal(e.aeronave.integridade, 100);
    assert.equal(e.missao.tipo, 'carga');
    assert.equal(e.missao.almas, 0);
    assert.equal(e.geometria.obstaculos.length, 5);
    assert.equal(e.geometria.obstaculos[0].em_rota, true);
  });

  it('preserva até cinco folgas candidatas com ids e eixos válidos', () => {
    const e = lerEstado({
      geometria: {
        obstaculos: [],
        folgas_candidatas: [
          { id: 'direita-alta', vertical: 'subir', lateral: 'direita', folga_min_m: 64, segredo: 'não enviar' },
          { id: 'inválida', vertical: 'voar', lateral: 'lado', folga_min_m: 9999 },
        ],
      },
    });
    assert.deepEqual(e.geometria.folgas_candidatas[0], {
      id: 'direita-alta',
      vertical: 'subir',
      lateral: 'direita',
      folga_min_m: 64,
    });
    assert.equal(e.geometria.folgas_candidatas[1].vertical, 'manter');
    assert.equal(e.geometria.folgas_candidatas[1].lateral, 'manter');
    assert.equal(e.geometria.folgas_candidatas[1].folga_min_m, 500);
  });
});

describe('decisaoGeometrica (cego)', () => {
  it('prossegue sem obstáculo e com integridade sã', () => {
    const e = lerEstado({
      aeronave: { integridade: 100 },
      geometria: { obstaculos: [] },
    });
    const d = decisaoGeometrica(e, 'incidente');
    assert.equal(d.acaoMissao.choice, 'prosseguir');
    assert.equal(d.destinoPreferido.choice, 'planeado');
    assert.equal(d.urgencia.score, 0);
    assert.equal(d.riscoMeteorologico.score, 0);
    assert.ok(d.precisaRevisaoPIC.probability < 0.1);
    assert.ok(d.continuarVoo.probability > 0.8);
  });

  it('aborta só por integridade < 40, mesmo sem obstáculo', () => {
    const e = lerEstado({
      aeronave: { integridade: 30, payload_kg: 2400 },
      missao: { tipo: 'medevac', relogio_s: 120 },
      ambiente: { tecto_ft: 400, vis_km: 1 },
      geometria: { obstaculos: [] },
    });
    const d = decisaoGeometrica(e);
    assert.equal(d.acaoMissao.choice, 'abortar_emergencia');
    assert.ok(e.aeronave.integridade < LIMIAR_INTEGRIDADE_ABORTAR);
  });

  it('desvia só se há obstáculo em rota; ignora meteo, hospital e payload', () => {
    const rico = lerEstado({
      aeronave: { integridade: 90, payload_kg: 2400, fuel_kg: 80 },
      missao: { tipo: 'medevac', relogio_s: 300 },
      ambiente: { tecto_ft: 500, vis_km: 2, comprimento_pista_m: 400, superficie_pista: 'nao_pavimentada' },
      geometria: { obstaculos: [] },
    });
    assert.equal(decisaoGeometrica(rico).acaoMissao.choice, 'prosseguir');

    const comTrafego = lerEstado({
      aeronave: { integridade: 90 },
      geometria: { obstaculos: [{ tipo: 'tráfego', em_rota: true, distancia_m: 800 }] },
    });
    assert.equal(decisaoGeometrica(comTrafego).acaoMissao.choice, 'desviar_alternativo');
  });

  it('no briefing só devolve as chaves de briefing', () => {
    const d = decisaoGeometrica(lerEstado({}), 'briefing');
    assert.equal(d.configuracaoCabine.choice, 'carga');
    assert.equal(d.prioridadeOperacional.choice, 'integridade');
    assert.ok(!('acaoMissao' in d));
  });

  it('as acções do baseline pertencem ao contrato novo', () => {
    const d = decisaoGeometrica(lerEstado({}));
    assert.ok(ACOES.includes(d.acaoMissao.choice));
    assert.ok(MANOBRAS_V.includes(d.manobraVertical.choice));
    assert.ok(MANOBRAS_L.includes(d.manobraLateral.choice));
  });

  it('escolhe eixos só pelas folgas; sem ameaça mantém', () => {
    assert.deepEqual(manobraGeometrica(null), { vertical: 'manter', lateral: 'manter' });
    const eixos = manobraGeometrica({
      folga_por_cima_m: 80,
      folga_por_baixo_m: -20,
      folga_pela_esquerda_m: -12,
      folga_pela_direita_m: 60,
    });
    assert.equal(eixos.vertical, 'subir');
    assert.equal(eixos.lateral, 'direita');
  });
});

describe('evasão do JEV (não do baseline)', () => {
  it('evasaoDeAnswers lê os eixos do JEV e ignora a regra', () => {
    const rico = lerEstado({
      aeronave: { integridade: 90 },
      geometria: { obstaculos: [] },
    });
    const baseline = decisaoGeometrica(rico);
    assert.equal(baseline.acaoMissao.choice, 'prosseguir');
    const e = evasaoDeAnswers({
      acaoMissao: { choice: 'desviar_alternativo' },
      manobraVertical: { choice: 'subir' },
      manobraLateral: { choice: 'esquerda' },
      urgencia: { score: 3 },
    });
    assert.equal(e.acao, 'desviar_alternativo');
    assert.equal(e.vertical, 'subir');
    assert.equal(e.lateral, 'esquerda');
    assert.equal(e.urgencia, 3);
  });

  it('pontoAmeaca coloca o obstáculo à frente do rumo', () => {
    const p = pontoAmeaca({ x: 0, y: 40, z: 0, heading: 0 }, { distancia_m: 100, offset_lateral_m: 0, visual: 'torre', altura_m: 60 });
    assert.equal(p.z, 100);
    assert.equal(p.x, 0);
    assert.equal(p.visual, 'torre');
  });

  it('obstáculo à esquerda dos dados fica à esquerda do ecrã (+X com rumo 0)', () => {
    const p = pontoAmeaca(
      { x: 0, y: 40, z: 0, heading: 0 },
      { distancia_m: 80, folga_pela_esquerda_m: -12, folga_pela_direita_m: 40, visual: 'aves' },
    );
    assert.ok(p.x > 10, `x ${p.x}`);
    assert.equal(p.z, 80);
  });

  it('canyon, aves e guerra ficam à frente do nariz', () => {
    const heading = 0.4;
    const pose = { x: 10, y: 42, z: -5, heading };
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    for (const visual of ['canyon', 'aves', 'guerra']) {
      const p = pontoAmeaca(pose, { distancia_m: 120, offset_lateral_m: 0, visual, altura_m: 80 });
      const frente = (p.x - pose.x) * fx + (p.z - pose.z) * fz;
      assert.ok(frente > 100, `${visual} ${frente}`);
      assert.equal(p.rumo, heading);
    }
    assert.equal(pontoAmeaca(pose, { visual: 'aves', distancia_m: 80, altura_m: 8 }).y, 42);
    assert.equal(pontoAmeaca(pose, { visual: 'guerra', distancia_m: 80, altura_m: 8 }).y, 42);
    assert.equal(pontoAmeaca(pose, { visual: 'canyon', distancia_m: 80, altura_m: 100 }).y, 0);
  });
});

describe('escalação PIC', () => {
  it('escala se a confiança da acção fica abaixo de 0,5', () => {
    const answers = {
      acaoMissao: {
        type: 'choice',
        choice: 'orbitar',
        probabilities: {
          prosseguir: 0.22,
          desviar_alternativo: 0.2,
          orbitar: 0.47,
          regressar_base: 0.06,
          abortar_emergencia: 0.05,
        },
      },
      precisaRevisaoPIC: { type: 'boolean', probability: 0.2 },
    };
    assert.equal(maxProbabilidade(answers.acaoMissao), 0.47);
    assert.equal(deveEscalarPIC(answers), true);
  });

  it('P(fora do envelope) alta não chama o PIC por si: é um sinal à parte', () => {
    const answers = {
      acaoMissao: {
        type: 'choice',
        choice: 'prosseguir',
        probabilities: { prosseguir: 0.8, desviar_alternativo: 0.2, orbitar: 0, regressar_base: 0, abortar_emergencia: 0 },
      },
      precisaRevisaoPIC: { type: 'boolean', probability: 0.7 },
    };
    assert.equal(deveEscalarPIC(answers), false);
    assert.equal(deveEscalarPIC({ answers, confidence: { acaoMissao: 0.42 } }), true, 'a confiança do Gateway manda');
  });

  it('não escala num caso claro', () => {
    const answers = {
      acaoMissao: {
        type: 'choice',
        choice: 'desviar_alternativo',
        probabilities: { prosseguir: 0.05, desviar_alternativo: 0.86, orbitar: 0.05, regressar_base: 0.02, abortar_emergencia: 0.02 },
      },
      precisaRevisaoPIC: { type: 'boolean', probability: 0.1 },
    };
    assert.equal(deveEscalarPIC(answers), false);
  });
});
