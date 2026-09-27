import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NM_M, ALCANCES_NM, projectarNavegacao, velocidadeSoloNavegacao, dadosNavegacao } from '../public/src/cockpit-navigation.js';
const perto = (a, b, margem = 1e-8) => assert.ok(Math.abs(a - b) < margem, `${a} ≠ ${b}`);
const voo = { xM: 0, zM: 0, altitudeM: 500, rumoRad: 0, velocidadeMs: 100, velocidadeVerticalMs: 0, tempoS: 10 };
const estado = (changes = {}) => ({ voo: { ...voo }, ambiente: { ventoMs: { x: 0, z: 0 }, turbulencia: 0 }, destinos: [], pistas: [], ameacas: [], ...changes });

test('north-up: east is right, north is up, and range is the ring radius', () => {
  assert.equal(NM_M, 1852);
  assert.deepEqual(ALCANCES_NM, [2, 5, 10, 20]);
  const e = projectarNavegacao({ xM: NM_M * 5, zM: 0 }, voo);
  perto(e.x, 1); perto(e.y, 0); assert.equal(e.dentro, true);
  const n = projectarNavegacao({ xM: 0, zM: NM_M * 5 }, voo);
  perto(n.x, 0); perto(n.y, -1); perto(n.bearingGraus, 0);
  perto(e.bearingGraus, 90);
});

test('heading-up rotates the map counter to heading, including westbound', () => {
  const east = { ...voo, rumoRad: Math.PI / 2 };
  const p = projectarNavegacao({ xM: NM_M * 2, zM: 0 }, east, { rangeNm: 2, headingUp: true });
  perto(p.x, 0); perto(p.y, -1);
  const north = projectarNavegacao({ xM: 0, zM: NM_M * 2 }, east, { rangeNm: 2, headingUp: true });
  perto(north.x, -1); perto(north.y, 0);
  const west = projectarNavegacao({ xM: -NM_M * 2, zM: 0 }, { ...voo, rumoRad: -Math.PI / 2 }, { rangeNm: 2, headingUp: true });
  perto(west.x, 0); perto(west.y, -1);
});

test('off-range points remain outside; bad coordinates and ranges cannot poison the display', () => {
  assert.equal(projectarNavegacao({ xM: NM_M * 6, zM: 0 }, voo).dentro, false);
  assert.equal(projectarNavegacao({ xM: Infinity, zM: 0 }, voo), null);
  const p = projectarNavegacao({ xM: NM_M * 5, zM: 0 }, { rumoRad: NaN }, { rangeNm: -1 });
  perto(p.x, 1); perto(p.y, 0);
  const d = dadosNavegacao({ voo: { xM: NaN, zM: Infinity, velocidadeMs: NaN, rumoRad: Infinity } }, { rangeNm: NaN });
  assert.equal(d.rangeNm, 5); assert.equal(d.groundSpeedKt, 0); assert.equal(d.headingGraus, 0);
  assert.equal(d.destino, null); assert.deepEqual(d.ameacas, []);
});

test('ground speed projects the flight path horizontally before adding wind', () => {
  const m = estado({ voo: { ...voo, velocidadeVerticalMs: -60 }, ambiente: { ventoMs: { x: 30, z: -20 }, turbulencia: 0 } });
  const g = velocidadeSoloNavegacao(m);
  perto(g.horizontalArMs, 80); perto(g.xMs, 30); perto(g.zMs, 60);
  perto(g.soloMs, Math.hypot(30, 60)); perto(g.trajetoGraus, Math.atan2(30, 60) * 180 / Math.PI);
  const solo = velocidadeSoloNavegacao({ ...m, voo: { ...m.voo, velocidadeMs: 0, emSolo: true } });
  assert.equal(solo.soloMs, 0);
});

test('destination reports direct bearing, distance and ETE only when closing', () => {
  const m = estado({ destinos: [{ id: 'aeroporto', nome: 'Aeroporto Francisco Sá Carneiro', xM: 0, zM: 1852 }], destinoId: 'aeroporto' });
  const d = dadosNavegacao(m).destino;
  perto(d.distanceNm, 1); perto(d.bearingGraus, 0); perto(d.etaS, 18.52);
  assert.equal(d.label, 'Francisco Sá Carneiro Airport');
  assert.equal(dadosNavegacao({ ...m, voo: { ...voo, rumoRad: Math.PI } }).destino.etaS, null);
  assert.equal(dadosNavegacao({ ...m, destinoId: 'absent' }).destino, null);
});

test('runways follow simulator north-south axis and traffic uses real relative altitude and separation', () => {
  const m = estado({ pistas: [{ id: 'r', xM: 0, zM: 0, pistaM: 1000 }],
    ameacas: [{ id: 'a1', visual: 'trafego', xM: 300, zM: 400, altitudeM: 530.48, raioProtecaoM: 100 },
      { id: 'far', xM: NM_M * 6, zM: 0, altitudeM: 500 }, { id: 'bad', xM: NaN, zM: 1 }] });
  const d = dadosNavegacao(m);
  assert.equal(d.pistas.length, 1); perto(d.pistas[0].inicio.x, 0); perto(d.pistas[0].inicio.y, 500 / (NM_M * 5));
  assert.equal(d.ameacas.length, 1); assert.equal(d.ameacasFora, 1);
  perto(d.ameacas[0].relativeAltitudeFt, 100, .001);
  perto(d.ameacas[0].separationM, Math.hypot(500, 30.48));
  assert.equal(d.ameacas[0].altitudeLabel, '+01');
  assert.equal(d.ameacas[0].label, 'TRAFFIC');
});

test('navigation reads state without changing targets, routes or threats', () => {
  const m = estado({ circuito: ['a', 'b'], destinoId: 'b', destinos: [{ id: 'a', xM: 100, zM: 0 }, { id: 'b', xM: 200, zM: 300 }] });
  const original = structuredClone(m);
  const d = dadosNavegacao(m, { rangeNm: 10, headingUp: true });
  assert.equal(d.rota[1].active, true); assert.equal(d.headingUp, true); assert.equal(d.rangeNm, 10);
  assert.deepEqual(m, original);
});

test('historical replay speed stays consistent with its horizontal-speed physics and steady wind', () => {
  const m = estado({ perfil: 'ilustrativo-3', voo: { ...voo, velocidadeVerticalMs: -60 }, ambiente: { ventoMs: { x: 3, z: -4 }, turbulencia: 1 } });
  const g = velocidadeSoloNavegacao(m);
  perto(g.horizontalArMs, 100); perto(g.xMs, 3); perto(g.zMs, 96);
});

test('compact cockpit charts use the screen width instead of shrinking into a small circle', async () => {
  const { geometriaNavegacao } = await import('../public/src/cockpit-navigation.js');
  assert.equal(typeof geometriaNavegacao, 'function');
  for (const height of [142, 184]) {
    const g = geometriaNavegacao(350, height);
    assert.ok(g.radius >= 150, `compact map radius ${g.radius}`);
    assert.ok(g.chartHeight >= height - 40);
    assert.ok(g.cy >= g.top && g.cy <= height - g.bottom);
  }
});
