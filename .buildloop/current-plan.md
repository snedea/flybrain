# Plan: D2.2

## Dependencies
- list: []
- commands: []

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Move mouseup listener from canvas to document so releasing the mouse anywhere clears air-tool drag and wind state; also move touchend to document for parity.

#### Change 1: Move mouseup listener from canvas to document

- anchor: `canvas.addEventListener('mouseup', handleCanvasMouseup, false);` (line 230)
- action: Change `canvas.addEventListener('mouseup', handleCanvasMouseup, false);` to `document.addEventListener('mouseup', handleCanvasMouseup, false);`

#### Change 2: Move touchend listener from canvas to document

- anchor: `canvas.addEventListener('touchend', function (event) {` (line 245)
- action: Change `canvas.addEventListener('touchend', function (event) {` to `document.addEventListener('touchend', function (event) {`
- rationale: Known pattern #2 (reuse mouse handlers from touch events via synthetic event objects) -- the touchend handler already delegates to handleCanvasMouseup. Moving it to document provides the same outside-canvas fix for touch users who lift their finger off-canvas.

No other changes are needed. The existing `handleCanvasMouseup` function already:
1. Checks `if (isDragging && activeTool === 'air')` before acting (line 282)
2. Sets `isDragging = false` (line 294)
3. Sets `windArrowEnd = null` (line 295)
4. Schedules `BRAIN.stimulate.wind = false` and `BRAIN.stimulate.windStrength = 0` via setTimeout(2000) (lines 296-299)

These are all correct behaviors. The only bug is that the listener is on the wrong element (canvas instead of document), so mouseup events outside the canvas never reach it.

## Verification
- build: No build step (vanilla JS project). Open `index.html` in a browser.
- lint: No linter configured.
- test: No existing tests.
- smoke: Open the page in a browser. Select the Air tool. Click and hold on the canvas, then drag and release the mouse outside the canvas (over the toolbar, bottom panel, or outside the browser window). Verify: (1) the wind arrow disappears immediately on release, (2) the fly does not continue fleeing after release, (3) BRAIN.stimulate.wind returns to false within 2 seconds. Repeat with touch on a mobile device or touch simulator -- touch-drag off the canvas and lift finger; same expected behavior.

## Constraints
- Do NOT modify any other file -- only js/main.js changes
- Do NOT modify handleCanvasMouseup, handleCanvasMousedown, or handleCanvasMousemove function bodies
- Do NOT add new variables or functions -- this is a 2-line fix (changing the target element of two existing addEventListener calls)
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any .buildloop/ file other than current-plan.md
