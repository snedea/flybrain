# Plan: D4.1

## Dependencies
- list: none
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Fix wind stimulus setTimeout race condition, conditional wind=true on mouseup, and dt-scale three idle animation interpolations

There are 5 discrete changes to this file, listed in order from top to bottom of the file.

---

#### Change 1: Add `windResetFrame` and `dragToolOrigin` state variables

- anchor: `var touchResetFrame = 0;` (line 26)

**Action:** Immediately after `var touchResetFrame = 0;`, add two new lines:

```js
var windResetFrame = 0;
var dragToolOrigin = null;
```

`windResetFrame` mirrors the `touchResetFrame` pattern (frame-counted timer instead of setTimeout).
`dragToolOrigin` records which tool was active when the drag started, so mouseup can conditionally apply wind stimulus.

---

#### Change 2: Record the originating tool when air drag starts

- anchor: lines 269-275, the `else if (activeTool === 'air')` block in `handleCanvasMousedown`:
```js
	} else if (activeTool === 'air') {
		isDragging = true;
		dragStart.x = cx;
		dragStart.y = cy;
		BRAIN.stimulate.wind = true;
		BRAIN.stimulate.windStrength = 0.3;
	}
```

**Action:** Add `dragToolOrigin = 'air';` after `isDragging = true;`. Also reset `windResetFrame = 0;` to cancel any pending frame-counted wind reset from a prior drag. The full replacement block:

```js
	} else if (activeTool === 'air') {
		isDragging = true;
		dragToolOrigin = 'air';
		windResetFrame = 0;
		dragStart.x = cx;
		dragStart.y = cy;
		BRAIN.stimulate.wind = true;
		BRAIN.stimulate.windStrength = 0.3;
	}
```

---

#### Change 3: Make wind=true conditional on dragToolOrigin, replace setTimeout with frame-counted timer

- anchor: the entire `handleCanvasMouseup` function at lines 289-308:
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

**Replace with:**

```js
function handleCanvasMouseup(event) {
	if (isDragging) {
		if (dragToolOrigin === 'air') {
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
			windResetFrame = frameCount + 120;
		}
		isDragging = false;
		dragToolOrigin = null;
		windArrowEnd = null;
	}
}
```

Key changes:
1. The wind strength calculation and `wind = true` are now inside `if (dragToolOrigin === 'air')` -- only fires when the drag was originally started with the air tool.
2. `setTimeout` is replaced with `windResetFrame = frameCount + 120` (120 frames = ~2 seconds at 60fps, matching the original 2000ms timeout).
3. `dragToolOrigin` is reset to `null` on every mouseup.
4. `isDragging = false` and `windArrowEnd = null` remain unconditional (outside the air check).

---

#### Change 4: Add dtScale parameter to drawFlyBody, drawAntennae, and drawLegs; apply exponential interpolation to the three idle lerps

This change touches three functions: `drawFlyBody`, `drawAntennae`, and `drawLegs`.

##### 4a: Modify `drawFlyBody` to accept and pass `dtScale`

- anchor: `function drawFlyBody() {` (line 839)

**Replace** `function drawFlyBody() {` with `function drawFlyBody(dtScale) {`

- anchor: `drawLegs(state);` (line 849)

**Replace** `drawLegs(state);` with `drawLegs(state, dtScale);`

- anchor: `drawAntennae(t);` (line 864)

**Replace** `drawAntennae(t);` with `drawAntennae(t, dtScale);`

##### 4b: Modify `drawAntennae` to accept `dtScale` and use exponential interpolation

- anchor: `function drawAntennae(t) {` (line 1044)

**Replace** `function drawAntennae(t) {` with `function drawAntennae(t, dtScale) {`

- anchor: the two lerp lines at 1052-1053:
```js
	anim.antennaTwitchL += (anim.antennaTargetL - anim.antennaTwitchL) * 0.08;
	anim.antennaTwitchR += (anim.antennaTargetR - anim.antennaTwitchR) * 0.08;
```

**Replace with:**
```js
	anim.antennaTwitchL += (anim.antennaTargetL - anim.antennaTwitchL) * (1 - Math.pow(0.92, dtScale));
	anim.antennaTwitchR += (anim.antennaTargetR - anim.antennaTwitchR) * (1 - Math.pow(0.92, dtScale));
```

Derivation: original multiplier is 0.08. The complement-based formula is `1 - Math.pow(1 - 0.08, dtScale)` = `1 - Math.pow(0.92, dtScale)`. At dtScale=1 (60fps), this equals 0.08 -- identical to the original. This matches the pattern from D3.2 (see line 612: `1 - Math.pow(0.85, dtScale)`).

##### 4c: Modify `drawLegs` to accept `dtScale` and use exponential interpolation for leg jitter

- anchor: `function drawLegs(state) {` (line 1120)

**Replace** `function drawLegs(state) {` with `function drawLegs(state, dtScale) {`

- anchor: the lerp at line 1137:
```js
		anim.legJitter[j] += (anim.legJitterTarget[j] - anim.legJitter[j]) * 0.05;
```

**Replace with:**
```js
		anim.legJitter[j] += (anim.legJitterTarget[j] - anim.legJitter[j]) * (1 - Math.pow(0.95, dtScale));
```

Derivation: original multiplier is 0.05. `1 - Math.pow(1 - 0.05, dtScale)` = `1 - Math.pow(0.95, dtScale)`. At dtScale=1, equals 0.05.

##### 4d: Apply exponential interpolation for wing micro-movement in `drawLegs`

- anchor: the lerp at line 1145 (inside drawLegs, after the wing micro-movement timer check):
```js
	anim.wingMicro += (anim.wingMicroTarget - anim.wingMicro) * 0.03;
```

**Replace with:**
```js
	anim.wingMicro += (anim.wingMicroTarget - anim.wingMicro) * (1 - Math.pow(0.97, dtScale));
```

Derivation: original multiplier is 0.03. `1 - Math.pow(1 - 0.03, dtScale)` = `1 - Math.pow(0.97, dtScale)`. At dtScale=1, equals 0.03.

---

#### Change 5: Pass `dtScale` to `drawFlyBody()` in the draw call, and add `windResetFrame` check in `update()`

##### 5a: Store dtScale as a module-level variable so draw() can access it

- anchor: `var touchResetFrame = 0;` (line 26, same area as Change 1)

After adding the variables from Change 1, also add:

```js
var currentDtScale = 1;
```

So the full variable block after line 26 reads:
```js
var touchResetFrame = 0;
var windResetFrame = 0;
var dragToolOrigin = null;
var currentDtScale = 1;
```

##### 5b: Set `currentDtScale` in `update()`

- anchor: `var dtScale = dt / (1000 / 60);` (line 1261)

**After** this line, add:
```js
	currentDtScale = dtScale;
```

##### 5c: Pass `currentDtScale` to `drawFlyBody()` in `draw()`

- anchor: `drawFlyBody();` (line 1420)

**Replace** `drawFlyBody();` with `drawFlyBody(currentDtScale);`

##### 5d: Add wind reset frame check in `update()`

- anchor: the touch reset block at lines 1381-1386:
```js
	// Reset wall-touch stimulus after 120 frames (~2 seconds at 60fps)
	if (touchResetFrame > 0 && frameCount >= touchResetFrame) {
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.touchLocation = null;
		touchResetFrame = 0;
	}
```

**Immediately after** this block (before `frameCount++;` at line 1388), add:

```js
	// Reset wind stimulus after 120 frames (~2 seconds at 60fps)
	if (windResetFrame > 0 && frameCount >= windResetFrame) {
		BRAIN.stimulate.wind = false;
		BRAIN.stimulate.windStrength = 0;
		windResetFrame = 0;
	}
```

---

## Summary of all changes

| # | What | Where | Why |
|---|------|-------|-----|
| 1 | Add `windResetFrame`, `dragToolOrigin`, `currentDtScale` vars | After line 26 | State for frame-counted wind timer, drag origin tracking, and dtScale passthrough to draw |
| 2 | Set `dragToolOrigin = 'air'` and `windResetFrame = 0` on air drag start | `handleCanvasMousedown` air branch | Track which tool started the drag; cancel pending wind reset on new drag |
| 3 | Gate wind=true on `dragToolOrigin === 'air'`, replace setTimeout with windResetFrame, reset dragToolOrigin | `handleCanvasMouseup` | Fix race condition and conditional wind assignment |
| 4a | Add `dtScale` parameter to `drawFlyBody` | `drawFlyBody` signature | Pass dtScale to child draw functions |
| 4b | Add `dtScale` parameter to `drawAntennae`, use exponential interp | `drawAntennae` signature + lerp lines | Frame-rate-independent antenna twitch |
| 4c | Add `dtScale` parameter to `drawLegs`, use exponential interp for leg jitter | `drawLegs` signature + lerp line | Frame-rate-independent leg jitter |
| 4d | Use exponential interp for wing micro-movement | `drawLegs` lerp line for wingMicro | Frame-rate-independent wing micro-movement |
| 5a | Set `currentDtScale = dtScale` in update() | After dtScale computation in `update()` | Make dtScale available to draw path |
| 5b | Pass `currentDtScale` to `drawFlyBody()` | `draw()` function | Propagate dtScale into draw tree |
| 5c | Add windResetFrame check | After touchResetFrame check in `update()` | Frame-counted wind stimulus expiry |

## Verification
- build: No build step. Open `index.html` in a browser.
- lint: No linter configured.
- test: No existing tests.
- smoke: Open `index.html` in browser. Perform these checks:
  1. **Wind race condition (bug 1):** Select air tool, drag and release on canvas. Within 1 second, start a new air drag and hold it. Verify the fly continues reacting to wind (BRAIN panel should show wind=true while dragging). Release. Verify wind clears after ~2 seconds.
  2. **Conditional wind on tool switch (bug 2):** Select air tool, start a drag on canvas, then click the touch tool in the toolbar (switching tools mid-drag). Release the mouse. Verify BRAIN.stimulate.wind does NOT become true (check the connectome panel or console).
  3. **Frame-rate-independent idle animations (bug 3):** Observe the fly in idle state. Antenna twitches, leg jitters, and wing micro-movements should animate smoothly. If testing on a 120Hz display, animations should run at the same visual speed as on a 60Hz display.

## Constraints
- Do NOT modify any file other than `js/main.js`.
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any files in `.buildloop/` other than this plan.
- Do NOT add any new dependencies or imports.
- Do NOT change the `handleCanvasMousemove` function -- the existing `activeTool !== 'air'` guard there is correct because it governs real-time drag visual feedback, not cleanup.
- Do NOT change the `drawWindArrow` function -- it correctly gates on `isDragging && activeTool === 'air'`.
- The `drawWing` function does NOT need changes -- `anim.wingMicro` is computed in `drawLegs` and consumed by `drawWing` via the shared `anim` object; the dt-scaling happens at the write site (drawLegs), not the read site (drawWing).
- Preserve the unconditional `isDragging = false` in `handleCanvasMouseup` (D3.1 requirement).
