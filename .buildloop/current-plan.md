# Plan: T1.3

Build interaction toolbar and wire user inputs to sensory neurons. Add top toolbar with tool buttons (Feed, Touch, Air, Light). Implement tool selection + canvas click/drag handlers. Map each interaction to the appropriate sensory neuron group stimulation. Add bottom panel with connectome visualization (colored by region) and drive meters.

## Dependencies
- list: none (vanilla JS, no build step, no dependencies)
- commands: none

## File Operations (in execution order)

---

### 1. MODIFY css/main.css
- operation: MODIFY
- reason: Remove obsolete toggle/slider styles, add toolbar + bottom panel + tool button + drive meter styles, update brainNode sizing and nodeHolder positioning for bottom panel layout

#### Section A: Add CSS custom properties at the very top of the file
- anchor: `html,` (first line of file)
- Insert BEFORE `html,` the following block:

```css
:root {
    --bg: #1a1a2e;
    --surface: #16213e;
    --surface-hover: #1a2744;
    --surface-alpha: rgba(22, 33, 62, 0.92);
    --border: #2a3a5c;
    --text: #e8e8e8;
    --text-muted: #8892a4;
    --accent: #E3734B;
    --accent-hover: #f0855f;
    --accent-subtle: rgba(227, 115, 75, 0.15);
    --success: #4ade80;
    --warning: #fbbf24;
    --error: #f87171;
    --radius: 8px;
    --neuron-sensory: #3b82f6;
    --neuron-central: #8b5cf6;
    --neuron-drives: #f59e0b;
    --neuron-motor: #ef4444;
}
```

#### Section B: Add transition to canvas rule
- anchor: `canvas {` (line 8)
- Add `transition: background-color 0.5s ease;` after `background-color: #222;`
- Final rule:
```css
canvas {
    display: block;
    background-color: #222;
    transition: background-color 0.5s ease;
}
```

#### Section C: Modify .brainNode rule
- anchor: `.brainNode {` (line 13)
- Replace the entire `.brainNode { ... }` block with:
```css
.brainNode {
    border-radius: 50%;
    display: inline-block;
    height: 6px;
    width: 6px;
    margin: 1px;
    transition: opacity .3s;
}
```

#### Section D: Modify #nodeHolder rule
- anchor: `#nodeHolder {` (line 28)
- Replace the entire `#nodeHolder { ... }` block with:
```css
#nodeHolder {
    display: flex;
    flex-wrap: wrap;
    gap: 1px;
    align-content: flex-start;
}
```

#### Section E: Remove ALL toggle/slider CSS
- Remove these 10 blocks entirely (they correspond to the removed `#toggleConnectome` checkbox element):
  - `.switch { ... }` (anchor: `.switch {`, line 35)
  - `.switch input { ... }` (anchor: `.switch input {`, line 42)
  - `.slider { ... }` (anchor: the first standalone `.slider {`, line 46)
  - `.slider:before { ... }` (anchor: `.slider:before {`, line 58)
  - `input:checked+.slider { ... }` (anchor: `input:checked+.slider {`, line 70)
  - `input:focus+.slider { ... }` (anchor: `input:focus+.slider {`, line 74)
  - `input:checked+.slider:before { ... }` (anchor: `input:checked+.slider:before {`, line 78)
  - `.slider.round { ... }` (anchor: `.slider.round {`, line 84)
  - `.slider.round:before { ... }` (anchor: `.slider.round:before {`, line 88)
  - `#toggleConnectome { ... }` (anchor: `#toggleConnectome {`, line 92)

#### Section F: Replace #githubButton rule
- anchor: `#githubButton {` (line 99)
- Replace entire block with:
```css
#githubButton {
    height: 20px;
    opacity: 0.6;
    transition: opacity 0.2s ease;
    vertical-align: middle;
}

#githubButton:hover {
    opacity: 1;
}
```

#### Section G: Remove #buttons rule
- anchor: `#buttons {` (line 107)
- Remove the entire `#buttons { ... }` block (the #buttons div is removed from HTML)

#### Section H: Add toolbar styles after .noselect rule
- anchor: after the `.noselect { ... }` block (the last existing rule)
- Append all of the following:

```css
/* --- Toolbar --- */
#toolbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 44px;
    background: var(--surface-alpha);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1rem;
    z-index: 20;
    font-family: system-ui, -apple-system, sans-serif;
}

.toolbar-left {
    display: flex;
    gap: 0.5rem;
    align-items: center;
}

.toolbar-right {
    display: flex;
    gap: 0.75rem;
    align-items: center;
}

.toolbar-title {
    color: var(--text-muted);
    font-size: 0.85rem;
    font-weight: 500;
    letter-spacing: 0.03em;
}

.toolbar-icon {
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.2s ease;
    vertical-align: middle;
}

.toolbar-icon:hover {
    opacity: 1;
}

.tool-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text);
    padding: 0.25rem 0.75rem;
    border-radius: var(--radius);
    cursor: pointer;
    font-size: 0.8rem;
    font-family: system-ui, -apple-system, sans-serif;
    transition: border-color 0.2s ease, background 0.2s ease;
    white-space: nowrap;
}

.tool-btn:hover {
    border-color: var(--accent);
}

.tool-btn.active {
    border-color: var(--accent);
    background: var(--accent-subtle);
    color: var(--accent);
}

/* --- Bottom Panel --- */
#bottom-panel {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 90px;
    background: var(--surface-alpha);
    border-top: 1px solid var(--border);
    display: flex;
    z-index: 20;
    padding: 0.5rem 1rem;
    gap: 1rem;
    font-family: system-ui, -apple-system, sans-serif;
}

#connectome-panel {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
}

.connectome-label {
    font-size: 0.7rem;
    color: var(--text-muted);
    flex-shrink: 0;
}

#drive-meters {
    width: 180px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 0.4rem;
}

.drive-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.drive-label {
    font-size: 0.7rem;
    color: var(--text-muted);
    width: 52px;
    flex-shrink: 0;
    text-align: right;
}

.drive-bar-bg {
    flex: 1;
    height: 8px;
    background: rgba(255, 255, 255, 0.06);
    border-radius: 4px;
    overflow: hidden;
}

.drive-bar {
    height: 100%;
    border-radius: 4px;
    transition: width 0.4s ease;
    width: 0%;
}

#driveHunger {
    background: var(--warning);
}

#driveFear {
    background: var(--error);
}

#driveFatigue {
    background: var(--text-muted);
}

#driveCuriosity {
    background: var(--success);
}
```

---

### 2. MODIFY index.html
- operation: MODIFY
- reason: Add toolbar div at top, restructure body to include bottom panel with connectome and drive meters, remove obsolete toggle/buttons elements

#### Section A: Replace entire `<body>` content
- anchor: `<body>` (line 9)
- Replace everything between `<body>` and `</body>` (lines 10-25) with:

```html
    <div id="toolbar">
        <div class="toolbar-left">
            <button class="tool-btn active" data-tool="feed">Feed</button>
            <button class="tool-btn" data-tool="touch">Touch</button>
            <button class="tool-btn" data-tool="air">Air</button>
            <button class="tool-btn" data-tool="light" id="lightBtn">Light: Bright</button>
        </div>
        <div class="toolbar-right">
            <span class="toolbar-title">FlyBrain</span>
            <img id="centerButton" src="./svg/center.svg" height="24" class="noselect toolbar-icon">
            <img id="clearButton" src="./svg/clear.svg" height="24" class="noselect toolbar-icon">
            <a href="https://github.com/snedea/homelab/tree/main/flybrain">
                <img id="githubButton" src="./svg/github.svg" class="noselect">
            </a>
        </div>
    </div>
    <canvas id='canvas'></canvas>
    <div id="bottom-panel">
        <div id="connectome-panel">
            <span class="connectome-label">Connectome</span>
            <div id="nodeHolder"></div>
        </div>
        <div id="drive-meters">
            <div class="drive-row">
                <span class="drive-label">Hunger</span>
                <div class="drive-bar-bg"><div class="drive-bar" id="driveHunger"></div></div>
            </div>
            <div class="drive-row">
                <span class="drive-label">Fear</span>
                <div class="drive-bar-bg"><div class="drive-bar" id="driveFear"></div></div>
            </div>
            <div class="drive-row">
                <span class="drive-label">Fatigue</span>
                <div class="drive-bar-bg"><div class="drive-bar" id="driveFatigue"></div></div>
            </div>
            <div class="drive-row">
                <span class="drive-label">Curiosity</span>
                <div class="drive-bar-bg"><div class="drive-bar" id="driveCuriosity"></div></div>
            </div>
        </div>
    </div>
    <script type="text/javascript" src="./js/constants.js"></script>
    <script type="text/javascript" src="./js/connectome.js"></script>
    <script type="text/javascript" src="./js/main.js"></script>
```

Note: The elements `#centerButton`, `#clearButton`, `#githubButton`, `#nodeHolder` retain their IDs. The `#toggleConnectome` checkbox and `#buttons` div are removed entirely. The `#nodeHolder` is now a child of `#connectome-panel` inside `#bottom-panel`.

---

### 3. MODIFY js/main.js
- operation: MODIFY
- reason: Add tool state management, canvas interaction dispatcher, sensory neuron stimulation per tool, neuron region coloring, drive meter updates, light-level canvas background

#### Section A: Remove toggleConnectome function
- anchor: `function toggleConnectome() {` (line 27)
- Remove the entire function (lines 27-30):
```js
function toggleConnectome() {
	document.getElementById('nodeHolder').style.opacity =
		document.getElementById('connectomeCheckbox').checked ? '1' : '0';
}
```

#### Section B: Add tool state variables after existing state variables
- anchor: `var frameCount = 0;` (line 25)
- Insert AFTER `var frameCount = 0;` the following block:

```js

// --- Tool state ---
var activeTool = 'feed';
var isDragging = false;
var dragStart = { x: 0, y: 0 };
var lightStates = [1, 0.5, 0];
var lightStateIndex = 0;
var lightLabels = ['Bright', 'Dim', 'Dark'];

// Region-based neuron color map (built after BRAIN.setup)
var neuronColorMap = {};
var regionColors = {
	sensory: '#3b82f6',
	central: '#8b5cf6',
	drives: '#f59e0b',
	motor: '#ef4444',
};
```

#### Section C: Build neuronColorMap after brainNode creation loop
- anchor: `document.getElementById('nodeHolder').appendChild(newBox);` (line 44, last line of the for loop body)
- Insert AFTER the closing `}` of the `for (var ps in BRAIN.connectome) {` loop (after line 45) the following block:

```js

// Build neuron -> color lookup from BRAIN.neuronRegions
for (var region in BRAIN.neuronRegions) {
	var neurons = BRAIN.neuronRegions[region];
	for (var i = 0; i < neurons.length; i++) {
		neuronColorMap[neurons[i]] = regionColors[region] || '#55FF55';
	}
}
```

#### Section D: Add tool button event listeners after neuronColorMap build
- Insert immediately after the neuronColorMap build block (from Section C):

```js

// --- Tool button handlers ---
var toolButtons = document.querySelectorAll('.tool-btn[data-tool]');
for (var i = 0; i < toolButtons.length; i++) {
	(function (btn) {
		var tool = btn.getAttribute('data-tool');
		if (tool === 'light') {
			btn.addEventListener('click', cycleLightLevel);
		} else {
			btn.addEventListener('click', function () {
				activeTool = tool;
				for (var j = 0; j < toolButtons.length; j++) {
					var t = toolButtons[j].getAttribute('data-tool');
					if (t !== 'light') {
						toolButtons[j].classList.remove('active');
					}
				}
				btn.classList.add('active');
			});
		}
	})(toolButtons[i]);
}
```

#### Section E: Modify updateBrain to use region colors
- anchor: `psBox.style.backgroundColor = '#55FF55';` (line 56)
- Replace that single line with:
```js
		psBox.style.backgroundColor = neuronColorMap[postSynaptic] || '#55FF55';
```

#### Section F: Add drive meter updates at the end of updateBrain function
- anchor: `speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 1.5);` (line 65, last line before the closing `}` of updateBrain)
- Insert AFTER that line (but still inside updateBrain, before its closing `}`):

```js

	// Update drive meter bars
	var driveHungerEl = document.getElementById('driveHunger');
	var driveFearEl = document.getElementById('driveFear');
	var driveFatigueEl = document.getElementById('driveFatigue');
	var driveCuriosityEl = document.getElementById('driveCuriosity');
	if (driveHungerEl) driveHungerEl.style.width = (BRAIN.drives.hunger * 100) + '%';
	if (driveFearEl) driveFearEl.style.width = (BRAIN.drives.fear * 100) + '%';
	if (driveFatigueEl) driveFatigueEl.style.width = (BRAIN.drives.fatigue * 100) + '%';
	if (driveCuriosityEl) driveCuriosityEl.style.width = (BRAIN.drives.curiosity * 100) + '%';
```

#### Section G: Replace canvas mousedown listener and addFood function
- anchor: `canvas.addEventListener('mousedown', addFood, false);` (line 75)
- Replace lines 75-81 (the addEventListener call and the entire `addFood` function) with:

```js
canvas.addEventListener('mousedown', handleCanvasMousedown, false);
canvas.addEventListener('mousemove', handleCanvasMousemove, false);
canvas.addEventListener('mouseup', handleCanvasMouseup, false);

function handleCanvasMousedown(event) {
	var cx = event.clientX;
	var cy = event.clientY;

	if (activeTool === 'feed') {
		food.push({ x: cx, y: cy });
	} else if (activeTool === 'touch') {
		applyTouchTool(cx, cy);
	} else if (activeTool === 'air') {
		isDragging = true;
		dragStart.x = cx;
		dragStart.y = cy;
		BRAIN.stimulate.wind = true;
		BRAIN.stimulate.windStrength = 0.3;
	}
}

function handleCanvasMousemove(event) {
	if (!isDragging || activeTool !== 'air') return;
	var dx = event.clientX - dragStart.x;
	var dy = event.clientY - dragStart.y;
	var dragDist = Math.sqrt(dx * dx + dy * dy);
	BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);
}

function handleCanvasMouseup(event) {
	if (isDragging && activeTool === 'air') {
		var dx = event.clientX - dragStart.x;
		var dy = event.clientY - dragStart.y;
		var dragDist = Math.sqrt(dx * dx + dy * dy);
		if (dragDist < 5) {
			// Click (no drag): wind strength from proximity to fly
			var distToFly = Math.hypot(event.clientX - fly.x, event.clientY - fly.y);
			BRAIN.stimulate.windStrength = Math.max(0.1, Math.min(1, 1 - distToFly / 200));
		} else {
			BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);
		}
		BRAIN.stimulate.wind = true;
		isDragging = false;
		setTimeout(function () {
			BRAIN.stimulate.wind = false;
			BRAIN.stimulate.windStrength = 0;
		}, 2000);
	}
}

function applyTouchTool(cx, cy) {
	var distToFly = Math.hypot(cx - fly.x, cy - fly.y);
	if (distToFly > 50) return; // click not on fly

	// Transform click to fly-local coordinates
	var dx = cx - fly.x;
	var dy = cy - fly.y;
	var angle = facingDir - Math.PI / 2;
	var cosA = Math.cos(angle);
	var sinA = Math.sin(angle);
	var localX = dx * cosA - dy * sinA;
	var localY = dx * sinA + dy * cosA;

	// Classify body part
	var location;
	if (Math.abs(localX) > 12 && localY > -20 && localY < 5) {
		location = 'leg';
	} else if (localY < -17) {
		location = 'head';
	} else if (localY < 2) {
		location = 'thorax';
	} else {
		location = 'abdomen';
	}

	BRAIN.stimulate.touch = true;
	BRAIN.stimulate.touchLocation = location;

	setTimeout(function () {
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.touchLocation = null;
	}, 2000);
}

function cycleLightLevel() {
	lightStateIndex = (lightStateIndex + 1) % lightStates.length;
	BRAIN.stimulate.lightLevel = lightStates[lightStateIndex];
	var btn = document.getElementById('lightBtn');
	if (btn) btn.textContent = 'Light: ' + lightLabels[lightStateIndex];
}
```

Note: The old `addFood(event)` function is entirely replaced. The `drawFood()` function (lines 83-90 in original) remains unchanged -- it reads the global `food` array which is still populated by the Feed tool handler above.

#### Section H: Add canvas background update in draw function
- anchor: `ctx.clearRect(0, 0, canvas.width, canvas.height);` (line 615, first line of draw function body)
- Insert BEFORE that line (as the first statement inside `draw()`):

```js
	// Update canvas background based on light level
	var ll = BRAIN.stimulate.lightLevel;
	if (ll >= 1) {
		canvas.style.backgroundColor = '#222';
	} else if (ll >= 0.5) {
		canvas.style.backgroundColor = '#161616';
	} else {
		canvas.style.backgroundColor = '#080808';
	}
```

---

## Verification
- build: N/A (no build step -- vanilla JS loaded via script tags)
- lint: N/A (no linter configured)
- test: N/A (no existing tests)
- smoke: Open `index.html` in a browser and verify ALL of the following:
  1. Top toolbar visible with 4 buttons: Feed (highlighted by default), Touch, Air, Light. Center/Clear/GitHub icons on the right.
  2. Click "Touch" -- it highlights, "Feed" un-highlights. Click "Feed" -- it re-highlights.
  3. With Feed active, click canvas -- yellow food dot appears at click location. Fly walks toward it.
  4. With Touch active, click directly on fly body -- fly should show startle/groom response (BRAIN.stimulate.touch is set). Click far from fly -- nothing happens.
  5. With Air active, click and drag on canvas -- on release, fly responds to wind stimulus.
  6. Click Light button -- label changes to "Light: Dim", canvas background darkens. Click again -- "Light: Dark", canvas very dark. Click again -- "Light: Bright", canvas back to normal.
  7. Bottom panel visible with colored neuron dots (blue for sensory, purple for central, amber for drives, red for motor) and four drive meter bars (Hunger, Fear, Fatigue, Curiosity) that animate over time.
  8. Center button re-centers fly. Clear button removes all food dots.
  9. No console errors.

## Constraints
- Do NOT modify `js/connectome.js` -- it is read-only for this task
- Do NOT modify `js/constants.js` -- it is read-only for this task
- Do NOT remove the existing food proximity detection in the `update()` function (lines 592-601 in original) -- it handles BRAIN.stimulateFoodSenseNeurons
- Do NOT remove or modify the backward-compatible shim flags (`BRAIN.stimulateHungerNeurons`, `BRAIN.stimulateNoseTouchNeurons`, `BRAIN.stimulateFoodSenseNeurons`) or the setTimeout reset at lines 604-608
- Do NOT add gradients, glassmorphism, glows, or colored shadows to any UI element
- All UI colors must use CSS custom properties from `:root` (except neuron region colors which are data-viz specific and defined as `--neuron-*` variables)
- The only allowed shadow is `0 1px 3px rgba(0,0,0,0.3)` -- do not add any shadows beyond this
- The `drawFood()` function must remain unchanged
- Keep canvas fullscreen (`window.innerWidth / window.innerHeight`) -- toolbar and bottom panel are fixed-position overlays above the canvas
