# Plan: D1.2

Fix feed state food-contact gap and conflicting touch stimulus timers.

## Dependencies
- list: none (vanilla JS, no packages)
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Two bugs to fix: (A) feed state stops fly 20-50px from food so it never reaches contact range, (B) user touch setTimeout and wall-collision frame-counter conflict when both active

#### Bug A: Feed state food-contact gap

**Problem:** `evaluateBehaviorEntry()` enters feed state when food is within 50px (via `hasNearbyFood()`), but `computeMovementForBehavior()` sets `targetSpeed = 0` for feed state. Gradual feeding only progresses when `dist <= 20px`. So the fly stops at 20-50px with proboscis extended but never reaches the food.

**Fix:** In `computeMovementForBehavior()`, replace the blanket `targetSpeed = 0` for feed state with a slow drift toward the nearest food item, stopping only when within contact range (20px).

**Change 1a: Split feed out of the combined stationary branch**

- anchor: `} else if (state === 'feed' || state === 'groom' || state === 'rest') {`  (line 523)
- Replace the entire block at line 523-525:
  ```js
  } else if (state === 'feed' || state === 'groom' || state === 'rest') {
  	targetSpeed = 0;
  	speedChangeInterval = -speed * 0.1;
  ```
  with:
  ```js
  } else if (state === 'feed') {
  	// Drift toward nearest food until within contact range (20px)
  	var nf = nearestFood();
  	if (nf && nf.dist > 20) {
  		var foodAngle = Math.atan2(-(nf.item.y - fly.y), nf.item.x - fly.x);
  		targetDir = foodAngle;
  		targetSpeed = 0.15;
  		speedChangeInterval = (targetSpeed - speed) / 30;
  	} else {
  		targetSpeed = 0;
  		speedChangeInterval = -speed * 0.1;
  	}
  } else if (state === 'groom' || state === 'rest') {
  	targetSpeed = 0;
  	speedChangeInterval = -speed * 0.1;
  ```

  Logic:
  1. Call `nearestFood()` to get the nearest food item and its distance
  2. If food exists and distance > 20px, set `targetDir` to the angle toward the food using `Math.atan2(-(food.y - fly.y), food.x - fly.x)` (note: y is negated because canvas y is inverted relative to math y, matching the convention used in food-seeking at line 486)
  3. Set `targetSpeed = 0.15` (slow crawl, ~1/2 the normal explore speed)
  4. Set `speedChangeInterval = (targetSpeed - speed) / 30` for smooth acceleration
  5. If food is within 20px or no food exists, fall back to `targetSpeed = 0` with `speedChangeInterval = -speed * 0.1` (same as original)
  6. The `groom` and `rest` states keep the original stationary behavior in a separate `else if`

**Change 1b: Also update `applyBehaviorMovement()` to allow slow movement in feed state**

- anchor: `if (behavior.current === 'feed' || behavior.current === 'groom' ||` (line 554)
- This block forces speed to 0 for feed/groom/rest/idle states every frame, which would override the drift computed in `computeMovementForBehavior()`.
- Replace lines 554-561:
  ```js
  if (behavior.current === 'feed' || behavior.current === 'groom' ||
  	behavior.current === 'rest' || behavior.current === 'idle') {
  	if (speed > 0.05) {
  		speed *= Math.pow(0.92, dtScale);
  	} else {
  		speed = 0;
  	}
  }
  ```
  with:
  ```js
  if (behavior.current === 'groom' ||
  	behavior.current === 'rest' || behavior.current === 'idle') {
  	if (speed > 0.05) {
  		speed *= Math.pow(0.92, dtScale);
  	} else {
  		speed = 0;
  	}
  }
  if (behavior.current === 'feed') {
  	var nf = nearestFood();
  	if (nf && nf.dist > 20) {
  		// Allow slow drift: clamp speed to max 0.2 so it doesn't overshoot
  		if (speed > 0.2) {
  			speed *= Math.pow(0.92, dtScale);
  		}
  	} else {
  		if (speed > 0.05) {
  			speed *= Math.pow(0.92, dtScale);
  		} else {
  			speed = 0;
  		}
  	}
  }
  ```

  Logic:
  1. Remove `'feed'` from the existing deceleration block that forces speed to 0
  2. Add a separate `if` block for feed state
  3. When food exists and is > 20px away, allow speed up to 0.2 (clamp if over, but don't decelerate to 0)
  4. When food is within 20px or absent, apply the same deceleration to 0 as before (stop at food)

#### Bug B: Conflicting touch stimulus timers

**Problem:** `applyTouchTool()` uses `setTimeout(2000ms)` to clear `BRAIN.stimulate.touch`. Wall collision uses `wallTouchResetFrame = frameCount + 120`. If both activate, whichever expires first clears the stimulus for both, because they both write to the same `BRAIN.stimulate.touch = false`.

**Fix:** Replace the `setTimeout` in `applyTouchTool()` with the same frame-counted mechanism used by wall collision. Rename `wallTouchResetFrame` to `touchResetFrame` since it now serves both sources. Use `Math.max` to ensure the latest-expiring stimulus wins.

**Change 2a: Rename variable declaration**

- anchor: `var wallTouchResetFrame = 0;` (line 26)
- Replace with: `var touchResetFrame = 0;`

**Change 2b: Replace setTimeout in applyTouchTool with frame-counter**

- anchor: `setTimeout(function () {` (line 331, inside `applyTouchTool`)
- Replace lines 331-334:
  ```js
  setTimeout(function () {
  	BRAIN.stimulate.touch = false;
  	BRAIN.stimulate.touchLocation = null;
  }, 2000);
  ```
  with:
  ```js
  touchResetFrame = Math.max(touchResetFrame, frameCount + 120);
  ```
  Logic:
  1. Set `touchResetFrame` to at least `frameCount + 120` (120 frames = ~2 seconds at 60fps, same as the old 2000ms setTimeout)
  2. Using `Math.max` ensures that if a wall collision already set a later expiry, the user touch doesn't shorten it, and vice versa

**Change 2c: Update all wall collision references**

- anchor: `wallTouchResetFrame = frameCount + 120;` (appears 4 times at lines 1289, 1293, 1298, 1302)
- Replace each of the 4 occurrences of:
  ```js
  wallTouchResetFrame = frameCount + 120;
  ```
  with:
  ```js
  touchResetFrame = Math.max(touchResetFrame, frameCount + 120);
  ```
  This is a global find-and-replace: replace all `wallTouchResetFrame = frameCount + 120;` with `touchResetFrame = Math.max(touchResetFrame, frameCount + 120);`

**Change 2d: Update the reset check**

- anchor: `if (wallTouchResetFrame > 0 && frameCount >= wallTouchResetFrame) {` (line 1345)
- Replace lines 1345-1348:
  ```js
  if (wallTouchResetFrame > 0 && frameCount >= wallTouchResetFrame) {
  	BRAIN.stimulate.touch = false;
  	wallTouchResetFrame = 0;
  }
  ```
  with:
  ```js
  if (touchResetFrame > 0 && frameCount >= touchResetFrame) {
  	BRAIN.stimulate.touch = false;
  	BRAIN.stimulate.touchLocation = null;
  	touchResetFrame = 0;
  }
  ```
  Logic:
  1. Replace `wallTouchResetFrame` with `touchResetFrame` in the condition and reset
  2. Add `BRAIN.stimulate.touchLocation = null;` -- the old setTimeout cleared this but the old wall collision reset did not. Now that both sources share a single reset, touchLocation must be cleared here too so user-initiated touches get their location properly cleaned up.

## Verification
- build: Open `index.html` in a browser (no build step -- vanilla JS)
- lint: no linter configured
- test: no existing tests
- smoke: Perform these manual checks in the browser:
  1. **Feed drift test:** Select the food tool, place food ~40px away from the fly. Wait for the fly to enter feed state (proboscis extends). Verify the fly slowly drifts toward the food and starts feeding (food shrinks) when it reaches contact range (~20px). Previously the fly would stop and never reach the food.
  2. **Feed stop test:** Place food directly on the fly (within 20px). Verify the fly stops and feeds normally without drifting.
  3. **Touch timer test:** Select the touch tool, click on the fly. Within 2 seconds, push the fly into a wall (or wait for it to walk into one). Verify the touch stimulus does not clear prematurely (check `BRAIN.stimulate.touch` in the console -- it should stay true for the full ~2 seconds from the latest stimulus event).
  4. **Wall collision test:** Let the fly walk into a wall normally. Verify `BRAIN.stimulate.touch` becomes true and clears after ~2 seconds.

## Constraints
- Do NOT modify any file other than `js/main.js`
- Do NOT modify SPEC.md, CLAUDE.md, TASKS.md, or files in `.buildloop/` other than this plan
- Do NOT add new dependencies or change the HTML/CSS
- Do NOT change the `hasNearbyFood()` threshold (keep at 50px) -- the entry threshold is fine; the fix is to make the fly drift in feed state rather than stop
- Do NOT change the 20px contact distance for gradual feeding
- Do NOT change the wall collision bounds (44px top, 90px bottom panel)
- Do NOT rename `wallTouchResetFrame` in a separate step -- do the rename and logic change atomically in a single pass (find-replace all occurrences)
- The `nearestFood()` function already exists at line 350 and returns `{ item, dist }` or `null` -- do NOT create a new helper
