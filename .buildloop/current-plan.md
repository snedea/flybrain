# Plan: D16.1

## Dependencies
- list: none (vanilla JS, no build step, no packages)
- commands: none

## File Operations (in execution order)

### 1. CREATE js/fly-logic.js
- operation: CREATE
- reason: Extract shared pure/testable functions from main.js into a standalone file that both main.js and tests.js can reference, eliminating copy-paste drift

#### Functions

- signature: `function normalizeAngle(a)`
  - purpose: Normalize angle to [-PI, PI] range
  - logic:
    1. `a = a % (2 * Math.PI);`
    2. `if (a > Math.PI) a -= 2 * Math.PI;`
    3. `if (a < -Math.PI) a += 2 * Math.PI;`
    4. `return a;`
  - returns: number in [-PI, PI]
  - error handling: none

- declaration: `var BEHAVIOR_THRESHOLDS = { ... }`
  - purpose: Accumulator thresholds for entering each behavior state
  - exact value:
    ```
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
    ```

- signature: `function isCoolingDown(state, now)`
  - purpose: Check if a behavior state is in cooldown
  - logic: `return behavior.cooldowns[state] !== undefined && now < behavior.cooldowns[state];`
  - calls: reads global `behavior.cooldowns`
  - returns: boolean

- signature: `function hasNearbyFood()`
  - purpose: Check if any food item is within 50px of the fly
  - logic:
    1. Loop over global `food` array
    2. For each item, compute `Math.hypot(fly.x - food[i].x, fly.y - food[i].y)`
    3. Return true if any distance <= 50
    4. Return false if none found
  - calls: reads globals `food` (array) and `fly` (object with x, y)
  - returns: boolean

- signature: `function evaluateBehaviorEntry()`
  - purpose: Evaluate accumulators and drives to determine which behavior state should be active
  - logic: Copy the exact function body from main.js lines 490-526 (including brace and dark rest threshold logic). Priority order: startle, fly, feed, groom, brace, rest, phototaxis, explore, walk, idle.
  - calls: `isCoolingDown(state, now)`, `hasNearbyFood()`, reads global `BRAIN` (accumStartle, accumFlight, accumFeed, accumGroom, accumWalkLeft, accumWalkRight, stimulate.wind, stimulate.windStrength, stimulate.lightLevel, drives.fatigue, drives.curiosity)
  - returns: string (behavior state name)

#### Wiring / Integration
- This file defines global functions via `function` declarations and a `var` for BEHAVIOR_THRESHOLDS
- It references globals `BRAIN`, `behavior`, `food`, `fly` which are defined in connectome.js (BRAIN) and main.js/tests.js (behavior, food, fly) — these are resolved at call time, not load time
- Must be loaded AFTER connectome.js (needs BRAIN to exist for runtime calls) and BEFORE main.js and tests.js

#### File structure
The file should have this exact structure (with section comment at top):
```javascript
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
```

---

### 2. MODIFY js/connectome.js
- operation: MODIFY
- reason: Fix misleading windDirection comment — field stores wind travel direction (drag vector), not the direction wind is blowing FROM
- anchor: `windDirection: 0,      // radians, direction wind is blowing FROM (math convention: 0=right, PI/2=up)`

#### Change
Replace the comment on line 142:
- old: `windDirection: 0,      // radians, direction wind is blowing FROM (math convention: 0=right, PI/2=up)`
- new: `windDirection: 0,      // radians, wind travel direction (drag vector; 0=right, PI/2=up). Wind SOURCE = windDirection + PI.`

No other changes to connectome.js.

---

### 3. MODIFY js/main.js
- operation: MODIFY
- reason: Remove the 5 functions/constants now extracted to js/fly-logic.js

#### Removal 1: normalizeAngle (lines 30-36)
- anchor: `// Normalize angle to [-PI, PI] range`
- Delete these exact 7 lines (comment + function):
```
// Normalize angle to [-PI, PI] range
function normalizeAngle(a) {
	a = a % (2 * Math.PI);
	if (a > Math.PI) a -= 2 * Math.PI;
	if (a < -Math.PI) a += 2 * Math.PI;
	return a;
}
```
- Replace with nothing (blank line is fine for readability)

#### Removal 2: BEHAVIOR_THRESHOLDS (lines 70-80)
- anchor: `// Accumulator thresholds for entering each state`
- Delete these exact 11 lines:
```
// Accumulator thresholds for entering each state
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
```
- Replace with nothing

#### Removal 3: hasNearbyFood (lines 451-459)
- anchor: `function hasNearbyFood() {`
- Delete the JSDoc comment and function (9 lines):
```
/**
 * Returns true if any food item is within 50px of the fly.
 */
function hasNearbyFood() {
	for (var i = 0; i < food.length; i++) {
		if (Math.hypot(fly.x - food[i].x, fly.y - food[i].y) <= 50) return true;
	}
	return false;
}
```
- Replace with nothing

#### Removal 4: isCoolingDown (lines 478-483)
- anchor: `function isCoolingDown(state, now) {`
- Delete the JSDoc comment and function (6 lines):
```
/**
 * Returns true if the given state is in its cooldown period.
 */
function isCoolingDown(state, now) {
	return behavior.cooldowns[state] !== undefined && now < behavior.cooldowns[state];
}
```
- Replace with nothing

#### Removal 5: evaluateBehaviorEntry (lines 485-526)
- anchor: `function evaluateBehaviorEntry() {`
- Delete the JSDoc comment and entire function (42 lines):
```
/**
 * Evaluates accumulator outputs and drives to determine which behavior
 * state should be active. Returns the state name string.
 * Priority order (highest first): startle, fly, feed, groom, rest, phototaxis, explore, walk, idle.
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
```
- Replace with nothing

#### Wiring / Integration
- After these removals, main.js still references normalizeAngle (in computeMovementForBehavior at line 676-679), BEHAVIOR_THRESHOLDS (nowhere else — only evaluateBehaviorEntry used it), isCoolingDown (nowhere else), hasNearbyFood (nowhere else — only evaluateBehaviorEntry used it), evaluateBehaviorEntry (in updateBehaviorState at line 544). All these references will resolve to the global functions defined in fly-logic.js, which is loaded before main.js.
- The `nearestFood()` function at main.js:464-476 stays in main.js (not duplicated in tests).
- The `behavior`, `food`, `fly` var declarations stay in main.js.
- `BEHAVIOR_MIN_DURATION` and `BEHAVIOR_COOLDOWN` stay in main.js (not shared with tests).

---

### 4. MODIFY index.html
- operation: MODIFY
- reason: Add fly-logic.js script tag between connectome.js and main.js
- anchor: `<script type="text/javascript" src="./js/connectome.js"></script>`

#### Change
Replace:
```html
    <script type="text/javascript" src="./js/connectome.js"></script>
    <script type="text/javascript" src="./js/main.js"></script>
```
With:
```html
    <script type="text/javascript" src="./js/connectome.js"></script>
    <script type="text/javascript" src="./js/fly-logic.js"></script>
    <script type="text/javascript" src="./js/main.js"></script>
```

---

### 5. MODIFY tests/run.html
- operation: MODIFY
- reason: Add fly-logic.js script tag between connectome.js and tests.js so shared functions are available to tests
- anchor: `<script src="../js/connectome.js"></script>`

#### Change
Replace:
```html
<script src="../js/connectome.js"></script>
<script src="./tests.js"></script>
```
With:
```html
<script src="../js/connectome.js"></script>
<script src="../js/fly-logic.js"></script>
<script src="./tests.js"></script>
```

---

### 6. MODIFY tests/tests.js
- operation: MODIFY
- reason: (a) Remove copied function snapshots (now provided by fly-logic.js), (b) fix runAllTests for Node/CLI compatibility, (c) add new T5.1-T5.3 test coverage

#### Removal: Section 2 copied functions (lines 27-105)
- anchor: `// Section 2: Copied Pure Functions from main.js`
- Delete everything from line 27 (`// ============================================================`) through line 105 (`}`) inclusive. This removes normalizeAngle, BEHAVIOR_THRESHOLDS, the mutable test state vars (behavior, food, fly), isCoolingDown, hasNearbyFood, and evaluateBehaviorEntry.
- IMPORTANT: The mutable test state vars (behavior, food, fly) must be preserved. Move them into Section 3 (Reset Helper). Insert them immediately BEFORE the `resetBrainState` function definition.

After removal, Section 2 becomes the mutable test state + reset helper. The code between Section 1 and the reset helper should be:

```javascript

// ============================================================
// Section 2: Mutable Test State and Reset Helper
// ============================================================

// Mutable test state (these globals are used by the shared
// functions in fly-logic.js: evaluateBehaviorEntry, isCoolingDown, hasNearbyFood)
var behavior = { current: 'idle', enterTime: 0, cooldowns: {} };
var food = [];
var fly = { x: 400, y: 300 };

function resetBrainState() {
```

(The resetBrainState function body is unchanged.)

#### Renumber Section 3 → Section 2, Section 4 → Section 3, Section 5 → Section 4

Actually, simpler: just change the section header comments as follows:
- Delete the `// Section 2: Copied Pure Functions from main.js` header
- Delete the `// Section 3: Reset Helper` header
- Add a combined `// Section 2: Mutable Test State and Reset Helper` header
- Rename `// Section 4: Test Functions` to `// Section 3: Test Functions`
- Rename `// Section 5: Test Runner` to `// Section 4: Test Runner`

#### Addition: New test functions for T5.1-T5.3 coverage
- anchor: Add after the last existing test function (`test_priority_startle_over_feed`) and before the Test Runner section

Add the following 13 new test functions:

```javascript
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
```

#### Modification: runAllTests function (Section 5 → Section 4)
- anchor: `function runAllTests() {`
- Replace the ENTIRE runAllTests function (lines 433-459) with the following Node/CLI-compatible version:

```javascript
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
```

Key differences from the old runAllTests:
1. `window` → `scope` via typeof fallback chain (`globalThis` → `window` → `global` → `this`) for Node.js compatibility
2. `document.getElementById` calls guarded behind `typeof document !== 'undefined'`
3. Added console.log output block: logs summary line and each failure message
4. Added `process.exitCode = 1` when `failed > 0`, guarded behind `typeof process !== 'undefined'`
5. Failure messages collected into `failures` array for both DOM and console output

---

### 7. CREATE tests/run-node.js
- operation: CREATE
- reason: Provide a Node.js entry point that loads all script files into global scope (via vm.runInThisContext) and runs the test suite, enabling `node tests/run-node.js` as the CLI test command

#### File content (exact):
```javascript
#!/usr/bin/env node
// Node.js test runner for FlyBrain.
// Loads all scripts into the V8 global context (simulating browser <script> tags)
// then calls runAllTests().
var fs = require('fs');
var vm = require('vm');
var path = require('path');

var root = path.join(__dirname, '..');
var files = [
	'js/constants.js',
	'js/connectome.js',
	'js/fly-logic.js',
	'tests/tests.js',
];

for (var i = 0; i < files.length; i++) {
	var filePath = path.join(root, files[i]);
	var code = fs.readFileSync(filePath, 'utf8');
	vm.runInThisContext(code, { filename: files[i] });
}

runAllTests();
```

#### Wiring / Integration
- `vm.runInThisContext` executes each file's code in the current V8 context, so `var` and `function` declarations become globals — this simulates the browser's `<script>` tag loading behavior
- Load order matches the browser: constants.js → connectome.js → fly-logic.js → tests.js
- After loading, `runAllTests` is a global function (from tests.js) and is called directly
- When tests fail, `process.exitCode = 1` is set inside runAllTests, so the Node process exits with code 1

---

## Verification
- build: No build step (vanilla JS project)
- lint: No linter configured
- test: `node tests/run-node.js`
- smoke:
  1. Run `node tests/run-node.js` and confirm:
     - Output shows "X passed / 0 failed / X total" with X >= 40
     - Exit code is 0: `echo $?` should print `0`
  2. Inject a deliberate failure to verify the fix works:
     - Temporarily add `function test_deliberate_fail() { throw new TestFailure('intentional'); }` to tests.js
     - Run `node tests/run-node.js`
     - Confirm output includes "FAIL test_deliberate_fail: intentional"
     - Confirm exit code is 1: `echo $?` should print `1`
     - Remove the temporary test function
  3. Verify the browser path is unaffected:
     - Open `tests/run.html` in a browser and confirm all tests pass with the green/red DOM display

## Constraints
- Do NOT modify js/constants.js (read-only weights)
- Do NOT modify any files outside the listed set: js/fly-logic.js (create), js/main.js, js/connectome.js, index.html, tests/run.html, tests/tests.js, tests/run-node.js (create)
- Do NOT add any npm packages, build tools, or module syntax (import/export/require) to the browser-facing files (fly-logic.js, main.js, connectome.js, tests.js)
- Do NOT change the behavior of any existing functions — only move them (fly-logic.js extraction) or fix the test runner
- The `nearestFood()` function stays in main.js (it is not duplicated in tests)
- `BEHAVIOR_MIN_DURATION` and `BEHAVIOR_COOLDOWN` stay in main.js (not shared with tests)
- Use tabs for indentation in all JS files (matching existing project style)
- The only file that may use `require` is tests/run-node.js
