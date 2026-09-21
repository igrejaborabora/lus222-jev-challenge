import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CORREDOR_M, planoBando } from './bando.mjs';

function semCruzamento(aves, corredorX) {
  for (let i = 0; i < aves.length; i++) {
    const a = aves[i];
    const ateAoEixo = Math.abs(a.x - corredorX) - a.raio;
    assert.ok(ateAoEixo >= CORREDOR_M - 0.05, `ave ${i} entra no corredor (${ateAoEixo.toFixed(2)} m)`);
    for (let j = i + 1; j < aves.length; j++) {
      const b = aves[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
      assert.ok(dist >= a.raio + b.raio - 0.05, `aves ${i} e ${j} cruzam-se (${dist.toFixed(2)})`);
    }
  }
}

describe('bando solto', () => {
  it('espalha as aves fora do corredor, dos dois lados', () => {
    for (const ladoEcra of [-1, 0, 1]) {
      const aves = planoBando({ n: 18, ladoEcra, corredorX: 0 });
      assert.ok(aves.length >= 12);
      semCruzamento(aves, 0);
      const xs = aves.map((a) => a.x);
      const zs = aves.map((a) => a.z);
      assert.ok(Math.max(...xs) - Math.min(...xs) > 8, 'o bando não pode ser um poste');
      assert.ok(Math.max(...zs) - Math.min(...zs) > 8);
    }
  });

  it('respeita um corredor já deslocado do grupo', () => {
    const aves = planoBando({ n: 14, ladoEcra: 1, corredorX: -22 });
    semCruzamento(aves, -22);
    assert.ok(aves.every((a) => a.x > -22));
  });
});
