# JEV landing objective and entry choice Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make Start flying offer human simulation or live JEV with an explicit route/Porto landing objective, and complete a visible, smooth simulated landing with instant manual takeover.

**Architecture:** Preserve the existing simulator, replay and progressive flight model. A deterministic landing state machine joins the airport approach, aligns, descends, flares and brakes; live JEV supplies bounded continue/hold/go-around judgments against sanitized state, never coordinates or arithmetic. Visible source labels distinguish AI judgments from controller execution and protective overrides. No live AI means no pretend AI landing.

**Tech Stack:** Existing native JavaScript modules, Three.js, Vercel AI SDK evaluate, Node tests, Playwright. No dependencies.

User approved the preceding proposal and requested the entry modal. Alternative approaches considered: direct stick control alone cannot provide a stable landing; a scripted demo alone would misrepresent JEV. Combine model judgments with continuous deterministic control. Keep English product copy.

## Task 1 — Entry choice (independent UI task)
Files: public/index.html, public/src/lab-ui.js, public/src/main.js, public/lab-choice.css.
- Start flying opens a native accessible dialog with Flight simulator / AI Pilot · JEV cards.
- Human defaults to existing first-flight tutorial behavior; AI offers route / land at Porto (default land), explains live decisions and manual takeover, starts with `{piloto:'jev',objectivo:'aterrar'|'rota'}`.
- Live unavailable disables live start and offers explicitly labelled recorded route, never silently substitutes it. Read availability at open time and allow refresh on opening.
- All AI landing-page links lead to same choice. Retain direct manual training links.
- Escape, close, backdrop and focus return; responsive desktop/mobile, reduced motion; no paid calls from dialog.

## Task 2 — Landing controller and meaningful tests
Files: public/src/ai-landing.js, public/src/simulacao.js, public/src/voo-progressivo.js, lib/ai-landing.test.mjs.
- Explicit phase state, runway selection, navigation to an entry fix and capture criteria. Existing position is retained on in-flight activation.
- Continuous commands produce alignment, approach/flaps, flare, touchdown and stopped rollout using existing physics.
- Pause/resume uses simulation time. Manual takeover clears all landing commands and invalidates pending decisions.
- Model hold / go-around and deterministic instability/weather/terrain checks prevent an unstable final; retry joins the circuit. Missing/stale decision never silently becomes permission to land.
- Regression tests integrate the actual fixed-step physics across entry headings/offsets, dry/wet/crosswind, touchdown and stop, go-around, stale judgments, overrides and replay isolation.

## Task 3 — Live judgment and simulator integration
Files: public/src/landing-contract.js, api/jev.js, lib/limites-api.mjs, lib/landing-contract.test.mjs, public/src/simulador-ui.js, scripts/verify-deploy-assets.mjs.
- Add `aterragem` request moment; strict bounded numeric/enumerated state with runway-relative geometry, environment, phase and aircraft condition. One Choice: continue / hold / go-around / unable. Freshness and contract validation on both boundaries. Follow live TypeSafe docs and existing SDK shape; no SDK migration.
- Finite request timeout, limited cadence, abort on pause/takeover/exit/new objective, no stale result from earlier session/phase applied.
- Live AI landing initializes the progressive profile and retains physics; default objective land, route remains selectable.
- Persistent visible phase, AI decision, controller source, objective, last decision age and takeover/go-around action. No fabricated reasoning.
- Existing assisted approach remains usable independently and labelled as such.

## Task 4 — Verify and ship
- Focused failing tests, implementation, focused test pass.
- Spec and quality review (subagent-driven-development), resolve issues.
- npm test, npm run lint, npm run build, git diff --cached --check.
- Browser desktop/mobile: modal keyboard/focus/Escape, no auto-start on open, human start, AI unavailable, live fixture contract, phase progression, manual takeover, stale response rejection, hide instrument panel.
- Exercise the real live endpoint with a bounded request if available; report model/service limitations truthfully.
- Focused commits, push, PR attach, green CI merge and production smoke under existing ship authorization.

## Delivery evidence — 28 September 2026

- Entry modal, explicit landing/route goals, continuous landing controller and live decision contract implemented. No dependencies added.
- Spec and quality reviews completed; fixed the old five-minute cutoff, expired traffic protection state, runway heading wrapping and mismatched stability thresholds. Live budget now counts 900 actual requests per visit; exhausted/unavailable AI pauses safely in human mode.
- 379 tests, ESLint and deploy-asset build passed. Browser checks cover modal keyboard/focus, live availability/retry/replay, actual entry options, pause/resume, go-around, delayed-response rejection after takeover, desktop/mobile layout and hidden instruments.
- Actual JEV evaluation (not fixtures): 39 calls, landing and stop after 227.4 simulated seconds; touchdown vertical speed -0.557 m/s and lateral offset 0.837 m. Full synthetic state/response evidence in `evidence/aterragem-jev-2026-09-28.json`; rerun with `scripts/avaliar-aterragem-jev.mjs`. Accelerated simulation does not validate real-time browser/network timing. Nine additional physical entry/weather cases passed in independent review.
