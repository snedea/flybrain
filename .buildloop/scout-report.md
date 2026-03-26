# Scout Report: T3.1

## Key Facts (read this first)

- **Tech stack**: Vanilla JS, HTML5 Canvas, CSS -- no build step, no bundler. Three JS files loaded in order: `constants.js` (weight table), `connectome.js` (BRAIN object), `main.js` (rendering + simulation loop).
- **Two independent timers**: brain tick at `main.js:168` (`setInterval(updateBrain, 500)`) and render loop at `main.js:1120` (`setInterval(fn, 1e3/60)`). Both must remain independent; only the render loop switches to RAF.
- **`frameCount`** already declared at `main.js:25` and incremented each frame at `main.js:1072` -- can be used directly as the tick counter for bug 2.
- **Toolbar height**: 44px (CSS `main.css:77`). **Bottom panel height**: 90px (CSS `main.css:147`). These are the exact clamp values for bug 5.
- **Only two files change**: `js/main.js` and `js/connectome.js`. No HTML or CSS changes needed.

## Relevant Files

| File | Lines | Relevance |
|------|-------|-----------|
| `js/main.js` | 1-1124 | Primary target: all 6 bugs live here or interact here |
| `js/connectome.js` | 1-511 | Bug 6 only: legacy flag declarations (lines 147-149) and backward-compat mapping (lines 272-276) |
| `css/main.css` | 77, 147 | Read-only reference: confirms toolbar=44px, panel=90px |
| `index.html` | -- | Read-only: confirms canvas id, script load order |

## Architecture Notes

**Angle system**: `facingDir` and `targetDir` are both radians (fly uses `Math.cos/sin` at lines 1028-1029, rotation at 1100). The wrap check at `main.js:1014` compares against `180` (degrees) and the correction arithmetic uses `360` -- both wrong. Fix: replace `180` with `Math.PI` and `360` with `2 * Math.PI`.

**setTimeout flood detail**: The callback at `main.js:1066-1070` sets:
- `stimulateHungerNeurons = true` -- always `true`, never checked in BRAIN.update(), fully dead
- `stimulateNoseTouchNeurons = false` -- the meaningful reset for wall-touch events
- `stimulateFoodSenseNeurons = false` -- redundant; `foodNearby` is already reset to `false` every frame at `main.js:1049`

After removing the 3 flags, only the wall-touch reset needs replacing. Use a `wallTouchResetFrame` variable: set to `frameCount + 120` on wall hit, check `if (frameCount >= wallTouchResetFrame) { BRAIN.stimulate.touch = false; }` in `update()`.

**Legacy flag removal scope**:
- `connectome.js:147-149`: Remove all 3 flag declarations (`stimulateHungerNeurons`, `stimulateNoseTouchNeurons`, `stimulateFoodSenseNeurons`)
- `connectome.js:272-276`: Remove the backward-compat mapping block (both `if` checks)
- `main.js:1034,1037,1041,1044`: Replace `BRAIN.stimulateNoseTouchNeurons = true` with `BRAIN.stimulate.touch = true`
- `main.js:1053`: Delete `BRAIN.stimulateFoodSenseNeurons = true` (line 1054 already sets `BRAIN.stimulate.foodNearby = true`)
- `main.js:1066-1070`: Delete entire setTimeout block

**Canvas resize** (`main.js:1113-1117`): Self-invoking function sets `canvas.width/height` to `window.innerWidth/Height` and reassigns `window.onresize`. DPR support requires: multiply physical dimensions by `devicePixelRatio`, then `ctx.scale(dpr, dpr)` once after resize. Fly coordinates remain in CSS pixel space -- no other code changes needed for coordinates.

**RAF loop structure**: Replace `setInterval` at 1120 with:
```js
var lastTime = 0;
function loop(timestamp) {
    var dt = timestamp - lastTime;
    lastTime = timestamp;
    // pass dt to update() for delta-time scaling
    update(dt);
    draw();
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
```
`update()` currently increments `speed += speedChangeInterval` -- scale that by `dt / (1000/60)` to keep the same feel at 60fps. Use a guard: if `dt > 100` (tab was backgrounded), clamp to `100`.

**Movement bounds** (`main.js:1032-1045`): Replace `0` with `44` (top) and `window.innerHeight` with `window.innerHeight - 90` (bottom). Left/right bounds stay at `0` and `window.innerWidth`. Touch stimulus on wall hit stays as the new direct call.

## Suggested Approach

Fix in this order to minimize conflict between changes:

1. **Bug 6 first** (legacy flag removal): Clean up both files so subsequent fixes use only the new `BRAIN.stimulate.*` API. This is the prerequisite for bug 2.
2. **Bug 1** (angle wrap): Simple 2-line arithmetic fix at `main.js:1014-1019`.
3. **Bug 2** (setTimeout flood): Add `wallTouchResetFrame` var at top of file; replace setTimeout block; add reset check in `update()`.
4. **Bug 5** (bounds clamping): Change the 4 bound values in the wall check block.
5. **Bug 4** (DPR): Modify the `resize()` function; apply `ctx.scale(dpr, dpr)` there. Update `clearRect` in `draw()` to use CSS dimensions.
6. **Bug 3** (RAF): Replace `setInterval` at bottom with RAF loop; add `dt` parameter to `update()`; scale `speedChangeInterval` application by normalized dt.

## Risks and Constraints

- **Angle fix correctness**: The correction block (lines 1015-1019) must also switch from `360` to `2 * Math.PI`. Not just the comparison -- the arithmetic inside the block is also degrees-based. Both the `>180` and the `360 -` expressions need updating.
- **DPR + clearRect**: After `ctx.scale(dpr, dpr)` in resize, the canvas logical size is CSS pixels. `ctx.clearRect(0, 0, canvas.width, canvas.height)` in `draw()` would clear `physicalWidth * physicalHeight` pixels. Should become `ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)` (or store CSS dims) to avoid overdraw artifacts.
- **RAF delta time and brain tick**: Brain tick stays on 500ms `setInterval` -- do not change. Only the `update()/draw()` loop switches to RAF. The brain writes to `BRAIN.accumleft/right` etc. and the render loop reads them; no synchronization is needed because JS is single-threaded.
- **Wall-touch reset timing**: At 60fps, 120 frames = 2 seconds (matching the old `setTimeout(fn, 2000)` behavior). If RAF runs slower (tab background, slow device), 120 frames could be longer. This is acceptable -- the old setTimeout behavior had the same variability.
- **`stimulateHungerNeurons`**: Only appears as a declaration in connectome.js and the setTimeout set. Grep confirms it is NOT read anywhere in BRAIN.update() or any signal propagation path -- it is truly dead. Safe to delete.
- **`BRAIN.stimulate.touch = true` on wall hit with no location**: `touchLocation` will be `null` when wall-triggered (vs. a specific body part from applyTouchTool). The connectome handles null location gracefully (the double-dose check is skipped). This is correct behavior.
- **No HTML changes needed**: The canvas element, panel heights, and script tags are unchanged.
