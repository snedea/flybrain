// ============================================================
// Section 1: Assertion Helpers
// ============================================================

function TestFailure(message) {
	this.message = message;
}

function assertEqual(actual, expected, msg) {
	if (actual !== expected) {
		throw new TestFailure(msg + ': expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
	}
}

function assertTrue(value, msg) {
	if (!value) {
		throw new TestFailure(msg + ': expected truthy but got ' + JSON.stringify(value));
	}
}

function assertClose(actual, expected, tolerance, msg) {
	if (Math.abs(actual - expected) > tolerance) {
		throw new TestFailure(msg + ': expected ' + expected + ' ± ' + tolerance + ' but got ' + actual);
	}
}

function withMockedRandom(mockValue, fn) {
	var origRandom = Math.random;
	Math.random = function () { return mockValue; };
	try {
		fn();
	} finally {
		Math.random = origRandom;
	}
}

// ============================================================
// Section 2: Mutable Test State and Reset Helper
// ============================================================

// Mutable test state (these globals are used by the shared
// functions in fly-logic.js: evaluateBehaviorEntry, isCoolingDown, hasNearbyFood)
var behavior = { current: 'idle', enterTime: 0, cooldowns: {} };
var food = [];
var fly = { x: 400, y: 300 };

function resetBrainState() {
	BRAIN.setup();
	BRAIN.thisState = 0;
	BRAIN.nextState = 1;
	BRAIN.accumWalkLeft = 0;
	BRAIN.accumWalkRight = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.accumStartle = 0;
	BRAIN.accumHead = 0;
	BRAIN.accumleft = 0;
	BRAIN.accumright = 0;
	BRAIN._isMoving = false;
	BRAIN._isFeeding = false;
	BRAIN._isGrooming = false;
	BRAIN.stimulate = {
		touch: false,
		touchLocation: null,
		foodNearby: false,
		foodContact: false,
		dangerOdor: false,
		wind: false,
		windStrength: 0,
		windDirection: 0,
		lightLevel: 1,
		nociception: false,
		temperature: 0.5,
	};
	BRAIN.drives = {
		hunger: 0.3,
		fear: 0.0,
		fatigue: 0.0,
		curiosity: 0.5,
		groom: 0.1,
	};
	behavior = { current: 'idle', enterTime: 0, cooldowns: {} };
	food = [];
	fly = { x: 400, y: 300 };
}

// ============================================================
// Section 3: Test Functions
// ============================================================

// --- Connectome Signal Propagation Tests ---

function test_setup_initializes_all_neurons() {
	resetBrainState();
	for (var pre in weights) {
		assertTrue(BRAIN.postSynaptic[pre] !== undefined, 'missing postSynaptic for ' + pre);
		for (var post in weights[pre]) {
			assertTrue(BRAIN.postSynaptic[post] !== undefined, 'missing postSynaptic for target ' + post);
		}
	}
	assertEqual(BRAIN.postSynaptic['VIS_R1R6'][0], 0, 'VIS_R1R6 state 0');
	assertEqual(BRAIN.postSynaptic['VIS_R1R6'][1], 0, 'VIS_R1R6 state 1');
}

function test_dendriteAccumulate_propagates_to_targets() {
	resetBrainState();
	BRAIN.dendriteAccumulate('VIS_R1R6');
	assertEqual(BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState], 8, 'VIS_R1R6 -> VIS_ME weight 8');
	assertEqual(BRAIN.postSynaptic['VIS_LPTC'][BRAIN.nextState], 4, 'VIS_R1R6 -> VIS_LPTC weight 4');
	assertEqual(BRAIN.postSynaptic['DRIVE_CURIOSITY'][BRAIN.nextState], 2, 'VIS_R1R6 -> DRIVE_CURIOSITY weight 2');
	assertEqual(BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState], 0, 'MN_PROBOSCIS should be untouched');
}

function test_dendriteAccumulate_is_additive() {
	resetBrainState();
	BRAIN.dendriteAccumulate('VIS_R1R6');
	BRAIN.dendriteAccumulate('VIS_R1R6');
	assertEqual(BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState], 16, 'VIS_ME should be 8*2=16 after two accumulations');
}

function test_dendriteAccumulateScaled_applies_scale() {
	resetBrainState();
	BRAIN.dendriteAccumulateScaled('VIS_R1R6', 0.5);
	assertEqual(BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState], Math.round(8 * 0.5), 'VIS_ME scaled to 4');
	assertEqual(BRAIN.postSynaptic['VIS_LPTC'][BRAIN.nextState], Math.round(4 * 0.5), 'VIS_LPTC scaled to 2');
}

function test_fireNeuron_cascades_and_resets() {
	resetBrainState();
	BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState] = 50;
	BRAIN.fireNeuron('VIS_ME');
	assertEqual(BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState], 0, 'VIS_ME reset after firing');
	assertEqual(BRAIN.postSynaptic['VIS_LO'][BRAIN.nextState], 7, 'VIS_ME -> VIS_LO weight 7');
	assertEqual(BRAIN.postSynaptic['VIS_LPTC'][BRAIN.nextState], 6, 'VIS_ME -> VIS_LPTC weight 6');
}

function test_readMotor_drains_to_zero() {
	resetBrainState();
	BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState] = 25;
	BRAIN.motorcontrol();
	assertEqual(BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState], 0, 'MN_PROBOSCIS drained to 0');
	assertEqual(BRAIN.accumFeed, 25, 'accumFeed should be 25');
}

function test_motor_accumulator_floors_at_zero() {
	resetBrainState();
	BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState] = -5;
	BRAIN.motorcontrol();
	assertEqual(BRAIN.accumFeed, 0, 'accumFeed floored at 0');
}

// --- Drive System Tests ---

function test_hunger_increases_per_tick() {
	resetBrainState();
	BRAIN.drives.hunger = 0.3;
	BRAIN._isFeeding = false;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.hunger, 0.305, 0.0001, 'hunger increase');
}

function test_hunger_decreases_when_feeding() {
	resetBrainState();
	BRAIN.drives.hunger = 0.5;
	BRAIN._isFeeding = true;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.hunger, 0.205, 0.0001, 'hunger decrease when feeding');
}

function test_fear_spikes_on_touch() {
	resetBrainState();
	BRAIN.drives.fear = 0.0;
	BRAIN.stimulate.touch = true;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.fear, 0.255, 0.0001, 'fear spike on touch');
}

function test_fear_exponential_decay() {
	resetBrainState();
	BRAIN.drives.fear = 1.0;
	BRAIN.stimulate.touch = false;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.dangerOdor = false;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.fear, 0.85, 0.0001, 'fear decay');
}

function test_drives_clamped_to_zero() {
	resetBrainState();
	BRAIN.drives.hunger = 0.0;
	BRAIN._isFeeding = true;
	BRAIN.updateDrives();
	assertEqual(BRAIN.drives.hunger, 0, 'hunger clamped at zero');
}

function test_drives_clamped_to_one() {
	resetBrainState();
	BRAIN.drives.hunger = 0.999;
	BRAIN._isFeeding = false;
	BRAIN.updateDrives();
	assertEqual(BRAIN.drives.hunger, 1, 'hunger clamped at one');
}

function test_fear_wind_contribution() {
	resetBrainState();
	BRAIN.drives.fear = 0.0;
	BRAIN.stimulate.wind = true;
	BRAIN.stimulate.windStrength = 0.8;
	BRAIN.stimulate.touch = false;
	BRAIN.stimulate.dangerOdor = false;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.fear, 0.136, 0.0001, 'fear from wind');
}

function test_fear_no_wind_contribution_below_threshold() {
	resetBrainState();
	BRAIN.drives.fear = 0.0;
	BRAIN.stimulate.wind = true;
	BRAIN.stimulate.windStrength = 0.5;
	BRAIN.stimulate.touch = false;
	BRAIN.stimulate.dangerOdor = false;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.fear, 0.0, 0.0001, 'no fear from weak wind');
}

// --- Angle Normalization Tests ---

function test_normalizeAngle_zero() {
	assertClose(normalizeAngle(0), 0, 0.0001, 'normalizeAngle(0)');
}

function test_normalizeAngle_pi() {
	assertClose(normalizeAngle(Math.PI), Math.PI, 0.0001, 'normalizeAngle(PI)');
}

function test_normalizeAngle_neg_pi() {
	assertClose(normalizeAngle(-Math.PI), -Math.PI, 0.0001, 'normalizeAngle(-PI)');
}

function test_normalizeAngle_3pi() {
	assertClose(normalizeAngle(3 * Math.PI), Math.PI, 0.0001, 'normalizeAngle(3PI)');
}

function test_normalizeAngle_neg5pi() {
	assertClose(normalizeAngle(-5 * Math.PI), -Math.PI, 0.0001, 'normalizeAngle(-5PI)');
}

function test_normalizeAngle_large_positive() {
	var result = normalizeAngle(7);
	assertTrue(result >= -Math.PI && result <= Math.PI, 'normalizeAngle(7) in range');
	assertClose(result, 7 - 2 * Math.PI, 0.0001, 'normalizeAngle(7) value');
}

// --- Behavior Threshold Tests ---

function test_startle_entry() {
	resetBrainState();
	BRAIN.accumStartle = 35;
	behavior.cooldowns = {};
	assertEqual(evaluateBehaviorEntry(), 'startle', 'startle entry');
}

function test_startle_blocked_by_cooldown() {
	resetBrainState();
	BRAIN.accumStartle = 35;
	behavior.cooldowns = { startle: Date.now() + 10000 };
	assertTrue(evaluateBehaviorEntry() !== 'startle', 'startle blocked by cooldown');
}

function test_fly_entry() {
	resetBrainState();
	BRAIN.accumFlight = 20;
	BRAIN.accumStartle = 0;
	assertEqual(evaluateBehaviorEntry(), 'fly', 'fly entry');
}

function test_feed_entry() {
	resetBrainState();
	BRAIN.accumFeed = 10;
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	food = [{ x: fly.x + 10, y: fly.y }];
	assertEqual(evaluateBehaviorEntry(), 'feed', 'feed entry');
}

function test_feed_blocked_without_food() {
	resetBrainState();
	BRAIN.accumFeed = 10;
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	food = [];
	assertTrue(evaluateBehaviorEntry() !== 'feed', 'feed blocked without food');
}

function test_groom_entry() {
	resetBrainState();
	BRAIN.accumGroom = 10;
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	assertEqual(evaluateBehaviorEntry(), 'groom', 'groom entry');
}

function test_rest_entry_high_fatigue() {
	resetBrainState();
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.accumWalkLeft = 0;
	BRAIN.accumWalkRight = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.drives.fatigue = 0.8;
	assertEqual(evaluateBehaviorEntry(), 'rest', 'rest entry from fatigue');
}

function test_rest_lower_threshold_in_dark() {
	resetBrainState();
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.accumWalkLeft = 0;
	BRAIN.accumWalkRight = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN.drives.fatigue = 0.5;
	assertEqual(evaluateBehaviorEntry(), 'rest', 'rest entry in dark');
}

function test_brace_entry() {
	resetBrainState();
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.stimulate.wind = true;
	BRAIN.stimulate.windStrength = 0.3;
	assertEqual(evaluateBehaviorEntry(), 'brace', 'brace entry');
}

function test_idle_when_nothing_active() {
	resetBrainState();
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.accumWalkLeft = 0;
	BRAIN.accumWalkRight = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.drives.fatigue = 0.0;
	BRAIN.drives.curiosity = 0.0;
	assertEqual(evaluateBehaviorEntry(), 'idle', 'idle when nothing active');
}

function test_priority_startle_over_feed() {
	resetBrainState();
	BRAIN.accumStartle = 35;
	BRAIN.accumFeed = 10;
	food = [{ x: fly.x + 10, y: fly.y }];
	assertEqual(evaluateBehaviorEntry(), 'startle', 'startle priority over feed');
}

// --- T5.2: Dark Settling Drive Modulation Tests ---

function test_dark_fatigue_gain_doubled() {
	resetBrainState();
	BRAIN.stimulate.lightLevel = 0.2; // < 0.3 threshold
	BRAIN._isMoving = true;
	BRAIN.drives.fatigue = 0.0;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.fatigue, 0.006, 0.0001, 'fatigue gain doubled in dark (0.006)');
}

function test_bright_fatigue_gain_normal() {
	resetBrainState();
	BRAIN.stimulate.lightLevel = 0.5; // >= 0.3 threshold
	BRAIN._isMoving = true;
	BRAIN.drives.fatigue = 0.0;
	BRAIN.updateDrives();
	assertClose(BRAIN.drives.fatigue, 0.003, 0.0001, 'fatigue gain normal in bright (0.003)');
}

function test_dark_curiosity_range_reduced() {
	resetBrainState();
	BRAIN.stimulate.lightLevel = 0.2; // < 0.3 threshold
	BRAIN.drives.curiosity = 0.5;
	withMockedRandom(1.0, function () {
		BRAIN.updateDrives();
	});
	// (1.0 - 0.5) * 0.02 = 0.01, curiosity = 0.5 + 0.01 = 0.51
	assertClose(BRAIN.drives.curiosity, 0.51, 0.001, 'dark curiosity range is 0.02');
}

function test_bright_curiosity_range_normal() {
	resetBrainState();
	BRAIN.stimulate.lightLevel = 0.5; // >= 0.3 threshold
	BRAIN.drives.curiosity = 0.5;
	withMockedRandom(1.0, function () {
		BRAIN.updateDrives();
	});
	// (1.0 - 0.5) * 0.06 = 0.03, curiosity = 0.5 + 0.03 = 0.53
	assertClose(BRAIN.drives.curiosity, 0.53, 0.001, 'bright curiosity range is 0.06');
}

function test_tonic_injection_halved_in_dark() {
	// lightLevel=0 → tonic=4; lightLevel=0.15 (below visual threshold 0.2) → tonic=8
	// With zero drives and no stimuli, tonic is the ONLY signal into CX_FC.
	// CX_FC value after one tick: tonic level (< fireThreshold 22, so no cascade).
	resetBrainState();
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0;
	BRAIN._isMoving = false;
	BRAIN.update();
	var darkVal = BRAIN.postSynaptic['CX_FC'][BRAIN.thisState];

	resetBrainState();
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN.stimulate.lightLevel = 0.15; // not zero → tonic=8, but below 0.2 → no visual pathway
	BRAIN._isMoving = false;
	BRAIN.update();
	var dimVal = BRAIN.postSynaptic['CX_FC'][BRAIN.thisState];

	assertEqual(darkVal, 4, 'CX_FC tonic in complete dark should be 4');
	assertEqual(dimVal, 8, 'CX_FC tonic in dim (non-zero light) should be 8');
}

// --- T5.3: Temperature Stimulus Routing Tests ---

function test_temperature_warm_activates_pathway() {
	resetBrainState();
	BRAIN.stimulate.temperature = 0.75; // > 0.65 → THERMO_WARM fires
	BRAIN.stimulate.lightLevel = 0.15; // below visual threshold
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN._isMoving = false;
	BRAIN.update();
	// THERMO_WARM → LH_AV: weight 3, warmIntensity = (0.75-0.5)*2 = 0.5
	// Math.round(3 * 0.5) = 2, so LH_AV should be 2 (no other source active)
	assertTrue(BRAIN.postSynaptic['LH_AV'][BRAIN.thisState] > 0,
		'warm temperature activates LH_AV via THERMO_WARM');
}

function test_temperature_cool_activates_pathway() {
	resetBrainState();
	BRAIN.stimulate.temperature = 0.25; // < 0.35 → THERMO_COOL fires
	BRAIN.stimulate.lightLevel = 0.15;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN._isMoving = false;
	BRAIN.update();
	// THERMO_COOL → LH_APP: weight 2, coolIntensity = (0.5-0.25)*2 = 0.5
	// Math.round(2 * 0.5) = 1, so LH_APP should be 1
	assertTrue(BRAIN.postSynaptic['LH_APP'][BRAIN.thisState] > 0,
		'cool temperature activates LH_APP via THERMO_COOL');
}

function test_temperature_neutral_no_thermo() {
	resetBrainState();
	BRAIN.stimulate.temperature = 0.5; // neutral: not > 0.65 and not < 0.35
	BRAIN.stimulate.lightLevel = 0.15;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN._isMoving = false;
	BRAIN.update();
	// Neither THERMO_WARM nor THERMO_COOL should fire
	assertEqual(BRAIN.postSynaptic['LH_AV'][BRAIN.thisState], 0,
		'neutral temperature does not activate LH_AV');
	assertEqual(BRAIN.postSynaptic['LH_APP'][BRAIN.thisState], 0,
		'neutral temperature does not activate LH_APP');
}

// --- T5.3: Nociception Tests ---

function test_nociception_auto_clears() {
	resetBrainState();
	BRAIN.stimulate.nociception = true;
	BRAIN.update();
	assertEqual(BRAIN.stimulate.nociception, false, 'nociception auto-clears after one tick');
}

function test_nociception_activates_startle_pathway() {
	resetBrainState();
	BRAIN.stimulate.nociception = true;
	BRAIN.stimulate.lightLevel = 0.15;
	BRAIN.drives.hunger = 0; BRAIN.drives.fear = 0; BRAIN.drives.fatigue = 0;
	BRAIN.drives.curiosity = 0; BRAIN.drives.groom = 0;
	BRAIN._isMoving = false;
	BRAIN.update();
	// NOCI → DN_STARTLE weight 10. After one tick, DN_STARTLE[thisState] = 10.
	assertTrue(BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState] > 0,
		'nociception activates DN_STARTLE pathway');
}

// --- T5.1: Brace Entry Condition Tests ---

function test_brace_blocked_by_strong_wind() {
	resetBrainState();
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.stimulate.wind = true;
	BRAIN.stimulate.windStrength = 0.7; // >= 0.5 threshold
	assertTrue(evaluateBehaviorEntry() !== 'brace', 'brace blocked when windStrength >= 0.5');
}

function test_brace_blocked_by_no_wind() {
	resetBrainState();
	BRAIN.accumStartle = 0;
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.stimulate.wind = false;
	BRAIN.stimulate.windStrength = 0.3;
	assertTrue(evaluateBehaviorEntry() !== 'brace', 'brace blocked when wind is not active');
}

function test_brace_blocked_by_high_startle() {
	resetBrainState();
	BRAIN.accumStartle = 35; // > threshold 30
	BRAIN.accumFlight = 0;
	BRAIN.accumFeed = 0;
	BRAIN.accumGroom = 0;
	BRAIN.stimulate.wind = true;
	BRAIN.stimulate.windStrength = 0.3;
	var result = evaluateBehaviorEntry();
	assertEqual(result, 'startle', 'high startle takes priority over brace');
}

// ============================================================
// Section 4: Test Runner
// ============================================================

function runAllTests() {
	var scope = typeof globalThis !== 'undefined' ? globalThis :
	            typeof window !== 'undefined' ? window :
	            typeof global !== 'undefined' ? global : this;
	var tests = [];
	for (var key in scope) {
		if (key.indexOf('test_') === 0 && typeof scope[key] === 'function') {
			tests.push({ name: key, fn: scope[key] });
		}
	}
	tests.sort(function (a, b) {
		return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
	});

	var passed = 0, failed = 0, failures = [];
	var resultsHTML = '';
	for (var i = 0; i < tests.length; i++) {
		var test = tests[i];
		try {
			test.fn();
			passed++;
			resultsHTML += '<div class="test-result pass">' + test.name + '</div>';
		} catch (e) {
			failed++;
			var msg = test.name + ': ' + (e.message || e);
			failures.push(msg);
			resultsHTML += '<div class="test-result fail">' + msg + '</div>';
		}
	}

	// DOM output (browser path)
	if (typeof document !== 'undefined') {
		var resultsEl = document.getElementById('results');
		if (resultsEl) resultsEl.innerHTML = resultsHTML;
		var summaryEl = document.getElementById('summary');
		if (summaryEl) {
			var total = passed + failed;
			summaryEl.innerHTML = '<span class="summary-pass">' + passed + ' passed</span> / <span class="summary-fail">' + failed + ' failed</span> / ' + total + ' total';
		}
	}

	// CLI output (always log to console when available)
	if (typeof console !== 'undefined') {
		var total = passed + failed;
		console.log(passed + ' passed / ' + failed + ' failed / ' + total + ' total');
		for (var f = 0; f < failures.length; f++) {
			console.log('FAIL ' + failures[f]);
		}
	}

	// Node.js exit code (surface failures to CI/automation)
	if (failed > 0 && typeof process !== 'undefined') {
		process.exitCode = 1;
	}
}

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
	withMockedRandom(0.5, function () {
		// Idle tonic: moderate descending + central complex activity
		BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 5;
		BRAIN.postSynaptic['VNC_CPG'][BRAIN.nextState] = 1;
		BRAIN.postSynaptic['CX_PFN'][BRAIN.nextState] = 3;
		BRAIN.postSynaptic['CX_FC'][BRAIN.nextState] = 2;
		BRAIN.postSynaptic['CX_EPG'][BRAIN.nextState] = 2;

		BRAIN._bridge.synthesizeMotorOutputs();
		BRAIN.motorcontrol();
	});

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
	withMockedRandom(0.5, function () {
		BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 3;
		BRAIN.postSynaptic['DRIVE_FEAR'][BRAIN.nextState] = 8;
		BRAIN.postSynaptic['MB_MBON_AV'][BRAIN.nextState] = 2;
		BRAIN.postSynaptic['LH_AV'][BRAIN.nextState] = 1;

		BRAIN._bridge.synthesizeMotorOutputs();
		BRAIN.motorcontrol();
	});

	// flightIntent = 8*2 + (2+1)*0.8 + 0 + 0 = 18.4 > 1.0
	// flightDrive = 18.4*0.6*0.7 = 7.728
	// accumFlight = 7.728*2 = 15.456
	assertTrue(BRAIN.accumFlight > 15,
		'flight exceeds gate with high DRIVE_FEAR, got ' + BRAIN.accumFlight.toFixed(2));
};

var test_bridge_synthesize_groom = function () {
	resetBrainState();
	withMockedRandom(0.5, function () {
		BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 3;
		BRAIN.postSynaptic['DRIVE_GROOM'][BRAIN.nextState] = 5;
		BRAIN.postSynaptic['SEZ_GROOM'][BRAIN.nextState] = 2;

		BRAIN._bridge.synthesizeMotorOutputs();
		BRAIN.motorcontrol();
	});

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
	withMockedRandom(0.5, function () {
		BRAIN.postSynaptic['GNG_DESC'][BRAIN.nextState] = 3;
		BRAIN.postSynaptic['SEZ_FEED'][BRAIN.nextState] = 3;
		BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState] = 2;

		BRAIN._bridge.synthesizeMotorOutputs();
		BRAIN.motorcontrol();
	});

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
	withMockedRandom(0.5, function () {
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
	});

	// After updateDrives: fear = 0.8 * 0.85 = 0.68 (no touch/wind/danger)
	// Virtual bypass: postSynaptic['DRIVE_FEAR'][nextState] = 0.68 * 100 = 68
	// After state swap: thisState has the value
	var FSS = BRAIN._bridge.FIRE_STATE_SCALE;
	assertClose(BRAIN.postSynaptic['DRIVE_FEAR'][BRAIN.thisState], 0.68 * FSS, 0.5,
		'virtual bypass writes fear drive to postSynaptic');
};

var test_bridge_virtual_bypass_curiosity = function () {
	resetBrainState();
	withMockedRandom(0.5, function () {
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
	});

	// After updateDrives with Math.random=0.5: curiosity += (0.5-0.5)*range = 0
	// curiosity stays 0.6
	// Virtual bypass: 0.6 * 100 = 60
	var FSS = BRAIN._bridge.FIRE_STATE_SCALE;
	assertClose(BRAIN.postSynaptic['DRIVE_CURIOSITY'][BRAIN.thisState], 0.6 * FSS, 0.5,
		'virtual bypass writes curiosity drive to postSynaptic');
};

var test_bridge_virtual_bypass_groom = function () {
	resetBrainState();
	withMockedRandom(0.5, function () {
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
	});

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
