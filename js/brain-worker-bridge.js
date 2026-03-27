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

	/* ---- binary fetch with progress ---- */

	function fetchBinaryWithProgress(url, onProgress) {
		return new Promise(function (resolve, reject) {
			var xhr = new XMLHttpRequest();
			xhr.open('GET', url, true);
			xhr.responseType = 'arraybuffer';
			xhr.onprogress = function (e) {
				if (e.lengthComputable) {
					onProgress(e.loaded, e.total);
				} else {
					onProgress(e.loaded, 0);
				}
			};
			xhr.onload = function () {
				if (xhr.status >= 200 && xhr.status < 300) {
					resolve(xhr.response);
				} else {
					reject(new Error('HTTP ' + xhr.status + ' fetching ' + url));
				}
			};
			xhr.onerror = function () {
				reject(new Error('Network error fetching ' + url));
			};
			xhr.send();
		});
	}

	function updateLoadingProgress(loaded, total) {
		var subtitle = document.getElementById('connectomeSubtitle');
		if (!subtitle) return;
		var loadedMB = (loaded / (1024 * 1024)).toFixed(1);
		if (total > 0) {
			var totalMB = (total / (1024 * 1024)).toFixed(1);
			subtitle.textContent = 'Loading connectome... ' + loadedMB + ' / ' + totalMB + ' MB';
		} else {
			subtitle.textContent = 'Loading connectome... ' + loadedMB + ' MB';
		}
		subtitle.classList.add('loading');
	}

	/* ---- saved legacy reference ---- */

	var legacyUpdate = BRAIN.update;

	/* ---- module state ---- */

	var worker = null;
	var workerReady = false;
	var latestFireState = null;
	var neuronCount = 0;
	var groupCount = 0;
	var groupIdArr = null;       // Uint16Array[neuronCount] from worker
	var regionTypeArr = null;    // Uint8Array[neuronCount] from worker
	var groupIndices = null;     // Array of Uint32Array per group_id
	var groupSizes = null;       // Array[groupCount] of int from neuron_meta.json
	var groupNameToId = {};      // e.g. {'VIS_R1R6': 0, ...}
	var groupIdToName = [];      // e.g. [0: 'VIS_R1R6', ...]
	var pendingGroupSpikes = null; // Float32Array[groupCount] accumulated since last brain tick
	var pendingWorkerTicks = 0;

	/* ---- initialization ---- */

	function initBridge() {
		var metaUrl = 'data/neuron_meta.json';
		var binUrl = 'data/connectome.bin.gz';
		var subtitle = document.getElementById('connectomeSubtitle');
		if (subtitle) {
			subtitle.textContent = 'Loading connectome...';
			subtitle.classList.add('loading');
		}

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
				return fetchBinaryWithProgress(binUrl, updateLoadingProgress);
			})
			.then(function (buffer) {
				if (subtitle) {
					subtitle.textContent = 'Parsing connectome...';
				}
				worker = new Worker('js/sim-worker.js');
				worker.onmessage = handleWorkerMessage;
				worker.onerror = handleWorkerError;
				worker.postMessage({type: 'init', buffer: buffer}, [buffer]);
			})
			.catch(function (err) {
				console.warn('connectome.bin.gz load failed, using 59-group BRAIN.update():', err);
				BRAIN.update = legacyUpdate;
				if (subtitle) {
					subtitle.textContent = '59 neuron groups \u2014 FlyWire approximation (fallback)';
					subtitle.classList.remove('loading');
				}
			});
	}

	/* ---- worker message handling ---- */

	function handleWorkerMessage(e) {
		switch (e.data.type) {
		case 'ready':
			neuronCount = e.data.neuronCount;
			groupIdArr = new Uint16Array(e.data.groupId.buffer
				? e.data.groupId.buffer : e.data.groupId);
			regionTypeArr = new Uint8Array(e.data.regionType.buffer
				? e.data.regionType.buffer : e.data.regionType);
			pendingGroupSpikes = new Float32Array(groupCount);
			pendingWorkerTicks = 0;
			buildGroupIndices();
			workerReady = true;
			BRAIN.workerReady = true;
			BRAIN.workerNeuronCount = neuronCount;
			BRAIN.workerRegionType = regionTypeArr;
			BRAIN.workerGroupIdArr = groupIdArr;
			BRAIN.workerGroupIdToName = groupIdToName;
			BRAIN.workerGroupSizes = groupSizes;
			BRAIN.workerEdgeCount = e.data.edgeCount;

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
			// Update subtitle with actual counts
			var subtitle = document.getElementById('connectomeSubtitle');
			if (subtitle) {
				subtitle.textContent = neuronCount.toLocaleString() + ' neurons / ' +
					e.data.edgeCount.toLocaleString() + ' connections \u2014 FlyWire FAFB v783';
				subtitle.classList.remove('loading');
			}
			// Update header scale indicator
			var scaleEl = document.getElementById('scaleIndicator');
			if (scaleEl) {
				scaleEl.textContent = neuronCount.toLocaleString() + ' neurons / ' +
					e.data.edgeCount.toLocaleString() + ' connections \u2014 FlyWire FAFB v783';
				scaleEl.style.display = '';
			}
			break;

		case 'tick':
			latestFireState = e.data.fireState;
			BRAIN.latestFireState = e.data.fireState;
			BRAIN.workerFiredNeurons = e.data.firedNeurons || 0;
			if (pendingGroupSpikes && e.data.groupSpikeCounts) {
				for (var g = 0; g < groupCount; g++) {
					pendingGroupSpikes[g] += e.data.groupSpikeCounts[g] || 0;
				}
				pendingWorkerTicks++;
			}
			break;

		case 'stats':
			/* Display performance info in the connectome subtitle */
			var statsSubtitle = document.getElementById('connectomeSubtitle');
			if (statsSubtitle && !statsSubtitle.classList.contains('loading')) {
				var firedPct = Math.round((e.data.firedNeurons || 0) / e.data.totalNeurons * 100);
				var activePct = Math.round(e.data.activeNeurons / e.data.totalNeurons * 100);
				statsSubtitle.textContent = neuronCount.toLocaleString() + ' neurons (' +
					firedPct + '% firing, ' + activePct + '% active groups, ' +
					e.data.avgTickMs.toFixed(1) + 'ms/tick) \u2014 FlyWire FAFB v783';
			}
			break;

		case 'error':
			console.warn('Worker error: ' + e.data.message);
			if (workerReady) {
				console.warn('Falling back to 59-group BRAIN.update()');
				workerReady = false;
				BRAIN.workerReady = false;
				BRAIN.update = legacyUpdate;
			}
			break;
		}
	}

	function handleWorkerError(err) {
		console.warn('Worker crashed, falling back to 59-group BRAIN.update():', err.message || err);
		workerReady = false;
		BRAIN.workerReady = false;
		BRAIN.update = legacyUpdate;
		var subtitle = document.getElementById('connectomeSubtitle');
		if (subtitle) {
			subtitle.textContent = '59 neuron groups \u2014 FlyWire approximation (fallback)';
			subtitle.classList.remove('loading');
		}
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

	/* ---- virtual VNC motor layer ---- */
	// FlyWire FAFB covers the brain only. Leg and wing motor neurons live in
	// the ventral nerve cord (VNC), which is a separate dataset. Descending
	// neurons (GNG_DESC) are the brain's motor output to the VNC. This function
	// synthesizes what the VNC would produce by distributing descending neuron
	// activation across the motor groups that BRAIN.motorcontrol() reads.
	// Context from central circuits biases the distribution toward the
	// appropriate motor pattern (walk vs flight vs groom vs feed).

	var MOTOR_SCALE = 0.6; // overall gain from descending -> motor groups

	function readPS(name) {
		if (!BRAIN.postSynaptic[name]) return 0;
		return BRAIN.postSynaptic[name][BRAIN.nextState] || 0;
	}

	function addPS(name, val) {
		if (!BRAIN.postSynaptic[name]) return;
		BRAIN.postSynaptic[name][BRAIN.nextState] += val;
	}

	function synthesizeMotorOutputs() {
		var desc = readPS('GNG_DESC');
		var vcpg = readPS('VNC_CPG');

		// Read central circuit activations to infer motor intent
		var cxPfn = readPS('CX_PFN');    // path integration -> locomotion
		var cxFc = readPS('CX_FC');       // fan-shaped body -> locomotion
		var cxEpg = readPS('CX_EPG');     // heading -> steering
		var cxHd = readPS('CX_HDELTA');   // heading delta -> turning
		var sezFeed = readPS('SEZ_FEED');
		var sezGroom = readPS('SEZ_GROOM');
		var mbApp = readPS('MB_MBON_APP'); // approach
		var mbAv = readPS('MB_MBON_AV');   // avoidance
		var lhApp = readPS('LH_APP');      // lateral horn approach
		var lhAv = readPS('LH_AV');        // lateral horn avoidance
		var dFear = readPS('DRIVE_FEAR');
		var dGroom = readPS('DRIVE_GROOM');
		var prob = readPS('MN_PROBOSCIS');
		var head = readPS('MN_HEAD');
		var dnStartle = readPS('DN_STARTLE');
		var noci = readPS('NOCI');

		// Compute motor intent weights (unnormalized, then used proportionally)
		var walkIntent = (cxPfn + cxFc + cxEpg) * 0.3 + (mbApp + lhApp) * 0.5 + (desc + vcpg) * 0.2;
		var flightIntent = dFear * 2.0 + (mbAv + lhAv) * 0.8 + dnStartle * 1.5 + noci * 1.0;
		var groomIntent = dGroom * 1.5 + sezGroom * 1.0;
		var feedIntent = sezFeed * 1.0 + prob * 0.5;
		var descProxy = Math.max(
			walkIntent * 0.45,
			flightIntent * 0.35,
			groomIntent * 0.3,
			feedIntent * 0.25
		);
		if (descProxy > desc) {
			desc = descProxy;
			if (BRAIN.postSynaptic.GNG_DESC) {
				BRAIN.postSynaptic.GNG_DESC[BRAIN.nextState] = desc;
			}
		}
		var total = desc + vcpg;
		if (total < 0.5) return;

		// Baseline: descending activity drives walking (the default motor program)
		var baseWalk = total * MOTOR_SCALE;

		// Scale walk by locomotor intent from CX
		var walkDrive = baseWalk * (1.0 + walkIntent * 0.1);

		// Symmetric left/right walk output. Steering is handled by the behavioral
		// layer (computeMovementForBehavior) using targetDir, not by leg asymmetry.
		// A small random jitter prevents perfectly straight lines.
		var jitter = (Math.random() - 0.5) * 0.04;
		var walkL = walkDrive * (1.0 + jitter) / 3.0;
		var walkR = walkDrive * (1.0 - jitter) / 3.0;

		// Distribute to 3 leg pairs per side
		addPS('MN_LEG_L1', walkL);
		addPS('MN_LEG_L2', walkL);
		addPS('MN_LEG_L3', walkL);
		addPS('MN_LEG_R1', walkR);
		addPS('MN_LEG_R2', walkR);
		addPS('MN_LEG_R3', walkR);

		// Flight: strong avoidance/fear/startle -> wing activation
		if (flightIntent > 1.0) {
			var flightDrive = flightIntent * MOTOR_SCALE * 0.7;
			addPS('MN_WING_L', flightDrive);
			addPS('MN_WING_R', flightDrive);
		}

		// Startle: fear burst -> DN_STARTLE equivalent
		if (dFear > 3.0) {
			addPS('DN_STARTLE', dFear * MOTOR_SCALE);
		}

		// Grooming: groom intent -> abdomen + front legs (motorcontrol reads these)
		if (groomIntent > 1.0) {
			addPS('MN_ABDOMEN', groomIntent * MOTOR_SCALE * 0.3);
		}

		// Feed intent: boost proboscis (already has real neurons, just amplify)
		if (feedIntent > 0.5) {
			addPS('MN_PROBOSCIS', feedIntent * MOTOR_SCALE * 0.3);
		}
	}

	/* ---- worker-driven BRAIN.update replacement ---- */

	function workerUpdate() {
		// 1. Update drives (same logic as legacy, runs on main thread)
		BRAIN.updateDrives();

		// 2. Build and send sustained stimulation state to worker
		sendStimulation();

		// 3. Aggregate worker spikes into BRAIN.postSynaptic
		if (latestFireState || pendingWorkerTicks > 0) {
			aggregateFireState();

			// 3.5. Synthesize VNC motor outputs from descending neuron activity.
			// FlyWire FAFB is brain-only; leg/wing motor neurons are in the VNC.
			// The brain's output to the VNC is via descending neurons (GNG_DESC).
			// We map their activity + context to motor group postSynaptic values.
			synthesizeMotorOutputs();

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
			addGroup('NOCI', STIM_INTENSITY * 5); // strong burst: fires within 2-3 worker ticks
			BRAIN.stimulate.nociception = false; // single-tick, auto-clear
		}
		if (BRAIN._isMoving) {
			addGroup('MECH_CHORD', STIM_INTENSITY);
		}
		if (BRAIN.stimulate.lightLevel > 0.1 && BRAIN._isMoving) {
			addGroup('VIS_LPTC', STIM_INTENSITY * 0.3);
		}

		// --- Tonic background activity ---
		var tonicIntensity = BRAIN.stimulate.lightLevel === 0 ? 0.03 : 0.08;
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
		var groupFires = new Float32Array(groupCount);
		var tickWindow = pendingWorkerTicks;

		if (pendingGroupSpikes && pendingWorkerTicks > 0) {
			groupFires.set(pendingGroupSpikes);
		} else if (latestFireState) {
			var fire = latestFireState;
			tickWindow = 1;
			for (var i = 0; i < neuronCount; i++) {
				if (fire[i]) {
					groupFires[groupIdArr[i]]++;
				}
			}
		}

		if (tickWindow < 1) tickWindow = 1;

		// Normalize by group size, scale, and write to BRAIN.postSynaptic[nextState]
		for (var g = 0; g < groupCount; g++) {
			var name = groupIdToName[g];
			if (!name || !BRAIN.postSynaptic[name]) continue;
			var size = groupSizes[g];
			var windowActivation = size > 0
				? (groupFires[g] / (size * tickWindow)) * FIRE_STATE_SCALE
				: 0;
			var prevActivation = BRAIN.postSynaptic[name][BRAIN.thisState] || 0;
			var activation = Math.max(windowActivation, prevActivation * 0.75);
			BRAIN.postSynaptic[name][BRAIN.nextState] = activation;
		}

		if (pendingGroupSpikes) pendingGroupSpikes.fill(0);
		pendingWorkerTicks = 0;
	}

	/* ---- pause / resume API for visibilitychange ---- */

	function stopWorker() {
		if (!workerReady || !worker) return;
		worker.postMessage({type: 'stop'});
		worker.postMessage({type: 'setStimulusState', indices: null, intensities: null});
		latestFireState = null;
		if (pendingGroupSpikes) pendingGroupSpikes.fill(0);
		pendingWorkerTicks = 0;
		BRAIN.latestFireState = null;
	}

	function startWorker() {
		if (!workerReady || !worker) return;
		worker.postMessage({type: 'reset'});
		if (pendingGroupSpikes) pendingGroupSpikes.fill(0);
		pendingWorkerTicks = 0;
		worker.postMessage({type: 'start'});
	}

	BRAIN.stopWorker = stopWorker;
	BRAIN.startWorker = startWorker;

	/* ---- start ---- */

	initBridge();

})();
