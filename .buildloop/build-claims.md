# Build Claims -- D6.1

## Files Changed
- [MODIFY] js/main.js -- Fix frame-rate-dependent idle animation timer frequencies, replace window.onresize with addEventListener, and fix mid-drag tool-switch bugs

## Verification Results
- Build: PASS (no build step -- static HTML/JS project)
- Tests: SKIPPED (no existing tests)
- Lint: SKIPPED (no lint configured)

## Claims
- [ ] Claim 1: `anim` object (line 774-777) has three new fields: `antennaNextInterval`, `legJitterNextInterval`, `wingMicroNextInterval`, each initialized with the same random range as the original inline expressions
- [ ] Claim 2: `drawAntennae` (line 1068) checks `anim.antennaNextInterval` instead of `0.8 + Math.random() * 1.2`, and re-rolls `anim.antennaNextInterval` on line 1070 after the timer fires
- [ ] Claim 3: `drawLegs` leg jitter timer (line 1145) checks `anim.legJitterNextInterval` instead of `1.5 + Math.random() * 2.0`, and re-rolls `anim.legJitterNextInterval` on line 1147 after the timer fires
- [ ] Claim 4: `drawLegs` wing micro timer (line 1157) checks `anim.wingMicroNextInterval` instead of `2.0 + Math.random() * 3.0`, and re-rolls `anim.wingMicroNextInterval` on line 1159 after the timer fires
- [ ] Claim 5: No inline `Math.random()` calls remain in any timer condition check -- all three timers use pre-rolled interval fields
- [ ] Claim 6: Timer threshold constants are unchanged (0.8, 1.2, 1.5, 2.0, 3.0) -- same minimum and range values
- [ ] Claim 7: `window.onresize = resize` (was line 1454) replaced with `window.addEventListener('resize', resize)` (now line 1461)
- [ ] Claim 8: `handleCanvasMousemove` (line 285) checks `dragToolOrigin !== 'air'` instead of `activeTool !== 'air'`
- [ ] Claim 9: `drawWindArrow` (line 710) checks `dragToolOrigin !== 'air'` instead of `activeTool !== 'air'`
- [ ] Claim 10: No remaining references to `activeTool !== 'air'` exist in the file
- [ ] Claim 11: No remaining references to `window.onresize` exist in the file
- [ ] Claim 12: The `Math.pow` exponential interpolation lines (lerp smoothing) are untouched
- [ ] Claim 13: `handleCanvasMouseup` is unmodified

## Gaps and Assumptions
- No runtime testing performed (browser-only project, no test harness)
- Assumed `dragToolOrigin` is always set before `isDragging` becomes true (verified by reading D4.1 mousedown handler -- dragToolOrigin is set in the same handler that sets isDragging)
- The initial random intervals in the anim object are generated once at page load; if the page loads but the animation loop doesn't start immediately, the first interval may be slightly shorter than intended (negligible impact)
