# Plan: T4.2

## Dependencies
- list: [] (no new dependencies -- vanilla JS project with no build step)
- commands: [] (none)

## File Operations (in execution order)

### 1. MODIFY index.html
- operation: MODIFY
- reason: Add help button (?) to toolbar-left, add connectome toggle button to bottom panel, add help overlay HTML element

#### Changes

**Change 1: Add help button to toolbar-left, after the Light button**
- anchor: `<button class="tool-btn" data-tool="light" id="lightBtn">Light: Bright</button>`
- After that line (still inside `.toolbar-left` div), insert:
```html
<button class="tool-btn" id="helpBtn">?</button>
```

**Change 2: Add help overlay element, between the closing `</div>` of `#toolbar` and the `<canvas>` tag**
- anchor: `<canvas id='canvas'></canvas>`
- Before the `<canvas>` tag, insert:
```html
<div id="helpOverlay" class="help-overlay" style="display:none;">
    <div class="help-overlay-header">
        <span>Interaction Guide</span>
        <button class="help-close-btn" id="helpCloseBtn">&times;</button>
    </div>
    <div class="help-item"><strong>Feed</strong> -- Click on the canvas to place food. The fly will seek and eat it when hungry.</div>
    <div class="help-item"><strong>Touch</strong> -- Click on the fly to touch it. Location matters: head, thorax, abdomen, or leg each triggers different grooming.</div>
    <div class="help-item"><strong>Air</strong> -- Click and drag near the fly to blow wind. Drag distance controls wind strength.</div>
    <div class="help-item"><strong>Light</strong> -- Cycles through Bright, Dim, and Dark. The fly exhibits phototaxis toward light.</div>
</div>
```

**Change 3: Add connectome toggle button inside #connectome-panel, after the connectome-label span**
- anchor: `<span class="connectome-label">Connectome</span>`
- Replace that line with:
```html
<div class="connectome-header">
    <span class="connectome-label">Connectome</span>
    <button class="connectome-toggle-btn" id="connectomeToggleBtn">Hide</button>
</div>
```

### 2. MODIFY css/main.css
- operation: MODIFY
- reason: Add styles for help overlay, help button, connectome toggle button, connectome-header row

#### Changes

**Change 1: Add new CSS rules at the end of the file (after the `.behavior-state` block)**
- anchor: (append after last line -- after closing `}` of `.behavior-state`)
- Append the following CSS:

```css

/* --- Help Overlay --- */
.help-overlay {
    position: fixed;
    top: 54px;
    left: 1rem;
    width: 280px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.75rem 1rem;
    z-index: 30;
    font-family: system-ui, -apple-system, sans-serif;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

.help-overlay-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
    color: var(--text);
    font-size: 0.85rem;
    font-weight: 600;
}

.help-close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
}

.help-close-btn:hover {
    color: var(--text);
}

.help-item {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin-bottom: 0.4rem;
    line-height: 1.4;
}

.help-item strong {
    color: var(--accent);
}

/* --- Connectome Header (label + toggle) --- */
.connectome-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
}

.connectome-toggle-btn {
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--text-muted);
    padding: 0 0.4rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.6rem;
    font-family: system-ui, -apple-system, sans-serif;
    transition: border-color 0.2s ease;
    line-height: 1.4;
}

.connectome-toggle-btn:hover {
    border-color: var(--accent);
    color: var(--text);
}

#nodeHolder.hidden {
    display: none;
}
```

### 3. MODIFY js/main.js
- operation: MODIFY
- reason: Add help button toggle logic, connectome toggle logic, touch-location-specific grooming animation, touch event handlers on canvas, edge avoidance behavior

#### Imports / Dependencies
- None (vanilla JS, all DOM elements accessed by ID)

#### Change 1: Add help button and connectome toggle handlers after the existing tool button handler block
- anchor: `})(toolButtons[i]);` (line 139, the closing of the tool-button handler IIFE loop)
- After the closing `}` of the for loop (after line 140), insert the following block:

```js

// --- Help overlay toggle ---
var helpOverlay = document.getElementById('helpOverlay');
var helpBtn = document.getElementById('helpBtn');
var helpCloseBtn = document.getElementById('helpCloseBtn');

helpBtn.addEventListener('click', function () {
	var isVisible = helpOverlay.style.display !== 'none';
	helpOverlay.style.display = isVisible ? 'none' : 'block';
});

helpCloseBtn.addEventListener('click', function () {
	helpOverlay.style.display = 'none';
});

// Close help overlay when clicking outside of it
document.addEventListener('click', function (e) {
	if (helpOverlay.style.display !== 'none' &&
		!helpOverlay.contains(e.target) &&
		e.target !== helpBtn) {
		helpOverlay.style.display = 'none';
	}
});

// --- Connectome panel toggle ---
var connectomeToggleBtn = document.getElementById('connectomeToggleBtn');
var nodeHolder = document.getElementById('nodeHolder');

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

#### Change 2: Add touch event handlers on canvas, immediately after the existing mouse event listeners
- anchor: `canvas.addEventListener('mouseup', handleCanvasMouseup, false);` (line 184)
- After that line, insert:

```js

// --- Touch event handlers (mobile/tablet support) ---
canvas.addEventListener('touchstart', function (event) {
	event.preventDefault();
	var touch = event.touches[0];
	handleCanvasMousedown({ clientX: touch.clientX, clientY: touch.clientY });
}, { passive: false });

canvas.addEventListener('touchmove', function (event) {
	event.preventDefault();
	var touch = event.touches[0];
	handleCanvasMousemove({ clientX: touch.clientX, clientY: touch.clientY });
}, { passive: false });

canvas.addEventListener('touchend', function (event) {
	event.preventDefault();
	// Use changedTouches for the touch that was lifted
	var touch = event.changedTouches[0];
	handleCanvasMouseup({ clientX: touch.clientX, clientY: touch.clientY });
}, { passive: false });
```

#### Change 3: Replace the grooming branch in drawLegs() to use touch-location-specific animation
- anchor: `} else if (isGrooming && pairIdx === 0) {` (line 1058)
- Replace the current grooming block (lines 1058-1061):
```js
		} else if (isGrooming && pairIdx === 0) {
			// Front legs: grooming rub -- swing inward and oscillate
			hipMod = -0.2 + Math.sin(anim.groomPhase) * 0.5;
			kneeMod = -0.6 + Math.sin(anim.groomPhase * 1.3) * 0.2;
```
- With the following expanded grooming animation:
```js
		} else if (isGrooming) {
			var groomLoc = BRAIN.stimulate.touchLocation || 'thorax';
			if (groomLoc === 'head' && pairIdx === 0) {
				// Front legs rub the head area: swing forward and inward
				hipMod = -0.9 + Math.sin(anim.groomPhase) * 0.4;
				kneeMod = -0.8 + Math.sin(anim.groomPhase * 1.5) * 0.25;
			} else if (groomLoc === 'abdomen' && pairIdx === 2) {
				// Rear legs reach back to abdomen: swing backward
				hipMod = 1.0 + Math.sin(anim.groomPhase * 0.8) * 0.3;
				kneeMod = 0.5 + Math.sin(anim.groomPhase * 1.2) * 0.2;
			} else if (groomLoc === 'thorax' && pairIdx === 0) {
				// Full bilateral front-leg grooming: wide symmetric rub
				hipMod = -0.2 + Math.sin(anim.groomPhase) * 0.5;
				kneeMod = -0.6 + Math.sin(anim.groomPhase * 1.3) * 0.2;
			} else if (groomLoc === 'leg') {
				// Targeted single-leg cleaning: only the leg on the touched side moves
				// Use side-based targeting: left legs clean when side=-1 touch
				var targetPair = pairIdx; // all legs may participate
				if (pairIdx === 1) {
					// Middle legs do the cleaning motion
					hipMod = 0.1 + Math.sin(anim.groomPhase * 1.1) * 0.4;
					kneeMod = 0.3 + Math.sin(anim.groomPhase * 1.4) * 0.3;
				}
			}
```
Note: The old code only animated front legs (pairIdx === 0) during groom. The new code checks `isGrooming` without restricting to pairIdx === 0, then dispatches to the correct pair based on `groomLoc`. Legs not matched by any groomLoc branch fall through to the else block (idle jitter), which is the correct behavior -- non-grooming legs stay at rest.

#### Change 4: Add abdomen curl animation during abdomen grooming in drawAbdomen()
- anchor: `function drawAbdomen() {` (line 835)
- Inside drawAbdomen(), after the line `var ry = BODY.abdomenRadiusY;` (line 839), insert:

```js

	// Abdomen curl during abdomen-specific grooming
	var abdomenCurl = 0;
	if (behavior.current === 'groom' && (BRAIN.stimulate.touchLocation === 'abdomen' || BRAIN.stimulate.touchLocation === null)) {
		abdomenCurl = Math.sin(anim.groomPhase * 0.8) * 2;
	}
	ay += abdomenCurl;
```

#### Change 5: Add edge avoidance in update() -- bias targetDir away from screen edges
- anchor: `fly.x += Math.cos(facingDir) * speed;` (line 1154)
- Before that line (i.e., after `facingDir += 0.1 * dtScale;` closing bracket), insert the edge avoidance block:

```js

	// Edge avoidance: bias targetDir away from screen edges when within 50px
	var edgeMargin = 50;
	var edgeBias = 0;
	var edgeBiasY = 0;
	var topBound = 44;
	var bottomBound = window.innerHeight - 90;
	var leftBound = 0;
	var rightBound = window.innerWidth;

	if (fly.x - leftBound < edgeMargin) {
		edgeBias += (edgeMargin - (fly.x - leftBound)) / edgeMargin; // push right (+x)
	} else if (rightBound - fly.x < edgeMargin) {
		edgeBias -= (edgeMargin - (rightBound - fly.x)) / edgeMargin; // push left (-x)
	}
	if (fly.y - topBound < edgeMargin) {
		edgeBiasY -= (edgeMargin - (fly.y - topBound)) / edgeMargin; // push down (-y, but facingDir uses -sin for y)
	} else if (bottomBound - fly.y < edgeMargin) {
		edgeBiasY += (edgeMargin - (bottomBound - fly.y)) / edgeMargin; // push up
	}

	if (edgeBias !== 0 || edgeBiasY !== 0) {
		// Compute desired direction away from edges
		var awayAngle = Math.atan2(edgeBiasY, edgeBias);
		var awayStrength = Math.min(1, Math.sqrt(edgeBias * edgeBias + edgeBiasY * edgeBiasY));
		var angleDiffEdge = awayAngle - targetDir;
		// Normalize to [-PI, PI]
		while (angleDiffEdge > Math.PI) angleDiffEdge -= 2 * Math.PI;
		while (angleDiffEdge < -Math.PI) angleDiffEdge += 2 * Math.PI;
		targetDir += angleDiffEdge * awayStrength * 0.3;
	}
```

This block is inserted BEFORE the `fly.x += ...` movement line so that the bias affects the fly's direction before position is updated. The strength scales linearly from 0 at 50px to 1 at the edge. The 0.3 multiplier makes the turn gradual (not instant).

## Verification
- build: No build step -- open `index.html` in a browser directly
- lint: No linter configured
- test: No existing tests
- smoke: Open `index.html` in a browser and verify:
  1. Help button (?) appears in toolbar after Light button; clicking it shows an overlay with tool descriptions; clicking X or outside closes it
  2. "Hide" button appears next to "Connectome" label; clicking it hides the node visualization dots and changes text to "Show"; clicking again restores them
  3. Touch the fly on different body parts (head, thorax, abdomen, leg) and observe grooming -- front legs should rub head for head touch, rear legs reach back for abdomen touch, bilateral front-leg rub for thorax, middle-leg cleaning for leg
  4. Open browser DevTools, toggle device toolbar (mobile emulation), touch/tap on canvas -- feed/touch/air tools should all work via touch events
  5. Observe the fly near screen edges -- it should gently steer away from the edges rather than hitting the wall and triggering touch neurons

## Constraints
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any file in .buildloop/ other than build-claims.md
- Do NOT modify js/connectome.js or js/constants.js -- all changes are in index.html, css/main.css, and js/main.js only
- Do NOT add external dependencies, build tools, or module imports
- Do NOT change the existing mouse event handler function signatures (handleCanvasMousedown, handleCanvasMousemove, handleCanvasMouseup) -- the touch handlers delegate to them
- Do NOT use em-dashes in comments or prose (use -- instead)
- Do NOT add gradients, glow effects, or glassmorphism to CSS -- follow the established design system using CSS custom properties
- The edge avoidance must NOT prevent the fly from being clamped at bounds -- it biases direction only; the hard clamp at lines 1158-1175 remains as a safety net
- Preserve the `touchLocation` value in `BRAIN.stimulate.touchLocation` so it persists during grooming -- do NOT clear it at the start of the groom state; it is cleared by the existing setTimeout in applyTouchTool
