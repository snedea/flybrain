# Plan: D2.1

## Dependencies
- list: [] (no new dependencies)
- commands: [] (nothing to install)

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Two bugs to fix: (1) position update missing dtScale, (2) speed can go negative after idle/groom/rest deceleration when stale speedChangeInterval is applied

#### Change 1: Multiply position increments by dtScale

- anchor: the two lines at approximately line 1306-1307:
  ```js
  fly.x += Math.cos(facingDir) * speed;
  fly.y -= Math.sin(facingDir) * speed;
  ```
- action: Replace those two lines with:
  ```js
  fly.x += Math.cos(facingDir) * speed * dtScale;
  fly.y -= Math.sin(facingDir) * speed * dtScale;
  ```
- rationale: `speed` is already dt-scaled (via `speed += speedChangeInterval * dtScale` at line 1252 and `speed *= Math.pow(0.92, dtScale)` in `applyBehaviorMovement`), but those scale the *rate of change* of speed, not the *displacement*. The displacement `position += velocity * dt` must also include the time factor. Without `dtScale`, a 120Hz display applies the same per-frame displacement twice as often as 60Hz, doubling distance-per-second.

#### Change 2: Floor speed at 0 after speedChangeInterval application

- anchor: the line at approximately line 1252:
  ```js
  speed += speedChangeInterval * dtScale;
  ```
- action: Insert one line immediately after `speed += speedChangeInterval * dtScale;`:
  ```js
  if (speed < 0) speed = 0;
  ```
- rationale: When `applyBehaviorMovement()` sets `speed = 0` (idle/groom/rest states at line 568), `speedChangeInterval` may still hold a stale negative value from the previous 500ms brain tick (e.g. `speedChangeInterval = -speed * 0.1` computed when speed was nonzero). The next frame applies `speed += negativeValue * dtScale`, producing a negative speed. Negative speed causes the fly to briefly jitter backward (cos/sin displacement reverses). The floor prevents this. Using `if (speed < 0) speed = 0;` is equivalent to `speed = Math.max(0, speed)` but avoids a function call per frame.
- important: Place this line AFTER `speed += speedChangeInterval * dtScale;` and BEFORE the `var facingMinusTarget = facingDir - targetDir;` line. Do NOT place it before the speed increment or inside `applyBehaviorMovement()`.

## Verification
- build: No build step. Open `index.html` in a browser.
- lint: No linter configured.
- test: No existing tests.
- smoke: Open `index.html` in a browser. Observe: (1) the fly moves at a consistent apparent speed regardless of monitor refresh rate (if only one display available, verify the position update lines include `* dtScale` by reading the code), (2) when the fly enters idle/groom/rest state (stops walking), it should decelerate smoothly to zero without any backward jitter or vibration. Watch for the transition from walk to idle -- the fly should stop cleanly, not twitch backward.

## Constraints
- Do NOT modify any file other than `js/main.js`
- Do NOT modify the `applyBehaviorMovement()` function
- Do NOT modify the `speedChangeInterval` computation in `updateBrainTick()` or any of the behavior state blocks that set `speedChangeInterval`
- Do NOT change the angle wrapping, edge avoidance, or screen bounds code
- Do NOT add new variables or functions -- both fixes are single-line changes to existing code
- The total diff should be exactly 3 changed lines (2 modified position lines + 1 inserted speed floor line)
