# Build Claims -- D24.1

## Files Changed
- [MODIFY] js/brain-worker-bridge.js -- Added collectStimulationSegments() pure function extracting mapping logic from sendStimulation(); refactored sendStimulation() to use it; added virtual group bypass block (DRIVE_FEAR, DRIVE_CURIOSITY, DRIVE_GROOM) before synthesizeMotorOutputs in workerUpdate(); replaced initBridge() call with BRAIN._testMode guard that exposes BRAIN._bridge namespace with internal functions and test helpers
- [MODIFY] tests/run-node.js -- Rewrote to use phased loading: base modules first, then sets BRAIN._testMode = true, then loads brain-worker-bridge.js (which skips initBridge and exposes _bridge), fly-logic.js, and tests.js
- [MODIFY] tests/tests.js -- Appended Section 5 with 19 new test functions guarded by `if (BRAIN._bridge)` check

## Verification Results
- Build: PASS (no build step -- vanilla JS, no bundler)
- Tests: PASS (`node tests/run-node.js` -- 66 passed / 0 failed / 66 total)
- Lint: SKIPPED (no lint configured)

## Claims
- [ ] collectStimulationSegments() reproduces exact same mapping logic as original sendStimulation() (same conditionals, same intensity calculations, same ordering) but returns named segments array instead of posting to worker
- [ ] sendStimulation() now delegates to collectStimulationSegments() for mapping, then translates named segments to indexed segments using closure state; guarded with `if (!worker) return`
- [ ] Virtual group bypass in workerUpdate() writes BRAIN.drives.{fear,curiosity,groom} * FIRE_STATE_SCALE to BRAIN.postSynaptic[groupName][nextState] for groups with 0 real neurons, inserted before synthesizeMotorOutputs()
- [ ] BRAIN._testMode guard: when truthy, IIFE exposes BRAIN._bridge namespace with synthesizeMotorOutputs, aggregateFireState, buildGroupIndices, collectStimulationSegments, workerUpdate, constants (FIRE_STATE_SCALE, MOTOR_SCALE, STIM_INTENSITY), and test helpers (_setGroupState, _setFireState, _getGroupIndices); when falsy, calls initBridge() as before
- [ ] 4 aggregateFireState tests: basic fire counting, pending spike accumulation, empty/virtual group handling, decay from previous activation
- [ ] 6 synthesizeMotorOutputs tests: walk tonic output range, flight intent with high fear, groom activation, early exit with zero input, DN_STARTLE write, feed intent
- [ ] 3 virtual group bypass tests: fear, curiosity, groom drives written to postSynaptic via workerUpdate()
- [ ] 5 sendStimulation mapping tests: touch->MECH_BRISTLE (single and double), foodNearby->OLF_ORN_FOOD, light->VIS_R1R6+VIS_R7R8, temperature thresholds->THERMO_WARM/COOL
- [ ] 1 nociception test: NOCI intensity is 5x STIM_INTENSITY and auto-clears
- [ ] 1 tonic background test: CX_FC/CX_EPG/CX_PFN always present with 0.03 intensity in dark
- [ ] 1 buildGroupIndices test: verifies neuron-to-group index mapping
- [ ] All 47 existing tests continue to pass unchanged
- [ ] No non-test-mode behavior changes: when BRAIN._testMode is falsy, the IIFE calls initBridge() exactly as before
- [ ] ES5 compatible: var declarations only, no let/const/arrow functions
- [ ] No new files created, no npm dependencies added

## Gaps and Assumptions
- Plan predicted 45 existing tests but actual count is 47; total is 66 (47+19) not 64 as predicted
- Virtual bypass tests depend on BRAIN.updateDrives() internal decay/accumulation logic; test assertions use tolerance of 0.5 to accommodate drive update calculations
- Math.random mock in tests is restored after each test but not wrapped in try/finally (matches existing test style per plan constraint)
- Non-test-mode (browser) path not verified in this run (would require DOM/Worker/fetch environment)
