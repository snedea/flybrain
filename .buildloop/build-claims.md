# Build Claims -- T2.1

## Files Changed
- [MODIFY] js/constants.js -- Tuned 4 connectome weights: SEZ_FEED->MN_PROBOSCIS 10->14, SEZ_GROOM->MN_LEG_L1 7->10, SEZ_GROOM->MN_LEG_R1 7->10, DRIVE_GROOM->SEZ_GROOM 6->8
- [MODIFY] index.html -- Added behavior state label row as first child of #drive-meters div (span#behaviorState with class behavior-state)
- [MODIFY] css/main.css -- Added .behavior-state CSS rule after #driveCuriosity block (font-size, color, text-transform, letter-spacing, font-weight)
- [MODIFY] js/main.js -- Added full behavioral state machine with 8 helper functions, modified 5 existing functions (updateBrain, update, drawFlyBody, drawWing, drawLegs, drawProboscis)

## Verification Results
- Build: PASS (no build step -- vanilla JS loaded via script tags)
- Syntax: PASS (`node --check js/constants.js` and `node --check js/main.js` both exit 0)
- Tests: SKIPPED (no test framework configured)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Behavior state machine with 9 states (idle, walk, explore, phototaxis, rest, groom, feed, fly, startle) is implemented in `js/main.js:27-73` via `BEHAVIOR_MIN_DURATION`, `BEHAVIOR_COOLDOWN`, `BEHAVIOR_THRESHOLDS`, and `behavior` object
- [ ] State evaluation follows strict priority order: startle > fly > feed > groom > rest > phototaxis > explore > walk > idle (see `evaluateBehaviorEntry()` at `js/main.js:280`)
- [ ] `updateBehaviorState()` at `js/main.js:317` enforces minimum duration before transitions and sets cooldowns on exit
- [ ] Startle behavior has a freeze-then-burst pattern: 200ms freeze (speed=0), then burst (speed=3.0, reverse direction) implemented in `applyBehaviorMovement()` at `js/main.js:425`
- [ ] DN_STARTLE postSynaptic is drained to 0 on startle entry to prevent immediate re-triggering (`js/main.js:340-342`)
- [ ] `syncBrainFlags()` at `js/main.js:361` overrides BRAIN._isMoving/_isFeeding/_isGrooming based on behavioral state (not just accumulator values)
- [ ] `computeMovementForBehavior()` at `js/main.js:374` replaces the old hardcoded accumleft/right->speed/dir computation with state-dependent movement
- [ ] Walk/explore use existing accumulator-based direction; explore adds 0.3rad random drift
- [ ] Phototaxis steers toward canvas center using Math.atan2 with inverted Y
- [ ] Flight multiplies speed by 2.5x with 0.2rad direction jitter and minimum speed 1.5
- [ ] Feed/groom/rest/idle decelerate the fly to 0 speed via per-frame damping (0.92 multiplier)
- [ ] Wing spread animation: `anim.wingSpread` lerps 0->1 at rate 0.15/frame for fly and startle-burst states (`drawWing()` at `js/main.js:648`)
- [ ] Flight wing buzz: sinusoidal oscillation at ~33Hz when wingSpread > 0.5 (`js/main.js:661`)
- [ ] Wing opacity increases from 0.3 to 0.65 as wings spread (`js/main.js:670`)
- [ ] Proboscis extends smoothly via `anim.proboscisExtend` (0->1 lerp at 0.1/frame) during feed state; drawn conditionally when > 0.01 (`drawFlyBody()` at `js/main.js:640`)
- [ ] `drawProboscis(extend)` at `js/main.js:858` takes an extend parameter (0-1) controlling length
- [ ] Grooming animation: front legs (pairIdx===0) swing inward with sinusoidal oscillation via `anim.groomPhase` advancing at 0.12/frame (`drawLegs()` at `js/main.js:939-941`)
- [ ] Flight legs tucked: hipMod*=0.4, kneeMod*=0.3 during fly state (`js/main.js:943-945`)
- [ ] Startle burst legs: middle/rear legs extend (hipMod*=1.5, kneeMod*=0.5) (`js/main.js:947-949`)
- [ ] Rest legs slightly tucked (hipMod*=0.7) with reduced jitter (*=0.3) (`js/main.js:954-956`)
- [ ] Food consumption gated on feed state: food.splice only when `behavior.current === 'feed'` (`js/main.js:1057`)
- [ ] foodContact and foodNearby stimulation flags reset per-frame (`js/main.js:1048-1049`)
- [ ] Behavior state label updates in bottom panel every 500ms via `behaviorStateEl.textContent = behavior.current` (`js/main.js:163`)
- [ ] Behavior state label styled with accent color, uppercase, 0.7rem (`css/main.css:226-231`)
- [ ] Connectome weights tuned: SEZ_FEED->MN_PROBOSCIS=14, SEZ_GROOM->MN_LEG_L1=10, SEZ_GROOM->MN_LEG_R1=10, DRIVE_GROOM->SEZ_GROOM=8 (`js/constants.js:295,305,306,475`)
- [ ] No new files created -- all changes in existing 4 files (constants.js, index.html, main.css, main.js)
- [ ] All animation uses simple lerp (multiply by rate constant) -- no CSS transitions or external easing libraries
- [ ] behavior object has fixed scalar fields only -- no arrays/maps that could accumulate unboundedly

## Gaps and Assumptions
- No automated test suite exists; all verification was syntax-checking via `node --check` and manual code review
- Browser runtime behavior not verified (no headless browser test); smoke testing per the plan's 8-point checklist requires manual browser interaction
- Phototaxis steers toward canvas center as a placeholder for a real light direction source (lightDirection stimulus is not set by the light tool)
- accumStartle is read from DN_STARTLE thisState which is NOT drained by motorcontrol() like motor neurons -- the state machine compensates by zeroing it on startle entry, but if DN_STARTLE stays high for multiple ticks before reaching threshold=30, the first startle will drain it but subsequent sub-threshold accumulation could be surprising
- The setTimeout in update() that resets stimulation flags runs on every 60fps frame, creating many overlapping 2s timers; this is unchanged from the original code and may cause minor timing inconsistencies
- Cooldown timers in behavior.cooldowns are never cleaned up (old entries persist as past timestamps), but since there are only 4 possible keys this is bounded and harmless
- The `newDir` variable in `computeMovementForBehavior()` for walk and fly cases shadows the outer scope; this is intentional and matches the original code pattern but could be confusing
