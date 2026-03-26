# Plan: T4.1

## Dependencies
- list: [] (no new dependencies -- vanilla JS project)
- commands: [] (nothing to install)

## File Operations (in execution order)

### 1. MODIFY index.html
- operation: MODIFY
- reason: Add groom drive meter row to the bottom panel (sub-task 4)
- anchor: the block containing the Curiosity drive-row, which is the last drive-row before `</div>` closing `#drive-meters`:
  ```html
  <div class="drive-row">
      <span class="drive-label">Curiosity</span>
      <div class="drive-bar-bg"><div class="drive-bar" id="driveCuriosity"></div></div>
  </div>
  ```

#### HTML Changes
- After the Curiosity drive-row (line 49-51) and before the closing `</div>` of `#drive-meters` (line 53), insert exactly:
  ```html
  <div class="drive-row">
      <span class="drive-label">Groom</span>
      <div class="drive-bar-bg"><div class="drive-bar" id="driveGroom"></div></div>
  </div>
  ```
- No other HTML changes.

---

### 2. MODIFY css/main.css
- operation: MODIFY
- reason: Add CSS rule for the groom drive bar color (sub-task 4)
- anchor: the `#driveCuriosity` rule block (line 221-223):
  ```css
  #driveCuriosity {
      background: var(--success);
  }
  ```

#### CSS Changes
- Immediately after the `#driveCuriosity` block, add:
  ```css
  #driveGroom {
      background: var(--accent);
  }
  ```
- No other CSS changes.

---

### 3. MODIFY js/main.js
- operation: MODIFY
- reason: All four sub-tasks require changes to this file: food-seeking movement bias, gradual feeding, visual feedback effects, and groom drive meter wiring
- Multiple anchors listed per section below.

#### A. New State Variables (top of file, after `var wallTouchResetFrame = 0;` on line 26)

Add immediately after line 26 (`var wallTouchResetFrame = 0;`):

```js
// Visual feedback effects
var ripples = [];
var windArrowEnd = null;
var currentMousePos = { x: 0, y: 0 };
```

Explanation:
- `ripples`: array of `{x, y, startTime}` objects for touch-tool click ripple effect
- `windArrowEnd`: when air-tool is dragging, stores `{x, y}` of current mouse position; null when not dragging
- `currentMousePos`: tracks mouse position for wind arrow rendering

#### B. Food Item Structure Change

Currently food items are pushed as `{x: cx, y: cy}` at line 184. Change the push in `handleCanvasMousedown` to include radius and feeding state:

Anchor -- line 184:
```js
food.push({ x: cx, y: cy });
```
Replace with:
```js
food.push({ x: cx, y: cy, radius: 10, feedStart: 0, feedDuration: 0 });
```

#### C. Touch Tool Ripple Effect

In `handleCanvasMousedown`, after the touch tool branch, add ripple creation.

Anchor -- line 185-186:
```js
} else if (activeTool === 'touch') {
    applyTouchTool(cx, cy);
```
Replace with:
```js
} else if (activeTool === 'touch') {
    applyTouchTool(cx, cy);
    ripples.push({ x: cx, y: cy, startTime: Date.now() });
```

#### D. Wind Arrow Tracking in Mouse Handlers

**D1.** In `handleCanvasMousemove` (line 196-202), track current mouse position for wind arrow.

Anchor -- the full function body of `handleCanvasMousemove`:
```js
function handleCanvasMousemove(event) {
	if (!isDragging || activeTool !== 'air') return;
	var dx = event.clientX - dragStart.x;
	var dy = event.clientY - dragStart.y;
	var dragDist = Math.sqrt(dx * dx + dy * dy);
	BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);
}
```
Replace with:
```js
function handleCanvasMousemove(event) {
	currentMousePos.x = event.clientX;
	currentMousePos.y = event.clientY;
	if (!isDragging || activeTool !== 'air') return;
	var dx = event.clientX - dragStart.x;
	var dy = event.clientY - dragStart.y;
	var dragDist = Math.sqrt(dx * dx + dy * dy);
	BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);
	windArrowEnd = { x: event.clientX, y: event.clientY };
}
```

**D2.** In `handleCanvasMouseup` (line 204-223), clear `windArrowEnd` when mouse is released.

Anchor -- the line `isDragging = false;` inside the function (line 217):
```js
		isDragging = false;
```
Replace with:
```js
		isDragging = false;
		windArrowEnd = null;
```

#### E. Nearest Food Helper Function

Add a new function immediately after the existing `hasNearbyFood()` function (after line 267):

Anchor -- line 266-267:
```js
	return false;
}
```

Insert after:
```js

/**
 * Returns the nearest food item and its distance, or null if no food exists.
 */
function nearestFood() {
	var best = null;
	var bestDist = Infinity;
	for (var i = 0; i < food.length; i++) {
		var d = Math.hypot(fly.x - food[i].x, fly.y - food[i].y);
		if (d < bestDist) {
			bestDist = d;
			best = food[i];
		}
	}
	if (!best) return null;
	return { item: best, dist: bestDist };
}
```

#### F. Food-Seeking Directional Bias in computeMovementForBehavior()

In `computeMovementForBehavior()`, after the existing walk/explore targetDir computation, inject a food-seeking bias.

Anchor -- inside the `if (state === 'walk' || state === 'explore')` block, lines 379-386:
```js
	if (state === 'walk' || state === 'explore') {
		var newDir = (BRAIN.accumleft - BRAIN.accumright) / scalingFactor;
		targetDir = facingDir + newDir * Math.PI;
		targetSpeed = (Math.abs(BRAIN.accumleft) + Math.abs(BRAIN.accumright)) / (scalingFactor * 5);
		speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 1.5);
		if (state === 'explore') {
			targetDir += (Math.random() - 0.5) * 0.3;
		}
```
Replace with:
```js
	if (state === 'walk' || state === 'explore') {
		var newDir = (BRAIN.accumleft - BRAIN.accumright) / scalingFactor;
		targetDir = facingDir + newDir * Math.PI;
		targetSpeed = (Math.abs(BRAIN.accumleft) + Math.abs(BRAIN.accumright)) / (scalingFactor * 5);
		speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 1.5);
		if (state === 'explore') {
			targetDir += (Math.random() - 0.5) * 0.3;
		}
		// Food-seeking: bias targetDir toward nearest food when hungry and food detected
		if (BRAIN.stimulate.foodNearby && BRAIN.drives.hunger > 0.3) {
			var nf = nearestFood();
			if (nf) {
				var foodAngle = Math.atan2(-(nf.item.y - fly.y), nf.item.x - fly.x);
				var seekStrength = Math.min(1, BRAIN.drives.hunger) * 0.6;
				// Blend targetDir toward foodAngle
				var angleDiffToFood = foodAngle - targetDir;
				// Normalize to [-PI, PI]
				while (angleDiffToFood > Math.PI) angleDiffToFood -= 2 * Math.PI;
				while (angleDiffToFood < -Math.PI) angleDiffToFood += 2 * Math.PI;
				targetDir += angleDiffToFood * seekStrength;
				// Ensure minimum speed when seeking food
				if (targetSpeed < 0.3) targetSpeed = 0.3;
				speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 1.5);
			}
		}
```

Logic:
1. Only activates when `BRAIN.stimulate.foodNearby` is true (set in `update()` when food within 50px) AND `BRAIN.drives.hunger > 0.3`
2. Computes angle from fly to nearest food using `Math.atan2(-(dy), dx)` (negated Y because canvas Y is inverted relative to math Y, matching the existing `fly.y -= Math.sin(facingDir) * speed` convention)
3. `seekStrength` scales with hunger intensity, capped at 0.6 to allow the brain's own steering to remain partially in control
4. The angle difference to food is normalized to [-PI, PI], then blended into targetDir
5. Ensures minimum speed of 0.3 so the fly actually moves toward food

#### G. Gradual Feeding in update()

Replace the instant food removal in `update()` with gradual feeding.

Anchor -- lines 1054-1068 in the food proximity loop:
```js
	BRAIN.stimulate.foodContact = false;
	BRAIN.stimulate.foodNearby = false;
	for (var i = 0; i < food.length; i++) {
		var dist = Math.hypot(fly.x - food[i].x, fly.y - food[i].y);
		if (dist <= 50) {
			BRAIN.stimulate.foodNearby = true;
			if (dist <= 20) {
				BRAIN.stimulate.foodContact = true;
				if (behavior.current === 'feed') {
					food.splice(i, 1);
					i--;
				}
			}
		}
	}
```
Replace with:
```js
	BRAIN.stimulate.foodContact = false;
	BRAIN.stimulate.foodNearby = false;
	for (var i = 0; i < food.length; i++) {
		var dist = Math.hypot(fly.x - food[i].x, fly.y - food[i].y);
		if (dist <= 50) {
			BRAIN.stimulate.foodNearby = true;
			if (dist <= 20) {
				BRAIN.stimulate.foodContact = true;
				if (behavior.current === 'feed') {
					// Gradual feeding: start timer on first contact, shrink food, remove when done
					if (food[i].feedStart === 0) {
						food[i].feedStart = Date.now();
						food[i].feedDuration = 2000 + Math.random() * 3000;
					}
					var elapsed = Date.now() - food[i].feedStart;
					var progress = Math.min(1, elapsed / food[i].feedDuration);
					food[i].radius = 10 * (1 - progress * 0.9);
					if (progress >= 1) {
						food.splice(i, 1);
						i--;
					}
				}
			} else {
				// Not in contact range: reset feeding progress if fly walked away
				if (food[i].feedStart !== 0) {
					food[i].feedStart = 0;
					food[i].radius = 10;
				}
			}
		} else {
			// Out of range: reset feeding progress
			if (food[i].feedStart !== 0) {
				food[i].feedStart = 0;
				food[i].radius = 10;
			}
		}
	}
```

Logic:
1. When the fly is in `feed` state and within 20px of a food item, if `feedStart === 0`, initialize it to `Date.now()` and set a random duration between 2000-5000ms
2. Compute progress as `elapsed / feedDuration`, clamped to [0, 1]
3. Shrink `food[i].radius` from 10 down to 1 (using `10 * (1 - progress * 0.9)` so it doesn't fully vanish until splice)
4. When `progress >= 1`, splice the food item (removal)
5. If the fly moves away (dist > 20 but feedStart was set), reset feedStart and radius so feeding restarts if the fly returns

#### H. Update drawFood() for Visual Effects

Replace the existing `drawFood()` function (lines 486-493):

Anchor:
```js
function drawFood() {
	for (var i = 0; i < food.length; i++) {
		ctx.beginPath();
		ctx.arc(food[i].x, food[i].y, 10, 0, Math.PI * 2);
		ctx.fillStyle = 'rgb(251,192,45)';
		ctx.fill();
	}
}
```
Replace with:
```js
function drawFood() {
	var t = Date.now();
	for (var i = 0; i < food.length; i++) {
		var f = food[i];
		var distToFly = Math.hypot(fly.x - f.x, fly.y - f.y);

		// Approach glow: subtle pulsing glow when fly is within 50px
		if (distToFly <= 50) {
			var pulse = 0.3 + Math.sin(t / 200) * 0.15;
			ctx.beginPath();
			ctx.arc(f.x, f.y, f.radius + 6, 0, Math.PI * 2);
			ctx.fillStyle = 'rgba(251, 192, 45, ' + pulse.toFixed(2) + ')';
			ctx.fill();
		}

		// Food circle (uses dynamic radius for gradual feeding shrink)
		ctx.beginPath();
		ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
		ctx.fillStyle = 'rgb(251,192,45)';
		ctx.fill();
	}
}
```

Logic:
1. Check distance from fly to each food item
2. If within 50px, draw a larger circle behind the food with pulsing opacity (`0.15` to `0.45` range using sin wave at ~5Hz)
3. Draw the food circle using `f.radius` (dynamic -- shrinks during feeding, defaults to 10)

#### I. New Drawing Functions for Ripples and Wind Arrow

Add two new drawing functions immediately after the updated `drawFood()` function:

```js
/**
 * Draws expanding ripple effects at touch-tool click points.
 * Ripples expand from 0 to 30px radius over 500ms, fading out.
 */
function drawRipples() {
	var now = Date.now();
	for (var i = ripples.length - 1; i >= 0; i--) {
		var r = ripples[i];
		var elapsed = now - r.startTime;
		if (elapsed > 500) {
			ripples.splice(i, 1);
			continue;
		}
		var progress = elapsed / 500;
		var radius = progress * 30;
		var alpha = 1 - progress;
		ctx.beginPath();
		ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
		ctx.strokeStyle = 'rgba(227, 115, 75, ' + alpha.toFixed(2) + ')';
		ctx.lineWidth = 2 * (1 - progress);
		ctx.stroke();
	}
}

/**
 * Draws a wind direction arrow when the air tool is being dragged.
 * Arrow points from dragStart to current mouse position.
 */
function drawWindArrow() {
	if (!isDragging || activeTool !== 'air' || !windArrowEnd) return;
	var dx = windArrowEnd.x - dragStart.x;
	var dy = windArrowEnd.y - dragStart.y;
	var dist = Math.sqrt(dx * dx + dy * dy);
	if (dist < 5) return;

	var alpha = Math.min(0.7, dist / 150);

	// Shaft
	ctx.beginPath();
	ctx.moveTo(dragStart.x, dragStart.y);
	ctx.lineTo(windArrowEnd.x, windArrowEnd.y);
	ctx.strokeStyle = 'rgba(200, 210, 230, ' + alpha.toFixed(2) + ')';
	ctx.lineWidth = 2;
	ctx.stroke();

	// Arrowhead
	var angle = Math.atan2(dy, dx);
	var headLen = 10;
	ctx.beginPath();
	ctx.moveTo(windArrowEnd.x, windArrowEnd.y);
	ctx.lineTo(
		windArrowEnd.x - Math.cos(angle - 0.4) * headLen,
		windArrowEnd.y - Math.sin(angle - 0.4) * headLen
	);
	ctx.moveTo(windArrowEnd.x, windArrowEnd.y);
	ctx.lineTo(
		windArrowEnd.x - Math.cos(angle + 0.4) * headLen,
		windArrowEnd.y - Math.sin(angle + 0.4) * headLen
	);
	ctx.strokeStyle = 'rgba(200, 210, 230, ' + alpha.toFixed(2) + ')';
	ctx.lineWidth = 2;
	ctx.stroke();
}
```

#### J. Wire New Draw Functions into draw()

In the `draw()` function, add calls to the new drawing functions.

Anchor -- lines 1092-1093 in `draw()`:
```js
	ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
	drawFood();
```
Replace with:
```js
	ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
	drawFood();
	drawRipples();
	drawWindArrow();
```

The order matters: food is drawn first, then ripples and wind arrow on top, then the fly on top of everything.

#### K. Wire Groom Drive Meter in updateBrain()

In `updateBrain()`, add groom drive meter update.

Anchor -- lines 154-161 in `updateBrain()`:
```js
	var driveHungerEl = document.getElementById('driveHunger');
	var driveFearEl = document.getElementById('driveFear');
	var driveFatigueEl = document.getElementById('driveFatigue');
	var driveCuriosityEl = document.getElementById('driveCuriosity');
	if (driveHungerEl) driveHungerEl.style.width = (BRAIN.drives.hunger * 100) + '%';
	if (driveFearEl) driveFearEl.style.width = (BRAIN.drives.fear * 100) + '%';
	if (driveFatigueEl) driveFatigueEl.style.width = (BRAIN.drives.fatigue * 100) + '%';
	if (driveCuriosityEl) driveCuriosityEl.style.width = (BRAIN.drives.curiosity * 100) + '%';
```
Replace with:
```js
	var driveHungerEl = document.getElementById('driveHunger');
	var driveFearEl = document.getElementById('driveFear');
	var driveFatigueEl = document.getElementById('driveFatigue');
	var driveCuriosityEl = document.getElementById('driveCuriosity');
	var driveGroomEl = document.getElementById('driveGroom');
	if (driveHungerEl) driveHungerEl.style.width = (BRAIN.drives.hunger * 100) + '%';
	if (driveFearEl) driveFearEl.style.width = (BRAIN.drives.fear * 100) + '%';
	if (driveFatigueEl) driveFatigueEl.style.width = (BRAIN.drives.fatigue * 100) + '%';
	if (driveCuriosityEl) driveCuriosityEl.style.width = (BRAIN.drives.curiosity * 100) + '%';
	if (driveGroomEl) driveGroomEl.style.width = (BRAIN.drives.groom * 100) + '%';
```

---

## Verification
- build: No build step. Open `index.html` in a browser.
- lint: No linter configured.
- test: No existing tests.
- smoke: Perform the following manual checks in a browser:
  1. **Food-seeking**: Click the Feed tool, place food ~100px from the fly. Wait for hunger to rise above 0.3 (watch the hunger meter). The fly should orient and walk toward the food instead of wandering randomly.
  2. **Gradual feeding**: When the fly reaches food and enters feed state, the food circle should visibly shrink over 2-5 seconds before disappearing. The proboscis should be extended during this time.
  3. **Touch ripple**: Select the Touch tool, click on or near the canvas. A small orange expanding ring should appear at the click point and fade out over ~0.5 seconds.
  4. **Wind arrow**: Select the Air tool, click and drag on the canvas. A translucent arrow should appear from the drag start to the current mouse position, disappearing on mouse release.
  5. **Food approach glow**: Place food, wait for the fly to approach within 50px. The food should show a subtle pulsing glow behind it.
  6. **Groom drive meter**: The bottom panel should now show 5 drive meters (Hunger, Fear, Fatigue, Curiosity, Groom). The Groom bar should be orange (`var(--accent)` = #E3734B) and update every 500ms brain tick.

## Constraints
- Do NOT modify `js/connectome.js` or `js/constants.js` -- all changes are in `js/main.js`, `css/main.css`, and `index.html` only
- Do NOT change the brain tick interval (500ms `setInterval`) or the RAF loop structure
- Do NOT change the `BRAIN.stimulate.*` or `BRAIN.drives.*` interfaces in connectome.js
- Do NOT add any external dependencies, images, or build steps
- The food-seeking bias must only activate when BOTH `BRAIN.stimulate.foodNearby` is true AND `BRAIN.drives.hunger > 0.3` -- never unconditionally
- Food `feedStart` must reset to 0 if the fly moves away from the food (dist > 20) so feeding restarts from zero if the fly returns
- Ripples array must be cleaned up (spliced) after 500ms to prevent unbounded growth
- The `windArrowEnd` variable must be set to `null` in `handleCanvasMouseup` to stop drawing the arrow after drag ends
- All colors must use existing CSS custom properties or the exact values already in the codebase (e.g., food color `rgb(251,192,45)`, accent `rgba(227, 115, 75, ...)`)
- The bottom panel height (90px) must NOT change -- adding the 5th drive row must fit within the existing layout (the existing `gap: 0.4rem` and `justify-content: center` in `#drive-meters` will accommodate it)
