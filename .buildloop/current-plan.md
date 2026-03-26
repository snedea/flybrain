# Plan: D1.1

Fix movement timing and angle-wrapping bugs in update().

Four bugs, one file: `js/main.js`.

## Dependencies
- list: []
- commands: []

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Fix all 4 bugs: first-frame speed burst, unbounded angle growth, frame-rate-dependent edge avoidance, frame-rate-dependent deceleration

---

#### Bug 1: First-frame speed burst (lastTime initialized to 0)

**Problem:** `var lastTime = 0;` at line 1392 means the first RAF callback computes `dt = timestamp - 0`, which equals the full elapsed time since page load. Even with the 100ms clamp, dtScale is ~6, producing a visible jump.

**Fix:** Set `lastTime = timestamp` on the first frame, then skip update() for that frame.

- anchor: `var lastTime = 0;`

**Changes at line 1392:**
Replace:
```js
var lastTime = 0;
function loop(timestamp) {
	var dt = timestamp - lastTime;
	lastTime = timestamp;
	// Clamp dt to 100ms to prevent huge jumps after tab-backgrounding
	if (dt > 100) dt = 100;
	update(dt);
	draw();
	requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```
With:
```js
var lastTime = -1;
function loop(timestamp) {
	if (lastTime < 0) {
		lastTime = timestamp;
		draw();
		requestAnimationFrame(loop);
		return;
	}
	var dt = timestamp - lastTime;
	lastTime = timestamp;
	// Clamp dt to 100ms to prevent huge jumps after tab-backgrounding
	if (dt > 100) dt = 100;
	update(dt);
	draw();
	requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```

**Logic:**
1. Initialize `lastTime` to `-1` (sentinel value meaning "not yet set").
2. On the first call to `loop(timestamp)`, check `if (lastTime < 0)`.
3. If true: set `lastTime = timestamp`, call `draw()` only (so the fly is visible immediately but does not move), request next frame, and `return` early (skipping `update()`).
4. On all subsequent calls, proceed as before: compute `dt = timestamp - lastTime`, clamp, update, draw.

---

#### Bug 2: Unbounded facingDir and targetDir growth

**Problem:** `facingDir` and `targetDir` are modified throughout the code (lines 1234-1236 for facingDir, lines 468/472/485/495/501/511/539/1267 for targetDir) but never normalized. Over long sessions, their magnitudes grow without bound, degrading floating-point precision.

**Fix:** Add a `normalizeAngle` helper function near the top of the file, then normalize both `facingDir` and `targetDir` once per frame inside `update()`, after all modifications are complete but before position update.

##### Helper function

- anchor: `var wallTouchResetFrame = 0;` (line 26)

**Insert AFTER line 26 (after the `wallTouchResetFrame` declaration), BEFORE line 28 (`// Visual feedback effects`):**
```js

// Normalize angle to [-PI, PI] range
function normalizeAngle(a) {
	a = a % (2 * Math.PI);
	if (a > Math.PI) a -= 2 * Math.PI;
	if (a < -Math.PI) a += 2 * Math.PI;
	return a;
}
```

**Logic:**
1. Use modulo to bring the angle into the (-2PI, 2PI) range.
2. If the result is greater than PI, subtract 2PI.
3. If less than -PI, add 2PI.
4. Return the normalized value.

##### Normalize both angles in update()

- anchor: `targetDir += angleDiffEdge * awayStrength * 0.3;` (line 1267)

**Insert two normalization lines AFTER line 1268 (`}` closing the `if (edgeBias !== 0 || edgeBiasY !== 0)` block), BEFORE line 1270 (`fly.x += Math.cos(facingDir) * speed;`).**

Insert these exact lines between the closing `}` of the edge avoidance block and the `fly.x +=` line:
```js

	// Normalize angles to [-PI, PI] to prevent unbounded growth
	facingDir = normalizeAngle(facingDir);
	targetDir = normalizeAngle(targetDir);
```

The resulting code sequence should be:
```js
		targetDir += angleDiffEdge * awayStrength * 0.3;
	}

	// Normalize angles to [-PI, PI] to prevent unbounded growth
	facingDir = normalizeAngle(facingDir);
	targetDir = normalizeAngle(targetDir);

	fly.x += Math.cos(facingDir) * speed;
	fly.y -= Math.sin(facingDir) * speed;
```

---

#### Bug 3: Frame-rate-dependent edge avoidance

**Problem:** Line 1267: `targetDir += angleDiffEdge * awayStrength * 0.3;` is applied once per frame without dt scaling. At 120fps this applies twice per 60fps-equivalent interval, doubling the bias strength.

**Fix:** Multiply by `dtScale`. The `dtScale` variable is already computed at line 1219 (`var dtScale = dt / (1000 / 60);`), but it is local to `update()` so it is accessible at line 1267.

- anchor: `targetDir += angleDiffEdge * awayStrength * 0.3;`

**Replace line 1267:**
```js
		targetDir += angleDiffEdge * awayStrength * 0.3;
```
With:
```js
		targetDir += angleDiffEdge * awayStrength * 0.3 * dtScale;
```

---

#### Bug 4: Frame-rate-dependent deceleration

**Problem:** Line 549: `speed *= 0.92;` is applied once per frame in `applyBehaviorMovement()`. At 120fps it applies twice per 60fps interval: `0.92^2 = 0.8464`, much faster deceleration than intended `0.92`.

**Fix:** Convert the per-frame exponential decay to a dt-scaled version. The formula `speed *= factor^(dtScale)` preserves the same decay rate regardless of frame rate. However, `applyBehaviorMovement()` does not currently receive `dt` as a parameter. We need to pass `dt` to it.

##### Step 1: Change function signature

- anchor: `function applyBehaviorMovement() {` (line 530)

**Replace:**
```js
function applyBehaviorMovement() {
```
With:
```js
function applyBehaviorMovement(dtScale) {
```

##### Step 2: Change the call site

- anchor: `applyBehaviorMovement();` (line 1217, inside `update(dt)`)

**Replace:**
```js
	applyBehaviorMovement();
```
With:
```js
	applyBehaviorMovement(dtScale);
```

**But wait** -- `dtScale` is computed at line 1219, AFTER the call at line 1217. We need to move the `dtScale` computation before the call.

**The actual change in update():** Replace lines 1217-1220:
```js
	applyBehaviorMovement();

	var dtScale = dt / (1000 / 60);
	speed += speedChangeInterval * dtScale;
```
With:
```js
	var dtScale = dt / (1000 / 60);
	applyBehaviorMovement(dtScale);

	speed += speedChangeInterval * dtScale;
```

##### Step 3: Apply dt-scaled deceleration

- anchor: `speed *= 0.92;` (line 549)

**Replace:**
```js
			speed *= 0.92;
```
With:
```js
			speed *= Math.pow(0.92, dtScale);
```

**Logic:** `Math.pow(0.92, dtScale)` produces:
- dtScale=1 (60fps): `0.92^1 = 0.92` (same as before)
- dtScale=0.5 (120fps): `0.92^0.5 = 0.9592` (less decay per frame, but applied twice = 0.92)
- dtScale=2 (30fps): `0.92^2 = 0.8464` (more decay per frame, compensating for fewer frames)

---

## Execution Order Summary

Apply changes in this exact order to avoid line-number conflicts:

1. **Insert `normalizeAngle` helper** after line 26 (top of file, before `// Visual feedback effects`). This is an insertion only, no deletions.

2. **Modify `applyBehaviorMovement` signature** at line 530: add `dtScale` parameter.

3. **Modify deceleration** at line 549: change `speed *= 0.92` to `speed *= Math.pow(0.92, dtScale)`.

4. **Modify `update()` function** starting at line 1216:
   a. Move `dtScale` computation before `applyBehaviorMovement()` call (reorder lines 1217-1220).
   b. Pass `dtScale` to `applyBehaviorMovement(dtScale)`.

5. **Modify edge avoidance** at line 1267: multiply by `dtScale`.

6. **Insert angle normalization** between the edge avoidance block's closing `}` and the `fly.x +=` line.

7. **Modify RAF loop** at lines 1392-1402: change `lastTime = 0` to `lastTime = -1`, add first-frame guard.

## Verification
- build: no build step (vanilla JS, open index.html in browser)
- lint: no linter configured
- test: no existing tests
- smoke: open `index.html` in a browser. Verify: (1) the fly does NOT jump/burst on initial page load -- it should start moving smoothly from a standstill, (2) after 10+ seconds of running, the fly still turns and moves correctly (angle normalization working), (3) the fly turns away from edges at consistent speed regardless of monitor refresh rate (manual observation -- edge avoidance should feel the same), (4) the fly decelerates smoothly when entering feed/groom/rest/idle states.

## Constraints
- Do NOT modify any file other than `js/main.js`.
- Do NOT change the brain tick interval (`setInterval(updateBrain, 500)`).
- Do NOT change position update scaling (`fly.x += Math.cos(facingDir) * speed` and `fly.y -= Math.sin(facingDir) * speed`) -- those are not in scope for D1.1.
- Do NOT change the `computeMovementForBehavior()` function -- it sets targetDir values which will be normalized by the new code in `update()`.
- Do NOT add or remove any other features. This is a pure bugfix task.
- Preserve all existing comments. Only add comments where noted above.
