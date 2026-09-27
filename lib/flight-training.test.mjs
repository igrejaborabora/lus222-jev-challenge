import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFirstFlight, updateFirstFlight, skipFirstFlight, deriveApproach,
  createLandingTracker, updateLandingTracker, createRunSummary, compareRuns } from '../public/src/flight-training.js';
import { criarVooProgressivo } from '../public/src/simulador.js';
import { avancarMissao } from '../public/src/simulacao.js';

const RAD = Math.PI / 180;
const runway = { id: 'airport', xM: 100, zM: 5000, pistaM: 3000 };
const threshold = 3500;
function mission(flight = {}, extra = {}) {
  return { cenario: 'test', semente: 222, perfil: 'training', destinoId: 'airport', pistas: [runway],
    piloto: { tipo: 'humano', fonte: 'humano', ateS: 0 }, controlos: { acelerador: null }, ambiente: { ventoMs: { x: 0, z: 0 } },
    voo: { xM: 100, zM: threshold - 1000, altitudeM: 4.25 + 1300 * Math.tan(3 * RAD), rumoRad: 0, bankRad: 0,
      pitchRad: 0.05, pitchManualRad: null, modoVertical: 'manter', velocidadeMs: 62, velocidadeVerticalMs: -2,
      acelerador: 0.5, combustivelKg: 500, tempoS: 0, distanciaPercorridaM: 0, emSolo: false, contacto: null, ...flight },
    ...extra };
}
function changeFlight(m, changes, extra = {}) { return { ...m, ...extra, voo: { ...m.voo, ...changes } }; }
function contact(m, changes = {}, contactChanges = {}) {
  return changeFlight(m, { tempoS: 1, zM: 3700, distanciaPercorridaM: 1200, velocidadeVerticalMs: 0, altitudeM: 4.25,
    emSolo: true, contacto: { tipo: 'pista', tempoS: 1, verticalMs: -1.4, lateralM: 0, ...contactChanges }, ...changes });
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}

test('approach uses actual runway threshold, heading and aircraft-centre glidepath', () => {
  const m = mission();
  const a = deriveApproach(m);
  assert.equal(a.available, true);
  assert.equal(a.runwayId, 'airport');
  assert.equal(a.distanceToThresholdM, 1000);
  assert.equal(a.lateralOffsetM, 0);
  assert.equal(a.glidepathErrorM, 0);
  assert.equal(a.phase, 'final');
  assert.equal(a.goAround, false);
  assert.equal(deriveApproach(changeFlight(m, { xM: 150, altitudeM: m.voo.altitudeM + 20 })).offCourse, true);
  assert.equal(deriveApproach(changeFlight(m, { altitudeM: m.voo.altitudeM + 20 })).high, true);
  assert.equal(deriveApproach(changeFlight(m, { altitudeM: m.voo.altitudeM - 20 })).low, true);
  assert.match(deriveApproach(changeFlight(m, { xM: 150 })).instruction, /left/);
  assert.match(deriveApproach(changeFlight(m, { xM: 50 })).instruction, /right/);
});
test('guidance handles missing/invalid runways and nonfinite flight readings', () => {
  for (const m of [null, mission({}, { pistas: [] }), mission({}, { pistas: [{ ...runway, pistaM: 0 }] }), mission({ xM: NaN }), mission({ rumoRad: Infinity })]) {
    const a = deriveApproach(m);
    assert.equal(a.available, false);
    assert.equal(a.goAround, false);
    assert.equal(a.phase, 'unavailable');
  }
});
test('runway selection honours destination and otherwise chooses the nearest actual runway', () => {
  const near = { id: 'near', xM: 100, zM: 1000, pistaM: 1000 };
  assert.equal(deriveApproach(mission({}, { pistas: [near, runway] })).runwayId, 'airport');
  assert.equal(deriveApproach(mission({ zM: 400 }, { destinoId: 'other', pistas: [runway, near] })).runwayId, 'near');
});
test('threshold distance stays signed; airborne overshoot and opposite heading request go-around', () => {
  const crossed = deriveApproach(mission({ zM: threshold + 100, altitudeM: 8 }));
  assert.equal(crossed.distanceToThresholdM, -100);
  assert.equal(crossed.phase, 'flare');
  for (const m of [mission({ zM: 7000 }), mission({ zM: 4700 }), mission({ rumoRad: Math.PI }), mission({}, { fase: 'borrego' })]) {
    assert.equal(deriveApproach(m).goAround, true);
    assert.equal(deriveApproach(m).phase, 'go-around');
    assert.match(deriveApproach(m).instruction, /Go around/);
  }
  assert.equal(deriveApproach(mission({ rumoRad: Math.PI * 2 })).headingErrorDeg < 1e-6, true);
});
test('short-final unsafe descent, speed, bank, offset or low path prompt a go-around', () => {
  const base = mission({ zM: 3000, altitudeM: 46 });
  for (const v of [{ velocidadeVerticalMs: -6 }, { velocidadeMs: 30 }, { velocidadeMs: 85 }, { stall: true }, { bankRad: 15 * RAD }, { xM: 160 }, { altitudeM: 10 }]) {
    assert.equal(deriveApproach(changeFlight(base, v)).goAround, true, JSON.stringify(v));
  }
  assert.equal(deriveApproach(changeFlight(base, { emSolo: true, contacto: { tipo: 'pista' }, velocidadeMs: 0 })).goAround, false);
});

test('landing tracker captures touchdown before vertical speed is reset and waits for stopping', () => {
  const start = freeze(mission());
  const initial = freeze(createLandingTracker(start));
  assert.equal(initial.report, null);
  const touched = freeze(contact(start));
  const rollout = updateLandingTracker(initial, touched);
  assert.equal(rollout.status, 'rollout');
  assert.equal(rollout.report.success, false);
  assert.equal(rollout.touchdown.sinkRateMs, 1.4);
  assert.equal(rollout.touchdown.speedMs, 62);
  assert.equal(rollout.groundDistanceM, 0);
  assert.equal(rollout.report.metrics.stoppingDistanceM, null);
  const braking = changeFlight(touched, { tempoS: 6, zM: 3900, distanciaPercorridaM: 1400, velocidadeMs: 30 });
  const halfway = updateLandingTracker(rollout, braking);
  assert.equal(halfway.groundDistanceM, 200);
  const stop = changeFlight(braking, { tempoS: 15, zM: 4000, distanciaPercorridaM: 1500, velocidadeMs: 0.5 }, { resultado: 'chegou' });
  const done = updateLandingTracker(halfway, stop);
  assert.equal(done.status, 'landed');
  assert.equal(done.report.success, true);
  assert.equal(done.report.metrics.stoppingDistanceM, 300);
  assert.equal(done.touchdown.speedMs, 62);
  assert.equal(updateLandingTracker(done, stop).groundDistanceM, 300);
  assert.equal(initial.touchdown, null);
});
test('hard landing is never reported as a success, even if later state claims arrival', () => {
  const start = mission();
  for (const [changes, extra] of [[{}, { tipo: 'duro' }], [{}, { verticalMs: -3.01 }], [{ velocidadeMs: 85 }, {}], [{ velocidadeMs: 30 }, {}], [{ bankRad: 0.12 }, {}], [{ rumoRad: 0.18 }, {}]]) {
    const touchdown = contact(start, changes, extra);
    const tracker = updateLandingTracker(createLandingTracker(start), touchdown);
    assert.equal(tracker.status, 'hard-landing', JSON.stringify([changes, extra]));
    const stop = changeFlight(touchdown, { velocidadeMs: 0 }, { resultado: 'chegou' });
    const report = updateLandingTracker(tracker, stop).report;
    assert.equal(report.success, false);
    assert.equal(report.title, 'Hard landing');
  }
});
test('terrain contact, runway excursion and lost separation cannot become successful landings', () => {
  const start = mission();
  const good = updateLandingTracker(createLandingTracker(start), contact(start));
  for (const type of ['terreno', 'fora_pista']) {
    const failed = updateLandingTracker(good, contact(start, {}, { tipo: type }));
    assert.equal(failed.status, 'crash');
    assert.equal(failed.report.success, false);
  }
  const crashed = updateLandingTracker(createLandingTracker(start), { ...start, resultado: 'separacao_perdida' });
  assert.equal(crashed.status, 'crash');
  assert.equal(crashed.touchdown, null);
  assert.equal(crashed.report.metrics.sinkRateMs, null);
});
test('richer contact records override snapshots; late attachment preserves unknown measurements', () => {
  const start = mission();
  const late = contact(start, { tempoS: 8, velocidadeMs: 20, bankRad: 0 });
  const unknown = updateLandingTracker(createLandingTracker(), late);
  assert.equal(unknown.touchdown.speedMs, null);
  assert.equal(unknown.touchdown.bankDeg, null);
  const stopped = updateLandingTracker(unknown, changeFlight(late, { velocidadeMs: 0 }, { resultado: 'chegou' }));
  assert.equal(stopped.status, 'incomplete');
  assert.equal(stopped.report.success, false);
  const rich = contact(start, { tempoS: 8, velocidadeMs: 20 }, { speedMs: 61, bankRad: 0.01, headingRad: 0.02, xM: 100, zM: 3700, distanciaPercorridaM: 1000 });
  const measured = updateLandingTracker(createLandingTracker(), rich);
  assert.equal(measured.touchdown.speedMs, 61);
  assert.deepEqual(measured.touchdown.estimated, []);
  assert.equal(measured.groundDistanceM, 200);
});
test('previous snapshot survives coarse UI sampling without pretending it is exact', () => {
  const before = mission({ tempoS: 0.9, zM: 3690, distanciaPercorridaM: 1000, velocidadeMs: 64, bankRad: 0.03 });
  const after = contact(before, { tempoS: 1.1, zM: 3710, distanciaPercorridaM: 1020, velocidadeMs: 60, bankRad: 0 });
  const tracked = updateLandingTracker(createLandingTracker(), after, { previousFlight: before.voo });
  assert.equal(tracked.touchdown.speedMs, 64);
  assert.ok(Math.abs(tracked.touchdown.snapshotOffsetS + 0.1) < 1e-8);
  assert.equal(tracked.groundDistanceM, 10);
  assert.match(tracked.report.summary, /closest observed/);
});
test('reset and expired flights do not reuse a previous landing or manufacture success', () => {
  const start = mission();
  const old = updateLandingTracker(createLandingTracker(start), contact(start));
  const reset = updateLandingTracker(old, start);
  assert.equal(reset.touchdown, null);
  assert.equal(reset.groundDistanceM, 0);
  assert.equal(reset.report, null);
  const expired = updateLandingTracker(reset, { ...start, resultado: 'tempo_esgotado' });
  assert.equal(expired.status, 'incomplete');
  assert.equal(expired.report.success, false);
});
test('real progressive guided flight produces a measured landing and stopping distance', () => {
  let m = criarVooProgressivo(222, { exercicio: 'aproximacao', tempo: 'limpo' });
  m.controlos.aproximacao = true;
  let tracker = createLandingTracker(m);
  for (let i = 0; i < 2000 && !m.resultado; i++) {
    const previous = m.voo;
    m = avancarMissao(m, 0.1);
    tracker = updateLandingTracker(tracker, m, { previousFlight: previous });
  }
  assert.equal(m.resultado, 'chegou');
  assert.equal(tracker.status, 'landed');
  assert.ok(tracker.touchdown.sinkRateMs > 0 && tracker.touchdown.sinkRateMs <= 3);
  assert.ok(tracker.touchdown.speedMs > 30);
  assert.ok(tracker.report.metrics.stoppingDistanceM > 50);
});

test('first flight requires an observed human input and its measured power effect', () => {
  const m = mission({ velocidadeVerticalMs: 0 });
  const t = freeze(createFirstFlight(m));
  assert.equal(updateFirstFlight(t, changeFlight(m, { tempoS: 20 })).stage, 'power');
  assert.equal(updateFirstFlight(t, changeFlight(m, { tempoS: 1, acelerador: 0.8 })).stage, 'power');
  const action = updateFirstFlight(t, m, { action: 'power' });
  assert.equal(action.stage, 'power');
  assert.equal(updateFirstFlight(action, changeFlight(m, { tempoS: 1, acelerador: 0.56 })).stage, 'pitch');
  assert.equal(updateFirstFlight(t, changeFlight(m, { tempoS: 1, acelerador: 0.6 }, { controlos: { acelerador: 0.6 } })).stage, 'pitch');
  assert.equal(t.completed.length, 0);
});
test('pitch then level require aircraft response, followed by real hide/show transitions', () => {
  let m = mission({ velocidadeVerticalMs: 0 });
  let t = createFirstFlight(m);
  m = changeFlight(m, { tempoS: 0.1, acelerador: 0.6 });
  t = updateFirstFlight(t, m, { action: 'power' });
  assert.equal(t.stage, 'pitch');
  t = updateFirstFlight(t, m, { action: 'pitch' });
  assert.equal(t.stage, 'pitch');
  m = changeFlight(m, { tempoS: 0.2, pitchRad: 0.15, velocidadeVerticalMs: 2 });
  t = updateFirstFlight(t, m);
  assert.equal(t.stage, 'level');
  for (let i = 0; i < 15; i++) {
    m = changeFlight(m, { tempoS: m.voo.tempoS + 0.1, velocidadeVerticalMs: 0, bankRad: 0 });
    t = updateFirstFlight(t, m);
  }
  assert.equal(t.stage, 'level', 'natural stability alone is not a Level action');
  t = updateFirstFlight(t, m, { action: 'level' });
  for (let i = 0; i < 10; i++) {
    m = changeFlight(m, { tempoS: m.voo.tempoS + 0.1 });
    t = updateFirstFlight(t, m);
  }
  assert.equal(t.stage, 'hide-panel');
  t = updateFirstFlight(t, m, { panelVisible: true });
  assert.equal(t.stage, 'hide-panel');
  t = updateFirstFlight(t, m, { panelVisible: false });
  assert.equal(t.stage, 'show-panel');
  t = updateFirstFlight(t, m, { panelVisible: true });
  assert.equal(t.status, 'complete');
  assert.deepEqual(t.completed, ['power', 'pitch', 'level', 'hide-panel', 'show-panel']);
});
test('expired pilot commands, AI, guidance, hidden tutorial and pause do not complete training', () => {
  const m = mission();
  const t = createFirstFlight(m);
  const input = changeFlight(m, { tempoS: 2, acelerador: 0.7 }, { piloto: { tipo: 'humano', potencia: 'mais', ateS: 1 } });
  assert.equal(updateFirstFlight(t, input).stage, 'power');
  for (const [state, options] of [[input, { visible: false }], [input, { paused: true }], [{ ...input, piloto: { tipo: 'jev' } }, {}], [changeFlight(input, { fonteActuacao: 'supervisor' }), {}], [changeFlight(input, { fonteActuacao: 'aproximacao' }), {}]]) {
    assert.equal(updateFirstFlight(t, state, { action: 'power', ...options }).stage, 'power');
  }
});
test('tutorial expiration, ending, skip and restart preserve honest completion state', () => {
  const m = mission();
  const t = createFirstFlight(m, { maxDurationS: 10 });
  const expired = updateFirstFlight(t, changeFlight(m, { tempoS: 10 }), { action: 'power' });
  assert.equal(expired.status, 'expired');
  assert.equal(expired.completed.length, 0);
  assert.equal(updateFirstFlight(t, { ...m, resultado: 'tempo_esgotado' }).status, 'ended');
  assert.equal(skipFirstFlight(t).status, 'skipped');
  assert.equal(createFirstFlight(m).stage, 'power');
  const advancedClock = updateFirstFlight(t, changeFlight(m, { tempoS: 3 }));
  assert.equal(updateFirstFlight(advancedClock, m).lastTimeS, 0);
});

function flown(start, { duration = 20, distance = 1200, fuel = 2, ...extra } = {}) {
  return changeFlight(start, { tempoS: start.voo.tempoS + duration, distanciaPercorridaM: start.voo.distanciaPercorridaM + distance,
    combustivelKg: start.voo.combustivelKg - fuel }, extra);
}
function pair() {
  const human = mission(), jev = { ...human, piloto: { tipo: 'jev' } };
  return [createRunSummary(human, flown(human)), createRunSummary(jev, flown(jev, { distance: 1250, fuel: 2.5 }))];
}
test('same starting setup and duration compare human/live JEV with unranked measured deltas', () => {
  const [human, jev] = pair();
  const result = compareRuns(human, jev);
  assert.equal(result.comparable, true);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.deltas, { durationS: 0, distanceM: 50, fuelUsedKg: 0.5, minClearanceM: null });
  assert.equal(human.origin, 'human');
  assert.equal(jev.origin, 'live-jev');
  assert.equal(human.profile, 'training');
});
test('setup key is stable for object ordering but sensitive to actual initial physics/environment', () => {
  const original = mission(), reordered = { ...original, voo: Object.fromEntries(Object.entries(original.voo).reverse()), piloto: { tipo: 'jev' } };
  assert.equal(compareRuns(createRunSummary(original, flown(original)), createRunSummary(reordered, flown(reordered))).comparable, true);
  for (const changed of [{ ...reordered, semente: 223 }, { ...reordered, perfil: 'historical' }, { ...reordered, ambiente: { ventoMs: { x: 1, z: 0 } } }, changeFlight(reordered, { altitudeM: reordered.voo.altitudeM + 1 })]) {
    assert.equal(compareRuns(createRunSummary(original, flown(original)), createRunSummary(changed, flown(changed))).comparable, false);
  }
});
test('historical recordings cannot be relabelled as live runs', () => {
  const start = mission({}, { piloto: { tipo: 'jev-gravado' } });
  const recorded = createRunSummary(start, flown(start), { origin: 'live-jev' });
  assert.equal(recorded.origin, 'recorded');
  const result = compareRuns(pair()[0], recorded);
  assert.equal(result.comparable, false);
  assert.equal(result.deltas, null);
  assert.ok(result.reasons.some(reason => /Historical recordings/.test(reason)));
});
test('duration mismatch, authority handoff or configuration changes invalidate comparisons', () => {
  const human = pair()[0], jev = mission({}, { piloto: { tipo: 'jev' } });
  for (const invalid of [createRunSummary(jev, flown(jev, { duration: 21 })), createRunSummary(jev, flown(jev), { authorityChanged: true }),
    createRunSummary(jev, flown(jev), { configurationChanged: true }), createRunSummary(jev, flown(jev, { piloto: { tipo: 'humano' } })),
    createRunSummary(jev, flown(jev, { ambiente: { ventoMs: { x: 4, z: 0 } } }))]) {
    const result = compareRuns(human, invalid);
    assert.equal(result.comparable, false);
    assert.equal(result.deltas, null);
  }
  assert.equal(compareRuns(human, createRunSummary(jev, flown(jev, { duration: 20.25 }))).comparable, true);
  assert.equal(compareRuns(human, createRunSummary(jev, flown(jev, { duration: 20.251 }))).comparable, false);
});
test('missing observations are unavailable, not zero clearance or a valid comparison', () => {
  const m = mission();
  assert.equal(createRunSummary(m, flown(m)).metrics.minClearanceM, null);
  const measured = createRunSummary(m, flown(m, { separacoes: [{ minimaM: 130, limiteM: 100 }, { minimaM: 200, limiteM: 100 }],
    ameacaAtiva: { separacaoMinM: 90, raioProtecaoM: 100 } }));
  assert.equal(measured.metrics.minClearanceM, -10);
  assert.equal(compareRuns(null, pair()[1]).comparable, false);
  assert.equal(compareRuns(createRunSummary(m, m), pair()[1]).comparable, false);
  assert.equal(createRunSummary(null, null).valid, false);
});

test('a touch-and-go ends that landing attempt and excludes subsequent airborne distance', () => {
  const start = mission();
  const touch = contact(start);
  const rollout = updateLandingTracker(createLandingTracker(start), touch);
  const rolling = changeFlight(touch, { tempoS: 2, distanciaPercorridaM: 1250 });
  const ground = updateLandingTracker(rollout, rolling);
  const flying = updateLandingTracker(ground, changeFlight(rolling, { tempoS: 3, emSolo: false, distanciaPercorridaM: 1300 }));
  assert.equal(flying.status, 'incomplete');
  assert.equal(flying.groundDistanceM, 50);
  const eventualStop = updateLandingTracker(flying, changeFlight(rolling, { tempoS: 20, velocidadeMs: 0, distanciaPercorridaM: 3000 }, { resultado: 'chegou' }));
  assert.equal(eventualStop.status, 'incomplete');
  assert.equal(eventualStop.report.success, false);
  assert.equal(eventualStop.groundDistanceM, 50);
});
test('a runway excursion after a hard contact retains the more serious outcome', () => {
  const start = mission();
  const hard = updateLandingTracker(createLandingTracker(start), contact(start, {}, { tipo: 'duro' }));
  const excursion = updateLandingTracker(hard, contact(start, {}, { tipo: 'fora_pista' }));
  assert.equal(excursion.status, 'crash');
});
test('hidden and paused intervals do not consume first-flight tutorial time', () => {
  const m = mission();
  let t = createFirstFlight(m, { maxDurationS: 10 });
  t = updateFirstFlight(t, changeFlight(m, { tempoS: 60 }), { visible: false });
  t = updateFirstFlight(t, changeFlight(m, { tempoS: 120 }), { paused: true });
  t = updateFirstFlight(t, changeFlight(m, { tempoS: 125 }));
  assert.equal(t.status, 'active');
  assert.equal(t.stage, 'power');
  assert.equal(updateFirstFlight(t, changeFlight(m, { tempoS: 130 })).status, 'expired');
});
test('an origin label cannot turn actual human control into live JEV evidence', () => {
  const m = mission();
  assert.equal(createRunSummary(m, flown(m), { origin: 'live-jev' }).origin, 'human');
});

test('30-second comparison includes minimum clearance of still-active hazards',()=>{
 const initial=criarVooProgressivo(222);let m=initial;
 for(let i=0;i<300;i++)m=avancarMissao(m,.1);
 const active=m.ameacas.filter(a=>Number.isFinite(a.separacaoMinM));assert.ok(active.length>0);
 const expected=Math.min(...active.map(a=>a.separacaoMinM-(a.raioProtecaoM??0)-(a.dispersaoM??0)),...m.separacoes.map(s=>s.minimaM-s.limiteM));
 assert.equal(createRunSummary(initial,m).metrics.minClearanceM,expected);
 const altered={...m,separacoes:[{minimaM:5000,limiteM:100}]};
 assert.equal(createRunSummary(initial,altered).metrics.minClearanceM,expected);
});
