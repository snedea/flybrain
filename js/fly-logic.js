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
	courtship: 10,
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
 * Returns true if any mate is within 80px of the fly.
 * Requires globals `mates` (array) and `fly` (object with x, y).
 */
function hasNearbyMate() {
	if (typeof mates === 'undefined') return false;
	for (var i = 0; i < mates.length; i++) {
		if (Math.hypot(fly.x - mates[i].x, fly.y - mates[i].y) <= 80) return true;
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
	if (BRAIN.accumCourtship > BEHAVIOR_THRESHOLDS.courtship &&
		hasNearbyMate() && !isCoolingDown('courtship', now) &&
		BRAIN.drives.fear < 0.3 && BRAIN.drives.fatigue < 0.6) {
		return 'courtship';
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
// Extracted Pure Functions for Testing (D68.2)
// These mirror inline logic from main.js and sim-worker.js
// so it can be exercised without DOM/Worker dependencies.
// ============================================================

var FEED_APPROACH_SPEED = 0.25;

/**
 * Pure extraction of food-seeking steering logic (main.js ~lines 859-862).
 * Returns the computed targetDir and seekStrength.
 */
function computeFoodSeekDir(flyX, flyY, foodX, foodY, hunger, facingDirVal) {
	var foodAngle = Math.atan2(-(foodY - flyY), foodX - flyX);
	var seekStrength = Math.min(1, hunger);
	var angleDiffToFood = normalizeAngle(foodAngle - facingDirVal);
	var targetDir = facingDirVal + angleDiffToFood * seekStrength;
	return { targetDir: targetDir, seekStrength: seekStrength };
}

/**
 * Pure extraction of food consumption progress (main.js ~lines 1760-1761).
 * Returns progress value clamped to [0, 1].
 */
function computeFoodProgress(foodItem, now) {
	var elapsed = now - foodItem.feedStart;
	var progress = Math.min(1, (foodItem.eaten || 0) + elapsed / foodItem.feedDuration);
	return progress;
}

/**
 * Pure extraction of pause-feeding logic (main.js ~lines 1773-1776).
 * Mutates foodItem in place: accumulates eaten progress and resets feedStart to 0.
 */
function pauseFeeding(foodItem, now) {
	if (foodItem.feedStart === 0) return;
	var ate = now - foodItem.feedStart;
	foodItem.eaten = Math.min(1, (foodItem.eaten || 0) + ate / foodItem.feedDuration);
	foodItem.feedStart = 0;
}
