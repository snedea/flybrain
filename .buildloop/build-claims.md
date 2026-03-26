# Build Claims -- T7.4

## Files Changed
- [MODIFY] js/sim-worker.js -- Added groupId to ready message, sustained stimulation state vars, step 1.5 sustained stimulation in tick(), and setStimulusState message handler
- [CREATE] js/brain-worker-bridge.js -- Bridge between main thread BRAIN.update() and LIF Web Worker: loads connectome binary, translates stimulation/drives to worker messages, aggregates fire states back into BRAIN.postSynaptic format, with fallback to legacy 59-group simulation
- [MODIFY] index.html -- Added brain-worker-bridge.js script tag after connectome.js and before fly-logic.js

## Verification Results
- Build: PASS (no build step — vanilla JS project)
- Tests: PASS (`node tests/run-node.js` — 45 passed / 0 failed / 45 total)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: js/sim-worker.js ready message now includes `groupId: groupId` (Uint16Array) so the bridge can build per-group neuron indices
- [ ] Claim 2: js/sim-worker.js has `sustainedIndices` and `sustainedIntensities` module-level vars, applied in tick() step 1.5 between decay and propagation, only to non-refractory neurons
- [ ] Claim 3: js/sim-worker.js has new `setStimulusState` message handler that sets sustainedIndices/sustainedIntensities (existing one-shot `stimulate` handler is preserved unchanged)
- [ ] Claim 4: js/brain-worker-bridge.js is an IIFE that saves `legacyUpdate = BRAIN.update`, then async-fetches `data/neuron_meta.json` and `data/connectome.bin.gz`, creates a Worker, and on ready replaces `BRAIN.update` with `workerUpdate`
- [ ] Claim 5: If fetch of neuron_meta.json or connectome.bin.gz fails (HTTP error or network), the catch handler logs a console.warn and restores `BRAIN.update = legacyUpdate` — this is the expected default state until users run the preprocessing pipeline
- [ ] Claim 6: If the worker posts an `error` message or the worker crashes (onerror), the bridge falls back to legacyUpdate with console.warn
- [ ] Claim 7: `workerUpdate()` calls BRAIN.updateDrives(), sendStimulation(), aggregateFireState(), BRAIN.motorcontrol(), and performs the state swap — maintaining compatibility with the existing behavioral state machine
- [ ] Claim 8: `sendStimulation()` translates BRAIN.drives thresholds and BRAIN.stimulate flags to batched setStimulusState worker messages mapping to group names (DRIVE_HUNGER, MECH_BRISTLE, OLF_ORN_FOOD, etc.)
- [ ] Claim 9: `aggregateFireState()` sums per-neuron fire states into per-group fractions, scales by FIRE_STATE_SCALE (100), and writes to BRAIN.postSynaptic[name][BRAIN.nextState]
- [ ] Claim 10: index.html loads brain-worker-bridge.js after connectome.js and before fly-logic.js, matching the required script order
- [ ] Claim 11: No modifications were made to connectome.js, fly-logic.js, main.js, or constants.js (per constraints)
- [ ] Claim 12: No npm or external dependencies were added
- [ ] Claim 13: STIM_INTENSITY (0.15) and FIRE_STATE_SCALE (100) are defined as tunable constants at the top of the bridge IIFE

## Gaps and Assumptions
- The data files (data/connectome.bin.gz and data/neuron_meta.json) do not exist yet — they are outputs of scripts/build_connectome.py from T7.1 which requires FlyWire CSV data. The fallback path (legacy BRAIN.update) will be active until those files are generated.
- STIM_INTENSITY and FIRE_STATE_SCALE are initial guesses that may need tuning in T7.7 for realistic behavioral response.
- Browser smoke test was not performed (headless browser not available in this environment). The node test suite passes, confirming no regressions in fly-logic.js pure functions.
- The bridge assumes neuron_meta.json has fields: group_count (int), group_sizes (array), groups (array of {name, id}). This matches the T7.2 spec output format.
- The groupId Uint16Array transfer in the ready message uses structured clone (not transferable) — this is a one-time cost at init and acceptable.
