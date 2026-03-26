# Build Claims -- D20.1

## Files Changed
- MODIFY js/brain3d.js -- Added _onMouseLeave handler and mouseleave listener registration in show()/removal in hide() to fix ghost tooltip
- MODIFY js/main.js -- Added brain3d-overlay to education panel outside-click exclusion check

## Verification Results
- Build: SKIPPED (vanilla JS, no build step)
- Tests: SKIPPED (no existing tests)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: Brain3D object has a new named `_onMouseLeave` method (line 420-422) that sets `Brain3D._tooltipEl.style.display = 'none'`
- [ ] Claim 2: `Brain3D.show()` (line 277) registers a `mouseleave` event listener on `Brain3D._renderer.domElement` using `Brain3D._onMouseLeave`
- [ ] Claim 3: `Brain3D.hide()` (line 284) removes the `mouseleave` event listener from `Brain3D._renderer.domElement` using `Brain3D._onMouseLeave`
- [ ] Claim 4: The education panel document click handler in main.js (line 370-371) now gets the `brain3d-overlay` element and checks `(!brain3dOverlay || !brain3dOverlay.contains(e.target))` before closing the education panel
- [ ] Claim 5: Clicks/drags on the brain3d canvas no longer close the education panel because the click target is inside brain3d-overlay
- [ ] Claim 6: The tooltip disappears when the mouse leaves the 3D canvas area (mouseleave fires on renderer.domElement)
- [ ] Claim 7: No other files were modified; no new dependencies added; existing mousemove listener in init() unchanged

## Gaps and Assumptions
- No automated tests exist; verification is manual browser smoke testing only
- The mouseleave event may not fire if the mouse moves very quickly off-screen on some older browsers, but this is standard DOM behavior and acceptable
