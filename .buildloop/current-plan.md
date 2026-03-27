# Plan: D22.2

Fix NeuroRenderer GPU resource leak in `destroy()` and add resize handling.

## Dependencies
- list: none (vanilla JS, no new packages)
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/neuro-renderer.js
- operation: MODIFY
- reason: (1) Add `gl.deleteBuffer()` / `gl.deleteProgram()` calls in `destroy()` before nulling references, to prevent GPU resource leaks on toggle. (2) Add a ResizeObserver that recomputes layout and re-uploads position buffers when the container width changes.

#### New Module-Level Variables

Add after line `var _onMouseLeave = null;` (anchor: `var _onMouseLeave = null;`):

```js
var _resizeObserver = null;
```

#### Function: destroy() — add GPU cleanup

- anchor: `function destroy() {`
- Replace the entire `destroy()` function body (lines 104-128) with the version below.
- logic:
  1. Set `active = false`.
  2. If `animFrameId !== null`, call `cancelAnimationFrame(animFrameId)` and set to `null`.
  3. Remove mousemove/mouseleave event listeners from canvas (same as current).
  4. If `tooltipEl`, hide it (same as current).
  5. **NEW**: If `_resizeObserver !== null`, call `_resizeObserver.disconnect()` and set `_resizeObserver = null`.
  6. **NEW**: If `gl` is not null AND `posBuffer` is not null, call `gl.deleteBuffer(posBuffer)`.
  7. **NEW**: If `gl` is not null AND `colorBuffer` is not null, call `gl.deleteBuffer(colorBuffer)`.
  8. **NEW**: If `gl` is not null AND `brightnessBuffer` is not null, call `gl.deleteBuffer(brightnessBuffer)`.
  9. **NEW**: If `gl` is not null AND `program` is not null, call `gl.deleteProgram(program)`.
  10. Remove the wrap element from DOM (same as current).
  11. Restore nodeHolder display (same as current).
  12. Null out all references: `gl`, `canvas`, `program`, `neuronCount`, `brightnessData`, `neuronPositions`, `sectionBounds`, `posBuffer`, `colorBuffer`, `brightnessBuffer`, `labelContainer` (same as current).

Exact replacement for the `destroy()` function:

```js
function destroy() {
    active = false;
    if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    if (canvas && _onMouseMove) canvas.removeEventListener('mousemove', _onMouseMove);
    if (canvas && _onMouseLeave) canvas.removeEventListener('mouseleave', _onMouseLeave);
    if (tooltipEl) tooltipEl.style.display = 'none';
    if (_resizeObserver) {
        _resizeObserver.disconnect();
        _resizeObserver = null;
    }
    if (gl) {
        if (posBuffer) gl.deleteBuffer(posBuffer);
        if (colorBuffer) gl.deleteBuffer(colorBuffer);
        if (brightnessBuffer) gl.deleteBuffer(brightnessBuffer);
        if (program) gl.deleteProgram(program);
    }
    var wrap = document.getElementById('neuro-renderer-wrap');
    if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
    var holder = document.getElementById('nodeHolder');
    if (holder) holder.style.display = '';
    gl = null;
    canvas = null;
    program = null;
    neuronCount = 0;
    brightnessData = null;
    neuronPositions = null;
    sectionBounds = [];
    posBuffer = null;
    colorBuffer = null;
    brightnessBuffer = null;
    labelContainer = null;
}
```

#### New Function: handleResize()

Add immediately after the closing brace of `buildLabels()` (anchor: the line after the closing `}` of `buildLabels`, which is the blank line before `function renderLoop() {`).

- signature: `function handleResize()`
- purpose: Recompute layout and re-upload position/color buffers when the container width changes. Reuses existing `buildLayout()` and `buildLabels()`.
- logic:
  1. If `gl` is null or `canvas` is null or `neuronCount === 0`, return early (renderer not active).
  2. Read new width from `canvas.parentElement.getBoundingClientRect().width`. Floor it. If 0, use 320.
  3. If new width equals current `canvas.width`, return early (no change).
  4. **Delete** the existing `posBuffer`, `colorBuffer`, and `brightnessBuffer` via `gl.deleteBuffer()` before `buildLayout()` recreates them. This prevents leaking the old buffers on resize.
  5. Set `canvas.width` to the new width value.
  6. Call `buildLayout()` — this recreates `posBuffer`, `colorBuffer`, `brightnessBuffer`, recomputes `neuronPositions`, `sectionBounds`, sets `canvas.height`, and calls `gl.viewport()`.
  7. Call `buildLabels()` — this rebuilds the section label overlays using the updated `sectionBounds`.
- calls: `gl.deleteBuffer(posBuffer)`, `gl.deleteBuffer(colorBuffer)`, `gl.deleteBuffer(brightnessBuffer)`, `buildLayout()`, `buildLabels()`
- returns: void
- error handling: none needed (guarded by null checks at top)

Exact code:

```js
function handleResize() {
    if (!gl || !canvas || neuronCount === 0) return;
    var wrap = canvas.parentElement;
    if (!wrap) return;
    var newWidth = Math.floor(wrap.getBoundingClientRect().width) || 320;
    if (newWidth === canvas.width) return;
    if (posBuffer) gl.deleteBuffer(posBuffer);
    if (colorBuffer) gl.deleteBuffer(colorBuffer);
    if (brightnessBuffer) gl.deleteBuffer(brightnessBuffer);
    canvas.width = newWidth;
    buildLayout();
    buildLabels();
}
```

#### Modify Function: init() — attach ResizeObserver

- anchor: `active = true;` (line 99 inside `init()`)
- Insert the ResizeObserver setup immediately BEFORE the line `active = true;`
- logic:
  1. Create a new `ResizeObserver` with a callback that calls `handleResize()`.
  2. Observe the `wrap` element (the `neuro-renderer-wrap` div that is the parent of the canvas).
  3. Store the observer in `_resizeObserver`.

Insert this block immediately before `active = true;`:

```js
_resizeObserver = new ResizeObserver(function () { handleResize(); });
_resizeObserver.observe(wrap);
```

#### Wiring / Integration
- No changes to other files. `NeuroRenderer` is a self-contained IIFE that exposes `init`, `destroy`, `isActive` on `window.NeuroRenderer`. The toggle logic in `main.js` (lines 431-454) calls `destroy()` and `init()` -- no changes needed there.
- The `handleResize()` function is private to the IIFE -- not exposed on the public API.
- The ResizeObserver watches the `wrap` div. When the left panel resizes (e.g., window resize, sidebar toggle), the observer fires, `handleResize()` checks if `canvas.width` actually changed, and if so, deletes old GPU buffers and rebuilds the layout.

## Verification
- build: no build step (vanilla JS project, files loaded via `<script>` tags in `index.html`)
- lint: no linter configured
- test: no existing tests
- smoke: Open the app in a browser. (1) Toggle between 59-group and 139K views 5+ times using the connectome toggle button. Open browser DevTools > Performance tab or `about:gpu` and verify no steadily increasing GPU memory. (2) While in 139K view, resize the browser window horizontally. Verify the neuron grid re-layouts to fill the new panel width, section labels reposition, and the WebGL viewport matches the canvas dimensions (no clipping or blank space).

## Constraints
- Do NOT modify any file other than `js/neuro-renderer.js`.
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any file in `.buildloop/` other than `current-plan.md`.
- Do NOT add any new npm/yarn dependencies.
- Do NOT change the public API of `NeuroRenderer` (it must still expose exactly `{ init, destroy, isActive }`).
- Do NOT change the shader source code, rendering logic, or mouse interaction logic -- only the resource lifecycle and resize handling.
- The `handleResize` function must delete the OLD buffers before calling `buildLayout()` which creates new ones, to avoid leaking the old buffers.
- The `destroy()` function must call `gl.delete*` BEFORE nulling `gl`, so the WebGL context is still available for cleanup calls.
- The `_resizeObserver` must be disconnected in `destroy()` to prevent callbacks firing on a torn-down renderer.
