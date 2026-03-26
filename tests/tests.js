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
	var origRandom = Math.random;
	Math.random = function () { return 1.0; };
	BRAIN.updateDrives();
	Math.random = origRandom;
	// (1.0 - 0.5) * 0.02 = 0.01, curiosity = 0.5 + 0.01 = 0.51
	assertClose(BRAIN.drives.curiosity, 0.51, 0.001, 'dark curiosity range is 0.02');
}

function test_bright_curiosity_range_normal() {
	resetBrainState();
	BRAIN.stimulate.lightLevel = 0.5; // >= 0.3 threshold
	BRAIN.drives.curiosity = 0.5;
	var origRandom = Math.random;
	Math.random = function () { return 1.0; };
	BRAIN.updateDrives();
	Math.random = origRandom;
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
