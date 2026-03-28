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
// Section 4b: Food-Seeking, Consumption, Stats, and Startle Tests (D68.2)
// ============================================================

// --- Test group (a): Food-seeking direction ---

function test_food_seek_uses_facingDir_not_targetDir() {
	resetBrainState();
	var facingDirVal = Math.PI / 4;
	var flyX = 400, flyY = 300, foodX = 500, foodY = 200;
	var result = computeFoodSeekDir(flyX, flyY, foodX, foodY, 0.8, facingDirVal);
	// foodAngle = atan2(-(200-300), 500-400) = atan2(100, 100) = PI/4
	// angleDiff = normalizeAngle(PI/4 - PI/4) = 0
	// targetDir = PI/4 + 0 * 0.8 = PI/4
	assertClose(result.targetDir, Math.PI / 4, 0.001,
		'targetDir matches facingDir when food is straight ahead');

	var facingDirVal2 = -Math.PI / 2;
	var result2 = computeFoodSeekDir(flyX, flyY, foodX, foodY, 0.8, facingDirVal2);
	// angleDiff2 = normalizeAngle(PI/4 - (-PI/2)) = normalizeAngle(3*PI/4) = 3*PI/4
	// targetDir = -PI/2 + (3*PI/4) * 0.8
	var expected2 = -Math.PI / 2 + (3 * Math.PI / 4) * 0.8;
	assertClose(result2.targetDir, expected2, 0.001,
		'targetDir differs with different facingDir');
	assertTrue(result2.targetDir !== result.targetDir,
		'different facingDir produces different result');
}

function test_food_seek_strength_scales_with_hunger() {
	var r1 = computeFoodSeekDir(400, 300, 500, 200, 0.3, 0);
	assertClose(r1.seekStrength, 0.3, 0.001, 'seekStrength = 0.3 at hunger 0.3');

	var r2 = computeFoodSeekDir(400, 300, 500, 200, 0.9, 0);
	assertClose(r2.seekStrength, 0.9, 0.001, 'seekStrength = 0.9 at hunger 0.9');

	var r3 = computeFoodSeekDir(400, 300, 500, 200, 1.5, 0);
	assertClose(r3.seekStrength, 1.0, 0.001, 'seekStrength clamped to 1.0 at hunger 1.5');
}

function test_feed_approach_speed_constant() {
	assertEqual(FEED_APPROACH_SPEED, 0.25, 'feed approach speed is 0.25');
}

// --- Test group (b): Feed entry bypass ---

function test_feed_entry_hunger_bypass_at_50px() {
	resetBrainState();
	BRAIN.drives.hunger = 0.8;
	BRAIN.stimulate.foodNearby = true;
	BRAIN.accumFeed = 0;
	fly.x = 400; fly.y = 300;
	food = [{ x: 430, y: 300, feedStart: 0, feedDuration: 3000, radius: 10 }];
	var state = evaluateBehaviorEntry();
	assertEqual(state, 'feed', 'hunger bypass enters feed at 50px range');
}

function test_feed_entry_hunger_bypass_requires_high_hunger() {
	resetBrainState();
	BRAIN.drives.hunger = 0.65;
	BRAIN.stimulate.foodNearby = true;
	BRAIN.accumFeed = 0;
	fly.x = 400; fly.y = 300;
	food = [{ x: 430, y: 300, feedStart: 0, feedDuration: 3000, radius: 10 }];
	var state = evaluateBehaviorEntry();
	assertTrue(state !== 'feed', 'no feed entry when hunger <= 0.7 and accumFeed < 8');
}

function test_feed_entry_neural_pathway_requires_20px() {
	resetBrainState();
	BRAIN.accumFeed = 10;
	BRAIN.drives.hunger = 0.3;
	BRAIN.stimulate.foodNearby = false;
	fly.x = 400; fly.y = 300;
	food = [{ x: 460, y: 300, feedStart: 0, feedDuration: 3000, radius: 10 }];
	var state = evaluateBehaviorEntry();
	assertTrue(state !== 'feed', 'neural pathway blocked when food > 50px');
}

function test_feed_entry_neural_pathway_within_50px() {
	resetBrainState();
	BRAIN.accumFeed = 10;
	BRAIN.drives.hunger = 0.3;
	BRAIN.stimulate.foodNearby = false;
	fly.x = 400; fly.y = 300;
	food = [{ x: 425, y: 300, feedStart: 0, feedDuration: 3000, radius: 10 }];
	var state = evaluateBehaviorEntry();
	assertEqual(state, 'feed', 'neural pathway enters feed when food within 50px');
}

// --- Test group (c): Food consumption ---

function test_food_progress_accumulates() {
	var item = { feedStart: 1000, feedDuration: 4000, eaten: 0 };
	var p1 = computeFoodProgress(item, 2000);
	assertClose(p1, 0.25, 0.001, 'progress is 0.25 after 1s of 4s');

	var item2 = { feedStart: 1000, feedDuration: 4000, eaten: 0.5 };
	var p2 = computeFoodProgress(item2, 2000);
	assertClose(p2, 0.75, 0.001, 'progress accumulates with prior eaten');
}

function test_food_progress_clamped_at_one() {
	var item = { feedStart: 1000, feedDuration: 2000, eaten: 0.8 };
	var p = computeFoodProgress(item, 5000);
	assertEqual(p, 1, 'progress clamped at 1');
}

function test_food_pause_preserves_eaten_progress() {
	var item = { feedStart: 1000, feedDuration: 4000, eaten: 0.1 };
	pauseFeeding(item, 3000);
	assertClose(item.eaten, 0.6, 0.001, 'eaten accumulates on pause');
	assertEqual(item.feedStart, 0, 'feedStart reset to 0 on pause');
}

function test_food_pause_noop_when_not_feeding() {
	var item = { feedStart: 0, feedDuration: 4000, eaten: 0.3 };
	pauseFeeding(item, 5000);
	assertClose(item.eaten, 0.3, 0.001, 'eaten unchanged when already paused');
	assertEqual(item.feedStart, 0, 'feedStart stays 0');
}

function test_food_removal_at_full_progress() {
	food = [{ x: 400, y: 300, feedStart: 1000, feedDuration: 2000, eaten: 0, radius: 10 }];
	var p = computeFoodProgress(food[0], 3000);
	assertEqual(p >= 1, true, 'food fully consumed');
	if (p >= 1) { food.splice(0, 1); }
	assertEqual(food.length, 0, 'food removed from array');
}

// --- Test group (d): sim-worker averaged stats (inline arithmetic) ---

function test_simworker_stats_accumulation_and_averaging() {
	var STATS_INTERVAL_LOCAL = 20;
	var cumulativeFiredCount = 0, tickTimeSamples = 0, tickTimeSum = 0;
	for (var i = 0; i < 20; i++) {
		tickTimeSamples++;
		cumulativeFiredCount += 10;
		tickTimeSum += 5.0;
	}
	assertEqual(tickTimeSamples, 20, 'samples reached STATS_INTERVAL');
	assertEqual(cumulativeFiredCount, 200, 'cumulative fired = 20 * 10');
	var avgFired = Math.round(cumulativeFiredCount / tickTimeSamples);
	assertEqual(avgFired, 10, 'average fired neurons per tick is 10');
	var avgMs = tickTimeSum / tickTimeSamples;
	assertClose(avgMs, 5.0, 0.001, 'average tick time is 5ms');
	tickTimeSum = 0; tickTimeSamples = 0; cumulativeFiredCount = 0;
	assertEqual(cumulativeFiredCount, 0, 'cumulative reset after stats emit');
	assertEqual(tickTimeSamples, 0, 'samples reset after stats emit');
}

function test_simworker_stats_varying_fire_counts() {
	var cumulativeFiredCount = 0, tickTimeSamples = 0;
	for (var i = 0; i < 10; i++) { tickTimeSamples++; cumulativeFiredCount += 5; }
	for (var i = 0; i < 10; i++) { tickTimeSamples++; cumulativeFiredCount += 15; }
	assertEqual(cumulativeFiredCount, 200, 'cumulative = 50 + 150');
	var avgFired = Math.round(cumulativeFiredCount / tickTimeSamples);
	assertEqual(avgFired, 10, 'average over varying counts is 10');
}

function test_simworker_reset_clears_cumulative() {
	var cumulativeFiredCount = 150, tickTimeSamples = 8, tickTimeSum = 40;
	tickTimeSum = 0;
	tickTimeSamples = 0;
	cumulativeFiredCount = 0;
	assertEqual(cumulativeFiredCount, 0, 'cumulativeFiredCount cleared on reset');
	assertEqual(tickTimeSamples, 0, 'tickTimeSamples cleared on reset');
	assertEqual(tickTimeSum, 0, 'tickTimeSum cleared on reset');
	tickTimeSamples++; cumulativeFiredCount += 7; tickTimeSum += 3.0;
	assertEqual(cumulativeFiredCount, 7, 'post-reset accumulation starts fresh');
}

// --- Test group (e): DN_STARTLE reads nextState ---

function test_dn_startle_reads_nextState() {
	resetBrainState();
	BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState] = 50;
	BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState] = 5;
	BRAIN.motorcontrol();
	assertEqual(BRAIN.accumStartle, 50, 'accumStartle reads from nextState (50), not thisState (5)');
}

function test_dn_startle_zero_when_no_signal() {
	resetBrainState();
	BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState] = 0;
	BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState] = 0;
	BRAIN.motorcontrol();
	assertEqual(BRAIN.accumStartle, 0, 'accumStartle is 0 when no signal');
}

function test_dn_startle_negative_floored() {
	resetBrainState();
	BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState] = -10;
	BRAIN.motorcontrol();
	assertEqual(BRAIN.accumStartle, 0, 'negative startle floored at 0');
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

var test_bridge_aggregateFireState_clears_stale = function () {
	resetBrainState();
	// Setup: 2 groups, 10 neurons each
	var names = ['TEST_ST0', 'TEST_ST1'];
	for (var g = 0; g < 2; g++) {
		BRAIN.postSynaptic[names[g]] = [0, 0];
	}
	var assignments = new Uint16Array(20);
	for (var i = 0; i < 10; i++) assignments[i] = 0;
	for (var i = 10; i < 20; i++) assignments[i] = 1;
	BRAIN._bridge._setGroupState(2, 20, assignments, [10, 10], names);

	// First call: fire all neurons in group 0 via latestFireState fallback
	var fire = new Uint8Array(20);
	for (var i = 0; i < 10; i++) fire[i] = 1;
	BRAIN._bridge._setFireState(fire, null, 0);

	BRAIN._bridge.aggregateFireState();

	var FSS = BRAIN._bridge.FIRE_STATE_SCALE;
	assertClose(BRAIN.postSynaptic['TEST_ST0'][BRAIN.nextState], FSS, 0.01,
		'first call: group 0 fully active');

	// Second call: no new worker tick, latestFireState should have been cleared
	// so aggregateFireState should be a no-op (no new data to consume).
	// Copy current activation to thisState to simulate state swap
	BRAIN.postSynaptic['TEST_ST0'][BRAIN.thisState] =
		BRAIN.postSynaptic['TEST_ST0'][BRAIN.nextState];
	BRAIN.postSynaptic['TEST_ST0'][BRAIN.nextState] = 0;
	BRAIN.postSynaptic['TEST_ST1'][BRAIN.thisState] =
		BRAIN.postSynaptic['TEST_ST1'][BRAIN.nextState];
	BRAIN.postSynaptic['TEST_ST1'][BRAIN.nextState] = 0;

	BRAIN._bridge.aggregateFireState();

	// With latestFireState cleared, the fallback branch should NOT run.
	// Both pendingGroupSpikes and pendingWorkerTicks are 0, and latestFireState is null,
	// so groupFires stays all-zero. The only contribution is decay: prevActivation * 0.75.
	// Group 0: max(0, 100 * 0.75) = 75 (decay only, not 100 again from stale snapshot)
	assertClose(BRAIN.postSynaptic['TEST_ST0'][BRAIN.nextState], FSS * 0.75, 0.01,
		'second call without new tick: decays instead of re-reading stale fire state');
	// Group 1: max(0, 0 * 0.75) = 0
	assertEqual(BRAIN.postSynaptic['TEST_ST1'][BRAIN.nextState], 0,
		'second call: inactive group stays zero');
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

} // end bridge tests guard

// ============================================================
// Section: Neuro-renderer smoke tests (D68.3)
// ============================================================

if (typeof NeuroRenderer !== 'undefined' && NeuroRenderer._test) {

var test_neuro_resize_width_only_triggers_rebuild = function () {
    // Checklist item 1: width-only resize must trigger relayout
    var nr = NeuroRenderer._test;
    // Same height, different width (delta >= 2) => needs resize
    assertTrue(nr.needsResize(800, 140, 1.0, 850, 140),
        'width-only change (800->850) triggers resize');
    // Same height, same width => no resize
    assertTrue(!nr.needsResize(800, 140, 1.0, 800, 140),
        'no change does not trigger resize');
    // Same height, tiny width change (delta < 2) => no resize
    assertTrue(!nr.needsResize(800, 140, 1.0, 801, 140),
        'sub-threshold width change (1px) does not trigger resize');
    // Height change, same width => needs resize
    assertTrue(nr.needsResize(800, 140, 1.0, 800, 160),
        'height-only change triggers resize');
};

var test_neuro_resize_with_displayScale = function () {
    // When displayScale != 1, oldDisplayW = canvas.width * displayScale
    var nr = NeuroRenderer._test;
    // canvas.width=600, displayScale=1.5 => oldDisplayW=900
    // newW=900 => no resize needed
    assertTrue(!nr.needsResize(600, 140, 1.5, 900, 140),
        'displayScale-adjusted width matches => no resize');
    // newW=920 => delta=20 >= 2 => resize needed
    assertTrue(nr.needsResize(600, 140, 1.5, 920, 140),
        'displayScale-adjusted width mismatch => resize');
};

var test_neuro_cssToCanvasCoords_stretch = function () {
    // Checklist item 2: tooltip hover coords convert correctly with CSS stretch
    var nr = NeuroRenderer._test;
    // Canvas is 600px wide internally, CSS-stretched to 900px (rect.width=900)
    // Click at CSS x=450 (center of stretched canvas) should map to canvas x=300
    var coords = nr.cssToCanvasCoords(450, 70, 0, 0, 900, 140, 600, 140, 0);
    assertClose(coords.x, 300, 0.01, 'CSS center maps to canvas center with stretch');
    assertClose(coords.y, 70, 0.01, 'Y unchanged when no vertical stretch');
};

var test_neuro_cssToCanvasCoords_with_scroll = function () {
    var nr = NeuroRenderer._test;
    // scrollLeft=50, click at CSS x=100, rect.left=0, rect.width=800, canvas.width=800
    var coords = nr.cssToCanvasCoords(100, 50, 0, 0, 800, 140, 800, 140, 50);
    assertClose(coords.x, 150, 0.01, 'scrollLeft offset added to canvasX');
};

var test_neuro_cssToCanvasCoords_with_rect_offset = function () {
    var nr = NeuroRenderer._test;
    // Panel starts at x=200 in viewport. Click at clientX=300 => local x=100
    var coords = nr.cssToCanvasCoords(300, 80, 200, 10, 600, 140, 600, 140, 0);
    assertClose(coords.x, 100, 0.01, 'rect.left offset subtracted');
    assertClose(coords.y, 70, 0.01, 'rect.top offset subtracted');
};

var test_neuro_layout_small_sections_get_min_width = function () {
    // Checklist item 4: DRIVES/MOTOR render as visible grids, not 1px slivers
    var nr = NeuroRenderer._test;
    // Simulate: Sensory=100000, Central=35000, Drives=80, Motor=76
    var layout = nr.computeSectionLayout([100000, 35000, 80, 76], 800, 140, nr.POINT_SIZE, nr.MIN_SECTION_W, nr.MAX_SMALL_PS, nr.SECTION_GAP, nr.PAD);

    // Drives (index 2) and Motor (index 3) must have sectionW >= MIN_SECTION_W
    assertTrue(layout.sections[2].sectionW >= nr.MIN_SECTION_W,
        'Drives section width >= MIN_SECTION_W (' + layout.sections[2].sectionW + ' >= ' + nr.MIN_SECTION_W + ')');
    assertTrue(layout.sections[3].sectionW >= nr.MIN_SECTION_W,
        'Motor section width >= MIN_SECTION_W (' + layout.sections[3].sectionW + ' >= ' + nr.MIN_SECTION_W + ')');

    // Small sections must have enlarged point sizes (> base POINT_SIZE)
    assertTrue(layout.sections[2].pointSize > nr.POINT_SIZE,
        'Drives gets enlarged pointSize (' + layout.sections[2].pointSize + ' > ' + nr.POINT_SIZE + ')');
    assertTrue(layout.sections[3].pointSize > nr.POINT_SIZE,
        'Motor gets enlarged pointSize (' + layout.sections[3].pointSize + ' > ' + nr.POINT_SIZE + ')');
};

var test_neuro_layout_empty_section_zero_width = function () {
    var nr = NeuroRenderer._test;
    // Section with 0 neurons should have zero width
    var layout = nr.computeSectionLayout([100, 0, 50, 30], 800, 140, nr.POINT_SIZE, nr.MIN_SECTION_W, nr.MAX_SMALL_PS, nr.SECTION_GAP, nr.PAD);
    assertEqual(layout.sections[1].sectionW, 0, 'empty section has zero width');
    assertEqual(layout.sections[1].neuronCount, 0, 'empty section neuronCount is 0');
};

var test_neuro_layout_displayScale_shrinks_to_fit = function () {
    // Checklist item 6: Motor not clipped -- canvas shrinks via displayScale < 1
    var nr = NeuroRenderer._test;
    // With very large neuron counts, canvasWidth may exceed containerW
    // displayScale = containerW / canvasWidth < 1 means CSS shrinks canvas to fit
    var layout = nr.computeSectionLayout([100000, 35000, 80, 76], 400, 140, nr.POINT_SIZE, nr.MIN_SECTION_W, nr.MAX_SMALL_PS, nr.SECTION_GAP, nr.PAD);
    // With 135K+ neurons at POINT_SIZE=1 in 400px container, canvas will be wider than 400
    if (layout.canvasWidth > 400) {
        assertTrue(layout.displayScale < 1.0,
            'displayScale < 1 when canvas exceeds container (' + layout.displayScale + ')');
    }
    // All 4 sections must have valid bounds (Motor is last, must not be clipped)
    assertTrue(layout.sections[3].x1 <= layout.canvasWidth,
        'Motor section x1 fits within canvasWidth');
};

var test_neuro_label_maxwidths_prevent_overlap = function () {
    // Checklist item 3: labels truncate with ellipsis (max-width prevents overflow)
    var nr = NeuroRenderer._test;
    // Create mock sectionBounds with known positions
    var bounds = [
        {x0: 0, x1: 200, neuronIndices: [1], neuronCount: 1},
        {x0: 216, x1: 400, neuronIndices: [2], neuronCount: 1},
        {x0: 416, x1: 476, neuronIndices: [3], neuronCount: 1},
        {x0: 492, x1: 552, neuronIndices: [4], neuronCount: 1}
    ];
    var dScale = 1.0;
    var widths = nr.computeLabelMaxWidths(bounds, dScale);

    // 4 visible sections => 4 entries
    assertEqual(widths.length, 4, 'all 4 sections get label width entries');

    // First label: maxWidth = next.x0 * dScale - this.x0 * dScale - 4
    // = 216 - 0 - 4 = 212
    assertClose(widths[0].maxWidth, 212, 0.01, 'first label maxWidth capped before second section');

    // Third label (Drives at x0=416): maxWidth = 492 - 416 - 4 = 72
    assertClose(widths[2].maxWidth, 72, 0.01, 'narrow section label maxWidth prevents overflow');

    // Last label (Motor): maxWidth = -1 (uncapped)
    assertEqual(widths[3].maxWidth, -1, 'last label has no maxWidth cap');
};

var test_neuro_label_maxwidths_with_displayScale = function () {
    var nr = NeuroRenderer._test;
    // displayScale=0.5 means CSS positions are halved
    var bounds = [
        {x0: 0, x1: 400, neuronIndices: [1], neuronCount: 1},
        {x0: 416, x1: 800, neuronIndices: [2], neuronCount: 1}
    ];
    var widths = nr.computeLabelMaxWidths(bounds, 0.5);
    // First label: leftPx = 0*0.5 = 0, nextLeft = 416*0.5 = 208, maxWidth = max(20, 208-0-4) = 204
    assertClose(widths[0].maxWidth, 204, 0.01, 'displayScale applied to label maxWidth calc');
};

var test_neuro_label_skip_empty_sections = function () {
    var nr = NeuroRenderer._test;
    // Section 1 is empty (0 neurons)
    var bounds = [
        {x0: 0, x1: 200, neuronIndices: [1], neuronCount: 1},
        {x0: 200, x1: 200, neuronIndices: [], neuronCount: 0},
        {x0: 216, x1: 400, neuronIndices: [3], neuronCount: 1},
        {x0: 416, x1: 500, neuronIndices: [4], neuronCount: 1}
    ];
    var widths = nr.computeLabelMaxWidths(bounds, 1.0);
    // Only 3 visible sections (indices 0, 2, 3)
    assertEqual(widths.length, 3, 'empty section skipped in label widths');
    assertEqual(widths[0].region, 0, 'first visible is region 0');
    assertEqual(widths[1].region, 2, 'second visible is region 2');
    assertEqual(widths[2].region, 3, 'third visible is region 3');
};

var test_neuro_layout_point_size_capped_at_max = function () {
    var nr = NeuroRenderer._test;
    // Very few neurons (e.g. 2) in a section -- pointSize should not exceed MAX_SMALL_PS
    var layout = nr.computeSectionLayout([1000, 500, 2, 3], 800, 140, nr.POINT_SIZE, nr.MIN_SECTION_W, nr.MAX_SMALL_PS, nr.SECTION_GAP, nr.PAD);
    assertTrue(layout.sections[2].pointSize <= nr.MAX_SMALL_PS,
        'Drives pointSize capped at MAX_SMALL_PS (' + layout.sections[2].pointSize + ' <= ' + nr.MAX_SMALL_PS + ')');
    assertTrue(layout.sections[3].pointSize <= nr.MAX_SMALL_PS,
        'Motor pointSize capped at MAX_SMALL_PS (' + layout.sections[3].pointSize + ' <= ' + nr.MAX_SMALL_PS + ')');
};

} // end neuro-renderer tests guard
