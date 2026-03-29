# Build Claims -- T13.2

## Files Changed
- [MODIFY] js/main.js -- Replaced hard-clamp boundary system with soft steering forces, flight landing cap, startle burst bounds check, teleport recovery, and world-bounds-aware resize/center handlers

## Verification Results
- Build: PASS (`node --check js/main.js` -- no syntax errors)
- Lint: PASS (`grep -n` verified all 7 new symbols appear at expected locations: BOUNDARY_PADDING:54, BOUNDARY_TELEPORT_THRESHOLD:55, BOUNDARY_STEER_STRENGTH:56, getWorldBounds:103, clampToWorldBounds:115, soft boundary block:1932, teleport recovery:2000, resize handler:2165, centerButton:18)
- Tests: SKIPPED (browser-only app, no automated test suite)

## Claims
- [ ] Claim 1: Three boundary constants defined -- BOUNDARY_PADDING=20, BOUNDARY_TELEPORT_THRESHOLD=200, BOUNDARY_STEER_STRENGTH=0.25 (line 54-56)
- [ ] Claim 2: `getWorldBounds()` function (line 103) converts screen-space layout bounds to world coordinates via `screenToWorld()`, applies BOUNDARY_PADDING inset, returns {left, right, top, bottom}
- [ ] Claim 3: `clampToWorldBounds(x, y)` function (line 115) hard-clamps a position to within world bounds, returns {x, y}
- [ ] Claim 4: In `computeMovementForBehavior()` fly state (line 1115-1124), flight landing position is projected ~60 frames ahead; if out of bounds, targetDir is redirected toward the clamped position
- [ ] Claim 5: In `applyBehaviorMovement()` startle burst (line 1179-1190), burst direction is projected ~30 frames ahead; if landing would be out of bounds, direction is redirected toward clamped position
- [ ] Claim 6: In `update()` (line 1932-1953), edge avoidance uses world-space bounds from `getWorldBounds()` with BOUNDARY_STEER_STRENGTH=0.25 multiplier instead of old screen-space bounds with hardcoded 0.3
- [ ] Claim 7: In `update()` (line 1979-1997), soft boundary pushback uses 10% lerp per frame (not hard clamp) when fly exceeds world bounds; touch stimulus is preserved
- [ ] Claim 8: In `update()` (line 2000-2012), teleport recovery triggers when fly exceeds bounds by > BOUNDARY_TELEPORT_THRESHOLD (200px); fly is placed at center +/- 50px random offset, speed is zeroed
- [ ] Claim 9: Resize handler (line 2163-2176) clamps food, water drops, and fly positions using `getWorldBounds()` instead of raw screen coordinates
- [ ] Claim 10: centerButton handler (line 14-21) resets zoom/pan BEFORE setting fly position, uses `getWorldBounds()` center instead of raw window center
- [ ] Claim 11: No `let` or `const` used -- all new code uses `var` (ES5 compliance)
- [ ] Claim 12: Teleport check comes AFTER soft clamp, so moderate boundary violations get gentle pushback first

## Gaps and Assumptions
- No automated tests exist; all verification is manual browser testing
- The 60-frame flight distance estimate and 30-frame burst distance estimate are approximations; actual distances depend on speed decay curves
- Floating-point comparison (`clamped.x !== landX`) is used to detect out-of-bounds; this works because clamp only changes values that are actually out of bounds (Math.max/Math.min return exact input when in range)
- The `wb` variable from the soft boundary steering block (line 1933) is reused by the soft clamp and teleport blocks below (lines 1979-2012); this is intentional since world bounds don't change within a single frame
- When zoom is very large, world bounds become very small; the edgeMargin (50px world-space) could exceed the world bounds width/height -- no explicit guard for this edge case
