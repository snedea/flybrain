# Plan: T8.6

## Dependencies
- list: none (all dependencies already present: ws, better-sqlite3, vanilla JS)
- commands: none

## File Operations (in execution order)

### 1. MODIFY server/db.js
- operation: MODIFY
- reason: Add `getRecentActivity(limit)` query that merges actions + incidents tables for initial history load
- anchor: `getLastIncidentTime: function(type) {`

#### Functions
- signature: `getRecentActivity: function(limit)`
  - purpose: Return the most recent N activity entries (actions + incidents combined), sorted newest-first
  - logic:
    1. If `limit` is undefined, default to 50
    2. Execute a SQL query using `db.prepare(...)` that does a UNION ALL of two SELECTs:
       - SELECT from `actions`: `id, timestamp, 'action' AS kind, action AS name, params, reasoning, fly_state AS state_snapshot`
       - SELECT from `incidents`: `id, timestamp, 'incident' AS kind, type AS name, NULL AS params, description AS reasoning, state_snapshot`
    3. ORDER BY `timestamp DESC` LIMIT the given `limit`
    4. Return the array of rows from `.all(limit)`
  - calls: `db.prepare().all(limit)`
  - returns: `Array<{id: number, timestamp: string, kind: 'action'|'incident', name: string, params: string|null, reasoning: string, state_snapshot: string|null}>`
  - error handling: none needed -- empty tables return empty array

#### Wiring / Integration
- Add the `getRecentActivity` function to the returned object from `openDb()`, placed after the `getLastIncidentTime` function and before the `computeDailyScore` function

### 2. MODIFY server/caretaker.js
- operation: MODIFY
- reason: Broadcast activity_action and activity_incident messages to the browser via WebSocket; send activity_history on new connection

#### Functions
- signature: `function broadcastActivity(obj)` (new module-level function)
  - purpose: Send a JSON message to the browser WebSocket if connected
  - logic:
    1. Check `browserSocket !== null && browserSocket.readyState === WebSocket.OPEN`
    2. If true, call `browserSocket.send(JSON.stringify(obj))`
    3. Wrap in try/catch, log errors to stderr
  - returns: void
  - error handling: catch send errors, write to `process.stderr`

#### Wiring / Integration

**Anchor 1** -- after `insertAction` call in `handleStdinCommand`:
- anchor: `caretakerDb.insertAction(ts, cmd.action, cmd.params || {}, cmd.reasoning || '', lastState);`
- After that line, before the `if (browserSocket !== null` block, add:
  ```
  broadcastActivity({ type: 'activity_action', timestamp: ts, action: cmd.action, params: cmd.params || {}, reasoning: cmd.reasoning || '', flyState: lastState });
  ```

**Anchor 2** -- after `insertIncident` for `scared_the_fly` in `detectIncidents`:
- anchor: `caretakerDb.insertIncident(now, 'scared_the_fly', 'high',`
- After the `writeStdout({ type: 'incident', incident: 'scared_the_fly'...` line (after the insertIncident + writeStdout pair), add:
  ```
  broadcastActivity({ type: 'activity_incident', timestamp: now, incidentType: 'scared_the_fly', severity: 'high', description: 'Fear spiked from ' + preFearLevel.toFixed(2) + ' to ' + fear.toFixed(2) + ' after ' + lastActionType });
  ```

**Anchor 3** -- after `insertIncident` for `forgot_to_feed` in `detectIncidents`:
- anchor: `caretakerDb.insertIncident(now, 'forgot_to_feed', 'medium',`
- After the `writeStdout({ type: 'incident', incident: 'forgot_to_feed'...` line (after the insertIncident + writeStdout pair), add:
  ```
  broadcastActivity({ type: 'activity_incident', timestamp: now, incidentType: 'forgot_to_feed', severity: 'medium', description: 'Hunger at ' + hunger.toFixed(2) + ' with no food available' });
  ```

**Anchor 4** -- inside `wss.on('connection')` callback, send history:
- anchor: `process.stderr.write('[caretaker] Browser connected\n');`
- After that line, add:
  ```
  var history = caretakerDb.getRecentActivity(50);
  broadcastActivity({ type: 'activity_history', entries: history });
  ```

### 3. CREATE js/caretaker-sidebar.js
- operation: CREATE
- reason: New file -- browser-side module for receiving, rendering, and managing the activity feed sidebar

#### Imports / Dependencies
- none (vanilla JS IIFE, reads from global DOM)

#### Structs / Types
- Feed entry DOM structure (created dynamically):
  ```
  <div class="activity-entry activity-{colorClass}" data-expanded="false">
    <div class="activity-entry-header">
      <span class="activity-icon">{icon}</span>
      <span class="activity-time">{HH:MM:SS}</span>
      <span class="activity-desc">{description text}</span>
    </div>
    <div class="activity-entry-detail">{reasoning text}</div>
  </div>
  ```
- colorClass mapping:
  - `'feed'` (green) when `action === 'place_food'` or `action === 'clear_food'`
  - `'comfort'` (blue) when `action === 'set_light'` or `action === 'set_temp'`
  - `'warning'` (yellow) when `kind === 'incident' && severity === 'medium'`
  - `'incident'` (red) when `kind === 'incident' && severity === 'high'`
  - `'neutral'` (default, --text-muted) for everything else (touch, blow_wind)
- icon mapping (plain text, no emojis per project convention):
  - `'place_food'` -> `'F'`
  - `'clear_food'` -> `'X'`
  - `'set_light'` -> `'L'`
  - `'set_temp'` -> `'T'`
  - `'touch'` -> `'H'`
  - `'blow_wind'` -> `'W'`
  - incident (any) -> `'!'`

#### Functions
- The file is an IIFE `(function() { ... })();` that exposes `window.CaretakerSidebar`

- signature: `function init()`
  - purpose: Cache DOM references, set up click-to-expand delegation
  - logic:
    1. Set `feedList = document.getElementById('activity-feed-list')`
    2. Set `sidebar = document.getElementById('caretaker-sidebar')`
    3. If `feedList` is null, return early (graceful no-op for file:// context)
    4. Add click event listener on `feedList` using event delegation:
       - `var entry = e.target.closest('.activity-entry')`
       - If entry exists, toggle its `data-expanded` attribute between `'true'` and `'false'`
       - Toggle class `expanded` on the entry
    5. Set `userScrolled = false`
    6. Add scroll event listener on `feedList`:
       - If `feedList.scrollTop > 20`, set `userScrolled = true`
       - If `feedList.scrollTop <= 5`, set `userScrolled = false`
  - returns: void

- signature: `function formatTime(isoString)`
  - purpose: Format an ISO timestamp to HH:MM:SS local time
  - logic:
    1. Create `var d = new Date(isoString)`
    2. Return `d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })`
  - returns: string

- signature: `function getColorClass(kind, action, severity)`
  - purpose: Determine the CSS color class for a feed entry
  - logic:
    1. If `kind === 'incident'` and `severity === 'high'`, return `'incident'`
    2. If `kind === 'incident'`, return `'warning'`
    3. If `action === 'place_food' || action === 'clear_food'`, return `'feed'`
    4. If `action === 'set_light' || action === 'set_temp'`, return `'comfort'`
    5. Return `'neutral'`
  - returns: string

- signature: `function getIcon(kind, action)`
  - purpose: Return a single-character icon for the entry type
  - logic:
    1. If `kind === 'incident'`, return `'!'`
    2. Map: `{ place_food: 'F', clear_food: 'X', set_light: 'L', set_temp: 'T', touch: 'H', blow_wind: 'W' }`
    3. Return the mapped value or `'*'` as default
  - returns: string

- signature: `function buildDescription(kind, action, params, reasoning)`
  - purpose: Build a human-readable one-line description for the feed entry
  - logic:
    1. If `kind === 'incident'`, return `reasoning` directly (the description field is already human-readable)
    2. Parse `params` if it is a string: `var p = typeof params === 'string' ? JSON.parse(params) : (params || {})`
    3. Switch on `action`:
       - `'place_food'`: return `'Placed food at (' + Math.round(p.x) + ', ' + Math.round(p.y) + ')'`
       - `'clear_food'`: return `'Cleared all food'`
       - `'set_light'`: return `'Set light to ' + (p.level || 'unknown')`
       - `'set_temp'`: return `'Set temp to ' + (p.level || 'unknown')`
       - `'touch'`: return `'Touched fly at (' + Math.round(p.x || 0) + ', ' + Math.round(p.y || 0) + ')'`
       - `'blow_wind'`: return `'Blew wind (strength ' + (p.strength || 0.5).toFixed(1) + ')'`
       - default: return `action`
    4. Catch JSON.parse errors: if parse fails, return `action` as fallback
  - returns: string

- signature: `function createEntryEl(kind, action, params, reasoning, severity, timestamp)`
  - purpose: Create and return a DOM element for one feed entry
  - logic:
    1. Call `var colorClass = getColorClass(kind, action, severity)`
    2. Call `var icon = getIcon(kind, action)`
    3. Call `var desc = buildDescription(kind, action, params, reasoning)`
    4. Call `var time = formatTime(timestamp)`
    5. Create `var el = document.createElement('div')`
    6. Set `el.className = 'activity-entry activity-' + colorClass`
    7. Set `el.setAttribute('data-expanded', 'false')`
    8. Build a `reasoningText` variable: if `kind === 'incident'`, use empty string (description is already the main text). If `kind === 'action'`, use `reasoning || ''`.
    9. Set `el.innerHTML` to:
       ```
       '<div class="activity-entry-header">' +
         '<span class="activity-icon">' + icon + '</span>' +
         '<span class="activity-time">' + time + '</span>' +
         '<span class="activity-desc">' + desc + '</span>' +
       '</div>' +
       (reasoningText ? '<div class="activity-entry-detail">' + reasoningText + '</div>' : '')
       ```
    10. Return `el`
  - returns: HTMLDivElement

- signature: `function addEntry(kind, action, params, reasoning, severity, timestamp)`
  - purpose: Create an entry element and prepend it to the feed list (newest on top)
  - logic:
    1. If `feedList` is null, return
    2. Call `var el = createEntryEl(kind, action, params, reasoning, severity, timestamp)`
    3. Prepend: `feedList.insertBefore(el, feedList.firstChild)`
    4. Cap total entries: if `feedList.children.length > 200`, remove `feedList.lastChild`
    5. If `userScrolled` is false, set `feedList.scrollTop = 0` (keep scrolled to top = newest)
  - returns: void

- signature: `function onAction(msg)`
  - purpose: Handle an `activity_action` WebSocket message
  - logic:
    1. Call `addEntry('action', msg.action, msg.params, msg.reasoning, null, msg.timestamp)`
  - returns: void

- signature: `function onIncident(msg)`
  - purpose: Handle an `activity_incident` WebSocket message
  - logic:
    1. Call `addEntry('incident', msg.incidentType, null, msg.description, msg.severity, msg.timestamp)`
  - returns: void

- signature: `function onHistory(msg)`
  - purpose: Handle an `activity_history` WebSocket message (initial load of recent entries)
  - logic:
    1. If `feedList` is null, return
    2. Set `feedList.innerHTML = ''` (clear any existing entries)
    3. Iterate `msg.entries` in forward order (they are sorted timestamp DESC from server, so index 0 is newest)
    4. For each entry `e`:
       - If `e.kind === 'action'`: call `createEntryEl('action', e.name, e.params, e.reasoning, null, e.timestamp)` and append to feedList
       - If `e.kind === 'incident'`: call `createEntryEl('incident', e.name, null, e.reasoning, null, e.timestamp)` and append to feedList
       - Note: append (not prepend) because we iterate newest-first and want newest at top
    5. Set `feedList.scrollTop = 0`
  - returns: void

- signature: `function toggle()`
  - purpose: Toggle sidebar visibility
  - logic:
    1. If `sidebar` is null, return
    2. Toggle class `sidebar-open` on `sidebar`: `sidebar.classList.toggle('sidebar-open')`
    3. Return the current open state: `return sidebar.classList.contains('sidebar-open')`
  - returns: boolean

- signature: `function isOpen()`
  - purpose: Check if sidebar is currently open
  - logic:
    1. Return `sidebar !== null && sidebar.classList.contains('sidebar-open')`
  - returns: boolean

#### Wiring / Integration
- Expose as: `window.CaretakerSidebar = { init: init, onAction: onAction, onIncident: onIncident, onHistory: onHistory, toggle: toggle, isOpen: isOpen }`
- Call `init()` at the end of the IIFE (self-initializing, like caretaker-bridge.js)
- Module-level variables: `var feedList = null, sidebar = null, userScrolled = false`

### 4. MODIFY js/caretaker-bridge.js
- operation: MODIFY
- reason: Route activity_action, activity_incident, and activity_history WebSocket message types to CaretakerSidebar instead of only handling 'command' type
- anchor: `ws.onmessage = function(event) { executeCommand(event.data); };`

#### Functions
- Replace the `ws.onmessage` handler:
  - Old line: `ws.onmessage = function(event) { executeCommand(event.data); };`
  - New logic:
    ```javascript
    ws.onmessage = function(event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      if (msg.type === 'command') {
        executeCommand(event.data);
      } else if (typeof CaretakerSidebar !== 'undefined') {
        if (msg.type === 'activity_action') {
          CaretakerSidebar.onAction(msg);
        } else if (msg.type === 'activity_incident') {
          CaretakerSidebar.onIncident(msg);
        } else if (msg.type === 'activity_history') {
          CaretakerSidebar.onHistory(msg);
        }
      }
    };
    ```
  - Note: `executeCommand` already does its own `JSON.parse`, so passing `event.data` (the raw string) to it is correct -- it re-parses internally. The outer parse is only to check `msg.type` for routing.

### 5. MODIFY index.html
- operation: MODIFY
- reason: Add sidebar HTML structure and load the new caretaker-sidebar.js script

#### Wiring / Integration

**Anchor 1** -- Insert sidebar HTML. Place it right before the `<div id="drawer-backdrop"` line:
- anchor: `<div id="drawer-backdrop" class="drawer-backdrop"></div>`
- Insert BEFORE that line:
  ```html
  <div id="caretaker-sidebar" class="caretaker-sidebar">
      <div class="caretaker-sidebar-header">
          <span class="caretaker-sidebar-title">Activity</span>
          <button class="caretaker-sidebar-close" id="caretaker-sidebar-close">&times;</button>
      </div>
      <div class="activity-feed" id="activity-feed-list"></div>
  </div>
  ```

**Anchor 2** -- Add script tag. Place it after `caretaker-renderer.js` and before `caretaker-bridge.js`:
- anchor: `<script type="text/javascript" src="./js/caretaker-renderer.js?v=17"></script>`
- Insert AFTER that line:
  ```html
  <script type="text/javascript" src="./js/caretaker-sidebar.js?v=17"></script>
  ```
- caretaker-sidebar.js MUST load before caretaker-bridge.js so that `CaretakerSidebar` is defined when the bridge's `onmessage` handler fires.

### 6. MODIFY css/main.css
- operation: MODIFY
- reason: Add all styles for the caretaker sidebar, activity feed entries, color coding, and a desktop-visible activity toggle button

#### Wiring / Integration

**Anchor 1** -- Add sidebar styles. Insert a new block AFTER the education panel section (after the `.edu-links a:hover` rule):
- anchor: `.edu-links a:hover {`
- Insert AFTER that closing `}` block:

```css
/* --- Caretaker Activity Sidebar --- */
.caretaker-sidebar {
    position: fixed;
    top: 44px;
    left: 0;
    bottom: 180px;
    width: 280px;
    max-width: 85vw;
    background: var(--surface);
    border-right: 1px solid var(--border);
    z-index: 22;
    font-family: system-ui, -apple-system, sans-serif;
    display: flex;
    flex-direction: column;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    transform: translateX(-100%);
    transition: transform 0.3s ease;
}

.caretaker-sidebar.sidebar-open {
    transform: translateX(0);
}

.caretaker-sidebar-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.caretaker-sidebar-title {
    color: var(--text);
    font-size: 0.9rem;
    font-weight: 600;
}

.caretaker-sidebar-close {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
}

.caretaker-sidebar-close:hover {
    color: var(--text);
}

.activity-feed {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    scrollbar-width: thin;
    scrollbar-color: rgba(136, 146, 164, 0.3) transparent;
}

.activity-feed::-webkit-scrollbar {
    width: 6px;
}

.activity-feed::-webkit-scrollbar-track {
    background: transparent;
}

.activity-feed::-webkit-scrollbar-thumb {
    background: rgba(136, 146, 164, 0.3);
    border-radius: 3px;
}

.activity-feed::-webkit-scrollbar-thumb:hover {
    background: rgba(136, 146, 164, 0.5);
}

.activity-entry {
    padding: 0.4rem 0.5rem;
    border-radius: var(--radius);
    margin-bottom: 0.25rem;
    cursor: pointer;
    border-left: 3px solid var(--text-muted);
    background: transparent;
    transition: background 0.2s ease;
}

.activity-entry:hover {
    background: var(--surface-hover);
}

.activity-entry-header {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--text);
    line-height: 1.3;
}

.activity-icon {
    font-weight: 700;
    font-size: 0.7rem;
    width: 1rem;
    text-align: center;
    flex-shrink: 0;
}

.activity-time {
    color: var(--text-muted);
    font-size: 0.7rem;
    flex-shrink: 0;
    font-variant-numeric: tabular-nums;
}

.activity-desc {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.activity-entry-detail {
    display: none;
    font-size: 0.75rem;
    color: var(--text-muted);
    padding-top: 0.3rem;
    padding-left: 1.4rem;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
}

.activity-entry.expanded .activity-entry-detail {
    display: block;
}

.activity-entry.expanded .activity-desc {
    white-space: normal;
}

/* Color-coded left borders and icon colors */
.activity-feed .activity-entry.activity-feed {
    border-left-color: var(--success);
}

.activity-feed .activity-entry.activity-feed .activity-icon {
    color: var(--success);
}

.activity-feed .activity-entry.activity-comfort {
    border-left-color: var(--neuron-sensory);
}

.activity-feed .activity-entry.activity-comfort .activity-icon {
    color: var(--neuron-sensory);
}

.activity-feed .activity-entry.activity-warning {
    border-left-color: var(--warning);
}

.activity-feed .activity-entry.activity-warning .activity-icon {
    color: var(--warning);
}

.activity-feed .activity-entry.activity-incident {
    border-left-color: var(--error);
}

.activity-feed .activity-entry.activity-incident .activity-icon {
    color: var(--error);
}

.activity-feed .activity-entry.activity-neutral {
    border-left-color: var(--text-muted);
}

.activity-feed .activity-entry.activity-neutral .activity-icon {
    color: var(--text-muted);
}

/* Activity toggle button (desktop) */
#activityToggle {
    display: inline-block;
}

#activityToggle.active {
    border-color: var(--accent);
    background: var(--accent-subtle);
    color: var(--accent);
}
```

**Anchor 2** -- Mobile overrides inside `@media (max-width: 768px)`. Add after the education panel mobile override:
- anchor: `.education-panel {` (inside the `@media (max-width: 768px)` block, around line 1099)
- After the `.education-panel { ... }` mobile override block, add:

```css
    .caretaker-sidebar {
        top: calc(36px + env(safe-area-inset-top, 0px));
        bottom: 120px;
        width: 100%;
        max-width: 100vw;
        z-index: 23;
    }

    #activityToggle {
        display: none;
    }
```

**Anchor 3** -- Add landscape mobile override. Find the landscape media query section:
- anchor: `/* In landscape, neuron panel sits beside canvas on right side */`
- After the existing landscape `#left-panel` rules (after the `#left-panel::before { display: none; }` block around line 1148), add:

```css
    .caretaker-sidebar {
        top: calc(32px + env(safe-area-inset-top, 0px));
        bottom: 0;
        width: 240px;
    }
```

### 7. MODIFY index.html (second pass -- add Activity toggle button)
- operation: MODIFY
- reason: Add a new "Activity" toolbar button visible on desktop, placed next to the Learn button
- anchor: `<button class="tool-btn" id="learnBtn">Learn</button>`
- Insert BEFORE that line:
  ```html
  <button class="tool-btn" id="activityToggle">Activity</button>
  ```

### 8. MODIFY js/main.js
- operation: MODIFY
- reason: Wire the Activity toggle button and sidebar close button click handlers

#### Wiring / Integration

**Anchor** -- Add the activity toggle handler. Insert after the existing `sidebarToggle` event listener block:
- anchor: `if (drawerBackdrop) {`
- Insert BEFORE that line:

```javascript
// --- Activity sidebar toggle (desktop) ---
var activityToggle = document.getElementById('activityToggle');
var activityCloseBtn = document.getElementById('caretaker-sidebar-close');

if (activityToggle) {
	activityToggle.addEventListener('click', function(e) {
		e.stopPropagation();
		if (typeof CaretakerSidebar !== 'undefined') {
			var isOpen = CaretakerSidebar.toggle();
			activityToggle.classList.toggle('active', isOpen);
		}
	});
}

if (activityCloseBtn) {
	activityCloseBtn.addEventListener('click', function() {
		if (typeof CaretakerSidebar !== 'undefined') {
			var sidebar = document.getElementById('caretaker-sidebar');
			if (sidebar) sidebar.classList.remove('sidebar-open');
			if (activityToggle) activityToggle.classList.remove('active');
		}
	});
}
```

**Anchor 2** -- Update the mobile `sidebarToggle` handler to also toggle the activity sidebar on mobile:
- anchor: `if (sidebarToggle) {`
- Replace the entire `if (sidebarToggle) { ... }` block (lines 508-517) with:

```javascript
if (sidebarToggle) {
	sidebarToggle.addEventListener('click', function (e) {
		e.stopPropagation();
		if (isMobile()) {
			// On mobile, hamburger toggles bottom panel drawer
			if (leftPanel && leftPanel.classList.contains('drawer-open')) {
				closeDrawer();
			} else {
				openDrawer();
			}
		} else {
			// On desktop, hamburger toggles activity sidebar
			if (typeof CaretakerSidebar !== 'undefined') {
				var isOpen = CaretakerSidebar.toggle();
				var actBtn = document.getElementById('activityToggle');
				if (actBtn) actBtn.classList.toggle('active', isOpen);
			}
		}
	});
}
```

## Verification
- build: no build step (vanilla JS served statically)
- lint: no linter configured
- test: no existing tests
- smoke:
  1. Start the server: `cd /Users/name/homelab/flybrain && node server/caretaker.js`
  2. Verify server starts without errors (look for `[caretaker] WebSocket server on port 7600`)
  3. Open `index.html` in a browser served via HTTP (not file://)
  4. Verify the "Activity" button appears in the toolbar on desktop
  5. Click "Activity" -- sidebar should slide in from the left
  6. Click "Activity" again or the X button -- sidebar should slide out
  7. When connected to the caretaker server, send a command via stdin (e.g., `{"action":"place_food","params":{"x":300,"y":300},"reasoning":"fly was hungry"}`) and verify an entry appears in the activity feed with green left border and icon "F"
  8. Verify that on page load, historical entries appear (if any exist in the DB)
  9. Click an entry with reasoning text -- verify the detail row expands below
  10. Verify on mobile viewport (<=768px): the Activity button is hidden, the hamburger button still opens the bottom panel drawer

## Constraints
- Do NOT modify SPEC.md, TASKS.md, or CLAUDE.md
- Do NOT add any npm dependencies
- Do NOT use emojis in the icon mapping (use single ASCII characters)
- Do NOT push the canvas layout when opening the sidebar -- use overlay (transform: translateX) pattern
- Do NOT break the existing mobile hamburger behavior (bottom panel drawer)
- Do NOT change the z-index of existing elements (#left-panel=20, education-panel=25, toolbar=20)
- The sidebar z-index MUST be 22
- The sidebar bottom MUST be 180px on desktop (to avoid overlapping the bottom panel)
- All colors MUST come from CSS custom properties defined in :root (no hardcoded hex values in component styles)
- The `caretaker-sidebar.js` script tag MUST appear BEFORE `caretaker-bridge.js` in index.html
