import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { approachGates, approachReference, runwayCoordinates, runwayPoint, runwayReference } from '../public/src/runway-reference.js';
import { amostrarCosta, amostrarMargens } from '../public/src/porto-reference.js';
import { alturaTerreno, perfilTerreno } from '../public/src/relevo.js';

const pista = runwayReference({ x: 0, z: 165000 });
const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} ≠ ${b}`);

describe('referências visuais de pista', () => {
  it('usa as duas soleiras da pista do cenário, sem recentrar o estado de voo', () => {
    assert.deepEqual(runwayPoint(pista, 0, -1740), { x: 0, y: 2, z: 163260 });
    assert.deepEqual(runwayPoint(pista, 0, 1740), { x: 0, y: 2, z: 166740 });
    const pose = { x: 40, y: 195, z: 159900 };
    const original = { ...pose };
    const ref = approachReference(pista, pose);
    assert.equal(ref.distanceM, 3360);
    assert.equal(ref.lateralM, 40);
    assert.equal(ref.visible, true);
    assert.deepEqual(pose, original);
  });

  it('transforma coordenadas de pistas rodadas e transladadas sem espelhar o lado', () => {
    for (const heading of [0, Math.PI / 2, -Math.PI / 2, 2.1]) {
      const p = runwayReference({ x: 340, z: -1200, heading, comprimentoM: 1200, larguraM: 30 });
      const point = runwayPoint(p, 45, -1800, 50);
      const local = runwayCoordinates(p, point);
      perto(local.lateral, 45); perto(local.along, -1800); perto(point.y, 52);
      perto(approachReference(p, point).distanceM, 1200);
    }
  });

  it('PAPI dá 2 brancas/2 vermelhas na linha de 3°, 4 vermelhas baixo e 4 brancas alto', () => {
    const ref = approachReference(pista, { x: 0, y: 195, z: 159900 });
    const pose = { x: 0, y: ref.targetAltitudeM, z: 159900 };
    const on = approachReference(pista, pose);
    perto(on.angleDeg, 3); assert.equal(on.whites, 2); assert.equal(on.reds, 2);
    assert.equal(approachReference(pista, { ...pose, y: pose.y - 80 }).whites, 0);
    assert.equal(approachReference(pista, { ...pose, y: pose.y + 80 }).whites, 4);
    const north = approachReference(pista, { ...pose, z: 170100 }, -1);
    perto(north.distanceM, 3360); perto(north.targetAltitudeM, pose.y); assert.equal(north.whites, 2);
  });

  it('esconde PAPI atrás, de lado e além do alcance, mantendo o solo sem NaN', () => {
    for (const pose of [{ x: 0, y: 5, z: 164000 }, { x: 3000, y: 200, z: 159900 }, { x: 0, y: 400, z: 150000 }]) assert.equal(approachReference(pista, pose).visible, false);
    assert.ok(Number.isFinite(approachReference(pista, { x: 0, y: 2, z: 163560 }).angleDeg));
  });

  it('portais dos dois sentidos coincidem com a mesma altitude de referência', () => {
    for (const direction of [-1, 1]) {
      const gates = approachGates(pista, direction);
      assert.equal(gates.length, 8);
      for (const gate of gates) {
        const ref = approachReference(pista, gate, direction);
        perto(ref.targetAltitudeM, gate.y); perto(ref.angleDeg, 3);
        assert.ok(gate.halfWidthM <= 102 && gate.halfHeightM <= 31);
      }
    }
  });
});

describe('Porto ilustrativo ancorado ao relevo', () => {
  const perfil = perfilTerreno('porto');
  it('a costa segue a linha de água do terreno e abre espaço à foz', () => {
    const costa = amostrarCosta(perfil);
    assert.equal(costa.length, 121);
    assert.ok(costa.some(p => !p.aberta));
    for (const p of costa.filter(p => p.aberta)) assert.ok(Math.abs(alturaTerreno(perfil, p.x, p.z)) < 0.02);
    assert.deepEqual(amostrarCosta(perfilTerreno('corredor')), []);
  });

  it('as margens ficam junto ao canal e usam um orçamento fixo de secções', () => {
    const margens = amostrarMargens(perfil);
    assert.equal(margens.length, 2);
    for (const margem of margens) {
      assert.ok(margem.length <= 200);
      for (const p of margem.filter(Boolean)) {
        assert.ok(Math.abs(alturaTerreno(perfil, p.x, p.z) - 2) < 0.2);
        assert.ok(Number.isFinite(p.x + p.y + p.z));
      }
    }
  });
});
