# Plan: T7.4

## Dependencies
- list: [] (no new packages)
- commands: [] (no install commands)

## File Operations (in execution order)

### 1. MODIFY js/sim-worker.js
- operation: MODIFY
- reason: Add groupId to ready message and add sustained stimulation support so main thread can set persistent stimulation state applied every tick

#### Change 1: Include groupId in ready message
- anchor: `self.postMessage({type: 'ready', neuronCount: N, edgeCount: edgeCount});`

Replace both occurrences of `postReady()` definition (inside `case 'init':`) with:
```js
function postReady() {
    self.postMessage({type: 'ready', neuronCount: N, edgeCount: edgeCount, groupId: groupId});
}
```
(groupId is already a Uint16Array populated by parseBinary — just add it to the message)

#### Change 2: Add sustained stimulation state variables
- anchor: `var running = false;`

Add immediately after `var running = false;`:
```js
var sustainedIndices = null;
var sustainedIntensities = null;
```

#### Change 3: Apply sustained stimulation in tick()
- anchor: `/* step 2 — propagate from fired neurons */`

Insert the following block BEFORE the `/* step 2 */` comment (between step 1 decay and step 2 propagation):
```js
	/* step 1.5 — apply sustained external stimulation */
	if (sustainedIndices) {
		for (var k = 0; k < sustainedIndices.length; k++) {
			var si = sustainedIndices[k];
			if (si < N && refractory[si] === 0) {
				V[si] += sustainedIntensities[k];
			}
		}
	}
```

#### Change 4: Add setStimulusState message handler
- anchor: `case 'setParams':`

Insert a new case BEFORE `case 'setParams':`:
```js
	case 'setStimulusState':
		sustainedIndices = e.data.indices;
		sustainedIntensities = e.data.intensities;
		break;
```

---

### 2. CREATE js/brain-worker-bridge.js
- operation: CREATE
- reason: Bridge between main thread stimulation/behavior logic and the LIF Web Worker, replacing BRAIN.update() with worker communication and providing fallback to legacy 59-group simulation

#### Full file content:

```js
/* brain-worker-bridge.js — T7.4
 *
 * Bridges the main-thread behavioral layer (connectome.js, fly-logic.js, main.js)
 * to the LIF Web Worker (sim-worker.js). Loads the full connectome binary,
 * initializes the worker, translates BRAIN.stimulate/drives to worker messages,
 * and aggregates worker fire states back into BRAIN.postSynaptic format.
 *
 * Loaded after connectome.js, before fly-logic.js and main.js.
 * Falls back to legacy BRAIN.update() if connectome.bin.gz fails to load.
 */

(function () {
	'use strict';

	/* ---- constants (tunable, may need adjustment in T7.7) ---- */

	// Intensity applied per worker tick for sustained stimulation.
	// With leak=0.95 and threshold=1.0, V_steady = intensity / (1 - leak).
	// At 0.15: V_steady = 3.0 → fires after ~8 ticks.
	var STIM_INTENSITY = 0.15;

	// Scale factor mapping (fired_fraction_per_group) to BRAIN.postSynaptic values.
	// The behavioral state machine reads accumulators derived from postSynaptic.
	// Motor neuron values of ~5-30 are needed to exceed behavior thresholds.
	var FIRE_STATE_SCALE = 100;

	/* ---- saved legacy reference ---- */

	var legacyUpdate = BRAIN.update;

	/* ---- module state ---- */

	var worker = null;
	var workerReady = false;
	var latestFireState = null;
	var neuronCount = 0;
	var groupCount = 0;
	var groupIdArr = null;       // Uint16Array[neuronCount] from worker
	var groupIndices = null;     // Array of Uint32Array per group_id
	var groupSizes = null;       // Array[groupCount] of int from neuron_meta.json
	var groupNameToId = {};      // e.g. {'VIS_R1R6': 0, ...}
	var groupIdToName = [];      // e.g. [0: 'VIS_R1R6', ...]

	/* ---- initialization ---- */

	function initBridge() {
		var metaUrl = 'data/neuron_meta.json';
		var binUrl = 'data/connectome.bin.gz';

		fetch(metaUrl)
			.then(function (res) {
				if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + metaUrl);
				return res.json();
			})
			.then(function (meta) {
				groupCount = meta.group_count;
				groupSizes = meta.group_sizes;
				for (var i = 0; i < meta.groups.length; i++) {
					var g = meta.groups[i];
					groupNameToId[g.name] = g.id;
					groupIdToName[g.id] = g.name;
				}
				return fetch(binUrl);
			})
			.then(function (res) {
				if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + binUrl);
				return res.arrayBuffer();
			})
			.then(function (buffer) {
				worker = new Worker('js/sim-worker.js');
				worker.onmessage = handleWorkerMessage;
				worker.onerror = handleWorkerError;
				worker.postMessage({type: 'init', buffer: buffer}, [buffer]);
			})
			.catch(function (err) {
				console.warn('connectome.bin.gz load failed, using 59-group BRAIN.update():', err);
				BRAIN.update = legacyUpdate;
			});
	}

	/* ---- worker message handling ---- */

	function handleWorkerMessage(e) {
		switch (e.data.type) {
		case 'ready':
			neuronCount = e.data.neuronCount;
			groupIdArr = new Uint16Array(e.data.groupId.buffer
				? e.data.groupId.buffer : e.data.groupId);
			buildGroupIndices();
			workerReady = true;

			// Reset postSynaptic to avoid stale legacy values
			for (var ps in BRAIN.postSynaptic) {
				BRAIN.postSynaptic[ps][0] = 0;
				BRAIN.postSynaptic[ps][1] = 0;
			}

			// Switch to worker-driven update
			BRAIN.update = workerUpdate;
			worker.postMessage({type: 'start'});
			console.log('Connectome worker ready: ' + neuronCount + ' neurons, ' +
				e.data.edgeCount + ' edges');
			break;

		case 'tick':
			latestFireState = e.data.fireState;
			break;

		case 'error':
			console.warn('Worker error: ' + e.data.message);
			if (workerReady) {
				console.warn('Falling back to 59-group BRAIN.update()');
				workerReady = false;
				BRAIN.update = legacyUpdate;
			}
			break;
		}
	}

	function handleWorkerError(err) {
		console.warn('Worker crashed, falling back to 59-group BRAIN.update():', err.message || err);
		workerReady = false;
		BRAIN.update = legacyUpdate;
	}

	/* ---- build group-to-neuron-indices lookup ---- */

	function buildGroupIndices() {
		// Count neurons per group
		var counts = new Uint32Array(groupCount);
		for (var i = 0; i < neuronCount; i++) {
			counts[groupIdArr[i]]++;
		}
		// Allocate typed arrays per group
		groupIndices = new Array(groupCount);
		for (var g = 0; g < groupCount; g++) {
			groupIndices[g] = new Uint32Array(counts[g]);
			counts[g] = 0; // reuse as write offset
		}
		// Fill indices
		for (var i = 0; i < neuronCount; i++) {
			var gid = groupIdArr[i];
			groupIndices[gid][counts[gid]++] = i;
		}
	}

	/* ---- worker-driven BRAIN.update replacement ---- */

	function workerUpdate() {
		// 1. Update drives (same logic as legacy, runs on main thread)
		BRAIN.updateDrives();

		// 2. Build and send sustained stimulation state to worker
		sendStimulation();

		// 3. Aggregate latest fire state into BRAIN.postSynaptic
		if (latestFireState) {
			aggregateFireState();

			// 4. Motor control (reads postSynaptic[nextState], sets accumulators)
			BRAIN.motorcontrol();

			// 5. State swap (same as BRAIN.runconnectome lines 413-421)
			for (var ps in BRAIN.postSynaptic) {
				BRAIN.postSynaptic[ps][BRAIN.thisState] =
					BRAIN.postSynaptic[ps][BRAIN.nextState];
			}
			var temp = BRAIN.thisState;
			BRAIN.thisState = BRAIN.nextState;
			BRAIN.nextState = temp;
		}
	}

	/* ---- translate BRAIN.stimulate + BRAIN.drives to worker stimulation ---- */

	function sendStimulation() {
		// Collect all stimulation segments, then build one batched message
		var totalLen = 0;
		var segments = []; // {indices: Uint32Array, intensity: number}

		function addGroup(groupName, intensity) {
			var gid = groupNameToId[groupName];
			if (gid === undefined) return;
			var idx = groupIndices[gid];
			if (!idx || idx.length === 0) return;
			segments.push({indices: idx, intensity: intensity});
			totalLen += idx.length;
		}

		var d = BRAIN.drives;

		// --- Drive stimulation ---
		if (d.hunger > 0.2) {
			var pulses = d.hunger > 0.6 ? 3 : (d.hunger > 0.4 ? 2 : 1);
			addGroup('DRIVE_HUNGER', STIM_INTENSITY * d.hunger * pulses);
		}
		if (d.fear > 0.05) {
			var pulses = d.fear > 0.5 ? 3 : (d.fear > 0.2 ? 2 : 1);
			addGroup('DRIVE_FEAR', STIM_INTENSITY * d.fear * pulses);
		}
		if (d.fatigue > 0.3) {
			addGroup('DRIVE_FATIGUE', STIM_INTENSITY * d.fatigue);
		}
		if (d.curiosity > 0.2) {
			var pulses = d.curiosity > 0.5 ? 2 : 1;
			addGroup('DRIVE_CURIOSITY', STIM_INTENSITY * d.curiosity * pulses);
		}
		if (d.groom > 0.3) {
			addGroup('DRIVE_GROOM', STIM_INTENSITY * d.groom);
		}

		// --- Sensory stimulation ---
		if (BRAIN.stimulate.touch) {
			addGroup('MECH_BRISTLE', STIM_INTENSITY);
			if (BRAIN.stimulate.touchLocation === 'head' ||
				BRAIN.stimulate.touchLocation === 'thorax') {
				addGroup('MECH_BRISTLE', STIM_INTENSITY); // double dose
			}
		}
		if (BRAIN.stimulate.foodNearby) {
			addGroup('OLF_ORN_FOOD', STIM_INTENSITY);
		}
		if (BRAIN.stimulate.foodContact) {
			addGroup('GUS_GRN_SWEET', STIM_INTENSITY);
		}
		if (BRAIN.stimulate.dangerOdor) {
			addGroup('OLF_ORN_DANGER', STIM_INTENSITY);
		}
		if (BRAIN.stimulate.wind) {
			addGroup('MECH_JO', STIM_INTENSITY * BRAIN.stimulate.windStrength);
		}
		if (BRAIN.stimulate.lightLevel > 0.2) {
			addGroup('VIS_R1R6', STIM_INTENSITY * BRAIN.stimulate.lightLevel);
			addGroup('VIS_R7R8', STIM_INTENSITY * BRAIN.stimulate.lightLevel * 0.7);
		}
		if (BRAIN.stimulate.temperature > 0.65) {
			var warmIntensity = (BRAIN.stimulate.temperature - 0.5) * 2;
			addGroup('THERMO_WARM', STIM_INTENSITY * warmIntensity);
		} else if (BRAIN.stimulate.temperature < 0.35) {
			var coolIntensity = (0.5 - BRAIN.stimulate.temperature) * 2;
			addGroup('THERMO_COOL', STIM_INTENSITY * coolIntensity);
		}
		if (BRAIN.stimulate.nociception) {
			addGroup('NOCI', STIM_INTENSITY);
			BRAIN.stimulate.nociception = false; // single-tick, auto-clear
		}
		if (BRAIN._isMoving) {
			addGroup('MECH_CHORD', STIM_INTENSITY);
		}
		if (BRAIN.stimulate.lightLevel > 0.1 && BRAIN._isMoving) {
			addGroup('VIS_LPTC', STIM_INTENSITY * 0.3);
		}

		// --- Tonic background activity ---
		var tonicIntensity = BRAIN.stimulate.lightLevel === 0 ? 0.03 : 0.06;
		addGroup('CX_FC', tonicIntensity);
		addGroup('CX_EPG', tonicIntensity);
		addGroup('CX_PFN', tonicIntensity);

		// --- Build batched message ---
		if (totalLen === 0) {
			worker.postMessage({type: 'setStimulusState', indices: null, intensities: null});
			return;
		}

		var allIndices = new Uint32Array(totalLen);
		var allIntensities = new Float32Array(totalLen);
		var offset = 0;
		for (var s = 0; s < segments.length; s++) {
			var seg = segments[s];
			allIndices.set(seg.indices, offset);
			for (var k = 0; k < seg.indices.length; k++) {
				allIntensities[offset + k] = seg.intensity;
			}
			offset += seg.indices.length;
		}

		worker.postMessage({type: 'setStimulusState', indices: allIndices, intensities: allIntensities});
	}

	/* ---- aggregate fire state into BRAIN.postSynaptic ---- */

	function aggregateFireState() {
		var fire = latestFireState;

		// Sum fired neurons per group
		var groupFires = new Float32Array(groupCount);
		for (var i = 0; i < neuronCount; i++) {
			if (fire[i]) {
				groupFires[groupIdArr[i]]++;
			}
		}

		// Normalize by group size, scale, and write to BRAIN.postSynaptic[nextState]
		for (var g = 0; g < groupCount; g++) {
			var name = groupIdToName[g];
			if (!name || !BRAIN.postSynaptic[name]) continue;
			var size = groupSizes[g];
			var activation = size > 0 ? (groupFires[g] / size) * FIRE_STATE_SCALE : 0;
			BRAIN.postSynaptic[name][BRAIN.nextState] = activation;
		}
	}

	/* ---- start ---- */

	initBridge();

})();
```

#### Imports / Dependencies
- Depends on `BRAIN` global from connectome.js (must be loaded after connectome.js)
- Depends on `data/neuron_meta.json` (output of scripts/build_connectome.py)
- Depends on `data/connectome.bin.gz` (output of scripts/build_connectome.py)
- Depends on `js/sim-worker.js` (created in T7.3)

#### Functions

- signature: `function initBridge()`
  - purpose: Fetch neuron_meta.json and connectome.bin.gz, create worker, send binary to worker
  - logic:
    1. Fetch `data/neuron_meta.json`, parse JSON
    2. Store `groupCount`, `groupSizes`, build `groupNameToId` and `groupIdToName` from `meta.groups`
    3. Fetch `data/connectome.bin.gz`, get ArrayBuffer
    4. Create `new Worker('js/sim-worker.js')`
    5. Set `worker.onmessage = handleWorkerMessage` and `worker.onerror = handleWorkerError`
    6. Send `{type: 'init', buffer: buffer}` to worker with buffer as transferable
    7. On any error in the promise chain: `console.warn(...)`, set `BRAIN.update = legacyUpdate`
  - calls: `handleWorkerMessage`, `handleWorkerError`
  - returns: void (async, no return)
  - error handling: catch block logs warning and falls back to legacyUpdate

- signature: `function handleWorkerMessage(e)`
  - purpose: Handle messages from the LIF worker (ready, tick, error)
  - logic:
    1. If `e.data.type === 'ready'`: store neuronCount, groupIdArr (Uint16Array from e.data.groupId), call `buildGroupIndices()`, set `workerReady = true`, zero all BRAIN.postSynaptic entries, set `BRAIN.update = workerUpdate`, send `{type: 'start'}` to worker, log to console
    2. If `e.data.type === 'tick'`: store `e.data.fireState` in `latestFireState`
    3. If `e.data.type === 'error'`: console.warn, if workerReady was true then set `workerReady = false` and `BRAIN.update = legacyUpdate`
  - calls: `buildGroupIndices` (on ready)
  - returns: void
  - error handling: error type falls back to legacyUpdate

- signature: `function handleWorkerError(err)`
  - purpose: Handle worker crash/script-load failure
  - logic:
    1. console.warn with error message
    2. Set `workerReady = false`
    3. Set `BRAIN.update = legacyUpdate`
  - returns: void

- signature: `function buildGroupIndices()`
  - purpose: Build per-group arrays of neuron indices for stimulation targeting
  - logic:
    1. Allocate `counts = new Uint32Array(groupCount)`, iterate neuronCount to count neurons per group
    2. Allocate `groupIndices = new Array(groupCount)`, for each group g create `new Uint32Array(counts[g])`, reset counts[g] to 0
    3. Iterate neuronCount again, for each neuron i: `groupIndices[groupIdArr[i]][counts[groupIdArr[i]]++] = i`
  - returns: void (writes to module-level `groupIndices`)

- signature: `function workerUpdate()`
  - purpose: Replace BRAIN.update() — runs drives, sends stimulation, aggregates fire state, runs motor control
  - logic:
    1. Call `BRAIN.updateDrives()`
    2. Call `sendStimulation()`
    3. If `latestFireState` is not null:
       a. Call `aggregateFireState()` (writes to `BRAIN.postSynaptic[name][BRAIN.nextState]`)
       b. Call `BRAIN.motorcontrol()` (reads motor neurons from nextState, sets accumulators)
       c. State swap: for each ps in BRAIN.postSynaptic, copy nextState to thisState; then swap `BRAIN.thisState` and `BRAIN.nextState`
  - calls: `BRAIN.updateDrives`, `sendStimulation`, `aggregateFireState`, `BRAIN.motorcontrol`
  - returns: void

- signature: `function sendStimulation()`
  - purpose: Translate BRAIN.stimulate flags and BRAIN.drives values to a batched worker setStimulusState message
  - logic:
    1. Initialize `totalLen = 0`, `segments = []`
    2. Define inner `addGroup(groupName, intensity)`: look up groupNameToId, get groupIndices, push segment, add to totalLen
    3. Translate drives: check each drive threshold and compute intensity = STIM_INTENSITY * driveValue * pulseCount (exact conditions replicate BRAIN.update lines 279-302)
    4. Translate sensory: check each BRAIN.stimulate flag and add corresponding group with appropriate intensity (exact conditions replicate BRAIN.update lines 307-371)
    5. Translate tonic: add CX_FC, CX_EPG, CX_PFN with tonic intensity (0.03 if dark, 0.06 otherwise)
    6. If totalLen is 0: send `{type: 'setStimulusState', indices: null, intensities: null}`, return
    7. Build `allIndices = new Uint32Array(totalLen)` and `allIntensities = new Float32Array(totalLen)` by iterating segments
    8. Send `{type: 'setStimulusState', indices: allIndices, intensities: allIntensities}` to worker
  - calls: `worker.postMessage`
  - returns: void

- signature: `function aggregateFireState()`
  - purpose: Aggregate per-neuron fire state from worker into per-group BRAIN.postSynaptic values
  - logic:
    1. Allocate `groupFires = new Float32Array(groupCount)`
    2. Iterate all neuronCount neurons: if `latestFireState[i]` is truthy, increment `groupFires[groupIdArr[i]]`
    3. For each group g (0 to groupCount-1): look up `name = groupIdToName[g]`, if name exists and BRAIN.postSynaptic[name] exists, compute `activation = (groupFires[g] / groupSizes[g]) * FIRE_STATE_SCALE`, write to `BRAIN.postSynaptic[name][BRAIN.nextState]`
  - returns: void (writes to BRAIN.postSynaptic)

#### Wiring / Integration
- Loaded as a script tag after connectome.js, before fly-logic.js
- IIFE runs synchronously: saves `legacyUpdate = BRAIN.update`, then starts async `initBridge()`
- During async loading, BRAIN.update remains legacyUpdate (old behavior works)
- On worker ready: BRAIN.update is replaced with workerUpdate
- On any failure: BRAIN.update is restored to legacyUpdate with console.warn
- The rest of main.js (updateBrain, updateBehaviorState, computeMovementForBehavior, dot visualization, drive meters) works unchanged because:
  - `BRAIN.postSynaptic[name][BRAIN.thisState]` contains aggregated fire state values
  - `BRAIN.accumWalkLeft/Right/Flight/Feed/Groom/Startle/Head` are set by `BRAIN.motorcontrol()`
  - `BRAIN.accumleft/accumright` are set by `BRAIN.motorcontrol()`
  - `BRAIN.drives.*` are updated by `BRAIN.updateDrives()`
  - `BRAIN.stimulate.*` flags are read by sendStimulation and also by updateBehaviorState (unchanged)

---

### 3. MODIFY index.html
- operation: MODIFY
- reason: Add brain-worker-bridge.js script tag so the bridge loads after connectome.js and before fly-logic.js
- anchor: `<script type="text/javascript" src="./js/connectome.js"></script>`

#### Change
Insert a new script tag immediately after the connectome.js script tag:
```html
    <script type="text/javascript" src="./js/brain-worker-bridge.js"></script>
```

The resulting script order will be:
```
    <script type="text/javascript" src="./js/constants.js"></script>
    <script type="text/javascript" src="./js/connectome.js"></script>
    <script type="text/javascript" src="./js/brain-worker-bridge.js"></script>
    <script type="text/javascript" src="./js/fly-logic.js"></script>
    <script type="text/javascript" src="./js/brain3d.js"></script>
    <script type="text/javascript" src="./js/education.js"></script>
    <script type="text/javascript" src="./js/main.js"></script>
```

---

## Verification
- build: No build step (vanilla JS project, no bundler)
- lint: No linter configured
- test: `node tests/run-node.js` (existing test runner; tests exercise fly-logic.js pure functions, not the worker bridge — they should still pass since the bridge only replaces BRAIN.update at runtime in a browser context)
- smoke: Open `index.html` in a browser with DevTools console. Verify one of:
  - If `data/connectome.bin.gz` and `data/neuron_meta.json` exist: console shows "Connectome worker ready: 139255 neurons, NNNN edges". The fly should respond to stimuli (feed, touch, air tools). The connectome dot visualization should show activity.
  - If data files do NOT exist: console shows "connectome.bin.gz load failed, using 59-group BRAIN.update(): Error: HTTP 404 fetching data/neuron_meta.json". The fly behaves exactly as before (legacy 59-group simulation).

## Constraints
- Do NOT modify js/connectome.js (the bridge saves and replaces BRAIN.update externally)
- Do NOT modify js/main.js (the bridge is transparent to the updateBrain loop)
- Do NOT modify js/fly-logic.js (behavioral state machine is unchanged)
- Do NOT modify js/constants.js
- Do NOT add any npm or external dependencies
- Do NOT create data files (connectome.bin.gz and neuron_meta.json are output of scripts/build_connectome.py from T7.1, which requires FlyWire CSV data)
- The STIM_INTENSITY (0.15) and FIRE_STATE_SCALE (100) constants are initial values that may need tuning in T7.7; do not spend time calibrating them
- The `setStimulusState` worker message replaces per-tick `stimulate` for sustained stimulation; keep the existing one-shot `stimulate` handler in sim-worker.js (do not remove it)
- The compatibility shim (fallback to legacy BRAIN.update) must work when data files are absent — this is the primary expected state until users run the preprocessing pipeline
