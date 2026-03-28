# Build Claims -- T8.6

## Files Changed
- [MODIFY] server/db.js -- Added `getRecentActivity(limit)` function that does a UNION ALL of actions + incidents tables, sorted by timestamp DESC, returns combined rows
- [MODIFY] server/caretaker.js -- Added `broadcastActivity(obj)` helper; wired it to broadcast `activity_action` after insertAction, `activity_incident` after each insertIncident (scared_the_fly and forgot_to_feed), and `activity_history` on new WebSocket connection
- [CREATE] js/caretaker-sidebar.js -- New IIFE module exposing `window.CaretakerSidebar` with init, onAction, onIncident, onHistory, toggle, isOpen methods. Renders color-coded activity feed entries, click-to-expand reasoning, auto-scroll management, 200-entry cap
- [MODIFY] js/caretaker-bridge.js -- Replaced `ws.onmessage` handler to route `activity_action`, `activity_incident`, `activity_history` message types to CaretakerSidebar; `command` type still goes to executeCommand
- [MODIFY] index.html -- Added `#caretaker-sidebar` div (before drawer-backdrop), `<script>` for caretaker-sidebar.js (between caretaker-renderer.js and caretaker-bridge.js), and "Activity" toolbar button (before Learn button)
- [MODIFY] css/main.css -- Added full sidebar styles: fixed left overlay with translateX animation, activity-entry styles with color-coded left borders (green=feed, blue=comfort, yellow=warning, red=incident), expand/collapse detail, scrollbar styling, #activityToggle button styles, mobile overrides (full-width, hidden toggle), landscape overrides (240px width)
- [MODIFY] js/main.js -- Wired #activityToggle click to toggle sidebar; wired #caretaker-sidebar-close to close; updated sidebarToggle (hamburger) to use isMobile() check: mobile opens bottom drawer, desktop toggles activity sidebar

## Verification Results
- Build: PASS (no build step -- vanilla JS)
- Tests: SKIPPED (no test suite configured)
- Lint: SKIPPED (no linter configured)
- Syntax: PASS (`node --check js/caretaker-sidebar.js` and `node --check js/caretaker-bridge.js`)
- DB query: PASS (`node -e` test of getRecentActivity(10) returned 10 rows)
- Server startup: PASS (server starts on port 7600 without errors)

## Claims
- [ ] `getRecentActivity(limit)` in server/db.js returns a UNION ALL of actions and incidents sorted by timestamp DESC, limited to `limit` rows (default 50)
- [ ] Server broadcasts `activity_action` message to browser WebSocket after every insertAction call in handleStdinCommand
- [ ] Server broadcasts `activity_incident` message after `scared_the_fly` (high severity) and `forgot_to_feed` (medium severity) incidents
- [ ] Server sends `activity_history` with last 50 entries on new WebSocket connection
- [ ] `broadcastActivity` is guarded by browserSocket null/readyState check and try/catch
- [ ] caretaker-sidebar.js loads before caretaker-bridge.js (script order in index.html)
- [ ] caretaker-bridge.js routes activity_action/activity_incident/activity_history to CaretakerSidebar, and command to executeCommand
- [ ] Feed entries are color-coded: green (place_food/clear_food), blue (set_light/set_temp), yellow (medium incidents), red (high incidents), gray (neutral)
- [ ] Icons are single ASCII characters: F, X, L, T, H, W for actions, ! for incidents, * for unknown
- [ ] Click on feed entry toggles expanded class showing reasoning detail
- [ ] Feed auto-scrolls to top (newest first) unless user has scrolled away (scrollTop > 20)
- [ ] Feed is capped at 200 entries (oldest removed when exceeded)
- [ ] Sidebar uses CSS transform overlay (translateX) -- does not push canvas layout
- [ ] Sidebar z-index is 22 (between left-panel=20 and education-panel=25)
- [ ] Sidebar bottom is 180px on desktop to avoid bottom panel overlap
- [ ] "Activity" toolbar button visible on desktop, hidden on mobile (display: none in @media max-width: 768px)
- [ ] Mobile hamburger still opens bottom panel drawer (isMobile() check in sidebarToggle handler)
- [ ] Desktop hamburger toggles activity sidebar (else branch in sidebarToggle handler)
- [ ] X close button in sidebar header closes the sidebar and deactivates the toggle button

## Gaps and Assumptions
- No browser-based smoke test was performed (no HTTP server to serve index.html locally)
- The `onHistory` handler iterates entries in server order (newest-first) and appends, so visual order is newest-at-top
- `--surface-hover` CSS variable is assumed to exist in :root (used for entry hover background)
- The `forgot_to_feed` broadcastActivity call is inside the `if (shouldLog)` block, so it respects the 60-second cooldown
- XSS: feed descriptions are built from action params that originate from the AI agent (stdin), not from user input; innerHTML is used but content is from trusted internal sources
- Landscape mobile override sets sidebar width to 240px and bottom to 0, which may overlap bottom panel in landscape -- matches plan specification
