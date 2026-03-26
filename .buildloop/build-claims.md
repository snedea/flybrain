# Build Claims -- D15.1

## Files Changed
- [MODIFY] js/main.js -- Fix startle burst boomerang trajectory, add behavior-dependent turn speed, snap facingDir on burst entry, remove dead behavior.previous

## Verification Results
- Build: PASS (node -c js/main.js -- no syntax errors)
- Tests: SKIPPED (no automated tests exist for this project)
- Lint: SKIPPED (no linter configured for this project)

## Claims
- [ ] Claim 1: `behavior.previous` field removed from behavior object initialization at line 81 and its assignment at former line 516 deleted. Zero references to `behavior.previous` remain in the codebase.
- [ ] Claim 2: `behavior.burstDir` field added to behavior object initialization (line 88, default 0).
- [ ] Claim 3: In `applyBehaviorMovement` freeze-to-burst transition (line 659-665), escape direction is computed once via `normalizeAngle(facingDir + Math.PI + jitter)`, stored in `behavior.burstDir`, and both `targetDir` and `facingDir` are snapped to it for instant reversal.
- [ ] Claim 4: In `computeMovementForBehavior` startle burst branch (line 622), `targetDir` reads from `behavior.burstDir` instead of recomputing from `facingDir + PI + jitter`. This eliminates the boomerang effect caused by brain tick recomputation every 500ms.
- [ ] Claim 5: facingDir exponential interpolation (lines 1396-1405) uses behavior-dependent retention: 0.3 for startle burst (70% gap closure/frame), 0.4 for fly state (60% gap closure/frame), 0.9 for all other states (preserving D7.2 oscillation fix).
- [ ] Claim 6: `behavior.burstDir` is reset to 0 in the visibilitychange resume handler (line 293) alongside other behavior state resets.
- [ ] Claim 7: The turnRetention variable selection uses `behavior.current === 'startle' && behavior.startlePhase === 'burst'` -- it does NOT apply fast turning during the freeze phase, only during burst.
- [ ] Claim 8: No other files were modified. No changes to SPEC.md, TASKS.md, CLAUDE.md, or brain tick interval.

## Gaps and Assumptions
- The facingDir snap at burst entry (Change C) means the fly visually teleports its heading by ~PI radians in one frame. This matches the spec ("jump/fly away") but could look jarring if the freeze phase is very short. The 200ms freeze provides visual wind-up that should mask this.
- Edge avoidance (lines 1370-1387) runs after computeMovementForBehavior and before the turnRetention interpolation. During startle burst, edge avoidance may modify targetDir away from burstDir. The fast 0.3 retention means this correction is applied quickly, which is correct -- the fly should avoid edges even during startle.
- The 0.4 retention for fly state was not extensively tuned. It is faster than idle/walk (0.9) but slower than startle burst (0.3). If fly-state turning looks too snappy, this could be raised to 0.5-0.6.
