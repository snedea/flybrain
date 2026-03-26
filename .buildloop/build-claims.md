# Build Claims -- D8.2

## Files Changed
- [MODIFY] js/connectome.js:469 -- Gate MN_HEAD contribution to accumGroom on abdomen > 0, preventing locomotion-only head signal from triggering false groom state

## Verification Results
- Build: PASS (vanilla JS, no build step -- verified file loads without syntax errors by reading surrounding context)
- Tests: SKIPPED (no automated tests exist for this project)
- Lint: SKIPPED (no linter configured for this project)

## Claims
- [ ] Line 469 of connectome.js changed from `abdomen + head + Math.min(legL1, legR1)` to `abdomen + (abdomen > 0 ? head : 0) + Math.min(legL1, legR1)`
- [ ] During locomotion without groom stimulus: abdomen = 0, so head is gated off. accumGroom = 0 + 0 + min(legL1, legR1) = 4-7, which stays below BEHAVIOR_THRESHOLDS.groom (8). Walk continues uninterrupted.
- [ ] During actual grooming (SEZ_GROOM fires): abdomen > 0 (weight 5 from SEZ_GROOM), so head is included. accumGroom = 5 + 4 + min(10, 10) = 19, well above 8. Groom triggers correctly.
- [ ] `readMotor('MN_HEAD')` call at line 467 is preserved -- head signal is still drained every tick to prevent buildup
- [ ] `BRAIN.accumHead = head` assignment at line 468 is preserved -- accumHead is used independently for head orientation bias at main.js:588-589
- [ ] No changes to js/main.js -- BEHAVIOR_THRESHOLDS.groom remains 8 at line 73
- [ ] No changes to js/constants.js -- connection weights unchanged
- [ ] No other accumulator formulas in connectome.js were modified
- [ ] The groom behavior check at main.js:464 (`BRAIN.accumGroom > BEHAVIOR_THRESHOLDS.groom`) uses strict greater-than, so accumGroom must exceed 8 (not equal) to trigger groom

## Gaps and Assumptions
- No automated tests exist; verification requires manual browser smoke test (open index.html, observe fly walking without spontaneous grooming, then touch fly to confirm groom still triggers)
- Assumes SEZ_GROOM always sends signal to MN_ABDOMEN when it sends to MN_HEAD -- if a pathway exists that activates MN_HEAD for grooming without also activating MN_ABDOMEN, that groom trigger would be suppressed by this fix. Based on constants.js weights (SEZ_GROOM -> MN_ABDOMEN weight 5, SEZ_GROOM -> MN_HEAD weight 4), this assumption holds.
- Edge case: if abdomen has residual signal (e.g., 0.5) from a previous tick's decay while head has locomotion signal, head would be included. This is mitigated by the Math.max(0, ...) floor at line 482 and the integer-like signal values in the connectome, but fractional residuals are theoretically possible.
