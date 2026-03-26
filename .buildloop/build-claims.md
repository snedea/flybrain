# Build Claims -- T7.5

## Files Changed
- [MODIFY] js/sim-worker.js -- Added regionType to the worker 'ready' postMessage payload
- [MODIFY] js/brain-worker-bridge.js -- Capture regionType from worker, expose workerReady/workerNeuronCount/workerRegionType/workerGroupIdArr/workerGroupIdToName/workerGroupSizes/latestFireState on BRAIN object, set BRAIN.workerReady=false on error/crash fallback
- [CREATE] js/neuro-renderer.js -- WebGL2 renderer IIFE that draws 139K neurons as GL_POINTS in a canvas, colored by region type (sensory blue, central purple, drives amber, motor red), brightness driven by fire state; includes grid layout with 4 sections, HTML label overlays, tooltip on hover with group name/description via O(1) grid-based hit-testing
- [MODIFY] index.html -- Added script tag for neuro-renderer.js between brain-worker-bridge.js and fly-logic.js
- [MODIFY] js/main.js -- Added polling timer to init NeuroRenderer when worker ready; wrapped DOM dot update loop in conditional to skip when WebGL active; replaced connectome toggle button handler to destroy WebGL renderer on click
- [MODIFY] css/main.css -- Added CSS rules for #neuro-renderer-wrap, #neuro-canvas, and #neuro-labels

## Verification Results
- Build: PASS (no build step — vanilla JS project)
- Tests: PASS (`node tests/run-node.js` — 45 passed / 0 failed / 45 total)
- Lint: SKIPPED (no linter configured)
- Syntax: PASS (`node -c` on all 4 modified/created JS files)

## Claims
- [ ] sim-worker.js postReady message now includes `regionType: regionType` (the Uint8Array parsed from binary metadata)
- [ ] brain-worker-bridge.js captures regionType into regionTypeArr and exposes it as BRAIN.workerRegionType
- [ ] brain-worker-bridge.js exposes BRAIN.workerReady, BRAIN.workerNeuronCount, BRAIN.workerGroupIdArr, BRAIN.workerGroupIdToName, BRAIN.workerGroupSizes on worker ready
- [ ] brain-worker-bridge.js exposes BRAIN.latestFireState on every tick message
- [ ] brain-worker-bridge.js sets BRAIN.workerReady = false in both error handler and crash handler fallback paths
- [ ] neuro-renderer.js is an IIFE exposing window.NeuroRenderer = { init, destroy, isActive }
- [ ] neuro-renderer.js creates a WebGL2 canvas inside #connectome-panel, hides #nodeHolder, and renders all neurons as GL_POINTS in a single drawArrays call
- [ ] Neurons are colored by region type: sensory=#3b82f6, central=#8b5cf6, drives=#f59e0b, motor=#ef4444
- [ ] Neurons are laid out in a grid pattern grouped by region section (sensory, central, drives, motor) with SECTION_GAP=24px vertical gap for labels
- [ ] HTML label overlays (Sensory, Central, Drives, Motor) are positioned above each region section via absolute positioning in a #neuro-labels container
- [ ] Brightness per neuron is driven by fire state from BRAIN.latestFireState: 1.0 when fired, 0.0 when not; fragment shader applies 0.15 + brightness*0.85
- [ ] Render loop runs at display refresh rate via requestAnimationFrame, updating brightnessBuffer with bufferSubData each frame
- [ ] Tooltip on hover uses O(1) grid-based lookup (approx row/col from mouse position, checks 3x3 neighborhood), shows group name + description from neuronDescriptions global or groupIdToName fallback
- [ ] Tooltip reuses existing #neuronTooltip element
- [ ] destroy() tears down WebGL, removes canvas/wrapper, restores #nodeHolder display, cancels animation frame
- [ ] main.js polls every 200ms for BRAIN.workerReady to call NeuroRenderer.init(), with 30s timeout
- [ ] main.js skips DOM dot update loop when NeuroRenderer.isActive() returns true
- [ ] Connectome toggle button destroys WebGL renderer on click (showing DOM dots), or toggles DOM dots as before if WebGL not active
- [ ] index.html loads neuro-renderer.js between brain-worker-bridge.js and fly-logic.js
- [ ] CSS adds #neuro-renderer-wrap (relative, flex:1, overflow-y:auto), #neuro-canvas (block, pixelated), #neuro-labels (absolute, pointer-events:none)
- [ ] canvas.getContext('webgl2') used — no ANGLE_instanced_arrays extension needed (WebGL2 native)
- [ ] Fallback: if WebGL2 not available or shaders fail, nodeHolder display is restored and init returns false

## Gaps and Assumptions
- The plan specifies "ANGLE_instanced_arrays" but this is a WebGL1 extension; WebGL2 drawArrays with per-vertex attributes achieves the same single-draw-call goal (as noted in the plan's own clarification)
- Canvas clear color is hardcoded to (0.086, 0.129, 0.243) matching --surface #16213e, not reading the CSS variable at runtime
- Browser smoke testing (visual rendering, tooltip interaction, toggle button behavior) was not performed — only syntax and unit tests were run
- The tooltip positioning uses clientX/clientY with fixed positioning and bottom placement; edge cases near viewport boundaries are not explicitly handled
- The canvas width is set once at init time from wrap.getBoundingClientRect().width — no resize observer for dynamic panel resizing
