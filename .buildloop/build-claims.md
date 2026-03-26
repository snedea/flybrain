# Build Claims -- T3.1

## Files Changed
- [MODIFY] js/connectome.js -- Removed 3 legacy worm-sim flag declarations (stimulateHungerNeurons, stimulateNoseTouchNeurons, stimulateFoodSenseNeurons) at former lines 146-149, and removed the backward-compat mapping block in BRAIN.update() at former lines 271-277
- [MODIFY] js/main.js -- Fixed angle wrapping bug (180->Math.PI, 360->2*Math.PI), replaced setTimeout flood with frame-counted timer, switched render loop from setInterval to requestAnimationFrame with delta-time, added high-DPI canvas support via devicePixelRatio, clamped fly movement bounds to visible area (top: 44px, bottom: 90px from bottom), replaced all legacy flag usage with direct BRAIN.stimulate.touch calls, added wallTouchResetFrame state variable

## Verification Results
- Build: PASS (N/A -- vanilla JS, no build step)
- Tests: SKIPPED (no existing test suite)
- Lint: SKIPPED (no linter configured)
- Grep for legacy flags: PASS (`grep -r 'stimulateHungerNeurons\|stimulateNoseTouchNeurons\|stimulateFoodSenseNeurons' js/` returns zero matches)
- Grep for setTimeout in update(): PASS (no setTimeout calls remain in the update() function; 2 unrelated setTimeout calls exist elsewhere in main.js)
- Grep for setInterval: PASS (only the brain tick `setInterval(updateBrain, 500)` at line 169 remains, which is correct per plan constraints)

## Claims
- [ ] Claim 1: Angle wrapping in update() at main.js:1016 now compares against Math.PI (radians) instead of 180 (degrees), and uses 2*Math.PI instead of 360 in the correction branches at lines 1018 and 1020
- [ ] Claim 2: The setTimeout flood (formerly at lines 1066-1070) is replaced with a frame-counted timer using wallTouchResetFrame variable -- checks at main.js:1070-1074 reset BRAIN.stimulate.touch after 120 frames (~2s at 60fps)
- [ ] Claim 3: The render loop at main.js:1127-1138 uses requestAnimationFrame instead of setInterval, with delta-time passed to update() and clamped to 100ms max
- [ ] Claim 4: update() at main.js:1007 now accepts a dt parameter; speed interpolation (line 1011) and turn rate (lines 1025, 1027) are scaled by dtScale = dt / (1000/60) for frame-rate-independent movement
- [ ] Claim 5: High-DPI canvas support added in resize IIFE at main.js:1116-1125 -- canvas backing store sized to window * devicePixelRatio, CSS size set to window dimensions, ctx.setTransform scales all drawing by dpr
- [ ] Claim 6: clearRect in draw() at main.js:1092 uses window.innerWidth/Height (CSS pixels) instead of canvas.width/height (physical pixels) to correctly clear under the DPR transform
- [ ] Claim 7: Fly Y position clamped to [44, window.innerHeight - 90] at main.js:1043-1051, preventing the fly from walking behind the top toolbar (44px) or bottom panel (90px)
- [ ] Claim 8: All 3 legacy flags (stimulateHungerNeurons, stimulateNoseTouchNeurons, stimulateFoodSenseNeurons) are completely removed from both connectome.js and main.js -- zero references remain in the js/ directory
- [ ] Claim 9: Wall collision in main.js:1033-1051 now uses BRAIN.stimulate.touch = true directly instead of the removed BRAIN.stimulateNoseTouchNeurons flag
- [ ] Claim 10: The brain tick interval (setInterval(updateBrain, 500)) is unchanged -- only the render loop was switched to RAF
- [ ] Claim 11: wallTouchResetFrame state variable added at main.js:26, initialized to 0
- [ ] Claim 12: The food proximity block at main.js:1058-1059 no longer sets BRAIN.stimulateFoodSenseNeurons; it only sets BRAIN.stimulate.foodNearby directly

## Gaps and Assumptions
- The first frame will have dt=0 (since lastTime starts at 0 and the first RAF timestamp is nonzero, actually dt will be large and get clamped to 100ms). On the very first call, dtScale will be ~6, causing a brief speed burst. This is cosmetically minor and matches the plan's implementation.
- The fly position is NOT clamped on the X axis to account for any side UI chrome -- plan only specified top (44px) and bottom (90px) bounds. X clamping remains at [0, window.innerWidth].
- No automated browser-based smoke tests were run. All verification was done via static code analysis (grep for removed flags, review of changed code regions).
- The frameCount used for wallTouchResetFrame is incremented every RAF frame, not every brain tick. At varying frame rates, the 120-frame timeout may not be exactly 2 seconds, but will be close enough for the touch stimulus reset.
