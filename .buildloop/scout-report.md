# Scout Report: D24.1

## Key Facts (read this first)

- **Tech stack**: Vanilla ES5 JavaScript, no bundler, no npm. Tests run via Node.js `vm.runInThisContext` (simulates `<script>` tag loading into a shared global scope). No build step.
- **Critical constraint**: `brain-worker-bridge.js` is an immediately-invoked IIFE (`(function(){ ... })()`). All four target functions (`synthesizeMotorOutputs`, `aggregateFireState`, `buildGroupIndices`, `sendStimulation`) are in closure scope — completely inaccessible from outside. `initBridge()` runs at the bottom of the IIFE and immediately calls DOM/fetch/Worker APIs that don't exist in Node.
- **D23.1–D23.4 prerequisite is NOT met**: Many groups are still empty (DRIVE_FEAR=0, DRIVE_GROOM=0, DRIVE_CURIOSITY=0, NOCI=0, MB_MBON_AV=0, LH_AV=0, DN_STARTLE=0, all MN_LEG/WING=0). neuron_meta.json confirms 31 of 63 groups have 0 neurons. If tests are written now and D23 later changes the logic, tests will need updating.
- **DN_STARTLE state mismatch confirmed**: `synthesizeMotorOutputs` writes DN_STARTLE to `BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState]` (via `addPS`), but `motorcontrol()` reads it from `[BRAIN.thisState]` (connectome.js:485). Tests covering DN_STARTLE must account for this bug (or verify the fix if D23.2 is done first).
- **sendStimulation is NOT purely testable**: It uses closure `worker` (Web Worker object) and `groupIndices` (populated from binary data). Testing it requires either a mock worker or restructuring it to be IO-free.

## Relevant Files

| File | Role |
|------|------|
| `js/brain-worker-bridge.js` | Primary target — IIFE to refactor; contains all 4 functions to expose |
| `tests/tests.js` | Existing 45 tests (all legacy 59-group path); new tests go here |
| `tests/run-node.js` | Node test runner — loads files via `vm.runInThisContext`; must be updated to load the refactored bridge module |
| `js/connectome.js` | Defines BRAIN object, `BRAIN.motorcontrol()`, `BRAIN.setup()`, `BRAIN.postSynaptic`, state indices; DN_STARTLE bug at line 485 |
| `js/constants.js` | 59-group weights — needed by `BRAIN.setup()` for postSynaptic initialization in tests |
| `js/fly-logic.js` | `BEHAVIOR_THRESHOLDS`, `evaluateBehaviorEntry()` — needed for context on motor threshold values |
| `data/neuron_meta.json` | Runtime group metadata (63 groups); test scaffolding must replicate its structure in memory |

## Architecture Notes

### IIFE closure state dependencies

Functions depend on these IIFE-local vars:
- `aggregateFireState()`: reads `pendingGroupSpikes`, `pendingWorkerTicks`, `latestFireState`, `neuronCount`, `groupCount`, `groupIdArr`, `groupSizes`, `groupIdToName`; writes back to `pendingGroupSpikes`/`pendingWorkerTicks`; also reads `BRAIN.postSynaptic`/`BRAIN.nextState`/`BRAIN.thisState`
- `synthesizeMotorOutputs()`: reads only `BRAIN.postSynaptic` (via `readPS`/`addPS`) and `BRAIN.nextState`. Only local dep is `MOTOR_SCALE = 0.6` constant. **Most testable function.**
- `buildGroupIndices()`: reads `groupCount`, `neuronCount`, `groupIdArr`; writes `groupIndices`
- `sendStimulation()`: reads `groupNameToId`, `groupIndices`, `BRAIN.drives`, `BRAIN.stimulate`, `BRAIN._isMoving`; calls `worker.postMessage()` — requires Web Worker mock

### Test runner mechanism

`run-node.js` uses `vm.runInThisContext(code)` — all `var`-declared identifiers become globals. The IIFE in brain-worker-bridge.js will execute immediately upon load, calling `initBridge()` → `fetch()` + `new Worker()` which will crash in Node.

### BRAIN.postSynaptic initialization

`BRAIN.setup()` in connectome.js initializes `BRAIN.postSynaptic` from the `weights` object (from constants.js). The worker bridge groups (e.g., `MN_LEG_L1`, `DRIVE_FEAR`, etc.) are already present as entries in `weights`, so `BRAIN.setup()` creates the `[0,0]` arrays for them. Tests can call `resetBrainState()` → `BRAIN.setup()` as usual.

### virtual groups bypass (per D23.1 spec)

For DRIVE_FEAR/CURIOSITY/GROOM (0 neurons), `workerUpdate()` is supposed to write `BRAIN.drives.fear` → `BRAIN.postSynaptic['DRIVE_FEAR'][nextState]` etc. This logic may or may not be present depending on D23.1 completion. Currently NOT present in the code.

## Suggested Approach

**Recommended: `BRAIN._bridge` test-only namespace guarded by a flag** (avoid creating a new file)

1. Add a guard at the top of the IIFE: `if (typeof BRAIN === 'undefined') return;` and check `BRAIN._testMode` before calling `initBridge()`. When `BRAIN._testMode = true`, the IIFE should expose functions but NOT call `initBridge()`.

2. Expose the functions + required mutable state as `BRAIN._bridge`:
   ```js
   BRAIN._bridge = {
     // The pure functions
     synthesizeMotorOutputs: synthesizeMotorOutputs,
     aggregateFireState: aggregateFireState,
     buildGroupIndices: buildGroupIndices,
     sendStimulationDryRun: function(captureAddGroup) { ... }, // testable version
     // Mutable state setters for test setup
     _setGroupState: function(gc, gs, gIdArr, nCount, gIdToName) { ... },
     _setFireState: function(fs, spikes, ticks) { ... },
     FIRE_STATE_SCALE: FIRE_STATE_SCALE,
     MOTOR_SCALE: MOTOR_SCALE,
   };
   ```

3. In `run-node.js`: set `global.BRAIN = {}; BRAIN._testMode = true;` before loading the bridge. Or set it after loading connectome.js but before loading the bridge.

4. **Test strategy for each function**:
   - `aggregateFireState`: call `BRAIN._bridge._setGroupState(...)` to inject synthetic group data, then set `BRAIN._bridge._setFireState(syntheticUint8Array, null, 0)`, call `BRAIN._bridge.aggregateFireState()`, check `BRAIN.postSynaptic[name][BRAIN.nextState]`
   - `synthesizeMotorOutputs`: set `BRAIN.postSynaptic[name][BRAIN.nextState]` directly via `resetBrainState()` + manual assignment, call `BRAIN._bridge.synthesizeMotorOutputs()`, check motor group postSynaptic values and then call `BRAIN.motorcontrol()` to check accumulators
   - `virtual group bypass`: patch `workerUpdate` to be callable, verify drives flow into postSynaptic
   - `sendStimulation mapping`: test a dry-run version that collects the `addGroup(name, intensity)` calls rather than posting to a worker

## Risks and Constraints (read this last)

1. **D23.1–D23.4 not complete**: Tests involving real group activations (aggregateFireState with actual empty groups, virtual group bypass) will test the current broken state unless D23 is done first. The task description says this is a prerequisite — the planner must decide whether to stub/skip these tests or implement them against the current (broken) state and update after D23.

2. **synthesizeMotorOutputs early exit at line 312**: `if (total < 0.5) return;` — any test that doesn't inject sufficient `GNG_DESC`+`VNC_CPG` will get an early return and see zero motor output. Test cases must inject non-trivial values for these or test the early exit path explicitly.

3. **sendStimulation cannot be tested as-is**: It calls `worker.postMessage()` directly. Only a dry-run wrapper or a spy/capture approach will work. The planner should consider whether to add a `_testAddGroupHook` callback or refactor the segment-collection loop into a separate function.

4. **Math.random in synthesizeMotorOutputs**: The jitter `(Math.random() - 0.5) * 0.04` on walkL/walkR makes exact equality assertions fragile. Tests must use `assertClose` with tolerance ≥ 0.04 or mock `Math.random`.

5. **DN_STARTLE off-by-one state bug**: `addPS('DN_STARTLE', ...)` writes to `nextState`, but `motorcontrol()` reads `[thisState]`. Tests verifying DN_STARTLE must call the state swap manually after `synthesizeMotorOutputs()` before calling `motorcontrol()`, or test `BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState]` directly without going through motorcontrol. This bug should be fixed in D23.2 first.

6. **IIFE runs immediately on load**: The Node test runner calls `vm.runInThisContext(code)` which executes the IIFE instantly. Without a `_testMode` guard, `initBridge()` will throw `ReferenceError: fetch is not defined`. The refactor MUST prevent `initBridge()` from running in test context.

7. **No package.json / no test framework**: Tests use a hand-rolled assertion library. The 15-20 new tests must follow the exact same pattern as existing tests (plain functions named `test_*`, use `assertEqual`/`assertClose`/`assertTrue`).
