# Plan: T8.3

Canvas rendering of Claude's visual presence -- cursor, interaction indicators, attention trail, idle pulse, toolbar highlights.

## Dependencies
- list: none (vanilla JS, no packages)
- commands: none

## File Operations (in execution order)

### 1. CREATE svg/claude-cursor.svg
- operation: CREATE
- reason: Claude logo silhouette SVG used as the caretaker cursor on canvas. Rendered as a small (20x20) orange icon.

#### Content
Create a minimal SVG file (viewBox="0 0 20 20") containing the Claude logo silhouette. Use a simplified "spark" or "asterisk" shape that is recognizable at small size. The shape is a stylized 6-pointed star/spark with rounded tips, filled solid (no stroke). Use `fill="#E3734B"` for the orange color. Keep the SVG under 1KB.

Exact SVG content:
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="20" height="20">
  <path d="M10 0 C10.5 4, 12 6, 16 7 C12 8, 10.5 10, 10 14 C9.5 10, 8 8, 4 7 C8 6, 9.5 4, 10 0Z" fill="#E3734B"/>
  <circle cx="10" cy="16.5" r="2" fill="#E3734B"/>
</svg>
```
This produces a 4-pointed spark with a small dot below it -- a recognizable simplified Claude "spark" logo.

### 2. CREATE js/caretaker-renderer.js
- operation: CREATE
- reason: Canvas overlay module that draws all Claude visual presence indicators. Called from the main draw loop and fed events from caretaker-bridge.js.

#### Module Structure
The file is an IIFE that exposes `window.CaretakerRenderer` with methods called from other files.

#### State Variables (module-scoped)
```javascript
var cursorImg = null;            // HTMLImageElement for claude-cursor.svg
var cursorLoaded = false;        // true once SVG image is decoded
var attentionX = -1;             // current Claude attention point X (-1 = not active)
var attentionY = -1;             // current Claude attention point Y
var attentionTargetX = -1;       // target attention point X (lerps toward this)
var attentionTargetY = -1;       // target attention point Y
var trail = [];                  // array of {x, y, time} for attention trail
var TRAIL_MAX = 40;              // max trail points
var TRAIL_LIFETIME = 2000;       // trail point lifetime in ms

var activeEffects = [];          // array of {type, x, y, startTime, params}
                                 // type: 'ripple' | 'ring' | 'arrow' | 'toolbar'

var idleStart = 0;               // Date.now() when Claude entered idle/observing
var lastCommandTime = 0;         // Date.now() of last command received
var caretakerConnected = false;  // whether caretaker WS is connected

var CURSOR_SIZE = 20;            // px, rendered size of Claude cursor icon
var CLAUDE_ORANGE = 'rgba(227, 115, 75, ';  // base color prefix for rgba
var CLAUDE_ORANGE_HEX = '#E3734B';
```

#### Functions

- signature: `function init()`
  - purpose: Load the Claude cursor SVG into an Image element for canvas drawing
  - logic:
    1. Create `new Image()`
    2. Set `cursorImg.src = './svg/claude-cursor.svg'`
    3. On `cursorImg.onload`, set `cursorLoaded = true`
    4. Call `init()` at module load time (bottom of IIFE)
  - calls: none
  - returns: void
  - error handling: On `cursorImg.onerror`, log warning `'[caretaker-renderer] Failed to load cursor SVG'` and leave `cursorLoaded = false`

- signature: `function onCommand(action, params)`
  - purpose: Called by caretaker-bridge.js when a command is received from the agent. Records the command as a visual effect and updates attention point.
  - logic:
    1. Set `lastCommandTime = Date.now()`
    2. Switch on `action`:
       - `'place_food'`: Set `attentionTargetX = params.x`, `attentionTargetY = params.y`. Push `{type: 'ripple', x: params.x, y: params.y, startTime: Date.now()}` to `activeEffects`. Call `highlightToolbar('feed')`.
       - `'touch'`: Compute `tx = params.x !== undefined ? params.x : fly.x`, `ty = params.y !== undefined ? params.y : fly.y`. Set `attentionTargetX = tx`, `attentionTargetY = ty`. Push `{type: 'ring', x: tx, y: ty, startTime: Date.now()}` to `activeEffects`. Call `highlightToolbar('touch')`.
       - `'blow_wind'`: Set `attentionTargetX = fly.x`, `attentionTargetY = fly.y`. Push `{type: 'arrow', x: fly.x, y: fly.y, startTime: Date.now(), params: {strength: params.strength || 0.5, direction: params.direction || 0}}` to `activeEffects`. Call `highlightToolbar('air')`.
       - `'set_light'`: Call `highlightToolbar('light')`. Set `attentionTargetX = fly.x`, `attentionTargetY = fly.y`.
       - `'set_temp'`: Call `highlightToolbar('temp')`. Set `attentionTargetX = fly.x`, `attentionTargetY = fly.y`.
       - `'clear_food'`: Call `highlightToolbar('feed')`. Set `attentionTargetX = fly.x`, `attentionTargetY = fly.y`.
       - default: Set `attentionTargetX = fly.x`, `attentionTargetY = fly.y`.
    3. If `attentionX < 0` (first command, cursor not yet placed), snap directly: `attentionX = attentionTargetX`, `attentionY = attentionTargetY`.
  - calls: `highlightToolbar(toolName)`
  - returns: void
  - error handling: none

- signature: `function setConnected(isConnected)`
  - purpose: Track caretaker connection status. When connected, start idle timer. When disconnected, hide cursor.
  - logic:
    1. Set `caretakerConnected = isConnected`
    2. If `isConnected` and `idleStart === 0`, set `idleStart = Date.now()`
    3. If `!isConnected`, set `attentionX = -1`, `attentionY = -1`, clear `trail` array, clear `activeEffects` array
  - calls: none
  - returns: void
  - error handling: none

- signature: `function highlightToolbar(toolName)`
  - purpose: Add temporary orange glow CSS class to a toolbar button when Claude uses that tool
  - logic:
    1. Find button: `var btn = document.querySelector('.tool-btn[data-tool="' + toolName + '"]')`
    2. If `btn === null`, return
    3. Add class: `btn.classList.add('claude-highlight')`
    4. Remove after 1500ms: `setTimeout(function() { btn.classList.remove('claude-highlight'); }, 1500)`
  - calls: none
  - returns: void
  - error handling: If button not found, return silently

- signature: `function update(dt)`
  - purpose: Update attention point position (lerp), prune expired trail points and effects. Called every frame from main update loop.
  - logic:
    1. If `!caretakerConnected` or `attentionX < 0`, return
    2. Lerp attention position toward target:
       - `var lerpSpeed = 0.08`
       - `attentionX += (attentionTargetX - attentionX) * lerpSpeed`
       - `attentionY += (attentionTargetY - attentionY) * lerpSpeed`
    3. Snap if close: if `Math.abs(attentionX - attentionTargetX) < 0.5 && Math.abs(attentionY - attentionTargetY) < 0.5`, snap `attentionX = attentionTargetX`, `attentionY = attentionTargetY`
    4. Add trail point: If `trail.length === 0` or distance from last trail point > 3px (`Math.hypot(attentionX - trail[trail.length-1].x, attentionY - trail[trail.length-1].y) > 3`), push `{x: attentionX, y: attentionY, time: Date.now()}`
    5. Prune trail: Remove entries older than `TRAIL_LIFETIME` from front of array. Use while loop: `while (trail.length > 0 && Date.now() - trail[0].time > TRAIL_LIFETIME) trail.shift()`
    6. Cap trail length: `while (trail.length > TRAIL_MAX) trail.shift()`
    7. Prune expired effects: Loop `activeEffects` from end to start. Remove if:
       - type `'ripple'`: elapsed > 800ms
       - type `'ring'`: elapsed > 600ms
       - type `'arrow'`: elapsed > 1200ms
  - calls: none
  - returns: void
  - error handling: none

- signature: `function drawOverlay(ctx)`
  - purpose: Draw all Claude visual indicators on the main canvas. Called from main `draw()` after fly is rendered.
  - logic:
    1. If `!caretakerConnected`, return immediately
    2. Call `drawTrail(ctx)`
    3. Call `drawEffects(ctx)`
    4. Call `drawCursor(ctx)`
    5. Call `drawIdlePulse(ctx)`
  - calls: `drawTrail(ctx)`, `drawEffects(ctx)`, `drawCursor(ctx)`, `drawIdlePulse(ctx)`
  - returns: void
  - error handling: none

- signature: `function drawTrail(ctx)`
  - purpose: Draw faint orange line showing Claude's recent attention path
  - logic:
    1. If `trail.length < 2`, return
    2. `var now = Date.now()`
    3. Loop `i = 1` to `trail.length - 1`:
       - Compute `age = now - trail[i].time`
       - Compute `alpha = (1 - age / TRAIL_LIFETIME) * 0.25` (faint, max 0.25 opacity)
       - If `alpha <= 0`, continue
       - `ctx.beginPath()`
       - `ctx.moveTo(trail[i-1].x, trail[i-1].y)`
       - `ctx.lineTo(trail[i].x, trail[i].y)`
       - `ctx.strokeStyle = CLAUDE_ORANGE + alpha.toFixed(3) + ')'`
       - `ctx.lineWidth = 1.5`
       - `ctx.stroke()`
  - calls: none
  - returns: void
  - error handling: none

- signature: `function drawCursor(ctx)`
  - purpose: Draw the Claude logo cursor at the current attention point
  - logic:
    1. If `attentionX < 0`, return
    2. If `cursorLoaded`:
       - `ctx.globalAlpha = 0.85`
       - `ctx.drawImage(cursorImg, attentionX - CURSOR_SIZE / 2, attentionY - CURSOR_SIZE / 2, CURSOR_SIZE, CURSOR_SIZE)`
       - `ctx.globalAlpha = 1.0`
    3. If `!cursorLoaded` (fallback -- draw a small orange diamond):
       - `ctx.beginPath()`
       - `ctx.moveTo(attentionX, attentionY - 8)`
       - `ctx.lineTo(attentionX + 6, attentionY)`
       - `ctx.lineTo(attentionX, attentionY + 8)`
       - `ctx.lineTo(attentionX - 6, attentionY)`
       - `ctx.closePath()`
       - `ctx.fillStyle = CLAUDE_ORANGE + '0.85)'`
       - `ctx.fill()`
  - calls: none
  - returns: void
  - error handling: none

- signature: `function drawEffects(ctx)`
  - purpose: Draw active interaction indicators (ripples, rings, arrows)
  - logic:
    1. `var now = Date.now()`
    2. Loop over `activeEffects` array (forward loop, no removal here -- update() handles pruning):
       - `var e = activeEffects[i]`
       - `var elapsed = now - e.startTime`
       - If `e.type === 'ripple'`: Draw orange expanding ripple/pulse for place_food
         - Draw 2 concentric expanding rings
         - Ring 1: `var p1 = elapsed / 800; var r1 = p1 * 35; var a1 = (1 - p1) * 0.6`
         - Ring 2 (delayed 200ms): `var p2 = Math.max(0, (elapsed - 200)) / 800; var r2 = p2 * 35; var a2 = (1 - p2) * 0.4`
         - For each ring (if progress <= 1): `ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.strokeStyle = CLAUDE_ORANGE + a.toFixed(3) + ')'; ctx.lineWidth = 2 * (1 - p); ctx.stroke()`
       - If `e.type === 'ring'`: Draw orange ring for touch
         - `var p = elapsed / 600; var r = 8 + p * 20; var a = (1 - p) * 0.7`
         - `ctx.beginPath(); ctx.arc(e.x, e.y, r, 0, Math.PI * 2); ctx.strokeStyle = CLAUDE_ORANGE + a.toFixed(3) + ')'; ctx.lineWidth = 2.5 * (1 - p); ctx.stroke()`
         - Also draw inner fill flash: `ctx.beginPath(); ctx.arc(e.x, e.y, 6 * (1 - p), 0, Math.PI * 2); ctx.fillStyle = CLAUDE_ORANGE + (a * 0.3).toFixed(3) + ')'; ctx.fill()`
       - If `e.type === 'arrow'`: Draw orange wind arrow
         - `var p = elapsed / 1200`
         - Compute arrow direction from `e.params.direction` (degrees to radians): `var angle = e.params.direction * Math.PI / 180`
         - Arrow length: `var len = 40 * e.params.strength`
         - Arrow endpoint: `var ex = e.x + Math.cos(angle) * len`, `var ey = e.y + Math.sin(angle) * len`
         - Arrow alpha: `var a = (1 - p) * 0.6`
         - Draw shaft: `ctx.beginPath(); ctx.moveTo(e.x, e.y); ctx.lineTo(ex, ey); ctx.strokeStyle = CLAUDE_ORANGE + a.toFixed(3) + ')'; ctx.lineWidth = 2.5; ctx.stroke()`
         - Draw arrowhead (same pattern as main.js `drawWindArrow`):
           - `var headLen = 8`
           - `ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(angle - 0.4) * headLen, ey - Math.sin(angle - 0.4) * headLen); ctx.moveTo(ex, ey); ctx.lineTo(ex - Math.cos(angle + 0.4) * headLen, ey - Math.sin(angle + 0.4) * headLen); ctx.strokeStyle = CLAUDE_ORANGE + a.toFixed(3) + ')'; ctx.lineWidth = 2.5; ctx.stroke()`
  - calls: none
  - returns: void
  - error handling: none

- signature: `function drawIdlePulse(ctx)`
  - purpose: Draw gentle heartbeat glow around cursor when Claude is observing (no recent command)
  - logic:
    1. If `attentionX < 0`, return
    2. `var timeSinceCommand = Date.now() - lastCommandTime`
    3. If `timeSinceCommand < 3000`, return (only show pulse when idle for 3+ seconds)
    4. Heartbeat uses a double-bump sine pattern:
       - `var t = (Date.now() % 1500) / 1500` (1.5 second cycle)
       - `var beat = 0`
       - If `t < 0.15`: `beat = Math.sin(t / 0.15 * Math.PI)` (first bump)
       - Else if `t < 0.3`: `beat = 0` (gap)
       - Else if `t < 0.45`: `beat = Math.sin((t - 0.3) / 0.15 * Math.PI) * 0.6` (second bump, smaller)
       - Else: `beat = 0` (rest)
    5. If `beat > 0`:
       - `var pulseRadius = CURSOR_SIZE / 2 + 4 + beat * 6`
       - `var pulseAlpha = beat * 0.25`
       - `ctx.beginPath()`
       - `ctx.arc(attentionX, attentionY, pulseRadius, 0, Math.PI * 2)`
       - `ctx.strokeStyle = CLAUDE_ORANGE + pulseAlpha.toFixed(3) + ')'`
       - `ctx.lineWidth = 1.5`
       - `ctx.stroke()`
  - calls: none
  - returns: void
  - error handling: none

#### Wiring / Integration (module export)
At the bottom of the IIFE, expose:
```javascript
window.CaretakerRenderer = {
    onCommand: onCommand,
    setConnected: setConnected,
    update: update,
    drawOverlay: drawOverlay
};
```

Call `init()` at module load time (inside the IIFE, after all function declarations).

### 3. MODIFY js/caretaker-bridge.js
- operation: MODIFY
- reason: Hook into command execution to notify CaretakerRenderer of each command, and notify on connection state changes.
- anchor: `switch (action) {`

#### Modification 1: Notify renderer on command
After the `switch` block (after the closing `}` of the switch on line 71), add:
```javascript
if (typeof CaretakerRenderer !== 'undefined') {
    CaretakerRenderer.onCommand(action, params);
}
```

Exact anchor for placement: Insert AFTER line 71 (`}` closing the default case), BEFORE the closing `}` of `executeCommand()` function.

The existing code ends:
```javascript
      default:
        console.warn('[caretaker] Unknown action:', action);
    }
  }
```

Change to:
```javascript
      default:
        console.warn('[caretaker] Unknown action:', action);
    }
    if (typeof CaretakerRenderer !== 'undefined') {
      CaretakerRenderer.onCommand(action, params);
    }
  }
```

#### Modification 2: Notify renderer on connection state
Anchor: `connected = true;` (line 81, inside ws.onopen)

After `connected = true;` on line 81, add:
```javascript
if (typeof CaretakerRenderer !== 'undefined') { CaretakerRenderer.setConnected(true); }
```

Anchor: `connected = false;` (line 88, inside ws.onclose)

After `connected = false;` on line 88, add:
```javascript
if (typeof CaretakerRenderer !== 'undefined') { CaretakerRenderer.setConnected(false); }
```

### 4. MODIFY js/main.js
- operation: MODIFY
- reason: Call CaretakerRenderer.update() in the update loop and CaretakerRenderer.drawOverlay() in the draw function.
- anchor (draw function): `ctx.fillStyle = 'rgba(255,255,255,0.08)';`
- anchor (update/loop): `if (typeof Brain3D !== 'undefined' && Brain3D.active) { Brain3D.update(); }`

#### Modification 1: Add overlay drawing at end of draw()
Find the debug dot block at the end of `draw()` (line 1840-1844):
```javascript
    // Small dot showing fly's "nose" target for debugging (very faint)
    ctx.beginPath();
    ctx.arc(fly.x, fly.y, 2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
```

AFTER this block (after `ctx.fill();` on line 1844), insert:
```javascript
    if (typeof CaretakerRenderer !== 'undefined') { CaretakerRenderer.drawOverlay(ctx); }
```

#### Modification 2: Add CaretakerRenderer.update() in loop
Find the loop function (line 1869). The existing code on line 1880-1881:
```javascript
    update(dt);
    if (typeof Brain3D !== 'undefined' && Brain3D.active) { Brain3D.update(); }
```

AFTER the Brain3D update line (line 1881), insert:
```javascript
    if (typeof CaretakerRenderer !== 'undefined') { CaretakerRenderer.update(dt); }
```

### 5. MODIFY index.html
- operation: MODIFY
- reason: Load caretaker-renderer.js before caretaker-bridge.js so the renderer is available when commands arrive.
- anchor: `<script src="./js/caretaker-bridge.js"></script>`

Find line 99:
```html
<script src="./js/caretaker-bridge.js"></script>
```

Insert BEFORE this line:
```html
<script src="./js/caretaker-renderer.js"></script>
```

So the final order is:
```html
<script src="./js/main.js"></script>
<script src="./js/caretaker-renderer.js"></script>
<script src="./js/caretaker-bridge.js"></script>
```

### 6. MODIFY css/main.css
- operation: MODIFY
- reason: Add CSS class for toolbar button highlight when Claude uses a tool.
- anchor: `.tool-btn.active {`

Find the `.tool-btn.active` block (around line 237-241 based on the exploration data). AFTER the closing `}` of `.tool-btn.active`, add:

```css
.tool-btn.claude-highlight {
    border-color: #E3734B;
    box-shadow: 0 0 8px rgba(227, 115, 75, 0.4);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
}
```

Note: The `box-shadow: 0 0 8px` is a subtle functional highlight, not a decorative glow per the pattern rules. It uses `rgba(227, 115, 75, 0.4)` -- barely visible, serves as a signal that Claude used this button. This is intentionally restrained. The transition ensures smooth fade-in; the 1500ms setTimeout in highlightToolbar() handles the fade-out by removing the class (which transitions back to no box-shadow).

## Verification
- build: No build step (vanilla JS). Verify no syntax errors: `node -e "var fs=require('fs'); fs.readFileSync('js/caretaker-renderer.js','utf8');"` (exits 0 if file is valid UTF-8)
- lint: No lint configured. Manual check: open `index.html` in browser and check console for JS errors.
- test: No existing test suite covers rendering. Verify manually.
- smoke:
  1. Open `index.html` in a browser
  2. Verify no console errors on page load (CaretakerRenderer should init silently, cursor SVG should load)
  3. Start the caretaker server: `node server/caretaker.js`
  4. Verify `[caretaker] Connected` appears in browser console
  5. Send a test command via stdin to the server: `echo '{"action":"place_food","params":{"x":400,"y":300},"reasoning":"test"}' | node -e "process.stdin.pipe(process.stdout)"` (or use the agent loop)
  6. When a `place_food` command arrives, verify:
     - Orange ripple animation appears at the food coordinates
     - Claude cursor (orange spark icon) appears and lerps to that position
     - "Feed" toolbar button briefly glows with orange border
     - Faint orange trail line follows cursor movement
  7. After 3+ seconds with no commands, verify the cursor shows a gentle heartbeat pulse
  8. When the WebSocket disconnects, verify all Claude visual indicators disappear

## Constraints
- Do NOT modify `server/caretaker.js` -- it is the server relay, not a rendering concern
- Do NOT modify `js/fly-logic.js`, `js/connectome.js`, `js/brain-worker-bridge.js`, or `js/neuro-renderer.js` -- this task is purely cosmetic overlay rendering
- Do NOT add any npm dependencies or build steps
- Do NOT use gradients, glassmorphism, neon glows, or decorative effects beyond the specified indicators (per pattern #1)
- The ONLY allowed box-shadow is `0 0 8px rgba(227, 115, 75, 0.4)` on the toolbar highlight (functional, not decorative)
- The ONLY allowed transitions are `border-color 0.2s ease` and `box-shadow 0.2s ease` (per pattern #1)
- All canvas rendering uses `rgba(227, 115, 75, ...)` with varying alpha -- no other colors for Claude indicators
- The CaretakerRenderer module must be fully defensive: all references to `fly`, `BRAIN`, `behavior` etc. are accessed as globals from main.js. Guard with `typeof` checks where appropriate.
- The overlay is purely cosmetic -- it must NOT modify any simulation state (`BRAIN`, `fly`, `food`, `behavior`, etc.)
- The `claude-highlight` CSS class must coexist with the existing `active` class (they are independent -- a button can have both)
