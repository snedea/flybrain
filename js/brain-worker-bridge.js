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
