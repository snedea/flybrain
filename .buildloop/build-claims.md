# Build Claims -- D1.2

## Files Changed
- [MODIFY] js/main.js -- Fix feed state food-contact gap and conflicting touch stimulus timers

## Verification Results
- Build: PASS (`node --check js/main.js` -- no syntax errors)
- Tests: SKIPPED (no test suite exists)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: In `computeMovementForBehavior()`, feed state no longer sets `targetSpeed = 0` unconditionally. When `nearestFood()` returns a food item with `dist > 20`, the fly drifts toward it at `targetSpeed = 0.15` with `targetDir` aimed at the food. When food is within 20px or absent, `targetSpeed = 0` (original behavior). See lines 520-531.
- [ ] Claim 2: In `applyBehaviorMovement()`, feed state is handled in its own `if` block (line 571) separate from groom/rest/idle. When food exists and is > 20px away, speed is only clamped if > 0.2 (allows the slow drift). When food is within 20px or absent, the original deceleration-to-zero logic applies. See lines 571-584.
- [ ] Claim 3: The `groom` and `rest` states retain the original `targetSpeed = 0` and deceleration behavior unchanged (lines 532-534 and 563-570).
- [ ] Claim 4: `wallTouchResetFrame` has been renamed to `touchResetFrame` globally (declaration at line 26, all 6 usage sites). Zero remaining references to `wallTouchResetFrame`.
- [ ] Claim 5: The `setTimeout(2000ms)` in `applyTouchTool()` that cleared `BRAIN.stimulate.touch` and `touchLocation` has been replaced with `touchResetFrame = Math.max(touchResetFrame, frameCount + 120)` (line 331). No remaining `setTimeout` calls related to touch stimulus.
- [ ] Claim 6: All 4 wall collision sites now use `touchResetFrame = Math.max(touchResetFrame, frameCount + 120)` instead of direct assignment (lines 1313, 1317, 1322, 1326). The `Math.max` ensures whichever stimulus (user touch or wall collision) expires later wins.
- [ ] Claim 7: The unified reset check at line 1369 now also clears `BRAIN.stimulate.touchLocation = null` in addition to `BRAIN.stimulate.touch = false`, ensuring user-initiated touch locations are properly cleaned up.
- [ ] Claim 8: The `hasNearbyFood()` threshold (50px) and gradual feeding contact distance (20px) are unchanged.
- [ ] Claim 9: No files other than `js/main.js` were modified. No new dependencies or HTML/CSS changes.

## Gaps and Assumptions
- The `nearestFood()` function is called twice per frame in feed state (once in `computeMovementForBehavior`, once in `applyBehaviorMovement`). This is a minor performance consideration but food arrays are typically small so it should be negligible.
- The drift speed of 0.15 and clamp of 0.2 were taken from the plan without empirical tuning. If the fly moves too slowly or too quickly toward food, these constants may need adjustment.
- The `Math.atan2(-(nf.item.y - fly.y), nf.item.x - fly.x)` angle convention (negated y) matches the existing food-seeking code at line 486 but was not independently verified against all movement code paths.
- Manual smoke testing (feed drift, feed stop, touch timer overlap, wall collision) was not performed -- only syntax validation via `node --check`.
