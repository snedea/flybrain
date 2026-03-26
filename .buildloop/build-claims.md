# Build Claims -- T4.1

## Files Changed
- [MODIFY] index.html -- Added Groom drive meter row to the bottom panel (#driveGroom) after Curiosity row
- [MODIFY] css/main.css -- Added #driveGroom CSS rule with background: var(--accent)
- [MODIFY] js/main.js -- Added food-seeking directional bias, gradual feeding, visual feedback effects (ripples, wind arrow, food glow), and groom drive meter wiring

## Verification Results
- Build: PASS (no build step -- static HTML/JS/CSS project)
- Tests: SKIPPED (no test suite configured)
- Lint: PASS (node --check js/main.js -- syntax validation passed)

## Claims
- [ ] Claim 1: Food-seeking bias activates in computeMovementForBehavior() only when BOTH BRAIN.stimulate.foodNearby is true AND BRAIN.drives.hunger > 0.3; it computes angle from fly to nearest food via nearestFood() helper and blends targetDir toward food with seekStrength capped at 0.6, ensuring minimum speed of 0.3
- [ ] Claim 2: nearestFood() helper function (line ~284) iterates all food items, returns {item, dist} for the closest one, or null if no food exists
- [ ] Claim 3: Gradual feeding replaces instant food.splice: on first contact (dist <= 20) in feed state, feedStart is set to Date.now() with random duration 2000-5000ms; food[i].radius shrinks from 10 to 1 over the duration; food is spliced only when progress >= 1
- [ ] Claim 4: If fly moves away from food (dist > 20 or dist > 50), feedStart resets to 0 and radius resets to 10, so feeding restarts from zero if fly returns
- [ ] Claim 5: Food items now have expanded shape {x, y, radius: 10, feedStart: 0, feedDuration: 0} pushed in handleCanvasMousedown
- [ ] Claim 6: drawFood() uses f.radius instead of hardcoded 10, and draws a pulsing glow circle (radius + 6, opacity oscillating 0.15-0.45 via sin wave) behind food items when fly is within 50px
- [ ] Claim 7: Touch tool click creates a ripple entry {x, y, startTime} in the ripples array; drawRipples() renders expanding orange rings (0-30px over 500ms) that fade out and are spliced after 500ms
- [ ] Claim 8: Air tool drag sets windArrowEnd to current mouse position in handleCanvasMousemove; drawWindArrow() renders a translucent line+arrowhead from dragStart to windArrowEnd; windArrowEnd is set to null in handleCanvasMouseup
- [ ] Claim 9: drawRipples() and drawWindArrow() are called in draw() after drawFood() and before the fly is drawn
- [ ] Claim 10: Groom drive meter HTML added to index.html with id="driveGroom", CSS uses var(--accent) (#E3734B), and updateBrain() wires it to BRAIN.drives.groom * 100 + '%'
- [ ] Claim 11: State variables ripples, windArrowEnd, currentMousePos added at top of file after wallTouchResetFrame
- [ ] Claim 12: No changes to js/connectome.js, js/constants.js, SPEC.md, TASKS.md, or CLAUDE.md

## Gaps and Assumptions
- No automated tests exist; all verification requires manual browser testing
- The food-seeking angle uses Math.atan2(-(dy), dx) matching the existing convention where fly.y -= Math.sin(facingDir) * speed (inverted Y axis) -- correctness of the direction depends on this convention being consistent
- The pulsing glow frequency (~5Hz from sin(t/200)) was chosen to match the plan but actual visual feel requires browser observation
- The bottom panel height (90px) is unchanged; the 5th drive row is assumed to fit within existing flex layout with gap: 0.4rem -- visual overflow was not tested
- currentMousePos is tracked in handleCanvasMousemove but only used indirectly via windArrowEnd; it's available for future use per the plan
