# Plan: D3.1

## Dependencies
- list: []
- commands: []

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Fix three bugs: (1) document-level touchend preventDefault breaks mobile toolbar taps, (2) air-tool drag state leaks when tool is switched mid-drag, (3) food placement allows unreachable positions under toolbar/panel

#### Change A: Add `canvasTouchActive` tracking variable

- anchor: `var isDragging = false;` (line 90)
- action: Add a new variable declaration immediately after `var dragStart = { x: 0, y: 0 };` (line 91)
- add line: `var canvasTouchActive = false;`

This boolean tracks whether the current touch interaction originated on the canvas. It is set to `true` in the canvas touchstart handler and cleared to `false` in the document touchend handler.

#### Change B: Set `canvasTouchActive = true` in canvas touchstart handler

- anchor: The canvas touchstart listener block (lines 233-237):
  ```js
  canvas.addEventListener('touchstart', function (event) {
  	event.preventDefault();
  	var touch = event.touches[0];
  	handleCanvasMousedown({ clientX: touch.clientX, clientY: touch.clientY });
  }, { passive: false });
  ```
- action: Insert `canvasTouchActive = true;` as the first statement inside the function body, before `event.preventDefault();`. The full replacement body becomes:
  ```js
  canvas.addEventListener('touchstart', function (event) {
  	canvasTouchActive = true;
  	event.preventDefault();
  	var touch = event.touches[0];
  	handleCanvasMousedown({ clientX: touch.clientX, clientY: touch.clientY });
  }, { passive: false });
  ```

#### Change C: Conditionally call preventDefault in document touchend handler

- anchor: The document touchend listener block (lines 245-250):
  ```js
  document.addEventListener('touchend', function (event) {
  	event.preventDefault();
  	// Use changedTouches for the touch that was lifted
  	var touch = event.changedTouches[0];
  	handleCanvasMouseup({ clientX: touch.clientX, clientY: touch.clientY });
  }, { passive: false });
  ```
- action: Replace the entire listener callback. Only call `event.preventDefault()` and dispatch to `handleCanvasMouseup` when `canvasTouchActive` is true. Always clear `canvasTouchActive` at the end. The replacement:
  ```js
  document.addEventListener('touchend', function (event) {
  	if (canvasTouchActive) {
  		event.preventDefault();
  		var touch = event.changedTouches[0];
  		handleCanvasMouseup({ clientX: touch.clientX, clientY: touch.clientY });
  		canvasTouchActive = false;
  	}
  }, { passive: false });
  ```

**Why this works**: On mobile, tapping a toolbar button fires touchstart on the button (not the canvas), so `canvasTouchActive` remains false. The touchend handler skips `preventDefault()`, allowing the browser to synthesize the click event that the toolbar buttons rely on. When the user touches the canvas, `canvasTouchActive` is set to true by the canvas touchstart handler, so the touchend correctly calls `preventDefault()` (preventing double-fire) and dispatches to `handleCanvasMouseup`.

#### Change D: Fix air-tool drag state leak on tool switch in handleCanvasMouseup

- anchor: The `handleCanvasMouseup` function (lines 281-301):
  ```js
  function handleCanvasMouseup(event) {
  	if (isDragging && activeTool === 'air') {
  ```
- action: Replace the entire `handleCanvasMouseup` function body. The new logic must:
  1. Check `if (isDragging)` (without requiring `activeTool === 'air'`)
  2. Inside that block, compute drag distance and apply wind strength exactly as before (this is safe even if activeTool changed -- the wind was already active from mousedown)
  3. Set `isDragging = false` and `windArrowEnd = null`
  4. Schedule the wind clear timeout

- The full replacement function:
  ```js
  function handleCanvasMouseup(event) {
  	if (isDragging) {
  		var dx = event.clientX - dragStart.x;
  		var dy = event.clientY - dragStart.y;
  		var dragDist = Math.sqrt(dx * dx + dy * dy);
  		if (dragDist < 5) {
  			var distToFly = Math.hypot(event.clientX - fly.x, event.clientY - fly.y);
  			BRAIN.stimulate.windStrength = Math.max(0.1, Math.min(1, 1 - distToFly / 200));
  		} else {
  			BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);
  		}
  		BRAIN.stimulate.wind = true;
  		isDragging = false;
  		windArrowEnd = null;
  		setTimeout(function () {
  			BRAIN.stimulate.wind = false;
  			BRAIN.stimulate.windStrength = 0;
  		}, 2000);
  	}
  }
  ```

**Why this works**: If a user starts an air drag on canvas then clicks a different tool before releasing, `isDragging` is still true but `activeTool` has changed. The old code's `isDragging && activeTool === 'air'` check failed, leaving `isDragging=true` and `BRAIN.stimulate.wind=true` permanently. By removing the `activeTool === 'air'` guard, the mouseup always cleans up the drag state.

#### Change E: Clamp food placement y-coordinate to reachable bounds

- anchor: The food placement line inside `handleCanvasMousedown` (line 257):
  ```js
  		food.push({ x: cx, y: cy, radius: 10, feedStart: 0, feedDuration: 0 });
  ```
- action: Before the `food.push(...)` call, clamp `cy` to the fly's reachable area. Insert these two lines immediately before the `food.push` line:
  ```js
  		var foodMinY = 44;
  		var foodMaxY = window.innerHeight - 90;
  		cy = Math.max(foodMinY, Math.min(foodMaxY, cy));
  ```
- The full replacement of the `if (activeTool === 'feed')` block becomes:
  ```js
  	if (activeTool === 'feed') {
  		var foodMinY = 44;
  		var foodMaxY = window.innerHeight - 90;
  		cy = Math.max(foodMinY, Math.min(foodMaxY, cy));
  		food.push({ x: cx, y: cy, radius: 10, feedStart: 0, feedDuration: 0 });
  ```

**Why 44 and innerHeight - 90**: The toolbar is 44px tall (CSS main.css:77), the bottom panel is 90px tall (CSS main.css:147). The fly's position is clamped to [44, innerHeight - 90] at main.js:1320-1325. Food placed outside these bounds would be unreachable.

## Verification
- build: No build step (vanilla JS project). Open `index.html` in a browser.
- lint: No linter configured. Verify no syntax errors by opening the browser console after loading.
- test: No existing tests.
- smoke: Perform these manual checks:
  1. **Touch bug (Bug 1)**: Open in mobile browser or Chrome DevTools device mode. Tap toolbar buttons (Feed, Touch, Air, Light, Help, Center, Clear). All buttons must respond to taps. Then tap/drag on the canvas -- feed/touch/air tools must still work on the canvas.
  2. **Drag state leak (Bug 2)**: Select Air tool, start dragging on canvas, then (without releasing) click a different tool button in the toolbar. Release the mouse. Verify the fly does NOT exhibit permanent wind/fear escalation. The `isDragging` variable should be false (check in console: `isDragging`).
  3. **Food bounds (Bug 3)**: Select Feed tool. Click near the very top of the screen (within toolbar area). Verify the food dot appears at y=44, not under the toolbar. Click near the very bottom (in the panel area). Verify food appears at y = innerHeight - 90, not under the bottom panel.

## Constraints
- Do NOT modify any file other than `js/main.js`
- Do NOT modify SPEC.md, CLAUDE.md, TASKS.md, or any files in `.buildloop/` other than `current-plan.md`
- Do NOT change the existing canvas touchstart or touchmove handlers' preventDefault behavior (they correctly prevent scrolling during canvas interaction)
- Do NOT add new dependencies or external libraries
- The values 44 (toolbar height) and 90 (bottom panel height) are hardcoded elsewhere in main.js (lines 1276-1277, 1320-1325) -- use the same literal values for consistency, do not introduce named constants unless you also replace all existing usages (which is out of scope)
- Do NOT change handleCanvasMousemove -- the `activeTool !== 'air'` guard there is correct (it prevents updating windStrength/windArrowEnd after tool switch, which is fine since mouseup will clean up)
- The wind arrow drawing check at line 674 (`if (!isDragging || activeTool !== 'air' || !windArrowEnd) return;`) does NOT need to change -- it is a rendering guard, not a state-cleanup path
