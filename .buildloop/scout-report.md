# Scout Report: T5.1

## Key Facts (read this first)

- **Tech stack**: Pure browser JavaScript, no build step, no framework. Two files to modify: `js/main.js` (~1547 lines) and `js/connectome.js` (~497 lines). Scripts loaded via `<script>` tags in `index.html`.
- **Critical files**: `js/main.js` (behavior state machine, drawing, input handlers) and `js/connectome.js` (BRAIN object, sensory stimulation, drive updates). `js/constants.js` is read-only weights.
- **Wind wiring today**: `BRAIN.stimulate.wind` (bool) + `BRAIN.stimulate.windStrength` (0–1) exist. `windDirection` does NOT exist yet. The floor `Math.max(0.3, windStrength)` in connectome.js line 328 is the bug causing uniform fear at all intensities.
- **Coordinate system**: Canvas Y increases downward; all angle math uses standard trig convention (right=0, up=negative canvas Y). Pattern for converting screen→math coords is `Math.atan2(-dy, dx)` — used for food angle (line 584) and phototaxis (line 605).
- **Brain tick rate**: 500ms interval (`setInterval(updateBrain, 500)` at line 226). `updateBrain` → `BRAIN.update()` → `updateBehaviorState()` → `computeMovementForBehavior()`.

## Relevant Files

| File | Relevance |
|------|-----------|
| `js/main.js` | All four change areas: input handlers (wind direction), behavior state machine (brace state), drawing (legs, antennae), and BEHAVIOR_MIN_DURATION/COOLDOWN constants |
| `js/connectome.js` | Change 4: wind section lines 326–330, replace `Math.max(0.3, windStrength)` with raw `windStrength`; also `BRAIN.stimulate` declaration (line 134) needs `windDirection` field |

## Architecture Notes

**Behavior state machine flow** (all in `js/main.js`):
1. `BEHAVIOR_MIN_DURATION` (line 48) — object literal, add `brace: 500`
2. `BEHAVIOR_COOLDOWN` (line 61) — object literal, add `brace: 1000`
3. `evaluateBehaviorEntry()` (line 461) — priority chain, insert brace check between groom and rest (after line 476)
4. `syncBrainFlags()` (line 555) — sets `BRAIN._isMoving`; brace is non-moving, so exclude from moving list
5. `computeMovementForBehavior()` (line 568) — add brace branch setting `targetSpeed=0` and `targetDir=BRAIN.stimulate.windDirection + Math.PI`
6. `applyBehaviorMovement()` (line 653) — add brace to the speed-damping block (currently `groom || rest || idle` at line 671)

**Wind input handlers** (both in `js/main.js`):
- `handleCanvasMousemove` (line 359): during drag, compute `windDirection = Math.atan2(-(event.clientY - dragStart.y), event.clientX - dragStart.x)` and set `BRAIN.stimulate.windDirection`
- `handleCanvasMouseup` (line 370): for the short-drag case (dist<5), direction is undefined so set a fallback (e.g. 0 or toward fly); for the normal case, use the same atan2

**Drawing hooks** (both in `js/main.js`):
- `drawLegs(state, dtScale)` (line 1212): add `var isBracing = (state === 'brace')` alongside existing flags; in the else-if chain (currently ends at line 1301 `else {}`), add `else if (isBracing) { hipMod *= 1.1; jitter *= 0.1; }`
- `drawAntennae(t, dtScale)` (line 1143): after computing `baseAngle` (line 1161), if wind is active, blend toward wind source direction. Wind direction in body-local frame: `localWindAngle = normalizeAngle(BRAIN.stimulate.windDirection - facingDir + Math.PI/2)`, then add a small fraction of that offset to `baseAngle`

**BRAIN.stimulate declaration** in `js/connectome.js` line 134:
```javascript
BRAIN.stimulate = {
    // ... existing fields ...
    windDirection: 0,  // ADD THIS
};
```

**Tab-hide reset** at `js/main.js` line 256: currently resets `wind` and `windStrength` — also reset `windDirection: 0`.

**connectome.js wind section** (lines 326–330):
```javascript
// Current (buggy floor):
var windScale = Math.max(0.3, BRAIN.stimulate.windStrength);
// Fix: remove floor so weak wind = less MECH_JO
var windScale = BRAIN.stimulate.windStrength;
```

## Suggested Approach

1. **connectome.js first**: Add `windDirection: 0` to `BRAIN.stimulate`, and remove `Math.max(0.3, ...)` floor from wind section (simplest, isolated change).
2. **main.js input handlers**: Add windDirection computation to `handleCanvasMousemove` and `handleCanvasMouseup`. Short-drag case (dist<5) doesn't have a drag vector — use a neutral fallback or derive from fly position relative to click point.
3. **main.js behavior state machine**: Add brace to BEHAVIOR_MIN_DURATION, BEHAVIOR_COOLDOWN, evaluateBehaviorEntry, syncBrainFlags, computeMovementForBehavior, applyBehaviorMovement. Entry condition: `BRAIN.stimulate.wind && BRAIN.stimulate.windStrength < 0.5 && BRAIN.accumStartle < BEHAVIOR_THRESHOLDS.startle && !isCoolingDown('brace', now)`.
4. **main.js drawing**: Add brace branch to drawLegs (widen hip by ~10%, suppress jitter by 0.1). Add wind-sensing antenna bias to drawAntennae (convert windDirection to body-local coords).

## Risks and Constraints (read this last)

- **Antenna local-space conversion**: `drawAntennae` runs inside a canvas transform (`ctx.rotate(-facingDir + Math.PI/2)` at line 1516 of drawFlyBody context). The world-space `windDirection` must be rotated into body space before adding to `baseAngle`. Formula: `localWindAngle = normalizeAngle(BRAIN.stimulate.windDirection - (facingDir - Math.PI/2))`. Get this wrong and the antenna will point the wrong direction. Verify sign conventions against the phototaxis and food-seek patterns.
- **Short-drag case in handleCanvasMouseup**: When `dragDist < 5`, there is no drag vector, so `atan2(0,0)` is meaningless. The code currently sets windStrength from distance to fly, but no direction. Best approach: skip setting windDirection (leave at 0 or previous value), or compute direction from dragStart→fly position.
- **brace vs startle priority**: `evaluateBehaviorEntry` is checked every 500ms. Brace must be inserted after groom (line 475) and before rest (line 477). Because `accumStartle >= 30` check for startle already has higher priority, the `BRAIN.accumStartle < BEHAVIOR_THRESHOLDS.startle` guard in brace entry is redundant but harmless — keep it for clarity.
- **windDirection reset on tab resume**: line 256 resets `wind` and `windStrength`. Add `BRAIN.stimulate.windDirection = 0;` there too.
- **drawLegs jitter suppression**: The variable `jitter` is only set in certain branches; the brace branch must set it to `anim.legJitter[legIdx] * 0.1` explicitly (not multiply the existing `jitter` variable which starts at 0). The hip widening should do `hipMod *= 1.1` (using the already-loaded `restAngles.hip` value).
- **No MECH_JO structural change needed**: The connectome weights for MECH_JO are fine (`DN_STARTLE: 3`). Only the scale value passed to `dendriteAccumulateScaled` needs to change (remove the 0.3 floor). The brace behavior itself is implemented entirely in the main.js behavior state machine, not by wiring new connectome weights.
