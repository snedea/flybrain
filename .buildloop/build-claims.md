# Build Claims -- D13.1

## Files Changed
- [MODIFY] js/main.js -- (1) clamp food and fly positions to current bounds in resize handler, (2) clear behavior.cooldowns on visibilitychange resume, (3) remove dead targetPair variable in drawLegs

## Verification Results
- Build: PASS (node --check js/main.js)
- Tests: SKIPPED (no test suite)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: The resize handler at js/main.js:1526-1534 now clamps all food[i].x to [0, innerWidth] and food[i].y to [44, innerHeight-90] on every resize event, preventing food from becoming unreachable after window shrinks
- [ ] Claim 2: The resize handler also re-clamps fly.x and fly.y to the same bounds, preventing a spurious wall-touch stimulus on the next update() frame
- [ ] Claim 3: The visibilitychange resume branch at js/main.js:292 now sets behavior.cooldowns = {} immediately after behavior.enterTime reset, clearing stale cooldowns that would block re-entering behaviors after tab resume
- [ ] Claim 4: The dead variable `var targetPair = pairIdx;` has been removed from the drawLegs groomLoc==='leg' branch; grep for "targetPair" in js/main.js returns zero matches
- [ ] Claim 5: Food clamping bounds [0, innerWidth] x [44, innerHeight-90] exactly match the fly's position-clamp bounds used in update() at lines 1404-1421
- [ ] Claim 6: No other files were modified; no new files were created (except this claims file)
- [ ] Claim 7: The food proximity threshold (50px), feeding contact distance (20px), and food/behavior object structures are unchanged

## Gaps and Assumptions
- No automated tests exist to verify these behaviors; verification is manual (browser smoke test)
- The fly position clamp in the resize handler assumes the `fly` object is already initialized when resize fires; this is safe because `fly` is declared at module scope before the resize IIFE runs
- The food clamp assumes food array may be empty (the for loop handles this correctly with length check)
- Clearing cooldowns on resume means a rapid hide/show cycle could let behaviors fire sooner than their normal cooldown; this is acceptable since all stimuli/drives are also reset
