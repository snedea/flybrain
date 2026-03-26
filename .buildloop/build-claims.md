# Build Claims -- D7.2

## Files Changed
- [MODIFY] js/main.js -- Replaced fixed-step facingDir turning (lines 1339-1354) with exponential interpolation to eliminate overshoot oscillation

## Verification Results
- Build: PASS (vanilla JS project, no build step; `node -c js/main.js` passes syntax check)
- Tests: SKIPPED (no test suite exists)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] The 16-line fixed-step facingDir interpolation block (old lines 1339-1354) has been fully removed -- no references to `facingMinusTarget` remain in the file
- [ ] Replacement uses `normalizeAngle(targetDir - facingDir)` to compute shortest-arc signed angle difference, leveraging the existing `normalizeAngle()` helper at lines 31-36
- [ ] Replacement uses exponential interpolation `facingDir += angleDiffTurn * (1 - Math.pow(0.9, dtScale))` with retention factor 0.9, matching the pattern used by proboscisExtend and other animation parameters
- [ ] The blend factor `(1 - Math.pow(0.9, dtScale))` is always in (0, 1), so facingDir moves toward targetDir by a fraction of the remaining gap and mathematically cannot overshoot
- [ ] The downstream `facingDir = normalizeAngle(facingDir)` at line 1377 remains intact as a safety normalization
- [ ] No new global variables or functions were introduced -- the fix is purely local (one new local variable `angleDiffTurn`)
- [ ] No other animation interpolations (wingSpread, proboscis, antenna, legs, wings) were modified
- [ ] The file passes `node -c js/main.js` syntax validation
- [ ] The replacement is frame-rate-independent via dtScale exponent, consistent with the D5.1 fix pattern

## Gaps and Assumptions
- Visual smoke testing (idle jitter, feed drift, startle turns) requires manual browser observation -- not automated
- The 0.9 retention factor was specified in the plan; if turning feels too slow at runtime it could be lowered (e.g. 0.85) but this matches proboscisExtend and the task description's suggestion
- Edge avoidance code immediately below the edit (line 1346+) modifies targetDir, not facingDir, so it is unaffected by this change
