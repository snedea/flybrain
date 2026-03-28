# Plan: T9.2

## Dependencies
- list: none (all deps already vendored)
- commands: none

## File Operations (in execution order)

### 1. MODIFY index.html
- operation: MODIFY
- reason: Add viewport-fit=cover to existing viewport meta (required for safe-area env() to return non-zero values in WKWebView). Add hamburger menu button. Add drawer backdrop overlay element. Add Lite mode button to toolbar.

#### Change 1: Update viewport meta tag
- anchor: `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">`
- Replace with: `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">`

#### Change 2: Add hamburger button as first child of toolbar-left
- anchor: `<div class="toolbar-left">`
- Insert immediately after that line:
```html
            <button class="tool-btn sidebar-toggle" id="sidebarToggle" aria-label="Toggle panel">&#9776;</button>
```

#### Change 3: Add Lite mode button after the helpBtn
- anchor: `<button class="tool-btn" id="helpBtn">?</button>`
- Insert immediately after that line:
```html
            <button class="tool-btn" id="liteBtn">Lite</button>
```

#### Change 4: Add drawer backdrop before closing body tag area (after left-panel, before canvas)
- anchor: `<canvas id='canvas'></canvas>`
- Insert immediately before that line:
```html
    <div id="drawer-backdrop" class="drawer-backdrop"></div>
```

### 2. MODIFY css/main.css
- operation: MODIFY
- reason: Add touch-action on canvas, safe-area insets on toolbar/panel, mobile media queries, drawer styles, hamburger visibility, lite button visibility, landscape orientation handling, brain3d-overlay mobile override.

#### Change 1: Add touch-action to canvas rule
- anchor: `canvas {` (line 75)
- Replace the entire `canvas { ... }` block with:
```css
canvas {
    display: block;
    background-color: #222;
    transition: background-color 0.5s ease;
    touch-action: none;
}
```

#### Change 2: Add safe-area padding to toolbar
- anchor: `#toolbar {` (line 202)
- Replace the entire `#toolbar { ... }` block (lines 202-216) with:
```css
#toolbar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 44px;
    padding-top: env(safe-area-inset-top, 0px);
    background: var(--surface-alpha);
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-left: max(1rem, env(safe-area-inset-left, 0px));
    padding-right: max(1rem, env(safe-area-inset-right, 0px));
    z-index: 20;
    font-family: system-ui, -apple-system, sans-serif;
    box-sizing: content-box;
}
```
Note: `box-sizing: content-box` so height stays 44px and padding-top is additive. The total toolbar visual height becomes `44px + env(safe-area-inset-top)`.

#### Change 3: Add safe-area padding to left-panel (bottom panel)
- anchor: `#left-panel {` (line 278)
- Replace the entire `#left-panel { ... }` block (lines 278-292) with:
```css
#left-panel {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    height: 210px;
    padding-bottom: env(safe-area-inset-bottom, 0px);
    background: var(--surface-alpha);
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: row;
    z-index: 20;
    padding-top: 0.3rem;
    padding-left: max(0.5rem, env(safe-area-inset-left, 0px));
    padding-right: max(0.5rem, env(safe-area-inset-right, 0px));
    overflow: hidden;
    gap: 0.5rem;
    box-sizing: content-box;
}
```

#### Change 4: Add hamburger button hidden on desktop, drawer-backdrop, and mobile styles as a new block at the END of the file
- anchor: append after the last line of the file (after the closing `}` of `.edu-links a:hover`)
- Add the following CSS block:

```css

/* --- Hamburger toggle (hidden on desktop) --- */
#sidebarToggle {
    display: none;
    font-size: 1.2rem;
    padding: 0.25rem 0.5rem;
    line-height: 1;
}

/* --- Lite mode button (hidden on desktop) --- */
#liteBtn {
    display: none;
}

#liteBtn.active {
    border-color: var(--accent);
    background: var(--accent-subtle);
    color: var(--accent);
}

/* --- Drawer backdrop --- */
.drawer-backdrop {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 19;
}

.drawer-backdrop.visible {
    display: block;
}

/* ========================================
   MOBILE LAYOUT (max-width: 768px)
   ======================================== */
@media (max-width: 768px) {
    /* --- Hamburger visible on mobile --- */
    #sidebarToggle {
        display: inline-block;
    }

    /* --- Lite button visible on mobile --- */
    #liteBtn {
        display: inline-block;
    }

    /* --- Compact toolbar: smaller buttons, tighter spacing --- */
    #toolbar {
        height: 36px;
        padding-left: max(0.5rem, env(safe-area-inset-left, 0px));
        padding-right: max(0.5rem, env(safe-area-inset-right, 0px));
    }

    .toolbar-left {
        gap: 0.25rem;
    }

    .toolbar-right {
        gap: 0.35rem;
    }

    .tool-btn {
        padding: 0.2rem 0.5rem;
        font-size: 0.7rem;
    }

    .toolbar-title {
        font-size: 0.75rem;
    }

    /* Hide non-essential toolbar items on mobile */
    #centerButton,
    #clearButton,
    #githubButton,
    #scaleIndicator {
        display: none !important;
    }

    /* Also hide the GitHub link anchor */
    .toolbar-right a {
        display: none;
    }

    /* --- Bottom panel becomes a slide-up drawer --- */
    #left-panel {
        height: auto;
        max-height: 50vh;
        transform: translateY(100%);
        transition: transform 0.3s ease;
        border-radius: var(--radius) var(--radius) 0 0;
        flex-direction: column;
        padding-top: 0.5rem;
        z-index: 21;
    }

    #left-panel.drawer-open {
        transform: translateY(0);
    }

    /* Drawer handle indicator */
    #left-panel::before {
        content: '';
        display: block;
        width: 40px;
        height: 4px;
        background: var(--border);
        border-radius: 2px;
        margin: 0 auto 0.5rem auto;
        flex-shrink: 0;
    }

    /* Drive meters sit below connectome instead of beside */
    #drive-meters {
        width: auto;
        border-left: none;
        border-top: 1px solid var(--border);
        padding-left: 0;
        padding-top: 0.5rem;
        flex-direction: row;
        flex-wrap: wrap;
        gap: 0.25rem 1rem;
    }

    .drive-row {
        flex: 1 1 40%;
        min-width: 100px;
    }

    /* --- Brain 3D overlay goes edge-to-edge on mobile --- */
    #brain3d-overlay {
        bottom: 0 !important;
    }

    /* --- Education panel full-width on mobile --- */
    .education-panel {
        width: 100%;
        max-width: 100vw;
        top: calc(36px + env(safe-area-inset-top, 0px));
    }

    /* --- Help overlay repositioned for compact toolbar --- */
    .help-overlay {
        top: calc(46px + env(safe-area-inset-top, 0px));
    }
}

/* ========================================
   LANDSCAPE on mobile devices
   ======================================== */
@media (orientation: landscape) and (max-height: 500px) {
    #toolbar {
        height: 32px;
    }

    .tool-btn {
        padding: 0.15rem 0.4rem;
        font-size: 0.65rem;
    }

    /* In landscape, neuron panel sits beside canvas on right side */
    #left-panel {
        left: auto;
        right: 0;
        top: calc(32px + env(safe-area-inset-top, 0px));
        bottom: 0;
        width: 280px;
        max-height: none;
        height: auto;
        transform: translateX(100%);
        transition: transform 0.3s ease;
        flex-direction: column;
        border-top: none;
        border-left: 1px solid var(--border);
        border-radius: 0;
        padding-bottom: env(safe-area-inset-bottom, 0px);
    }

    #left-panel.drawer-open {
        transform: translateX(0);
    }

    #left-panel::before {
        display: none;
    }

    #drive-meters {
        border-top: 1px solid var(--border);
        flex-direction: column;
        flex-wrap: nowrap;
        width: auto;
        padding-top: 0.5rem;
    }

    .drive-row {
        flex: none;
        min-width: 0;
    }
}
```

### 3. MODIFY js/main.js
- operation: MODIFY
- reason: (a) Replace hardcoded boundary constants with a dynamic `getLayoutBounds()` function. (b) Add hamburger/drawer toggle logic. (c) Add Lite mode toggle logic. (d) Lock body scroll when drawer is open (known pattern #4).

#### Change 1: Add `getLayoutBounds()` helper and `isMobile()` check after the state declarations
- anchor: `var currentDtScale = 1;` (line 28)
- Insert immediately after that line:

```javascript

// --- Layout helpers (mobile-aware) ---
function isMobile() {
	return window.innerWidth <= 768;
}

function getLayoutBounds() {
	var toolbar = document.getElementById('toolbar');
	var panel = document.getElementById('left-panel');
	var topH = toolbar ? toolbar.offsetHeight : 44;
	var bottomH = 0;
	if (panel && !isMobile()) {
		bottomH = panel.offsetHeight;
	} else if (panel && panel.classList.contains('drawer-open')) {
		bottomH = panel.offsetHeight;
	}
	return {
		top: topH,
		bottom: window.innerHeight - bottomH,
		left: 0,
		right: window.innerWidth
	};
}
```

#### Change 2: Replace hardcoded topBound/bottomBound in movement code
- anchor: `var topBound = 44;` (line 1676, after the getLayoutBounds is available)
- Replace these two lines:
```javascript
	var topBound = 44;
	var bottomBound = window.innerHeight - 210;
```
- With:
```javascript
	var bounds = getLayoutBounds();
	var topBound = bounds.top;
	var bottomBound = bounds.bottom;
```

#### Change 3: Replace hardcoded `foodMinY = 44` in handleCanvasMousedown
- anchor: `var foodMinY = 44;` (line 649)
- Replace:
```javascript
		var foodMinY = 44;
```
- With:
```javascript
		var foodMinY = getLayoutBounds().top;
```

#### Change 4: Replace hardcoded `44` in resize IIFE for food clamping
- anchor: `food[i].y = Math.max(44, Math.min(food[i].y, window.innerHeight));` (line 1860)
- Replace:
```javascript
		food[i].y = Math.max(44, Math.min(food[i].y, window.innerHeight));
```
- With:
```javascript
		food[i].y = Math.max(getLayoutBounds().top, Math.min(food[i].y, window.innerHeight));
```

#### Change 5: Replace hardcoded `44` in resize IIFE for fly clamping
- anchor: `fly.y = Math.max(44, Math.min(fly.y, window.innerHeight));` (line 1864)
- Replace:
```javascript
	fly.y = Math.max(44, Math.min(fly.y, window.innerHeight));
```
- With:
```javascript
	fly.y = Math.max(getLayoutBounds().top, Math.min(fly.y, window.innerHeight));
```

#### Change 6: Add hamburger drawer toggle, Lite mode toggle, and scroll locking after the help overlay click-outside handler
- anchor: The closing `});` of the "Close education panel when clicking outside" handler, which ends around line 425. Insert after:
```javascript
});
```
(the one closing the education panel click-outside handler)

- Insert after that block:

```javascript

// --- Mobile drawer toggle ---
var sidebarToggle = document.getElementById('sidebarToggle');
var leftPanel = document.getElementById('left-panel');
var drawerBackdrop = document.getElementById('drawer-backdrop');

function openDrawer() {
	if (leftPanel) leftPanel.classList.add('drawer-open');
	if (drawerBackdrop) drawerBackdrop.classList.add('visible');
	document.body.style.overflow = 'hidden';
}

function closeDrawer() {
	if (leftPanel) leftPanel.classList.remove('drawer-open');
	if (drawerBackdrop) drawerBackdrop.classList.remove('visible');
	document.body.style.overflow = '';
}

if (sidebarToggle) {
	sidebarToggle.addEventListener('click', function (e) {
		e.stopPropagation();
		if (leftPanel && leftPanel.classList.contains('drawer-open')) {
			closeDrawer();
		} else {
			openDrawer();
		}
	});
}

if (drawerBackdrop) {
	drawerBackdrop.addEventListener('click', function () {
		closeDrawer();
	});
}

// --- Lite mode toggle ---
var liteBtn = document.getElementById('liteBtn');
var liteModeActive = false;

if (liteBtn) {
	liteBtn.addEventListener('click', function () {
		liteModeActive = !liteModeActive;
		if (liteModeActive) {
			liteBtn.classList.add('active');
			// Slow down brain tick from 500ms (2Hz) to 1000ms (1Hz)
			clearInterval(brainTickId);
			brainTickId = setInterval(updateBrain, 1000);
			// Tell neuro-renderer to skip idle frames
			if (typeof NeuroRenderer !== 'undefined') {
				NeuroRenderer.setLiteMode(true);
			}
		} else {
			liteBtn.classList.remove('active');
			// Restore brain tick to 500ms (2Hz)
			clearInterval(brainTickId);
			brainTickId = setInterval(updateBrain, 500);
			if (typeof NeuroRenderer !== 'undefined') {
				NeuroRenderer.setLiteMode(false);
			}
		}
	});
}
```

#### Change 7: Update the visibilitychange resume handler to respect lite mode
- anchor: `brainTickId = setInterval(updateBrain, 500);` (line 609, inside the visibilitychange handler's `else` branch)
- Replace:
```javascript
		brainTickId = setInterval(updateBrain, 500);
```
- With:
```javascript
		brainTickId = setInterval(updateBrain, liteModeActive ? 1000 : 500);
```

### 4. MODIFY js/neuro-renderer.js
- operation: MODIFY
- reason: Add `setLiteMode()` API and frame-skipping optimization for Lite mode. When lite mode is active, skip the WebGL bufferSubData + drawArrays call if no neurons are firing (all brightness < 0.01).

#### Change 1: Add liteMode variable after existing module variables
- anchor: `var LABEL_BGS = ['rgba(59,130,246,0.1)', 'rgba(139,92,246,0.1)', 'rgba(245,158,11,0.1)', 'rgba(239,68,68,0.1)'];` (line 25)
- Insert immediately after:
```javascript
	var liteMode = false;
	var liteSkipCount = 0;
```

#### Change 2: Add frame-skipping logic in renderLoop
- anchor: `gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer);` (line 435, the first one in renderLoop that does bufferSubData)
- Replace lines 435-460 (from `gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer);` through `gl.drawArrays(gl.POINTS, 0, neuronCount);`) with:
```javascript
		/* Lite mode: skip GPU update when nothing is firing */
		var skipDraw = false;
		if (liteMode) {
			var maxB = 0;
			for (var i = 0; i < neuronCount; i++) {
				if (brightnessData[i] > maxB) maxB = brightnessData[i];
			}
			if (maxB < 0.01) {
				liteSkipCount++;
				/* Redraw every 30th frame even when idle to prevent stale state */
				if (liteSkipCount < 30) skipDraw = true;
			} else {
				liteSkipCount = 0;
			}
		}

		if (!skipDraw) {
			gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer);
			gl.bufferSubData(gl.ARRAY_BUFFER, 0, brightnessData);

			gl.clearColor(0.086, 0.129, 0.243, 1.0);
			gl.clear(gl.COLOR_BUFFER_BIT);

			gl.useProgram(program);
			gl.uniform2f(program.u_resolution, canvas.width, canvas.height);

			gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
			gl.enableVertexAttribArray(program.a_position);
			gl.vertexAttribPointer(program.a_position, 2, gl.FLOAT, false, 0, 0);

			gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
			gl.enableVertexAttribArray(program.a_color);
			gl.vertexAttribPointer(program.a_color, 3, gl.FLOAT, false, 0, 0);

			gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer);
			gl.enableVertexAttribArray(program.a_brightness);
			gl.vertexAttribPointer(program.a_brightness, 1, gl.FLOAT, false, 0, 0);

			gl.bindBuffer(gl.ARRAY_BUFFER, pointSizeBuffer);
			gl.enableVertexAttribArray(program.a_pointSize);
			gl.vertexAttribPointer(program.a_pointSize, 1, gl.FLOAT, false, 0, 0);

			gl.drawArrays(gl.POINTS, 0, neuronCount);
		}
```

#### Change 3: Add setLiteMode function and expose it on the NeuroRenderer global
- anchor: Find the line where NeuroRenderer is assigned to window. Search for `window.NeuroRenderer` or the object literal that exposes the public API.
- Need to find exact location first.

### 4b. (continued) Find the NeuroRenderer public API export

- anchor: The NeuroRenderer public API is exposed at the end of the IIFE. Look for `window.NeuroRenderer =` or similar.
- After identifying, add `setLiteMode: setLiteMode` to the exported object.
- Add this function definition before the public API export:

```javascript
	function setLiteMode(enabled) {
		liteMode = enabled;
		liteSkipCount = 0;
	}
```

### 5. MODIFY css/main.css — brain3d-overlay safe-area adjustment
- operation: MODIFY (already partially done in step 2, but need to update the desktop brain3d-overlay `top` to account for safe-area)
- reason: The brain3d-overlay uses `top: 44px` which does not account for the safe-area inset added to the toolbar

#### Change 1: Update brain3d-overlay top
- anchor: `#brain3d-overlay {` (line 522)
- Replace the entire `#brain3d-overlay { ... }` block (lines 522-530) with:
```css
#brain3d-overlay {
    position: fixed;
    top: calc(44px + env(safe-area-inset-top, 0px));
    left: 0;
    right: 0;
    bottom: 210px;
    z-index: 15;
    background: #0a0a1a;
}
```

### 6. MODIFY ios/FlyBrain/ContentView.swift
- operation: MODIFY
- reason: Set WKWebView background to match --bg color for seamless loading appearance. Set preferred status bar style to light content for dark background.

#### Change 1: Set webView background color to match CSS --bg (#1a1a2e)
- anchor: `webView.backgroundColor = .black`
- Replace:
```swift
        webView.backgroundColor = .black
```
- With:
```swift
        webView.backgroundColor = UIColor(red: 0.102, green: 0.102, blue: 0.180, alpha: 1.0)
```

#### Change 2: Add a UIViewControllerRepresentable wrapper to set light status bar style
- anchor: `struct WebView: UIViewRepresentable {`
- This requires wrapping the WKWebView in a UIViewController that overrides `preferredStatusBarStyle`. Replace the entire `ContentView` and `WebView` structs with:

```swift
struct ContentView: View {
    var body: some View {
        WebViewControllerWrapper()
            .ignoresSafeArea()
    }
}

struct WebViewControllerWrapper: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> WebViewController {
        return WebViewController()
    }

    func updateUIViewController(_ uiViewController: WebViewController, context: Context) {}
}

class WebViewController: UIViewController {
    override var preferredStatusBarStyle: UIStatusBarStyle {
        return .lightContent
    }

    override func viewDidLoad() {
        super.viewDidLoad()

        let config = WKWebViewConfiguration()
        config.preferences.javaScriptEnabled = true
        config.setValue(true, forKey: "allowUniversalAccessFromFileURLs")

        let script = WKUserScript(
            source: "document.documentElement.style.webkitTouchCallout='none';document.documentElement.style.webkitUserSelect='none';",
            injectionTime: .atDocumentStart,
            forMainFrameOnly: false
        )
        config.userContentController.addUserScript(script)

        let webView = WKWebView(frame: view.bounds, configuration: config)
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        webView.scrollView.bounces = false
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.allowsLinkPreview = false
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.102, green: 0.102, blue: 0.180, alpha: 1.0)

        view.addSubview(webView)

        guard let indexURL = Bundle.main.url(forResource: "index", withExtension: "html") else {
            fatalError("index.html not found in bundle")
        }
        let webDir = indexURL.deletingLastPathComponent()
        webView.loadFileURL(indexURL, allowingReadAccessTo: webDir)
    }
}
```

Note: The `FlyBrainApp.swift` `ContentView().ignoresSafeArea()` in the WindowGroup body still works with this change because `ContentView` still exists and applies `.ignoresSafeArea()` internally via the `WebViewControllerWrapper`.

### 7. MODIFY js/neuro-renderer.js — expose setLiteMode on public API
- operation: MODIFY
- reason: The NeuroRenderer public API object needs to include setLiteMode

#### Change 1: Add setLiteMode function before the public API export
- anchor: `function onMouseLeave(e) {` (line 533)
- Insert after the `onMouseLeave` function closing brace (after `if (tooltipEl) tooltipEl.style.display = 'none';` and its closing `}`):

```javascript

	function setLiteMode(enabled) {
		liteMode = enabled;
		liteSkipCount = 0;
	}
```

#### Change 2: Add setLiteMode to the public API object
- anchor: `window.NeuroRenderer = { init: init, destroy: destroy, isActive: isActive };` (line 537)
- Replace with:
```javascript
	window.NeuroRenderer = { init: init, destroy: destroy, isActive: isActive, setLiteMode: setLiteMode };
```

### 8. MODIFY index.html — Cache-busting version bump
- operation: MODIFY
- reason: Bump ?v=7 to ?v=8 on all script and CSS tags to ensure WKWebView loads updated files after T9.2 changes

#### Change 1: Bump all `?v=7` to `?v=8`
- anchor: `?v=7` (appears on every script and CSS tag)
- Replace ALL occurrences of `?v=7` with `?v=8` in the file. Affected lines:
  - `href="./css/main.css?v=7"` -> `href="./css/main.css?v=8"`
  - `src="./js/constants.js?v=7"` -> `src="./js/constants.js?v=8"`
  - `src="./js/connectome.js?v=7"` -> `src="./js/connectome.js?v=8"`
  - `src="./js/brain-worker-bridge.js?v=7"` -> `src="./js/brain-worker-bridge.js?v=8"`
  - `src="./js/neuro-renderer.js?v=7"` -> `src="./js/neuro-renderer.js?v=8"`
  - `src="./js/fly-logic.js?v=7"` -> `src="./js/fly-logic.js?v=8"`
  - `src="./js/brain3d.js?v=7"` -> `src="./js/brain3d.js?v=8"`
  - `src="./js/education.js?v=7"` -> `src="./js/education.js?v=8"`
  - `src="./js/main.js?v=7"` -> `src="./js/main.js?v=8"`
  - `src="./js/caretaker-renderer.js?v=7"` -> `src="./js/caretaker-renderer.js?v=8"`
  - `src="./js/caretaker-bridge.js?v=7"` -> `src="./js/caretaker-bridge.js?v=8"`

## Verification
- build: Open `index.html` in a desktop browser. Verify the page loads without JS console errors. Resize the window below 768px width and verify: hamburger button appears, toolbar compresses, bottom panel is hidden (not visible until hamburger tapped), canvas fills viewport.
- lint: No linter configured (vanilla JS project). Manually verify no syntax errors by checking the browser console.
- test: Run `node tests/run-node.js` from the project root. All existing 69+ tests must pass. The tests exercise brain-worker-bridge, connectome, and fly-logic -- not UI code, so they should be unaffected.
- smoke:
  1. Desktop (> 768px): Page looks identical to before. Toolbar is 44px. Bottom panel shows. Brain 3D overlay fills between toolbar and panel. No hamburger visible. No Lite button visible.
  2. Mobile portrait (< 768px or Chrome DevTools iPhone emulator): Hamburger visible. Bottom panel hidden (slid down). Tap hamburger -> panel slides up from bottom with handle. Tap backdrop -> panel closes. Toolbar is compact (36px). Hidden items (GitHub, center, clear) not visible. Canvas fills full viewport.
  3. Mobile landscape (< 500px height): Panel slides in from right side instead of bottom.
  4. Touch: On canvas, verify touch-action:none prevents iOS scroll/zoom. Touch events for Feed/Touch/Air work.
  5. Safe areas: In iPhone simulator with notch, toolbar does not sit under the notch, bottom panel does not sit under the home indicator.
  6. Lite mode: On mobile, tap Lite button. Verify it gets active class. Brain tick slows to 1Hz. Neuro-renderer skips idle frames. Tap again to deactivate.
  7. 3D Brain: Verify OrbitControls touch works natively (single-finger rotate, pinch zoom). Overlay fills to bottom on mobile.
  8. Xcode: Build the iOS target in Xcode and run in iPhone 15 Pro simulator. Status bar shows white text. WebView background matches --bg color during load.

## Constraints
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any files in .buildloop/ (other than this plan)
- Do NOT add new JS dependencies or external libraries
- Do NOT change the desktop layout when viewport is wider than 768px (except adding safe-area env() which returns 0 on desktop browsers)
- Do NOT modify the sim-worker.js tick rate -- Lite mode only affects the main-thread brain tick interval and the neuro-renderer frame skipping
- Do NOT modify js/brain3d.js -- OrbitControls already handles touch natively in the vendored v0.128.0
- Do NOT modify js/education.js -- the education panel CSS changes handle mobile layout
- Preserve all existing touch event handlers in js/main.js (lines 622-642) -- they already use `{ passive: false }` and `event.preventDefault()`. Only add CSS `touch-action: none` as a complementary layer.
- The `#brain3d-overlay` bottom value must remain `210px` on desktop (for the fixed bottom panel) but become `0` on mobile via the media query
- Cache-busting: bump `?v=7` to `?v=8` on all script/CSS tags in index.html to ensure iOS WKWebView loads the updated files
