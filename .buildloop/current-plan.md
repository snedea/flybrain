# Plan: D6.1

## Dependencies
- list: []
- commands: []

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Fix three frame-rate-dependent idle animation timer frequencies, replace window.onresize with addEventListener, and fix mid-drag tool-switch bugs in mousemove/drawWindArrow

#### Change A: Add three new interval fields to the anim object

- anchor: `wingMicroTimer: 0,`

Add three new fields to the `anim` object immediately after `wingMicroTimer: 0,` and before the line `// Behavior animation state (T2.1)`:

```js
	// Pre-rolled next intervals (frame-rate-independent timer frequency)
	antennaNextInterval: 0.8 + Math.random() * 1.2,
	legJitterNextInterval: 1.5 + Math.random() * 2.0,
	wingMicroNextInterval: 2.0 + Math.random() * 3.0,
```

These fields store the next random wait duration so it is not re-rolled every frame.

#### Change B: Fix antenna twitch timer in drawAntennae

- anchor: `if (t - anim.antennaTimer > 0.8 + Math.random() * 1.2) {`

Replace line 1064:
```js
	if (t - anim.antennaTimer > 0.8 + Math.random() * 1.2) {
```
with:
```js
	if (t - anim.antennaTimer > anim.antennaNextInterval) {
```

Then immediately after the existing line `anim.antennaTimer = t;` (line 1065), add:
```js
		anim.antennaNextInterval = 0.8 + Math.random() * 1.2;
```

So the full block becomes:
```js
	if (t - anim.antennaTimer > anim.antennaNextInterval) {
		anim.antennaTimer = t;
		anim.antennaNextInterval = 0.8 + Math.random() * 1.2;
		anim.antennaTargetL = (Math.random() - 0.5) * 0.4;
		anim.antennaTargetR = (Math.random() - 0.5) * 0.4;
	}
```

#### Change C: Fix leg jitter timer in drawLegs

- anchor: `if (t - anim.legJitterTimer > 1.5 + Math.random() * 2.0) {`

Replace line 1140:
```js
	if (t - anim.legJitterTimer > 1.5 + Math.random() * 2.0) {
```
with:
```js
	if (t - anim.legJitterTimer > anim.legJitterNextInterval) {
```

Then immediately after the existing line `anim.legJitterTimer = t;` (line 1141), add:
```js
		anim.legJitterNextInterval = 1.5 + Math.random() * 2.0;
```

So the full block becomes:
```js
	if (t - anim.legJitterTimer > anim.legJitterNextInterval) {
		anim.legJitterTimer = t;
		anim.legJitterNextInterval = 1.5 + Math.random() * 2.0;
		for (var j = 0; j < 6; j++) {
			anim.legJitterTarget[j] = (Math.random() - 0.5) * 0.15;
		}
	}
```

#### Change D: Fix wing micro-movement timer in drawLegs

- anchor: `if (t - anim.wingMicroTimer > 2.0 + Math.random() * 3.0) {`

Replace line 1151:
```js
	if (t - anim.wingMicroTimer > 2.0 + Math.random() * 3.0) {
```
with:
```js
	if (t - anim.wingMicroTimer > anim.wingMicroNextInterval) {
```

Then immediately after the existing line `anim.wingMicroTimer = t;` (line 1152), add:
```js
		anim.wingMicroNextInterval = 2.0 + Math.random() * 3.0;
```

So the full block becomes:
```js
	if (t - anim.wingMicroTimer > anim.wingMicroNextInterval) {
		anim.wingMicroTimer = t;
		anim.wingMicroNextInterval = 2.0 + Math.random() * 3.0;
		anim.wingMicroTarget = (Math.random() - 0.5) * 2;
	}
```

#### Change E: Replace window.onresize with addEventListener

- anchor: `window.onresize = resize;`

Replace:
```js
	window.onresize = resize;
```
with:
```js
	window.addEventListener('resize', resize);
```

This is inside the self-invoking `(function resize() { ... })();` block at the bottom of the file (~line 1454). Only the assignment changes; the rest of the resize function is unchanged.

#### Change F: Fix handleCanvasMousemove to check dragToolOrigin instead of activeTool

- anchor: `if (!isDragging || activeTool !== 'air') return;`

Replace line 285:
```js
	if (!isDragging || activeTool !== 'air') return;
```
with:
```js
	if (!isDragging || dragToolOrigin !== 'air') return;
```

Rationale: `dragToolOrigin` is set at drag start and is stable throughout the drag. If the user switches tools mid-drag via the toolbar, `activeTool` changes but `dragToolOrigin` still reflects the original tool. This ensures wind strength and arrow endpoint continue updating for the duration of the air-tool drag.

#### Change G: Fix drawWindArrow to check dragToolOrigin instead of activeTool

- anchor: `if (!isDragging || activeTool !== 'air' || !windArrowEnd) return;`

Replace line 710:
```js
	if (!isDragging || activeTool !== 'air' || !windArrowEnd) return;
```
with:
```js
	if (!isDragging || dragToolOrigin !== 'air' || !windArrowEnd) return;
```

Rationale: Same as Change F. The wind arrow should remain visible throughout an air-tool drag even if the user clicks a different tool button mid-drag.

## Verification
- build: "No build step -- open index.html directly in a browser"
- lint: "no lint configured"
- test: "no existing tests"
- smoke: "Open js/main.js and verify: (1) anim object has three new fields antennaNextInterval, legJitterNextInterval, wingMicroNextInterval, (2) the three timer checks in drawAntennae and drawLegs compare against the new fields instead of inline Math.random() expressions, (3) each timer body re-rolls the corresponding NextInterval field, (4) window.onresize is replaced with addEventListener, (5) handleCanvasMousemove line 285 checks dragToolOrigin not activeTool, (6) drawWindArrow line 710 checks dragToolOrigin not activeTool"

## Constraints
- Do NOT modify any file other than js/main.js
- Do NOT change the timer threshold constants (0.8, 1.2, 1.5, 2.0, 3.0) -- keep the same minimum and range values
- Do NOT change the lerp interpolation lines (the `Math.pow` exponential interpolation) -- those were already fixed by D3.2/D4.1
- Do NOT modify handleCanvasMouseup -- its dragToolOrigin-based cleanup from D4.1 is correct
- Do NOT modify SPEC.md, CLAUDE.md, or TASKS.md
