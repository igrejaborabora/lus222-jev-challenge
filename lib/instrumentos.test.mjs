import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { instrumentosDeVoo, transformacaoHorizonte, anguloTrajectoria } from '../public/src/instrumentos.js';
import { criarVooLivre } from '../public/src/simulador.js';
import { alturaChaoM } from '../public/src/simulacao.js';
import { darOrdem } from '../public/src/piloto-sim.js';

const inicio = () => criarVooLivre(222);

describe('instrumentos do simulador', () => {
  it('converte unidades e normaliza o rumo sem alterar a missão', () => {
    const m = inicio();
    Object.assign(m.voo, { velocidadeMs: 100, altitudeM: 500, velocidadeVerticalMs: -4, rumoRad: -Math.PI / 2 });
    const antes = structuredClone(m);
    const i = instrumentosDeVoo(m);
    assert.ok(Math.abs(i.velocidadeKt - 194.384) < 0.001);
    assert.ok(Math.abs(i.altitudeFt - 1640.42) < 0.01);
    assert.ok(Math.abs(i.verticalFtMin + 787.4016) < 0.01);
    assert.equal(i.rumoGraus, 270);
    assert.deepEqual(m, antes);
  });

  it('mede a altura ao chão no mesmo relevo do supervisor e inclui vento na velocidade de solo', () => {
    const m = inicio();
    m.voo.rumoRad = 0;
    m.voo.velocidadeMs = 80;
    m.ambiente.ventoMs = { x: 0, z: -10 };
    const i = instrumentosDeVoo(m);
    assert.ok(Math.abs(i.aglFt - (m.voo.altitudeM - alturaChaoM(m, m.voo.xM, m.voo.zM)) * 3.28084) < 0.01);
    assert.ok(Math.abs(i.soloKt - 70 * 1.94384) < 0.001);
  });

  it('distingue o piloto seleccionado, a ordem e a resposta efectiva', () => {
    const m = inicio();
    m.piloto = darOrdem(m.piloto, { vertical: 'subir' }, 0, 2);
    m.voo.velocidadeVerticalMs = -1;
    const i = instrumentosDeVoo(m);
    assert.equal(i.piloto, 'Human');
    assert.equal(i.autoridade, 'Human');
    assert.equal(i.intencao, 'Climb');
    assert.equal(i.movimento, 'Descending');
    m.voo.tempoS = 3;
    m.voo.altitudeAlvoM = 480;
    assert.equal(instrumentosDeVoo(m).autoridade, 'Stabiliser');
    assert.ok(instrumentosDeVoo(m).altitudeAlvoFt > 1500);
  });

  it('mostra a intervenção de terreno antes da intenção humana e não mostra um alvo obsoleto', () => {
    const m = inicio();
    m.voo.altitudeAlvoM = 480;
    m.piloto.supervisor = { vertical: 'subir', lateral: 'nivelar', ateS: 4, motivo: 'terreno' };
    const i = instrumentosDeVoo(m);
    assert.equal(i.autoridade, 'Protection');
    assert.equal(i.intencao, 'Climb');
    assert.equal(i.aviso, 'TERRAIN · protective climb');
    assert.equal(i.altitudeAlvoFt, null);
  });

  it('identifica separação, gravação e final assistida sem as apresentar como humano', () => {
    const m = inicio();
    m.piloto.tipo = 'jev-gravado';
    m.piloto = darOrdem(m.piloto, { vertical: 'descer', fonte: 'jev' }, 0, 2);
    assert.equal(instrumentosDeVoo(m).autoridade, 'JEV recorded');
    m.piloto.supervisor = { vertical: 'subir', ateS: 5, motivo: 'separacao' };
    assert.match(instrumentosDeVoo(m).aviso, /SEPARATION/);
    m.finalAssistida = true;
    assert.equal(instrumentosDeVoo(m).autoridade, 'Assisted final');
  });

  it('estima consumo com a mesma lei do motor e mostra zero autonomia sem combustível', () => {
    const m = inicio();
    m.voo.acelerador = 0.5;
    m.voo.combustivelKg = 0;
    const i = instrumentosDeVoo(m);
    assert.ok(Math.abs(i.consumoKgH - (0.026 + 0.115 * 0.5) * 3600) < 1e-8);
    assert.equal(i.autonomiaMin, 0);
  });

  it('usa o voo interpolado para instrumentos sem alterar a autoridade do passo corrente', () => {
    const m = inicio();
    const v = { ...m.voo, altitudeM: 510, bankRad: 0.2, pitchRad: 0.1 };
    const i = instrumentosDeVoo(m, v);
    assert.ok(Math.abs(i.altitudeFt - 510 * 3.28084) < 0.001);
    assert.ok(i.bankGraus > 11);
    assert.ok(i.pitchGraus > 5);
    assert.equal(i.autoridade, 'Stabiliser');
  });

  it('inclina o horizonte em sentido oposto ao avião e baixa-o quando o nariz sobe', () => {
    assert.equal(transformacaoHorizonte(10, 25), 'rotate(-25) translate(0 25)');
    assert.equal(transformacaoHorizonte(-5, -20), 'rotate(20) translate(0 -12.5)');
    assert.equal(transformacaoHorizonte(0, 0), 'rotate(0) translate(0 0)');
  });
});


describe('trajectória e comandos analógicos nos instrumentos', () => {
  it('mostra descida mesmo com o nariz acima do horizonte', () => {
    const m = inicio();
    Object.assign(m.voo, { pitchRad: 0.026, velocidadeMs: 90, velocidadeVerticalMs: -4 });
    const i = instrumentosDeVoo(m);
    assert.ok(i.pitchGraus > 0);
    assert.ok(i.trajectoriaGraus < -2.5);
    assert.equal(i.movimento, 'Descending');
    assert.equal(anguloTrajectoria({ velocidadeMs: 0, velocidadeVerticalMs: 0 }), 0);
  });
  it('o pedido segue o eixo analógico e dá prioridade ao supervisor sobre alvos', () => {
    const m = inicio();
    m.piloto = darOrdem(m.piloto, { vertical: 'manter', pitchInput: -0.7 }, 0, 2);
    assert.equal(instrumentosDeVoo(m).intencao, 'Descend');
    m.controlos = { altitudeM: 200 };
    m.piloto.supervisor = { vertical: 'subir', lateral: 'nivelar', ateS: 4, motivo: 'terreno' };
    assert.equal(instrumentosDeVoo(m).intencao, 'Climb');
    assert.equal(instrumentosDeVoo(m).altitudeAlvoFt, null);
  });
});
