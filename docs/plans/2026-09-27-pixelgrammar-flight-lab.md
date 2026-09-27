# Pixelgrammar Flight Lab Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use executing-plans to implement this approved plan task-by-task. The user approved the proposed direction and ship-by-default workflow; continue through verification and release without another Git confirmation.

**Goal:** Make the experience unmistakably a Pixelgrammar Lab experiment, easier to start, clearer to fly and more useful for observing human/AI decisions.

**Architecture:** Keep the existing ES-module application and historical replay contracts. The landing owns its own scrollable narrative; the simulator remains a viewport application. New training/approach and system readings derive from simulation state. Independent renderer, training and aircraft-system changes are isolated by file ownership and integrated through the current command handlers.

**Tech Stack:** Existing JavaScript modules, HTML/CSS, Three.js, Canvas/SVG, node:test and Chromium smoke checks. No new packages, service dependencies or API/schema changes.

---

## Approved design
Pixelgrammar Lab is the author; Flight Experiment / LUS-222 names the experience; JEV by TypeSafe AI identifies the AI. Retain PX particle identity with readable restrained animation, remove competing JEV particles. English copy throughout. Main copy: “Take control. See how AI decides.” Human flight is primary, watching JEV is secondary. Explain experiment → interaction → observed decision → Lab authorship, with captures of the actual simulator and independent-demo attribution.

## Task 1 — Landing and brand (root)
Files: `public/index.html`, `public/lab.css`, `public/src/lab-ui.js`, `public/src/main.js`, `public/src/px-particles.js`, `public/src/ambient.js`.
1. Replace splash with a branded header, hero, simulator preview, three ways to participate, recorded evidence and Lab footer; keep existing action IDs.
2. Make only the landing scroll; preserve simulator sizing and keyboard interaction.
3. Put a PX/Lab signature in application headers, distinguish AI technology credits.
4. Add direct first-flight/landing/replay entry points through existing handlers. Capture actual simulator media, label preview/replay provenance.
5. Verify desktop/mobile, keyboard links, reduced motion, focus and return navigation.

## Task 2 — Flight perception and Porto (independent renderer)
Files: camera/scene/terrain/Porto renderer modules and focused tests only.
1. Improve cockpit view with aircraft-attached frame and bank/pitch reference, optional low-cost motion.
2. Improve recognizable coastline/river/bridges/airport details with bounded geometry/LOD.
3. Add runway approach visual references with actual runway coordinates and an integration switch for optional guidance.
4. Test coordinate transforms and inspect real WebGL views/performance. Historical simulation data remains unchanged.

## Task 3 — Approach and landing evaluation (independent pure models)
Files: new `public/src/flight-training.js`, `lib/flight-training.test.mjs`, existing `treino.js` when appropriate.
1. Derive optional approach guidance from actual runway/aircraft state, returning off-course/glidepath/distance conditions.
2. Track touchdown sink rate, speed/alignment and ground stopping distance; never call a hard landing a successful landing.
3. Provide a pure staged first-flight tutorial model driven by observed pilot actions (power, pitch, level, hide/show); permit skip/restart.
4. Test before/after touchdown, missed approach, missing runway, expired training and actual completion rather than elapsed timers.

## Task 4 — Aircraft handling and systems (independent physics)
Files: `public/src/voo-progressivo.js`, new engine-model module, focused tests; integrate via provided state/command contract.
1. Keep nominal flight and recorded replay contracts intact; add deterministic, illustrative independent engine state for interactive flights.
2. Model commanded power/failure/recovery and its effects on thrust, fuel and yaw; model-derived instruments only.
3. Improve stall/recovery and crosswind/ground handling only where supported by explicit invariants and regression tests.
4. Provide accessible user controls for starting/resetting an engine-failure exercise; no unexpected failures by default.

## Task 5 — Integrate learning and observation (root)
Files: `public/src/simulador-ui.js`, `public/src/cockpit-ui.js`, `public/src/cockpit-model.js`, `public/src/comandos-ui.js`, `public/src/som-motor.js`, `public/index.html`, companion CSS.
1. Wire first-flight overlay, direct landing exercise, optional approach guidance and landing report into the existing lifecycle.
2. Add model-backed engine status/controls and touchdown sound through existing audio context.
3. Show observed situation → chosen action → measured consequence for JEV; support comparing the same deterministic starting scenario with a human run, clearly mark recorded/live origin and reset state between runs.
4. Keep all controls/hide/show operational and warning visibility independent of tabs.

## Task 6 — Verify and release
1. Run focused node tests while building; run full `npm test`, `npm run lint`, `npm run build`, `git diff --check` before shipping.
2. Run Chromium functional checks for landing entries/AI recorded entry/onboarding, actual command effects, approach/landing report, engine exercise/reset, desktop/mobile/short landscape, PX reduced-motion and simulator return navigation.
3. Inspect screenshots/video and review independent changes, preserving unrelated dirty strategic-JEV work in the original checkout.
4. Commit focused changes, push, open/attach PR, require green CI, merge and verify production files and flows.

## Acceptance
The landing immediately identifies Pixelgrammar Lab, explains JEV in English and exposes a playable first step. A newcomer can complete guided learning and start final approach directly. The cockpit/terrain provide useful flight references; landing outcomes and AI effects report measured data. New systems are functional and deterministic, not decorative data. Historical replays retain their behavior. The panel visibility preference and authority handoff remain intact.
