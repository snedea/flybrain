# Plan: D21.1

## Dependencies
- list: []
- commands: []

## File Operations (in execution order)

### 1. MODIFY js/brain3d.js
- operation: MODIFY
- reason: Fix WebGL init failure leaving unrecoverable empty overlay, and add null guards to hide()

#### Change A: Add `_initFailed` property to the Brain3D object literal
- anchor: `_animFrameId: null,`

Add a new property `_initFailed: false,` immediately after the `_animFrameId: null,` line (before the blank line preceding `init: function`).

**Exact edit:** Replace:
```
    _animFrameId: null,

    init: function () {
```
With:
```
    _animFrameId: null,
    _initFailed: false,

    init: function () {
```

#### Change B: Set `_initFailed = true` in the init() catch block
- anchor: `console.warn('Brain3D: WebGL not available', e);`

In the catch block (lines 179-183), add `Brain3D._initFailed = true;` after the console.warn line and before the `Brain3D._initialized = false;` line.

**Exact edit:** Replace:
```
        } catch (e) {
            console.warn('Brain3D: WebGL not available', e);
            Brain3D._initialized = false;
            return;
        }
```
With:
```
        } catch (e) {
            console.warn('Brain3D: WebGL not available', e);
            Brain3D._initFailed = true;
            Brain3D._initialized = false;
            return;
        }
```

#### Change C: Guard show() against _initFailed and fix container display on init failure
- anchor: `show: function () {`

Replace the entire `show` function body. The new logic:
1. If `_initFailed` is true, return immediately (do not set display to block, do not retry init).
2. If not initialized, get container, set display to block (needed for init to read DOM dimensions per Known Pattern #6), call init(). If init fails (!_initialized), reset container display to 'none' and return.
3. If already initialized, set display to block.
4. Rest of function unchanged.

**Exact edit:** Replace:
```
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
        Brain3D._renderer.domElement.addEventListener('mouseleave', Brain3D._onMouseLeave);
        Brain3D._onResize();
        Brain3D._renderLoop();
    },
```
With:
```
    show: function () {
        if (Brain3D._initFailed) return;
        if (!Brain3D._initialized) {
            Brain3D._container = document.getElementById('brain3d-overlay');
            Brain3D._container.style.display = 'block';
            Brain3D.init();
            if (!Brain3D._initialized) {
                Brain3D._container.style.display = 'none';
                return;
            }
        } else {
            Brain3D._container.style.display = 'block';
        }
        Brain3D.active = true;
        window.addEventListener('resize', Brain3D._onResize);
        Brain3D._renderer.domElement.addEventListener('mouseleave', Brain3D._onMouseLeave);
        Brain3D._onResize();
        Brain3D._renderLoop();
    },
```

#### Change D: Add null guards to hide()
- anchor: `hide: function () {`

Replace the entire `hide` function body. Every property access on `_renderer`, `_container`, and `_tooltipEl` must be guarded with an `if` check.

**Exact edit:** Replace:
```
    hide: function () {
        window.removeEventListener('resize', Brain3D._onResize);
        Brain3D._renderer.domElement.removeEventListener('mouseleave', Brain3D._onMouseLeave);
        Brain3D._container.style.display = 'none';
        Brain3D.active = false;
        Brain3D._tooltipEl.style.display = 'none';
        if (Brain3D._animFrameId !== null) {
            cancelAnimationFrame(Brain3D._animFrameId);
            Brain3D._animFrameId = null;
        }
    },
```
With:
```
    hide: function () {
        window.removeEventListener('resize', Brain3D._onResize);
        if (Brain3D._renderer) {
            Brain3D._renderer.domElement.removeEventListener('mouseleave', Brain3D._onMouseLeave);
        }
        if (Brain3D._container) {
            Brain3D._container.style.display = 'none';
        }
        Brain3D.active = false;
        if (Brain3D._tooltipEl) {
            Brain3D._tooltipEl.style.display = 'none';
        }
        if (Brain3D._animFrameId !== null) {
            cancelAnimationFrame(Brain3D._animFrameId);
            Brain3D._animFrameId = null;
        }
    },
```

## Verification
- build: no build step (vanilla JS loaded via script tags)
- lint: no linter configured
- test: no existing tests
- smoke: Open index.html in a browser. (1) Click the "Brain 3D" button — the 3D brain overlay should appear and be interactive. Click again to toggle off. This confirms the normal path still works. (2) To test the WebGL failure path: temporarily add `throw new Error('test')` as the first line inside the `try` block of `init()` (line 143, before `Brain3D._scene = new THREE.Scene();`), then click "Brain 3D" — the overlay should NOT appear (container stays display:none), and clicking the button again should not retry init or show the overlay. Remove the temporary throw after testing. (3) To test hide() null guards: open browser console and run `Brain3D.hide()` before ever opening the 3D panel — it should not throw any TypeError.

## Constraints
- Do NOT modify any file other than js/brain3d.js
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any file in .buildloop/ other than current-plan.md
- Do NOT add any new dependencies or script tags
- Do NOT change the structure or order of properties in the Brain3D object beyond adding `_initFailed`
- Do NOT modify init(), _buildRegions(), update(), toggle(), _renderLoop(), highlightRegion(), _onMouseMove(), _onMouseLeave(), or _onResize() (except the catch block inside init())
- Preserve the Known Pattern #6 behavior: container display is set to 'block' BEFORE init() so init() can read DOM dimensions
