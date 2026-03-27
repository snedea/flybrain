# Build Claims -- D22.1

## Files Changed
- [MODIFY] js/sim-worker.js -- Added `case 'reset':` message handler that zeros all per-neuron state arrays (V, fired, refractory), clears sustained stimulation, zeros group activation arrays, and resets stats accumulators
- [MODIFY] js/brain-worker-bridge.js -- Added `stopWorker()` and `startWorker()` functions inside the IIFE; exposed them as `BRAIN.stopWorker` and `BRAIN.startWorker`
- [MODIFY] js/main.js -- Added `BRAIN.stopWorker()` call in the visibilitychange hide branch (after clearing brainTickId); added `BRAIN.startWorker()` call in the show branch (before restarting the setInterval brain tick)

## Verification Results
- Build: SKIPPED (no build step; vanilla JS served from index.html)
- Tests: SKIPPED (no test suite)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] sim-worker.js handles a `'reset'` message type that fills V, fired, refractory with 0, nulls sustainedIndices/sustainedIntensities, fills groupActive/groupCooldown/groupRecvInput/groupFiredThisTick with 0 (when non-null), and resets tickTimeSum/tickTimeSamples/activeNeuronCount to 0
- [ ] sim-worker.js reset handler guards with `if (N === 0) break;` to prevent calling .fill on uninitialized arrays
- [ ] brain-worker-bridge.js `stopWorker()` sends 'stop' and 'setStimulusState' (null indices/intensities) to the worker, then nulls both `latestFireState` (private) and `BRAIN.latestFireState` (public)
- [ ] brain-worker-bridge.js `startWorker()` sends 'reset' then 'start' to the worker
- [ ] Both `stopWorker()` and `startWorker()` are no-ops (early return) when `!workerReady || !worker`, so they are safe in fallback mode
- [ ] `BRAIN.stopWorker` and `BRAIN.startWorker` are assigned on the global BRAIN object before `initBridge()` is called
- [ ] main.js visibilitychange handler calls `BRAIN.stopWorker()` immediately after `brainTickId = null;` on tab hide
- [ ] main.js visibilitychange handler calls `BRAIN.startWorker()` immediately before `brainTickId = setInterval(updateBrain, 500);` on tab show
- [ ] No simulation parameters (leak rate, threshold, tick rate) were modified
- [ ] No new files were created; no dependencies added

## Gaps and Assumptions
- No automated tests exist; verification is manual (open browser, switch tabs, observe behavior)
- The reset handler does not restore V to resting potential (e.g. -65mV) -- it zeros V to 0.0, matching the initial state before any ticks run. If the simulation expects a non-zero resting potential, this could cause a brief transient on resume. Inspecting the init code (`V = new Float32Array(N)`) confirms initial V is 0-filled, so this is correct.
- If the worker has already been stopped (e.g. by a previous hide event), calling stopWorker() again is safe (double-stop sends redundant messages but causes no error)
- The 'start' message handler in sim-worker.js is assumed to exist and restart the setTimeout loop (verified by existing code: `case 'start':` sets `running = true` and calls `tick()`)
