# Plan: D8.1

## Dependencies
- list: []
- commands: []

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Add drag state resets and food feedStart resets to the visibilitychange resume branch
- anchor: `// Tab is becoming visible again: clear all stale stimuli` (line 253 inside the `else` block of the visibilitychange handler)

#### Change 1: Reset drag/interaction state on resume

Insert 4 lines immediately after the existing `windResetTime = 0;` line (line 261) and before the blank line preceding the drive snapshot restoration comment. The new lines go between the timer variable resets and the drive snapshot block.

Locate this exact existing block:
```js
		touchResetTime = 0;
		windResetTime = 0;

		// Restore drive snapshot to undo any drift from throttled ticks
```

Replace with:
```js
		touchResetTime = 0;
		windResetTime = 0;

		// Reset drag/interaction state that may be stale from a mid-drag tab hide
		isDragging = false;
		dragToolOrigin = null;
		windArrowEnd = null;

		// Reset food feeding timestamps to prevent instant food consumption on resume
		for (var fi = 0; fi < food.length; fi++) {
			if (food[fi].feedStart !== 0) {
				food[fi].feedStart = 0;
				food[fi].radius = 10;
			}
		}

		// Restore drive snapshot to undo any drift from throttled ticks
```

No other changes to this file. No imports, no new functions, no signature changes.

## Verification
- build: Open `index.html` in a browser and confirm no console errors on page load
- lint: No linter configured (vanilla JS project, no build step)
- test: No existing test suite
- smoke: (1) Select the air tool, start dragging on the canvas, then switch to a different browser tab while still holding the mouse button. Switch back. Verify: no wind arrow is drawn, clicking the canvas does not produce a spurious wind stimulus, isDragging is false (check by attempting a normal tool click -- it should work normally). (2) Place a food item near the fly, wait for the fly to begin feeding (proboscis extends, food starts shrinking), then switch tabs. Wait 5+ seconds, switch back. Verify: the food item is still visible at full size (radius 10) and the gradual feeding animation restarts from the beginning rather than the food instantly disappearing.

## Constraints
- Do NOT modify any file other than js/main.js
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any file in .buildloop/ other than current-plan.md
- Do NOT add new global variables -- use only the existing `isDragging`, `dragToolOrigin`, `windArrowEnd`, and `food` array
- Do NOT change the structure of the visibilitychange handler beyond adding the new reset block
- The food feedStart reset loop must use the same pattern as the existing D5.1 reset at main.js:496-502 (check `feedStart !== 0`, reset to 0, restore radius to 10)
- Place the drag state resets BEFORE the drive snapshot restoration (the drive restore must remain the last state-fixup step before restarting the brain tick)
- Place the food feedStart resets AFTER the drag state resets and BEFORE the drive snapshot restoration
