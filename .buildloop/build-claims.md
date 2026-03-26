# Build Claims -- D4.1

## Files Changed
- [MODIFY] js/main.js -- Fix wind stimulus setTimeout race condition, conditional wind=true on mouseup, and dt-scale three idle animation interpolations

## Verification Results
- Build: PASS (no build step -- vanilla JS, open index.html in browser)
- Tests: SKIPPED (no test suite configured)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: `windResetFrame` variable added at line 27, replaces `setTimeout` for wind stimulus expiry with a frame-counted timer (120 frames ~2s at 60fps), matching the `touchResetFrame` pattern
- [ ] Claim 2: `dragToolOrigin` variable added at line 28, set to `'air'` in handleCanvasMousedown air branch (line 274), reset to `null` in handleCanvasMouseup (line 310)
- [ ] Claim 3: New air drag start cancels any pending wind reset by setting `windResetFrame = 0` (line 275), preventing stale timer from clearing wind mid-drag
- [ ] Claim 4: `handleCanvasMouseup` wind strength calculation and `wind = true` are now gated inside `if (dragToolOrigin === 'air')` (line 296), so releasing a drag that started as air but was switched to another tool does NOT set wind=true
- [ ] Claim 5: `isDragging = false` remains unconditional in handleCanvasMouseup (line 309), preserving D3.1 invariant
- [ ] Claim 6: The `setTimeout` at the old lines 303-306 has been completely removed -- `grep -n setTimeout.*wind js/main.js` returns no matches
- [ ] Claim 7: Wind reset frame check added in `update()` at lines 1394-1399, parallel to touch reset block, clears `BRAIN.stimulate.wind` and `windStrength` when `frameCount >= windResetFrame`
- [ ] Claim 8: `drawAntennae(t, dtScale)` uses exponential interpolation `1 - Math.pow(0.92, dtScale)` for antenna twitch lerps (lines 1057-1058), equivalent to original 0.08 multiplier at dtScale=1
- [ ] Claim 9: `drawLegs(state, dtScale)` uses exponential interpolation `1 - Math.pow(0.95, dtScale)` for leg jitter lerps (line 1142), equivalent to original 0.05 multiplier at dtScale=1
- [ ] Claim 10: Wing micro-movement lerp uses `1 - Math.pow(0.97, dtScale)` (line 1150), equivalent to original 0.03 multiplier at dtScale=1
- [ ] Claim 11: `currentDtScale` module-level variable (line 29) is set in `update()` (line 1267) and passed through `drawFlyBody(currentDtScale)` -> `drawLegs(state, dtScale)` and `drawAntennae(t, dtScale)`
- [ ] Claim 12: `handleCanvasMousemove` was NOT modified (constraint from plan)
- [ ] Claim 13: `drawWindArrow` was NOT modified (constraint from plan)
- [ ] Claim 14: No files other than js/main.js were modified

## Gaps and Assumptions
- No automated tests exist to verify the race condition fix; requires manual browser testing per plan smoke-test instructions
- The 120-frame wind reset duration is approximate (~2s at 60fps) but will scale with actual frame rate, unlike the original 2000ms setTimeout which was wall-clock time; this is a deliberate design choice matching the touchResetFrame pattern
- Frame-rate independence of idle animations cannot be verified without a 120Hz display or artificially throttled requestAnimationFrame
