# Scout Report: T8.6

## Key Facts (read this first)

- **Tech stack**: Vanilla JS (no build step, no framework), Node.js server with `ws` + `better-sqlite3`, HTML5 canvas, CSS custom properties.
- **Existing WebSocket**: One WebSocket per browser tab (`browserSocket` variable in `server/caretaker.js`). Currently only sends `command` messages to browser. T8.6 adds two new outbound message types: `activity_action` and `activity_incident`.
- **No left sidebar exists yet**: `#left-panel` is actually the BOTTOM panel (confusingly named). A new `#caretaker-sidebar` element must be created, modeled after the existing `.education-panel` (right-side overlay) but on the left.
- **`#sidebarToggle` exists but is desktop-hidden**: The hamburger button (`id="sidebarToggle"`) is in the toolbar but `display: none` on desktop. It currently opens the bottom drawer on mobile. The planner must decide: repurpose it for the activity sidebar on desktop, or add a new "Activity" button.
- **DB has all needed data**: `actions` and `incidents` tables in `better-sqlite3`. Schema fully defined in `server/db.js`. Need to add `getRecentActivity(limit)` query for initial history on WebSocket connect.

## Relevant Files

| File | Role for T8.6 |
|------|--------------|
| `server/caretaker.js` | ADD: broadcast `activity_action` on `insertAction`, broadcast `activity_incident` on `insertIncident`; send recent history on new WS connection |
| `server/db.js` | ADD: `getRecentActivity(limit)` query merging actions + incidents sorted by timestamp desc |
| `index.html` | ADD: `<div id="caretaker-sidebar">` HTML structure; add `<script src="./js/caretaker-sidebar.js">` |
| `css/main.css` | ADD: `#caretaker-sidebar` layout (fixed left, slide-in/out, z-index 22); activity feed entry styles; make `#sidebarToggle` visible on desktop |
| `js/caretaker-sidebar.js` | CREATE: receives WS messages (routed from caretaker-bridge), renders feed entries, handles click-to-expand, auto-scroll logic |
| `js/caretaker-bridge.js` | MODIFY: route `activity_action` and `activity_incident` WS message types to `CaretakerSidebar` (similar to how it routes `command` to `executeCommand`) |
| `js/main.js` | MODIFY: wire `#sidebarToggle` to toggle `#caretaker-sidebar` on desktop (or add new toggle button handler) |

## Architecture Notes

**WebSocket message flow (current)**:
```
Browser -> server: { type: 'state', data: {...} }   (every 1s)
Server  -> browser: { type: 'command', action, params }  (on stdin cmd)
```

**After T8.6**:
```
Server -> browser: { type: 'activity_action', id, timestamp, action, params, reasoning, flyState }
Server -> browser: { type: 'activity_incident', id, timestamp, incidentType, severity, description }
Server -> browser: { type: 'activity_history', entries: [...] }  (on connect, last 50)
```

**Layout pattern to follow** (`education-panel`):
```css
position: fixed;
top: 44px;       /* below toolbar */
left: 0;         /* instead of right: 0 */
bottom: 0;       /* or bottom: 180px to avoid bottom panel overlap */
width: 280px;
transform: translateX(-100%);  /* hidden by default */
transition: transform 0.3s ease;
z-index: 22;
```

**`caretaker-bridge.js` routing hook** (line 102): `ws.onmessage = function(event) { executeCommand(event.data); }` -- must be extended to also dispatch activity messages to `CaretakerSidebar`.

**`getLayoutBounds()` in main.js (line 76)**: returns `left: 0` hardcoded. The canvas uses `window.innerWidth` for fly bounds. If sidebar overlays (not pushes) the canvas, no changes needed to `getLayoutBounds` or fly boundary logic.

**Color coding per task spec**:
- green (`--success: #4ade80`) = `action = 'place_food'`
- blue (`--neuron-sensory: #3b82f6`) = `action IN ('set_light', 'set_temp')`
- yellow (`--warning: #fbbf24`) = incident severity `'medium'` or warning-level actions
- red (`--error: #f87171`) = incident severity `'high'`

**Icon approach**: Use Unicode symbols (no image assets): food=`🍎` → use `◉`, wind=`~`, light=`☀`, temp=`⟳`, touch=`✦`, incident=`⚠`, scared=`!`... Or simple text labels to stay consistent with existing no-emoji style.

## Suggested Approach

1. **`server/db.js`**: Add `getRecentActivity(limit)` that does a UNION of `actions` (mapped to `{kind:'action', ...}`) and `incidents` (mapped to `{kind:'incident', ...}`), ordered by timestamp DESC, LIMIT N.

2. **`server/caretaker.js`**:
   - Add a `broadcastToSidebar(obj)` helper (reuses `browserSocket.send` pattern)
   - In `handleStdinCommand`, after `caretakerDb.insertAction(...)`, call `broadcastToSidebar({ type: 'activity_action', ... })`
   - In `detectIncidents`, after each `caretakerDb.insertIncident(...)`, call `broadcastToSidebar({ type: 'activity_incident', ... })`
   - In `wss.on('connection')`, call `broadcastToSidebar({ type: 'activity_history', entries: caretakerDb.getRecentActivity(50) })`

3. **`js/caretaker-sidebar.js`** (new file, IIFE pattern matching existing files):
   - `window.CaretakerSidebar = { init, addAction, addIncident, loadHistory, toggle }`
   - `addEntry(entry)` renders a feed row, prepends to list, handles auto-scroll-if-at-bottom
   - Click on entry toggles `.expanded` class showing reasoning text
   - `toggle()` adds/removes `.sidebar-open` class on `#caretaker-sidebar`

4. **`js/caretaker-bridge.js`**: Extend `ws.onmessage` handler to check `msg.type` before calling `executeCommand` -- if `activity_*`, dispatch to `CaretakerSidebar`.

5. **`css/main.css`**: Add sidebar styles. Use slide transform pattern from landscape mobile `#left-panel` code as reference (lines 1128-1144 of current CSS).

6. **`index.html`**: Insert `#caretaker-sidebar` div before `</body>`, add `<script>` tag after `caretaker-bridge.js`.

7. **`js/main.js`**: Make `#sidebarToggle` visible on desktop; update its click handler to toggle `#caretaker-sidebar` instead of (or in addition to) the bottom panel.

## Risks and Constraints (read this last)

- **`#sidebarToggle` repurposing conflict**: On mobile, the button opens the bottom drawer. On desktop, it should open the activity sidebar. Handler in `main.js` (line 508-516) needs to differentiate by calling `isMobile()`. Don't break existing mobile drawer behavior.
- **Canvas fly bounds use `window.innerWidth`**: If sidebar overlays (not pushes layout), no issue. If sidebar pushes canvas right, fly can walk under the sidebar and food placement coords will be wrong. Recommend overlay approach (same as education-panel).
- **`bottom: 180px` vs `bottom: 0`**: Sidebar should end at `bottom: 180px` on desktop so it doesn't cover the bottom panel. On mobile it's less critical (bottom panel is 120px and sidebar won't be shown).
- **Auto-scroll race**: If user is scrolling through history while new entries arrive, naive prepend+scroll breaks UX. Track whether user has scrolled away from top (feed is newest-first), pause auto-scroll if so.
- **file:// context**: `caretaker-bridge.js` already skips WebSocket in `file://` context (line 116). `CaretakerSidebar` must handle `undefined` state gracefully (no crash if never connected).
- **Z-index**: `#left-panel` is z-index 20 (bottom panel), `education-panel` is z-index 25. New sidebar should be z-index 22 to layer correctly.
- **Server only has one browserSocket**: Only one browser client expected. The broadcast pattern is already `browserSocket.send(...)` -- no multi-client concern.
- **Initial history on page load**: If the server was running before the browser connects, the history query needs to handle empty DB gracefully (no actions/incidents yet).
