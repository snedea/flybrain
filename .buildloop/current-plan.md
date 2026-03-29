# Plan: T13.2

Fly boundary constraints and off-screen recovery. Replace the existing hard-clamp boundary system with soft steering forces, cap flight landing positions, and add teleport recovery for far-off-screen situations.

## Dependencies
- list: none (vanilla JS, no packages)
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Replace hard-clamp boundary enforcement with soft steering, add flight landing cap, add teleport recovery, update resize handler

There are 4 changes to make in this file, detailed below as Change A through Change D.

---

#### Change A: Add boundary constants after the zoom/pan constants block

- anchor: `var pinchStartZoom = 1;` (line 47)

Insert the following constants immediately after line 50 (`var panStartOffset = { x: 0, y: 0 };`):

```js
// --- Boundary enforcement ---
var BOUNDARY_PADDING = 20;
var BOUNDARY_TELEPORT_THRESHOLD = 200;
var BOUNDARY_STEER_STRENGTH = 0.25;
```

- `BOUNDARY_PADDING`: 20px inset from canvas edges (world coordinates) defining the soft boundary zone
- `BOUNDARY_TELEPORT_THRESHOLD`: if fly exceeds boundary by more than 200px, teleport to near center
- `BOUNDARY_STEER_STRENGTH`: multiplier for the steering force applied when fly is in the boundary margin (0.25 gives a gentle curve back inward)

---

#### Change B: Add `getWorldBounds()` helper function and `clampToWorldBounds(x, y)` helper function

- anchor: `function getLayoutBounds() {` (line 79)

Insert TWO new functions immediately BEFORE `getLayoutBounds()` (i.e., between line 78 `}` closing `isMobile()` and line 79 `function getLayoutBounds()`):

##### Function 1: `getWorldBounds()`
- signature: `function getWorldBounds()`
- purpose: Compute the fly's allowed bounding box in world coordinates, accounting for zoom/pan viewport and UI chrome with BOUNDARY_PADDING inset
- logic:
  1. Call `getLayoutBounds()` to get `bounds` (screen-space bounds accounting for toolbar and panel)
  2. Convert all four corners of the screen-space layout bounds to world coordinates using `screenToWorld()`:
     - `var topLeft = screenToWorld(bounds.left, bounds.top);`
     - `var bottomRight = screenToWorld(bounds.right, bounds.bottom);`
  3. Return an object with BOUNDARY_PADDING applied inward:
     ```js
     return {
       left: topLeft.x + BOUNDARY_PADDING,
       right: bottomRight.x - BOUNDARY_PADDING,
       top: topLeft.y + BOUNDARY_PADDING,
       bottom: bottomRight.y - BOUNDARY_PADDING
     };
     ```
- returns: `{ left: number, top: number, right: number, bottom: number }` in world coordinates

##### Function 2: `clampToWorldBounds(x, y)`
- signature: `function clampToWorldBounds(x, y)`
- purpose: Hard-clamp a position to within the world bounds (used for flight landing and teleport target)
- logic:
  1. Call `var wb = getWorldBounds();`
  2. Return `{ x: Math.max(wb.left, Math.min(x, wb.right)), y: Math.max(wb.top, Math.min(y, wb.bottom)) }`
- returns: `{ x: number, y: number }`

---

#### Change C: Replace the edge avoidance + hard clamp block in `update()` with soft boundary steering, flight landing cap, and teleport recovery

- anchor: The existing edge avoidance block starts at line 1887 with the comment `// Edge avoidance: bias targetDir away from screen edges when within 50px` and ends at line 1959 with the closing `}` of the `fly.y > window.innerHeight` clamp.

**DELETE** the entire block from line 1887 (`// Edge avoidance: bias targetDir away from screen edges when within 50px`) through line 1959 (the closing `}` of the last `fly.y > window.innerHeight` else-if block). This is the block that:
- Computes `edgeMargin`, `edgeBias`, `edgeBiasY` using screen-space `getLayoutBounds()`
- Applies `awayAngle` steering
- Hard clamps `fly.x` to `[0, window.innerWidth]` and `fly.y` to `[44, window.innerHeight]`
- Sets `BRAIN.stimulate.touch = true` on wall contact

**REPLACE** with the following code (insert at the same location, after `if (speed < 0) speed = 0;`):

```js
	// --- Soft boundary enforcement (world-space) ---
	var wb = getWorldBounds();
	var edgeMargin = 50;
	var edgeBiasX = 0;
	var edgeBiasY = 0;

	if (fly.x < wb.left + edgeMargin) {
		edgeBiasX = (edgeMargin - (fly.x - wb.left)) / edgeMargin;
	} else if (fly.x > wb.right - edgeMargin) {
		edgeBiasX = -(edgeMargin - (wb.right - fly.x)) / edgeMargin;
	}
	if (fly.y < wb.top + edgeMargin) {
		edgeBiasY = -(edgeMargin - (fly.y - wb.top)) / edgeMargin;
	} else if (fly.y > wb.bottom - edgeMargin) {
		edgeBiasY = (edgeMargin - (wb.bottom - fly.y)) / edgeMargin;
	}

	if (edgeBiasX !== 0 || edgeBiasY !== 0) {
		var awayAngle = Math.atan2(edgeBiasY, edgeBiasX);
		var awayStrength = Math.min(1, Math.sqrt(edgeBiasX * edgeBiasX + edgeBiasY * edgeBiasY));
		var angleDiffEdge = normalizeAngle(awayAngle - targetDir);
		targetDir += angleDiffEdge * awayStrength * BOUNDARY_STEER_STRENGTH * dtScale;
	}
```

Then, after the turn retention / facingDir interpolation block (which follows immediately -- the code starting with `var turnRetention;` through `targetDir = normalizeAngle(targetDir);` at line 1936), and after the position update lines:
```js
	fly.x += Math.cos(facingDir) * speed * dtScale;
	fly.y -= Math.sin(facingDir) * speed * dtScale;
```

**DELETE** the old hard-clamp block (the `// Screen bounds (clamped to visible area...` block from lines 1941-1959).

**REPLACE** with the following three sections:

##### Section 1: Soft clamp with touch stimulus (safety net)
```js
	// Soft boundary: if fly drifts past the world bounds, gently push back
	// and fire touch stimulus as a safety net
	if (fly.x < wb.left) {
		fly.x += (wb.left - fly.x) * 0.1 * dtScale;
		BRAIN.stimulate.touch = true;
		touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
	} else if (fly.x > wb.right) {
		fly.x -= (fly.x - wb.right) * 0.1 * dtScale;
		BRAIN.stimulate.touch = true;
		touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
	}
	if (fly.y < wb.top) {
		fly.y += (wb.top - fly.y) * 0.1 * dtScale;
		BRAIN.stimulate.touch = true;
		touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
	} else if (fly.y > wb.bottom) {
		fly.y -= (fly.y - wb.bottom) * 0.1 * dtScale;
		BRAIN.stimulate.touch = true;
		touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
	}
```

##### Section 2: Teleport recovery for far off-screen
```js
	// Teleport recovery: if fly is far off-screen (> 200px beyond bounds), snap to near center
	if (fly.x < wb.left - BOUNDARY_TELEPORT_THRESHOLD ||
		fly.x > wb.right + BOUNDARY_TELEPORT_THRESHOLD ||
		fly.y < wb.top - BOUNDARY_TELEPORT_THRESHOLD ||
		fly.y > wb.bottom + BOUNDARY_TELEPORT_THRESHOLD) {
		var centerX = (wb.left + wb.right) / 2;
		var centerY = (wb.top + wb.bottom) / 2;
		fly.x = centerX + (Math.random() - 0.5) * 100;
		fly.y = centerY + (Math.random() - 0.5) * 100;
		speed = 0;
		targetSpeed = 0;
		speedChangeInterval = 0;
	}
```

**Note**: The teleport check MUST come AFTER the soft clamp section, so the soft clamp gets a chance to act first on moderate violations. Only extreme violations (> 200px) trigger teleport.

---

#### Change D: Cap flight landing position in `computeMovementForBehavior()`

- anchor: The `fly` state branch at line 1083: `} else if (state === 'fly') {`

The existing code for the `fly` state (lines 1083-1088):
```js
	} else if (state === 'fly') {
		var newDir = (BRAIN.accumleft - BRAIN.accumright) / scalingFactor;
		targetDir = facingDir + newDir * Math.PI + (Math.random() - 0.5) * 0.2;
		targetSpeed = ((Math.abs(BRAIN.accumleft) + Math.abs(BRAIN.accumright)) / (scalingFactor * 5)) * 2.5;
		if (targetSpeed < 1.5) targetSpeed = 1.5;
		speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 0.5);
```

**ADD** the following lines immediately after `speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 0.5);` and before the next `} else if`:

```js
		// Cap flight direction: if current trajectory would land outside bounds,
		// bias targetDir toward center of world bounds
		var flightDist = targetSpeed * 60; // approximate landing distance (60 frames of flight)
		var landX = fly.x + Math.cos(targetDir) * flightDist;
		var landY = fly.y - Math.sin(targetDir) * flightDist;
		var clamped = clampToWorldBounds(landX, landY);
		if (clamped.x !== landX || clamped.y !== landY) {
			var safeAngle = Math.atan2(-(clamped.y - fly.y), clamped.x - fly.x);
			targetDir = safeAngle;
		}
```

This computes where the fly would land at its current flight trajectory (approx 60 frames ~ 1 second of flight at targetSpeed), and if that projected landing is outside bounds, redirects the targetDir toward the clamped (in-bounds) position.

---

#### Change E: Update the startle burst direction in `applyBehaviorMovement()` to stay in bounds

- anchor: line 1143: `behavior.burstDir = normalizeAngle(facingDir + Math.PI + (Math.random() - 0.5) * 0.5);`

**REPLACE** lines 1142-1146 (the burst initialization block inside the `if (now >= behavior.startleFreezeEnd)` branch):
```js
				behavior.startlePhase = 'burst';
				speed = 3.0;
				behavior.burstDir = normalizeAngle(facingDir + Math.PI + (Math.random() - 0.5) * 0.5);
				targetDir = behavior.burstDir;
				facingDir = behavior.burstDir;
```

**WITH**:
```js
				behavior.startlePhase = 'burst';
				speed = 3.0;
				var candidateBurstDir = normalizeAngle(facingDir + Math.PI + (Math.random() - 0.5) * 0.5);
				// If burst direction would send fly off-screen, redirect toward center
				var burstDist = 3.0 * 30; // approximate burst travel (speed * ~30 frames)
				var burstLandX = fly.x + Math.cos(candidateBurstDir) * burstDist;
				var burstLandY = fly.y - Math.sin(candidateBurstDir) * burstDist;
				var burstClamped = clampToWorldBounds(burstLandX, burstLandY);
				if (burstClamped.x !== burstLandX || burstClamped.y !== burstLandY) {
					candidateBurstDir = Math.atan2(-(burstClamped.y - fly.y), burstClamped.x - fly.x);
				}
				behavior.burstDir = candidateBurstDir;
				targetDir = behavior.burstDir;
				facingDir = behavior.burstDir;
```

---

#### Change F: Update the resize handler to use `getWorldBounds()` for fly re-clamping

- anchor: line 2120: `// Also re-clamp the fly position to the new bounds`

**REPLACE** lines 2121-2122:
```js
	fly.x = Math.max(0, Math.min(fly.x, window.innerWidth));
	fly.y = Math.max(getLayoutBounds().top, Math.min(fly.y, window.innerHeight));
```

**WITH**:
```js
	var resizeWb = getWorldBounds();
	fly.x = Math.max(resizeWb.left, Math.min(fly.x, resizeWb.right));
	fly.y = Math.max(resizeWb.top, Math.min(fly.y, resizeWb.bottom));
```

Also update the food and water drop clamping in the same resize handler (lines 2112-2118) to use world bounds for consistency:

**REPLACE** lines 2110-2118:
```js
	// Clamp food positions to current visible bounds so food items
	// near old edges don't become unreachable after window shrinks
	for (var i = 0; i < food.length; i++) {
		food[i].x = Math.max(0, Math.min(food[i].x, window.innerWidth));
		food[i].y = Math.max(getLayoutBounds().top, Math.min(food[i].y, window.innerHeight));
	}
	for (var i = 0; i < waterDrops.length; i++) {
		waterDrops[i].x = Math.max(0, Math.min(waterDrops[i].x, window.innerWidth));
		waterDrops[i].y = Math.max(getLayoutBounds().top, Math.min(waterDrops[i].y, window.innerHeight));
	}
```

**WITH**:
```js
	// Clamp food, water, and fly positions to world bounds so entities
	// near old edges don't become unreachable after window shrinks
	var resizeWb = getWorldBounds();
	for (var i = 0; i < food.length; i++) {
		food[i].x = Math.max(resizeWb.left, Math.min(food[i].x, resizeWb.right));
		food[i].y = Math.max(resizeWb.top, Math.min(food[i].y, resizeWb.bottom));
	}
	for (var i = 0; i < waterDrops.length; i++) {
		waterDrops[i].x = Math.max(resizeWb.left, Math.min(waterDrops[i].x, resizeWb.right));
		waterDrops[i].y = Math.max(resizeWb.top, Math.min(waterDrops[i].y, resizeWb.bottom));
	}
```

(Note: after this replacement, the `resizeWb` variable is already declared for the food/water block. The fly clamping lines that follow can reuse it -- but since they are a separate replacement, just use the same `var resizeWb = getWorldBounds();` declaration. To avoid a duplicate `var resizeWb`, combine both replacements into a single block: declare `var resizeWb = getWorldBounds();` once, then clamp food, water, and fly using it.)

**Combined replacement for lines 2110-2122**:
```js
	// Clamp food, water, and fly positions to world bounds so entities
	// near old edges don't become unreachable after window shrinks
	var resizeWb = getWorldBounds();
	for (var i = 0; i < food.length; i++) {
		food[i].x = Math.max(resizeWb.left, Math.min(food[i].x, resizeWb.right));
		food[i].y = Math.max(resizeWb.top, Math.min(food[i].y, resizeWb.bottom));
	}
	for (var i = 0; i < waterDrops.length; i++) {
		waterDrops[i].x = Math.max(resizeWb.left, Math.min(waterDrops[i].x, resizeWb.right));
		waterDrops[i].y = Math.max(resizeWb.top, Math.min(waterDrops[i].y, resizeWb.bottom));
	}
	// Also re-clamp the fly position to the new bounds
	fly.x = Math.max(resizeWb.left, Math.min(fly.x, resizeWb.right));
	fly.y = Math.max(resizeWb.top, Math.min(fly.y, resizeWb.bottom));
```

---

#### Change G: Update the `centerButton` handler to use world bounds center

- anchor: line 14: `document.getElementById('centerButton').onclick = function () {`

**REPLACE** lines 15-16:
```js
	fly.x = window.innerWidth / 2;
	fly.y = window.innerHeight / 2;
```

**WITH**:
```js
	var cwb = getWorldBounds();
	fly.x = (cwb.left + cwb.right) / 2;
	fly.y = (cwb.top + cwb.bottom) / 2;
```

**Wait** -- `getWorldBounds()` calls `getLayoutBounds()` which calls `document.getElementById('toolbar')` etc. These exist by the time the button is clicked (the button itself is in the DOM). And the center button also resets zoom/pan to 0/1, which means screenToWorld will map to identity. At zoom=1, panX=0, panY=0, `screenToWorld(0, topH)` returns `(0, topH)` and `screenToWorld(innerWidth, innerHeight)` returns `(innerWidth, innerHeight)`. So the world bounds center will be `(innerWidth/2, (topH + BOUNDARY_PADDING + innerHeight - BOUNDARY_PADDING) / 2)`. That's close to the current behavior but accounts for toolbar correctly.

Actually, the center button sets zoom=1, panX=0, panY=0 AFTER setting fly position. The fly position should be set after resetting zoom/pan so the world bounds computation is correct. **Reorder**: set zoom/pan first, then set fly position.

**REPLACE** lines 14-20:
```js
document.getElementById('centerButton').onclick = function () {
	fly.x = window.innerWidth / 2;
	fly.y = window.innerHeight / 2;
	zoomLevel = 1;
	panX = 0;
	panY = 0;
};
```

**WITH**:
```js
document.getElementById('centerButton').onclick = function () {
	zoomLevel = 1;
	panX = 0;
	panY = 0;
	var cwb = getWorldBounds();
	fly.x = (cwb.left + cwb.right) / 2;
	fly.y = (cwb.top + cwb.bottom) / 2;
};
```

---

## Summary of all edits in js/main.js (execution order)

1. **Change G** (line 14-20): Reorder centerButton handler -- reset zoom/pan before setting fly position, use getWorldBounds() center
2. **Change A** (after line 50): Insert BOUNDARY_PADDING, BOUNDARY_TELEPORT_THRESHOLD, BOUNDARY_STEER_STRENGTH constants
3. **Change B** (before line 79): Insert getWorldBounds() and clampToWorldBounds() functions
4. **Change E** (line 1141-1146): Replace startle burst direction with bounds-aware version
5. **Change D** (after line 1088): Add flight landing cap in computeMovementForBehavior fly state
6. **Change C** (lines 1887-1959): Replace entire edge avoidance + hard clamp block with soft boundary steering, soft clamp safety net, and teleport recovery
7. **Change F** (lines 2110-2122): Replace resize handler clamping with getWorldBounds()-based clamping

## Verification
- build: No build step. Open `index.html` in a browser.
- lint: `grep -n "getWorldBounds\|clampToWorldBounds\|BOUNDARY_PADDING\|BOUNDARY_TELEPORT_THRESHOLD\|BOUNDARY_STEER_STRENGTH" js/main.js` -- verify all new symbols appear at their expected locations
- test: Open the page in a browser console and run: `getWorldBounds()` -- should return an object with left, right, top, bottom properties where left < right and top < bottom. Run `clampToWorldBounds(-1000, -1000)` -- should return `{x: <wb.left>, y: <wb.top>}`.
- smoke:
  1. Load the page. Let the fly walk around. It should never walk off-screen. When approaching edges, it should gently curve back inward (no visible "bounce" off a wall).
  2. Trigger a startle (touch tool + click on fly). The fly should jump/fly but land within the visible canvas area.
  3. Open browser console. Run `fly.x = -500; fly.y = -500;` -- the fly should teleport to near the center within 1-2 frames.
  4. Open browser console. Run `fly.x = getWorldBounds().right + 50;` -- the fly should gently drift back into bounds (not teleport, since 50 < 200 threshold).
  5. Resize the browser window smaller. The fly should be re-clamped to the new bounds.
  6. Zoom in (use zoom controls). Trigger a startle. The fly should still land within the visible viewport area (world bounds adjust with zoom).

## Constraints
- Do NOT modify any file other than `js/main.js`
- Do NOT use `let` or `const` -- the codebase uses `var` exclusively (ES5 style)
- Do NOT add new dependencies or imports
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any .buildloop/ file other than current-plan.md
- Do NOT remove the `touchResetTime` stimulus when the fly contacts a boundary -- keep this behavior as it triggers realistic startle/avoidance responses
- The `getWorldBounds()` function must be defined BEFORE `getLayoutBounds()` is not needed -- actually it calls `getLayoutBounds()`, so it must be defined AFTER `getLayoutBounds()`. **Correction**: place `getWorldBounds()` and `clampToWorldBounds()` immediately AFTER the closing `}` of `getLayoutBounds()` (after line 95), not before it. This ensures `getLayoutBounds()` is hoisted/available. (In ES5 with function declarations, hoisting would handle this, but for clarity and consistency with the codebase style, define them after `getLayoutBounds()`.)
