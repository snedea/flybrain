# Build Claims -- T4.2

## Files Changed
- [MODIFY] index.html -- Added help button (?) to toolbar-left, help overlay div with interaction guide text, connectome-header wrapper with Hide/Show toggle button
- [MODIFY] css/main.css -- Added styles for .help-overlay, .help-overlay-header, .help-close-btn, .help-item, .connectome-header, .connectome-toggle-btn, #nodeHolder.hidden
- [MODIFY] js/main.js -- Added help overlay toggle logic, connectome panel toggle logic, touch event handlers (touchstart/touchmove/touchend), touch-location-specific grooming animation in drawLegs(), abdomen curl animation in drawAbdomen(), edge avoidance bias in update()

## Verification Results
- Build: PASS (no build step -- vanilla JS project)
- Tests: SKIPPED (no test framework configured)
- Lint: PASS (`node -c js/main.js` -- syntax valid)

## Claims
- [ ] Help button (?) appears in toolbar-left after the Light button (index.html:16)
- [ ] Help overlay (id=helpOverlay) is initially hidden (style="display:none") and positioned below toolbar at top:54px, left:1rem (index.html:27-36, css/main.css:239-248)
- [ ] Clicking helpBtn toggles helpOverlay visibility between 'none' and 'block' (js/main.js:142-145)
- [ ] Clicking helpCloseBtn (X button) hides helpOverlay (js/main.js:147-149)
- [ ] Clicking outside helpOverlay and helpBtn closes the overlay via document click listener (js/main.js:152-158)
- [ ] Connectome toggle button (id=connectomeToggleBtn) with text "Hide" appears next to "Connectome" label in a flex row (index.html:40-43)
- [ ] Clicking connectomeToggleBtn toggles the 'hidden' CSS class on #nodeHolder, switching button text between "Hide" and "Show" (js/main.js:161-170)
- [ ] #nodeHolder.hidden has display:none in CSS (css/main.css:309-311)
- [ ] Touch events (touchstart, touchmove, touchend) are registered on the canvas with { passive: false } and preventDefault() (js/main.js:222-240)
- [ ] Touch handlers delegate to existing handleCanvasMousedown, handleCanvasMousemove, handleCanvasMouseup using clientX/clientY from touch objects (js/main.js:225, 231, 237)
- [ ] touchend uses event.changedTouches[0] (not event.touches[0]) since the touch has been lifted (js/main.js:236)
- [ ] Grooming animation in drawLegs() now checks `isGrooming` without restricting to pairIdx===0, then dispatches based on BRAIN.stimulate.touchLocation (js/main.js:1095-1117)
- [ ] touchLocation='head': front legs (pairIdx===0) swing forward with hipMod=-0.9 oscillation (js/main.js:1098-1100)
- [ ] touchLocation='abdomen': rear legs (pairIdx===2) swing backward with hipMod=1.0 oscillation (js/main.js:1101-1104)
- [ ] touchLocation='thorax': front legs (pairIdx===0) do bilateral rub, matching original grooming animation (js/main.js:1105-1108)
- [ ] touchLocation='leg': middle legs (pairIdx===1) do cleaning motion; other legs fall through to idle jitter (js/main.js:1109-1116)
- [ ] Default groomLoc is 'thorax' when BRAIN.stimulate.touchLocation is null/undefined (js/main.js:1096)
- [ ] Abdomen curl: when behavior is 'groom' and touchLocation is 'abdomen' or null, ay offset oscillates via sin(groomPhase*0.8)*2 (js/main.js:880-884)
- [ ] Edge avoidance: when fly is within 50px of screen edges (left/right/top=44/bottom=innerHeight-90), targetDir is biased away from the edge (js/main.js:1194-1225)
- [ ] Edge avoidance strength scales linearly from 0 at 50px to 1 at the boundary, multiplied by 0.3 for gradual turning (js/main.js:1219)
- [ ] Edge avoidance runs BEFORE position update (fly.x += ...) and does NOT replace the hard clamp at screen bounds (js/main.js:1227-1243)
- [ ] No em-dashes used in any comments or text -- all use double hyphens (--)

## Gaps and Assumptions
- Touch-location grooming for 'leg' does not differentiate left vs right side -- middle legs on both sides animate identically
- The `targetPair` variable in the 'leg' grooming branch is assigned but unused (mirrors plan exactly)
- Abdomen curl also activates when touchLocation is null (fallback grooming) -- this matches the plan's parenthetical "(or null)"
- Mobile testing was not performed -- touch handlers were verified structurally but not on an actual touch device
- The help overlay close-on-outside-click uses a document click listener that fires on every click; performance impact is negligible but noted
- Edge avoidance uses window.innerWidth/innerHeight which may differ from canvas logical dimensions on high-DPI displays, but this matches existing bound-clamping code
