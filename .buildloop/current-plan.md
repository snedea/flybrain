# Plan: D17.2

## Summary
Two resource management fixes for Brain3D:
1. Remove eager `Brain3D.init()` call at page load in main.js — the `show()` method already has lazy init logic, so the eager call wastes GPU resources (WebGL context, geometries, event listeners) before the user ever opens the panel.
2. Move the `window resize` listener from `init()` to `show()`/`hide()` so it only fires while the overlay is visible.

## Dependencies
- list: none
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Remove the eager `Brain3D.init()` call at page load. The `show()` method (brain3d.js:263-267) already calls `init()` lazily on first toggle, so this eager call is redundant and wasteful.
- anchor: lines 425-428, the exact block to remove:
```js
// Initialize Brain3D module (deferred — actual Three.js setup happens on first toggle)
if (typeof Brain3D !== 'undefined') {
    Brain3D.init();
}
```

#### Changes
- DELETE the entire 4-line block (lines 425-428):
  ```js
  // Initialize Brain3D module (deferred — actual Three.js setup happens on first toggle)
  if (typeof Brain3D !== 'undefined') {
      Brain3D.init();
  }
  ```
  Replace with nothing (remove entirely). The blank line at line 424 above it and the blank line at line 429 below it should collapse to a single blank line.

- Do NOT touch any other code in main.js. The `Brain3D.update()` call in the render loop and the `Brain3D.toggle()` button handler must remain unchanged.

### 2. MODIFY js/brain3d.js
- operation: MODIFY
- reason: (a) Remove the `window resize` listener registration from `init()` and (b) add it in `show()` and remove it in `hide()` so it only fires while the overlay is visible. Also set `display:block` on the container BEFORE calling `init()` in `show()` so the container has real dimensions during WebGL setup.

#### Change A: Remove resize listener from init()
- anchor: line 174 inside `init: function ()`:
```js
            window.addEventListener('resize', Brain3D._onResize);
```
- action: DELETE this single line entirely. The mousemove listener on line 173 stays. After deletion, line 173 (`Brain3D._renderer.domElement.addEventListener('mousemove', Brain3D._onMouseMove);`) should be immediately followed by the blank line and then `Brain3D._initialized = true;` (previously line 176).

#### Change B: Add resize listener in show(), set display:block before init()
- anchor: the `show` function at lines 263-272:
```js
    show: function () {
        if (!Brain3D._initialized) {
            Brain3D.init();
            if (!Brain3D._initialized) return;
        }
        Brain3D._container.style.display = 'block';
        Brain3D.active = true;
        Brain3D._onResize();
        Brain3D._renderLoop();
    },
```
- action: Replace the entire `show` function body with this exact code:
```js
    show: function () {
        if (!Brain3D._initialized) {
            Brain3D._container = document.getElementById('brain3d-overlay');
            Brain3D._container.style.display = 'block';
            Brain3D.init();
            if (!Brain3D._initialized) return;
        } else {
            Brain3D._container.style.display = 'block';
        }
        Brain3D.active = true;
        window.addEventListener('resize', Brain3D._onResize);
        Brain3D._onResize();
        Brain3D._renderLoop();
    },
```
- Logic explanation:
  1. If not initialized: set the container reference and set `display:block` BEFORE calling `init()` so that `clientWidth`/`clientHeight` return real dimensions (not 0) inside `init()`. Then call `init()`. If init failed, bail out.
  2. If already initialized: just set `display:block`.
  3. Set `active = true`.
  4. Add the window resize listener (it will be removed in `hide()`).
  5. Call `_onResize()` to force correct camera aspect and renderer size.
  6. Start the render loop.

#### Change C: Remove resize listener in hide()
- anchor: the `hide` function at lines 274-282:
```js
    hide: function () {
        Brain3D._container.style.display = 'none';
        Brain3D.active = false;
        Brain3D._tooltipEl.style.display = 'none';
        if (Brain3D._animFrameId !== null) {
            cancelAnimationFrame(Brain3D._animFrameId);
            Brain3D._animFrameId = null;
        }
    },
```
- action: Replace the entire `hide` function body with this exact code:
```js
    hide: function () {
        window.removeEventListener('resize', Brain3D._onResize);
        Brain3D._container.style.display = 'none';
        Brain3D.active = false;
        Brain3D._tooltipEl.style.display = 'none';
        if (Brain3D._animFrameId !== null) {
            cancelAnimationFrame(Brain3D._animFrameId);
            Brain3D._animFrameId = null;
        }
    },
```
- Logic explanation: Add `window.removeEventListener('resize', Brain3D._onResize);` as the first line of `hide()`. This pairs with the `addEventListener` in `show()`. Since `_onResize` is always the same function reference, `removeEventListener` will correctly remove it. The rest of `hide()` remains unchanged.

#### Note on init() container assignment
- The `init()` function at line 137 does `Brain3D._container = document.getElementById('brain3d-overlay');`. Since `show()` now sets `Brain3D._container` before calling `init()`, this line in `init()` will simply overwrite with the same value — this is harmless and does not need to be changed. Do NOT modify `init()` beyond removing the resize listener line (Change A).

## Verification
- build: No build step — vanilla JS, open `index.html` in a browser.
- lint: No linter configured.
- test: No existing tests.
- smoke: Open the page in a browser. Verify:
  1. On page load, open browser DevTools > Console. There should be NO Three.js or WebGL-related log messages at startup (confirming lazy init).
  2. Open DevTools > Sources or check `performance.getEntriesByType('resource')` — no WebGL context should be created until "Brain 3D" button is clicked.
  3. Click the "Brain 3D" toolbar button. The 3D overlay should appear with correct dimensions (not 0x0, not window-sized fallback). All 10 brain regions should render correctly.
  4. Resize the browser window while the 3D overlay is visible — the scene should resize correctly (camera aspect updates, renderer size updates).
  5. Close the 3D overlay (click "Brain 3D" again or close button). Resize the browser window — verify via DevTools that `Brain3D._onResize` is NOT being called (set a breakpoint or add a temporary console.log).
  6. Re-open the 3D overlay — it should still work correctly, resizing should work again.

## Constraints
- Do NOT modify any files other than `js/main.js` and `js/brain3d.js`.
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any files in `.buildloop/` (other than this plan file).
- Do NOT add any new dependencies or script tags.
- Do NOT change the Brain3D `init()` function beyond removing the single resize listener line (line 174).
- Do NOT change the `_onResize`, `_renderLoop`, `update`, `_onMouseMove`, `_buildRegions`, or `toggle` functions.
- Do NOT change the render loop call in main.js or the toggle button handler.
- The `_onResize` function reference must remain a named property (`Brain3D._onResize`) — do not wrap it in an anonymous function, as `removeEventListener` requires the same function reference that was passed to `addEventListener`.
