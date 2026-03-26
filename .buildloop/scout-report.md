# Scout Report: T6.1

## Key Facts (read this first)

- **Tech stack**: Vanilla JS, no build step, no npm, no bundler. Single-page app — scripts loaded via `<script>` tags in `index.html`. Three.js must be added via CDN (exactly as the task specifies).
- **Global state**: `BRAIN` is the sole global object. `BRAIN.postSynaptic[neuronName][BRAIN.thisState]` gives live activation level (integer, typically 0–100+; threshold is 22). `BRAIN.drives` gives drive floats (0–1).
- **Main render loop**: `requestAnimationFrame(loop)` in `main.js` at line 1633. Each frame calls `update(dt)` then `draw()`. Brain3D.update() should be called here.
- **Existing script load order**: `constants.js` → `connectome.js` → `fly-logic.js` → `main.js`. `brain3d.js` must be inserted **before** `main.js` (or after connectome.js) so BRAIN is already set up when Brain3D initializes.
- **No UPDATED_SPECS.md or CLAUDE.md found** in /work — only SPEC.md, TASKS.md, TASKS-ARCHIVE.md exist.

## Relevant Files

| File | Role |
|------|------|
| `index.html` | Add Three.js CDN, OrbitControls CDN, `<script src="js/brain3d.js">`, "Brain 3D" toolbar button, overlay `<div>`, tooltip `<div>` |
| `js/main.js` | Add `Brain3D.update()` call in the `loop()` function (line ~1644); add button click handler for "Brain 3D" toggle |
| `css/main.css` | Add styles for the 3D overlay panel, brain3d tooltip, and "Brain 3D" active button state |
| `js/connectome.js` | Read-only reference: defines `BRAIN.postSynaptic`, `BRAIN.neuronRegions`, neuron names |
| `js/brain3d.js` | **New file** — the entire Three.js Brain3D module |

## Architecture Notes

- **`BRAIN.postSynaptic[name]`** is a 2-element array `[thisState, nextState]`. To read current activation: `BRAIN.postSynaptic[name][BRAIN.thisState]`. Values are raw integers (not normalized). Need to normalize to 0–1 for opacity/emissive (suggest dividing by ~80, clamping to 1).
- **Neuron name completeness**: All neuron group names from the task's region-to-neuron mapping exist in `BRAIN.neuronRegions` and `BRAIN.postSynaptic`. MN_* (motor) neurons are present. Note: some neurons like `NOCI`, `CLOCK_DN`, `GNG_DESC`, `ANTENNAL_MECH` exist but are not in the task's mapping — they are fine to ignore.
- **Color convention** already established in `regionColors` (main.js line 89): sensory `#3b82f6`, central `#8b5cf6`, drives `#f59e0b`, motor `#ef4444`. Brain3D should match these exactly.
- **z-index layering**: toolbar is z-index 20, help overlay is z-index 30, neuron tooltip is z-index 40. Brain3D overlay needs z-index between 10 and 20 (behind toolbar) OR above toolbar at ~25 with toolbar visible on top.
- **Bottom panel** is 90px tall (`#bottom-panel` height), toolbar is 44px. The usable canvas area is `window.innerHeight - 90 - 44`. The 3D panel overlay should account for these.
- **Script load order matters**: `BRAIN.setup()` is called at line 159 of `main.js`. `brain3d.js` should NOT call `BRAIN.setup()` itself — it should read from BRAIN after main.js calls it. Best approach: brain3d.js defines the module, main.js calls `Brain3D.init(container)` after `BRAIN.setup()`.
- **The `loop()` function** at line 1633 is the place to hook `Brain3D.update()` — add a guard `if (typeof Brain3D !== 'undefined' && Brain3D.active) Brain3D.update();`.

## Suggested Approach

1. Add Three.js r158+ CDN and OrbitControls CDN to `index.html` (importmap or plain `<script>` tags before brain3d.js).
2. Add "Brain 3D" button to `.toolbar-left` in `index.html`.
3. Add `<div id="brain3d-overlay">` after the canvas, and `<div id="brain3d-tooltip">` for hover tooltip.
4. Create `js/brain3d.js` as a module-style IIFE that exposes `window.Brain3D = { init, update, show, hide, active }`.
5. In `brain3d.js`, define region objects with their mesh(es), neuron lists, color, and emissive update logic. Keep all Three.js code inside the module to avoid global namespace pollution.
6. In `main.js` loop function, call `Brain3D.update()` per frame when active.
7. In `css/main.css`, add overlay styles (position: fixed, top: 44px, bottom: 90px, full width, z-index: 15) and tooltip styles.
8. Raycasting: on `mousemove` over the renderer's canvas, cast ray against all region meshes, show tooltip on hit.

## Risks and Constraints (read this last)

- **Three.js CDN version consistency**: OrbitControls must match the Three.js version. Use the same release from the same CDN (e.g., both from `https://cdn.jsdelivr.net/npm/three@0.158.0/`). Using mismatched versions causes import errors.
- **Module vs non-module**: If Three.js is loaded as ES module (`type="module"`), OrbitControls is `import`ed differently. Easiest no-build approach is to use the UMD/global build: `three.min.js` + `OrbitControls.js` (both as plain `<script>` tags) so `THREE` and `THREE.OrbitControls` are global. Check CDN path carefully — the UMD OrbitControls path changed between r140 and r158.
- **Script load order**: `brain3d.js` must load after Three.js CDN scripts but the `Brain3D.init()` call must happen after `BRAIN.setup()` (line 159 of main.js). Brain3D should defer actual initialization to the "Brain 3D" button click or to a `DOMContentLoaded`/deferred init call from main.js after BRAIN.setup().
- **WebGL context**: If the user's browser doesn't support WebGL, Three.js will throw. Add a try/catch around `new THREE.WebGLRenderer()`.
- **Transparency rendering order**: Multiple transparent meshes (opacity < 1) require `depthWrite: false` on materials or explicit `renderOrder` to avoid z-fighting artifacts on overlapping brain regions (e.g., optic lobes overlapping VNC cylinder). Set `transparent: true` and `depthWrite: false` on all brain region materials.
- **MN_* wildcard in VNC region**: The task says `MN_*` is in VNC/Motor region. All `MN_` prefixed neurons (`MN_LEG_L1`, `MN_LEG_R1`, etc.) need to be collected by prefix matching, not hardcoded, to avoid maintenance issues if neurons are added.
- **Performance**: The 3D panel is an overlay, not replacing the canvas. Both the 2D canvas loop (RAF) and Three.js renderer will run concurrently when the panel is open. This is fine at 60fps with ~10 simple meshes, but the Three.js renderer.render() should only be called when `Brain3D.active === true`.
- **bottom-panel occlusion**: The 3D overlay sits on top of the simulation canvas but the bottom panel floats above both. The overlay height should stop at the top of the bottom panel (i.e., `bottom: 90px`) or the Three.js canvas should have pointer-events disabled so the bottom panel remains interactive.
