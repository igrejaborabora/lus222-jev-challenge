import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alturaNuvensM, distanciaNoTufo, escalaBolha, nevoeiroDe, noiteAlvo, paletaCeu, ventoNoMundo } from './ambiente-visual.mjs';

describe('céu a partir do estado da simulação', () => {
  it('as nuvens ficam à altura real do tecto', () => {
    assert.equal(Math.round(alturaNuvensM(650)), 198);
    assert.equal(Math.round(alturaNuvensM(1800)), 549);
  });

  it('a visibilidade define o nevoeiro, sem passar do terreno carregado', () => {
    assert.equal(nevoeiroDe(4, 7000).far, 4000);
    assert.equal(nevoeiroDe(40, 7000).far, 6650);
    assert.ok(nevoeiroDe(4, 7000).near < 4000);
  });

  it('noite: São João começa ao crepúsculo e escurece quando a luz acaba', () => {
    assert.ok(noiteAlvo('porto', true) > 0 && noiteAlvo('porto', true) < 0.5);
    assert.equal(noiteAlvo('porto', false), 1);
    assert.equal(noiteAlvo('carga', true), 0);
  });

  it('as luzes acendem com a noite e o sol perde força', () => {
    assert.equal(paletaCeu(0).luzes, 0);
    assert.equal(paletaCeu(1).luzes, 1);
    assert.ok(paletaCeu(1).intensidadeSol < paletaCeu(0).intensidadeSol);
  });

  it('de dia o sol fica à elevação da luz afinada; de noite desce abaixo do horizonte', () => {
    assert.ok(Math.abs(paletaCeu(0).elevacaoSolRad - 0.64) <= 0.01);
    assert.ok(paletaCeu(1).elevacaoSolRad < 0);
  });

  it('o vento é espelhado para o mundo como a posição', () => {
    const v = ventoNoMundo({ x: 6, z: -5 });
    assert.deepEqual([v.x, v.z], [-6, -5]);
    assert.equal(Math.round(v.kt), 15);
  });

  it('distância ao tufo em raios do elipsóide, com a base achatada e o rumo do tufo', () => {
    const t = { sx: 200, sy: 100, sz: 150, cos: 1, sin: 0 };
    assert.equal(distanciaNoTufo(200, 0, 0, t, 0.25), 1);
    assert.equal(distanciaNoTufo(0, 100, 0, t, 0.25), 1);
    assert.equal(distanciaNoTufo(0, -25, 0, t, 0.25), 1, 'por baixo, a base achatada');
    assert.equal(distanciaNoTufo(0, 0, -300, t, 0.25), 2);
    // Tufo rodado 90° em Y: o eixo largo (sx) fica ao longo de Z no mundo.
    const r = { ...t, cos: 0, sin: 1 };
    assert.ok(Math.abs(distanciaNoTufo(0, 0, 200, r, 0.25) - 1) < 1e-9);
    assert.ok(Math.abs(distanciaNoTufo(150, 0, 0, r, 0.25) - 1) < 1e-9);
  });

  it('bolha: o tufo desaparece com a câmara ou o avião dentro ou perto, e volta inteiro longe', () => {
    assert.equal(escalaBolha(0), 0);
    assert.equal(escalaBolha(1.15), 0);
    assert.equal(escalaBolha(1.9), 1);
    assert.equal(escalaBolha(5), 1);
    const meio = escalaBolha(1.5);
    assert.ok(meio > 0 && meio < 1);
    assert.ok(escalaBolha(1.3) < meio && meio < escalaBolha(1.7));
    // Nunca chega à câmara: a superfície do tufo encolhido fica sempre aquém dela.
    for (let d = 0; d <= 3; d += 0.05) assert.ok(escalaBolha(d) < Math.max(d, 1e-9) || d === 0);
  });
});
