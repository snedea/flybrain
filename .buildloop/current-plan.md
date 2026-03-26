# Plan: T5.4

## Dependencies
- list: [] (no packages — pure browser JS, no build step)
- commands: [] (nothing to install)

## File Operations (in execution order)

### 1. CREATE tests/run.html
- operation: CREATE
- reason: HTML test runner page that loads source scripts and test file, runs tests on load, displays pass/fail results

#### Content Structure

The HTML page must contain:

1. A `<!DOCTYPE html>` declaration
2. `<head>` with `<title>FlyBrain Tests</title>` and an inline `<style>` block using project CSS custom properties (see Constraints for exact values)
3. `<body>` with:
   - An `<h1>` with text `FlyBrain Test Suite`
   - A `<div id="summary"></div>` for the pass/fail count summary
   - A `<div id="results"></div>` for individual test results
4. Script tags loading source files in order:
   - `<script src="../js/constants.js"></script>`
   - `<script src="../js/connectome.js"></script>`
   - `<script src="./tests.js"></script>`
5. A final inline `<script>` block that calls `runAllTests()` on window load

#### Inline Style Block

```css
:root {
  --bg: #1a1a2e;
  --surface: #16213e;
  --surface-hover: #1a2744;
  --border: #2a3a5c;
  --text: #e8e8e8;
  --text-muted: #8892a4;
  --accent: #E3734B;
  --accent-hover: #f0855f;
  --accent-subtle: rgba(227, 115, 75, 0.15);
  --success: #4ade80;
  --warning: #fbbf24;
  --error: #f87171;
  --radius: 8px;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: system-ui, -apple-system, sans-serif;
  background: var(--bg);
  color: var(--text);
  max-width: 1080px;
  margin: 0 auto;
  padding: 2rem 1rem;
  font-size: 0.9rem;
}
h1 {
  font-size: 1.75rem;
  margin-bottom: 1rem;
  color: var(--text);
}
#summary {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem 1.5rem;
  margin-bottom: 1.5rem;
  font-size: 1.25rem;
}
.test-result {
  padding: 0.5rem 1rem;
  border-left: 3px solid var(--border);
  margin-bottom: 0.25rem;
  font-size: 0.9rem;
  background: var(--surface);
  border-radius: 0 var(--radius) var(--radius) 0;
}
.test-result.pass { border-left-color: var(--success); }
.test-result.fail { border-left-color: var(--error); }
.test-result.pass::before { content: 'PASS '; color: var(--success); font-weight: bold; }
.test-result.fail::before { content: 'FAIL '; color: var(--error); font-weight: bold; }
.summary-pass { color: var(--success); }
.summary-fail { color: var(--error); }
```

#### Inline Script Block (after test.js loads)

```javascript
window.onload = function () { runAllTests(); };
```

This calls `runAllTests()` which is defined in tests.js.

### 2. CREATE tests/tests.js
- operation: CREATE
- reason: Contains all assertion helpers, test functions, and the test runner entry point

#### Overview

This file defines:
1. Assertion helper functions (`assertEqual`, `assertTrue`, `assertClose`)
2. A test runner (`runAllTests`) that collects and runs all `test_*` functions, then renders results to the DOM
3. Test functions grouped by category (connectome, drives, angle math, behavior thresholds)
4. Copies of pure functions from main.js needed for testing (`normalizeAngle`, `evaluateBehaviorEntry`, `isCoolingDown`, `hasNearbyFood`) plus the constants they depend on — these are copied verbatim because main.js cannot be loaded (it immediately accesses DOM elements like `document.getElementById('clearButton')` on line 9)

#### Section 1: Assertion Helpers

```
function TestFailure(message)
```
- purpose: Custom error class for assertion failures
- logic:
  1. Set `this.message = message`

```
function assertEqual(actual, expected, msg)
```
- purpose: Assert strict equality
- logic:
  1. If `actual !== expected`, throw `new TestFailure(msg + ': expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual))`

```
function assertTrue(value, msg)
```
- purpose: Assert value is truthy
- logic:
  1. If `!value`, throw `new TestFailure(msg + ': expected truthy but got ' + JSON.stringify(value))`

```
function assertClose(actual, expected, tolerance, msg)
```
- purpose: Assert two floats are within tolerance
- logic:
  1. If `Math.abs(actual - expected) > tolerance`, throw `new TestFailure(msg + ': expected ' + expected + ' ± ' + tolerance + ' but got ' + actual)`

#### Section 2: Copied Pure Functions from main.js

Copy these verbatim from the current source. These are small pure functions that cannot be loaded from main.js because main.js has top-level DOM access calls.

**normalizeAngle** — copy from js/main.js lines 31-36:
```javascript
function normalizeAngle(a) {
    a = a % (2 * Math.PI);
    if (a > Math.PI) a -= 2 * Math.PI;
    if (a < -Math.PI) a += 2 * Math.PI;
    return a;
}
```

**BEHAVIOR_THRESHOLDS** — copy from js/main.js lines 71-80:
```javascript
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

**behavior** (mutable test state) — declare as:
```javascript
var behavior = { current: 'idle', enterTime: 0, cooldowns: {} };
```

**food** (mutable test state) — declare as:
```javascript
var food = [];
```

**fly** (mutable test state) — declare as:
```javascript
var fly = { x: 400, y: 300 };
```

**isCoolingDown** — copy from js/main.js lines 481-483:
```javascript
function isCoolingDown(state, now) {
    return behavior.cooldowns[state] !== undefined && now < behavior.cooldowns[state];
}
```

**hasNearbyFood** — copy from js/main.js lines 454-458:
```javascript
function hasNearbyFood() {
    for (var i = 0; i < food.length; i++) {
        if (Math.hypot(fly.x - food[i].x, fly.y - food[i].y) <= 50) return true;
    }
    return false;
}
```

**evaluateBehaviorEntry** — copy from js/main.js lines 490-526:
```javascript
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

#### Section 3: Reset Helper

```
function resetBrainState()
```
- purpose: Reset BRAIN to a clean initialized state for each test
- logic:
  1. Call `BRAIN.setup()`
  2. Set `BRAIN.thisState = 0`
  3. Set `BRAIN.nextState = 1`
  4. Set `BRAIN.accumWalkLeft = 0`
  5. Set `BRAIN.accumWalkRight = 0`
  6. Set `BRAIN.accumFlight = 0`
  7. Set `BRAIN.accumFeed = 0`
  8. Set `BRAIN.accumGroom = 0`
  9. Set `BRAIN.accumStartle = 0`
  10. Set `BRAIN.accumHead = 0`
  11. Set `BRAIN.accumleft = 0`
  12. Set `BRAIN.accumright = 0`
  13. Set `BRAIN._isMoving = false`
  14. Set `BRAIN._isFeeding = false`
  15. Set `BRAIN._isGrooming = false`
  16. Reset `BRAIN.stimulate` to: `{ touch: false, touchLocation: null, foodNearby: false, foodContact: false, dangerOdor: false, wind: false, windStrength: 0, windDirection: 0, lightLevel: 1, nociception: false, temperature: 0.5 }`
  17. Reset `BRAIN.drives` to: `{ hunger: 0.3, fear: 0.0, fatigue: 0.0, curiosity: 0.5, groom: 0.1 }`
  18. Reset `behavior` to: `{ current: 'idle', enterTime: 0, cooldowns: {} }`
  19. Reset `food` to: `[]`
  20. Reset `fly` to: `{ x: 400, y: 300 }`

#### Section 4: Test Functions

All test functions are named `test_*` and take no arguments. They call assertion helpers and throw `TestFailure` on failure. Each test must call `resetBrainState()` first.

##### Connectome Signal Propagation Tests

**test_setup_initializes_all_neurons**
- purpose: Verify BRAIN.setup() creates postSynaptic entries for all neurons in weights
- logic:
  1. Call `resetBrainState()`
  2. For each key `pre` in `weights`: call `assertTrue(BRAIN.postSynaptic[pre] !== undefined, 'missing postSynaptic for ' + pre)`
  3. For each key `pre` in `weights`, for each key `post` in `weights[pre]`: call `assertTrue(BRAIN.postSynaptic[post] !== undefined, 'missing postSynaptic for target ' + post)`
  4. Verify each postSynaptic entry is a 2-element array initialized to `[0, 0]`: for a sample neuron `'VIS_R1R6'`, call `assertEqual(BRAIN.postSynaptic['VIS_R1R6'][0], 0, 'VIS_R1R6 state 0')` and `assertEqual(BRAIN.postSynaptic['VIS_R1R6'][1], 0, 'VIS_R1R6 state 1')`

**test_dendriteAccumulate_propagates_to_targets**
- purpose: Verify dendriteAccumulate('VIS_R1R6') propagates signal to VIS_ME and VIS_LO
- logic:
  1. Call `resetBrainState()`
  2. Call `BRAIN.dendriteAccumulate('VIS_R1R6')`
  3. Assert `BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState] === 8` (weight from constants.js VIS_R1R6 -> VIS_ME is 8)
  4. Assert `BRAIN.postSynaptic['VIS_LPTC'][BRAIN.nextState] === 4` (weight from VIS_R1R6 -> VIS_LPTC is 4)
  5. Assert `BRAIN.postSynaptic['DRIVE_CURIOSITY'][BRAIN.nextState] === 2` (weight from VIS_R1R6 -> DRIVE_CURIOSITY is 2)
  6. Verify a neuron NOT in VIS_R1R6's targets is still 0: assert `BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState] === 0`

**test_dendriteAccumulate_is_additive**
- purpose: Verify calling dendriteAccumulate twice doubles the signal
- logic:
  1. Call `resetBrainState()`
  2. Call `BRAIN.dendriteAccumulate('VIS_R1R6')` twice
  3. Assert `BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState] === 16` (8 * 2)

**test_dendriteAccumulateScaled_applies_scale**
- purpose: Verify dendriteAccumulateScaled applies the scale factor and rounds
- logic:
  1. Call `resetBrainState()`
  2. Call `BRAIN.dendriteAccumulateScaled('VIS_R1R6', 0.5)`
  3. Assert `BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState] === Math.round(8 * 0.5)` which is 4
  4. Assert `BRAIN.postSynaptic['VIS_LPTC'][BRAIN.nextState] === Math.round(4 * 0.5)` which is 2

**test_fireNeuron_cascades_and_resets**
- purpose: Verify fireNeuron propagates signal and resets the fired neuron's nextState to 0
- logic:
  1. Call `resetBrainState()`
  2. Manually set `BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState] = 50` (above fire threshold, though fireNeuron doesn't check threshold — it just fires)
  3. Call `BRAIN.fireNeuron('VIS_ME')`
  4. Assert `BRAIN.postSynaptic['VIS_ME'][BRAIN.nextState] === 0` (reset after firing)
  5. Assert `BRAIN.postSynaptic['VIS_LO'][BRAIN.nextState] === 7` (VIS_ME -> VIS_LO weight is 7)
  6. Assert `BRAIN.postSynaptic['VIS_LPTC'][BRAIN.nextState] === 6` (VIS_ME -> VIS_LPTC weight is 6)

**test_readMotor_drains_to_zero**
- purpose: Verify motorcontrol reads motor neuron state and drains it to zero
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState] = 25`
  3. Call `BRAIN.motorcontrol()`
  4. Assert `BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState] === 0` (drained by readMotor)
  5. Assert `BRAIN.accumFeed === 25` (the value was read into accumFeed)

**test_motor_accumulator_floors_at_zero**
- purpose: Verify negative motor accumulations are floored at 0
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.postSynaptic['MN_PROBOSCIS'][BRAIN.nextState] = -5`
  3. Call `BRAIN.motorcontrol()`
  4. Assert `BRAIN.accumFeed === 0` (floored)

##### Drive System Tests

**test_hunger_increases_per_tick**
- purpose: Verify hunger increases by 0.005 when not feeding
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.drives.hunger = 0.3`
  3. Set `BRAIN._isFeeding = false`
  4. Call `BRAIN.updateDrives()`
  5. Assert `assertClose(BRAIN.drives.hunger, 0.305, 0.0001, 'hunger increase')`

**test_hunger_decreases_when_feeding**
- purpose: Verify hunger decreases by 0.3 when feeding (net: +0.005 - 0.3 = -0.295)
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.drives.hunger = 0.5`
  3. Set `BRAIN._isFeeding = true`
  4. Call `BRAIN.updateDrives()`
  5. Assert `assertClose(BRAIN.drives.hunger, 0.205, 0.0001, 'hunger decrease when feeding')` (0.5 + 0.005 - 0.3 = 0.205)

**test_fear_spikes_on_touch**
- purpose: Verify fear increases by 0.3 on touch, then decays by 0.85
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.drives.fear = 0.0`
  3. Set `BRAIN.stimulate.touch = true`
  4. Call `BRAIN.updateDrives()`
  5. Expected: fear = (0.0 + 0.3) * 0.85 = 0.255
  6. Assert `assertClose(BRAIN.drives.fear, 0.255, 0.0001, 'fear spike on touch')`

**test_fear_exponential_decay**
- purpose: Verify fear decays by factor 0.85 each tick with no stimulus
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.drives.fear = 1.0`
  3. Set `BRAIN.stimulate.touch = false`
  4. Set `BRAIN.stimulate.wind = false`
  5. Set `BRAIN.stimulate.dangerOdor = false`
  6. Call `BRAIN.updateDrives()`
  7. Assert `assertClose(BRAIN.drives.fear, 0.85, 0.0001, 'fear decay')`

**test_drives_clamped_to_zero**
- purpose: Verify drives cannot go below 0
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.drives.hunger = 0.0`
  3. Set `BRAIN._isFeeding = true` (hunger will try to go to 0.0 + 0.005 - 0.3 = -0.295)
  4. Call `BRAIN.updateDrives()`
  5. Assert `assertEqual(BRAIN.drives.hunger, 0, 'hunger clamped at zero')`

**test_drives_clamped_to_one**
- purpose: Verify drives cannot exceed 1
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.drives.hunger = 0.999`
  3. Set `BRAIN._isFeeding = false`
  4. Call `BRAIN.updateDrives()`
  5. Assert `assertEqual(BRAIN.drives.hunger, 1, 'hunger clamped at one')` (0.999 + 0.005 = 1.004, clamped to 1)

**test_fear_wind_contribution**
- purpose: Verify wind above 0.5 strength adds fear
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.drives.fear = 0.0`
  3. Set `BRAIN.stimulate.wind = true`
  4. Set `BRAIN.stimulate.windStrength = 0.8`
  5. Set `BRAIN.stimulate.touch = false`
  6. Set `BRAIN.stimulate.dangerOdor = false`
  7. Call `BRAIN.updateDrives()`
  8. Expected fear: (0.0 + 0.2 * 0.8) * 0.85 = 0.16 * 0.85 = 0.136
  9. Assert `assertClose(BRAIN.drives.fear, 0.136, 0.0001, 'fear from wind')`

**test_fear_no_wind_contribution_below_threshold**
- purpose: Verify wind at 0.5 or below does not add fear
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.drives.fear = 0.0`
  3. Set `BRAIN.stimulate.wind = true`
  4. Set `BRAIN.stimulate.windStrength = 0.5`
  5. Set `BRAIN.stimulate.touch = false`
  6. Set `BRAIN.stimulate.dangerOdor = false`
  7. Call `BRAIN.updateDrives()`
  8. Expected fear: 0.0 * 0.85 = 0.0 (wind at exactly 0.5 does not pass `> 0.5` check)
  9. Assert `assertClose(BRAIN.drives.fear, 0.0, 0.0001, 'no fear from weak wind')`

##### Angle Normalization Tests

**test_normalizeAngle_zero**
- purpose: Verify normalizeAngle(0) returns 0
- logic:
  1. Assert `assertClose(normalizeAngle(0), 0, 0.0001, 'normalizeAngle(0)')`

**test_normalizeAngle_pi**
- purpose: Verify normalizeAngle(PI) returns PI
- logic:
  1. Assert `assertClose(normalizeAngle(Math.PI), Math.PI, 0.0001, 'normalizeAngle(PI)')`

**test_normalizeAngle_neg_pi**
- purpose: Verify normalizeAngle(-PI) returns -PI
- logic:
  1. Assert `assertClose(normalizeAngle(-Math.PI), -Math.PI, 0.0001, 'normalizeAngle(-PI)')`

**test_normalizeAngle_3pi**
- purpose: Verify normalizeAngle(3*PI) returns PI (3PI % 2PI = PI)
- logic:
  1. Assert `assertClose(normalizeAngle(3 * Math.PI), Math.PI, 0.0001, 'normalizeAngle(3PI)')`

**test_normalizeAngle_neg5pi**
- purpose: Verify normalizeAngle(-5*PI) returns -PI (-5PI % 2PI = -PI)
- logic:
  1. Assert `assertClose(normalizeAngle(-5 * Math.PI), -Math.PI, 0.0001, 'normalizeAngle(-5PI)')`

**test_normalizeAngle_large_positive**
- purpose: Verify normalizeAngle(7) wraps correctly (7 - 2PI ≈ 0.717)
- logic:
  1. var result = normalizeAngle(7)
  2. Assert `assertTrue(result >= -Math.PI && result <= Math.PI, 'normalizeAngle(7) in range')`
  3. Assert `assertClose(result, 7 - 2 * Math.PI, 0.0001, 'normalizeAngle(7) value')`

##### Behavior Threshold Tests

**test_startle_entry**
- purpose: Verify accumStartle above 30 with no cooldown returns 'startle'
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.accumStartle = 35`
  3. Set `behavior.cooldowns = {}` (no cooldowns)
  4. Assert `assertEqual(evaluateBehaviorEntry(), 'startle', 'startle entry')`

**test_startle_blocked_by_cooldown**
- purpose: Verify startle is blocked when cooling down
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.accumStartle = 35`
  3. Set `behavior.cooldowns = { startle: Date.now() + 10000 }` (cooldown active)
  4. Assert `assertTrue(evaluateBehaviorEntry() !== 'startle', 'startle blocked by cooldown')`

**test_fly_entry**
- purpose: Verify accumFlight above 15 with no cooldown returns 'fly'
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.accumFlight = 20`
  3. Set `BRAIN.accumStartle = 0` (below startle threshold)
  4. Assert `assertEqual(evaluateBehaviorEntry(), 'fly', 'fly entry')`

**test_feed_entry**
- purpose: Verify accumFeed above 8 with nearby food returns 'feed'
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.accumFeed = 10`
  3. Set `BRAIN.accumStartle = 0`
  4. Set `BRAIN.accumFlight = 0`
  5. Set `food = [{ x: fly.x + 10, y: fly.y }]` (within 50px)
  6. Assert `assertEqual(evaluateBehaviorEntry(), 'feed', 'feed entry')`

**test_feed_blocked_without_food**
- purpose: Verify feed is not entered without nearby food even with high accumFeed
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.accumFeed = 10`
  3. Set `BRAIN.accumStartle = 0`
  4. Set `BRAIN.accumFlight = 0`
  5. Set `food = []` (no food)
  6. Assert `assertTrue(evaluateBehaviorEntry() !== 'feed', 'feed blocked without food')`

**test_groom_entry**
- purpose: Verify accumGroom above 8 returns 'groom'
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.accumGroom = 10`
  3. Set `BRAIN.accumStartle = 0`
  4. Set `BRAIN.accumFlight = 0`
  5. Set `BRAIN.accumFeed = 0`
  6. Assert `assertEqual(evaluateBehaviorEntry(), 'groom', 'groom entry')`

**test_rest_entry_high_fatigue**
- purpose: Verify high fatigue (above 0.7) returns 'rest'
- logic:
  1. Call `resetBrainState()`
  2. Set all accumulators to 0: `BRAIN.accumStartle = 0; BRAIN.accumFlight = 0; BRAIN.accumFeed = 0; BRAIN.accumGroom = 0; BRAIN.accumWalkLeft = 0; BRAIN.accumWalkRight = 0`
  3. Set `BRAIN.stimulate.wind = false`
  4. Set `BRAIN.drives.fatigue = 0.8`
  5. Assert `assertEqual(evaluateBehaviorEntry(), 'rest', 'rest entry from fatigue')`

**test_rest_lower_threshold_in_dark**
- purpose: Verify rest threshold drops to 0.4 when lightLevel is 0
- logic:
  1. Call `resetBrainState()`
  2. Set all accumulators to 0
  3. Set `BRAIN.stimulate.wind = false`
  4. Set `BRAIN.stimulate.lightLevel = 0`
  5. Set `BRAIN.drives.fatigue = 0.5` (above 0.4 but below 0.7)
  6. Assert `assertEqual(evaluateBehaviorEntry(), 'rest', 'rest entry in dark')`

**test_brace_entry**
- purpose: Verify brace state entry with weak wind
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.accumStartle = 0; BRAIN.accumFlight = 0; BRAIN.accumFeed = 0; BRAIN.accumGroom = 0`
  3. Set `BRAIN.stimulate.wind = true`
  4. Set `BRAIN.stimulate.windStrength = 0.3`
  5. Assert `assertEqual(evaluateBehaviorEntry(), 'brace', 'brace entry')`

**test_idle_when_nothing_active**
- purpose: Verify idle returned when no conditions met
- logic:
  1. Call `resetBrainState()`
  2. Set all accumulators to 0
  3. Set `BRAIN.stimulate.wind = false`
  4. Set `BRAIN.drives.fatigue = 0.0`
  5. Set `BRAIN.drives.curiosity = 0.0`
  6. Assert `assertEqual(evaluateBehaviorEntry(), 'idle', 'idle when nothing active')`

**test_priority_startle_over_feed**
- purpose: Verify startle takes priority over feed when both conditions are met
- logic:
  1. Call `resetBrainState()`
  2. Set `BRAIN.accumStartle = 35`
  3. Set `BRAIN.accumFeed = 10`
  4. Set `food = [{ x: fly.x + 10, y: fly.y }]`
  5. Assert `assertEqual(evaluateBehaviorEntry(), 'startle', 'startle priority over feed')`

#### Section 5: Test Runner

```
function runAllTests()
```
- purpose: Discover and run all test_* functions, render results to #summary and #results
- logic:
  1. Declare `var tests = []`
  2. Iterate over all properties of `window` (using `for (var key in window)`). For each key that starts with `'test_'` and `typeof window[key] === 'function'`, push `{ name: key, fn: window[key] }` into `tests`
  3. Sort `tests` alphabetically by `name` for deterministic output
  4. Declare `var passed = 0, failed = 0, resultsHTML = ''`
  5. For each test in `tests`:
     a. Try: call `test.fn()`, increment `passed`, append `'<div class="test-result pass">' + test.name + '</div>'` to `resultsHTML`
     b. Catch(e): increment `failed`, append `'<div class="test-result fail">' + test.name + ': ' + (e.message || e) + '</div>'` to `resultsHTML`
  6. Set `document.getElementById('results').innerHTML = resultsHTML`
  7. Compute `var total = passed + failed`
  8. Set `document.getElementById('summary').innerHTML = '<span class="summary-pass">' + passed + ' passed</span> / <span class="summary-fail">' + failed + ' failed</span> / ' + total + ' total'`

## Verification
- build: no build step (vanilla JS, open HTML in browser)
- lint: no lint configured
- test: open `tests/run.html` in a browser; all tests should show as passed with 0 failed
- smoke: the builder should verify the file exists and is valid HTML by running `cat tests/run.html | head -5` to confirm it starts with `<!DOCTYPE html>`. Then verify tests/tests.js defines all expected test functions by running `grep -c 'function test_' tests/tests.js` and confirming the count is at least 24. As a final check, if a headless browser is available, run: `cd /work && python3 -m http.server 8765 &` then `sleep 1 && curl -s http://localhost:8765/tests/run.html | grep -o '[0-9]* passed'` to confirm the test page loads (kill the server after).

## Constraints
- Do NOT modify any existing files (js/main.js, js/connectome.js, js/constants.js, index.html, css/main.css)
- Do NOT add any external dependencies or npm packages
- Do NOT add a build step — both new files must work by simply opening tests/run.html in a browser
- The tests/tests.js file must copy `normalizeAngle`, `evaluateBehaviorEntry`, `isCoolingDown`, `hasNearbyFood`, `BEHAVIOR_THRESHOLDS`, and the `behavior`/`food`/`fly` variable declarations verbatim from main.js — do NOT import main.js via a script tag (it crashes on load due to `document.getElementById('clearButton')` on line 9)
- Use only the CSS custom properties listed above — no additional hex colors, no gradients, no glow effects
- All assertion messages must be descriptive enough to identify which check failed without reading the code
- Every test function name must start with `test_` so the runner discovers it
- The `resetBrainState()` function must be called at the start of every test function to ensure test isolation
