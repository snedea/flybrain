# Build Claims -- D9.1

## Files Changed
- [MODIFY] js/main.js -- Three fixes: (1) reordered edge avoidance before facingDir interpolation in update(), (2) added behavior/speed state resets in visibilitychange resume handler, (3) removed dead isWalking variable in drawFlyBody

## Verification Results
- Build: PASS (`node -c js/main.js` -- no syntax errors)
- Tests: SKIPPED (no test suite exists)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: In update(), the edge avoidance block (edgeMargin/edgeBias/edgeBiasY computation and targetDir modification) now runs BEFORE the facingDir exponential interpolation (angleDiffTurn computation), so facingDir tracks the edge-corrected targetDir in the same frame -- verify by reading js/main.js lines 1359-1394
- [ ] Claim 2: The edge avoidance math (thresholds, bias calculations, awayAngle/awayStrength, 0.3 factor) is unchanged -- only its position relative to facingDir interpolation changed
- [ ] Claim 3: The angle normalization of facingDir and targetDir still occurs AFTER both the edge avoidance and facingDir interpolation blocks
- [ ] Claim 4: The visibilitychange resume handler (else branch) now resets behavior.current to 'idle', behavior.startlePhase to 'none', behavior.enterTime to Date.now(), speed to 0, and speedChangeInterval to 0 -- verify at js/main.js lines 287-293
- [ ] Claim 5: The new behavior/speed resets are placed after the drive snapshot restore and before the lastTime reset, preserving the existing reset ordering
- [ ] Claim 6: Existing visibilitychange resume resets (stimuli, drag state, food timestamps, drive snapshot) are unmodified
- [ ] Claim 7: The dead `var isWalking = (state === 'walk' || state === 'explore' || state === 'phototaxis');` in drawFlyBody has been removed -- verify by grepping for `isWalking` which should only appear once, in drawLegs at line 1211
- [ ] Claim 8: The live isWalking declaration in drawLegs (line 1211) is untouched
- [ ] Claim 9: No other files were modified

## Gaps and Assumptions
- Smoke testing (browser interaction: edge avoidance smoothness, tab-switch resume behavior) was not performed -- only syntax validation via node -c
- The behavior.enterTime reset uses Date.now() which is correct for the idle state but was not verified against all code paths that read behavior.enterTime
- No automated tests exist to verify the behavioral changes at runtime
