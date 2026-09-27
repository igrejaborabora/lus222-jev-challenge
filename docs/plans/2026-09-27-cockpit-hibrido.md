# Hybrid cockpit implementation plan

> Use the executing-plans workflow to implement and verify each task; the user has approved the design and ship-by-default delivery.

**Goal:** Replace the small flight display with a detailed, functional English cockpit that can be shown or hidden without losing flight state.

**Architecture:** The existing flight state remains authoritative. A new cockpit UI presents a PFD, navigation display, systems and tactile controls in DOM/SVG, over a lightweight Three.js dimensional shell. Navigation and shell renderers are independent modules. A persistent visibility choice updates the camera's reserved space and survives camera changes and new flights.

**Tech Stack:** Existing ES modules, Three.js, SVG/canvas, node:test. No new dependencies or API changes.

## Approved design
- Modern graphite cockpit, three screens, amber backlighting and violet JEV identity.
- PFD: attitude, airspeed/altitude tapes, vertical speed, heading, AGL, flight-path marker and targets.
- Navigation: Porto schematic coast/river, route, runways, current position, traffic, range/orientation controls.
- Systems: real simulated power, fuel/flow/endurance, flap/trim/rudder/brakes/lights and warnings. Do not invent independent-engine temperatures or oil readings; those require a later engine model.
- Controls: ALT/HDG/VS targets, throttle, trim/flaps/brakes/lights, Level and takeover routed through existing authority/command handlers. Preflight/landing checklist reflects current system state.
- Visibility: always-available Show/Hide panel button and I shortcut, local preference, correct camera reflow. Mobile single-screen tabs and instrument expansion preserve terrain visibility.

## Task 1 — Shell (independent)
Create `public/src/cockpit-shell.js`: `criarCockpitShell(host)` asynchronously imports existing Three.js, creates low-poly chamfered bezels and knobs behind `[data-cp-screen]` / `[data-cp-knob]`, with resize/render/setVisible/dispose lifecycle. No extra animation loop. CSS remains usable if WebGL is unavailable. Verify resource disposal and browser appearance.

## Task 2 — Navigation (independent)
Create `public/src/cockpit-navigation.js`, `lib/cockpit-navigation.test.mjs`: pure range/heading/position transformation, real runway/traffic distances and destination data; Canvas renderer with zoom/orientation. Test north-up/heading-up, wind/ground track, off-range traffic and defaults before connecting to UI.

## Task 3 — Functional cockpit
Create `public/src/cockpit-ui.js`, `public/cockpit.css`; adjust `public/index.html` and `public/src/instrumentos-ui.js` as necessary. Preserve legacy telemetry IDs where meaningful. Main cockpit mounts before telemetry binding. PFD remains SVG, screens use shared state; DOM controls proxy existing validated controls. Use the existing layout/style without new dependencies. Add focused tests for telemetry and visibility decisions where logic warrants them.

## Task 4 — Integrate show/hide and camera
Modify `public/src/simulador-ui.js`: mount cockpit, initialise with each flight, update at existing UI cadence, render attitude each frame, dispose shell when leaving and suspend while hidden. Toggle updates aria-expanded and hidden, persists safely even when localStorage is denied, triggers camera resize. Hidden cockpit clears camera view offset. I shortcut ignores text inputs. Keep JEV decisions and warnings discoverable, human/AI authority unchanged.

## Task 5 — Validate and ship
Run `npm test`, `npm run lint`, `npm run build`, `git diff --check`. Browser checks: three screens respond to real flight; descend/Level/takeover work; cockpit can be hidden/shown by button/key, survives camera/restart/reload; desktop and mobile no clipping, shell failure falls back to readable UI; no extra AI requests. Inspect WebGL screenshots and functional controls. Review final diff, focused commits, push, PR, green CI, merge and production smoke.

## Implementation and local verification
- Tasks 1–4 implemented, with CSS/WebGL fallback, target validation in the visible controls and click feedback through the existing mute-aware audio graph.
- `npm test`: 307 passed. `npm run lint`, `npm run build` and `git diff --check` passed.
- Chromium WebGL smoke: three screens, 1440/1280/1024/390/360 widths, real descent and throttle, expansion, camera changes, keyboard/button toggling and preference after reload; no page errors.
- Functional smoke: invalid targets focus the visible input, ALT/HDG/VS and knob input, manual/assisted mode, trim/Level, flap transit on approach, lights, brakes, dimmer, map and live checklist.
- Lifecycle smoke: exit/re-enter, 844×390 landscape, sidebar width, recorded JEV decision visible when cockpit hidden, takeover, no new model requests.
- Separate shell validation: context loss/restoration, resize, hide/show and disposal. Map compactness and north/heading-up transforms covered.
- PR/CI/production verification follows this local gate.

Final review corrections: release flight keys after focusing target knobs, keep annunciations outside mobile tabs, derive brake indication/checklist from effective keyboard/gamepad/guided commands. Regression checks cover all three cases.
