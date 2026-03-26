# Plan: D5.1

## Dependencies
- list: [] (no new packages)
- commands: [] (no install commands)

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Replace frame-count-based stimulus expiry with Date.now() timestamps, fix feeding timer leak on behavior interruption, replace while-loop angle normalization with normalizeAngle() calls

There are 8 discrete changes to make in this file, listed in order from top-of-file to bottom-of-file. Apply them in this order.

---

#### Change 1: Rename module-scope variables from frame-based to time-based

- anchor: `var touchResetFrame = 0;`
- Replace lines 26-27:
  ```
  var touchResetFrame = 0;
  var windResetFrame = 0;
  ```
  with:
  ```
  var touchResetTime = 0;
  var windResetTime = 0;
  ```
- `touchResetTime` and `windResetTime` will hold `Date.now() + 2000` timestamps (milliseconds since epoch) instead of frame counts. A value of 0 means "no pending reset."

---

#### Change 2: Replace windResetFrame = 0 in handleCanvasMousedown (air drag start)

- anchor: `windResetFrame = 0;` (inside the `activeTool === 'air'` block at line 275)
- Replace:
  ```
  windResetFrame = 0;
  ```
  with:
  ```
  windResetTime = 0;
  ```
- This clears any pending wind reset when a new air drag begins, same semantics as before.

---

#### Change 3: Replace windResetFrame in handleCanvasMouseup (air drag end)

- anchor: `windResetFrame = frameCount + 120;` (line 307)
- Replace:
  ```
  windResetFrame = frameCount + 120;
  ```
  with:
  ```
  windResetTime = Date.now() + 2000;
  ```
- Sets wind stimulus to expire 2000ms from now (wall-clock time), replacing the 120-frame countdown.

---

#### Change 4: Replace touchResetFrame in applyTouchTool

- anchor: `touchResetFrame = Math.max(touchResetFrame, frameCount + 120);` (line 343)
- Replace:
  ```
  touchResetFrame = Math.max(touchResetFrame, frameCount + 120);
  ```
  with:
  ```
  touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
  ```
- Same semantics: extends the touch reset deadline if a new touch happens before the old one expires. Uses wall-clock time instead of frame count.

---

#### Change 5: Replace while-loop angle normalization for food-seeking (angleDiffToFood)

- anchor (the two while lines at 505-506):
  ```
  			while (angleDiffToFood > Math.PI) angleDiffToFood -= 2 * Math.PI;
  			while (angleDiffToFood < -Math.PI) angleDiffToFood += 2 * Math.PI;
  ```
- Replace with:
  ```
  			angleDiffToFood = normalizeAngle(angleDiffToFood);
  ```
- Uses the existing normalizeAngle() helper at line 32-37 which is O(1) and safe against NaN (returns NaN without looping).

---

#### Change 6: Add feedStart reset on behavior exit from 'feed' in updateBehaviorState()

- anchor: `if (newState !== behavior.current) {` (line 436, inside updateBehaviorState)
- Insert the feedStart reset block immediately after the line `behavior.previous = behavior.current;` (line 441) and before the line `behavior.current = newState;` (line 442).
- The exact old_string to match:
  ```
  		behavior.previous = behavior.current;
  		behavior.current = newState;
  ```
- Replace with:
  ```
  		behavior.previous = behavior.current;
  		// Reset feeding timers when exiting feed state to prevent stale feedStart leak
  		if (behavior.current === 'feed') {
  			for (var fi = 0; fi < food.length; fi++) {
  				if (food[fi].feedStart !== 0) {
  					food[fi].feedStart = 0;
  					food[fi].radius = 10;
  				}
  			}
  		}
  		behavior.current = newState;
  ```
- Logic: When transitioning OUT of 'feed' state to any other state, iterate all food items and reset feedStart to 0 and radius to 10. This prevents stale feedStart timestamps from persisting through groom or other stationary states, which would cause instant food consumption when re-entering feed.
- The variable name `fi` is used (not `i`) to avoid any potential scope confusion, since this function does not use `i` elsewhere.

---

#### Change 7: Replace while-loop angle normalization for edge avoidance (angleDiffEdge)

- anchor (the two while lines at 1314-1315):
  ```
  		while (angleDiffEdge > Math.PI) angleDiffEdge -= 2 * Math.PI;
  		while (angleDiffEdge < -Math.PI) angleDiffEdge += 2 * Math.PI;
  ```
- Replace with:
  ```
  		angleDiffEdge = normalizeAngle(angleDiffEdge);
  ```
- Same rationale as Change 5: O(1), NaN-safe.

---

#### Change 8: Replace all 4 touchResetFrame assignments in wall-collision block AND replace both reset checks at end of update(), AND remove frameCount increment

- anchor: The wall-collision block starts at line 1327. There are 4 sites that set `touchResetFrame`:

**8a.** Replace the 4 wall-collision touchResetFrame assignments (lines 1330, 1334, 1339, 1343):

Each of the 4 instances of:
```
		touchResetFrame = Math.max(touchResetFrame, frameCount + 120);
```
must be replaced with:
```
		touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
```

There are exactly 4 occurrences in the wall-collision block (left wall, right wall, top wall, bottom wall). Use `replace_all` or replace each individually.

**8b.** Replace the touch reset check (lines 1386-1389):

Old:
```
	// Reset wall-touch stimulus after 120 frames (~2 seconds at 60fps)
	if (touchResetFrame > 0 && frameCount >= touchResetFrame) {
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.touchLocation = null;
		touchResetFrame = 0;
	}
```

New:
```
	// Reset touch stimulus after wall-clock expiry (2 seconds)
	if (touchResetTime > 0 && Date.now() >= touchResetTime) {
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.touchLocation = null;
		touchResetTime = 0;
	}
```

**8c.** Replace the wind reset check (lines 1393-1396):

Old:
```
	// Reset wind stimulus after 120 frames (~2 seconds at 60fps)
	if (windResetFrame > 0 && frameCount >= windResetFrame) {
		BRAIN.stimulate.wind = false;
		BRAIN.stimulate.windStrength = 0;
		windResetFrame = 0;
	}
```

New:
```
	// Reset wind stimulus after wall-clock expiry (2 seconds)
	if (windResetTime > 0 && Date.now() >= windResetTime) {
		BRAIN.stimulate.wind = false;
		BRAIN.stimulate.windStrength = 0;
		windResetTime = 0;
	}
```

**8d.** Remove or keep the `frameCount++` line at line 1399:

The `frameCount` variable is no longer used by any timer. Search the file for other usages of `frameCount` before removing. If `frameCount` is not referenced anywhere else in the file (after all the changes above), remove both the declaration at line 25 (`var frameCount = 0;`) and the increment at line 1399 (`frameCount++;`). If it IS referenced elsewhere, keep both and leave a comment noting it is no longer used for stimulus timers.

**Builder instruction for 8d:** Run a mental grep for `frameCount` across the entire file after making changes 1-8c. The only references should be the declaration (line 25) and the increment (line 1399). If that is the case, remove both. If there are other references, keep both.

---

## Summary of all changes

| # | Location | What | Why |
|---|----------|------|-----|
| 1 | Line 26-27 | Rename `touchResetFrame`/`windResetFrame` to `touchResetTime`/`windResetTime` | Variable names reflect new semantics |
| 2 | Line 275 | `windResetFrame = 0` -> `windResetTime = 0` | Track by timestamp |
| 3 | Line 307 | `windResetFrame = frameCount + 120` -> `windResetTime = Date.now() + 2000` | Wall-clock expiry |
| 4 | Line 343 | `touchResetFrame = Math.max(...)` -> `touchResetTime = Math.max(...)` | Wall-clock expiry |
| 5 | Lines 505-506 | While loops -> `normalizeAngle()` | O(1), NaN-safe |
| 6 | Lines 441-442 (updateBehaviorState) | Insert feedStart reset on exit from 'feed' | Fix stale timer leak |
| 7 | Lines 1314-1315 | While loops -> `normalizeAngle()` | O(1), NaN-safe |
| 8a | Lines 1330,1334,1339,1343 | 4x `touchResetFrame = Math.max(...)` -> `touchResetTime = Math.max(...)` | Wall-clock expiry |
| 8b | Lines 1386-1389 | Touch reset check: frameCount -> Date.now() | Wall-clock expiry |
| 8c | Lines 1393-1396 | Wind reset check: frameCount -> Date.now() | Wall-clock expiry |
| 8d | Lines 25, 1399 | Remove `frameCount` if unused | Dead code cleanup |

## Verification
- build: Open `index.html` in a browser (no build step -- vanilla JS)
- lint: `grep -n 'touchResetFrame\|windResetFrame' js/main.js` -- expect zero matches (all renamed)
- lint: `grep -n 'frameCount' js/main.js` -- expect zero matches if removed, or exactly 2 (declaration + increment) if kept
- lint: `grep -n 'while (angleDiff' js/main.js` -- expect zero matches (all replaced with normalizeAngle)
- test: No automated tests exist
- smoke:
  1. Load the page in browser. Click touch tool, click on fly. Verify fly reacts (groom/startle). Wait 2 seconds. Verify touch stimulus clears (touch row in drive panel should decay).
  2. Click air tool, drag on canvas, release. Verify wind stimulus clears after ~2 seconds.
  3. Place food near fly. Wait for fly to enter feed state and begin eating. While feeding, if fly transitions to groom (or another state), note whether food radius resets to full. When fly re-enters feed, verify feeding starts fresh (not instant consumption).
  4. Open DevTools console. Type `normalizeAngle(NaN)` -- should return `NaN`, not hang.

## Constraints
- Do NOT modify any file other than `js/main.js`
- Do NOT modify SPEC.md, CLAUDE.md, TASKS.md, or any .buildloop/ files other than current-plan.md
- Do NOT add new dependencies or files
- Do NOT change the 500ms brain tick interval or the `updateBrain` function
- Do NOT change the 2000ms stimulus duration -- keep the same behavioral timing, just switch from frame-based to wall-clock-based measurement
- Do NOT touch any animation interpolation code (dtScale, Math.pow, etc.) -- those are separate from this fix
- The `normalizeAngle()` helper at lines 32-37 must NOT be modified -- it is correct as-is
