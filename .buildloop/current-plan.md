# Plan: T7.5

## Dependencies
- list: none (WebGL2 is built into all modern browsers; no external packages needed)
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/sim-worker.js
- operation: MODIFY
- reason: Include regionType array in the worker 'ready' message so the main thread can access per-neuron region types for WebGL coloring
- anchor: `self.postMessage({type: 'ready', neuronCount: N, edgeCount: edgeCount, groupId: groupId});`

#### Changes
- Replace the single `postReady` function body. The existing line:
  ```javascript
  self.postMessage({type: 'ready', neuronCount: N, edgeCount: edgeCount, groupId: groupId});
  ```
  becomes:
  ```javascript
  self.postMessage({type: 'ready', neuronCount: N, edgeCount: edgeCount, groupId: groupId, regionType: regionType});
  ```
  This adds `regionType` (the `Uint8Array(N)` parsed in `parseBinary`) to the ready message.

### 2. MODIFY js/brain-worker-bridge.js
- operation: MODIFY
- reason: Capture regionType from worker ready message, expose latestFireState/neuronCount/regionType/groupIdArr/groupIdToName/groupSizes on BRAIN object so the WebGL renderer (neuro-renderer.js) can read them

#### Change A: Add regionTypeArr variable
- anchor: `var groupIdArr = null;       // Uint16Array[neuronCount] from worker`
- Add immediately after that line:
  ```javascript
  var regionTypeArr = null;    // Uint8Array[neuronCount] from worker
  ```

#### Change B: Capture regionType in handleWorkerMessage 'ready' case
- anchor: `groupIdArr = new Uint16Array(e.data.groupId.buffer`
- The existing two lines (87-88) are:
  ```javascript
  groupIdArr = new Uint16Array(e.data.groupId.buffer
      ? e.data.groupId.buffer : e.data.groupId);
  ```
- Add immediately after those two lines:
  ```javascript
  regionTypeArr = new Uint8Array(e.data.regionType.buffer
      ? e.data.regionType.buffer : e.data.regionType);
  ```

#### Change C: Expose state on BRAIN after workerReady = true
- anchor: `workerReady = true;`
- Add immediately after that line (before the `// Reset postSynaptic` comment):
  ```javascript
  BRAIN.workerReady = true;
  BRAIN.workerNeuronCount = neuronCount;
  BRAIN.workerRegionType = regionTypeArr;
  BRAIN.workerGroupIdArr = groupIdArr;
  BRAIN.workerGroupIdToName = groupIdToName;
  BRAIN.workerGroupSizes = groupSizes;
  ```

#### Change D: Expose latestFireState on every tick
- anchor: `latestFireState = e.data.fireState;`
- Add immediately after that line:
  ```javascript
  BRAIN.latestFireState = e.data.fireState;
  ```

#### Change E: Clear workerReady on fallback (two locations)
- First location anchor: `workerReady = false;` inside the `case 'error':` block of handleWorkerMessage (around line 113)
- Add immediately after: `BRAIN.workerReady = false;`
- Second location anchor: `workerReady = false;` inside handleWorkerError function (around line 122)
- Add immediately after: `BRAIN.workerReady = false;`

### 3. CREATE js/neuro-renderer.js
- operation: CREATE
- reason: WebGL2 renderer that draws 139K neurons as GL_POINTS in the left sidebar, colored by region type, brightness driven by fire state

#### Imports / Dependencies
- None (vanilla JS, WebGL2 built-in). Loaded via `<script>` tag.

#### Module Structure
- Entire file wrapped in IIFE: `(function() { 'use strict'; ... })();`
- Exposes `window.NeuroRenderer = { init: init, destroy: destroy, isActive: isActive }` at end of IIFE.

#### Constants
```javascript
var REGION_COLORS = [
    [0.231, 0.510, 0.965],  // region_type 0 = sensory: #3b82f6
    [0.545, 0.361, 0.965],  // region_type 1 = central: #8b5cf6
    [0.961, 0.620, 0.043],  // region_type 2 = drives:  #f59e0b
    [0.937, 0.267, 0.267]   // region_type 3 = motor:   #ef4444
];
var POINT_SIZE = 2.0;
var SECTION_GAP = 24;
var PAD = 4;
var PICK_RADIUS_SQ = 16;
var SECTION_NAMES = ['Sensory', 'Central', 'Drives', 'Motor'];
var LABEL_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];
var LABEL_BGS = ['rgba(59,130,246,0.1)', 'rgba(139,92,246,0.1)', 'rgba(245,158,11,0.1)', 'rgba(239,68,68,0.1)'];
```

#### Module-Level State Variables
```javascript
var canvas = null;
var gl = null;
var program = null;
var posBuffer = null;
var colorBuffer = null;
var brightnessBuffer = null;
var brightnessData = null;     // Float32Array(neuronCount)
var neuronCount = 0;
var cols = 0;                  // columns per row in the grid layout
var animFrameId = null;
var active = false;
var tooltipEl = null;
var labelContainer = null;
var sectionBounds = [];        // Array of {y0, y1, region, neuronIndices}
var neuronPositions = null;    // Float32Array(neuronCount * 2) pixel coords for hit-testing
var _onMouseMove = null;
var _onMouseLeave = null;
```

#### Functions

##### `init()`
- signature: `function init()`
- purpose: Create WebGL2 canvas, compile shaders, build neuron layout, start render loop
- logic:
    1. Read `BRAIN.workerNeuronCount`. If falsy or 0, return false.
    2. Set `neuronCount = BRAIN.workerNeuronCount`.
    3. `var holder = document.getElementById('nodeHolder')`. Set `holder.style.display = 'none'`.
    4. `var panel = document.getElementById('connectome-panel')`.
    5. Check if `document.getElementById('neuro-renderer-wrap')` already exists. If so, remove it (prevents double-init).
    6. Create wrapper div: `var wrap = document.createElement('div')`. Set `wrap.id = 'neuro-renderer-wrap'`. Append to `panel`.
    7. Create canvas: `canvas = document.createElement('canvas')`. Set `canvas.id = 'neuro-canvas'`. Append to `wrap`.
    8. Create label container: `labelContainer = document.createElement('div')`. Set `labelContainer.id = 'neuro-labels'`. Append to `wrap`.
    9. Get WebGL2 context: `gl = canvas.getContext('webgl2', {antialias: false, alpha: false})`. If null, log `'WebGL2 not available'`, set `holder.style.display = ''`, remove wrap, return false.
    10. Set `canvas.width = Math.floor(wrap.getBoundingClientRect().width)` (or fallback 320 if 0).
    11. Call `buildShaders()`. If `program` is null after call, clean up and return false.
    12. Call `buildLayout()`.
    13. Call `buildLabels()`.
    14. `tooltipEl = document.getElementById('neuronTooltip')`.
    15. `_onMouseMove = onMouseMove`. `canvas.addEventListener('mousemove', _onMouseMove)`.
    16. `_onMouseLeave = onMouseLeave`. `canvas.addEventListener('mouseleave', _onMouseLeave)`.
    17. Set `active = true`.
    18. `animFrameId = requestAnimationFrame(renderLoop)`.
    19. Return true.
- returns: boolean (true = success)
- error handling: If WebGL2 not available or shaders fail, restore holder display, remove wrapper div, return false.

##### `destroy()`
- signature: `function destroy()`
- purpose: Tear down WebGL context, remove canvas, restore DOM dots, cancel animation frame
- logic:
    1. Set `active = false`.
    2. If `animFrameId !== null`, call `cancelAnimationFrame(animFrameId)`. Set `animFrameId = null`.
    3. If `canvas` and `_onMouseMove`, call `canvas.removeEventListener('mousemove', _onMouseMove)`.
    4. If `canvas` and `_onMouseLeave`, call `canvas.removeEventListener('mouseleave', _onMouseLeave)`.
    5. If `tooltipEl`, set `tooltipEl.style.display = 'none'`.
    6. `var wrap = document.getElementById('neuro-renderer-wrap')`. If wrap and wrap.parentNode, call `wrap.parentNode.removeChild(wrap)`.
    7. `var holder = document.getElementById('nodeHolder')`. If holder, set `holder.style.display = ''`.
    8. Set `gl = null; canvas = null; program = null; neuronCount = 0; brightnessData = null; neuronPositions = null; sectionBounds = []; posBuffer = null; colorBuffer = null; brightnessBuffer = null; labelContainer = null;`.
- returns: void

##### `isActive()`
- signature: `function isActive()`
- purpose: Returns whether the renderer is currently running
- logic: `return active;`
- returns: boolean

##### `buildShaders()`
- signature: `function buildShaders()`
- purpose: Compile vertex/fragment shaders, link program, cache attribute and uniform locations
- logic:
    1. Vertex shader source string (GLSL 300 es):
       ```
       #version 300 es
       in vec2 a_position;
       in vec3 a_color;
       in float a_brightness;
       uniform vec2 u_resolution;
       out vec3 v_color;
       out float v_brightness;
       void main() {
           vec2 clipPos = (a_position / u_resolution) * 2.0 - 1.0;
           clipPos.y = -clipPos.y;
           gl_Position = vec4(clipPos, 0.0, 1.0);
           gl_PointSize = 2.0;
           v_color = a_color;
           v_brightness = a_brightness;
       }
       ```
    2. Fragment shader source string (GLSL 300 es):
       ```
       #version 300 es
       precision mediump float;
       in vec3 v_color;
       in float v_brightness;
       out vec4 fragColor;
       void main() {
           float b = 0.15 + v_brightness * 0.85;
           fragColor = vec4(v_color * b, 1.0);
       }
       ```
    3. `var vs = gl.createShader(gl.VERTEX_SHADER)`. `gl.shaderSource(vs, vertSrc)`. `gl.compileShader(vs)`. If `!gl.getShaderParameter(vs, gl.COMPILE_STATUS)`: `console.warn('VS compile:', gl.getShaderInfoLog(vs))`, set `program = null`, return.
    4. `var fs = gl.createShader(gl.FRAGMENT_SHADER)`. `gl.shaderSource(fs, fragSrc)`. `gl.compileShader(fs)`. If `!gl.getShaderParameter(fs, gl.COMPILE_STATUS)`: `console.warn('FS compile:', gl.getShaderInfoLog(fs))`, set `program = null`, return.
    5. `program = gl.createProgram()`. `gl.attachShader(program, vs)`. `gl.attachShader(program, fs)`. `gl.linkProgram(program)`. If `!gl.getProgramParameter(program, gl.LINK_STATUS)`: `console.warn('Link:', gl.getProgramInfoLog(program))`, set `program = null`, return.
    6. `program.a_position = gl.getAttribLocation(program, 'a_position')`.
    7. `program.a_color = gl.getAttribLocation(program, 'a_color')`.
    8. `program.a_brightness = gl.getAttribLocation(program, 'a_brightness')`.
    9. `program.u_resolution = gl.getUniformLocation(program, 'u_resolution')`.
- returns: void (sets module-level `program`; null on failure)

##### `buildLayout()`
- signature: `function buildLayout()`
- purpose: Compute pixel (x,y) per neuron in a grid grouped by region; upload position and color buffers to GPU
- logic:
    1. `var regionType = BRAIN.workerRegionType` (Uint8Array of length neuronCount).
    2. Build per-region neuron index lists: `var regionNeurons = [[], [], [], []]`. Loop `i = 0` to `neuronCount - 1`: `regionNeurons[regionType[i]].push(i)`.
    3. `var W = canvas.width`.
    4. `var usableW = W - PAD * 2`.
    5. `cols = Math.max(1, Math.floor(usableW / POINT_SIZE))`.
    6. `neuronPositions = new Float32Array(neuronCount * 2)`.
    7. `var posData = new Float32Array(neuronCount * 2)`.
    8. `var colorData = new Float32Array(neuronCount * 3)`.
    9. `var cursorY = 0`. `sectionBounds = []`.
    10. For each `r` in `[0, 1, 2, 3]`:
        a. `var neurons = regionNeurons[r]`.
        b. If `neurons.length === 0`: push `{y0: cursorY, y1: cursorY, region: r, neuronIndices: []}` to `sectionBounds`. Continue.
        c. `var sectionY0 = cursorY`.
        d. `cursorY += SECTION_GAP` (vertical space for label).
        e. `var rowCount = Math.ceil(neurons.length / cols)`.
        f. For `j = 0` to `neurons.length - 1`:
            - `var nIdx = neurons[j]`
            - `var c = j % cols`
            - `var row = Math.floor(j / cols)`
            - `var px = PAD + c * POINT_SIZE + POINT_SIZE * 0.5`
            - `var py = cursorY + row * POINT_SIZE + POINT_SIZE * 0.5`
            - `posData[nIdx * 2] = px`
            - `posData[nIdx * 2 + 1] = py`
            - `neuronPositions[nIdx * 2] = px`
            - `neuronPositions[nIdx * 2 + 1] = py`
            - `var rgb = REGION_COLORS[r]`
            - `colorData[nIdx * 3] = rgb[0]`
            - `colorData[nIdx * 3 + 1] = rgb[1]`
            - `colorData[nIdx * 3 + 2] = rgb[2]`
        g. `cursorY += rowCount * POINT_SIZE + 2`.
        h. Push `{y0: sectionY0, y1: cursorY, region: r, neuronIndices: neurons}` to `sectionBounds`.
    11. `canvas.height = Math.ceil(cursorY)`.
    12. `gl.viewport(0, 0, canvas.width, canvas.height)`.
    13. `posBuffer = gl.createBuffer()`. `gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)`. `gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW)`.
    14. `colorBuffer = gl.createBuffer()`. `gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)`. `gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.STATIC_DRAW)`.
    15. `brightnessData = new Float32Array(neuronCount)`.
    16. `brightnessBuffer = gl.createBuffer()`. `gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer)`. `gl.bufferData(gl.ARRAY_BUFFER, brightnessData, gl.DYNAMIC_DRAW)`.
- returns: void

##### `buildLabels()`
- signature: `function buildLabels()`
- purpose: Create HTML label overlays positioned above each region section in the canvas
- logic:
    1. `labelContainer.innerHTML = ''`.
    2. For `r = 0` to `3`:
        a. If `sectionBounds[r].neuronIndices.length === 0`, skip.
        b. `var div = document.createElement('div')`.
        c. Set `div.style.cssText = 'position:absolute;left:4px;top:' + sectionBounds[r].y0 + 'px;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;padding:0.15rem 0.3rem;border-radius:3px;font-family:system-ui,-apple-system,sans-serif;color:' + LABEL_COLORS[r] + ';background:' + LABEL_BGS[r] + ';'`.
        d. `div.textContent = SECTION_NAMES[r]`.
        e. `labelContainer.appendChild(div)`.
- returns: void

##### `renderLoop()`
- signature: `function renderLoop()`
- purpose: Read latest fire state, update brightness buffer, draw all neurons as GL_POINTS, schedule next frame
- logic:
    1. If `!active`, return without scheduling next frame.
    2. `var fire = BRAIN.latestFireState`.
    3. If `fire` and `fire.length >= neuronCount`:
        - Loop `i = 0` to `neuronCount - 1`: `brightnessData[i] = fire[i] ? 1.0 : 0.0`.
    4. Else:
        - Loop `i = 0` to `neuronCount - 1`: `brightnessData[i] = 0.0`.
    5. `gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer)`. `gl.bufferSubData(gl.ARRAY_BUFFER, 0, brightnessData)`.
    6. `gl.clearColor(0.086, 0.129, 0.243, 1.0)` (matches --surface #16213e).
    7. `gl.clear(gl.COLOR_BUFFER_BIT)`.
    8. `gl.useProgram(program)`.
    9. `gl.uniform2f(program.u_resolution, canvas.width, canvas.height)`.
    10. `gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer)`. `gl.enableVertexAttribArray(program.a_position)`. `gl.vertexAttribPointer(program.a_position, 2, gl.FLOAT, false, 0, 0)`.
    11. `gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer)`. `gl.enableVertexAttribArray(program.a_color)`. `gl.vertexAttribPointer(program.a_color, 3, gl.FLOAT, false, 0, 0)`.
    12. `gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer)`. `gl.enableVertexAttribArray(program.a_brightness)`. `gl.vertexAttribPointer(program.a_brightness, 1, gl.FLOAT, false, 0, 0)`.
    13. `gl.drawArrays(gl.POINTS, 0, neuronCount)`.
    14. `animFrameId = requestAnimationFrame(renderLoop)`.
- returns: void
- note: Single draw call for all 139K neurons. GL_POINTS with per-vertex attributes is equivalent to instanced points for this use case but simpler. The task spec says "single draw call using ANGLE_instanced_arrays" but ANGLE_instanced_arrays is a WebGL1 extension; in WebGL2 we use native drawArrays which achieves the same single-draw-call goal.

##### `onMouseMove(e)`
- signature: `function onMouseMove(e)`
- purpose: Find nearest neuron to cursor using grid-based O(1) lookup, show tooltip with group name + description
- logic:
    1. `var rect = canvas.getBoundingClientRect()`.
    2. `var mx = e.clientX - rect.left`.
    3. `var scrollTop = canvas.parentElement.scrollTop`.
    4. `var canvasY = (e.clientY - rect.top) + scrollTop`.
    5. Find which section mouse is in: loop `r = 0` to `3`. If `canvasY >= sectionBounds[r].y0 && canvasY < sectionBounds[r].y1 && sectionBounds[r].neuronIndices.length > 0`, set `var bounds = sectionBounds[r]` and break. If no match, hide tooltip (`tooltipEl.style.display = 'none'`), return.
    6. `var neurons = bounds.neuronIndices`.
    7. `var sectionTopY = bounds.y0 + SECTION_GAP` (Y where dots start).
    8. `var approxRow = Math.floor((canvasY - sectionTopY) / POINT_SIZE)`.
    9. `var approxCol = Math.floor((mx - PAD) / POINT_SIZE)`.
    10. `var maxRow = Math.ceil(neurons.length / cols) - 1`. Clamp `approxRow` to `[0, maxRow]`.
    11. Clamp `approxCol` to `[0, cols - 1]`.
    12. `var bestDist = PICK_RADIUS_SQ`. `var bestIdx = -1`.
    13. For `dr = -1` to `1`: for `dc = -1` to `1`:
        - `var checkRow = approxRow + dr`. `var checkCol = approxCol + dc`.
        - If `checkRow < 0 || checkRow > maxRow || checkCol < 0 || checkCol >= cols`, continue.
        - `var j = checkRow * cols + checkCol`. If `j >= neurons.length`, continue.
        - `var nIdx = neurons[j]`.
        - `var dx = neuronPositions[nIdx * 2] - mx`.
        - `var dy = neuronPositions[nIdx * 2 + 1] - canvasY`.
        - `var dist = dx * dx + dy * dy`.
        - If `dist < bestDist`: `bestDist = dist; bestIdx = nIdx`.
    14. If `bestIdx === -1`: `tooltipEl.style.display = 'none'`. Return.
    15. `var gid = BRAIN.workerGroupIdArr[bestIdx]`.
    16. `var groupName = BRAIN.workerGroupIdToName[gid] || ('group_' + gid)`.
    17. `var desc = (typeof neuronDescriptions !== 'undefined' && neuronDescriptions[groupName]) ? neuronDescriptions[groupName] : groupName.replace(/_/g, ' ')`.
    18. `tooltipEl.textContent = desc`.
    19. `tooltipEl.style.display = 'block'`.
    20. `tooltipEl.style.left = (e.clientX + 10) + 'px'`.
    21. `tooltipEl.style.bottom = (window.innerHeight - e.clientY + 10) + 'px'`.
    22. `tooltipEl.style.top = 'auto'`.
- returns: void

##### `onMouseLeave(e)`
- signature: `function onMouseLeave(e)`
- purpose: Hide tooltip when mouse exits the canvas
- logic:
    1. If `tooltipEl`, set `tooltipEl.style.display = 'none'`.
- returns: void

#### Wiring / Integration
- At end of IIFE, before closing `})();`:
  ```javascript
  window.NeuroRenderer = { init: init, destroy: destroy, isActive: isActive };
  ```
- Called from main.js (see file operation #5).

### 4. MODIFY index.html
- operation: MODIFY
- reason: Add script tag for neuro-renderer.js between brain-worker-bridge.js and fly-logic.js
- anchor: `<script type="text/javascript" src="./js/brain-worker-bridge.js"></script>`

#### Changes
- Add the following line immediately after the brain-worker-bridge.js script tag:
  ```html
  <script type="text/javascript" src="./js/neuro-renderer.js"></script>
  ```

### 5. MODIFY js/main.js
- operation: MODIFY
- reason: Initialize NeuroRenderer when worker is ready; skip DOM dot updates when WebGL is active; integrate with connectome toggle button

#### Change A: Add NeuroRenderer init polling
- anchor: `BRAIN.randExcite();` (line 486)
- Add immediately after that line (before `var brainTickId = setInterval(updateBrain, 500);`):
  ```javascript
  // Poll for worker ready state to init WebGL neuron renderer
  var _neuroRendererInitTimer = setInterval(function () {
      if (BRAIN.workerReady && typeof NeuroRenderer !== 'undefined') {
          clearInterval(_neuroRendererInitTimer);
          NeuroRenderer.init();
      }
  }, 200);
  setTimeout(function () { clearInterval(_neuroRendererInitTimer); }, 30000);
  ```

#### Change B: Skip DOM dot updates when WebGL renderer is active
- anchor: `for (var postSynaptic in BRAIN.connectome) {` (line 448, inside updateBrain function)
- Wrap the entire DOM dot update block (from that `for` loop through the closing `}` that ends `psBox.classList.toggle(...)` on line 464) in a conditional check. The existing code block is:
  ```javascript
  	for (var postSynaptic in BRAIN.connectome) {
  		var psBox = document.getElementById(postSynaptic);
  		if (!psBox) continue;
  		var neuron = BRAIN.postSynaptic[postSynaptic][BRAIN.thisState];
  		var color = neuronColorMap[postSynaptic] || '#55FF55';
  		var baseOpacity = Math.min(1, neuron / 50);
  		var dots = neuronDotCache[postSynaptic];
  		if (!dots) continue;
  		for (var di = 0; di < dots.length; di++) {
  			var variation = (Math.random() - 0.5) * 0.6;
  			var dotOpacity = Math.max(0, Math.min(1, baseOpacity + variation * baseOpacity));
  			dots[di].style.backgroundColor = color;
  			dots[di].style.opacity = dotOpacity;
  			dots[di].style.boxShadow = dotOpacity > 0.5 ? '0 0 ' + Math.round(dotOpacity * 4) + 'px ' + color : 'none';
  		}
  		psBox.classList.toggle('cg-active', baseOpacity > 0.15);
  	}
  ```
- Replace with:
  ```javascript
  	if (typeof NeuroRenderer === 'undefined' || !NeuroRenderer.isActive()) {
  		for (var postSynaptic in BRAIN.connectome) {
  			var psBox = document.getElementById(postSynaptic);
  			if (!psBox) continue;
  			var neuron = BRAIN.postSynaptic[postSynaptic][BRAIN.thisState];
  			var color = neuronColorMap[postSynaptic] || '#55FF55';
  			var baseOpacity = Math.min(1, neuron / 50);
  			var dots = neuronDotCache[postSynaptic];
  			if (!dots) continue;
  			for (var di = 0; di < dots.length; di++) {
  				var variation = (Math.random() - 0.5) * 0.6;
  				var dotOpacity = Math.max(0, Math.min(1, baseOpacity + variation * baseOpacity));
  				dots[di].style.backgroundColor = color;
  				dots[di].style.opacity = dotOpacity;
  				dots[di].style.boxShadow = dotOpacity > 0.5 ? '0 0 ' + Math.round(dotOpacity * 4) + 'px ' + color : 'none';
  			}
  			psBox.classList.toggle('cg-active', baseOpacity > 0.15);
  		}
  	}
  ```

#### Change C: Update connectome toggle button handler
- anchor: the existing event listener block starting with:
  ```javascript
  connectomeToggleBtn.addEventListener('click', function () {
  	var isHidden = nodeHolder.classList.contains('hidden');
  	if (isHidden) {
  		nodeHolder.classList.remove('hidden');
  		connectomeToggleBtn.textContent = 'Hide';
  	} else {
  		nodeHolder.classList.add('hidden');
  		connectomeToggleBtn.textContent = 'Show';
  	}
  });
  ```
- Replace the entire addEventListener call with:
  ```javascript
  connectomeToggleBtn.addEventListener('click', function () {
  	if (typeof NeuroRenderer !== 'undefined' && NeuroRenderer.isActive()) {
  		NeuroRenderer.destroy();
  		nodeHolder.classList.remove('hidden');
  		connectomeToggleBtn.textContent = 'Hide';
  	} else if (nodeHolder.classList.contains('hidden')) {
  		nodeHolder.classList.remove('hidden');
  		connectomeToggleBtn.textContent = 'Hide';
  	} else {
  		nodeHolder.classList.add('hidden');
  		connectomeToggleBtn.textContent = 'Show';
  	}
  });
  ```

### 6. MODIFY css/main.css
- operation: MODIFY
- reason: Add styles for the WebGL renderer wrapper and canvas element
- anchor: `#nodeHolder.hidden {`

#### Changes
- After the existing `#nodeHolder.hidden { display: none; }` rule block, add:
  ```css
  #neuro-renderer-wrap {
      position: relative;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
  }

  #neuro-canvas {
      display: block;
      image-rendering: pixelated;
  }

  #neuro-labels {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      pointer-events: none;
  }
  ```

## Verification
- build: no build step (vanilla JS project)
- lint: no linter configured
- test: `node tests/run-node.js`
- smoke: Open index.html in a browser with data files present (data/connectome.bin.gz and data/neuron_meta.json). Verify:
  1. Left sidebar shows a WebGL canvas with colored dots in 4 sections (blue sensory, purple central, amber drives, red motor) with section labels
  2. Dots flash bright when their neurons fire, dim (15% brightness) when not firing
  3. Hovering over a dot region shows tooltip with group name and description
  4. Clicking "Hide" button destroys the WebGL renderer and shows the old DOM dot clusters
  5. If data files are missing (no connectome.bin.gz), the old 59-group DOM dots display as before (fallback mode)
  6. No console errors related to WebGL or shader compilation

## Constraints
- Do NOT modify SPEC.md, TASKS.md, or CLAUDE.md
- Do NOT modify js/fly-logic.js (behavioral state machine is unchanged)
- Do NOT add any external dependencies or npm packages
- Do NOT change the sim-worker.js tick or simulation logic — only modify the postReady message to include regionType
- The DOM-based dot cluster code in main.js must remain functional for fallback (when WebGL renderer is not active or worker fails to load)
- All CSS colors must use existing CSS custom properties except in WebGL shaders where RGB float values are hardcoded to match the CSS variable values
- The tooltip must reuse the existing `#neuronTooltip` element — do NOT create a new tooltip element
- Keep the existing connectome-header (label, subtitle, toggle button) intact — only the nodeHolder content area is replaced by the WebGL canvas
- The `neuronDescriptions` object in main.js is a global variable — the renderer accesses it via `typeof neuronDescriptions !== 'undefined' && neuronDescriptions[groupName]`
