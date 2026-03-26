# Build Claims -- D2.1

## Files Changed
- [MODIFY] js/main.js -- Added dtScale multiplier to position update lines and speed floor after speedChangeInterval application

## Verification Results
- Build: PASS (no build step; vanilla JS loaded via index.html)
- Tests: SKIPPED (no test suite configured)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: Position update at js/main.js:1307-1308 now multiplies by dtScale (`fly.x += Math.cos(facingDir) * speed * dtScale` and `fly.y -= Math.sin(facingDir) * speed * dtScale`), making displacement frame-rate-independent
- [ ] Claim 2: Speed floor at js/main.js:1253 (`if (speed < 0) speed = 0;`) is placed immediately after `speed += speedChangeInterval * dtScale;` (line 1252) and before `var facingMinusTarget` (line 1255), preventing negative speed from stale speedChangeInterval
- [ ] Claim 3: No other lines in js/main.js were modified; the diff is exactly 3 changed lines (2 modified + 1 inserted)
- [ ] Claim 4: applyBehaviorMovement() was not modified
- [ ] Claim 5: speedChangeInterval computation in updateBrainTick() and behavior state blocks were not modified
- [ ] Claim 6: No new variables or functions were added

## Gaps and Assumptions
- Cannot verify frame-rate independence empirically without running on displays of different refresh rates; verified by code inspection that dtScale is applied to both speed changes and displacement
- The speed floor at 0 assumes the fly should never move backward; this matches the plan's rationale about negative speed causing backward jitter
- Edge avoidance, angle wrapping, and screen bounds code were not touched (verified by reading surrounding lines)
