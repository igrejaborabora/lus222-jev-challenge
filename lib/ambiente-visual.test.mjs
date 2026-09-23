import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alturaNuvensM, nevoeiroDe, noiteAlvo, paletaCeu, ventoNoMundo } from './ambiente-visual.mjs';

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

  it('o vento é espelhado para o mundo como a posição', () => {
    const v = ventoNoMundo({ x: 6, z: -5 });
    assert.deepEqual([v.x, v.z], [-6, -5]);
    assert.equal(Math.round(v.kt), 15);
  });
});
