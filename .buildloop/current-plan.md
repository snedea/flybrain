# Plan: T3.1

## Dependencies
- list: [] (no new dependencies)
- commands: [] (no install commands)

## File Operations (in execution order)

### 1. MODIFY js/connectome.js
- operation: MODIFY
- reason: Remove 3 dead legacy worm-sim flag declarations and their backward-compat mapping block in BRAIN.update(). This must happen first so main.js changes can use `BRAIN.stimulate.*` directly without the old flags.

#### Change A: Delete legacy flag declarations (lines 146-149)
- anchor: `// Backward-compatible flags (old worm-sim interface)`
- action: Delete these 4 lines entirely:
  ```
  // Backward-compatible flags (old worm-sim interface)
  BRAIN.stimulateHungerNeurons = true;
  BRAIN.stimulateNoseTouchNeurons = false;
  BRAIN.stimulateFoodSenseNeurons = false;
  ```

#### Change B: Delete backward-compat mapping block in BRAIN.update() (lines 271-277)
- anchor: `// --- Map old flags to new stimulate object for backward compat ---`
- action: Delete these 6 lines entirely:
  ```
  	// --- Map old flags to new stimulate object for backward compat ---
  	if (BRAIN.stimulateNoseTouchNeurons) {
  		BRAIN.stimulate.touch = true;
  	}
  	if (BRAIN.stimulateFoodSenseNeurons) {
  		BRAIN.stimulate.foodNearby = true;
  	}
  ```

### 2. MODIFY js/main.js
- operation: MODIFY
- reason: Fix all 5 remaining bugs: angle wrapping, setTimeout flood, RAF loop, high-DPI canvas, movement bounds clamping, and replace legacy flag usage with direct BRAIN.stimulate calls.

#### Change A: Add wallTouchResetFrame variable to state section (line 25)
- anchor: `var frameCount = 0;`
- action: Add this line immediately after `var frameCount = 0;`:
  ```js
  var wallTouchResetFrame = 0;
  ```

#### Change B: Fix radians/degrees angle wrapping bug (lines 1014-1020)
- anchor: `if (Math.abs(facingMinusTarget) > 180) {`
- action: Replace the entire if-block (lines 1014-1020) with:
  ```js
  	if (Math.abs(facingMinusTarget) > Math.PI) {
  		if (facingDir > targetDir) {
  			angleDiff = -1 * (2 * Math.PI - facingDir + targetDir);
  		} else {
  			angleDiff = 2 * Math.PI - targetDir + facingDir;
  		}
  	}
  ```
  Specifically: replace `180` with `Math.PI`, and replace both `360` with `2 * Math.PI`.

#### Change C: Replace legacy flag usage in wall-collision block (lines 1032-1045)
- anchor: `// Screen bounds`
- action: Replace the entire screen bounds block (lines 1031-1045) with:
  ```js
  	// Screen bounds (clamped to visible area: toolbar=44px top, panel=90px bottom)
  	if (fly.x < 0) {
  		fly.x = 0;
  		BRAIN.stimulate.touch = true;
  		wallTouchResetFrame = frameCount + 120;
  	} else if (fly.x > window.innerWidth) {
  		fly.x = window.innerWidth;
  		BRAIN.stimulate.touch = true;
  		wallTouchResetFrame = frameCount + 120;
  	}
  	if (fly.y < 44) {
  		fly.y = 44;
  		BRAIN.stimulate.touch = true;
  		wallTouchResetFrame = frameCount + 120;
  	} else if (fly.y > window.innerHeight - 90) {
  		fly.y = window.innerHeight - 90;
  		BRAIN.stimulate.touch = true;
  		wallTouchResetFrame = frameCount + 120;
  	}
  ```
  This simultaneously fixes bug 5 (bounds clamping) and bug 6 (replacing `BRAIN.stimulateNoseTouchNeurons = true` with `BRAIN.stimulate.touch = true`). The `wallTouchResetFrame` is set to `frameCount + 120` (2 seconds at 60fps), matching the old 2000ms setTimeout behavior.

#### Change D: Delete `BRAIN.stimulateFoodSenseNeurons = true` in food proximity (line 1053)
- anchor: `BRAIN.stimulateFoodSenseNeurons = true;`
- action: Delete this single line:
  ```
  			BRAIN.stimulateFoodSenseNeurons = true;
  ```
  The line directly below it (`BRAIN.stimulate.foodNearby = true;`) already handles this correctly.

#### Change E: Replace setTimeout flood with frame-counted timer (lines 1065-1070)
- anchor: `// Reset legacy neuron stimulation flags after 2 seconds`
- action: Replace the entire setTimeout block (lines 1065-1070) with:
  ```js
  	// Reset wall-touch stimulus after 120 frames (~2 seconds at 60fps)
  	if (wallTouchResetFrame > 0 && frameCount >= wallTouchResetFrame) {
  		BRAIN.stimulate.touch = false;
  		wallTouchResetFrame = 0;
  	}
  ```
  This replaces 6 lines (comment + setTimeout + 3 flag assignments + closing) with 4 lines (comment + if-block). The old `stimulateHungerNeurons = true` and `stimulateFoodSenseNeurons = false` assignments are no longer needed since those flags no longer exist.

#### Change F: Add high-DPI canvas support in resize function (lines 1112-1117)
- anchor: `(function resize() {`
- action: Replace the entire resize IIFE (lines 1112-1117) with:
  ```js
  // --- Resize (with high-DPI support) ---
  (function resize() {
  	var dpr = window.devicePixelRatio || 1;
  	canvas.width = window.innerWidth * dpr;
  	canvas.height = window.innerHeight * dpr;
  	canvas.style.width = window.innerWidth + 'px';
  	canvas.style.height = window.innerHeight + 'px';
  	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  	window.onresize = resize;
  })();
  ```
  Key details:
  - `canvas.width/height` are set to physical pixel dimensions (CSS size * dpr).
  - `canvas.style.width/height` are set to CSS pixel dimensions so the canvas visually stays the same size.
  - `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` scales all drawing ops by dpr. This is used instead of `ctx.scale(dpr, dpr)` to avoid accumulating transforms on repeated resize calls.
  - All existing draw code uses CSS-pixel coordinates (fly.x, fly.y, window.innerWidth, etc.) and will be automatically scaled by the transform.

#### Change G: Fix clearRect in draw() to use CSS dimensions (line 1088)
- anchor: `ctx.clearRect(0, 0, canvas.width, canvas.height);`
- action: Replace with:
  ```js
  	ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  ```
  After the DPR transform, `canvas.width/height` are physical pixels. `clearRect` is subject to the current transform, so passing physical dimensions would clear a region `dpr^2` times too large. Using `window.innerWidth/Height` (CSS pixels) clears exactly the visible area.

#### Change H: Replace setInterval render loop with requestAnimationFrame (lines 1119-1123)
- anchor: `// --- Main loop ---`
- action: Replace the entire main loop block (lines 1119-1123) with:
  ```js
  // --- Main loop (requestAnimationFrame with delta-time) ---
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

#### Change I: Add dt parameter to update() and scale speed interpolation (line 1006, 1009)
- anchor: `function update() {`
- action: Change the function signature from `function update()` to `function update(dt)`.
- anchor: `speed += speedChangeInterval;`
- action: Replace `speed += speedChangeInterval;` with:
  ```js
  	var dtScale = dt / (1000 / 60);
  	speed += speedChangeInterval * dtScale;
  ```
  `dtScale` normalizes the delta-time so that at exactly 60fps (dt ~= 16.67ms), `dtScale = 1.0` and behavior is identical to the old code. At 30fps, `dtScale = 2.0` and the fly moves twice as much per frame, keeping the same speed-per-second.

  Also scale the facing direction change (the 0.1 turn rate) at lines 1022-1026. Replace:
  ```js
  	if (angleDiff > 0) {
  		facingDir -= 0.1;
  	} else if (angleDiff < 0) {
  		facingDir += 0.1;
  	}
  ```
  with:
  ```js
  	if (angleDiff > 0) {
  		facingDir -= 0.1 * dtScale;
  	} else if (angleDiff < 0) {
  		facingDir += 0.1 * dtScale;
  	}
  ```

## Verification
- build: N/A (no build step -- vanilla JS served directly)
- lint: N/A (no linter configured)
- test: N/A (no existing tests)
- smoke: Open `index.html` in a browser. Verify:
  1. The fly turns smoothly on direction changes without spinning the long way around (bug 1 fix).
  2. Open browser DevTools console, type `setTimeout.length` -- no console errors from missing legacy flags. Check Performance tab for absence of pending setTimeout pile-up (bug 2 fix).
  3. Switch to another tab for 5+ seconds, switch back -- the fly should not teleport or jank (bug 3 fix: RAF pauses in background tabs; dt clamped to 100ms on return).
  4. On a Retina/HiDPI display (or use Chrome DevTools device emulation with DPR=2), the fly body and legs render crisply without blurriness (bug 4 fix).
  5. The fly never walks behind the top toolbar (44px) or the bottom panel (90px) (bug 5 fix).
  6. Search the browser console for any references to `stimulateHungerNeurons`, `stimulateNoseTouchNeurons`, or `stimulateFoodSenseNeurons` -- should find zero (bug 6 fix). Grep both JS files to confirm all references are removed.

## Constraints
- Do NOT modify `js/constants.js`, `css/main.css`, or `index.html`
- Do NOT modify SPEC.md, CLAUDE.md, or TASKS.md
- Do NOT change the brain tick interval (`setInterval(updateBrain, 500)` at main.js:168) -- only the render loop switches to RAF
- Do NOT change `computeMovementForBehavior()` or `applyBehaviorMovement()` -- these are called at the brain tick rate and frame rate respectively, and their logic is correct
- Do NOT add any new npm/node dependencies -- this is a vanilla JS project with no build step
- The `fly.x` and `fly.y` coordinate space remains in CSS pixels -- all DPR scaling happens via the canvas transform, not by modifying coordinates
- Keep the `frameCount` increment at its current position (after the wall-touch reset check, before `updateAnimForBehavior()`)
