# Porto Aerial Surface and Pixelgrammar Signature Implementation Plan

> **For Claude:** Use executing-plans to implement this approved plan task-by-task. The user approved the preceding proposal and ship-by-default workflow; continue without another execution or Git confirmation.

**Goal:** Deliver a selectable Porto photographic surface experiment and a quiet pixel signature during simulator flight.

**Architecture:** Keep the existing shared collision/render height field. Sample a bounded DGT orthophoto on existing terrain meshes, blending to the illustrative surface outside coverage and at the simulated runway/water. Label the result explicitly as aerial imagery adapted to illustrative geography, not surveyed terrain. A small canvas pixel wordmark uses the simulator update loop for a 30-second interval and an 8-second pass, with no animation outside active flight.

**Tech Stack:** Existing JavaScript ES modules, Three.js, Canvas 2D, CSS, Node tests and Playwright. No new runtime dependencies.

## Accepted design and constraints
- The user approved trying the preceding recommendation: signature in the simulator and real imagery for the Porto ground.
- Google tiles are not the selected path because of new EEA project availability; DGT WMS supplied a working sample.
- DGT ortho 2025 RGB, EPSG:4326, bounds west -8.74 / south 41.11 / east -8.55 / north 41.28. Service capabilities declare `Fees: no conditions apply` and `AccessConstraints: None`. Include DGT/IFAP source credit and source/service metadata with the assets.
- The existing airport, river and landmarks have illustrative coordinates. This iteration adapts imagery to that scene; it does not claim real elevation, navigation accuracy, 3D photogrammetry or LiDAR integration. Keep it optional, not the default.
- Package a bounded image locally to avoid live WMS waits, third-party outages and unbounded requests. Load only on selection; lighter image on mobile.
- Preserve all flight dynamics, historical replays and primary-checkout strategic-JEV work.

## Task 1 — Asset and surface mapping
Files: `public/terrain/porto/*`, `public/src/porto-aerial.js`, `lib/porto-aerial.test.mjs`, `public/src/terreno.js`.
1. Save source images and attribution/provenance, verify JPEG dimensions and size.
2. Add pure bounded world-to-image mapping and weight helpers. Test finite UVs, anchor placement, coverage fade, and airport protection.
3. Add one lazy texture sampler to terrain material; keep material caching, normal lighting, night modulation and disposal. Never change heights.
4. Verify shader compilation, selection/loading/failure/off states and texture disposal in Chromium.

## Task 2 — Simulator selection
Files: `public/index.html`, `public/src/simulador-ui.js`, `public/src/world.js`, `public/flight-lab.css`.
1. Add `Ground surface: Illustrated / Aerial photo experiment`, loading/failure feedback and permanent source credit while active.
2. Keep default illustrated, maintain user selection for the current visit, and do not start network/image work on the landing.
3. Avoid attributing illustrative buildings to the imagery. Clearly retain the limitation on height and alignment.

## Task 3 — Pixel signature
Files: `public/src/flight-signature.js`, `public/src/flight-signature-ui.js`, `lib/flight-signature.test.mjs`, simulator HTML/CSS and loop.
1. Test cadence, hidden tab/pause, critical approach/alerts, motion preference and restart behavior.
2. Draw `PX · DEVELOPED BY PIXELGRAMMAR.COM` as a pixel matrix. Pass through reserved footer space every 30 seconds for 8 seconds; link to Pixelgrammar.
3. Add a persistent user visibility toggle; provide a static reduced-motion version. Never overlap controls or source attribution.

## Task 4 — Verification and release
- Run `npm test`, `npm run lint`, `npm run build`, `git diff --check`.
- Browser plugin/skill is absent; use existing Playwright runtime. Check landing -> simulator -> choose photo -> load actual surface -> switch back. Verify desktop and mobile, failed image load, banner scheduling and reduced motion. No paid AI calls.
- Review screenshots and console; record actual limitations and asset costs.
- Commit focused changes, push, PR, attach artifact, merge with CI green, verify production.
