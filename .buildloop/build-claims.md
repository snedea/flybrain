# Build Claims -- D16.1

## Files Changed
- [CREATE] js/fly-logic.js -- Shared pure functions (normalizeAngle, BEHAVIOR_THRESHOLDS, isCoolingDown, hasNearbyFood, evaluateBehaviorEntry) extracted from main.js for use by both main.js and tests.js
- [CREATE] tests/run-node.js -- Node.js test runner entry point that loads scripts via vm.runInThisContext and calls runAllTests()
- [MODIFY] js/connectome.js -- Fixed misleading windDirection comment at line 142: changed "direction wind is blowing FROM" to "wind travel direction (drag vector; 0=right, PI/2=up). Wind SOURCE = windDirection + PI."
- [MODIFY] js/main.js -- Removed 5 functions/constants now in fly-logic.js: normalizeAngle, BEHAVIOR_THRESHOLDS, hasNearbyFood, isCoolingDown, evaluateBehaviorEntry
- [MODIFY] index.html -- Added fly-logic.js script tag between connectome.js and main.js
- [MODIFY] tests/run.html -- Added fly-logic.js script tag between connectome.js and tests.js
- [MODIFY] tests/tests.js -- Removed copied function snapshots (Section 2), replaced with mutable test state vars; added 13 new tests for T5.1-T5.3; replaced runAllTests with Node/CLI-compatible version using globalThis fallback, console.log output, and process.exitCode=1 on failure

## Verification Results
- Build: PASS (no build step -- vanilla JS project)
- Tests: PASS (`node tests/run-node.js` -- 45 passed / 0 failed / 45 total, exit code 0)
- Lint: SKIPPED (no linter configured)
- Failure detection: PASS (injected deliberate failure: output showed "FAIL test_deliberate_fail: intentional", exit code 1)

## Claims
- [ ] Claim 1: js/fly-logic.js contains normalizeAngle, BEHAVIOR_THRESHOLDS, isCoolingDown, hasNearbyFood, and evaluateBehaviorEntry -- identical logic to what was previously in main.js and tests.js
- [ ] Claim 2: main.js no longer defines normalizeAngle, BEHAVIOR_THRESHOLDS, hasNearbyFood, isCoolingDown, or evaluateBehaviorEntry -- these are now loaded from fly-logic.js via script tag in index.html
- [ ] Claim 3: tests/tests.js no longer contains copied snapshots of those 5 functions/constants -- it relies on fly-logic.js loaded via script tag in run.html
- [ ] Claim 4: index.html loads fly-logic.js between connectome.js and main.js
- [ ] Claim 5: tests/run.html loads fly-logic.js between connectome.js and tests.js
- [ ] Claim 6: runAllTests() uses globalThis/window/global fallback chain to discover test_ functions, works in both browser and Node.js
- [ ] Claim 7: runAllTests() logs pass/fail/total counts and each failure message to console
- [ ] Claim 8: runAllTests() sets process.exitCode = 1 when failures > 0 (guarded by typeof process check)
- [ ] Claim 9: runAllTests() DOM output is guarded by typeof document check, preserving browser path
- [ ] Claim 10: tests/run-node.js loads constants.js, connectome.js, fly-logic.js, tests.js via vm.runInThisContext and calls runAllTests()
- [ ] Claim 11: 13 new test functions added covering: dark fatigue gain doubling (test_dark_fatigue_gain_doubled, test_bright_fatigue_gain_normal), dark curiosity range reduction (test_dark_curiosity_range_reduced, test_bright_curiosity_range_normal), tonic injection halving in dark (test_tonic_injection_halved_in_dark), temperature warm pathway (test_temperature_warm_activates_pathway), temperature cool pathway (test_temperature_cool_activates_pathway), neutral temperature no-fire (test_temperature_neutral_no_thermo), nociception auto-clear (test_nociception_auto_clears), nociception startle activation (test_nociception_activates_startle_pathway), brace blocked by strong wind (test_brace_blocked_by_strong_wind), brace blocked by no wind (test_brace_blocked_by_no_wind), brace blocked by high startle (test_brace_blocked_by_high_startle)
- [ ] Claim 12: connectome.js windDirection comment fixed from "direction wind is blowing FROM" to "wind travel direction (drag vector)" with note that wind SOURCE = windDirection + PI
- [ ] Claim 13: All 45 tests pass with exit code 0; injected failure produces exit code 1 with FAIL message in console output

## Gaps and Assumptions
- Browser path (tests/run.html rendering) not tested in this environment (no browser available); DOM output logic is unchanged except for typeof guard wrapping
- nearestFood() remains in main.js as specified (not shared)
- BEHAVIOR_MIN_DURATION and BEHAVIOR_COOLDOWN remain in main.js as specified (not shared)
- The evaluateBehaviorEntry function in fly-logic.js includes the brace and dark rest threshold logic that was added in T5.1-T5.2, matching the current main.js implementation exactly
