# Plan: D22.1

Fix sim-worker not pausing on tab hide causing stale neural state on resume.

## Dependencies
- list: [] (no new dependencies)
- commands: [] (nothing to install)

## File Operations (in execution order)

### 1. MODIFY js/sim-worker.js
- operation: MODIFY
- reason: Add a 'reset' message handler that zeros all neural state arrays (V, fired, refractory, groupActive, groupCooldown, sustainedIndices/Intensities). The existing 'stop' handler only sets `running = false` -- it does not clear accumulated neural state. Without a reset, restarting the worker on tab resume would replay stale V/fired/refractory values.
- anchor: `case 'setParams':`

#### Functions
- No new functions. Add a new `case 'reset':` block in the `self.onmessage` switch statement.
- signature: N/A (message handler case)
  - purpose: Zero all per-neuron simulation state and per-group activation state so the worker starts fresh on resume.
  - logic:
    1. Insert a new `case 'reset':` block immediately before `case 'setParams':` in the `self.onmessage` switch statement.
    2. Inside the case block:
       - Check `if (N === 0) break;` (guard: not initialized)
       - Call `V.fill(0);`
       - Call `fired.fill(0);`
       - Call `refractory.fill(0);`
       - Set `sustainedIndices = null;`
       - Set `sustainedIntensities = null;`
       - Check `if (groupActive)` then:
         - Call `groupActive.fill(0);`
         - Call `groupCooldown.fill(0);`
         - Call `groupRecvInput.fill(0);`
         - Call `groupFiredThisTick.fill(0);`
       - Reset stats accumulators: `tickTimeSum = 0; tickTimeSamples = 0; activeNeuronCount = 0;`
       - `break;`
  - calls: TypedArray.fill(0) on V, fired, refractory, groupActive, groupCooldown, groupRecvInput, groupFiredThisTick
  - returns: N/A
  - error handling: The `if (N === 0) break;` guard prevents calling .fill on null arrays before init completes.

### 2. MODIFY js/brain-worker-bridge.js
- operation: MODIFY
- reason: Expose `BRAIN.stopWorker()` and `BRAIN.startWorker()` functions that main.js can call from the visibilitychange handler. These send stop/reset/start messages to the worker and clear bridge-side state (latestFireState, BRAIN.latestFireState). Currently the `worker` variable is private inside the IIFE with no external pause/resume API.
- anchor: `/* ---- start ---- */`

#### Functions

- signature: `function stopWorker()` (no parameters, no return value)
  - purpose: Pause the worker tick loop and clear bridge-side fire state so no stale data is read on resume.
  - logic:
    1. Check `if (!workerReady || !worker) return;` (no-op if fallback mode or not initialized)
    2. Call `worker.postMessage({type: 'stop'});` to halt the setTimeout tick loop in the worker
    3. Call `worker.postMessage({type: 'setStimulusState', indices: null, intensities: null});` to clear sustained stimulation
    4. Set `latestFireState = null;` (bridge-private variable)
    5. Set `BRAIN.latestFireState = null;` (public reference used by neuro-renderer.js)
  - calls: worker.postMessage (twice)
  - returns: nothing
  - error handling: early return guard handles fallback mode

- signature: `function startWorker()` (no parameters, no return value)
  - purpose: Reset worker neural state and restart the tick loop so simulation resumes from a clean slate.
  - logic:
    1. Check `if (!workerReady || !worker) return;` (no-op if fallback mode or not initialized)
    2. Call `worker.postMessage({type: 'reset'});` to zero all neural state in the worker
    3. Call `worker.postMessage({type: 'start'});` to restart the setTimeout tick loop
  - calls: worker.postMessage (twice)
  - returns: nothing
  - error handling: early return guard handles fallback mode

#### Wiring / Integration
- After defining `stopWorker` and `startWorker` (both inside the IIFE), expose them on the BRAIN global:
  - Add `BRAIN.stopWorker = stopWorker;`
  - Add `BRAIN.startWorker = startWorker;`
- Place these two function definitions and the two BRAIN assignments immediately before the existing `initBridge();` call (line 397). The exact insertion point is just before the line `/* ---- start ---- */` (line 395). Put the functions between the `aggregateFireState` closing brace (line 393) and the `/* ---- start ---- */` comment.

The resulting code block to insert after line 393 (`}`) and before line 395 (`/* ---- start ---- */`):

```javascript
	/* ---- pause / resume API for visibilitychange ---- */

	function stopWorker() {
		if (!workerReady || !worker) return;
		worker.postMessage({type: 'stop'});
		worker.postMessage({type: 'setStimulusState', indices: null, intensities: null});
		latestFireState = null;
		BRAIN.latestFireState = null;
	}

	function startWorker() {
		if (!workerReady || !worker) return;
		worker.postMessage({type: 'reset'});
		worker.postMessage({type: 'start'});
	}

	BRAIN.stopWorker = stopWorker;
	BRAIN.startWorker = startWorker;
```

### 3. MODIFY js/main.js
- operation: MODIFY
- reason: Call BRAIN.stopWorker() on tab hide and BRAIN.startWorker() on tab show so the worker's setTimeout tick loop is paused/reset alongside the existing setInterval cleanup.
- anchor: `clearInterval(brainTickId);`

#### Wiring / Integration

**Change 1 — On hide (inside `if (document.hidden) {` block):**
- After the line `brainTickId = null;` (line 539), add:
  ```javascript
  		// Stop the sim-worker tick loop and clear stale neural state
  		BRAIN.stopWorker();
  ```

**Change 2 — On show (inside the `else` block, just before restarting the brain tick):**
- Immediately before the line `brainTickId = setInterval(updateBrain, 500);` (line 601), add:
  ```javascript
  		// Restart the sim-worker with a clean neural state
  		BRAIN.startWorker();
  ```

The placement must be:
- `BRAIN.stopWorker()` goes right after `brainTickId = null;` (line 539) and before the drive snapshot block.
- `BRAIN.startWorker()` goes right before `brainTickId = setInterval(updateBrain, 500);` (line 601) and after the `lastTime = -1;` line (line 598).

## Verification
- build: No build step. Open `index.html` in a browser.
- lint: No linter configured for this project.
- test: No existing test suite.
- smoke:
  1. Open the app in Chrome. Let the fly simulation run for 5-10 seconds so neural activity is established.
  2. Switch to another tab for 10+ seconds.
  3. Switch back. Verify: no burst of anomalous activity (no sudden behavior cascade, no maxed-out drives, no jarring state change). The fly should resume calmly from idle/current behavior.
  4. Open DevTools console. Verify no errors related to worker messages.
  5. After resuming, verify the connectome subtitle updates with tick stats within a few seconds (proves worker restarted).
  6. Open DevTools console and verify `typeof BRAIN.stopWorker === 'function'` and `typeof BRAIN.startWorker === 'function'`.

## Constraints
- Do NOT modify SPEC.md, CLAUDE.md, or TASKS.md.
- Do NOT add any new files.
- Do NOT add any new npm/yarn dependencies.
- Do NOT change the worker's tick rate, leak rate, threshold, or any simulation parameters.
- Do NOT change the binary format or connectome loading logic.
- The `stopWorker()`/`startWorker()` functions must be no-ops (not throw) when the worker is not ready or in fallback mode.
- Keep changes minimal: only the three files listed above.
