# Build Claims -- D7.1

## Files Changed
- [MODIFY] js/main.js -- Store brain tick interval ID, add visibilitychange handler to pause/resume brain tick and clear stale stimuli on tab hide/show

## Verification Results
- Build: PASS (no build step -- vanilla JS, open index.html directly)
- Tests: SKIPPED (no existing tests)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: `setInterval(updateBrain, 500)` at line 226 now assigns its return value to `var brainTickId` instead of discarding it
- [ ] Claim 2: A `visibilitychange` event listener is registered on `document` at lines 238-280
- [ ] Claim 3: When `document.hidden` becomes true, the handler calls `clearInterval(brainTickId)` and sets `brainTickId = null`, fully stopping the brain tick
- [ ] Claim 4: On hide, all 5 drive values (hunger, fear, fatigue, curiosity, groom) are snapshot into `driveSnapshotOnHide`
- [ ] Claim 5: When the tab becomes visible again, all 6 stale stimuli flags are cleared: `touch=false`, `touchLocation=null`, `wind=false`, `windStrength=0`, `foodNearby=false`, `foodContact=false`
- [ ] Claim 6: On resume, `touchResetTime` and `windResetTime` are reset to 0, preventing stale timer-based stimulus re-activation
- [ ] Claim 7: On resume, drives are restored from the snapshot taken at hide time, undoing any drift from throttled ticks that fired before clearInterval took effect
- [ ] Claim 8: On resume, `lastTime` is set to -1, causing the RAF loop to skip the first frame and reinitialize timing (matching the existing startup pattern at line 1467)
- [ ] Claim 9: On resume, `brainTickId = setInterval(updateBrain, 500)` restarts the brain tick at the original 500ms interval
- [ ] Claim 10: No changes were made to `updateBrain()`, `update()`, `draw()`, the RAF `loop()` function, or `js/connectome.js`
- [ ] Claim 11: No new files or dependencies were added
- [ ] Claim 12: The fix is entirely additive -- one line modified (store interval ID) and one new block inserted (visibilitychange handler + driveSnapshotOnHide variable)

## Gaps and Assumptions
- The `visibilitychange` event fires synchronously when the tab is hidden, but there is a small race window where one or two throttled setInterval callbacks could fire between the OS-level tab switch and the event delivery. The drive snapshot restore on resume handles this by overwriting any drift.
- If the browser does not support the `visibilitychange` API (very old browsers), the handler simply never fires and behavior is unchanged from before the fix (graceful degradation).
- `lastTime` is declared at line 1519 (after the edit offset) with `var` at top level, so it is in global scope and accessible from the visibilitychange handler. This was verified by reading the code.
- Manual smoke testing was not performed (headless environment). The claims above are based on code inspection.
