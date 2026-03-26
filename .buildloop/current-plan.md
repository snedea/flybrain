# Plan: D20.1

## Dependencies
- list: []
- commands: []

## File Operations (in execution order)

### 1. MODIFY js/brain3d.js
- operation: MODIFY
- reason: Add mouseleave handler to hide tooltip when cursor leaves the 3D canvas, fixing the ghost tooltip bug

#### Change A: Add a named _onMouseLeave handler to the Brain3D object

- anchor: `_onResize: function () {`
- location: Immediately BEFORE the `_onResize` property definition (insert a new property above it in the Brain3D object literal)

Add this new property to the Brain3D object:

```js
_onMouseLeave: function () {
    Brain3D._tooltipEl.style.display = 'none';
},
```

Exact insertion: Place `_onMouseLeave: function () { ... },` on new lines directly before the line `_onResize: function () {`.

#### Change B: Add mouseleave listener in show()

- anchor: `window.addEventListener('resize', Brain3D._onResize);` (inside the `show` function, line 276)
- location: Immediately AFTER that line, add one new line:

```js
Brain3D._renderer.domElement.addEventListener('mouseleave', Brain3D._onMouseLeave);
```

#### Change C: Remove mouseleave listener in hide()

- anchor: `window.removeEventListener('resize', Brain3D._onResize);` (inside the `hide` function, line 282)
- location: Immediately AFTER that line, add one new line:

```js
Brain3D._renderer.domElement.removeEventListener('mouseleave', Brain3D._onMouseLeave);
```

### 2. MODIFY js/main.js
- operation: MODIFY
- reason: Add brain3d-overlay to the education panel outside-click exclusion check so clicking/dragging on the 3D brain canvas does not close the education panel

#### Change A: Expand the exclusion check in the education panel document click handler

- anchor: `if (panel && !panel.contains(e.target) && e.target !== learnBtnEl) {` (line 370)
- Replace this exact line with:

```js
        var brain3dOverlay = document.getElementById('brain3d-overlay');
        if (panel && !panel.contains(e.target) && e.target !== learnBtnEl && (!brain3dOverlay || !brain3dOverlay.contains(e.target))) {
```

This adds two new conditions to the if-check:
1. `!brain3dOverlay` — if the element doesn't exist, the check is skipped (safe fallback)
2. `!brain3dOverlay.contains(e.target)` — if the click target is inside the brain3d-overlay (including the canvas, any child elements), the education panel stays open

The `brain3dOverlay` variable is declared on the line before the if-statement so the if-line does not become excessively long. The indentation must match the existing code (8 spaces for the var, 8 spaces for the if).

## Verification
- build: No build step — vanilla JS loaded via script tags
- lint: No linter configured
- test: No existing tests
- smoke: Open index.html in a browser. (1) Click "Brain 3D" to open the 3D overlay. Hover over a brain region to see the tooltip. Move the mouse off the canvas to the toolbar or outside the browser window — the tooltip must disappear immediately. Move back over the canvas and hover a region — tooltip reappears. (2) Click "Learn" to open the education panel. Click on the 3D brain canvas and drag to rotate — the education panel must stay open. Click a region name in the education panel to highlight it in 3D — the education panel must stay open. Click on an area outside both panels (e.g., the toolbar background) — the education panel should close.

## Constraints
- Do NOT modify any files other than js/brain3d.js and js/main.js
- Do NOT move the existing mousemove listener registration from init() — it stays in init() at line 176
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any file in .buildloop/ other than current-plan.md
- Do NOT add any new dependencies or CDN scripts
- Do NOT refactor or rename existing functions — only add the new handler and modify the existing if-condition
- The _onMouseLeave handler must be a named method on Brain3D (not an anonymous function) so it can be properly added and removed via addEventListener/removeEventListener
