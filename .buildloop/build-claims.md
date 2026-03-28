# Build Claims -- D68.2

## Files Changed
- [MODIFY] js/fly-logic.js -- Appended 4 pure extracted functions (computeFoodSeekDir, computeFoodProgress, pauseFeeding) and 1 constant (FEED_APPROACH_SPEED) after evaluateBehaviorEntry
- [MODIFY] tests/tests.js -- Added 18 new test functions in Section 4b before the bridge tests guard (line 594)

## Verification Results
- Build: PASS (n/a -- vanilla JS, no build step)
- Tests: PASS (`node tests/run-node.js` -- 87 passed / 0 failed / 87 total, up from 69)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] js/fly-logic.js: `computeFoodSeekDir(flyX, flyY, foodX, foodY, hunger, facingDirVal)` mirrors main.js lines 859-862 food-seeking steering logic, using facingDir as the base angle
- [ ] js/fly-logic.js: `computeFoodProgress(foodItem, now)` mirrors main.js lines 1760-1761, returning progress clamped to [0,1]
- [ ] js/fly-logic.js: `pauseFeeding(foodItem, now)` mirrors main.js lines 1773-1776, accumulating eaten and resetting feedStart to 0
- [ ] js/fly-logic.js: `FEED_APPROACH_SPEED = 0.25` constant matches the literal used at main.js:903
- [ ] test_food_seek_uses_facingDir_not_targetDir: verifies steering angle computation uses facingDir as base (different facingDir values produce different targetDir)
- [ ] test_food_seek_strength_scales_with_hunger: verifies seekStrength = min(1, hunger) at hunger values 0.3, 0.9, and 1.5 (clamped)
- [ ] test_feed_approach_speed_constant: asserts FEED_APPROACH_SPEED === 0.25
- [ ] test_feed_entry_hunger_bypass_at_50px: verifies evaluateBehaviorEntry returns 'feed' when hunger > 0.7 and food within 50px, even with accumFeed = 0
- [ ] test_feed_entry_hunger_bypass_requires_high_hunger: verifies bypass does NOT trigger at hunger 0.65
- [ ] test_feed_entry_neural_pathway_requires_20px: verifies accumFeed > 8 pathway is blocked when food > 50px (hasNearbyFood returns false)
- [ ] test_feed_entry_neural_pathway_within_50px: verifies accumFeed > 8 pathway enters feed when food within 50px
- [ ] test_food_progress_accumulates: verifies computeFoodProgress returns correct value with and without prior eaten progress
- [ ] test_food_progress_clamped_at_one: verifies progress is clamped to 1.0 when elapsed exceeds remaining
- [ ] test_food_pause_preserves_eaten_progress: verifies pauseFeeding accumulates eaten and resets feedStart
- [ ] test_food_pause_noop_when_not_feeding: verifies pauseFeeding is no-op when feedStart is 0
- [ ] test_food_removal_at_full_progress: verifies food array splice at progress >= 1 (integration-style)
- [ ] test_simworker_stats_accumulation_and_averaging: verifies cumulativeFiredCount accumulates, averages (Math.round), and resets to 0
- [ ] test_simworker_stats_varying_fire_counts: verifies averaging works correctly with varying fire counts across ticks
- [ ] test_simworker_reset_clears_cumulative: verifies reset zeroes all three stats variables and post-reset accumulation starts fresh
- [ ] test_dn_startle_reads_nextState: verifies BRAIN.motorcontrol() sets accumStartle from postSynaptic['DN_STARTLE'][nextState], not thisState
- [ ] test_dn_startle_zero_when_no_signal: verifies accumStartle is 0 when DN_STARTLE has no activation
- [ ] test_dn_startle_negative_floored: verifies accumStartle is floored at 0 for negative DN_STARTLE values

## Gaps and Assumptions
- The extracted functions in fly-logic.js are independent copies of the logic from main.js; they are NOT called by main.js (main.js retains its inline versions). If main.js logic diverges, these tests will not catch the drift.
- sim-worker stats tests replicate the accumulation arithmetic inline (no actual worker loading) -- they verify the math is correct but not that sim-worker.js uses this exact code path.
- Feed entry tests use evaluateBehaviorEntry() which depends on Date.now() for cooldown checks; tests work because cooldowns are empty after resetBrainState().
- The plan noted 20px contact range vs 50px hasNearbyFood range; all feed entry tests test the 50px hasNearbyFood gate since that's what evaluateBehaviorEntry checks. The 20px contact range is checked within main.js's feed state loop, not in evaluateBehaviorEntry.
