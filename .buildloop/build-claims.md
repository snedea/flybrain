# Build Claims -- T8.3

## Files Changed
- [CREATE] svg/claude-cursor.svg -- Claude logo silhouette SVG (4-pointed spark + dot, 20x20, filled #E3734B)
- [CREATE] js/caretaker-renderer.js -- Canvas overlay IIFE module exposing window.CaretakerRenderer with onCommand, setConnected, update, drawOverlay methods
- [MODIFY] js/caretaker-bridge.js -- Added CaretakerRenderer.onCommand() call after executeCommand switch block; added CaretakerRenderer.setConnected(true/false) in ws.onopen and ws.onclose
- [MODIFY] js/main.js -- Added CaretakerRenderer.drawOverlay(ctx) at end of draw() (line 1845); added CaretakerRenderer.update(dt) in loop() after Brain3D.update (line 1883)
- [MODIFY] index.html -- Added script tag for caretaker-renderer.js before caretaker-bridge.js (line 99)
- [MODIFY] css/main.css -- Added .tool-btn.claude-highlight class with orange border and box-shadow after .tool-btn.active block (line 271)

## Verification Results
- Build: PASS (node -e "new Function(require('fs').readFileSync('js/caretaker-renderer.js','utf8'))" -- syntax valid)
- Tests: PASS (node tests/run-node.js -- 99 passed / 0 failed / 99 total)
- Lint: SKIPPED (no lint configured)

## Claims
- [ ] svg/claude-cursor.svg is a valid SVG with viewBox="0 0 20 20", containing a 4-pointed spark path and circle, both fill="#E3734B"
- [ ] js/caretaker-renderer.js is an IIFE that exposes window.CaretakerRenderer with exactly 4 public methods: onCommand, setConnected, update, drawOverlay
- [ ] init() loads the cursor SVG into an Image element at module load time, with onerror fallback logging
- [ ] onCommand() handles all 7 action types (place_food, touch, blow_wind, set_light, set_temp, clear_food, default) per plan specification
- [ ] onCommand() pushes 'ripple' effect for place_food, 'ring' for touch, 'arrow' for blow_wind, and calls highlightToolbar with correct tool names
- [ ] setConnected(false) clears attentionX/Y to -1 and empties trail and activeEffects arrays, hiding all indicators
- [ ] update() lerps attention position toward target at speed 0.08, snaps within 0.5px, manages trail points (max 40, lifetime 2000ms), prunes expired effects by type-specific durations (ripple 800ms, ring 600ms, arrow 1200ms)
- [ ] drawOverlay() renders trail, effects, cursor, and idle pulse in that order; returns immediately if not connected
- [ ] drawTrail() draws faint orange line segments with alpha based on age (max 0.25 opacity)
- [ ] drawCursor() renders SVG image at 0.85 globalAlpha, with diamond fallback if SVG fails to load
- [ ] drawEffects() renders ripple (2 concentric expanding rings), ring (expanding ring + inner fill flash), and arrow (shaft + arrowhead) effects all in Claude orange
- [ ] drawIdlePulse() shows heartbeat glow (double-bump sine, 1.5s cycle) only after 3+ seconds of no commands
- [ ] highlightToolbar() adds 'claude-highlight' CSS class to matching .tool-btn[data-tool] for 1500ms
- [ ] All CaretakerRenderer calls in caretaker-bridge.js and main.js are guarded with typeof !== 'undefined' checks
- [ ] caretaker-renderer.js is loaded before caretaker-bridge.js in index.html (line 99 vs 100)
- [ ] .tool-btn.claude-highlight CSS uses only the allowed box-shadow (0 0 8px rgba(227,115,75,0.4)) and transitions (border-color 0.2s, box-shadow 0.2s)
- [ ] The overlay is purely cosmetic -- no simulation state (BRAIN, fly, food, behavior) is modified by any CaretakerRenderer function
- [ ] All canvas rendering uses rgba(227, 115, 75, ...) exclusively for Claude indicators
- [ ] Existing 99 tests continue to pass with no regressions

## Gaps and Assumptions
- Browser rendering not tested (no headless browser in CI); SVG loading, canvas drawing, and CSS highlight are verified by code inspection only
- The `fly` global variable is referenced in onCommand() without a typeof guard; if onCommand fires before main.js initializes `fly`, it would throw. In practice this cannot happen because caretaker-bridge.js waits for BRAIN to be defined before connecting, and fly is initialized before BRAIN.
- The `CLAUDE_ORANGE_HEX` variable is declared but unused in the module (plan specified it as state but no function references it)
- No automated test covers the renderer itself; verification is syntax check + existing test suite regression check
