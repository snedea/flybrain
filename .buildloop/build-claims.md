# Build Claims -- T5.1

## Files Changed
- MODIFY js/connectome.js -- Added windDirection field to BRAIN.stimulate; removed Math.max(0.3, ...) floor from wind MECH_JO stimulation so windStrength scales proportionally
- MODIFY js/main.js -- Added wind-direction tracking in input handlers, brace behavior state (duration/cooldown/entry/movement/animation), wind-sensing antenna bias, windDirection resets in visibility and wind timer handlers

## Verification Results
- Build: PASS (`node -c js/connectome.js && node -c js/main.js` -- syntax check passed)
- Tests: SKIPPED (no test suite exists)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: BRAIN.stimulate.windDirection field added at connectome.js:142, initialized to 0, type radians
- [ ] Claim 2: Wind MECH_JO stimulation at connectome.js:329 now uses raw windStrength (no 0.3 floor), so weak wind produces proportionally less fear accumulation
- [ ] Claim 3: windDirection is computed from drag vector in handleCanvasMousemove (main.js:371) using Math.atan2(-dy, dx) per negated-Y convention
- [ ] Claim 4: windDirection is computed in both short-drag (main.js:384, from click toward fly) and long-drag (main.js:387, from drag vector) branches of handleCanvasMouseup
- [ ] Claim 5: windDirection initialized to 0 in handleCanvasMousedown air tool branch (main.js:359)
- [ ] Claim 6: windDirection reset to 0 in visibilitychange resume handler (main.js:260) and wind reset timer (main.js:1523)
- [ ] Claim 7: brace added to BEHAVIOR_MIN_DURATION (500ms, main.js:58) and BEHAVIOR_COOLDOWN (1000ms, main.js:67)
- [ ] Claim 8: brace entry condition in evaluateBehaviorEntry (main.js:484-487) checks all four required conditions: wind active AND windStrength < 0.5 AND accumStartle < startle threshold AND not cooling down
- [ ] Claim 9: brace inserted between groom and rest in evaluateBehaviorEntry priority order
- [ ] Claim 10: computeMovementForBehavior brace branch (main.js:649-657) sets targetSpeed=0, orients toward wind source (windDirection + PI), uses normalizeAngle for angle difference and final targetDir
- [ ] Claim 11: brace added to applyBehaviorMovement speed-damping block (main.js:692) as non-moving behavior
- [ ] Claim 12: brace is not in BRAIN._isMoving list in syncBrainFlags, so it is correctly treated as non-moving
- [ ] Claim 13: drawLegs brace animation (main.js:1304-1307) widens leg stance (hipMod *= 1.1) and suppresses jitter (amplitude * 0.1)
- [ ] Claim 14: drawAntennae wind-sensing bias (main.js:1183-1194) activates during wind or brace state, converts windDirection to body-local frame, blends antenna baseAngle toward wind with 0.3 strength

## Gaps and Assumptions
- No automated tests exist; verification is syntax-check only. Visual/behavioral correctness requires browser smoke testing per the plan's verification section.
- The brace behavior is not added to the `behavior.groomLocation` snapshot logic since it does not use groom locations (correct per plan).
- The antenna wind-sensing uses the body-local coordinate transform described in the plan; if the actual canvas transform differs from `ctx.rotate(-facingDir + Math.PI / 2)`, the antenna bias direction could be off.
