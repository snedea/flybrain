# Plan: D68.2

## Dependencies
- list: none (vanilla JS, Node.js vm module already used)
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/fly-logic.js
- operation: MODIFY
- reason: Extract three pure functions from main.js that are currently untestable due to DOM/global coupling. These functions will be loaded by run-node.js (already loads fly-logic.js) and exercised by tests.
- anchor: the file ends after `evaluateBehaviorEntry` — append new functions after the closing `}` on line 92

#### Functions

- signature: `function computeFoodSeekDir(flyX, flyY, foodX, foodY, hunger, facingDirVal)`
  - purpose: Pure extraction of main.js food-seeking steering logic (lines 856-865)
  - logic:
    1. Compute `foodAngle = Math.atan2(-(foodY - flyY), foodX - flyX)` (canvas Y-axis is inverted)
    2. Compute `seekStrength = Math.min(1, hunger)`
    3. Compute `angleDiffToFood = normalizeAngle(foodAngle - facingDirVal)`
    4. Compute `targetDir = facingDirVal + angleDiffToFood * seekStrength`
    5. Return `{ targetDir: targetDir, seekStrength: seekStrength }`
  - calls: `normalizeAngle(a)` (defined earlier in same file)
  - returns: `{ targetDir: number, seekStrength: number }`
  - error handling: none

- signature: `function computeFoodProgress(foodItem, now)`
  - purpose: Pure extraction of food consumption progress calculation (main.js lines 1760-1761)
  - logic:
    1. Compute `elapsed = now - foodItem.feedStart`
    2. Compute `progress = Math.min(1, (foodItem.eaten || 0) + elapsed / foodItem.feedDuration)`
    3. Return `progress`
  - calls: none
  - returns: `number` (0 to 1 inclusive)
  - error handling: none

- signature: `function pauseFeeding(foodItem, now)`
  - purpose: Pure extraction of the pause-feeding logic when fly leaves contact range (main.js lines 1773-1776)
  - logic:
    1. If `foodItem.feedStart === 0`, return (already paused)
    2. Compute `ate = now - foodItem.feedStart`
    3. Set `foodItem.eaten = Math.min(1, (foodItem.eaten || 0) + ate / foodItem.feedDuration)`
    4. Set `foodItem.feedStart = 0`
  - calls: none
  - returns: void (mutates foodItem in place)
  - error handling: none

- signature: `var FEED_APPROACH_SPEED = 0.25;`
  - purpose: Named constant for the feed approach speed (currently a bare literal `0.25` at main.js:903). Extracted so tests can assert against a named value.
  - logic: Simple constant declaration
  - returns: n/a

#### Wiring / Integration
- These functions are appended at the end of fly-logic.js, after line 92
- main.js does NOT need to be modified to call these extracted functions (the tests exercise the pure logic independently; main.js keeps its inline versions)
- All four additions go below the closing brace of `evaluateBehaviorEntry`

### 2. MODIFY tests/run-node.js
- operation: MODIFY
- reason: No changes needed for fly-logic.js extraction (already loaded). However, no new files need loading. The file order already loads fly-logic.js. No modification required.
- NOTE: This step is a NO-OP. run-node.js already loads `js/fly-logic.js` in phase 3 (line 30). The extracted functions in fly-logic.js will be available. No sim-worker.js loading is needed because the sim-worker stats tests will be self-contained arithmetic tests that replicate the accumulation logic inline rather than loading the full worker (which would require extensive DOM/Worker mocking).

### 3. MODIFY tests/tests.js
- operation: MODIFY
- reason: Add new test functions for all five test areas (a)-(e). Tests are auto-discovered by `runAllTests()` scanning for `test_` prefixed globals.
- anchor: Insert new tests BEFORE the final bridge-tests guard block. The insertion point is just before line 594: `// Section 5: Worker Bridge Tests (require BRAIN._bridge)`

#### New test block header
Insert the following comment block before line 594 (`// Section 5: Worker Bridge Tests (require BRAIN._bridge)`):
```
// ============================================================
// Section 4b: Food-Seeking, Consumption, Stats, and Startle Tests (D68.2)
// ============================================================
```

#### Functions

##### Test group (a): Food-seeking direction

- signature: `function test_food_seek_uses_facingDir_not_targetDir()`
  - purpose: Verify food-seeking steering is based on facingDir, not some other angle
  - logic:
    1. Call `resetBrainState()`
    2. Set `var facingDirVal = Math.PI / 4` (fly facing 45 degrees)
    3. Set food position at `foodX = 500, foodY = 200` and fly position at `flyX = 400, flyY = 300`
    4. Call `var result = computeFoodSeekDir(flyX, flyY, foodX, foodY, 0.8, facingDirVal)`
    5. Compute expected: `foodAngle = Math.atan2(-(200 - 300), 500 - 400)` = `Math.atan2(100, 100)` = `Math.PI/4`
    6. `angleDiff = normalizeAngle(Math.PI/4 - Math.PI/4)` = 0
    7. Assert `result.targetDir` is close to `facingDirVal + 0 * 0.8` = `Math.PI/4` within tolerance 0.001
    8. Now test with a different facingDir: set `facingDirVal2 = -Math.PI / 2` (facing down)
    9. Call `var result2 = computeFoodSeekDir(flyX, flyY, foodX, foodY, 0.8, facingDirVal2)`
    10. `angleDiff2 = normalizeAngle(Math.PI/4 - (-Math.PI/2))` = `normalizeAngle(3*Math.PI/4)` = `3*Math.PI/4`
    11. Assert `result2.targetDir` is close to `-Math.PI/2 + (3*Math.PI/4) * 0.8` within tolerance 0.001
    12. Assert `result2.targetDir !== result.targetDir` (different facingDir produces different result)
  - calls: `resetBrainState()`, `computeFoodSeekDir()`, `normalizeAngle()`, `assertClose()`
  - returns: void (throws TestFailure on assertion failure)

- signature: `function test_food_seek_strength_scales_with_hunger()`
  - purpose: Verify seekStrength = min(1, hunger)
  - logic:
    1. Call `var r1 = computeFoodSeekDir(400, 300, 500, 200, 0.3, 0)` — hunger 0.3
    2. Assert `r1.seekStrength === 0.3` using `assertClose(r1.seekStrength, 0.3, 0.001, ...)`
    3. Call `var r2 = computeFoodSeekDir(400, 300, 500, 200, 0.9, 0)` — hunger 0.9
    4. Assert `r2.seekStrength === 0.9` using `assertClose(r2.seekStrength, 0.9, 0.001, ...)`
    5. Call `var r3 = computeFoodSeekDir(400, 300, 500, 200, 1.5, 0)` — hunger > 1 (clamped)
    6. Assert `r3.seekStrength === 1.0` using `assertClose(r3.seekStrength, 1.0, 0.001, ...)`
  - calls: `computeFoodSeekDir()`, `assertClose()`
  - returns: void

- signature: `function test_feed_approach_speed_constant()`
  - purpose: Verify the feed approach speed constant is 0.25
  - logic:
    1. Assert `assertEqual(FEED_APPROACH_SPEED, 0.25, 'feed approach speed is 0.25')`
  - calls: `assertEqual()`
  - returns: void

##### Test group (b): Feed entry bypass

- signature: `function test_feed_entry_hunger_bypass_at_50px()`
  - purpose: Verify feed state enters when hunger > 0.7 and food within 50px (bypass path), without needing accumFeed > 8
  - logic:
    1. Call `resetBrainState()`
    2. Set `BRAIN.drives.hunger = 0.8`
    3. Set `BRAIN.stimulate.foodNearby = true`
    4. Set `BRAIN.accumFeed = 0` (below threshold 8 — not the neural pathway)
    5. Set `fly.x = 400; fly.y = 300`
    6. Set `food = [{ x: 430, y: 300, feedStart: 0, feedDuration: 3000, radius: 10 }]` — distance = 30px (within 50px for hasNearbyFood, outside 20px contact)
    7. Call `var state = evaluateBehaviorEntry()`
    8. Assert `assertEqual(state, 'feed', 'hunger bypass enters feed at 50px range')`
  - calls: `resetBrainState()`, `evaluateBehaviorEntry()`, `assertEqual()`
  - returns: void

- signature: `function test_feed_entry_hunger_bypass_requires_high_hunger()`
  - purpose: Verify hunger bypass does NOT trigger when hunger <= 0.7
  - logic:
    1. Call `resetBrainState()`
    2. Set `BRAIN.drives.hunger = 0.65` (below 0.7 threshold)
    3. Set `BRAIN.stimulate.foodNearby = true`
    4. Set `BRAIN.accumFeed = 0`
    5. Set `fly.x = 400; fly.y = 300`
    6. Set `food = [{ x: 430, y: 300, feedStart: 0, feedDuration: 3000, radius: 10 }]`
    7. Call `var state = evaluateBehaviorEntry()`
    8. Assert `assertTrue(state !== 'feed', 'no feed entry when hunger <= 0.7 and accumFeed < 8')`
  - calls: `resetBrainState()`, `evaluateBehaviorEntry()`, `assertTrue()`
  - returns: void

- signature: `function test_feed_entry_neural_pathway_requires_20px()`
  - purpose: Verify the neural pathway (accumFeed > 8) still requires hasNearbyFood (50px) to enter feed
  - logic:
    1. Call `resetBrainState()`
    2. Set `BRAIN.accumFeed = 10` (above threshold 8)
    3. Set `BRAIN.drives.hunger = 0.3` (low, so bypass won't trigger)
    4. Set `BRAIN.stimulate.foodNearby = false` (no brain signal)
    5. Set `fly.x = 400; fly.y = 300`
    6. Set `food = [{ x: 460, y: 300, feedStart: 0, feedDuration: 3000, radius: 10 }]` — distance = 60px (outside hasNearbyFood 50px range)
    7. Call `var state = evaluateBehaviorEntry()`
    8. Assert `assertTrue(state !== 'feed', 'neural pathway blocked when food > 50px')`
  - calls: `resetBrainState()`, `evaluateBehaviorEntry()`, `assertTrue()`
  - returns: void

- signature: `function test_feed_entry_neural_pathway_within_50px()`
  - purpose: Verify neural pathway (accumFeed > 8) enters feed when food within 50px
  - logic:
    1. Call `resetBrainState()`
    2. Set `BRAIN.accumFeed = 10` (above threshold 8)
    3. Set `BRAIN.drives.hunger = 0.3`
    4. Set `BRAIN.stimulate.foodNearby = false` (doesn't matter for this path since feedReady checks accumFeed first)
    5. Set `fly.x = 400; fly.y = 300`
    6. Set `food = [{ x: 425, y: 300, feedStart: 0, feedDuration: 3000, radius: 10 }]` — distance = 25px (within hasNearbyFood 50px)
    7. Call `var state = evaluateBehaviorEntry()`
    8. Assert `assertEqual(state, 'feed', 'neural pathway enters feed when food within 50px')`
  - calls: `resetBrainState()`, `evaluateBehaviorEntry()`, `assertEqual()`
  - returns: void

##### Test group (c): Food consumption

- signature: `function test_food_progress_accumulates()`
  - purpose: Verify computeFoodProgress returns correct accumulated progress
  - logic:
    1. Create `var item = { feedStart: 1000, feedDuration: 4000, eaten: 0 }`
    2. Call `var p1 = computeFoodProgress(item, 2000)` — elapsed = 1000, progress = 0 + 1000/4000 = 0.25
    3. Assert `assertClose(p1, 0.25, 0.001, 'progress is 0.25 after 1s of 4s')`
    4. Create `var item2 = { feedStart: 1000, feedDuration: 4000, eaten: 0.5 }` — had prior eaten progress
    5. Call `var p2 = computeFoodProgress(item2, 2000)` — progress = 0.5 + 1000/4000 = 0.75
    6. Assert `assertClose(p2, 0.75, 0.001, 'progress accumulates with prior eaten')`
  - calls: `computeFoodProgress()`, `assertClose()`
  - returns: void

- signature: `function test_food_progress_clamped_at_one()`
  - purpose: Verify progress is clamped to 1.0 (food fully consumed)
  - logic:
    1. Create `var item = { feedStart: 1000, feedDuration: 2000, eaten: 0.8 }`
    2. Call `var p = computeFoodProgress(item, 5000)` — elapsed = 4000, raw progress = 0.8 + 4000/2000 = 2.8, clamped to 1.0
    3. Assert `assertEqual(p, 1, 'progress clamped at 1')`
  - calls: `computeFoodProgress()`, `assertEqual()`
  - returns: void

- signature: `function test_food_pause_preserves_eaten_progress()`
  - purpose: Verify pauseFeeding accumulates eaten progress and resets feedStart to 0
  - logic:
    1. Create `var item = { feedStart: 1000, feedDuration: 4000, eaten: 0.1 }`
    2. Call `pauseFeeding(item, 3000)` — ate = 2000, eaten = min(1, 0.1 + 2000/4000) = 0.6
    3. Assert `assertClose(item.eaten, 0.6, 0.001, 'eaten accumulates on pause')`
    4. Assert `assertEqual(item.feedStart, 0, 'feedStart reset to 0 on pause')`
  - calls: `pauseFeeding()`, `assertClose()`, `assertEqual()`
  - returns: void

- signature: `function test_food_pause_noop_when_not_feeding()`
  - purpose: Verify pauseFeeding does nothing when feedStart is already 0
  - logic:
    1. Create `var item = { feedStart: 0, feedDuration: 4000, eaten: 0.3 }`
    2. Call `pauseFeeding(item, 5000)`
    3. Assert `assertClose(item.eaten, 0.3, 0.001, 'eaten unchanged when already paused')`
    4. Assert `assertEqual(item.feedStart, 0, 'feedStart stays 0')`
  - calls: `pauseFeeding()`, `assertClose()`, `assertEqual()`
  - returns: void

- signature: `function test_food_removal_at_full_progress()`
  - purpose: Verify food is removed from array when progress >= 1 (integration-style test using computeFoodProgress)
  - logic:
    1. Set `food = [{ x: 400, y: 300, feedStart: 1000, feedDuration: 2000, eaten: 0, radius: 10 }]`
    2. Call `var p = computeFoodProgress(food[0], 3000)` — progress = 0 + 2000/2000 = 1.0
    3. Assert `assertEqual(p >= 1, true, 'food fully consumed')`
    4. Simulate removal: `if (p >= 1) { food.splice(0, 1); }`
    5. Assert `assertEqual(food.length, 0, 'food removed from array')`
  - calls: `computeFoodProgress()`, `assertEqual()`
  - returns: void

##### Test group (d): sim-worker averaged stats (inline arithmetic, no worker loading)

- signature: `function test_simworker_stats_accumulation_and_averaging()`
  - purpose: Verify the stats accumulation logic: cumulativeFiredCount accumulates, averages correctly, and resets after STATS_INTERVAL ticks
  - logic:
    1. Simulate the worker stats loop inline (no actual worker loading):
    2. Set `var STATS_INTERVAL_LOCAL = 20`
    3. Set `var cumulativeFiredCount = 0, tickTimeSamples = 0, tickTimeSum = 0`
    4. Simulate 20 ticks, each with `firedNeuronCount = 10`:
       ```
       for (var i = 0; i < 20; i++) {
           tickTimeSamples++;
           cumulativeFiredCount += 10;
           tickTimeSum += 5.0; // 5ms per tick
       }
       ```
    5. Assert `assertEqual(tickTimeSamples, 20, 'samples reached STATS_INTERVAL')`
    6. Assert `assertEqual(cumulativeFiredCount, 200, 'cumulative fired = 20 * 10')`
    7. Compute `var avgFired = Math.round(cumulativeFiredCount / tickTimeSamples)` = 10
    8. Assert `assertEqual(avgFired, 10, 'average fired neurons per tick is 10')`
    9. Compute `var avgMs = tickTimeSum / tickTimeSamples` = 5.0
    10. Assert `assertClose(avgMs, 5.0, 0.001, 'average tick time is 5ms')`
    11. Reset: `tickTimeSum = 0; tickTimeSamples = 0; cumulativeFiredCount = 0`
    12. Assert `assertEqual(cumulativeFiredCount, 0, 'cumulative reset after stats emit')`
    13. Assert `assertEqual(tickTimeSamples, 0, 'samples reset after stats emit')`
  - calls: `assertEqual()`, `assertClose()`
  - returns: void

- signature: `function test_simworker_stats_varying_fire_counts()`
  - purpose: Verify averaging works correctly when fired counts vary per tick
  - logic:
    1. Set `var cumulativeFiredCount = 0, tickTimeSamples = 0`
    2. Simulate 20 ticks with varying fire counts: ticks 0-9 fire 5 neurons, ticks 10-19 fire 15 neurons
       ```
       for (var i = 0; i < 10; i++) { tickTimeSamples++; cumulativeFiredCount += 5; }
       for (var i = 0; i < 10; i++) { tickTimeSamples++; cumulativeFiredCount += 15; }
       ```
    3. Assert `assertEqual(cumulativeFiredCount, 200, 'cumulative = 50 + 150')`
    4. Compute `var avgFired = Math.round(cumulativeFiredCount / tickTimeSamples)` = 10
    5. Assert `assertEqual(avgFired, 10, 'average over varying counts is 10')`
  - calls: `assertEqual()`
  - returns: void

- signature: `function test_simworker_reset_clears_cumulative()`
  - purpose: Verify that the reset handler zeros cumulativeFiredCount (the D68.1 fix)
  - logic:
    1. Simulate pre-reset state: `var cumulativeFiredCount = 150, tickTimeSamples = 8, tickTimeSum = 40`
    2. Simulate reset handler (replicating sim-worker.js lines 474-477):
       ```
       tickTimeSum = 0;
       tickTimeSamples = 0;
       cumulativeFiredCount = 0;
       ```
    3. Assert `assertEqual(cumulativeFiredCount, 0, 'cumulativeFiredCount cleared on reset')`
    4. Assert `assertEqual(tickTimeSamples, 0, 'tickTimeSamples cleared on reset')`
    5. Assert `assertEqual(tickTimeSum, 0, 'tickTimeSum cleared on reset')`
    6. Simulate a post-reset tick: `tickTimeSamples++; cumulativeFiredCount += 7; tickTimeSum += 3.0`
    7. Assert `assertEqual(cumulativeFiredCount, 7, 'post-reset accumulation starts fresh')`
  - calls: `assertEqual()`
  - returns: void

##### Test group (e): DN_STARTLE reads nextState

- signature: `function test_dn_startle_reads_nextState()`
  - purpose: Verify motorcontrol reads DN_STARTLE from nextState, not thisState
  - logic:
    1. Call `resetBrainState()`
    2. Set `BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState] = 50`
    3. Set `BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState] = 5`
    4. Call `BRAIN.motorcontrol()`
    5. Assert `assertEqual(BRAIN.accumStartle, 50, 'accumStartle reads from nextState (50), not thisState (5)')`
  - calls: `resetBrainState()`, `BRAIN.motorcontrol()`, `assertEqual()`
  - returns: void

- signature: `function test_dn_startle_zero_when_no_signal()`
  - purpose: Verify accumStartle is 0 when DN_STARTLE has no activation
  - logic:
    1. Call `resetBrainState()`
    2. Set `BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState] = 0`
    3. Set `BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState] = 0`
    4. Call `BRAIN.motorcontrol()`
    5. Assert `assertEqual(BRAIN.accumStartle, 0, 'accumStartle is 0 when no signal')`
  - calls: `resetBrainState()`, `BRAIN.motorcontrol()`, `assertEqual()`
  - returns: void

- signature: `function test_dn_startle_negative_floored()`
  - purpose: Verify accumStartle is floored at 0 for negative values
  - logic:
    1. Call `resetBrainState()`
    2. Set `BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState] = -10`
    3. Call `BRAIN.motorcontrol()`
    4. Assert `assertEqual(BRAIN.accumStartle, 0, 'negative startle floored at 0')`
  - calls: `resetBrainState()`, `BRAIN.motorcontrol()`, `assertEqual()`
  - returns: void

## Verification
- build: n/a (no build step, vanilla JS)
- lint: n/a (no linter configured)
- test: `node tests/run-node.js`
- smoke: Run `node tests/run-node.js` and verify output shows all tests passing. Count should increase from 69 to at least 85 (16 new tests added). Exact expected output: `PASS: <N> / <N> tests passed`

## Constraints
- Do NOT modify js/main.js — extracted functions go in fly-logic.js
- Do NOT modify js/sim-worker.js — stats tests replicate the arithmetic inline
- Do NOT modify js/connectome.js — DN_STARTLE already reads nextState correctly (line 485)
- Do NOT load sim-worker.js in run-node.js — it requires too many Worker/DOM mocks
- Do NOT modify tests/run-node.js — fly-logic.js is already loaded
- Do NOT modify SPEC.md, TASKS.md, or CLAUDE.md
- All new test functions must be prefixed with `test_` to be auto-discovered by `runAllTests()`
- All new tests must call `resetBrainState()` first if they touch BRAIN state
- The new test section must appear BEFORE the `if (typeof BRAIN !== 'undefined' && BRAIN._bridge) {` guard block (line 598) so tests are always executed (not gated behind bridge availability)
- Keep food items in test setup minimal: `{ x, y, feedStart, feedDuration, eaten, radius }` (all fields the production code reads)
