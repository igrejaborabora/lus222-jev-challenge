import { raioEfectivoM } from './ameacas.js';
import { ALTURA_TREM_M } from './voo-progressivo.js';
import { PLANO_PISTA_M } from './relevo.js';

const RAD = Math.PI / 180;
const finite = Number.isFinite;
const number = (v, fallback = null) => finite(v) ? v : fallback;
const wrap = r => Math.atan2(Math.sin(r), Math.cos(r));
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const hasPosition = v => v && ['xM', 'zM', 'altitudeM'].every(k => finite(v[k]));
const validRunways = m => (m?.pistas ?? []).filter(p => p && [p.xM, p.zM, p.pistaM].every(finite) && p.pistaM > 0);
function runwayFor(m, id) {
  const runways = validRunways(m);
  const selected = runways.find(p => p.id === (id ?? m?.destinoId));
  if (selected) return selected;
  if (!hasPosition(m?.voo)) return runways[0] ?? null;
  return runways.reduce((best, p) => !best || Math.hypot(p.xM - m.voo.xM, p.zM - m.voo.zM) < Math.hypot(best.xM - m.voo.xM, best.zM - m.voo.zM) ? p : best, null);
}

/** Illustrative guidance for the simulator's +Z runway axis, not published procedures.
 * Positive lateral error = right of centreline; positive glidepath error = high.
 * distanceToThresholdM remains signed after crossing the threshold.
 */
export function deriveApproach(m, { runwayId } = {}) {
  const v = m?.voo, p = runwayFor(m, runwayId);
  if (!p || !hasPosition(v) || ![v.rumoRad, v.bankRad, v.velocidadeMs, v.velocidadeVerticalMs].every(finite)) {
    return { available: false, phase: 'unavailable', goAround: false, reasons: [], instruction: 'Approach guidance unavailable: no runway or flight position.' };
  }
  const distanceToThresholdM = p.zM - p.pistaM / 2 - v.zM;
  const lateralOffsetM = v.xM - p.xM;
  const headingErrorDeg = wrap(v.rumoRad) / RAD;
  const targetAltitudeM = PLANO_PISTA_M + ALTURA_TREM_M + Math.max(0, distanceToThresholdM + 300) * Math.tan(3 * RAD);
  const glidepathErrorM = v.altitudeM - targetAltitudeM;
  const heightAboveRunwayM = v.altitudeM - PLANO_PISTA_M - ALTURA_TREM_M;
  const lateralToleranceM = Math.max(22, Math.max(0, distanceToThresholdM) * 0.03);
  const verticalToleranceM = Math.max(6, Math.max(0, distanceToThresholdM) * 0.01);
  const offCourse = Math.abs(lateralOffsetM) > lateralToleranceM;
  const high = glidepathErrorM > verticalToleranceM, low = glidepathErrorM < -verticalToleranceM;
  const reasons = [];
  if (!v.emSolo) {
    if (m.fase === 'borrego') reasons.push('Go-around is active.');
    if (distanceToThresholdM < -p.pistaM) reasons.push('The runway is behind the aircraft.');
    else if (distanceToThresholdM < -Math.min(900, p.pistaM * 0.6)) reasons.push('The initial touchdown zone has been passed while airborne.');
    if (distanceToThresholdM < 6500 && Math.abs(headingErrorDeg) >= 90) reasons.push('The aircraft is heading away from the approach direction.');
    if (distanceToThresholdM <= 800 && distanceToThresholdM >= -300) {
      if (Math.abs(lateralOffsetM) > Math.max(25, Math.max(0, distanceToThresholdM) * 0.08)) reasons.push('Too far from the runway centreline on short final.');
      if (Math.abs(headingErrorDeg) > 20 || Math.abs(v.bankRad) > 12 * RAD) reasons.push('Alignment is unstable on short final.');
      if (v.velocidadeVerticalMs < -5) reasons.push('Descent rate is too high on short final.');
      if (v.velocidadeMs < Math.max(38, number(v.stallMs, 0) * 1.05) || v.velocidadeMs >= 85 || v.stall) reasons.push('Speed is outside the illustrative final-approach range.');
      if (low && heightAboveRunwayM < 20 && distanceToThresholdM > 100) reasons.push('The aircraft is low before reaching the runway.');
    }
  }
  const goAround = reasons.length > 0;
  const phase = v.emSolo ? (v.contacto ? 'rollout' : 'ground') : goAround ? 'go-around'
    : distanceToThresholdM > 6500 ? 'intercept'
      : distanceToThresholdM < 150 && heightAboveRunwayM < 12 ? 'flare' : 'final';
  let instruction = 'Follow the centreline and monitor speed and descent.';
  if (goAround) instruction = 'Go around: add power, level the wings and climb. Reset the approach when ready.';
  else if (phase === 'ground' || phase === 'rollout') instruction = v.velocidadeMs < 1 ? 'Aircraft stopped.' : 'Reduce power and brake while keeping the runway centreline.';
  else if (phase === 'intercept') instruction = 'Turn towards the runway approach and establish the centreline.';
  else if (phase === 'flare') instruction = 'Ease the descent for touchdown, then reduce power and brake.';
  else if (offCourse) instruction = `Move ${lateralOffsetM > 0 ? 'left' : 'right'} towards the runway centreline.`;
  else if (high) instruction = 'Above the reference path: adjust the descent while monitoring speed.';
  else if (low) instruction = 'Below the reference path: reduce the descent while monitoring speed.';
  return { available: true, runwayId: p.id ?? null, distanceToThresholdM, lateralOffsetM, headingErrorDeg,
    glidepathErrorM, targetAltitudeM, heightAboveRunwayM, remainingRunwayM: clamp(distanceToThresholdM + p.pistaM, 0, p.pistaM),
    offCourse, high, low, phase, goAround, reasons, instruction };
}

function flightSample(v) {
  if (!v) return null;
  return Object.fromEntries(['xM', 'zM', 'tempoS', 'velocidadeMs', 'velocidadeVerticalMs', 'bankRad', 'rumoRad', 'distanciaPercorridaM', 'emSolo'].map(k => [k, v[k]]));
}

/** Call for every new flight; update also discards old measurements on clock rewind. */
export function createLandingTracker(m = null) {
  return { touchdown: null, groundDistanceM: 0, stopped: false, interrupted: false, status: m?.voo?.emSolo ? 'ground' : 'airborne',
    report: null, previousFlight: flightSample(m?.voo) };
}

function touchdownSample(m, previous) {
  const v = m.voo, c = v.contacto, p = runwayFor(m);
  const timeS = number(c.tempoS, number(v.tempoS, 0));
  // Recent snapshots measure contact reasonably; late attachment must not claim
  // that already-braked speed or zeroed bank was the touchdown measurement.
  const exactFrame = finite(v.tempoS) && Math.abs(v.tempoS - timeS) < 1e-6;
  const before = previous && previous.tempoS <= timeS && timeS - previous.tempoS <= 0.25 ? previous : null;
  const sample = exactFrame ? v : before;
  const fraction = before && v.tempoS > before.tempoS ? clamp((timeS - before.tempoS) / (v.tempoS - before.tempoS), 0, 1) : 1;
  const atContact = key => exactFrame ? number(v[key]) : before && finite(before[key]) && finite(v[key])
    ? before[key] + (v[key] - before[key]) * fraction : null;
  const speedMs = number(c.speedMs, number(c.velocidadeMs, number(sample?.velocidadeMs)));
  const bankRad = number(c.bankRad, number(sample?.bankRad));
  const headingRad = number(c.headingRad, number(c.rumoRad, number(sample?.rumoRad)));
  const lateralOffsetM = number(c.lateralM, p && finite(c.xM) ? c.xM - p.xM : null);
  return { timeS, type: c.tipo, sinkRateMs: finite(c.verticalMs) ? Math.max(0, -c.verticalMs) : null,
    speedMs, bankDeg: finite(bankRad) ? bankRad / RAD : null, headingErrorDeg: finite(headingRad) ? wrap(headingRad) / RAD : null,
    lateralOffsetM, xM: number(c.xM, atContact('xM')), zM: number(c.zM, atContact('zM')),
    distanceTravelledM: number(c.distanciaPercorridaM, atContact('distanciaPercorridaM')),
    snapshotOffsetS: sample && finite(sample.tempoS) ? sample.tempoS - timeS : null,
    estimated: ['speedMs', 'bankDeg', 'headingErrorDeg'].filter(k => k === 'speedMs' ? !finite(c.speedMs) && !finite(c.velocidadeMs) : k === 'bankDeg' ? !finite(c.bankRad) : !finite(c.headingRad) && !finite(c.rumoRad)) };
}

function landingStatus(t, m) {
  const c = m.voo?.contacto;
  if (['terreno', 'fora_pista'].includes(c?.tipo) || ['limite_altitude', 'separacao_perdida'].includes(m.resultado)) return 'crash';
  if (c?.tipo === 'duro' || m.resultado === 'aterragem_dura') return 'hard-landing';
  if (!t.touchdown) return m.resultado ? 'incomplete' : m.voo?.emSolo ? 'ground' : 'airborne';
  const d = t.touchdown;
  if (d.sinkRateMs > 3 || (finite(d.speedMs) && (d.speedMs >= 85 || d.speedMs <= 30))
    || Math.abs(number(d.bankDeg, 0)) >= 0.12 / RAD || Math.abs(number(d.headingErrorDeg, 0)) >= 0.18 / RAD) return 'hard-landing';
  if (t.interrupted || (m.resultado && m.resultado !== 'chegou')) return 'incomplete';
  if (m.voo?.emSolo && m.voo.velocidadeMs < 1) {
    const complete = [d.sinkRateMs, d.speedMs, d.bankDeg, d.headingErrorDeg, d.lateralOffsetM, d.distanceTravelledM].every(finite);
    return complete && c?.tipo === 'pista' ? 'landed' : 'incomplete';
  }
  return 'rollout';
}

const LANDING_TITLES = { rollout: 'Touchdown recorded · keep braking', landed: 'Landing complete',
  'hard-landing': 'Hard landing', crash: 'Flight ended after unsafe contact or separation', incomplete: 'Landing not completed' };
function landingReport(t) {
  if (!t.touchdown && !['crash', 'hard-landing', 'incomplete'].includes(t.status)) return null;
  const d = t.touchdown;
  const reading = (v, places = 1) => finite(v) ? v.toFixed(places) : 'unavailable';
  const summary = d ? `Touchdown sink ${reading(d.sinkRateMs)} m/s · speed ${reading(d.speedMs)} m/s · bank ${reading(d.bankDeg)}° · heading error ${reading(d.headingErrorDeg)}° · lateral offset ${reading(d.lateralOffsetM)} m · ground travel ${reading(t.groundDistanceM, 0)} m${d.estimated.length ? '. Speed and attitude use the closest observed flight sample.' : '.'}`
    : 'No complete touchdown measurements were recorded.';
  return { title: LANDING_TITLES[t.status] ?? 'Landing in progress', summary, estimated:Boolean(d?.estimated.length), success: t.status === 'landed', status: t.status,
    metrics: { sinkRateMs: d?.sinkRateMs ?? null, speedMs: d?.speedMs ?? null, bankDeg: d?.bankDeg ?? null,
      headingErrorDeg: d?.headingErrorDeg ?? null, lateralOffsetM: d?.lateralOffsetM ?? null,
      groundDistanceM: d ? t.groundDistanceM : null, stoppingDistanceM: t.stopped ? t.groundDistanceM : null } };
}

/** Pure accumulator. previousFlight may be the integration snapshot immediately
 * before the current mission. The contact record takes priority when richer.
 */
export function updateLandingTracker(tracker, m, { previousFlight } = {}) {
  if (!m?.voo) return tracker ?? createLandingTracker();
  let t = tracker ?? createLandingTracker();
  if (finite(t.previousFlight?.tempoS) && m.voo.tempoS < t.previousFlight.tempoS) t = createLandingTracker();
  const previous = previousFlight ?? t.previousFlight;
  const touchdown = t.touchdown ?? (m.voo.contacto ? touchdownSample(m, previous) : null);
  const interrupted = t.interrupted || Boolean(touchdown && !m.voo.emSolo);
  let groundDistanceM = t.groundDistanceM;
  if (touchdown && m.voo.emSolo && !t.stopped && !interrupted) {
    if (finite(touchdown.distanceTravelledM) && finite(m.voo.distanciaPercorridaM)) groundDistanceM = Math.max(groundDistanceM, m.voo.distanciaPercorridaM - touchdown.distanceTravelledM);
    else {
      const from = t.touchdown ? previous : touchdown;
      if ([from?.xM, from?.zM, m.voo.xM, m.voo.zM].every(finite)) groundDistanceM += Math.hypot(m.voo.xM - from.xM, m.voo.zM - from.zM);
    }
  }
  let next = { ...t, touchdown, groundDistanceM, interrupted, stopped: t.stopped || Boolean(touchdown && m.voo.emSolo && m.voo.velocidadeMs < 1), previousFlight: flightSample(m.voo) };
  const measuredStatus = landingStatus(next, m);
  const status = t.status === 'crash' || measuredStatus === 'crash' ? 'crash' : t.status === 'hard-landing' ? 'hard-landing' : measuredStatus;
  next = { ...next, status };
  return { ...next, report: landingReport(next) };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, stableValue(value[k])]));
  return value;
}
const stableKey = value => JSON.stringify(stableValue(value));
const RUN_SETUP = ['versao', 'modo', 'cenario', 'semente', 'perfil', 'voo', 'controlos', 'ambiente', 'pistas', 'destinos', 'destinoId', 'circuito', 'diretor', 'ameacas', 'eventosPendentes', 'missao', 'restricoes', 'comando'];
const ENVIRONMENT_SETUP = ['cenario', 'semente', 'perfil', 'ambiente', 'pistas'];
const pick = (source, keys) => Object.fromEntries(keys.map(key => [key, source?.[key]]));
function originOf(m) {
  return m?.piloto?.tipo === 'humano' ? 'human' : m?.piloto?.tipo === 'jev' ? 'live-jev' : m?.piloto?.tipo === 'jev-gravado' ? 'recorded' : 'unknown';
}
const difference = (a, b) => finite(a) && finite(b) ? b - a : null;

/** Save the immutable start mission before the first simulation step. Do not
 * rebuild it from the latest state. Flags preserve mid-run changes, including
 * changes later reverted; normal pitch/power inputs are not setup changes.
 */
export function createRunSummary(start, current, { authorityChanged = false, configurationChanged = false, origin } = {}) {
  const first = start?.voo, last = current?.voo;
  const durationS = difference(first?.tempoS, last?.tempoS);
  const distanceM = difference(first?.distanciaPercorridaM, last?.distanciaPercorridaM);
  const fuelUsedKg = difference(last?.combustivelKg, first?.combustivelKg);
  const clearances = (current?.separacoes ?? []).map(s => difference(s.limiteM, s.minimaM)).filter(finite);
  for(const threat of current?.ameacas??[]) if(finite(threat.separacaoMinM))clearances.push(threat.separacaoMinM-raioEfectivoM(threat));
  const active = current?.ameacaAtiva;
  if (finite(active?.separacaoMinM) && finite(active?.raioProtecaoM)) clearances.push(active.separacaoMinM - active.raioProtecaoM);
  const detectedOrigin = originOf(start);
  // Recorded provenance cannot be relabelled as a fresh live experiment.
  const source = detectedOrigin === 'recorded' || originOf(current) === 'recorded' || origin === 'recorded' ? 'recorded'
    : detectedOrigin;
  return { origin: source, authority: start?.piloto?.tipo ?? null, profile: start?.perfil ?? null,
    scenario: start?.cenario ?? null, seed: start?.semente ?? null,
    setupKey: stableKey(pick(start, RUN_SETUP)),
    valid: Boolean(hasPosition(first) && hasPosition(last) && typeof start?.perfil === 'string' && typeof start?.cenario === 'string' && finite(start?.semente) && finite(durationS) && durationS >= 0 && finite(distanceM) && distanceM >= 0 && finite(fuelUsedKg) && fuelUsedKg >= 0),
    authorityChanged: Boolean(authorityChanged || originOf(start) !== originOf(current)),
    configurationChanged: Boolean(configurationChanged || stableKey(pick(start, ENVIRONMENT_SETUP)) !== stableKey(pick(current, ENVIRONMENT_SETUP))),
    outcome: current?.resultado ?? null,
    metrics: { durationS, distanceM, fuelUsedKg, minClearanceM: clearances.length ? Math.min(...clearances) : null } };
}

/** Deltas are second minus first. No winner/score is inferred from fuel or range. */
export function compareRuns(first, second, { durationToleranceS = 0.25 } = {}) {
  const reasons = [];
  if (!first || !second) return { comparable: false, reasons: ['Save two flight samples before comparing.'], deltas: null };
  if (!first.valid || !second.valid || !(first.metrics?.durationS > 0) || !(second.metrics?.durationS > 0)) reasons.push('Both flights need valid elapsed flight measurements.');
  if (first.origin === 'recorded' || second.origin === 'recorded') reasons.push('Historical recordings are reference evidence, not the same live flight experiment.');
  else if (!['human', 'live-jev'].every(origin => [first.origin, second.origin].includes(origin))) reasons.push('Choose one human flight and one live JEV flight.');
  if (!first.setupKey || first.setupKey !== second.setupKey) reasons.push('Starting scenario, seed, aircraft, controls or environment differ.');
  if (first.authorityChanged || second.authorityChanged) reasons.push('Control authority changed during a flight.');
  if (first.configurationChanged || second.configurationChanged) reasons.push('The scenario or configuration changed during a flight.');
  if (finite(first.metrics?.durationS) && finite(second.metrics?.durationS)
    && Math.abs(first.metrics.durationS - second.metrics.durationS) > Math.max(0, number(durationToleranceS, 0.25)) + 1e-9) reasons.push('Flight durations differ; sample both runs at the same elapsed time.');
  const comparable = reasons.length === 0;
  return { comparable, reasons, deltas: comparable ? Object.fromEntries(['durationS', 'distanceM', 'fuelUsedKg', 'minClearanceM'].map(k => [k, difference(first.metrics[k], second.metrics[k])])) : null };
}

export const FIRST_FLIGHT_STAGES = Object.freeze([
  Object.freeze({ id: 'power', title: '1 · Change the power', instruction: 'Use E / Q or the Power slider. Watch the power reading change.' }),
  Object.freeze({ id: 'pitch', title: '2 · Change the pitch', instruction: 'Pull ↓ / S to raise the nose; push ↑ / W to lower it. Or click Nose up / Nose down. Watch the attitude and vertical speed respond.' }),
  Object.freeze({ id: 'level', title: '3 · Level the aircraft', instruction: 'Press L or select Level, release the turn controls and wait for the wings and vertical speed to settle.' }),
  Object.freeze({ id: 'hide-panel', title: '4 · Clear the view', instruction: 'Use Hide panel to see more of the flight.' }),
  Object.freeze({ id: 'show-panel', title: '5 · Bring the readings back', instruction: 'Use Show panel to restore the flight instruments.' }),
  Object.freeze({ id: 'complete', title: 'Ready to explore', instruction: 'You changed power and pitch, levelled the aircraft and used the panel controls. Try an approach when ready.' }),
]);
const tutorialSnapshot = m => ({ power: number(m?.voo?.acelerador, number(m?.voo?.potencia)),
  pitch: number(m?.voo?.pitchRad), vertical: number(m?.voo?.velocidadeVerticalMs), altitude: number(m?.voo?.altitudeM),
  manualPitch: number(m?.voo?.pitchManualRad), powerTarget: number(m?.controlos?.acelerador), verticalMode: m?.voo?.modoVertical ?? null });
function withStage(t) {
  const content = FIRST_FLIGHT_STAGES.find(s => s.id === t.stage);
  return { ...t, title: content?.title ?? 'First flight', instruction: t.status === 'expired' ? 'This tutorial expired without completing the actions. Restart it when ready.'
    : t.status === 'ended' ? 'The flight ended before the tutorial was completed. Restart a first flight to try again.'
      : t.stage === 'hide-panel' && !t.panelVisible ? 'The panel is already hidden. Show it once, then use Hide panel to practise this control.' : content?.instruction ?? '' };
}

/** Restart is simply createFirstFlight(m, options); no global or elapsed-only progress. */
export function createFirstFlight(m, { panelVisible = true, maxDurationS = 180 } = {}) {
  return withStage({ stage: 'power', status: 'active', completed: [], startedAtS: number(m?.voo?.tempoS, 0),
    lastTimeS: number(m?.voo?.tempoS, 0), maxDurationS: finite(maxDurationS) && maxDurationS > 0 ? maxDurationS : 180,
    baseline: tutorialSnapshot(m), previous: tutorialSnapshot(m), panelVisible: Boolean(panelVisible), actionSeen: false, stableS: 0 });
}
export function skipFirstFlight(t) {
  return t ? { ...t, status: 'skipped', instruction: 'Tutorial skipped. Restart it whenever you want.' } : null;
}
function observedAction(t, m, action) {
  if (action === t.stage && ['power', 'pitch', 'level'].includes(action)) return true;
  const v = m.voo, p = m.piloto, c = m.controlos;
  const commandActive = finite(p?.ateS) && p.ateS > v.tempoS && p.fonte !== 'supervisor';
  if (t.stage === 'power') return (commandActive && (['mais', 'menos'].includes(p.potencia) || Math.abs(number(p.potenciaDelta, 0)) > 0.05))
    || (finite(c?.acelerador) && c.acelerador !== t.previous.powerTarget);
  if (t.stage === 'pitch') return (commandActive && (['subir', 'descer'].includes(p.vertical) || Math.abs(number(p.pitchInput, 0)) > 0.05))
    || (finite(v.pitchManualRad) && v.pitchManualRad !== t.previous.manualPitch);
  return t.stage === 'level' && ((v.modoVertical === 'nivelar' && t.previous.verticalMode !== 'nivelar')
    || (finite(t.previous.manualPitch) && v.pitchManualRad == null && ['nivelar', 'manter'].includes(v.modoVertical)));
}

/** action is a real UI event: 'power', 'pitch', 'level'; visibility is observed.
 * Pass visible:false when the simulator/tutorial is not visible (or tab hidden).
 * Only human control can complete flight stages; background/paused time is ignored.
 */
export function updateFirstFlight(t, m, { action = null, panelVisible = t?.panelVisible ?? true, visible = true, paused = false } = {}) {
  if (!t || t.status !== 'active' || !m?.voo) return t;
  const now = number(m.voo.tempoS, t.lastTimeS);
  if (now < t.lastTimeS) return createFirstFlight(m, { panelVisible, maxDurationS: t.maxDurationS });
  if (m.resultado) return withStage({ ...t, status: 'ended', lastTimeS: now });
  const snapshot = tutorialSnapshot(m), dt = Math.max(0, Math.min(0.25, now - t.lastTimeS));
  const base = { ...t, previous: snapshot, lastTimeS: now, panelVisible: Boolean(panelVisible) };
  if (!visible || paused) return { ...base, startedAtS: t.startedAtS + now - t.lastTimeS, stableS: 0, actionSeen: false, baseline: snapshot };
  if (now - t.startedAtS >= t.maxDurationS) return withStage({ ...base, status: 'expired' });
  if (m.piloto?.tipo !== 'humano' || ['supervisor', 'aproximacao'].includes(m.voo.fonteActuacao)) return { ...base, stableS: 0, actionSeen: false, baseline: snapshot };
  const actionSeen = t.actionSeen || observedAction(t, m, action);
  const stableS = t.stage === 'level' && actionSeen && !m.voo.emSolo && Math.abs(m.voo.velocidadeVerticalMs) <= 0.6 && Math.abs(m.voo.bankRad) <= 0.08 ? t.stableS + dt : 0;
  const powerChanged = finite(snapshot.power) && finite(t.baseline.power) && Math.abs(snapshot.power - t.baseline.power) >= 0.04 - 1e-9;
  const pitchChanged = finite(snapshot.pitch) && finite(t.baseline.pitch) && Math.abs(snapshot.pitch - t.baseline.pitch) >= 2 * RAD
    || finite(snapshot.vertical) && finite(t.baseline.vertical) && finite(snapshot.altitude) && finite(t.baseline.altitude) && Math.abs(snapshot.vertical - t.baseline.vertical) >= 0.5 && Math.abs(snapshot.altitude - t.baseline.altitude) >= 0.5;
  const done = t.stage === 'power' ? actionSeen && powerChanged : t.stage === 'pitch' ? actionSeen && !m.voo.emSolo && pitchChanged
    : t.stage === 'level' ? stableS >= 1 - 1e-9 : t.stage === 'hide-panel' ? t.panelVisible && !panelVisible : t.stage === 'show-panel' ? !t.panelVisible && panelVisible : false;
  if (!done) return withStage({ ...base, actionSeen, stableS });
  const nextStage = FIRST_FLIGHT_STAGES[FIRST_FLIGHT_STAGES.findIndex(s => s.id === t.stage) + 1].id;
  return withStage({ ...base, stage: nextStage, status: nextStage === 'complete' ? 'complete' : 'active', completed: [...t.completed, t.stage], baseline: snapshot, actionSeen: false, stableS: 0 });
}
