# Build Claims -- D19.1

## Files Changed
- MODIFY js/connectome.js -- Moved GUS_GRN_SWEET, GUS_GRN_BITTER, GUS_GRN_WATER from sensory to central array in BRAIN.neuronRegions
- MODIFY js/brain3d.js -- Added HIGHLIGHT_OPACITY/HIGHLIGHT_EMISSIVE/HIGHLIGHT_FADE_MS constants; refactored update() to compute opacity/emissiveIntensity before highlight check and added 300ms fade-out interpolation after highlight timer expires; updated highlightRegion() to use named constants

## Verification Results
- Build: PASS (node -c js/connectome.js && node -c js/brain3d.js)
- Tests: SKIPPED (no existing tests)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: GUS_GRN_SWEET, GUS_GRN_BITTER, GUS_GRN_WATER are no longer in BRAIN.neuronRegions.sensory (connectome.js)
- [ ] Claim 2: GUS_GRN_SWEET, GUS_GRN_BITTER, GUS_GRN_WATER are now in BRAIN.neuronRegions.central, between SEZ_WATER and GNG_DESC (connectome.js:113)
- [ ] Claim 3: brain3d.js defines three new constants: HIGHLIGHT_OPACITY=0.9, HIGHLIGHT_EMISSIVE=1.5, HIGHLIGHT_FADE_MS=300 (lines 19-21)
- [ ] Claim 4: In update(), opacity and emissiveIntensity are computed BEFORE the highlight check block, so they are available for fade interpolation (lines 325-326 before the highlight block at line 328)
- [ ] Claim 5: When region._highlightUntil expires, a 300ms fade-out period linearly interpolates from highlight values (0.9 opacity, 1.5 emissive) toward calculated activation values instead of snapping abruptly
- [ ] Claim 6: During the active highlight period (now < _highlightUntil), the region is still skipped entirely via continue (unchanged behavior)
- [ ] Claim 7: After fade-out completes (fadeElapsed >= HIGHLIGHT_FADE_MS), _highlightUntil is set to 0 and normal rendering resumes
- [ ] Claim 8: highlightRegion() uses HIGHLIGHT_EMISSIVE and HIGHLIGHT_OPACITY constants instead of hardcoded 1.5 and 0.9 (line 368-369)
- [ ] Claim 9: The highlight duration remains 1200ms (line 366, unchanged)
- [ ] Claim 10: All code uses ES5 style (var, not const/let)
- [ ] Claim 11: No other files were modified

## Gaps and Assumptions
- No automated tests exist to verify visual behavior; fade-out correctness requires manual browser testing
- The fade interpolation assumes update() is called frequently enough during the 300ms window for smooth animation (depends on the brain tick interval in main.js)
