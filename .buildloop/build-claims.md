# Build Claims -- D4.2

## Files Changed
- [MODIFY] js/connectome.js -- Wired MN_HEAD into new accumHead accumulator and into accumGroom formula; removed dead _isMoving/_isFeeding/_isGrooming flag assignments from BRAIN.update()
- [MODIFY] js/main.js -- Added head-turn orientation bias in walk/explore states using accumHead; removed duplicate JSDoc blocks for drawProboscis and drawLegs

## Verification Results
- Build: PASS (vanilla JS, no build step)
- Tests: SKIPPED (no test suite)
- Lint: PASS (grep verification of all changes below)

## Claims
- [ ] BRAIN.accumHead is declared and initialized to 0 at connectome.js:90 (alongside other accumulators)
- [ ] BRAIN.accumHead is reset to 0 at start of motorcontrol() at connectome.js:433
- [ ] BRAIN.accumHead is assigned from readMotor('MN_HEAD') at connectome.js:468, so MN_HEAD signal is no longer silently discarded
- [ ] BRAIN.accumHead is floored at 0 via Math.max at connectome.js:484
- [ ] accumGroom formula at connectome.js:469 now includes head: `abdomen + head + Math.min(legL1, legR1)` (was `abdomen + Math.min(legL1, legR1)`)
- [ ] Dead flag assignments (_isMoving, _isFeeding, _isGrooming) removed from end of BRAIN.update() (were at old lines 376-380); the function now ends with `BRAIN.runconnectome();` followed by closing `};`
- [ ] Flag declarations at connectome.js:160-162 are preserved (BRAIN._isMoving = false, etc.)
- [ ] syncBrainFlags() in main.js:471-477 remains the authoritative source for these flags (unchanged)
- [ ] Head-turn bias block added in computeMovementForBehavior() at main.js:514-518, inside the walk/explore branch, after food-seeking and before phototaxis
- [ ] Head-turn bias threshold is 3 (accumHead > 3), max bias is 0.15 radians (~8.6 degrees), direction follows walk asymmetry sign
- [ ] Duplicate JSDoc for drawProboscis removed -- only the version with @param {number} extend remains at main.js:1093-1096
- [ ] Duplicate JSDoc for drawLegs removed -- only the "behavior-specific animation" version remains at main.js:1115-1121
- [ ] No changes to js/constants.js, index.html, css/main.css, SPEC.md, CLAUDE.md, or TASKS.md
- [ ] readMotor() helper function and motor neuron drain behavior unchanged

## Gaps and Assumptions
- The plan stated `grep -n 'accumHead' js/connectome.js` should show 5 lines, but only 4 distinct occurrences exist (declaration, reset, assignment, floor). This appears to be a plan counting error, not a missing implementation step.
- Head-turn bias direction uses walk asymmetry (accumWalkLeft - accumWalkRight) as a proxy for turn direction. If both are equal, headSign defaults to -1. This is a heuristic, not a direct CX_FC direction signal.
- The head contribution to accumGroom changes the groom detection sensitivity -- groom state may trigger slightly more readily when MN_HEAD has signal. This is intentional per the plan but could subtly change grooming frequency.
- No automated tests exist; verification is visual (browser smoke test).
