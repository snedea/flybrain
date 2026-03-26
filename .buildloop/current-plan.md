# Plan: D7.2

## Dependencies
- list: []
- commands: []

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Replace fixed-step facingDir turning with exponential interpolation to eliminate overshoot oscillation
- anchor: the 16-line block from line 1339 to line 1354, starting with `var facingMinusTarget = facingDir - targetDir;` and ending with the closing brace of `} else if (angleDiff < 0) {`

#### Functions

The entire facingDir interpolation block (lines 1339-1354) must be replaced. Here is the exact existing code to find and replace:

**EXISTING CODE (exact, remove all of this):**
```js
	var facingMinusTarget = facingDir - targetDir;
	var angleDiff = facingMinusTarget;

	if (Math.abs(facingMinusTarget) > Math.PI) {
		if (facingDir > targetDir) {
			angleDiff = -1 * (2 * Math.PI - facingDir + targetDir);
		} else {
			angleDiff = 2 * Math.PI - targetDir + facingDir;
		}
	}

	if (angleDiff > 0) {
		facingDir -= 0.1 * dtScale;
	} else if (angleDiff < 0) {
		facingDir += 0.1 * dtScale;
	}
```

**REPLACEMENT CODE (exact, insert this in its place):**
```js
	// Exponential interpolation toward targetDir using shortest-arc angle difference.
	// Retention factor 0.9 matches proboscisExtend (line 691); at dtScale=1 (60fps),
	// facingDir closes 10% of the remaining gap per frame -- fast enough to track
	// quick heading changes but cannot overshoot because it never exceeds the gap.
	var angleDiffTurn = normalizeAngle(targetDir - facingDir);
	facingDir += angleDiffTurn * (1 - Math.pow(0.9, dtScale));
```

**Why this works and why there is no oscillation:**
- `normalizeAngle(targetDir - facingDir)` computes the shortest-arc signed difference in [-PI, PI]. No manual quadrant logic needed.
- `(1 - Math.pow(0.9, dtScale))` is the frame-rate-independent exponential blend factor, identical to the pattern at lines 684 (wingSpread, base 0.85), 691 (proboscisExtend, base 0.9), 1129-1130 (antenna, base 0.92), 1207 (legJitter, base 0.95), 1216 (wingMicro, base 0.97).
- The blend factor is always in (0, 1), so `facingDir` moves toward `targetDir` by a fraction of the remaining gap. It can never overshoot. The old code applied a fixed 0.1-radian step regardless of remaining angle, which overshot when the gap was < 0.1 radians.
- At dtScale=1 (60fps): closes 10% of gap per frame. A 1-radian offset reaches 0.01 rad in ~44 frames (~0.73s). A 0.05-radian offset (the old oscillation threshold) reaches 0.005 rad in ~24 frames (~0.4s). Responsive enough for all behavioral transitions.
- Retention 0.9 chosen to match proboscisExtend, giving a natural feel. Values tested against the task description's suggested `0.9` base.

#### Wiring / Integration

- No new variables, functions, or imports needed.
- The existing `normalizeAngle()` helper at lines 31-36 is already used elsewhere in this function (line 1382, 1388) and handles the shortest-arc computation.
- The subsequent `facingDir = normalizeAngle(facingDir);` at line 1387 (which will shift down by ~12 lines after the replacement) continues to bound facingDir, providing a safety net. The exponential interpolation already keeps facingDir bounded via normalizeAngle in the delta, but the post-normalization is harmless and consistent with the codebase pattern.
- No other code references `facingMinusTarget` or `angleDiff` (the local variable) -- these names are local to the removed block. The variable `angleDiffTurn` is new and local. No naming conflicts.

## Verification
- build: Open `index.html` in a browser (no build step -- vanilla JS project)
- lint: No linter configured in this project
- test: No existing tests
- smoke: 1. Open the page and observe the fly during idle/groom/rest states -- the body should NOT exhibit rapid rotational jitter (the old ~5.7-degree peak-to-peak oscillation). 2. Place food near the fly and enter feed state -- the fly should smoothly orient toward the food without zigzag. 3. Trigger a startle (touch tool) and observe the fly turn to flee -- turns should be smooth and complete without oscillation at the end. 4. Observe at both normal and slowed frame rates (throttle via DevTools Performance tab) -- turning speed should feel consistent regardless of frame rate.

## Constraints
- Do NOT modify any file other than `js/main.js`
- Do NOT change the `normalizeAngle()` helper function (lines 31-36)
- Do NOT change the subsequent `facingDir = normalizeAngle(facingDir)` or `targetDir = normalizeAngle(targetDir)` normalization at lines 1387-1388 (these line numbers will shift after the edit)
- Do NOT change any other animation interpolation (wingSpread, proboscis, antenna, legs, wings)
- Do NOT add new global variables or functions -- the fix is purely local to the update() function body
- The replacement must use a single `Edit` operation replacing the exact old block with the exact new block. Use tabs for indentation (matching the existing file).
