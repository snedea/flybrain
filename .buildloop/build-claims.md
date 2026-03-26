# Build Claims -- D1.1

## Files Changed
- [MODIFY] js/main.js -- Fix 4 movement timing/angle bugs: first-frame speed burst, unbounded angle growth, frame-rate-dependent edge avoidance, frame-rate-dependent deceleration

## Verification Results
- Build: PASS (no build step -- vanilla JS, open index.html in browser)
- Tests: SKIPPED (no existing tests)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Bug 1 (first-frame burst): `lastTime` initialized to `-1` (line 1404). First RAF callback sets `lastTime = timestamp`, calls only `draw()`, and returns early -- `update()` is never called with a stale dt on the first frame.
- [ ] Bug 2 (unbounded angles): `normalizeAngle(a)` helper added at line 28-34. Both `facingDir` and `targetDir` are normalized to `[-PI, PI]` every frame at lines 1279-1280, after all modifications (edge avoidance, facing interpolation) but before position update.
- [ ] Bug 3 (frame-rate-dependent edge avoidance): Edge avoidance bias at line 1275 now multiplied by `dtScale`, making it frame-rate-independent.
- [ ] Bug 4 (frame-rate-dependent deceleration): `applyBehaviorMovement` now takes `dtScale` parameter (line 538). Deceleration at line 557 changed from `speed *= 0.92` to `speed *= Math.pow(0.92, dtScale)`. The `dtScale` computation (line 1225) was moved before the `applyBehaviorMovement(dtScale)` call (line 1226) to ensure it is available.
- [ ] No other files were modified. No features added or removed.
- [ ] `normalizeAngle` uses modulo + bounds check, not a while-loop, so it handles any magnitude in O(1).
- [ ] Existing comments preserved. Only new comments added where specified by plan.

## Gaps and Assumptions
- Smoke testing (page load, edge avoidance, deceleration smoothness) requires manual browser verification -- not automatable in this project.
- The `normalizeAngle` function handles the edge case where modulo returns exactly PI or -PI correctly (the `>` and `<` checks exclude the boundary, keeping values in `[-PI, PI]`).
- The `facingDir` interpolation at lines 1242-1244 (`+= 0.1 * dtScale`) was already dt-scaled before this change and was not modified.
- Position update (`fly.x += cos * speed`, `fly.y -= sin * speed`) is NOT dt-scaled per the plan constraints -- this is a pre-existing behavior outside D1.1 scope.
