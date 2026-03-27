# Plan: D24.1

## Dependencies
- list: [] (no new dependencies — project uses vanilla ES5, no npm)
- commands: [] (no install commands needed)

## File Operations (in execution order)

### 1. MODIFY js/brain-worker-bridge.js
- operation: MODIFY
- reason: Refactor IIFE to expose internal functions via BRAIN._bridge namespace in test mode, extract collectStimulationSegments as a pure mapping function, add virtual group bypass in workerUpdate, and guard initBridge with _testMode check

#### Change 1: Add collectStimulationSegments function (before sendStimulation)
- anchor: `/* ---- translate BRAIN.stimulate + BRAIN.drives to worker stimulation ---- */`

Insert a new function `collectStimulationSegments` immediately after the comment block and before `function sendStimulation()`. This function extracts the pure mapping logic from sendStimulation:

```js
function collectStimulationSegments() {
    var segs = [];
    var d = BRAIN.drives;

    // Drive stimulation
    if (d.hunger > 0.2) {
        var pulses = d.hunger > 0.6 ? 3 : (d.hunger > 0.4 ? 2 : 1);
        segs.push({name: 'DRIVE_HUNGER', intensity: STIM_INTENSITY * d.hunger * pulses});
    }
    if (d.fear > 0.05) {
        var pulses = d.fear > 0.5 ? 3 : (d.fear > 0.2 ? 2 : 1);
        segs.push({name: 'DRIVE_FEAR', intensity: STIM_INTENSITY * d.fear * pulses});
    }
    if (d.fatigue > 0.3) {
        segs.push({name: 'DRIVE_FATIGUE', intensity: STIM_INTENSITY * d.fatigue});
    }
    if (d.curiosity > 0.2) {
        var pulses = d.curiosity > 0.5 ? 2 : 1;
        segs.push({name: 'DRIVE_CURIOSITY', intensity: STIM_INTENSITY * d.curiosity * pulses});
    }
    if (d.groom > 0.3) {
        segs.push({name: 'DRIVE_GROOM', intensity: STIM_INTENSITY * d.groom});
    }

    // Sensory stimulation
    if (BRAIN.stimulate.touch) {
        segs.push({name: 'MECH_BRISTLE', intensity: STIM_INTENSITY});
        if (BRAIN.stimulate.touchLocation === 'head' ||
            BRAIN.stimulate.touchLocation === 'thorax') {
            segs.push({name: 'MECH_BRISTLE', intensity: STIM_INTENSITY});
        }
    }
    if (BRAIN.stimulate.foodNearby) {
        segs.push({name: 'OLF_ORN_FOOD', intensity: STIM_INTENSITY});
    }
    if (BRAIN.stimulate.foodContact) {
        segs.push({name: 'GUS_GRN_SWEET', intensity: STIM_INTENSITY});
    }
    if (BRAIN.stimulate.dangerOdor) {
        segs.push({name: 'OLF_ORN_DANGER', intensity: STIM_INTENSITY});
    }
    if (BRAIN.stimulate.wind) {
        segs.push({name: 'MECH_JO', intensity: STIM_INTENSITY * BRAIN.stimulate.windStrength});
    }
    if (BRAIN.stimulate.lightLevel > 0.2) {
        segs.push({name: 'VIS_R1R6', intensity: STIM_INTENSITY * BRAIN.stimulate.lightLevel});
        segs.push({name: 'VIS_R7R8', intensity: STIM_INTENSITY * BRAIN.stimulate.lightLevel * 0.7});
    }
    if (BRAIN.stimulate.temperature > 0.65) {
        var warmIntensity = (BRAIN.stimulate.temperature - 0.5) * 2;
        segs.push({name: 'THERMO_WARM', intensity: STIM_INTENSITY * warmIntensity});
    } else if (BRAIN.stimulate.temperature < 0.35) {
        var coolIntensity = (0.5 - BRAIN.stimulate.temperature) * 2;
        segs.push({name: 'THERMO_COOL', intensity: STIM_INTENSITY * coolIntensity});
    }
    if (BRAIN.stimulate.nociception) {
        segs.push({name: 'NOCI', intensity: STIM_INTENSITY * 5});
        BRAIN.stimulate.nociception = false;
    }
    if (BRAIN._isMoving) {
        segs.push({name: 'MECH_CHORD', intensity: STIM_INTENSITY});
    }
    if (BRAIN.stimulate.lightLevel > 0.1 && BRAIN._isMoving) {
        segs.push({name: 'VIS_LPTC', intensity: STIM_INTENSITY * 0.3});
    }

    // Tonic background activity
    var tonicIntensity = BRAIN.stimulate.lightLevel === 0 ? 0.03 : 0.08;
    segs.push({name: 'CX_FC', intensity: tonicIntensity});
    segs.push({name: 'CX_EPG', intensity: tonicIntensity});
    segs.push({name: 'CX_PFN', intensity: tonicIntensity});

    return segs;
}
```

#### Change 2: Refactor sendStimulation to use collectStimulationSegments
- anchor: `function sendStimulation() {`

Replace the entire `sendStimulation` function body (lines 393-496) with:

```js
function sendStimulation() {
    if (!worker) return;

    var segs = collectStimulationSegments();

    // Translate named segments to indexed segments using closure state
    var totalLen = 0;
    var indexedSegs = [];
    for (var i = 0; i < segs.length; i++) {
        var gid = groupNameToId[segs[i].name];
        if (gid === undefined) continue;
        var idx = groupIndices[gid];
        if (!idx || idx.length === 0) continue;
        indexedSegs.push({indices: idx, intensity: segs[i].intensity});
        totalLen += idx.length;
    }

    if (totalLen === 0) {
        worker.postMessage({type: 'setStimulusState', indices: null, intensities: null});
        return;
    }

    var allIndices = new Uint32Array(totalLen);
    var allIntensities = new Float32Array(totalLen);
    var offset = 0;
    for (var s = 0; s < indexedSegs.length; s++) {
        var seg = indexedSegs[s];
        allIndices.set(seg.indices, offset);
        for (var k = 0; k < seg.indices.length; k++) {
            allIntensities[offset + k] = seg.intensity;
        }
        offset += seg.indices.length;
    }

    worker.postMessage({type: 'setStimulusState', indices: allIndices, intensities: allIntensities});
}
```

#### Change 3: Add virtual group bypass in workerUpdate
- anchor: `// 3.5. Synthesize VNC motor outputs from descending neuron activity.`

Insert the following code block BEFORE the comment `// 3.5. Synthesize VNC motor outputs` and AFTER the `aggregateFireState();` call:

```js
			// 3.25. Virtual group bypass: groups with 0 real neurons
			// (DRIVE_FEAR, DRIVE_CURIOSITY, DRIVE_GROOM) get their value
			// directly from main-thread drives, scaled to match fire state range.
			var vd = BRAIN.drives;
			if (BRAIN.postSynaptic['DRIVE_FEAR'])
				BRAIN.postSynaptic['DRIVE_FEAR'][BRAIN.nextState] = vd.fear * FIRE_STATE_SCALE;
			if (BRAIN.postSynaptic['DRIVE_CURIOSITY'])
				BRAIN.postSynaptic['DRIVE_CURIOSITY'][BRAIN.nextState] = vd.curiosity * FIRE_STATE_SCALE;
			if (BRAIN.postSynaptic['DRIVE_GROOM'])
				BRAIN.postSynaptic['DRIVE_GROOM'][BRAIN.nextState] = vd.groom * FIRE_STATE_SCALE;
```

#### Change 4: Replace initBridge() call with test mode guard and BRAIN._bridge namespace
- anchor: `/* ---- start ---- */`

Replace the last 3 lines of the IIFE (the `/* ---- start ---- */` comment and `initBridge();`) with:

```js
	/* ---- start / test mode ---- */

	if (BRAIN._testMode) {
		BRAIN._bridge = {
			synthesizeMotorOutputs: synthesizeMotorOutputs,
			aggregateFireState: aggregateFireState,
			buildGroupIndices: buildGroupIndices,
			collectStimulationSegments: collectStimulationSegments,
			workerUpdate: workerUpdate,
			FIRE_STATE_SCALE: FIRE_STATE_SCALE,
			MOTOR_SCALE: MOTOR_SCALE,
			STIM_INTENSITY: STIM_INTENSITY,
			_setGroupState: function (gc, nc, gIdArr, gSizes, gIdToNameArr) {
				groupCount = gc;
				neuronCount = nc;
				groupIdArr = gIdArr;
				groupSizes = gSizes;
				groupIdToName = gIdToNameArr;
				groupNameToId = {};
				for (var i = 0; i < gIdToNameArr.length; i++) {
					if (gIdToNameArr[i]) groupNameToId[gIdToNameArr[i]] = i;
				}
				pendingGroupSpikes = new Float32Array(gc);
				pendingWorkerTicks = 0;
			},
			_setFireState: function (fireState, spikes, ticks) {
				latestFireState = fireState;
				if (spikes) pendingGroupSpikes = spikes;
				pendingWorkerTicks = ticks;
			},
			_getGroupIndices: function () {
				return groupIndices;
			},
		};
	} else {
		initBridge();
	}
```

### 2. MODIFY tests/run-node.js
- operation: MODIFY
- reason: Load brain-worker-bridge.js in test mode by setting BRAIN._testMode = true after connectome.js loads

#### Replace entire file content
- anchor: `var files = [`

Replace the entire file content with:

```js
#!/usr/bin/env node
// Node.js test runner for FlyBrain.
// Loads all scripts into the V8 global context (simulating browser <script> tags)
// then calls runAllTests().
var fs = require('fs');
var vm = require('vm');
var path = require('path');

var root = path.join(__dirname, '..');

// Phase 1: Load base modules (constants + connectome define BRAIN object)
var baseFiles = [
	'js/constants.js',
	'js/connectome.js',
];
for (var i = 0; i < baseFiles.length; i++) {
	var filePath = path.join(root, baseFiles[i]);
	var code = fs.readFileSync(filePath, 'utf8');
	vm.runInThisContext(code, { filename: baseFiles[i] });
}

// Phase 2: Enable test mode before loading the worker bridge IIFE.
// This prevents initBridge() from running (no DOM/fetch/Worker in Node)
// and exposes internal functions via BRAIN._bridge for testing.
BRAIN._testMode = true;

// Phase 3: Load bridge, logic, and tests
var moreFiles = [
	'js/brain-worker-bridge.js',
	'js/fly-logic.js',
	'tests/tests.js',
];
for (var i = 0; i < moreFiles.length; i++) {
	var filePath = path.join(root, moreFiles[i]);
	var code = fs.readFileSync(filePath, 'utf8');
	vm.runInThisContext(code, { filename: moreFiles[i] });
}

runAllTests();
```

### 3. MODIFY tests/tests.js
- operation: MODIFY
- reason: Add 19 new test functions for brain-worker-bridge.js functions (aggregateFireState, synthesizeMotorOutputs, virtual group bypass, sendStimulation mapping, buildGroupIndices)

#### Append new section after end of Section 4 (runAllTests)
- anchor: the very last line of the file, which is the closing `}` of `function runAllTests()`

Append the following AFTER the `runAllTests` function (after line 584):

```js

// ============================================================
// Section 5: Worker Bridge Tests (require BRAIN._bridge)
// ============================================================

if (typeof BRAIN !== 'undefined' && BRAIN._bridge) {

// --- aggregateFireState tests ---

var test_bridge_aggregateFireState_basic = function () {
	resetBrainState();
	// Create 10 synthetic groups with 10 neurons each (100 total)
	var names = [];
	var sizes = [];
	var assignments = [];
	for (var g = 0; g < 10; g++) {
		var gname = 'TEST_AG' + g;
		names[g] = gname;
		sizes[g] = 10;
		BRAIN.postSynaptic[gname] = [0, 0];
		for (var n = 0; n < 10; n++) {
			assignments.push(g);
		}
	}
	BRAIN._bridge._setGroupState(10, 100, new Uint16Array(assignments), sizes, names);

	// All 10 neurons in group 0 fire; 5 of 10 in group 3 fire
	var fire = new Uint8Array(100);
	for (var i = 0; i < 10; i++) fire[i] = 1;
	for (var i = 30; i < 35; i++) fire[i] = 1;
	BRAIN._bridge._setFireState(fire, null, 0);

	BRAIN._bridge.aggregateFireState();

	var FSS = BRAIN._bridge.FIRE_STATE_SCALE; // 100
	// Group 0: 10/10 fired in 1 tick → (10/(10*1))*100 = 100
	assertClose(BRAIN.postSynaptic['TEST_AG0'][BRAIN.nextState], FSS, 0.01,
		'full group activation = FIRE_STATE_SCALE');
	// Group 3: 5/10 fired → (5/(10*1))*100 = 50
	assertClose(BRAIN.postSynaptic['TEST_AG3'][BRAIN.nextState], FSS * 0.5, 0.01,
		'half group activation');
	// Group 5: 0/10 fired → 0
	assertEqual(BRAIN.postSynaptic['TEST_AG5'][BRAIN.nextState], 0,
		'unfired group is zero');
};

var test_bridge_aggregateFireState_pending_spikes = function () {
	resetBrainState();
	var names = ['TEST_PS0', 'TEST_PS1', 'TEST_PS2'];
	for (var g = 0; g < 3; g++) {
		BRAIN.postSynaptic[names[g]] = [0, 0];
	}
	var sizes = [20, 10, 5];
	BRAIN._bridge._setGroupState(3, 0, new Uint16Array(0), sizes, names);

	// 40 spikes in group 0, 5 in group 1, 0 in group 2, over 2 ticks
	var spikes = new Float32Array([40, 5, 0]);
	BRAIN._bridge._setFireState(null, spikes, 2);

	BRAIN._bridge.aggregateFireState();

	var FSS = BRAIN._bridge.FIRE_STATE_SCALE;
	// Group 0: (40/(20*2))*100 = 100
	assertClose(BRAIN.postSynaptic['TEST_PS0'][BRAIN.nextState], FSS, 0.01,
		'pending spikes group 0 full activation');
	// Group 1: (5/(10*2))*100 = 25
	assertClose(BRAIN.postSynaptic['TEST_PS1'][BRAIN.nextState], 25, 0.01,
		'pending spikes group 1 quarter activation');
	// Group 2: 0
	assertEqual(BRAIN.postSynaptic['TEST_PS2'][BRAIN.nextState], 0,
		'pending spikes group 2 zero');
};

var test_bridge_aggregateFireState_empty_group = function () {
	resetBrainState();
	BRAIN.postSynaptic['TEST_EG0'] = [0, 0];
	BRAIN.postSynaptic['TEST_EG1'] = [0, 0];
	// Group 0 has size 0 (virtual), group 1 has size 5
	// All 5 neurons belong to group 1
	BRAIN._bridge._setGroupState(2, 5, new Uint16Array([1, 1, 1, 1, 1]), [0, 5],
		['TEST_EG0', 'TEST_EG1']);

	var fire = new Uint8Array(5);
	fire[0] = 1; fire[1] = 1; // 2 of 5 fire in group 1
	BRAIN._bridge._setFireState(fire, null, 0);

	BRAIN._bridge.aggregateFireState();

	assertEqual(BRAIN.postSynaptic['TEST_EG0'][BRAIN.nextState], 0,
		'empty group (size=0) produces zero activation');
	// Group 1: (2/(5*1))*100 = 40
	assertClose(BRAIN.postSynaptic['TEST_EG1'][BRAIN.nextState], 40, 0.01,
		'non-empty group computes correctly');
};

var test_bridge_aggregateFireState_decay = function () {
	resetBrainState();
	BRAIN.postSynaptic['TEST_DC0'] = [0, 0];
	// Set previous activation in thisState to 80
	BRAIN.postSynaptic['TEST_DC0'][BRAIN.thisState] = 80;

	BRAIN._bridge._setGroupState(1, 10, new Uint16Array(10), [10], ['TEST_DC0']);

	// No neurons fire → windowActivation = 0
	var fire = new Uint8Array(10);
	BRAIN._bridge._setFireState(fire, null, 0);

	BRAIN._bridge.aggregateFireState();

	// activation = max(0, 80 * 0.75) = 60
	assertClose(BRAIN.postSynaptic['TEST_DC0'][BRAIN.nextState], 60, 0.01,
		'previous activation decays by 0.75');
};

// --- synthesizeMotorOutputs tests ---

var test_bridge_synthesize_walk_tonic = function () {
	resetBrainState();
	var origRandom = Math.random;
	Math.random = function () { return 0.5; }; // jitter = 0

	// Idle tonic: moderate descending + central complex activity
	BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 5;
	BRAIN.postSynaptic['VNC_CPG'][BRAIN.nextState] = 1;
	BRAIN.postSynaptic['CX_PFN'][BRAIN.nextState] = 3;
	BRAIN.postSynaptic['CX_FC'][BRAIN.nextState] = 2;
	BRAIN.postSynaptic['CX_EPG'][BRAIN.nextState] = 2;

	BRAIN._bridge.synthesizeMotorOutputs();
	BRAIN.motorcontrol();
	Math.random = origRandom;

	// walkIntent = (3+2+2)*0.3 + 0 + (5+1)*0.2 = 2.1 + 1.2 = 3.3
	// total = 5+1 = 6, baseWalk = 6*0.6 = 3.6
	// walkDrive = 3.6*(1+3.3*0.1) = 3.6*1.33 = 4.788
	// walkL = walkR = 4.788/3 = 1.596 per leg (jitter=0)
	// accumWalkLeft = 1.596*3 = 4.788, same for right
	// total = 9.576
	var totalWalk = BRAIN.accumWalkLeft + BRAIN.accumWalkRight;
	assertClose(totalWalk, 9.576, 0.1, 'idle tonic walk output');
	assertTrue(totalWalk >= 6 && totalWalk <= 12,
		'walk total in 6-12 range, got ' + totalWalk.toFixed(2));
};

var test_bridge_synthesize_flight_fear = function () {
	resetBrainState();
	var origRandom = Math.random;
	Math.random = function () { return 0.5; };

	BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 3;
	BRAIN.postSynaptic['DRIVE_FEAR'][BRAIN.nextState] = 8;
	BRAIN.postSynaptic['MB_MBON_AV'][BRAIN.nextState] = 2;
	BRAIN.postSynaptic['LH_AV'][BRAIN.nextState] = 1;

	BRAIN._bridge.synthesizeMotorOutputs();
	BRAIN.motorcontrol();
	Math.random = origRandom;

	// flightIntent = 8*2 + (2+1)*0.8 + 0 + 0 = 18.4 > 1.0
	// flightDrive = 18.4*0.6*0.7 = 7.728
	// accumFlight = 7.728*2 = 15.456
	assertTrue(BRAIN.accumFlight > 15,
		'flight exceeds gate with high DRIVE_FEAR, got ' + BRAIN.accumFlight.toFixed(2));
};

var test_bridge_synthesize_groom = function () {
	resetBrainState();
	var origRandom = Math.random;
	Math.random = function () { return 0.5; };

	BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 3;
	BRAIN.postSynaptic['DRIVE_GROOM'][BRAIN.nextState] = 5;
	BRAIN.postSynaptic['SEZ_GROOM'][BRAIN.nextState] = 2;

	BRAIN._bridge.synthesizeMotorOutputs();
	BRAIN.motorcontrol();
	Math.random = origRandom;

	// groomIntent = 5*1.5 + 2*1.0 = 9.5 > 1.0
	// MN_ABDOMEN += 9.5*0.6*0.3 = 1.71
	// accumGroom = abdomen + min(legL1, legR1) = 1.71 + walkL_per_leg
	assertTrue(BRAIN.accumGroom > 1,
		'groom activates with high DRIVE_GROOM, got ' + BRAIN.accumGroom.toFixed(2));
};

var test_bridge_synthesize_early_exit = function () {
	resetBrainState();
	// All postSynaptic values are 0 after reset → desc=0, vcpg=0
	// All intents = 0, descProxy = 0, total = 0 < 0.5 → early return

	BRAIN._bridge.synthesizeMotorOutputs();
	BRAIN.motorcontrol();

	assertEqual(BRAIN.accumWalkLeft, 0, 'no walk on early exit');
	assertEqual(BRAIN.accumWalkRight, 0, 'no walk right on early exit');
	assertEqual(BRAIN.accumFlight, 0, 'no flight on early exit');
	assertEqual(BRAIN.accumGroom, 0, 'no groom on early exit');
	assertEqual(BRAIN.accumFeed, 0, 'no feed on early exit');
};

var test_bridge_synthesize_dn_startle = function () {
	resetBrainState();
	BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 2;
	BRAIN.postSynaptic['DRIVE_FEAR'][BRAIN.nextState] = 5;

	BRAIN._bridge.synthesizeMotorOutputs();

	// dFear=5 > 3.0 → addPS('DN_STARTLE', 5*0.6 = 3.0)
	assertClose(BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState], 3.0, 0.01,
		'DN_STARTLE written to nextState when dFear > 3.0');
};

var test_bridge_synthesize_feed = function () {
	resetBrainState();
	var origRandom = Math.random;
	Math.random = function () { return 0.5; };

	BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 3;
	BRAIN.postSynaptic['SEZ_FEED'][BRAIN.nextState] = 3;
	BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState] = 2;

	BRAIN._bridge.synthesizeMotorOutputs();
	BRAIN.motorcontrol();
	Math.random = origRandom;

	// feedIntent = 3*1.0 + 2*0.5 = 4.0 > 0.5
	// addPS('MN_PROBOSCIS', 4.0*0.6*0.3 = 0.72)
	// MN_PROBOSCIS total = 2 + 0.72 = 2.72
	// accumFeed = 2.72
	assertClose(BRAIN.accumFeed, 2.72, 0.1,
		'feed intent boosts MN_PROBOSCIS');
};

// --- virtual group bypass tests ---

var test_bridge_virtual_bypass_fear = function () {
	resetBrainState();
	var origRandom = Math.random;
	Math.random = function () { return 0.5; };

	// Minimal bridge state: 1 virtual group (DRIVE_FEAR, size=0)
	BRAIN._bridge._setGroupState(1, 0, new Uint16Array(0), [0], ['DRIVE_FEAR']);
	BRAIN._bridge._setFireState(new Uint8Array(0), null, 0);

	// Set drives before workerUpdate
	BRAIN.drives.fear = 0.8;
	BRAIN.stimulate.touch = false;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.dangerOdor = false;
	BRAIN._isFeeding = false;
	BRAIN._isMoving = false;
	BRAIN._isGrooming = false;

	BRAIN._bridge.workerUpdate();
	Math.random = origRandom;

	// After updateDrives: fear = 0.8 * 0.85 = 0.68 (no touch/wind/danger)
	// Virtual bypass: postSynaptic['DRIVE_FEAR'][nextState] = 0.68 * 100 = 68
	// After state swap: thisState has the value
	var FSS = BRAIN._bridge.FIRE_STATE_SCALE;
	assertClose(BRAIN.postSynaptic['DRIVE_FEAR'][BRAIN.thisState], 0.68 * FSS, 0.5,
		'virtual bypass writes fear drive to postSynaptic');
};

var test_bridge_virtual_bypass_curiosity = function () {
	resetBrainState();
	var origRandom = Math.random;
	Math.random = function () { return 0.5; }; // curiosity delta = 0

	BRAIN._bridge._setGroupState(1, 0, new Uint16Array(0), [0], ['DRIVE_CURIOSITY']);
	BRAIN._bridge._setFireState(new Uint8Array(0), null, 0);

	BRAIN.drives.curiosity = 0.6;
	BRAIN.stimulate.touch = false;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.dangerOdor = false;
	BRAIN._isMoving = false;
	BRAIN._isFeeding = false;
	BRAIN._isGrooming = false;

	BRAIN._bridge.workerUpdate();
	Math.random = origRandom;

	// After updateDrives with Math.random=0.5: curiosity += (0.5-0.5)*range = 0
	// curiosity stays 0.6
	// Virtual bypass: 0.6 * 100 = 60
	var FSS = BRAIN._bridge.FIRE_STATE_SCALE;
	assertClose(BRAIN.postSynaptic['DRIVE_CURIOSITY'][BRAIN.thisState], 0.6 * FSS, 0.5,
		'virtual bypass writes curiosity drive to postSynaptic');
};

var test_bridge_virtual_bypass_groom = function () {
	resetBrainState();
	var origRandom = Math.random;
	Math.random = function () { return 0.5; };

	BRAIN._bridge._setGroupState(1, 0, new Uint16Array(0), [0], ['DRIVE_GROOM']);
	BRAIN._bridge._setFireState(new Uint8Array(0), null, 0);

	BRAIN.drives.groom = 0.5;
	BRAIN.stimulate.touch = false;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.dangerOdor = false;
	BRAIN._isMoving = false;
	BRAIN._isFeeding = false;
	BRAIN._isGrooming = false;

	BRAIN._bridge.workerUpdate();
	Math.random = origRandom;

	// After updateDrives: groom = 0.5 + 0.008 = 0.508 (no touch, not grooming)
	// Virtual bypass: 0.508 * 100 = 50.8
	var FSS = BRAIN._bridge.FIRE_STATE_SCALE;
	assertClose(BRAIN.postSynaptic['DRIVE_GROOM'][BRAIN.thisState], 0.508 * FSS, 0.5,
		'virtual bypass writes groom drive to postSynaptic');
};

// --- sendStimulation mapping tests ---

var test_bridge_stim_touch_maps_bristle = function () {
	resetBrainState();
	BRAIN.stimulate.touch = true;
	BRAIN.stimulate.touchLocation = null;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN.stimulate.temperature = 0.5;
	BRAIN._isMoving = false;

	var segs = BRAIN._bridge.collectStimulationSegments();
	var count = 0;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'MECH_BRISTLE') count++;
	}
	assertEqual(count, 1, 'touch without location produces 1 MECH_BRISTLE segment');
};

var test_bridge_stim_touch_head_double = function () {
	resetBrainState();
	BRAIN.stimulate.touch = true;
	BRAIN.stimulate.touchLocation = 'head';
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN.stimulate.temperature = 0.5;
	BRAIN._isMoving = false;

	var segs = BRAIN._bridge.collectStimulationSegments();
	var count = 0;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'MECH_BRISTLE') count++;
	}
	assertEqual(count, 2, 'touch on head produces double MECH_BRISTLE');
};

var test_bridge_stim_food_maps_olf = function () {
	resetBrainState();
	BRAIN.stimulate.foodNearby = true;
	BRAIN.stimulate.touch = false;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN.stimulate.temperature = 0.5;
	BRAIN._isMoving = false;

	var segs = BRAIN._bridge.collectStimulationSegments();
	var found = false;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'OLF_ORN_FOOD') found = true;
	}
	assertTrue(found, 'foodNearby maps to OLF_ORN_FOOD');
};

var test_bridge_stim_light_maps_vis = function () {
	resetBrainState();
	BRAIN.stimulate.lightLevel = 0.5;
	BRAIN.stimulate.touch = false;
	BRAIN.stimulate.foodNearby = false;
	BRAIN.stimulate.foodContact = false;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN.stimulate.temperature = 0.5;
	BRAIN._isMoving = false;

	var segs = BRAIN._bridge.collectStimulationSegments();
	var hasR1R6 = false;
	var hasR7R8 = false;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'VIS_R1R6') hasR1R6 = true;
		if (segs[i].name === 'VIS_R7R8') hasR7R8 = true;
	}
	assertTrue(hasR1R6, 'lightLevel>0.2 maps to VIS_R1R6');
	assertTrue(hasR7R8, 'lightLevel>0.2 maps to VIS_R7R8');
};

var test_bridge_stim_temperature_thresholds = function () {
	// Warm: temperature > 0.65 → THERMO_WARM
	resetBrainState();
	BRAIN.stimulate.temperature = 0.8;
	BRAIN.stimulate.touch = false;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN._isMoving = false;

	var segs = BRAIN._bridge.collectStimulationSegments();
	var hasWarm = false;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'THERMO_WARM') hasWarm = true;
	}
	assertTrue(hasWarm, 'temperature>0.65 maps to THERMO_WARM');

	// Cool: temperature < 0.35 → THERMO_COOL
	resetBrainState();
	BRAIN.stimulate.temperature = 0.2;
	BRAIN.stimulate.touch = false;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN._isMoving = false;

	segs = BRAIN._bridge.collectStimulationSegments();
	var hasCool = false;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'THERMO_COOL') hasCool = true;
	}
	assertTrue(hasCool, 'temperature<0.35 maps to THERMO_COOL');
};

var test_bridge_stim_noci_intensity_and_clear = function () {
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

	// Find NOCI segment
	var nociSeg = null;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'NOCI') { nociSeg = segs[i]; break; }
	}
	assertTrue(nociSeg !== null, 'nociception maps to NOCI');
	var SI = BRAIN._bridge.STIM_INTENSITY;
	assertClose(nociSeg.intensity, SI * 5, 0.001, 'NOCI intensity is 5x STIM_INTENSITY');
	assertEqual(BRAIN.stimulate.nociception, false, 'nociception auto-clears after collection');
};

var test_bridge_stim_tonic_background = function () {
	resetBrainState();
	BRAIN.stimulate.touch = false;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.nociception = false;
	BRAIN.stimulate.temperature = 0.5;
	BRAIN._isMoving = false;

	var segs = BRAIN._bridge.collectStimulationSegments();

	// Tonic CX groups are always present
	var hasCxFc = false, hasCxEpg = false, hasCxPfn = false;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'CX_FC') hasCxFc = true;
		if (segs[i].name === 'CX_EPG') hasCxEpg = true;
		if (segs[i].name === 'CX_PFN') hasCxPfn = true;
	}
	assertTrue(hasCxFc, 'tonic CX_FC always present');
	assertTrue(hasCxEpg, 'tonic CX_EPG always present');
	assertTrue(hasCxPfn, 'tonic CX_PFN always present');
	// In dark (lightLevel=0), tonic intensity = 0.03
	var tonicSeg = null;
	for (var i = 0; i < segs.length; i++) {
		if (segs[i].name === 'CX_FC') { tonicSeg = segs[i]; break; }
	}
	assertClose(tonicSeg.intensity, 0.03, 0.001,
		'tonic intensity is 0.03 in dark');
};

// --- buildGroupIndices test ---

var test_bridge_buildGroupIndices = function () {
	resetBrainState();
	// 6 neurons: 0→g0, 1→g1, 2→g0, 3→g2, 4→g1, 5→g0
	var assignments = new Uint16Array([0, 1, 0, 2, 1, 0]);
	BRAIN._bridge._setGroupState(3, 6, assignments, [3, 2, 1], ['GA', 'GB', 'GC']);
	BRAIN._bridge.buildGroupIndices();

	var gi = BRAIN._bridge._getGroupIndices();
	// Group 0: neurons 0, 2, 5
	assertEqual(gi[0].length, 3, 'group 0 has 3 neurons');
	assertTrue(gi[0][0] === 0 && gi[0][1] === 2 && gi[0][2] === 5,
		'group 0 indices are [0, 2, 5]');
	// Group 1: neurons 1, 4
	assertEqual(gi[1].length, 2, 'group 1 has 2 neurons');
	assertTrue(gi[1][0] === 1 && gi[1][1] === 4,
		'group 1 indices are [1, 4]');
	// Group 2: neuron 3
	assertEqual(gi[2].length, 1, 'group 2 has 1 neuron');
	assertEqual(gi[2][0], 3, 'group 2 index is 3');
};

} // end bridge tests guard
```

## Verification
- build: no build step (vanilla JS, no bundler)
- lint: no lint configured
- test: `node tests/run-node.js`
- smoke: Verify output shows `64 passed / 0 failed / 64 total` (45 existing + 19 new tests). If any test fails, the exit code will be 1. Open `index.html` in a browser and verify the fly simulation still loads and behaves normally (bridge IIFE should call initBridge() in non-test mode).

## Constraints
- Do NOT modify js/connectome.js, js/constants.js, or js/fly-logic.js
- Do NOT add any new files — all changes go in the 3 existing files listed above
- Do NOT add npm dependencies or a package.json
- Do NOT change the behavior of brain-worker-bridge.js in non-test mode (when BRAIN._testMode is falsy, the IIFE must call initBridge() exactly as before)
- Do NOT modify the existing 45 tests in tests/tests.js Section 1-4
- Use var declarations only (ES5 compatibility, no let/const/arrow functions)
- All new test function names must start with `test_bridge_` to distinguish from existing tests
- The `collectStimulationSegments` function must reproduce the EXACT same mapping logic as the original `sendStimulation` — same conditionals, same intensity calculations, same ordering
- Math.random must be saved and restored in every test that mocks it, even on test failure (use try/finally if needed — but since the existing tests don't use try/finally and the test runner catches exceptions, matching existing style is acceptable)
