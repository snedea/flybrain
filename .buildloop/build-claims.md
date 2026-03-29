# Build Claims -- T13.3

## Files Changed
- [MODIFY] js/connectome.js -- Added `mateNearby` stimulus flag, `accumCourtship` accumulator (init, reset, compute, floor), olfactory mate detection block in BRAIN.update
- [MODIFY] js/fly-logic.js -- Added `courtship: 10` to BEHAVIOR_THRESHOLDS, `hasNearbyMate()` helper, courtship check in `evaluateBehaviorEntry()` between groom and brace
- [MODIFY] js/main.js -- Added `mates` array, courtship entries in BEHAVIOR_MIN_DURATION/BEHAVIOR_COOLDOWN, `courtshipWingVibration` anim property, mate placement handler, clearButton clearing mates, courtship movement logic, `nearestMate()` helper, courtship in applyBehaviorMovement stationary list, courtship wing vibration animation, `drawMates()` function, mate proximity detection + courtship completion in update(), mates resize clamping
- [MODIFY] index.html -- Added "Mate" toolbar button with `data-tool="mate"`, help overlay entry for Mate

## Verification Results
- Build: PASS (no build step -- `node -c` syntax check on all 3 JS files passed)
- Tests: PASS (node tests/run-node.js -- 99 passed / 0 failed / 99 total, no regressions)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] `BRAIN.stimulate.mateNearby` boolean flag exists in connectome.js and defaults to false
- [ ] `BRAIN.accumCourtship` accumulator is initialized to 0, reset each motorcontrol tick, computed from OLF_PN + curiosity - fear - fatigue when mateNearby is true, floored at 0
- [ ] Mate olfactory stimulation block fires `OLF_ORN_FOOD` and scaled `DRIVE_CURIOSITY` when `mateNearby` is true
- [ ] `BEHAVIOR_THRESHOLDS.courtship` is 10 in fly-logic.js
- [ ] `hasNearbyMate()` returns true if any mate is within 80px of fly, false otherwise (guards against undefined `mates`)
- [ ] `evaluateBehaviorEntry()` returns 'courtship' when accumCourtship > 10, mate nearby, not cooling down, fear < 0.3, fatigue < 0.6 -- priority is between groom and brace
- [ ] `mates` global array declared in main.js after `waterDrops`
- [ ] `BEHAVIOR_MIN_DURATION.courtship` is 5000ms, `BEHAVIOR_COOLDOWN.courtship` is 5000ms
- [ ] `anim.courtshipWingVibration` property exists and defaults to 0
- [ ] Clicking canvas with 'mate' tool active places exactly one mate (array assignment, not push), clamped to layout bounds
- [ ] Clear button (X icon) clears mates array along with food and waterDrops
- [ ] Courtship movement: fly approaches mate slowly (speed 0.2) when > 25px away, stops when close
- [ ] `nearestMate()` returns `{item, dist}` or null
- [ ] Courtship added to stationary behaviors list in `applyBehaviorMovement` (speed decays when close)
- [ ] Courtship wing vibration: `courtshipWingVibration` smoothly interpolates to 1 during courtship, 0 otherwise; `drawWing` adds asymmetric oscillation (vibFreq 20 for left wing, 40 for right)
- [ ] `drawMates()` renders mate as a 0.7x scaled fly silhouette with abdomen, thorax, head, red eyes, folded wings, and pheromone glow (pink pulse) when fly is within 80px
- [ ] `drawMates()` called in draw() between `drawWaterDrops()` and `drawRipples()` (inside zoom/pan transform)
- [ ] Mate proximity detection sets `BRAIN.stimulate.mateNearby` true when fly within 80px of any mate
- [ ] Courtship completion: after random 5-10s, mate is removed, curiosity reset to 0.1, mateNearby cleared
- [ ] Mates clamped to world bounds on window resize
- [ ] "Mate" button appears in toolbar HTML between "Water" and "Brain 3D"
- [ ] "Mate" help entry appears in help overlay after "Bitter food" entry
- [ ] Existing tool button handler loop automatically picks up `data-tool="mate"` -- no additional JS needed for button toggling
- [ ] All code uses ES5 syntax (var, not let/const)
- [ ] No console.log or debug output added

## Gaps and Assumptions
- Manual browser testing not performed (headless environment). The JS syntax checks and existing test suite pass, but visual rendering, courtship state transitions, and wing vibration animation require browser verification.
- The courtship accumulator threshold (10) and drive conditions (fear < 0.3, fatigue < 0.6) were taken from the plan. If OLF_PN activation is too low in practice, courtship may rarely trigger -- threshold may need tuning.
- The `courtshipEnd` random value (5000-10000ms) is set once on the mate object when courtship begins. If the fly exits and re-enters courtship on the same mate, a new random end is NOT generated (the old one persists on the mate object).
- One mate at a time (enforced by array assignment). Placing a new mate replaces the old one and resets any in-progress courtship end timer.
