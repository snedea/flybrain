# Plan: D67.1

## Dependencies
- list: none
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/brain-worker-bridge.js
- operation: MODIFY
- reason: Fix nociception stimulus overwrite (send NOCI as one-shot `stimulate` message instead of sustained `setStimulusState`) and fix drive-motor timing mismatch (throttle updateDrives to only run when motor pipeline runs, with batched catch-up for missed frames)

#### Change A: Add pendingDriveFrames state variable
- anchor: `var pendingWorkerTicks = 0;` (line 86)
- After this line, add a new variable declaration:
```js
	var pendingDriveFrames = 0;  // brain ticks since last updateDrives (for batched catch-up)
```

#### Change B: Add collectOneShotSegments function
- anchor: `function collectStimulationSegments() {` (line 404)
- Insert the following NEW function BEFORE `collectStimulationSegments`:
```js
	function collectOneShotSegments() {
		var segs = [];
		if (BRAIN.stimulate.nociception) {
			segs.push({name: 'NOCI', intensity: STIM_INTENSITY * 5});
			BRAIN.stimulate.nociception = false;
		}
		return segs;
	}
```

#### Change C: Remove NOCI block from collectStimulationSegments
- anchor: lines 459-462, the block:
```js
		if (BRAIN.stimulate.nociception) {
			segs.push({name: 'NOCI', intensity: STIM_INTENSITY * 5});
			BRAIN.stimulate.nociception = false;
		}
```
- Delete these 4 lines entirely. Do not replace them with anything.

#### Change D: Add sendOneShotStimuli function
- anchor: `function sendStimulation() {` (line 479)
- Insert the following NEW function BEFORE `sendStimulation`:
```js
	function sendOneShotStimuli() {
		var segs = collectOneShotSegments();
		if (!worker || segs.length === 0) return;
		for (var s = 0; s < segs.length; s++) {
			var gid = groupNameToId[segs[s].name];
			if (gid === undefined) continue;
			var idx = groupIndices[gid];
			if (!idx || idx.length === 0) continue;
			var intensities = new Float32Array(idx.length);
			for (var k = 0; k < idx.length; k++) {
				intensities[k] = segs[s].intensity;
			}
			worker.postMessage({type: 'stimulate', indices: idx, intensities: intensities});
		}
	}
```

#### Change E: Restructure workerUpdate function
- anchor: the entire `function workerUpdate()` body (lines 360-400)
- Replace the function body (everything between the opening `{` and closing `}` of workerUpdate) with:
```js
		pendingDriveFrames = Math.min(pendingDriveFrames + 1, 20);

		// One-shot stimuli (e.g. NOCI pain) are sent immediately via the worker
		// 'stimulate' message for direct V injection, not gated on worker ticks.
		// This prevents overwrite by subsequent setStimulusState replacements.
		sendOneShotStimuli();

		// Only run the full pipeline when new worker tick data is available.
		// updateDrives and sendStimulation are throttled to match motor pipeline
		// frequency, preventing drive decay from attenuating transient signals
		// (e.g. fear spikes) before the motor pipeline processes them.
		if (latestFireState || pendingWorkerTicks > 0) {
			// Batch-run drive updates for all elapsed frames since last pipeline run.
			// Calling updateDrives N times preserves per-frame accumulation/decay
			// rates (e.g. fear *= 0.85 runs N times giving 0.85^N total decay).
			for (var i = 0; i < pendingDriveFrames; i++) {
				BRAIN.updateDrives();
			}
			pendingDriveFrames = 0;

			// Send sustained stimulation state to worker
			sendStimulation();

			// Aggregate worker spikes into BRAIN.postSynaptic
			aggregateFireState();

			// Virtual group bypass: groups with 0 real neurons
			var vd = BRAIN.drives;
			if (BRAIN.postSynaptic['DRIVE_FEAR'])
				BRAIN.postSynaptic['DRIVE_FEAR'][BRAIN.nextState] = vd.fear * FIRE_STATE_SCALE;
			if (BRAIN.postSynaptic['DRIVE_CURIOSITY'])
				BRAIN.postSynaptic['DRIVE_CURIOSITY'][BRAIN.nextState] = vd.curiosity * FIRE_STATE_SCALE;
			if (BRAIN.postSynaptic['DRIVE_GROOM'])
				BRAIN.postSynaptic['DRIVE_GROOM'][BRAIN.nextState] = vd.groom * FIRE_STATE_SCALE;

			// Synthesize VNC motor outputs from descending neuron activity
			synthesizeMotorOutputs();

			// Motor control
			BRAIN.motorcontrol();

			// State swap
			for (var ps in BRAIN.postSynaptic) {
				BRAIN.postSynaptic[ps][BRAIN.thisState] =
					BRAIN.postSynaptic[ps][BRAIN.nextState];
			}
			var temp = BRAIN.thisState;
			BRAIN.thisState = BRAIN.nextState;
			BRAIN.nextState = temp;
		}
```

#### Change F: Reset pendingDriveFrames in stopWorker
- anchor: `BRAIN.latestFireState = null;` inside `function stopWorker()` (last line of stopWorker body, line 563)
- After `BRAIN.latestFireState = null;`, add:
```js
		pendingDriveFrames = 0;
```

#### Change G: Reset pendingDriveFrames in startWorker
- anchor: `pendingWorkerTicks = 0;` inside `function startWorker()` (line 570)
- After `pendingWorkerTicks = 0;`, add:
```js
		pendingDriveFrames = 0;
```

#### Change H: Add collectOneShotSegments to BRAIN._bridge test exports
- anchor: `collectStimulationSegments: collectStimulationSegments,` (line 584)
- After this line, add:
```js
			collectOneShotSegments: collectOneShotSegments,
```

#### Change I: Reset pendingDriveFrames in _setGroupState
- anchor: `pendingWorkerTicks = 0;` inside `_setGroupState` function (line 600)
- After `pendingWorkerTicks = 0;`, add:
```js
				pendingDriveFrames = 0;
```

### 2. MODIFY tests/tests.js
- operation: MODIFY
- reason: Update NOCI test to use collectOneShotSegments (since NOCI is no longer in sustained segments), add test verifying NOCI is absent from sustained segments, add test verifying drive throttling behavior

#### Change A: Update test_bridge_stim_noci_intensity_and_clear
- anchor: `var test_bridge_stim_noci_intensity_and_clear = function () {` (line 1066)
- Replace the entire function (lines 1066-1088) with:
```js
var test_bridge_stim_noci_intensity_and_clear = function () {
	resetBrainState();
	BRAIN.stimulate.nociception = true;

	var segs = BRAIN._bridge.collectOneShotSegments();

	// Find NOCI segment
	var nociSeg = null;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'NOCI') { nociSeg = segs[i]; break; }
	}
	assertTrue(nociSeg !== null, 'nociception maps to NOCI one-shot segment');
	var SI = BRAIN._bridge.STIM_INTENSITY;
	assertClose(nociSeg.intensity, SI * 5, 0.001, 'NOCI intensity is 5x STIM_INTENSITY');
	assertEqual(BRAIN.stimulate.nociception, false, 'nociception auto-clears after collection');
};
```

#### Change B: Add test_bridge_stim_noci_not_in_sustained
- anchor: the closing `};` of `test_bridge_stim_noci_intensity_and_clear` (after the replacement above)
- Insert the following new test AFTER `test_bridge_stim_noci_intensity_and_clear`:
```js

var test_bridge_stim_noci_not_in_sustained = function () {
	resetBrainState();
	BRAIN.stimulate.nociception = true;
	BRAIN.stimulate.touch = false;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.temperature = 0.5;
	BRAIN._isMoving = false;

	var segs = BRAIN._bridge.collectStimulationSegments();

	for (var i = 0; i < segs.length; i++) {
		assertTrue(segs[i].name !== 'NOCI',
			'NOCI must not appear in sustained segments (found at index ' + i + ')');
	}
	// nociception flag should NOT be cleared by collectStimulationSegments
	// (it is only cleared by collectOneShotSegments)
	assertTrue(BRAIN.stimulate.nociception === true,
		'collectStimulationSegments does not clear nociception flag');
};
```

#### Change C: Add test_bridge_workerUpdate_drives_throttled
- anchor: `} // end bridge tests guard` (line 1145)
- Insert the following new test BEFORE the closing `}`:
```js

var test_bridge_workerUpdate_drives_throttled = function () {
	resetBrainState();
	withMockedRandom(0.5, function () {
		BRAIN._bridge._setGroupState(1, 0, new Uint16Array(0), [0], ['DRIVE_FEAR']);
		// No fire state — guard will be false
		BRAIN.drives.fear = 0.5;
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.wind = false;
		BRAIN.stimulate.dangerOdor = false;
		BRAIN._isFeeding = false;
		BRAIN._isMoving = false;
		BRAIN._isGrooming = false;

		// Call workerUpdate with guard false (no latestFireState, no pendingWorkerTicks)
		BRAIN._bridge.workerUpdate();

		// Drives should NOT have been updated (guard was false)
		assertClose(BRAIN.drives.fear, 0.5, 0.001,
			'drives not updated when no worker ticks pending');

		// Now simulate a worker tick arriving
		BRAIN._bridge._setFireState(new Uint8Array(0), null, 0);

		// Call workerUpdate again — guard true, should batch-update drives for 2 frames
		BRAIN._bridge.workerUpdate();
	});

	// updateDrives called twice (1 pending + 1 current): fear = 0.5 * 0.85^2
	assertClose(BRAIN.drives.fear, 0.5 * 0.85 * 0.85, 0.01,
		'drives batch-updated for accumulated frames when guard becomes true');
};
```

## Verification
- build: no build step (vanilla JS, no bundler)
- lint: no linter configured
- test: `node tests/run-node.js`
- smoke: Open the app in a browser. Click the touch tool and click on the fly. Observe that (1) the fly shows a startle/flight response (NOCI reaching DN_STARTLE via the one-shot stimulate message), and (2) the startle response is not weaker than expected (drives and motor pipeline are synchronized). Check the browser console for no errors.

## Constraints
- Do NOT modify js/sim-worker.js — the existing `stimulate` message handler is already correct
- Do NOT modify js/connectome.js — BRAIN.updateDrives remains unchanged; rate compensation is handled by batched calling in workerUpdate
- Do NOT modify js/main.js — the setInterval(updateBrain, 500) tick rate stays the same
- Do NOT modify SPEC.md, TASKS.md, or any files in .buildloop/ other than current-plan.md
- Do NOT add new files — all changes are in existing files
- Do NOT add npm dependencies or a build step
- The cap on pendingDriveFrames (20) must be a literal in the Math.min call, not a named constant — keep it minimal per project conventions (ES5 IIFE, no unnecessary abstraction)
