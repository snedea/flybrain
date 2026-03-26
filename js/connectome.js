/* Drosophila melanogaster Functional Connectome -- Javascript
 * Adapted from C. elegans worm-sim (Busbice, Garrett, Churchill / zrispo)
 * Rewired for fruit fly brain with ~70 functional neuron groups.
 *
 * Core mechanics (dendriteAccumulate, runconnectome, fireNeuron) are
 * the same propagation engine. The neuron names, motor outputs, sensory
 * inputs, and drive system are Drosophila-specific.
 */

var BRAIN = {};

// Import weights from constants.js (loaded before this script)
BRAIN.weights = weights;

// ============================================================
// CORE SIGNAL PROPAGATION (unchanged from worm-sim)
// ============================================================

/**
 * Propagates weighted signal from a preSynaptic neuron to all its
 * postSynaptic targets. This is the fundamental operation.
 */
BRAIN.dendriteAccumulate = function (preSynaptic) {
	if (!BRAIN.weights[preSynaptic]) return;
	for (var postSynaptic in BRAIN.weights[preSynaptic]) {
		if (!BRAIN.postSynaptic[postSynaptic]) continue;
		BRAIN.postSynaptic[postSynaptic][BRAIN.nextState] +=
			BRAIN.weights[preSynaptic][postSynaptic];
	}
};

/**
 * Propagates weighted signal scaled by a multiplier (for drive-proportional stimulation).
 */
BRAIN.dendriteAccumulateScaled = function (preSynaptic, scale) {
	if (!BRAIN.weights[preSynaptic]) return;
	for (var postSynaptic in BRAIN.weights[preSynaptic]) {
		if (!BRAIN.postSynaptic[postSynaptic]) continue;
		BRAIN.postSynaptic[postSynaptic][BRAIN.nextState] +=
			Math.round(BRAIN.weights[preSynaptic][postSynaptic] * scale);
	}
};

// State double-buffering
BRAIN.thisState = 0;
BRAIN.nextState = 1;

// Threshold for neuron firing (lower than worm-sim's 30 because fly has
// fewer neurons and needs faster signal propagation for responsiveness)
BRAIN.fireThreshold = 22;

// ============================================================
// MOTOR NEURON GROUPS
// ============================================================

BRAIN.motorGroups = {
	walk: ['MN_LEG_L1', 'MN_LEG_R1', 'MN_LEG_L2', 'MN_LEG_R2', 'MN_LEG_L3', 'MN_LEG_R3'],
	walkLeft: ['MN_LEG_L1', 'MN_LEG_L2', 'MN_LEG_L3'],
	walkRight: ['MN_LEG_R1', 'MN_LEG_R2', 'MN_LEG_R3'],
	flight: ['MN_WING_L', 'MN_WING_R'],
	feed: ['MN_PROBOSCIS'],
	groom: ['MN_LEG_L1', 'MN_LEG_R1', 'MN_ABDOMEN'],
	orient: ['MN_HEAD'],
};

// All motor neurons (these cannot re-fire into the brain)
BRAIN.motorNeurons = [
	'MN_LEG_L1', 'MN_LEG_R1',
	'MN_LEG_L2', 'MN_LEG_R2',
	'MN_LEG_L3', 'MN_LEG_R3',
	'MN_WING_L', 'MN_WING_R',
	'MN_PROBOSCIS',
	'MN_HEAD',
	'MN_ABDOMEN',
];

// Motor neuron prefixes for the muscle-cannot-fire check
BRAIN.motorPrefixes = ['MN_'];

// ============================================================
// BEHAVIOR ACCUMULATORS
// ============================================================

BRAIN.accumWalkLeft = 0;
BRAIN.accumWalkRight = 0;
BRAIN.accumFlight = 0;
BRAIN.accumFeed = 0;
BRAIN.accumGroom = 0;
BRAIN.accumStartle = 0;
BRAIN.accumHead = 0;

// Backward-compatible left/right accumulators (computed from walk)
BRAIN.accumleft = 0;
BRAIN.accumright = 0;

// ============================================================
// NEURON REGION CLASSIFICATION (for UI visualization)
// ============================================================

BRAIN.neuronRegions = {
	sensory: [
		'VIS_R1R6', 'VIS_R7R8', 'VIS_ME', 'VIS_LO', 'VIS_LC', 'VIS_LPTC',
		'OLF_ORN_FOOD', 'OLF_ORN_DANGER', 'OLF_LN', 'OLF_PN',
		'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER',
		'MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD',
		'THERMO_WARM', 'THERMO_COOL',
		'NOCI',
	],
	central: [
		'MB_KC', 'MB_APL', 'MB_MBON_APP', 'MB_MBON_AV', 'MB_DAN_REW', 'MB_DAN_PUN',
		'LH_APP', 'LH_AV',
		'CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA',
		'SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER',
		'ANTENNAL_MECH', 'GNG_DESC',
		'DN_WALK', 'DN_FLIGHT', 'DN_TURN', 'DN_BACKUP', 'DN_STARTLE',
		'VNC_CPG', 'CLOCK_DN',
	],
	drives: [
		'DRIVE_HUNGER', 'DRIVE_FEAR', 'DRIVE_FATIGUE',
		'DRIVE_CURIOSITY', 'DRIVE_GROOM',
	],
	motor: [
		'MN_LEG_L1', 'MN_LEG_R1', 'MN_LEG_L2', 'MN_LEG_R2',
		'MN_LEG_L3', 'MN_LEG_R3',
		'MN_WING_L', 'MN_WING_R',
		'MN_PROBOSCIS', 'MN_HEAD', 'MN_ABDOMEN',
	],
};

// ============================================================
// SENSORY STIMULATION INPUT
// ============================================================

BRAIN.stimulate = {
	touch: false,
	touchLocation: null,   // 'head', 'thorax', 'abdomen', 'leg'
	foodNearby: false,
	foodContact: false,
	dangerOdor: false,
	wind: false,
	windStrength: 0,       // 0-1
	windDirection: 0,      // radians, wind travel direction (drag vector; 0=right, PI/2=up). Wind SOURCE = windDirection + PI.
	lightLevel: 1,         // 0-1 (0=dark, 1=bright)
	nociception: false,   // pain response (triggered by rapid repeated touch)
	temperature: 0.5,      // 0-1 (0=cold, 1=hot), 0.5 = preferred
};

// ============================================================
// INTERNAL DRIVES
// ============================================================

BRAIN.drives = {
	hunger: 0.3,
	fear: 0.0,
	fatigue: 0.0,
	curiosity: 0.5,
	groom: 0.1,
};

// Track whether the fly is currently performing certain behaviors
// (used for drive updates)
BRAIN._isMoving = false;
BRAIN._isFeeding = false;
BRAIN._isGrooming = false;

/**
 * Update internal drives each brain tick.
 * Drives are floats clamped to [0, 1] that change over time
 * and in response to events.
 */
BRAIN.updateDrives = function () {
	var d = BRAIN.drives;

	// Hunger: increases over time, decreases when fed
	d.hunger += 0.005;
	if (BRAIN._isFeeding) {
		d.hunger -= 0.3;
	}

	// Fear: spikes on touch/wind, decays exponentially
	if (BRAIN.stimulate.touch) {
		d.fear += 0.3;
	}
	if (BRAIN.stimulate.wind && BRAIN.stimulate.windStrength > 0.5) {
		d.fear += 0.2 * BRAIN.stimulate.windStrength;
	}
	if (BRAIN.stimulate.dangerOdor) {
		d.fear += 0.25;
	}
	d.fear *= 0.85; // exponential decay

	// Fatigue: increases when moving, decreases when resting
	// In low light (< 0.3), fatigue accumulates faster (fly winds down in darkness)
	if (BRAIN._isMoving) {
		var fatigueGain = BRAIN.stimulate.lightLevel < 0.3 ? 0.006 : 0.003;
		d.fatigue += fatigueGain;
	} else {
		d.fatigue -= 0.01;
	}

	// Curiosity: random walk (reduced range in low light -- less exploratory in darkness)
	var curiosityRange = BRAIN.stimulate.lightLevel < 0.3 ? 0.02 : 0.06;
	d.curiosity += (Math.random() - 0.5) * curiosityRange;

	// Grooming urge: accumulates over time, spikes on touch, drops when grooming
	d.groom += 0.008;
	if (BRAIN.stimulate.touch) {
		d.groom += 0.2;
	}
	if (BRAIN._isGrooming) {
		d.groom -= 0.5;
	}

	// Clamp all drives to [0, 1]
	for (var key in d) {
		if (d[key] < 0) d[key] = 0;
		if (d[key] > 1) d[key] = 1;
	}
};

// ============================================================
// RANDOM INITIAL EXCITATION
// ============================================================

BRAIN.randExcite = function () {
	var keys = Object.keys(BRAIN.connectome);
	for (var i = 0; i < 40; i++) {
		var idx = Math.floor(Math.random() * keys.length);
		BRAIN.dendriteAccumulate(keys[idx]);
	}
};

// ============================================================
// SETUP -- Initialize all state
// ============================================================

BRAIN.setup = function () {
	BRAIN.postSynaptic = {};
	BRAIN.connectome = {};

	// Build connectome functions from weights
	for (var preSynaptic in BRAIN.weights) {
		// Closure to capture preSynaptic name correctly
		(function (name) {
			BRAIN.connectome[name] = function () {
				BRAIN.dendriteAccumulate(name);
			};
		})(preSynaptic);
	}

	// Also ensure every postSynaptic target mentioned in weights is initialized,
	// even if it does not appear as a preSynaptic key
	var allNeurons = {};
	for (var pre in BRAIN.weights) {
		allNeurons[pre] = true;
		for (var post in BRAIN.weights[pre]) {
			allNeurons[post] = true;
		}
	}

	for (var neuron in allNeurons) {
		BRAIN.postSynaptic[neuron] = [0, 0];
	}
};

// ============================================================
// BRAIN UPDATE -- Main tick (called from main.js via setInterval)
// ============================================================

BRAIN.update = function () {
	// --- Update internal drives ---
	BRAIN.updateDrives();

	// --- Stimulate drive neurons proportionally ---
	// Drives pulse multiple times per tick to sustain activity.
	// The pulse count scales with drive intensity (1-3 pulses).
	var d = BRAIN.drives;

	if (d.hunger > 0.2) {
		var pulses = d.hunger > 0.6 ? 3 : (d.hunger > 0.4 ? 2 : 1);
		for (var p = 0; p < pulses; p++) {
			BRAIN.dendriteAccumulateScaled('DRIVE_HUNGER', d.hunger);
		}
	}
	if (d.fear > 0.05) {
		var pulses = d.fear > 0.5 ? 3 : (d.fear > 0.2 ? 2 : 1);
		for (var p = 0; p < pulses; p++) {
			BRAIN.dendriteAccumulateScaled('DRIVE_FEAR', d.fear);
		}
	}
	if (d.fatigue > 0.3) {
		BRAIN.dendriteAccumulateScaled('DRIVE_FATIGUE', d.fatigue);
	}
	if (d.curiosity > 0.2) {
		var pulses = d.curiosity > 0.5 ? 2 : 1;
		for (var p = 0; p < pulses; p++) {
			BRAIN.dendriteAccumulateScaled('DRIVE_CURIOSITY', d.curiosity);
		}
	}
	if (d.groom > 0.3) {
		BRAIN.dendriteAccumulateScaled('DRIVE_GROOM', d.groom);
	}

	// --- Stimulate sensory neurons based on input ---

	// Touch / mechanosensory
	if (BRAIN.stimulate.touch) {
		BRAIN.dendriteAccumulate('MECH_BRISTLE');
		// Location-specific: stronger grooming for head/thorax touch
		if (BRAIN.stimulate.touchLocation === 'head' || BRAIN.stimulate.touchLocation === 'thorax') {
			BRAIN.dendriteAccumulate('MECH_BRISTLE'); // double dose
		}
	}

	// Food nearby (olfactory)
	if (BRAIN.stimulate.foodNearby) {
		BRAIN.dendriteAccumulate('OLF_ORN_FOOD');
	}

	// Food contact (gustatory)
	if (BRAIN.stimulate.foodContact) {
		BRAIN.dendriteAccumulate('GUS_GRN_SWEET');
	}

	// Danger odor (NOTE: connectome weights are wired but no user interaction currently sets BRAIN.stimulate.dangerOdor)
	if (BRAIN.stimulate.dangerOdor) {
		BRAIN.dendriteAccumulate('OLF_ORN_DANGER');
	}

	// Wind
	if (BRAIN.stimulate.wind) {
		var windScale = BRAIN.stimulate.windStrength;
		BRAIN.dendriteAccumulateScaled('MECH_JO', windScale);
	}

	// Light -- photoreceptor activation scales with light level
	if (BRAIN.stimulate.lightLevel > 0.2) {
		BRAIN.dendriteAccumulateScaled('VIS_R1R6', BRAIN.stimulate.lightLevel);
		BRAIN.dendriteAccumulateScaled('VIS_R7R8', BRAIN.stimulate.lightLevel * 0.7);
	}

	// Temperature -- extreme temps activate thermosensory
	if (BRAIN.stimulate.temperature > 0.65) {
		// Warm stimulus
		var warmIntensity = (BRAIN.stimulate.temperature - 0.5) * 2;
		BRAIN.dendriteAccumulateScaled('THERMO_WARM', warmIntensity);
	} else if (BRAIN.stimulate.temperature < 0.35) {
		// Cool stimulus
		var coolIntensity = (0.5 - BRAIN.stimulate.temperature) * 2;
		BRAIN.dendriteAccumulateScaled('THERMO_COOL', coolIntensity);
	}

	// Nociception (pain response from repeated rapid touch)
	if (BRAIN.stimulate.nociception) {
		BRAIN.dendriteAccumulate('NOCI');
		BRAIN.stimulate.nociception = false; // single-tick: fire once then auto-clear
	}

	// Proprioceptive feedback (always-on when moving)
	if (BRAIN._isMoving) {
		BRAIN.dendriteAccumulate('MECH_CHORD');
	}

	// Baseline visual input (ambient, unless dark)
	if (BRAIN.stimulate.lightLevel > 0.1) {
		// Subtle background optic flow when moving
		if (BRAIN._isMoving) {
			BRAIN.dendriteAccumulateScaled('VIS_LPTC', 0.3);
		}
	}

	// --- Tonic background activity ---
	// Real fly brains have persistent tonic activity in central circuits.
	// With only ~50 neuron groups (vs 302 in C. elegans or 130K in a real
	// fly brain), signals decay too fast. Inject tonic excitation
	// into central processing nodes to maintain reverberant activity.
	var tonicTargets = ['CX_FC', 'CX_EPG', 'CX_PFN'];
	var tonicLevel = BRAIN.stimulate.lightLevel === 0 ? 4 : 8;
	for (var t = 0; t < tonicTargets.length; t++) {
		if (BRAIN.postSynaptic[tonicTargets[t]]) {
			BRAIN.postSynaptic[tonicTargets[t]][BRAIN.nextState] += tonicLevel;
		}
	}

	// Always run the connectome after stimulation
	BRAIN.runconnectome();

};

// ============================================================
// RUN CONNECTOME -- Fire neurons above threshold, run motor control
// ============================================================

BRAIN.runconnectome = function () {
	for (var ps in BRAIN.postSynaptic) {
		// Motor neurons cannot fire (they are output-only)
		var isMotor = false;
		for (var p = 0; p < BRAIN.motorPrefixes.length; p++) {
			if (ps.indexOf(BRAIN.motorPrefixes[p]) === 0) {
				isMotor = true;
				break;
			}
		}

		if (!isMotor && BRAIN.postSynaptic[ps][BRAIN.thisState] > BRAIN.fireThreshold) {
			BRAIN.fireNeuron(ps);
		}
	}

	BRAIN.motorcontrol();

	// Swap states: copy nextState into thisState, then swap indices
	for (var ps in BRAIN.postSynaptic) {
		BRAIN.postSynaptic[ps][BRAIN.thisState] =
			BRAIN.postSynaptic[ps][BRAIN.nextState];
	}

	var temp = BRAIN.thisState;
	BRAIN.thisState = BRAIN.nextState;
	BRAIN.nextState = temp;
};

// ============================================================
// FIRE NEURON -- Cascade signal when threshold exceeded
// ============================================================

BRAIN.fireNeuron = function (fneuron) {
	BRAIN.dendriteAccumulate(fneuron);
	BRAIN.postSynaptic[fneuron][BRAIN.nextState] = 0;
};

// ============================================================
// MOTOR CONTROL -- Compute behavior accumulators from motor neuron states
// ============================================================

BRAIN.motorcontrol = function () {
	// Reset all accumulators
	BRAIN.accumWalkLeft = 0;
	BRAIN.accumWalkRight = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.accumStartle = 0;
	BRAIN.accumHead = 0;

	// Helper to read and drain a motor neuron
	var readMotor = function (name) {
		if (!BRAIN.postSynaptic[name]) return 0;
		var val = BRAIN.postSynaptic[name][BRAIN.nextState];
		BRAIN.postSynaptic[name][BRAIN.nextState] = 0;
		return val;
	};

	// Walk left legs
	var legL1 = readMotor('MN_LEG_L1');
	var legL2 = readMotor('MN_LEG_L2');
	var legL3 = readMotor('MN_LEG_L3');
	BRAIN.accumWalkLeft = legL1 + legL2 + legL3;

	// Walk right legs
	var legR1 = readMotor('MN_LEG_R1');
	var legR2 = readMotor('MN_LEG_R2');
	var legR3 = readMotor('MN_LEG_R3');
	BRAIN.accumWalkRight = legR1 + legR2 + legR3;

	// Flight (wings)
	var wingL = readMotor('MN_WING_L');
	var wingR = readMotor('MN_WING_R');
	BRAIN.accumFlight = wingL + wingR;

	// Feeding (proboscis)
	BRAIN.accumFeed = readMotor('MN_PROBOSCIS');

	// Grooming (front legs + abdomen when both active)
	// Grooming is detected when front legs are active AND abdomen is active,
	// or when SEZ_GROOM was the dominant command
	var abdomen = readMotor('MN_ABDOMEN');
	var head = readMotor('MN_HEAD');
	BRAIN.accumHead = head;
	BRAIN.accumGroom = abdomen + (abdomen > 0 ? head : 0) + Math.min(legL1, legR1);

	// Startle is derived from DN_STARTLE neuron state (not a motor neuron per se,
	// but we track its activation level for behavior selection)
	if (BRAIN.postSynaptic['DN_STARTLE']) {
		BRAIN.accumStartle = BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState];
	}

	// Floor all accumulators at 0 (negative motor output has no physical meaning)
	BRAIN.accumWalkLeft = Math.max(0, BRAIN.accumWalkLeft);
	BRAIN.accumWalkRight = Math.max(0, BRAIN.accumWalkRight);
	BRAIN.accumFlight = Math.max(0, BRAIN.accumFlight);
	BRAIN.accumFeed = Math.max(0, BRAIN.accumFeed);
	BRAIN.accumGroom = Math.max(0, BRAIN.accumGroom);
	BRAIN.accumStartle = Math.max(0, BRAIN.accumStartle);
	BRAIN.accumHead = Math.max(0, BRAIN.accumHead);

	// --- Backward compatibility: accumleft / accumright ---
	// These are what main.js reads to compute direction and speed.
	// Map walk accumulators to the old left/right system.
	BRAIN.accumleft = BRAIN.accumWalkLeft;
	BRAIN.accumright = BRAIN.accumWalkRight;

	// If flying, add wing activation to both sides (forward thrust)
	if (BRAIN.accumFlight > 10) {
		BRAIN.accumleft += BRAIN.accumFlight * 0.5;
		BRAIN.accumright += BRAIN.accumFlight * 0.5;
	}
};
