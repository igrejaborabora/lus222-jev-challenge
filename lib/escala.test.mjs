import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { poseMissao, pontoMundo } from './escala.mjs';

const voo = { xM: 0, zM: 25000, altitudeM: 480, rumoRad: 0, bankRad: 0, pitchRad: 0, tempoS: 0 };

describe('escala 1:1 do mundo da missão', () => {
  it('altitude e distâncias em metros, sem compressão', () => {
    const p = poseMissao(voo);
    assert.equal(p.y, 480);
    assert.equal(p.z, 25000);
  });

  it('a direita do simulador (+xM) fica à direita do ecrã (−X)', () => {
    assert.ok(poseMissao({ ...voo, xM: 50 }).x < 0);
    assert.deepEqual(pontoMundo(22000, 135000), { x: -22000, z: 135000 });
  });

  it('o avião avança na direcção do seu heading no mundo', () => {
    const r = 0.3;
    const a = poseMissao({ ...voo, rumoRad: r });
    const b = poseMissao({ ...voo, rumoRad: r, xM: Math.sin(r) * 10, zM: voo.zM + Math.cos(r) * 10 });
    assert.ok(Math.abs(b.x - a.x - Math.sin(a.heading) * 10) < 1e-9);
    assert.ok(Math.abs(b.z - a.z - Math.cos(a.heading) * 10) < 1e-9);
  });

  it('pranchamento à direita baixa a asa direita (rotation.z positivo)', () => {
    assert.ok(poseMissao({ ...voo, bankRad: 0.3 }).bank > 0);
  });
});
