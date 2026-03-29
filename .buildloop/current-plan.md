# Plan: T12.1

Fix three bugs: (1) idle pulse never drawn, (2) wind arrow double radian conversion, (3) missing input validation in executeCommand.

## Dependencies
- list: none
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/caretaker-renderer.js
- operation: MODIFY
- reason: Fix idle pulse not drawing (bug 1) and wind arrow double radian conversion (bug 2)

#### Bug 1: Idle pulse never draws

**Root cause:** Two problems prevent the idle pulse from ever appearing:
1. `update()` (line 111) sets `attentionX = -1` when idle > 3s, destroying the position that `drawIdlePulse()` needs
2. `drawOverlay()` (line 140) never calls `drawIdlePulse()` at all

**Fix approach:** Add `idlePulseX`/`idlePulseY` variables to remember the cursor position when transitioning to idle. Modify `update()` to save position before clearing. Wire `drawIdlePulse()` into `drawOverlay()`. Make `drawIdlePulse()` use the saved position.

##### Change 1a: Add idle pulse position variables
- anchor: `var idleStart = 0;`
- After line `var idleStart = 0;` (line 14), add two new variable declarations:
```js
var idlePulseX = -1;
var idlePulseY = -1;
```

##### Change 1b: Save position before idle reset in update()
- anchor: `if (lastCommandTime === 0 || idleTime > 3000) {`
- Replace the block at lines 111-117:
```js
    if (lastCommandTime === 0 || idleTime > 3000) {
      // Fade out: clear attention so cursor/trail stop drawing
      attentionX = -1;
      attentionY = -1;
      trail = [];
      return;
    }
```
- With:
```js
    if (lastCommandTime === 0 || idleTime > 3000) {
      if (lastCommandTime > 0 && attentionX >= 0) {
        idlePulseX = attentionX;
        idlePulseY = attentionY;
      }
      attentionX = -1;
      attentionY = -1;
      trail = [];
      return;
    }
    idlePulseX = -1;
    idlePulseY = -1;
```
- The `idlePulseX = -1; idlePulseY = -1;` lines go right after the closing `}` of the idle block but before the existing `if (attentionX < 0) return;` on line 118. This ensures idle pulse coordinates are cleared when the cursor is active (not idle).

##### Change 1c: Reset idlePulseX/Y on disconnect
- anchor: `trail = [];` inside `setConnected` (the one at line 95, inside the `} else {` block of `setConnected`)
- After the existing `activeEffects = [];` line (line 96), add:
```js
      idlePulseX = -1;
      idlePulseY = -1;
```

##### Change 1d: Wire drawIdlePulse into drawOverlay
- anchor: `function drawOverlay(ctx) {`
- Replace the entire `drawOverlay` function (lines 140-147):
```js
  function drawOverlay(ctx) {
    if (!caretakerConnected) return;
    drawEffects(ctx);
    if (attentionX >= 0) {
      drawTrail(ctx);
      drawCursor(ctx);
    }
    drawIdlePulse(ctx);
  }
```
- The only change is adding `drawIdlePulse(ctx);` as the last line before the closing `}`.

##### Change 1e: Rewrite drawIdlePulse to use idlePulseX/Y
- anchor: `function drawIdlePulse(ctx) {`
- Replace the entire `drawIdlePulse` function (lines 250-274):
```js
  function drawIdlePulse(ctx) {
    if (idlePulseX < 0) return;
    var t = (Date.now() % 1500) / 1500;
    var beat = 0;
    if (t < 0.15) {
      beat = Math.sin(t / 0.15 * Math.PI);
    } else if (t < 0.3) {
      beat = 0;
    } else if (t < 0.45) {
      beat = Math.sin((t - 0.3) / 0.15 * Math.PI) * 0.6;
    } else {
      beat = 0;
    }
    if (beat > 0) {
      var pulseRadius = CURSOR_SIZE / 2 + 4 + beat * 6;
      var pulseAlpha = beat * 0.25;
      ctx.beginPath();
      ctx.arc(idlePulseX, idlePulseY, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = CLAUDE_ORANGE + pulseAlpha.toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
```
- Changes from original: line 1 checks `idlePulseX < 0` instead of `attentionX < 0`; removed the `timeSinceCommand` check (redundant -- `idlePulseX >= 0` already implies idle > 3s); line `ctx.arc` uses `idlePulseX, idlePulseY` instead of `attentionX, attentionY`.

#### Bug 2: Wind arrow double radian conversion

**Root cause:** `caretaker-bridge.js` line 73 stores `params.direction` directly as `BRAIN.stimulate.windDirection`. In `main.js`, `windDirection` is computed via `Math.atan2()` (lines 860, 873, 876) which returns radians. The caretaker server sends direction in the same unit (radians). But `caretaker-renderer.js` line 226 does `angle = e.params.direction * Math.PI / 180` -- treating the radian value as degrees and converting again.

**Known pattern match:** "Radians/degrees unit mismatch in angle wrapping" -- confirmed this is a radian value being treated as degrees.

##### Change 2a: Remove degree-to-radian conversion
- anchor: `angle = e.params.direction * Math.PI / 180;`
- Replace line 226:
```js
        angle = e.params.direction * Math.PI / 180;
```
- With:
```js
        angle = e.params.direction;
```

### 2. MODIFY js/caretaker-bridge.js
- operation: MODIFY
- reason: Add bounds checking on incoming command parameters (bug 3)

#### Input validation in executeCommand()

The function already has some validation (light/temp maps, windStrength clamp) but lacks:
- `place_food`: no check that params.x/params.y are finite numbers
- `set_light`/`set_temp`: no warning on invalid values (silently ignores)
- `touch`: no bounds clamping on x/y
- `blow_wind`: no validation of params.x/params.y if provided

**Canvas bounds reference:** The codebase uses `window.innerWidth` and `window.innerHeight` for bounds (see main.js:2047-2048, main.js:835-836). The toolbar is 44px tall (getLayoutBounds in main.js:79). Use these same values for consistency.

##### Change 3a: Add validation to place_food
- anchor: `case 'place_food':`
- Replace the entire place_food case (lines 36-40):
```js
      case 'place_food':
        if (typeof params.x !== 'number' || typeof params.y !== 'number' ||
            !isFinite(params.x) || !isFinite(params.y)) {
          console.warn('[caretaker] place_food: invalid x/y', params.x, params.y);
          break;
        }
        var fx = Math.max(0, Math.min(window.innerWidth, params.x));
        var fy = Math.max(44, Math.min(window.innerHeight, params.y));
        food.push({ x: fx, y: fy, radius: 10, feedStart: 0, feedDuration: 0, eaten: 0 });
        break;
```

##### Change 3b: Add else-warn to set_light
- anchor: `case 'set_light':`
- Replace the entire set_light case (lines 41-52):
```js
      case 'set_light':
        if (lightMap.hasOwnProperty(params.level)) {
          var li = lightMap[params.level];
          lightStateIndex = li;
          BRAIN.stimulate.lightLevel = lightStates[li];
          document.getElementById('lightBtn').textContent = 'Light: ' + lightLabels[li];
        } else if (typeof params.level === 'number' && params.level >= 0 && params.level <= 2) {
          var li2 = Math.floor(params.level);
          lightStateIndex = li2;
          BRAIN.stimulate.lightLevel = lightStates[li2];
          document.getElementById('lightBtn').textContent = 'Light: ' + lightLabels[li2];
        } else {
          console.warn('[caretaker] set_light: invalid level (expected bright/dim/dark or 0-2):', params.level);
        }
        break;
```
- Note: added `Math.floor(params.level)` to the numeric branch to ensure integer index. The original used `params.level` directly which could be a float like 1.5.

##### Change 3c: Add else-warn to set_temp
- anchor: `case 'set_temp':`
- Replace the entire set_temp case (lines 53-64):
```js
      case 'set_temp':
        if (tempMap.hasOwnProperty(params.level)) {
          var ti = tempMap[params.level];
          tempStateIndex = ti;
          BRAIN.stimulate.temperature = tempStates[ti];
          document.getElementById('tempBtn').textContent = 'Temp: ' + tempLabels[ti];
        } else if (typeof params.level === 'number' && params.level >= 0 && params.level <= 2) {
          var ti2 = Math.floor(params.level);
          tempStateIndex = ti2;
          BRAIN.stimulate.temperature = tempStates[ti2];
          document.getElementById('tempBtn').textContent = 'Temp: ' + tempLabels[ti2];
        } else {
          console.warn('[caretaker] set_temp: invalid level (expected warm/neutral/cool or 0-2):', params.level);
        }
        break;
```
- Same `Math.floor` addition for numeric branch.

##### Change 3d: Add bounds clamping to touch
- anchor: `case 'touch':`
- Replace the entire touch case (lines 67-69):
```js
      case 'touch':
        var tx = typeof params.x === 'number' && isFinite(params.x)
          ? Math.max(0, Math.min(window.innerWidth, params.x)) : fly.x;
        var ty = typeof params.y === 'number' && isFinite(params.y)
          ? Math.max(44, Math.min(window.innerHeight, params.y)) : fly.y;
        applyTouchTool(tx, ty);
        break;
```
- This validates x/y are finite numbers and clamps to canvas bounds. Falls back to `fly.x`/`fly.y` if not provided or invalid (preserving existing default behavior).

##### Change 3e: Add validation to blow_wind
- anchor: `case 'blow_wind':`
- Replace the entire blow_wind case (lines 70-75):
```js
      case 'blow_wind':
        BRAIN.stimulate.wind = true;
        BRAIN.stimulate.windStrength = Math.min(1, Math.max(0,
          typeof params.strength === 'number' && isFinite(params.strength) ? params.strength : 0.5));
        BRAIN.stimulate.windDirection = typeof params.direction === 'number' && isFinite(params.direction)
          ? params.direction : 0;
        windResetTime = Date.now() + 2000;
        break;
```
- Validates `strength` is a finite number before clamping to [0,1], defaults to 0.5 if invalid.
- Validates `direction` is a finite number, defaults to 0 if invalid.
- Note: `params.x`/`params.y` are not used by blow_wind in either the bridge or the renderer (renderer uses `fly.x`/`fly.y`), so no x/y clamping is needed here. The renderer receives the raw params object via `CaretakerRenderer.onCommand(action, params)` but ignores x/y for blow_wind.

## Verification
- build: No build step. Files are served directly (vanilla JS, no transpilation).
- lint: No linter configured. Manually verify no syntax errors by opening the page.
- test: No existing test suite. Verify manually.
- smoke: Open the app in a browser. Connect the caretaker WebSocket server (or mock one). Verify:
  1. **Idle pulse**: After a caretaker command, wait > 3 seconds. A pulsing orange ring should appear at the last cursor position (heartbeat rhythm: two beats per 1.5s cycle). Before 3s, no pulse. On disconnect, pulse disappears.
  2. **Wind arrow**: Send a `blow_wind` command with `direction: Math.PI/2` (pointing down in canvas coords). The orange arrow should point downward, not at a near-zero angle (which was the bug -- `PI/2 * PI/180 ≈ 0.027 rad`).
  3. **Input validation**: Send `place_food` with `x: "abc"` -- should log warning, not crash. Send `set_light` with `level: "invalid"` -- should log warning. Send `touch` with `x: 99999` -- should clamp to canvas width. Send `blow_wind` with `strength: 5` -- should clamp to 1.0.

## Constraints
- Do NOT modify any file other than `js/caretaker-renderer.js` and `js/caretaker-bridge.js`
- Do NOT change the exported API of either module (window.CaretakerRenderer and window.caretakerBridge must keep the same public methods)
- Use ES5 style throughout (var, not let/const) -- matches existing codebase convention
- Do NOT add new dependencies or imports
- Do NOT modify CLAUDE.md, SPEC.md, or TASKS.md
