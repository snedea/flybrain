# Scout Report: D68.2

## Key Facts (read this first)

- **Tech stack**: Vanilla JS (ES5), no build tools. Tests use Node.js `vm.runInThisContext` to load browser JS files sequentially into shared globals.
- **Current test count**: 69 tests, all passing (`node tests/run-node.js`).
- **Load order in run-node.js**: `constants.js` → `connectome.js` (sets `BRAIN._testMode=true`) → `brain-worker-bridge.js` → `fly-logic.js` → `tests/tests.js`. Neither `main.js` nor `sim-worker.js` is loaded.
- **main.js is untestable as-is**: It executes `document.getElementById(...).onclick` at top level -- loading it in Node crashes immediately. Pure functions must be extracted to `fly-logic.js` (which IS loaded) or a new module.
- **sim-worker.js uses Worker APIs**: References `self.postMessage` and `performance.now()` -- requires mocks in run-node.js to load at all, OR extract stats logic inline.

## Relevant Files

- `tests/tests.js` -- Test file to add new `test_*` functions to; runner discovers all `test_` globals
- `tests/run-node.js` -- Load sequence; must add any new file loads and mocks (e.g. `self`, `performance`) here
- `js/fly-logic.js` -- Already loaded in tests; home for extracted pure functions from main.js
- `js/main.js` -- Contains food-seeking (line 856-865), feed approach (line 897-908), food consumption (line 1745-1788); `nearestFood()` at line 751
- `js/connectome.js` -- `motorcontrol()` reads DN_STARTLE from `nextState` at line 485 (already correct)
- `js/sim-worker.js` -- Stats accumulation at lines 358-384; reset handler at lines 460-478; `STATS_INTERVAL=20` constant at line 32

## Architecture Notes

**Test discovery**: `runAllTests()` scans the global scope for functions starting with `test_`. Tests added to `tests.js` are auto-discovered.

**Global state shared across files**: `fly`, `food`, `behavior`, `BRAIN` are globals. `fly-logic.js` functions (`evaluateBehaviorEntry`, `hasNearbyFood`, `normalizeAngle`) reference these globals directly. Extracted functions from `main.js` can follow the same pattern.

**Food proximity model**:
- `BRAIN.stimulate.foodNearby` = food within 50px (set by main.js update loop, line 1750)
- `BRAIN.stimulate.foodContact` = food within 20px (line 1752)
- `hasNearbyFood()` (fly-logic.js:41) reads the `food` array directly checking 50px -- independent of `BRAIN.stimulate.foodNearby`

**Hunger bypass for feed entry** (fly-logic.js:64-66): `evaluateBehaviorEntry()` already testable. Condition: `(BRAIN.drives.hunger > 0.7 && BRAIN.stimulate.foodNearby) || accumFeed > 8`, PLUS `hasNearbyFood()` (food within 50px in `food` array). Tests must set BOTH `BRAIN.stimulate.foodNearby = true` AND place a food item within 50px of `fly`.

**Food-seeking direction** (main.js:856-865): Uses `facingDir` (not `targetDir`) as the base for `angleDiffToFood`. `seekStrength = Math.min(1, hunger)`. Result: `targetDir = facingDir + angleDiffToFood * seekStrength`. Can be extracted as a pure function taking `(flyPos, foodPos, hunger, facingDirValue)` → `{targetDir, seekStrength}`.

**Feed approach speed**: Hardcoded `targetSpeed = 0.25` at main.js:903 inside the `'feed'` state branch of `computeMovementForBehavior()`.

**Food consumption** (main.js:1754-1787): Progress = `(food.eaten || 0) + elapsed / food.feedDuration`. When fly leaves contact range (>20px), `eaten` is updated from elapsed time and `feedStart` is reset to 0. Food is removed when `progress >= 1`. Uses `Date.now()` -- tests need to control time or set explicit `feedStart`/`feedDuration`/`eaten` values and compute progress manually.

**DN_STARTLE state** (connectome.js:485): `BRAIN.accumStartle = BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState]` -- reads `nextState` already. Directly testable: set `postSynaptic['DN_STARTLE'][nextState] = X` and `[thisState] = Y`, call `motorcontrol()`, assert `accumStartle === X`.

**sim-worker stats**: Pure arithmetic at lines 362-383. `cumulativeFiredCount += firedNeuronCount`; when `tickTimeSamples >= STATS_INTERVAL`, computes `avgFired = Math.round(cumulativeFiredCount / tickTimeSamples)` and resets. Reset handler (line 476) already clears `cumulativeFiredCount = 0` (D68.1 fix is in place). To test this without Worker environment: mock `self = {postMessage: function(){}}` and `performance = {now: function(){return 0;}}` in run-node.js, then load sim-worker.js. BUT sim-worker.js also defines `tick()` which calls `setTimeout` -- need `setTimeout` mock too. Alternatively, extract the stats accumulation into a standalone testable function.

## Suggested Approach

**Step 1 -- Extract pure functions into fly-logic.js** (no DOM/Worker deps, already loaded):
1. `computeFoodSeekDir(flyPos, foodPos, hunger, facingDirValue)` → `{targetDir, seekStrength}` -- extracted from main.js:858-862
2. `computeFoodProgress(foodItem, now)` → progress value (0..1) -- extracted from main.js:1761

**Step 2 -- sim-worker.js stats**: Simplest path is to add mocks to run-node.js (`global.self`, `global.performance`, `global.setTimeout`) and load sim-worker.js as an additional file. Then expose module-level vars (`cumulativeFiredCount`, `tickTimeSamples`, etc.) via a test hook object (similar to `BRAIN._bridge`). Alternative: extract a `trackFiredCount(n)` function and expose it.

**Step 3 -- Add tests to tests.js**:
- (a) food-seeking: call extracted `computeFoodSeekDir()`, verify `targetDir` is based on `facingDir + offset`, `seekStrength = hunger` when hunger < 1
- (b) feed entry bypass: set hunger=0.8, `BRAIN.stimulate.foodNearby=true`, food at 30px → returns 'feed'; hunger=0.65 same setup → does NOT return 'feed' via bypass (requires accumFeed > 8)
- (c) food consumption: construct food item with known `feedStart`/`feedDuration`/`eaten`; call extracted progress function; verify eaten accumulates across exits; verify removal at progress >= 1
- (d) sim-worker stats: drive fake ticks (increment `tickTimeSamples`, call `cumulativeFiredCount` accumulator), verify avg and reset; verify reset handler zeroes it
- (e) DN_STARTLE: set `postSynaptic['DN_STARTLE'][nextState]=50`, `[thisState]=5`, call `motorcontrol()`, assert `accumStartle === 50`

**Step 4 -- Update run-node.js** to load any new extracted functions file and/or sim-worker with mocks.

## Risks and Constraints (read this last)

1. **sim-worker.js load complexity**: Even with mocks for `self`, `performance`, `setTimeout`, the `tick()` function uses `decompressGzip` and many other globals. Only the stats-related variables need to be exercised -- consider a minimal test harness that simulates just the stats accumulation loop rather than loading the full worker.

2. **food consumption is time-based**: `Date.now()` is embedded in the production loop. Tests should mock `Date.now` (like `withMockedRandom`) or use the extracted function with explicit time params.

3. **nearestFood() is in main.js** (line 751): If food-seeking tests need it, either re-implement inline in the test or extract to fly-logic.js as well. The function uses globals `fly` and `food` which are already available in the test context.

4. **Feed approach speed is a bare literal `0.25`**: No named constant exists. The test can only assert the value by calling `computeMovementForBehavior()` -- but that function uses global `state = behavior.current`, `speed`, `targetSpeed`, `speedChangeInterval` -- all undefined in Node. Safer to assert the constant value by extracting `FEED_APPROACH_SPEED = 0.25` or by testing a small extracted helper.

5. **DN_STARTLE test (e) is straightforward** -- only needs `resetBrainState()` + direct manipulation of `postSynaptic` + `motorcontrol()` call. No extraction needed.

6. **D68.1 is already merged**: `cumulativeFiredCount = 0` is present in the reset handler (sim-worker.js:476). The test for (d) should verify this works; it doesn't need to fix anything.
