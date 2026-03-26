# Plan: D9.1

## Dependencies
- list: none
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Three fixes: (a) reorder edge avoidance before facingDir interpolation, (b) reset behavior/speed state in visibilitychange resume handler, (c) remove dead isWalking variable in drawFlyBody

#### Fix 1: Edge avoidance ordering (move edge avoidance block BEFORE facingDir interpolation)

- anchor: `var angleDiffTurn = normalizeAngle(targetDir - facingDir);`

The current code in update() at lines 1352-1391 is ordered:

```
// [A] facingDir interpolation (lines 1356-1357)
var angleDiffTurn = normalizeAngle(targetDir - facingDir);
facingDir += angleDiffTurn * (1 - Math.pow(0.9, dtScale));

// [B] edge avoidance (lines 1359-1387)
var edgeMargin = 50;
... (edge avoidance modifies targetDir) ...

// [C] angle normalization (lines 1389-1391)
facingDir = normalizeAngle(facingDir);
targetDir = normalizeAngle(targetDir);
```

Replace the entire block from the comment `// Exponential interpolation toward targetDir` (line 1352) through `targetDir = normalizeAngle(targetDir);` (line 1391) with the reordered version:

```js
	// Edge avoidance: bias targetDir away from screen edges when within 50px
	var edgeMargin = 50;
	var edgeBias = 0;
	var edgeBiasY = 0;
	var topBound = 44;
	var bottomBound = window.innerHeight - 90;
	var leftBound = 0;
	var rightBound = window.innerWidth;

	if (fly.x - leftBound < edgeMargin) {
		edgeBias += (edgeMargin - (fly.x - leftBound)) / edgeMargin; // push right (+x)
	} else if (rightBound - fly.x < edgeMargin) {
		edgeBias -= (edgeMargin - (rightBound - fly.x)) / edgeMargin; // push left (-x)
	}
	if (fly.y - topBound < edgeMargin) {
		edgeBiasY -= (edgeMargin - (fly.y - topBound)) / edgeMargin; // push down (-y, but facingDir uses -sin for y)
	} else if (bottomBound - fly.y < edgeMargin) {
		edgeBiasY += (edgeMargin - (bottomBound - fly.y)) / edgeMargin; // push up
	}

	if (edgeBias !== 0 || edgeBiasY !== 0) {
		// Compute desired direction away from edges
		var awayAngle = Math.atan2(edgeBiasY, edgeBias);
		var awayStrength = Math.min(1, Math.sqrt(edgeBias * edgeBias + edgeBiasY * edgeBiasY));
		var angleDiffEdge = awayAngle - targetDir;
		// Normalize to [-PI, PI]
		angleDiffEdge = normalizeAngle(angleDiffEdge);
		targetDir += angleDiffEdge * awayStrength * 0.3 * dtScale;
	}

	// Exponential interpolation toward targetDir using shortest-arc angle difference.
	// Retention factor 0.9 matches proboscisExtend (line 691); at dtScale=1 (60fps),
	// facingDir closes 10% of the remaining gap per frame -- fast enough to track
	// quick heading changes but cannot overshoot because it never exceeds the gap.
	var angleDiffTurn = normalizeAngle(targetDir - facingDir);
	facingDir += angleDiffTurn * (1 - Math.pow(0.9, dtScale));

	// Normalize angles to [-PI, PI] to prevent unbounded growth
	facingDir = normalizeAngle(facingDir);
	targetDir = normalizeAngle(targetDir);
```

The logic is identical -- just [B] moved before [A]. The facingDir interpolation now sees the edge-avoidance-corrected targetDir in the same frame.

#### Fix 2: Visibilitychange resume state gaps (add behavior/speed resets)

- anchor: `// Reset lastTime so the RAF loop does not compute a huge dt on resume`

Insert the following block immediately BEFORE the line `// Reset lastTime so the RAF loop does not compute a huge dt on resume` (line 287) and AFTER the closing brace `}` of the driveSnapshotOnHide restore block (line 285):

```js
		// Reset behavior and speed state to prevent high-speed transient
		// states from persisting after stimuli have been cleared
		behavior.current = 'idle';
		behavior.startlePhase = 'none';
		behavior.enterTime = Date.now();
		speed = 0;
		speedChangeInterval = 0;
```

This goes between the drive snapshot restore (line 284-285) and the lastTime reset comment (line 287). The exact insertion point is after `driveSnapshotOnHide = null;` + `}` and before `// Reset lastTime`.

#### Fix 3: Remove dead isWalking in drawFlyBody

- anchor: `var isWalking = (state === 'walk' || state === 'explore' || state === 'phototaxis');` inside `function drawFlyBody(dtScale)`

Delete the entire line 931:
```js
	var isWalking = (state === 'walk' || state === 'explore' || state === 'phototaxis');
```

This is at line 931 inside `drawFlyBody`. There is a separate `isWalking` declaration at line 1204 inside `drawLegs` -- that one is live and must NOT be touched. The line to delete is the one preceded by `var state = behavior.current;` (line 930) and followed by a blank line then `// --- Wings (drawn first, behind body) ---` (line 933).

## Verification
- build: no build step (vanilla JS, loaded directly by index.html)
- lint: no configured linter
- test: no existing tests
- smoke: open index.html in a browser; (1) move the fly near a screen edge and observe that it turns away smoothly without hitting the wall first -- compare with the old behavior where the fly would contact the wall and then turn, (2) wait for a startle or high-speed state, then switch to another tab for 2+ seconds and switch back -- the fly should be idle and stationary on resume, not zooming across the screen, (3) open browser devtools console and type `typeof drawFlyBody` to confirm it loads without syntax errors (verifying the dead code removal did not break parsing)

## Constraints
- Do NOT modify any file other than js/main.js
- Do NOT modify SPEC.md, CLAUDE.md, TASKS.md, or any file in .buildloop/ other than current-plan.md
- Do NOT change the drawLegs isWalking declaration at line 1204 -- only remove the dead one at line 931 in drawFlyBody
- Do NOT change the edge avoidance logic itself (the math, thresholds, or strength values) -- only move the existing block
- Do NOT change the existing visibilitychange resume resets for stimuli, drag state, food, or drives -- only add the new behavior/speed resets
- The edge avoidance block and facingDir interpolation block must remain adjacent (just swapped in order), with the angle normalization still AFTER both
