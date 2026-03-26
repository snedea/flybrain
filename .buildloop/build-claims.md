# Build Claims -- T5.4

## Files Changed
- [CREATE] tests/run.html -- HTML test runner page that loads constants.js, connectome.js, and tests.js; displays pass/fail results with styled summary
- [CREATE] tests/tests.js -- Test suite with 32 test functions covering connectome propagation, drive system, angle math, and behavior thresholds; includes assertion helpers, copied pure functions from main.js, and auto-discovery test runner

## Verification Results
- Build: PASS (no build step required -- vanilla JS)
- Tests: PASS (node -e "..." ran all 32 tests: 32 passed / 0 failed / 32 total)
- Lint: SKIPPED (no lint configured)

## Claims
- [ ] tests/run.html is valid HTML5, starts with <!DOCTYPE html>, loads ../js/constants.js, ../js/connectome.js, and ./tests.js in order, and calls runAllTests() on window.onload
- [ ] tests/run.html uses only the specified CSS custom properties (--bg, --surface, --border, --text, --success, --error, --radius, etc.) with no additional hex colors or gradients
- [ ] tests/tests.js defines assertEqual, assertTrue, and assertClose assertion helpers that throw TestFailure on failure
- [ ] tests/tests.js copies normalizeAngle, BEHAVIOR_THRESHOLDS, isCoolingDown, hasNearbyFood, evaluateBehaviorEntry verbatim from main.js (cannot import main.js due to top-level DOM access)
- [ ] tests/tests.js defines resetBrainState() that calls BRAIN.setup() and resets all accumulators, stimulate, drives, behavior, food, and fly to clean defaults
- [ ] Every test function name starts with test_ and calls resetBrainState() first (except angle tests which are pure)
- [ ] Connectome tests (7 tests): test_setup_initializes_all_neurons, test_dendriteAccumulate_propagates_to_targets, test_dendriteAccumulate_is_additive, test_dendriteAccumulateScaled_applies_scale, test_fireNeuron_cascades_and_resets, test_readMotor_drains_to_zero, test_motor_accumulator_floors_at_zero
- [ ] Drive tests (8 tests): test_hunger_increases_per_tick, test_hunger_decreases_when_feeding, test_fear_spikes_on_touch, test_fear_exponential_decay, test_drives_clamped_to_zero, test_drives_clamped_to_one, test_fear_wind_contribution, test_fear_no_wind_contribution_below_threshold
- [ ] Angle tests (6 tests): test_normalizeAngle_zero, test_normalizeAngle_pi, test_normalizeAngle_neg_pi, test_normalizeAngle_3pi, test_normalizeAngle_neg5pi, test_normalizeAngle_large_positive
- [ ] Behavior tests (11 tests): test_startle_entry, test_startle_blocked_by_cooldown, test_fly_entry, test_feed_entry, test_feed_blocked_without_food, test_groom_entry, test_rest_entry_high_fatigue, test_rest_lower_threshold_in_dark, test_brace_entry, test_idle_when_nothing_active, test_priority_startle_over_feed
- [ ] runAllTests() discovers all test_ functions on window, sorts alphabetically, runs each, and renders results to #summary and #results divs
- [ ] No existing files were modified (js/main.js, js/connectome.js, js/constants.js, index.html, css/main.css are untouched)
- [ ] No external dependencies or npm packages added; no build step required

## Gaps and Assumptions
- The copied functions (normalizeAngle, evaluateBehaviorEntry, etc.) are exact copies from main.js at the time of writing; if main.js changes, these copies will not auto-update
- Browser-based test execution was not verified (only Node.js with a minimal DOM shim); the HTML runner should work identically in any modern browser
- The plan specified 24+ test functions; implementation provides 32 (all categories covered with the exact tests specified in the plan)
