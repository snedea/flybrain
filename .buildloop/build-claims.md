# Build Claims -- D3.2

## Files Changed
- [MODIFY] js/main.js -- Fix frame-rate-dependent animation interpolations and groom-state location amnesia

## Verification Results
- Build: PASS (no build step -- static HTML/JS project)
- Tests: SKIPPED (no existing tests)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: `behavior` object at js/main.js:79 now has a `groomLocation: null` field
- [ ] Claim 2: When entering groom state (js/main.js:453-455), `behavior.groomLocation` is set to `BRAIN.stimulate.touchLocation || 'thorax'`, snapshotting the trigger location before touchResetFrame clears it
- [ ] Claim 3: `updateAnimForBehavior()` at js/main.js:604 now accepts a `dtScale` parameter
- [ ] Claim 4: `anim.wingSpread` interpolation at js/main.js:612 uses exponential interpolation `(1 - Math.pow(0.85, dtScale))` instead of fixed `* 0.15`; at dtScale=1.0 (60Hz) this equals 0.15 (identical to original behavior)
- [ ] Claim 5: `anim.proboscisExtend` interpolation at js/main.js:619 uses exponential interpolation `(1 - Math.pow(0.9, dtScale))` instead of fixed `* 0.1`; at dtScale=1.0 (60Hz) this equals 0.1 (identical to original behavior)
- [ ] Claim 6: `anim.groomPhase` increment at js/main.js:623 uses `0.12 * dtScale` for linear dt scaling
- [ ] Claim 7: `anim.walkPhase` increment moved from `drawFlyBody()` into `updateAnimForBehavior()` at js/main.js:627-629, now uses `spd * 0.5 * dtScale` for linear dt scaling
- [ ] Claim 8: The walkPhase update block (old lines 832-836 in drawFlyBody) is removed; only `var isWalking = ...` declaration remains at js/main.js:842
- [ ] Claim 9: `drawAbdomen()` at js/main.js:945 reads `behavior.groomLocation` instead of `BRAIN.stimulate.touchLocation`; checks for `'abdomen'` or `'thorax'` (replacing the old `null` check, since groomLocation defaults to `'thorax'`)
- [ ] Claim 10: `drawLegs()` at js/main.js:1168 reads `behavior.groomLocation || 'thorax'` instead of `BRAIN.stimulate.touchLocation || 'thorax'`
- [ ] Claim 11: The call site at js/main.js:1389 passes `dtScale` to `updateAnimForBehavior(dtScale)`
- [ ] Claim 12: `BRAIN.stimulate.touchLocation` is no longer read in any drawing/animation code; remaining references are the write in `applyTouchTool` (line 336), the snapshot in groom-entry (line 454), and the reset in `update()` (line 1384) -- all correct
- [ ] Claim 13: The touchResetFrame logic (lines 1381-1385) is unmodified -- it still clears touchLocation to null, but drawing code no longer depends on it

## Gaps and Assumptions
- No automated tests exist; all verification is manual browser testing
- The exponential interpolation formula assumes the original `* 0.15` and `* 0.1` factors were tuned for 60fps; if the original was tuned at a different refresh rate, the visual feel at 60Hz will be identical but the cross-rate correction may differ from designer intent
- If groom state is entered through a code path that bypasses `updateBehaviorState()`, `behavior.groomLocation` would remain stale from a previous groom; the `|| 'thorax'` fallback in drawLegs mitigates this
- walkPhase is now updated in `updateAnimForBehavior()` which runs at the end of `update()` rather than at the start of `drawFlyBody()`; since draw happens after update in the RAF loop, this means walkPhase updates one frame earlier relative to rendering -- functionally negligible
