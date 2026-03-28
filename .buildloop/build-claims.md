# Build Claims -- T9.2

## Files Changed
- [MODIFY] index.html -- Added viewport-fit=cover to meta, hamburger toggle button, Lite mode button, drawer-backdrop div. Cache-bust versions bumped (linter auto-incremented to v=9).
- [MODIFY] css/main.css -- Added touch-action:none on canvas, safe-area env() padding on toolbar/left-panel/brain3d-overlay, hamburger/lite button desktop-hidden styles, drawer-backdrop styles, @media (max-width: 768px) mobile layout block, @media (orientation: landscape) and (max-height: 500px) landscape block.
- [MODIFY] js/main.js -- Added isMobile()/getLayoutBounds() helpers, replaced 5 hardcoded boundary constants (44, 210) with dynamic calls, added drawer open/close logic with body scroll lock, added Lite mode toggle (1Hz brain tick + NeuroRenderer.setLiteMode), updated visibilitychange handler to respect liteModeActive.
- [MODIFY] js/neuro-renderer.js -- Added liteMode/liteSkipCount variables, frame-skipping logic in renderLoop (skips GPU draw when all brightness < 0.01 in lite mode, redraws every 30th idle frame), added setLiteMode() function, exposed setLiteMode on window.NeuroRenderer API.
- [MODIFY] ios/FlyBrain/ContentView.swift -- Replaced UIViewRepresentable with UIViewControllerRepresentable wrapping a WebViewController. WebViewController overrides preferredStatusBarStyle to .lightContent. WKWebView uses autoresizingMask for layout, backgroundColor matches --bg (#1a1a2e).

## Verification Results
- Build: PASS (node -c js/main.js, node -c js/neuro-renderer.js -- both OK)
- Tests: PASS (node tests/run-node.js -- 99 passed / 0 failed / 99 total)
- Lint: SKIPPED (no linter configured; manual syntax check passed)
- Xcode Build: SKIPPED (no Xcode CLI build configured; SourceKit reports expected iOS-only type resolution errors from macOS context)

## Claims
- [ ] viewport meta in index.html includes viewport-fit=cover, enabling env(safe-area-inset-*) in WKWebView
- [ ] canvas element has touch-action:none in CSS, preventing iOS gesture hijacking
- [ ] #toolbar has padding-top: env(safe-area-inset-top) and safe-area-aware left/right padding with box-sizing: content-box
- [ ] #left-panel has padding-bottom: env(safe-area-inset-bottom) and safe-area-aware left/right padding with box-sizing: content-box
- [ ] #brain3d-overlay top uses calc(44px + env(safe-area-inset-top, 0px))
- [ ] Hamburger button (#sidebarToggle) is hidden on desktop (display:none) and visible on mobile (display:inline-block inside @media max-width:768px)
- [ ] Lite button (#liteBtn) is hidden on desktop and visible on mobile
- [ ] On mobile (<= 768px), toolbar compresses to 36px height with smaller buttons
- [ ] On mobile, #centerButton, #clearButton, #githubButton, #scaleIndicator, and GitHub anchor are hidden
- [ ] On mobile, #left-panel transforms to a slide-up drawer (translateY(100%) default, translateY(0) when .drawer-open)
- [ ] Drawer handle indicator (::before pseudo-element) appears on mobile drawer
- [ ] Drawer backdrop (#drawer-backdrop) shows on open and closes drawer on click
- [ ] Body scroll is locked (overflow:hidden) when drawer is open
- [ ] On landscape (max-height: 500px), panel slides from the right side instead of bottom (translateX)
- [ ] Landscape toolbar is 32px with smaller buttons
- [ ] #brain3d-overlay bottom is 0 on mobile (via !important in media query)
- [ ] Education panel goes full-width on mobile with adjusted top position
- [ ] js/main.js getLayoutBounds() reads actual toolbar offsetHeight instead of hardcoded 44
- [ ] js/main.js getLayoutBounds() returns bottomH=0 on mobile when drawer is closed (fly can use full viewport)
- [ ] All 5 hardcoded boundary constants (topBound=44, bottomBound=innerHeight-210, foodMinY=44, food clamp 44, fly clamp 44) are replaced with getLayoutBounds() calls
- [ ] Lite mode toggle halves brain tick from 500ms (2Hz) to 1000ms (1Hz)
- [ ] Lite mode toggle calls NeuroRenderer.setLiteMode(true/false)
- [ ] NeuroRenderer skips gl.bufferSubData + gl.drawArrays when liteMode=true and max brightness < 0.01
- [ ] NeuroRenderer redraws every 30th idle frame in lite mode to prevent stale state
- [ ] visibilitychange resume handler uses liteModeActive to pick correct tick interval
- [ ] ContentView.swift uses UIViewControllerRepresentable with WebViewController
- [ ] WebViewController.preferredStatusBarStyle returns .lightContent
- [ ] WKWebView backgroundColor is UIColor(red:0.102, green:0.102, blue:0.180, alpha:1.0) matching CSS --bg
- [ ] All existing 99 tests pass without regression
- [ ] No new JS dependencies added
- [ ] OrbitControls (js/brain3d.js) not modified -- touch handled natively by v0.128.0
- [ ] Existing touch event handlers in js/main.js (touchstart/touchmove/touchend with passive:false) preserved unchanged

## Gaps and Assumptions
- Xcode build not verified (no CI; SourceKit reports expected iOS-only type errors from macOS LSP context -- these resolve when building for iOS target in Xcode)
- Safe-area env() values return 0 on desktop browsers -- verified CSS is syntactically correct but can only be visually tested in iOS simulator or device
- Lite mode performance improvement not benchmarked on actual iPhone hardware -- frame skipping logic is structurally sound but FPS improvement is theoretical
- The linter auto-incremented cache-bust versions from v=8 to v=9 -- this deviates from the plan's v=8 but achieves the same goal
- Drawer swipe-to-dismiss not implemented (only tap-backdrop-to-close and hamburger toggle) -- plan did not specify swipe gesture
- The `liteModeActive` variable is declared in the drawer toggle block scope area but is accessible in the visibilitychange handler because both are in the same top-level script scope
