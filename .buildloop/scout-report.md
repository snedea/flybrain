# Scout Report: T9.2

## Key Facts (read this first)

- **Tech stack**: Vanilla JS + HTML5 Canvas + CSS + Three.js v0.128.0. No build step. iOS shell is Swift/SwiftUI + WKWebView (T9.1 complete).
- **Critical layout constants**: toolbar height `44px` (hardcoded in CSS and JS), bottom panel height `210px` (hardcoded in CSS and referenced in `js/main.js:1677` as `bottomBound = window.innerHeight - 210`). These must change for mobile.
- **Touch events already wired**: `js/main.js:622-642` has touchstart/touchmove/touchend handlers that delegate to the mouse handlers. The canvas does NOT yet have `touch-action: none`, but `{ passive: false }` + `event.preventDefault()` are already set -- iOS may still intercept gestures before the event fires.
- **OrbitControls touch**: Confirmed native touch support in the vendored `js/vendor/OrbitControls.js` -- `onTouchStart` handles single-finger rotate and two-finger dolly/pan. No manual touch mapping needed.
- **ContentView.swift**: Already sets `scrollView.bounces = false`, `isScrollEnabled = false`, `contentInsetAdjustmentBehavior = .never`. Missing: status bar extension (needs `edgesIgnoringSafeArea`) and there is no UIStatusBarStyle config. The app uses `.ignoresSafeArea()` in SwiftUI, but safe areas are NOT communicated to the web layer via CSS env() -- that must be added.

## Relevant Files

| File | Role for T9.2 |
|------|--------------|
| `css/main.css` | All layout: add `@media (max-width: 768px)` block, `env(safe-area-inset-*)` padding, `touch-action: none` on `#canvas`, drawer styles for neuron panel, hamburger/sidebar toggle |
| `index.html` | Viewport meta already added in T9.1. Add hamburger button markup, drawer wrapper for `#left-panel`, sidebar overlay |
| `js/main.js` | `bottomBound = window.innerHeight - 210` at line 1677 -- must become dynamic (read panel height). `topBound = 44` at line 1676 -- must account for safe area on iOS. Canvas resize function at line 1849. Food placement clamp at line 650 uses hardcoded `44`. Touch handlers at 622-642. |
| `ios/FlyBrain/ContentView.swift` | Add status bar style config (`preferredStatusBarStyle`), verify `.ignoresSafeArea()` propagates correctly, potentially set `overrideUserInterfaceStyle` if desired. Swift-side CSS env() injection for safe-area-inset may be needed if WKWebView doesn't expose it automatically. |
| `ios/FlyBrain/Info.plist` | Orientation keys already set (portrait + landscape left/right). `UIRequiresFullScreen = false` already set. No changes needed here. |
| `js/brain3d.js` | `_onResize` at line 437 reads `Brain3D._container.clientHeight` -- works correctly when overlay position changes. CSS `#brain3d-overlay` has `bottom: 210px` hardcoded at `css/main.css:528`. Must update. |
| `js/neuro-renderer.js` | Reads container `getBoundingClientRect()` for canvas sizing -- works correctly as long as CSS layout is correct. No hardcoded constants to change here. |

## Architecture Notes

**Layout structure (desktop):**
```
#toolbar (fixed, top:0, height:44px)
#canvas (fills window, behind toolbar and left-panel)
#left-panel (fixed, bottom:0, height:210px -- neuron viz + drive meters)
#brain3d-overlay (fixed, top:44px, bottom:210px)
#education-panel (fixed, right slide-out, top:44px)
```

**Hardcoded boundary values in JS (must become dynamic):**
- `main.js:1676` -- `topBound = 44` (toolbar height)
- `main.js:1677` -- `bottomBound = window.innerHeight - 210` (panel height)
- `main.js:649` -- `foodMinY = 44` (toolbar height guard)

**Canvas sizing**: `main.js:1849-1866` -- IIFE sets canvas pixel dimensions to `window.innerWidth * dpr` x `window.innerHeight * dpr`. No awareness of toolbar/panel -- the canvas occupies the full viewport but content drawn at (fly.x, fly.y) stays within the computed bounds.

**Brain tick rate**: `setInterval(updateBrain, 500)` = 2Hz behavioral update, but the sim-worker fires at ~10Hz internally. RAF loop runs the render at ~60fps. For "Lite mode", the most impactful lever is reducing the neuro-renderer update rate (currently every RAF frame -- 60fps) by skipping frames when only idle neurons exist. The `brainTickId` interval is 500ms, not 100ms -- the "10Hz" in the task description refers to the sim-worker tick in `js/sim-worker.js`.

**Safe area in WKWebView**: iOS 11+ WKWebView inside a SwiftUI app that calls `.ignoresSafeArea()` WILL expose `env(safe-area-inset-*)` CSS variables to the web content -- no Swift injection needed. However, the HTML `<meta name="viewport">` must include `viewport-fit=cover` for the env() values to be non-zero. T9.1 set `maximum-scale=1.0, user-scalable=no` but did NOT include `viewport-fit=cover`. This is required.

**OrbitControls touch**: Confirmed working via `onTouchStart` in vendored file. Default config maps 1-finger -> ROTATE, 2-finger -> DOLLY_PAN. No JS changes needed.

## Suggested Approach

1. **`index.html`**: Add `viewport-fit=cover` to the existing viewport meta. Add hamburger button `#sidebar-toggle` in toolbar. Wrap `#left-panel` in a `.drawer-container` or add `.drawer` class for mobile slide-up. Add a backdrop overlay `#drawer-backdrop` for tap-to-close.

2. **`css/main.css`**:
   - Add `touch-action: none` to `#canvas` (unconditionally -- not just mobile).
   - Add `padding-top: env(safe-area-inset-top)` to `#toolbar`, and `padding-bottom: env(safe-area-inset-bottom)` to `#left-panel` (drawer).
   - `@media (max-width: 768px)`: toolbar becomes compact horizontal strip (reduce padding, smaller buttons, possibly icon-only with labels); canvas fills full viewport minus the compact toolbar; `#left-panel` transforms to a slide-up drawer (position:fixed, bottom, translate Y to show/hide, full-width, max-height ~50vh); `#education-panel` becomes full-width slide-up instead of right sidebar; hide github/center/clear icons behind the hamburger or just hide on mobile.
   - Add landscape orientation handling: `@media (orientation: landscape) and (max-width: 926px)` -- neuron drawer sits beside canvas (right side, fixed width) instead of below.
   - Update `#brain3d-overlay` bottom from `210px` to `0` on mobile (since panel is a drawer, not always visible).

3. **`js/main.js`**: Replace hardcoded `44` and `210` boundary constants with a helper function `getLayoutBounds()` that reads `document.getElementById('toolbar').offsetHeight` and `document.getElementById('left-panel').offsetHeight` (returns 0 when panel is hidden as drawer). This ensures bounds are correct in both desktop and mobile layouts.

4. **`ios/FlyBrain/ContentView.swift`**: Add `UIViewControllerRepresentable` wrapper or use SwiftUI `.statusBar(hidden: false)` + `.preferredColorScheme(.dark)`. The existing `.ignoresSafeArea()` on the SwiftUI view already causes WKWebView to extend under the status bar. The background is already set to `.black`. May want to set `webView.backgroundColor = UIColor(red: 0.102, green: 0.102, blue: 0.180, alpha: 1.0)` to match `--bg` color during load.

5. **Lite mode**: Add a `#liteBtn` button to toolbar (mobile-only via CSS `display:none` on desktop). JS: `liteModeActive` flag that when true, sets `brainTickId = setInterval(updateBrain, 1000)` (1Hz vs 2Hz -- the 500ms tick is already the slow path) and skips neuro-renderer WebGL updates when no neurons fired (`BRAIN.latestFireState` is all-zero). The neuro-renderer render loop already does brightness decay on every frame; skip `gl.bufferSubData` + `gl.drawArrays` when `maxBrightness < 0.01`.

## Risks and Constraints (read this last)

- **`viewport-fit=cover` required**: Without it, `env(safe-area-inset-top)` returns 0 in WKWebView and the status bar overlap fix won't work. The existing viewport meta in `index.html` must be extended.
- **Hardcoded `210` in JS**: `bottomBound` at `main.js:1677` uses `window.innerHeight - 210`. On mobile where the panel is a drawer (height=0 when closed), the fly will be artificially constrained to the top 70% of the screen. Fix is required before the fly behavior is correct on mobile.
- **`brain3d-overlay` bottom is `210px` in CSS**: When the panel becomes a drawer, this overlay will leave a 210px dead zone at the bottom of the 3D view on mobile. Must set `bottom: 0` for mobile.
- **Touch events and `passive: false`**: The existing touchstart/touchmove handlers use `{ passive: false }` + `preventDefault()`. This should prevent iOS from intercepting scroll/zoom. The addition of `touch-action: none` via CSS provides a complementary CSS-level hint. Both are needed.
- **WKWebView and `contentInsetAdjustmentBehavior = .never`**: This is already set in T9.1 ContentView.swift. Combined with `.ignoresSafeArea()` in SwiftUI and `viewport-fit=cover`, the web content will extend edge-to-edge. The CSS env() values will correctly report the safe area insets, so this is the right approach.
- **Lite mode lever**: The "10Hz tick rate" mentioned in the task refers to the sim-worker in `sim-worker.js` (which uses `setInterval(tick, 100)`). The main brain tick is 500ms (2Hz). Halving the sim-worker rate to 5Hz means editing `sim-worker.js:setInterval(tick, 200)` -- the planner should be aware it's a separate file from `main.js`.
- **Caretaker bridge**: `js/caretaker-bridge.js` connects to a WebSocket server at `ws://localhost:3001`. On iPhone (no local server), the WebSocket will fail to connect silently (it already handles connection errors). No issue, but worth noting.
- **Neuro-renderer WebGL**: On iPhone, WebGL is hardware-accelerated but the 139K-point draw call may be ~15-20ms on older devices. The render loop runs every RAF frame. Skipping frames when idle (brightness all < 0.01) is a safe optimization.
