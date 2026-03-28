# Plan: D68.3

## Summary

D68.3 is a smoke verification task for neuro-renderer.js changes. The renderer's IIFE currently exposes only `{init, destroy, isActive}`. To enable automated testing of layout math, resize detection, coordinate conversion, and label overflow in Node (no WebGL/DOM), we:

1. Extract the pure computation logic into standalone functions inside the IIFE
2. Expose them via `NeuroRenderer._test` (guarded by `BRAIN._testMode`) following the `BRAIN._bridge` pattern
3. Add a mock/load block in `run-node.js` for neuro-renderer.js (mocking minimal DOM/WebGL stubs)
4. Write tests in `tests/tests.js` that exercise each checklist item's underlying logic
5. Verify CSS correctness by reading the file (no code change needed -- CSS is already correct)

## Dependencies
- list: none (vanilla JS, no packages)
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/neuro-renderer.js
- operation: MODIFY
- reason: Extract pure layout/resize/coordinate math into named functions; expose via `_test` in test mode; refactor existing code to call the extracted functions

#### Anchor 1: Constants block (top of IIFE)
```
var SECTION_NAMES = ['Sensory', 'Central', 'Drives', 'Motor'];
```

#### Change 1a: Add `_testMode` guard and test export block at end of IIFE

- anchor: `window.NeuroRenderer = { init: init, destroy: destroy, isActive: isActive };`
- After this line, before the closing `})();`, add a test-mode export block.

Add the following block immediately before `})();`:

```javascript
if (typeof BRAIN !== 'undefined' && BRAIN._testMode) {
    NeuroRenderer._test = {
        computeSectionLayout: computeSectionLayout,
        needsResize: needsResize,
        cssToCanvasCoords: cssToCanvasCoords,
        computeLabelMaxWidths: computeLabelMaxWidths,
        POINT_SIZE: POINT_SIZE,
        MIN_SECTION_W: MIN_SECTION_W,
        MAX_SMALL_PS: MAX_SMALL_PS,
        SECTION_GAP: SECTION_GAP,
        PAD: PAD,
        PICK_RADIUS_SQ: PICK_RADIUS_SQ
    };
}
```

#### Change 1b: Extract `computeSectionLayout` pure function

Extract the layout math from `buildLayout()` into a standalone pure function. Place this function definition immediately before the existing `buildLayout` function.

- anchor: `function buildLayout() {`

Add before it:

```javascript
function computeSectionLayout(regionCounts, containerW, containerH, pointSize, minSectionW, maxSmallPS, sectionGap, pad) {
    var usableH = containerH - sectionGap - pad;
    var rowsAvail = Math.max(1, Math.floor(usableH / pointSize));

    var totalNeurons = 0;
    for (var r = 0; r < regionCounts.length; r++) totalNeurons += regionCounts[r];
    var availableW = containerW - ((regionCounts.length - 1) * sectionGap);
    var minRowsForWidth = Math.ceil(totalNeurons * pointSize / Math.max(1, availableW));
    if (minRowsForWidth > rowsAvail) rowsAvail = minRowsForWidth;

    var sections = [];
    var cursorX = 0;

    for (var r = 0; r < regionCounts.length; r++) {
        var count = regionCounts[r];
        if (count === 0) {
            sections.push({x0: cursorX, x1: cursorX, sectionW: 0, pointSize: pointSize, localRows: rowsAvail, neuronCount: 0});
            continue;
        }

        var naturalW = Math.ceil(count / rowsAvail) * pointSize;
        var localPS = pointSize;
        var localRows = rowsAvail;
        if (naturalW < minSectionW) {
            localPS = Math.min(maxSmallPS, Math.sqrt(minSectionW * usableH / count));
            localPS = Math.max(pointSize, localPS);
            localRows = Math.max(1, Math.floor(usableH / localPS));
        }

        var sectionX0 = cursorX;
        var colsNeeded = Math.ceil(count / localRows);
        var sectionW = colsNeeded * localPS;

        cursorX += sectionW + sectionGap;
        sections.push({x0: sectionX0, x1: cursorX - sectionGap, sectionW: sectionW, pointSize: localPS, localRows: localRows, neuronCount: count});
    }

    var canvasWidth = Math.ceil(cursorX);
    var displayScaleVal = containerW / canvasWidth;

    return {sections: sections, canvasWidth: canvasWidth, canvasHeight: containerH, displayScale: displayScaleVal, rowsAvail: rowsAvail};
}
```

Then refactor `buildLayout()` to call `computeSectionLayout` for the dimension/bounds computation. Specifically, replace lines from `var usableH = H - SECTION_GAP - PAD;` through `cursorX += sectionW + SECTION_GAP;` and `sectionBounds.push(...)` with a call to `computeSectionLayout` that drives the same outputs.

Refactored `buildLayout()`:

```javascript
function buildLayout() {
    var regionType = BRAIN.workerRegionType;
    var regionNeurons = [[], [], [], []];
    for (var i = 0; i < neuronCount; i++) {
        regionNeurons[regionType[i]].push(i);
    }

    var wrap = canvas.parentElement;
    var wrapRect = wrap.getBoundingClientRect();
    var H = Math.floor(wrapRect.height) || 140;
    var W = Math.floor(wrapRect.width) || 800;

    var regionCounts = [regionNeurons[0].length, regionNeurons[1].length, regionNeurons[2].length, regionNeurons[3].length];
    var layout = computeSectionLayout(regionCounts, W, H, POINT_SIZE, MIN_SECTION_W, MAX_SMALL_PS, SECTION_GAP, PAD);

    neuronPositions = new Float32Array(neuronCount * 2);
    var posData = new Float32Array(neuronCount * 2);
    var colorData = new Float32Array(neuronCount * 3);
    var pointSizeData = new Float32Array(neuronCount);
    sectionBounds = [];

    for (var r = 0; r < 4; r++) {
        var neurons = regionNeurons[r];
        var sec = layout.sections[r];

        if (neurons.length === 0) {
            sectionBounds.push({x0: sec.x0, x1: sec.x1, y0: 0, y1: H, region: r, neuronIndices: [], pointSize: sec.pointSize, localRows: sec.localRows});
            continue;
        }

        var localPS = sec.pointSize;
        var localRows = sec.localRows;

        for (var j = 0; j < neurons.length; j++) {
            var nIdx = neurons[j];
            var col = Math.floor(j / localRows);
            var row = j % localRows;
            var px = sec.x0 + col * localPS + localPS * 0.5;
            var py = SECTION_GAP + row * localPS + localPS * 0.5;
            posData[nIdx * 2] = px;
            posData[nIdx * 2 + 1] = py;
            neuronPositions[nIdx * 2] = px;
            neuronPositions[nIdx * 2 + 1] = py;
            pointSizeData[nIdx] = localPS;
            var rgb = REGION_COLORS[r];
            colorData[nIdx * 3] = rgb[0];
            colorData[nIdx * 3 + 1] = rgb[1];
            colorData[nIdx * 3 + 2] = rgb[2];
        }
        sectionBounds.push({x0: sec.x0, x1: sec.x1, y0: 0, y1: H, region: r, neuronIndices: neurons, pointSize: localPS, localRows: localRows});
    }

    canvas.width = layout.canvasWidth;
    canvas.height = layout.canvasHeight;
    displayScale = layout.displayScale;
    gl.viewport(0, 0, canvas.width, canvas.height);

    canvas.style.width = W + 'px';

    if (posBuffer) gl.deleteBuffer(posBuffer);
    posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW);

    if (colorBuffer) gl.deleteBuffer(colorBuffer);
    colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.STATIC_DRAW);

    brightnessData = new Float32Array(neuronCount);
    if (brightnessBuffer) gl.deleteBuffer(brightnessBuffer);
    brightnessBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, brightnessData, gl.DYNAMIC_DRAW);

    if (pointSizeBuffer) gl.deleteBuffer(pointSizeBuffer);
    pointSizeBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, pointSizeBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, pointSizeData, gl.STATIC_DRAW);
}
```

#### Change 1c: Extract `needsResize` pure function

Place immediately before `handleResize`:

```javascript
function needsResize(canvasW, canvasH, curDisplayScale, newW, newH) {
    var oldDisplayW = Math.round(canvasW * curDisplayScale);
    if (newH !== canvasH) return true;
    if (Math.abs(newW - oldDisplayW) >= 2) return true;
    return false;
}
```

Then refactor `handleResize` to use it:

- anchor: `function handleResize() {`

Replace the function body to:

```javascript
function handleResize() {
    if (!gl || !canvas || neuronCount === 0) return;
    var wrap = canvas.parentElement;
    if (!wrap) return;
    var rect = wrap.getBoundingClientRect();
    var newH = Math.floor(rect.height) || 140;
    var newW = Math.floor(rect.width) || 800;
    if (!needsResize(canvas.width, canvas.height, displayScale, newW, newH)) return;
    if (posBuffer) gl.deleteBuffer(posBuffer);
    if (colorBuffer) gl.deleteBuffer(colorBuffer);
    if (brightnessBuffer) gl.deleteBuffer(brightnessBuffer);
    if (pointSizeBuffer) gl.deleteBuffer(pointSizeBuffer);
    buildLayout();
    buildLabels();
}
```

#### Change 1d: Extract `cssToCanvasCoords` pure function

Place immediately before `onMouseMove`:

```javascript
function cssToCanvasCoords(clientX, clientY, rectLeft, rectTop, rectWidth, rectHeight, canvasWidth, canvasHeight, scrollLeft) {
    var canvasX = ((clientX - rectLeft) + scrollLeft) * (canvasWidth / rectWidth);
    var canvasY = (clientY - rectTop) * (canvasHeight / rectHeight);
    return {x: canvasX, y: canvasY};
}
```

No need to refactor `onMouseMove` to call this (it's inlined for performance in the hot path). The extracted function is purely for testability.

#### Change 1e: Extract `computeLabelMaxWidths` pure function

Place immediately before `buildLabels`:

```javascript
function computeLabelMaxWidths(sectionBoundsArr, displayScaleVal) {
    var visible = [];
    for (var r = 0; r < sectionBoundsArr.length; r++) {
        if (sectionBoundsArr[r].neuronIndices ? sectionBoundsArr[r].neuronIndices.length > 0 : sectionBoundsArr[r].neuronCount > 0) {
            visible.push(r);
        }
    }
    var widths = [];
    for (var vi = 0; vi < visible.length; vi++) {
        var r = visible[vi];
        var leftPx = sectionBoundsArr[r].x0 * displayScaleVal;
        if (vi < visible.length - 1) {
            var nextLeft = sectionBoundsArr[visible[vi + 1]].x0 * displayScaleVal;
            widths.push({region: r, leftPx: leftPx, maxWidth: Math.max(20, nextLeft - leftPx - 4)});
        } else {
            widths.push({region: r, leftPx: leftPx, maxWidth: -1}); // -1 means uncapped
        }
    }
    return widths;
}
```

### 2. MODIFY tests/run-node.js
- operation: MODIFY
- reason: Load neuro-renderer.js in test mode with minimal DOM/WebGL stubs so `_test` exports are available
- anchor: `'tests/tests.js',`

#### Changes

After the existing `moreFiles` array definition (line 28-32) and before the loop that loads them (line 33), add neuro-renderer.js to the load list. But first, set up minimal stubs for DOM/WebGL APIs that the IIFE's top-level code references. Since the IIFE only defines functions and assigns to `window.NeuroRenderer` at the module level (no DOM calls at load time), the only globals needed are `window` (already `globalThis` in Node) and `BRAIN` (already loaded).

Insert the following AFTER the `BRAIN._testMode = true;` line (line 25) and BEFORE the Phase 3 comment (line 27):

```javascript
// Stub window for neuro-renderer.js IIFE (assigns to window.NeuroRenderer)
if (typeof window === 'undefined') global.window = global;
```

Add `'js/neuro-renderer.js'` to the `moreFiles` array, inserting it before `'tests/tests.js'`:

Change:
```javascript
var moreFiles = [
	'js/brain-worker-bridge.js',
	'js/fly-logic.js',
	'tests/tests.js',
];
```

To:
```javascript
var moreFiles = [
	'js/brain-worker-bridge.js',
	'js/fly-logic.js',
	'js/neuro-renderer.js',
	'tests/tests.js',
];
```

### 3. MODIFY tests/tests.js
- operation: MODIFY
- reason: Add test functions for each D68.3 checklist item using the extracted pure functions
- anchor: end of file, after `} // end bridge tests guard` (line 1389-1390)

Append the following test functions at the end of the file (after line 1390):

```javascript
// ============================================================
// Section: Neuro-renderer smoke tests (D68.3)
// ============================================================

if (typeof NeuroRenderer !== 'undefined' && NeuroRenderer._test) {

var test_neuro_resize_width_only_triggers_rebuild = function () {
    // Checklist item 1: width-only resize must trigger relayout
    var nr = NeuroRenderer._test;
    // Same height, different width (delta >= 2) => needs resize
    assertTrue(nr.needsResize(800, 140, 1.0, 850, 140),
        'width-only change (800->850) triggers resize');
    // Same height, same width => no resize
    assertTrue(!nr.needsResize(800, 140, 1.0, 800, 140),
        'no change does not trigger resize');
    // Same height, tiny width change (delta < 2) => no resize
    assertTrue(!nr.needsResize(800, 140, 1.0, 801, 140),
        'sub-threshold width change (1px) does not trigger resize');
    // Height change, same width => needs resize
    assertTrue(nr.needsResize(800, 140, 1.0, 800, 160),
        'height-only change triggers resize');
};

var test_neuro_resize_with_displayScale = function () {
    // When displayScale != 1, oldDisplayW = canvas.width * displayScale
    var nr = NeuroRenderer._test;
    // canvas.width=600, displayScale=1.5 => oldDisplayW=900
    // newW=900 => no resize needed
    assertTrue(!nr.needsResize(600, 140, 1.5, 900, 140),
        'displayScale-adjusted width matches => no resize');
    // newW=920 => delta=20 >= 2 => resize needed
    assertTrue(nr.needsResize(600, 140, 1.5, 920, 140),
        'displayScale-adjusted width mismatch => resize');
};

var test_neuro_cssToCanvasCoords_stretch = function () {
    // Checklist item 2: tooltip hover coords convert correctly with CSS stretch
    var nr = NeuroRenderer._test;
    // Canvas is 600px wide internally, CSS-stretched to 900px (rect.width=900)
    // Click at CSS x=450 (center of stretched canvas) should map to canvas x=300
    var coords = nr.cssToCanvasCoords(450, 70, 0, 0, 900, 140, 600, 140, 0);
    assertClose(coords.x, 300, 0.01, 'CSS center maps to canvas center with stretch');
    assertClose(coords.y, 70, 0.01, 'Y unchanged when no vertical stretch');
};

var test_neuro_cssToCanvasCoords_with_scroll = function () {
    var nr = NeuroRenderer._test;
    // scrollLeft=50, click at CSS x=100, rect.left=0, rect.width=800, canvas.width=800
    var coords = nr.cssToCanvasCoords(100, 50, 0, 0, 800, 140, 800, 140, 50);
    assertClose(coords.x, 150, 0.01, 'scrollLeft offset added to canvasX');
};

var test_neuro_cssToCanvasCoords_with_rect_offset = function () {
    var nr = NeuroRenderer._test;
    // Panel starts at x=200 in viewport. Click at clientX=300 => local x=100
    var coords = nr.cssToCanvasCoords(300, 80, 200, 10, 600, 140, 600, 140, 0);
    assertClose(coords.x, 100, 0.01, 'rect.left offset subtracted');
    assertClose(coords.y, 70, 0.01, 'rect.top offset subtracted');
};

var test_neuro_layout_small_sections_get_min_width = function () {
    // Checklist item 4: DRIVES/MOTOR render as visible grids, not 1px slivers
    var nr = NeuroRenderer._test;
    // Simulate: Sensory=100000, Central=35000, Drives=80, Motor=76
    var layout = nr.computeSectionLayout([100000, 35000, 80, 76], 800, 140, nr.POINT_SIZE, nr.MIN_SECTION_W, nr.MAX_SMALL_PS, nr.SECTION_GAP, nr.PAD);

    // Drives (index 2) and Motor (index 3) must have sectionW >= MIN_SECTION_W
    assertTrue(layout.sections[2].sectionW >= nr.MIN_SECTION_W,
        'Drives section width >= MIN_SECTION_W (' + layout.sections[2].sectionW + ' >= ' + nr.MIN_SECTION_W + ')');
    assertTrue(layout.sections[3].sectionW >= nr.MIN_SECTION_W,
        'Motor section width >= MIN_SECTION_W (' + layout.sections[3].sectionW + ' >= ' + nr.MIN_SECTION_W + ')');

    // Small sections must have enlarged point sizes (> base POINT_SIZE)
    assertTrue(layout.sections[2].pointSize > nr.POINT_SIZE,
        'Drives gets enlarged pointSize (' + layout.sections[2].pointSize + ' > ' + nr.POINT_SIZE + ')');
    assertTrue(layout.sections[3].pointSize > nr.POINT_SIZE,
        'Motor gets enlarged pointSize (' + layout.sections[3].pointSize + ' > ' + nr.POINT_SIZE + ')');
};

var test_neuro_layout_empty_section_zero_width = function () {
    var nr = NeuroRenderer._test;
    // Section with 0 neurons should have zero width
    var layout = nr.computeSectionLayout([100, 0, 50, 30], 800, 140, nr.POINT_SIZE, nr.MIN_SECTION_W, nr.MAX_SMALL_PS, nr.SECTION_GAP, nr.PAD);
    assertEqual(layout.sections[1].sectionW, 0, 'empty section has zero width');
    assertEqual(layout.sections[1].neuronCount, 0, 'empty section neuronCount is 0');
};

var test_neuro_layout_displayScale_shrinks_to_fit = function () {
    // Checklist item 6: Motor not clipped -- canvas shrinks via displayScale < 1
    var nr = NeuroRenderer._test;
    // With very large neuron counts, canvasWidth may exceed containerW
    // displayScale = containerW / canvasWidth < 1 means CSS shrinks canvas to fit
    var layout = nr.computeSectionLayout([100000, 35000, 80, 76], 400, 140, nr.POINT_SIZE, nr.MIN_SECTION_W, nr.MAX_SMALL_PS, nr.SECTION_GAP, nr.PAD);
    // With 135K+ neurons at POINT_SIZE=1 in 400px container, canvas will be wider than 400
    if (layout.canvasWidth > 400) {
        assertTrue(layout.displayScale < 1.0,
            'displayScale < 1 when canvas exceeds container (' + layout.displayScale + ')');
    }
    // All 4 sections must have valid bounds (Motor is last, must not be clipped)
    assertTrue(layout.sections[3].x1 <= layout.canvasWidth,
        'Motor section x1 fits within canvasWidth');
};

var test_neuro_label_maxwidths_prevent_overlap = function () {
    // Checklist item 3: labels truncate with ellipsis (max-width prevents overflow)
    var nr = NeuroRenderer._test;
    // Create mock sectionBounds with known positions
    var bounds = [
        {x0: 0, x1: 200, neuronIndices: [1], neuronCount: 1},
        {x0: 216, x1: 400, neuronIndices: [2], neuronCount: 1},
        {x0: 416, x1: 476, neuronIndices: [3], neuronCount: 1},
        {x0: 492, x1: 552, neuronIndices: [4], neuronCount: 1}
    ];
    var dScale = 1.0;
    var widths = nr.computeLabelMaxWidths(bounds, dScale);

    // 4 visible sections => 4 entries
    assertEqual(widths.length, 4, 'all 4 sections get label width entries');

    // First label: maxWidth = next.x0 * dScale - this.x0 * dScale - 4
    // = 216 - 0 - 4 = 212
    assertClose(widths[0].maxWidth, 212, 0.01, 'first label maxWidth capped before second section');

    // Third label (Drives at x0=416): maxWidth = 492 - 416 - 4 = 72
    assertClose(widths[2].maxWidth, 72, 0.01, 'narrow section label maxWidth prevents overflow');

    // Last label (Motor): maxWidth = -1 (uncapped)
    assertEqual(widths[3].maxWidth, -1, 'last label has no maxWidth cap');
};

var test_neuro_label_maxwidths_with_displayScale = function () {
    var nr = NeuroRenderer._test;
    // displayScale=0.5 means CSS positions are halved
    var bounds = [
        {x0: 0, x1: 400, neuronIndices: [1], neuronCount: 1},
        {x0: 416, x1: 800, neuronIndices: [2], neuronCount: 1}
    ];
    var widths = nr.computeLabelMaxWidths(bounds, 0.5);
    // First label: leftPx = 0*0.5 = 0, nextLeft = 416*0.5 = 208, maxWidth = max(20, 208-0-4) = 204
    assertClose(widths[0].maxWidth, 204, 0.01, 'displayScale applied to label maxWidth calc');
};

var test_neuro_label_skip_empty_sections = function () {
    var nr = NeuroRenderer._test;
    // Section 1 is empty (0 neurons)
    var bounds = [
        {x0: 0, x1: 200, neuronIndices: [1], neuronCount: 1},
        {x0: 200, x1: 200, neuronIndices: [], neuronCount: 0},
        {x0: 216, x1: 400, neuronIndices: [3], neuronCount: 1},
        {x0: 416, x1: 500, neuronIndices: [4], neuronCount: 1}
    ];
    var widths = nr.computeLabelMaxWidths(bounds, 1.0);
    // Only 3 visible sections (indices 0, 2, 3)
    assertEqual(widths.length, 3, 'empty section skipped in label widths');
    assertEqual(widths[0].region, 0, 'first visible is region 0');
    assertEqual(widths[1].region, 2, 'second visible is region 2');
    assertEqual(widths[2].region, 3, 'third visible is region 3');
};

var test_neuro_layout_point_size_capped_at_max = function () {
    var nr = NeuroRenderer._test;
    // Very few neurons (e.g. 2) in a section -- pointSize should not exceed MAX_SMALL_PS
    var layout = nr.computeSectionLayout([1000, 500, 2, 3], 800, 140, nr.POINT_SIZE, nr.MIN_SECTION_W, nr.MAX_SMALL_PS, nr.SECTION_GAP, nr.PAD);
    assertTrue(layout.sections[2].pointSize <= nr.MAX_SMALL_PS,
        'Drives pointSize capped at MAX_SMALL_PS (' + layout.sections[2].pointSize + ' <= ' + nr.MAX_SMALL_PS + ')');
    assertTrue(layout.sections[3].pointSize <= nr.MAX_SMALL_PS,
        'Motor pointSize capped at MAX_SMALL_PS (' + layout.sections[3].pointSize + ' <= ' + nr.MAX_SMALL_PS + ')');
};

} // end neuro-renderer tests guard
```

## Verification
- build: N/A (vanilla JS, no build step)
- lint: N/A (no linter configured)
- test: `node tests/run-node.js`
- Expected: all existing 69 tests pass, plus 11 new neuro-renderer tests pass (80 total)
- smoke: Run `node tests/run-node.js` and verify output shows 80 tests passing with 0 failures. Specifically verify no errors loading neuro-renderer.js in Node (the IIFE must not crash at load time since it only assigns functions to `window.NeuroRenderer` without calling DOM APIs).

## Constraints
- Do NOT modify SPEC.md, CLAUDE.md, TASKS.md, or any .buildloop/ files other than current-plan.md
- Do NOT add any npm dependencies
- Do NOT change the vertex shader, fragment shader, or any WebGL rendering code
- Do NOT change the visual output or behavior of neuro-renderer.js in the browser -- only extract pure functions and add the `_test` export
- The `computeSectionLayout` function must produce identical numerical results to the current inline code in `buildLayout()` -- do not change the layout algorithm
- The `window` global stub in run-node.js must be minimal -- only set it if `typeof window === 'undefined'` to avoid breaking other tests
- Keep all new functions inside the existing IIFE -- do not create new files for neuro-renderer logic
- All tests must follow the existing `var test_*` naming convention for auto-discovery by `runAllTests()`
- Guard the neuro-renderer tests with `if (typeof NeuroRenderer !== 'undefined' && NeuroRenderer._test)` so they are skipped if the module fails to load
