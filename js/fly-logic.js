// ============================================================
// Shared Pure Functions and Constants
// Used by both main.js (browser) and tests.js (test runner).
// Loaded after connectome.js, before main.js.
// Functions reference globals (BRAIN, behavior, food, fly)
// which are defined by the consumer (main.js or tests.js).
// ============================================================

// Normalize angle to [-PI, PI] range
function normalizeAngle(a) {
	a = a % (2 * Math.PI);
	if (a > Math.PI) a -= 2 * Math.PI;
	if (a < -Math.PI) a += 2 * Math.PI;
	return a;
}

// Accumulator thresholds for entering each behavior state
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

/**
 * Returns true if the given behavior state is in its cooldown period.
 * Requires global `behavior` object with a `cooldowns` map.
 */
function isCoolingDown(state, now) {
	return behavior.cooldowns[state] !== undefined && now < behavior.cooldowns[state];
}

/**
 * Returns true if any food item is within 50px of the fly.
 * Requires globals `food` (array) and `fly` (object with x, y).
 */
function hasNearbyFood() {
	for (var i = 0; i < food.length; i++) {
		if (Math.hypot(fly.x - food[i].x, fly.y - food[i].y) <= 50) return true;
	}
	return false;
}

/**
 * Evaluates accumulator outputs and drives to determine which behavior
 * state should be active. Returns the state name string.
 * Priority order (highest first): startle, fly, feed, groom, brace, rest, phototaxis, explore, walk, idle.
 * Requires globals `BRAIN`, `behavior`, `food`, `fly`.
 */
function evaluateBehaviorEntry() {
	var now = Date.now();
	var totalWalk = BRAIN.accumWalkLeft + BRAIN.accumWalkRight;

	if (BRAIN.accumStartle > BEHAVIOR_THRESHOLDS.startle && !isCoolingDown('startle', now)) {
		return 'startle';
	}
	if (BRAIN.accumFlight > BEHAVIOR_THRESHOLDS.fly && !isCoolingDown('fly', now)) {
		return 'fly';
	}
	var feedReady = BRAIN.accumFeed > BEHAVIOR_THRESHOLDS.feed ||
		(BRAIN.drives.hunger > 0.7 && BRAIN.stimulate.foodNearby);
	if (feedReady && hasNearbyFood() && !isCoolingDown('feed', now)) {
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
