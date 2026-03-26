# Plan: D13.1

## Dependencies
- list: []
- commands: []

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Three fixes — (1) clamp food positions after resize, (2) clear behavior.cooldowns on visibilitychange resume, (3) remove dead targetPair variable in drawLegs

#### Change 1: Clamp food positions in resize handler

- anchor: the resize IIFE at line 1518:
  ```js
  (function resize() {
  	var dpr = window.devicePixelRatio || 1;
  	canvas.width = window.innerWidth * dpr;
  	canvas.height = window.innerHeight * dpr;
  	canvas.style.width = window.innerWidth + 'px';
  	canvas.style.height = window.innerHeight + 'px';
  	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  	window.addEventListener('resize', resize);
  })();
  ```

- action: Insert a food-clamping loop immediately after the `ctx.setTransform(dpr, 0, 0, dpr, 0, 0);` line and before the `window.addEventListener('resize', resize);` line.

- exact code to insert between those two lines:
  ```js
  	// Clamp food positions to current visible bounds so food items
  	// near old edges don't become unreachable after window shrinks
  	for (var i = 0; i < food.length; i++) {
  		food[i].x = Math.max(0, Math.min(food[i].x, window.innerWidth));
  		food[i].y = Math.max(44, Math.min(food[i].y, window.innerHeight - 90));
  	}
  ```

- rationale: The fly is clamped to `[0, innerWidth] x [44, innerHeight-90]` (lines 1404-1421). Food must be clamped to the same bounds so the fly can always reach it. Clamping X to `[0, innerWidth]` and Y to `[44, innerHeight-90]` matches the fly's reachable area exactly. This runs on every resize event, so food is re-clamped whenever the window shrinks.

- also clamp fly position in the same block: Insert after the food clamp loop and before `window.addEventListener`:
  ```js
  	// Also re-clamp the fly position to the new bounds
  	fly.x = Math.max(0, Math.min(fly.x, window.innerWidth));
  	fly.y = Math.max(44, Math.min(fly.y, window.innerHeight - 90));
  ```

- rationale: The fly itself may be past the new bounds after resize, and while the next update() frame would clamp it, that clamp triggers touch stimulus. Re-clamping silently in the resize handler avoids a spurious wall-touch event.

- final resize function should read:
  ```js
  (function resize() {
  	var dpr = window.devicePixelRatio || 1;
  	canvas.width = window.innerWidth * dpr;
  	canvas.height = window.innerHeight * dpr;
  	canvas.style.width = window.innerWidth + 'px';
  	canvas.style.height = window.innerHeight + 'px';
  	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  	// Clamp food positions to current visible bounds so food items
  	// near old edges don't become unreachable after window shrinks
  	for (var i = 0; i < food.length; i++) {
  		food[i].x = Math.max(0, Math.min(food[i].x, window.innerWidth));
  		food[i].y = Math.max(44, Math.min(food[i].y, window.innerHeight - 90));
  	}
  	// Also re-clamp the fly position to the new bounds
  	fly.x = Math.max(0, Math.min(fly.x, window.innerWidth));
  	fly.y = Math.max(44, Math.min(fly.y, window.innerHeight - 90));
  	window.addEventListener('resize', resize);
  })();
  ```

#### Change 2: Clear behavior.cooldowns on visibilitychange resume

- anchor: the resume branch of the visibilitychange handler. Locate these exact consecutive lines (around lines 289-293):
  ```js
  		behavior.current = 'idle';
  		behavior.startlePhase = 'none';
  		behavior.enterTime = Date.now();
  		speed = 0;
  		speedChangeInterval = 0;
  ```

- action: Insert `behavior.cooldowns = {};` immediately after the `behavior.enterTime = Date.now();` line and before the `speed = 0;` line.

- exact lines after the edit:
  ```js
  		behavior.current = 'idle';
  		behavior.startlePhase = 'none';
  		behavior.enterTime = Date.now();
  		behavior.cooldowns = {};
  		speed = 0;
  		speedChangeInterval = 0;
  ```

- rationale: When the tab is resumed, all stimuli and drives are reset to a clean state. Stale cooldowns from the pre-hide state would block re-entering behaviors (groom blocked up to 3s, startle 2s, fly 1s, feed 1s) even though the triggering conditions were fully cleared. Resetting cooldowns to an empty object lets behavior evaluation start fresh, matching the clean-slate intent of the resume handler.

#### Change 3: Remove dead targetPair variable in drawLegs

- anchor: inside the drawLegs function, the `groomLoc === 'leg'` branch. Locate these exact lines (around lines 1272-1275):
  ```js
  		} else if (groomLoc === 'leg') {
  			// Targeted single-leg cleaning: only the leg on the touched side moves
  			// Use side-based targeting: left legs clean when side=-1 touch
  			var targetPair = pairIdx; // all legs may participate
  ```

- action: Delete the line `var targetPair = pairIdx; // all legs may participate` entirely.

- exact lines after the edit:
  ```js
  		} else if (groomLoc === 'leg') {
  			// Targeted single-leg cleaning: only the leg on the touched side moves
  			// Use side-based targeting: left legs clean when side=-1 touch
  			if (pairIdx === 1) {
  ```

- rationale: `targetPair` is assigned but never read. It was noted as a gap in the D4.2 build claims. Removing it eliminates dead code.

## Verification
- build: no build step (vanilla JS project)
- lint: no linter configured
- test: no existing tests
- smoke: Open `index.html` in a browser. Perform these checks:
  1. Place 2-3 food items near the right edge of the screen. Resize the browser window narrower so the right edge shrinks past the food positions. Verify food items are clamped to the new visible area (not past the right edge). Verify the fly can reach and consume them without getting stuck at the wall.
  2. While the fly is in groom or startle state, switch to a different tab, wait 3 seconds, switch back. Verify the fly resumes in idle state and can immediately enter any behavior (groom, feed, etc.) without being blocked by stale cooldowns.
  3. Open browser devtools console. Search for "targetPair" in main.js source. Verify it does not appear anywhere.

## Constraints
- Do NOT modify any file other than `js/main.js`
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any file in .buildloop/ other than current-plan.md
- Do NOT add new dependencies or libraries
- Do NOT change the food proximity threshold (50px) or feeding contact distance (20px)
- Do NOT change the fly's position-clamp bounds (they are correct as-is)
- Do NOT change the structure of the `food` array items or the `behavior` object beyond adding/clearing the `cooldowns` property
- The three changes are independent and can be applied in any order, but apply them in the order listed above for consistency
