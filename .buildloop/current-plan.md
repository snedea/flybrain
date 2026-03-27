# Plan: D65.1

## Dependencies
- list: []
- commands: []

## File Operations (in execution order)

### 1. MODIFY js/brain-worker-bridge.js
- operation: MODIFY
- reason: Clear the closure-local `latestFireState` at the end of `aggregateFireState()` so it is not re-consumed on subsequent animation frames before the next worker tick
- anchor: line 549-550, the block:
  ```js
  	if (pendingGroupSpikes) pendingGroupSpikes.fill(0);
  	pendingWorkerTicks = 0;
  ```

#### Functions
- function: `aggregateFireState()` (line 518)
  - change: Add `latestFireState = null;` immediately after line 550 (`pendingWorkerTicks = 0;`), still inside the function body, before the closing `}`
  - exact new code at end of function (lines 549-551 become):
    ```js
    	if (pendingGroupSpikes) pendingGroupSpikes.fill(0);
    	pendingWorkerTicks = 0;
    	latestFireState = null;
    ```
  - rationale: After `aggregateFireState()` consumes the fire state via either the primary path (pendingGroupSpikes) or the fallback path (latestFireState iteration), the closure-local variable must be nulled. This prevents the `workerUpdate()` guard at line 368 (`if (latestFireState || pendingWorkerTicks > 0)`) from passing on subsequent frames before the next worker tick. `BRAIN.latestFireState` (set at line 184 in the 'tick' message handler) is a separate property on the BRAIN object — it is NOT affected by this change. `neuro-renderer.js:317` reads `BRAIN.latestFireState`, not the closure-local `latestFireState`, so rendering continues to work correctly.

#### What NOT to change
- Do NOT modify `BRAIN.latestFireState` anywhere. It is a separate reference used by `neuro-renderer.js` for rendering brightness.
- Do NOT modify the worker message handler at line 183 (`latestFireState = e.data.fireState;`). That assignment is correct — it sets the value when a new tick arrives.
- Do NOT modify the `stopWorker()` function at line 559 (`latestFireState = null;`). That is correct — it clears state on pause.
- Do NOT modify the `_setFireState` test helper at line 601-604.
- Do NOT modify the `workerUpdate()` guard condition at line 368. The guard is correct; the bug is that `latestFireState` was never cleared after consumption.

### 2. MODIFY tests/tests.js
- operation: MODIFY
- reason: Add a regression test that verifies `latestFireState` is consumed (nulled) after `aggregateFireState()` runs, so a second call without new worker data takes the no-op path
- anchor: The end of `test_bridge_aggregateFireState_decay` function, just before `// --- synthesizeMotorOutputs tests ---` (line 707)

#### Functions
- Insert the following new test function between line 705 (end of `test_bridge_aggregateFireState_decay`) and line 707 (`// --- synthesizeMotorOutputs tests ---`):

```js
var test_bridge_aggregateFireState_clears_stale = function () {
	resetBrainState();
	// Setup: 2 groups, 10 neurons each
	var names = ['TEST_ST0', 'TEST_ST1'];
	for (var g = 0; g < 2; g++) {
		BRAIN.postSynaptic[names[g]] = [0, 0];
	}
	var assignments = new Uint16Array(20);
	for (var i = 0; i < 10; i++) assignments[i] = 0;
	for (var i = 10; i < 20; i++) assignments[i] = 1;
	BRAIN._bridge._setGroupState(2, 20, assignments, [10, 10], names);

	// First call: fire all neurons in group 0 via latestFireState fallback
	var fire = new Uint8Array(20);
	for (var i = 0; i < 10; i++) fire[i] = 1;
	BRAIN._bridge._setFireState(fire, null, 0);

	BRAIN._bridge.aggregateFireState();

	var FSS = BRAIN._bridge.FIRE_STATE_SCALE;
	assertClose(BRAIN.postSynaptic['TEST_ST0'][BRAIN.nextState], FSS, 0.01,
		'first call: group 0 fully active');

	// Second call: no new worker tick, latestFireState should have been cleared
	// so aggregateFireState should be a no-op (no new data to consume).
	// Copy current activation to thisState to simulate state swap
	BRAIN.postSynaptic['TEST_ST0'][BRAIN.thisState] =
		BRAIN.postSynaptic['TEST_ST0'][BRAIN.nextState];
	BRAIN.postSynaptic['TEST_ST0'][BRAIN.nextState] = 0;
	BRAIN.postSynaptic['TEST_ST1'][BRAIN.thisState] =
		BRAIN.postSynaptic['TEST_ST1'][BRAIN.nextState];
	BRAIN.postSynaptic['TEST_ST1'][BRAIN.nextState] = 0;

	BRAIN._bridge.aggregateFireState();

	// With latestFireState cleared, the fallback branch should NOT run.
	// Both pendingGroupSpikes and pendingWorkerTicks are 0, and latestFireState is null,
	// so groupFires stays all-zero. The only contribution is decay: prevActivation * 0.75.
	// Group 0: max(0, 100 * 0.75) = 75 (decay only, not 100 again from stale snapshot)
	assertClose(BRAIN.postSynaptic['TEST_ST0'][BRAIN.nextState], FSS * 0.75, 0.01,
		'second call without new tick: decays instead of re-reading stale fire state');
	// Group 1: max(0, 0 * 0.75) = 0
	assertEqual(BRAIN.postSynaptic['TEST_ST1'][BRAIN.nextState], 0,
		'second call: inactive group stays zero');
};
```

- The test is named `test_bridge_aggregateFireState_clears_stale` which follows the existing naming convention and will be auto-discovered by `runAllTests()` (line 543-545 pattern: global scope functions starting with `test_`).
- The test must be placed inside the `if (typeof BRAIN !== 'undefined' && BRAIN._bridge) {` guard block (line 598) and before the closing `}` at the end of that block.

## Verification
- build: No build step (vanilla JS project, no bundler)
- lint: No linter configured
- test: `node tests/run-node.js`
- smoke: After running tests, verify the new test `test_bridge_aggregateFireState_clears_stale` passes. The key assertion is that the second call to `aggregateFireState()` produces `75` (decay from 100) for group 0, NOT `100` (which would indicate the stale fire state was re-consumed).

## Constraints
- Do NOT modify `BRAIN.latestFireState` (the property on the BRAIN object) — only the closure-local `latestFireState` variable inside the IIFE
- Do NOT modify any file other than `js/brain-worker-bridge.js` and `tests/tests.js`
- Do NOT add any new dependencies or files
- Do NOT modify the `workerUpdate()` function — the guard logic is correct; only the missing cleanup in `aggregateFireState()` needs fixing
- Do NOT modify `js/neuro-renderer.js` — it reads `BRAIN.latestFireState` which is unaffected
- Do NOT modify the worker message handler (the `case 'tick':` block around line 182-192)
- Do NOT modify `stopWorker()` or `startWorker()` functions
- Do NOT modify `SPEC.md`, `CLAUDE.md`, or `TASKS.md`
- The single line addition (`latestFireState = null;`) is the complete fix — do not add additional logic, guards, or flags
