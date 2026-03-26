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
// Section 2: Copied Pure Functions from main.js
// ============================================================

// normalizeAngle -- copied from js/main.js lines 31-36
function normalizeAngle(a) {
	a = a % (2 * Math.PI);
	if (a > Math.PI) a -= 2 * Math.PI;
	if (a < -Math.PI) a += 2 * Math.PI;
	return a;
}

// BEHAVIOR_THRESHOLDS -- copied from js/main.js lines 71-80
var BEHAVIOR_THRESHOLDS = {
	startle: 30,
	fly: 15,
	feed: 8,
	groom: 8,
	walk: 5,
	restFatigue: 0.7,
	exploreCuriosity: 0.4,
	phototaxisLight: 0.5,
};

// Mutable test state
var behavior = { current: 'idle', enterTime: 0, cooldowns: {} };
var food = [];
var fly = { x: 400, y: 300 };

// isCoolingDown -- copied from js/main.js lines 481-483
function isCoolingDown(state, now) {
	return behavior.cooldowns[state] !== undefined && now < behavior.cooldowns[state];
}

// hasNearbyFood -- copied from js/main.js lines 454-458
function hasNearbyFood() {
	for (var i = 0; i < food.length; i++) {
		if (Math.hypot(fly.x - food[i].x, fly.y - food[i].y) <= 50) return true;
	}
	return false;
}

// evaluateBehaviorEntry -- copied from js/main.js lines 490-526
function evaluateBehaviorEntry() {
	var now = Date.now();
	var totalWalk = BRAIN.accumWalkLeft + BRAIN.accumWalkRight;
	if (BRAIN.accumStartle > BEHAVIOR_THRESHOLDS.startle && !isCoolingDown('startle', now)) {
		return 'startle';
	}
	if (BRAIN.accumFlight > BEHAVIOR_THRESHOLDS.fly && !isCoolingDown('fly', now)) {
		return 'fly';
	}
	if (BRAIN.accumFeed > BEHAVIOR_THRESHOLDS.feed && hasNearbyFood() && !isCoolingDown('feed', now)) {
		return 'feed';
	}
	if (BRAIN.accumGroom > BEHAVIOR_THRESHOLDS.groom && !isCoolingDown('groom', now)) {
		return 'groom';
	}
	if (BRAIN.stimulate.wind && BRAIN.stimulate.windStrength < 0.5 &&
		BRAIN.accumStartle < BEHAVIOR_THRESHOLDS.startle && !isCoolingDown('brace', now)) {
		return 'brace';
	}
	var restThreshold = BRAIN.stimulate.lightLevel === 0 ? 0.4 : BEHAVIOR_THRESHOLDS.restFatigue;
	if (BRAIN.drives.fatigue > restThreshold) {
		return 'rest';
	}
	if (BRAIN.stimulate.lightLevel > BEHAVIOR_THRESHOLDS.phototaxisLight &&
		BRAIN.drives.curiosity > 0.2 && totalWalk > 3) {
		return 'phototaxis';
	}
	if (totalWalk > BEHAVIOR_THRESHOLDS.walk &&
		BRAIN.drives.curiosity > BEHAVIOR_THRESHOLDS.exploreCuriosity) {
		return 'explore';
	}
	if (totalWalk > BEHAVIOR_THRESHOLDS.walk) {
		return 'walk';
	}
	return 'idle';
}

// ============================================================
// Section 3: Reset Helper
// ============================================================

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
// Section 4: Test Functions
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

// ============================================================
// Section 5: Test Runner
// ============================================================

function runAllTests() {
	var tests = [];
	for (var key in window) {
		if (key.indexOf('test_') === 0 && typeof window[key] === 'function') {
			tests.push({ name: key, fn: window[key] });
		}
	}
	tests.sort(function (a, b) {
		return a.name < b.name ? -1 : (a.name > b.name ? 1 : 0);
	});

	var passed = 0, failed = 0, resultsHTML = '';
	for (var i = 0; i < tests.length; i++) {
		var test = tests[i];
		try {
			test.fn();
			passed++;
			resultsHTML += '<div class="test-result pass">' + test.name + '</div>';
		} catch (e) {
			failed++;
			resultsHTML += '<div class="test-result fail">' + test.name + ': ' + (e.message || e) + '</div>';
		}
	}
	document.getElementById('results').innerHTML = resultsHTML;
	var total = passed + failed;
	document.getElementById('summary').innerHTML = '<span class="summary-pass">' + passed + ' passed</span> / <span class="summary-fail">' + failed + ' failed</span> / ' + total + ' total';
}
