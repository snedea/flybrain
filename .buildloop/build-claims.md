# Build Claims -- T7.6

## Files Changed
- [MODIFY] index.html -- Added id="connectomeSubtitle" to subtitle div, added #scaleIndicator span to toolbar-right, added title="Toggle view (V)" to toggle button
- [MODIFY] css/main.css -- Added .scale-indicator style and .connectome-subtitle.loading rule (orange accent, full opacity)
- [MODIFY] js/brain-worker-bridge.js -- Added fetchBinaryWithProgress() for XHR download with progress, updateLoadingProgress() for subtitle updates, modified initBridge() to show loading progress, modified handleWorkerMessage 'ready' case to update subtitle/scale indicator with neuron/edge counts, modified handleWorkerError to show fallback text, stored BRAIN.workerEdgeCount
- [MODIFY] js/main.js -- Modified toggle button handler to switch between WebGL (139K) and 59-group views when worker is ready, updated NeuroRenderer poll timer to set button text to "59 Groups" on init, added 'v' keyboard shortcut to toggle connectome view

## Verification Results
- Build: PASS (no build step — vanilla JS)
- Tests: SKIPPED (no existing tests)
- Lint: PASS (node -c js/brain-worker-bridge.js && node -c js/main.js — both pass syntax check)

## Claims
- [ ] index.html has id="connectomeSubtitle" on the .connectome-subtitle div
- [ ] index.html has #scaleIndicator span in .toolbar-right with display:none initial style
- [ ] index.html toggle button has title="Toggle view (V)"
- [ ] css/main.css contains .scale-indicator rule (font-size 0.65rem, text-muted color, 0.6 opacity)
- [ ] css/main.css contains .connectome-subtitle.loading rule (accent color, opacity 1)
- [ ] brain-worker-bridge.js fetchBinaryWithProgress() uses XHR with progress events and returns Promise<ArrayBuffer>
- [ ] brain-worker-bridge.js updateLoadingProgress() updates #connectomeSubtitle with "Loading connectome... X.X / Y.Y MB" text
- [ ] brain-worker-bridge.js initBridge() shows "Loading connectome..." on start, uses fetchBinaryWithProgress instead of fetch for binary download, shows "Parsing connectome..." before worker creation
- [ ] brain-worker-bridge.js catch handler shows "59 neuron groups — FlyWire approximation (fallback)" and removes loading class
- [ ] brain-worker-bridge.js handleWorkerMessage 'ready' sets BRAIN.workerEdgeCount and updates subtitle to "N neurons / M connections — FlyWire FAFB v783" and shows #scaleIndicator with same text
- [ ] brain-worker-bridge.js handleWorkerError shows fallback subtitle text and removes loading class
- [ ] main.js toggle button handler: when BRAIN.workerReady, toggles between NeuroRenderer active ("59 Groups") and destroyed ("139K View"); when not ready, falls back to original hide/show behavior
- [ ] main.js NeuroRenderer poll timer sets button text to "59 Groups" when NeuroRenderer.init() succeeds
- [ ] main.js 'v' keydown listener triggers connectomeToggleBtn.click(), skipping INPUT/TEXTAREA/SELECT targets
- [ ] fetchBinaryWithProgress and updateLoadingProgress are declared inside the IIFE (not global scope)
- [ ] No new files created; no new dependencies added
- [ ] js/sim-worker.js, js/neuro-renderer.js, js/connectome.js are NOT modified

## Gaps and Assumptions
- Cannot smoke-test in a browser (headless environment) — visual behavior (progress indicator animation, WebGL canvas swap) is untested
- The \u2014 em dash character is written as the JS escape sequence \u2014 in string literals per plan instructions
- When connectome.bin.gz does not exist (current state), the fallback path will show "59 neuron groups — FlyWire approximation (fallback)" after the XHR 404 error
- The NeuroRenderer.init() return value is assumed to be truthy on success (used for button text update conditional)
