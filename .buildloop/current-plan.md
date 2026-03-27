# Plan: D28.1

## Dependencies
- list: [] (no new dependencies)
- commands: [] (no install commands)

## File Operations (in execution order)

### 1. MODIFY tests/tests.js
- operation: MODIFY
- reason: Add `withMockedRandom` helper to Section 1 and wrap all 9 Math.random mock/restore patterns in try/finally to prevent mock leaks on test failure

#### Change 1: Add `withMockedRandom` helper function after `assertClose` in Section 1

- anchor: the closing brace of `assertClose` at line 25, immediately before the blank line and Section 2 comment:
```
function assertClose(actual, expected, tolerance, msg) {
	if (Math.abs(actual - expected) > tolerance) {
		throw new TestFailure(msg + ': expected ' + expected + ' ± ' + tolerance + ' but got ' + actual);
	}
}
```

- Insert the following new function **after** the closing `}` of `assertClose` (after line 25) and **before** the blank line preceding Section 2 (line 27):

```js
function withMockedRandom(mockValue, fn) {
	var origRandom = Math.random;
	Math.random = function () { return mockValue; };
	try {
		fn();
	} finally {
		Math.random = origRandom;
	}
}
```

#### Change 2: Rewrite `test_dark_curiosity_range_reduced` (Section 3, line 375)

- anchor: `function test_dark_curiosity_range_reduced() {`

Replace the entire function body (lines 375-385) with:

```js
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
```

#### Change 3: Rewrite `test_bright_curiosity_range_normal` (Section 3, line 387)

- anchor: `function test_bright_curiosity_range_normal() {`

Replace the entire function body (lines 387-397) with:

```js
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
```

#### Change 4: Rewrite `test_bridge_synthesize_walk_tonic` (Section 5, line 701)

- anchor: `var test_bridge_synthesize_walk_tonic = function () {`

Replace the entire function body (lines 701-727) with:

```js
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
```

#### Change 5: Rewrite `test_bridge_synthesize_flight_fear` (Section 5, line 729)

- anchor: `var test_bridge_synthesize_flight_fear = function () {`

Replace the entire function body (lines 729-748) with:

```js
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
```

#### Change 6: Rewrite `test_bridge_synthesize_groom` (Section 5, line 750)

- anchor: `var test_bridge_synthesize_groom = function () {`

Replace the entire function body (lines 750-768) with:

```js
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
```

#### Change 7: Rewrite `test_bridge_synthesize_feed` (Section 5, line 797)

- anchor: `var test_bridge_synthesize_feed = function () {`

Replace the entire function body (lines 797-816) with:

```js
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
```

#### Change 8: Rewrite `test_bridge_virtual_bypass_fear` (Section 5, line 820)

- anchor: `var test_bridge_virtual_bypass_fear = function () {`

Replace the entire function body (lines 820-847) with:

```js
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
```

#### Change 9: Rewrite `test_bridge_virtual_bypass_curiosity` (Section 5, line 849)

- anchor: `var test_bridge_virtual_bypass_curiosity = function () {`

Replace the entire function body (lines 849-874) with:

```js
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
```

#### Change 10: Rewrite `test_bridge_virtual_bypass_groom` (Section 5, line 876)

- anchor: `var test_bridge_virtual_bypass_groom = function () {`

Replace the entire function body (lines 876-900) with:

```js
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
```

## Verification
- build: N/A (no build step — vanilla JS loaded via vm.runInThisContext)
- lint: N/A (no linter configured)
- test: `node tests/run-node.js`
- smoke: Run `node tests/run-node.js` and verify: (1) all tests pass with 0 failures, (2) grep the output for "passed" and "0 failed", (3) the exit code is 0 (`echo $?` should print `0`)

## Constraints
- Do NOT modify any file other than `tests/tests.js`
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any file in `.buildloop/` (except this plan)
- Do NOT add any new dependencies or npm packages
- Do NOT change the test runner (`tests/run-node.js`)
- Do NOT rename any test functions — keep all 9 function names exactly as they are
- Do NOT change the assertion logic or expected values in any test — only change the mock/restore pattern
- Do NOT change any code outside the 9 listed test functions (plus the new helper insertion)
- The `withMockedRandom` helper must be placed in Section 1 (after `assertClose`, before Section 2) so it is available to all test sections
- Use `function withMockedRandom(...)` declaration syntax (not `var withMockedRandom = function`) so it is hoisted and available everywhere in the file
- Assertions that read `BRAIN.accumWalkLeft`, `BRAIN.accumFlight`, `BRAIN.accumGroom`, `BRAIN.accumFeed`, `BRAIN.postSynaptic[...][BRAIN.thisState]`, and `BRAIN.drives.curiosity` must remain OUTSIDE the `withMockedRandom` callback — these reads do not depend on Math.random and keeping them outside makes test failure messages clearer (the mock is already restored when assertions run)
- The two Section 3 tests (`test_dark_curiosity_range_reduced`, `test_bright_curiosity_range_normal`) use mock value `1.0`; all seven Section 5 tests use mock value `0.5` — preserve these exact values
- Use tabs (not spaces) for indentation — match existing file style
