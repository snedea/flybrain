# Plan: T8.9

## Dependencies
- list: [] (no new packages)
- commands: [] (no install commands)

## File Operations (in execution order)

### 1. MODIFY server/db.js
- operation: MODIFY
- reason: Add `getDailyScores(startDate, endDate)` method that returns all daily_scores rows within a date range, and `getActivityForDate(dateStr, limit)` method that returns actions+incidents for a specific day.
- anchor: `getHungerTimeline: function(limit) {`

#### Functions
- signature: `getDailyScores: function(startDate, endDate)`
  - purpose: Return all daily_scores rows between two dates (inclusive) for the calendar grid
  - logic:
    1. Execute SQL: `SELECT date, composite_score, total_feeds, avg_hunger, fear_incidents FROM daily_scores WHERE date >= ? AND date <= ? ORDER BY date ASC`
    2. Pass `startDate` and `endDate` as parameters (both are YYYY-MM-DD strings)
    3. Return the array of row objects directly from `.all(startDate, endDate)`
  - calls: `db.prepare(...).all(startDate, endDate)`
  - returns: `Array<{date: string, composite_score: number|null, total_feeds: number, avg_hunger: number|null, fear_incidents: number}>`
  - error handling: none (let caller handle)

- signature: `getActivityForDate: function(dateStr, limit)`
  - purpose: Return actions and incidents for a specific calendar date, for filtering the activity feed
  - logic:
    1. If `limit` is undefined, set it to 100
    2. Compute `dayStart = dateStr + 'T00:00:00.000Z'` and `dayEnd = dateStr + 'T23:59:59.999Z'`
    3. Execute SQL:
       ```
       SELECT id, timestamp, kind, name, params, reasoning, state_snapshot FROM (
         SELECT id, timestamp, 'action' AS kind, action AS name, params, reasoning, fly_state AS state_snapshot FROM actions WHERE timestamp >= ? AND timestamp <= ?
         UNION ALL
         SELECT id, timestamp, 'incident' AS kind, type AS name, NULL AS params, description AS reasoning, state_snapshot FROM incidents WHERE timestamp >= ? AND timestamp <= ?
       ) ORDER BY timestamp DESC LIMIT ?
       ```
    4. Pass parameters: `dayStart, dayEnd, dayStart, dayEnd, limit`
    5. Return the array of rows
  - calls: `db.prepare(...).all(dayStart, dayEnd, dayStart, dayEnd, limit)`
  - returns: `Array<{id: number, timestamp: string, kind: string, name: string, params: string|null, reasoning: string, state_snapshot: string|null}>`
  - error handling: none (let caller handle)

#### Wiring / Integration
- Add both methods to the returned object from `openDb()`, after the `getHungerTimeline` method and before the `close` method. Insert them between the closing `}` of `getHungerTimeline` and the line `close: function() {`.

### 2. MODIFY server/caretaker.js
- operation: MODIFY
- reason: Add two new GET endpoints: `/calendar/scores` for the calendar grid data, and `/calendar/day-activity` for filtering activity to a specific day.
- anchor: `if (req.method === 'GET' && req.url === '/analytics/hunger-timeline') {`

#### Functions

Add two new route blocks AFTER the `/analytics/hunger-timeline` handler block (after its closing `return;` on line 257) and BEFORE the `res.writeHead(404)` line:

**Route 1: GET /calendar/scores**
- logic:
  1. Parse query string from `req.url` using `new URL(req.url, 'http://localhost')` to extract `start` and `end` query params
  2. If `start` is missing, default to 28 days ago: `new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10)`
  3. If `end` is missing, default to today: `new Date().toISOString().slice(0, 10)`
  4. Call `caretakerDb.getDailyScores(start, end)`
  5. Respond with 200 and JSON array
- error handling: wrap in try/catch, respond 500 with `{ error: 'Internal error' }` on failure

**Route 2: GET /calendar/day-activity**
- logic:
  1. Parse query string from `req.url` using `new URL(req.url, 'http://localhost')` to extract `date` query param
  2. If `date` is missing, respond 400 with `{ error: 'date parameter required' }`
  3. Call `caretakerDb.getActivityForDate(date, 100)`
  4. Respond with 200 and JSON array
- error handling: wrap in try/catch, respond 500 with `{ error: 'Internal error' }` on failure

The route matching pattern: use `req.url.startsWith('/calendar/scores')` and `req.url.startsWith('/calendar/day-activity')` since these have query params. This matches the pattern for `/analytics/summary` but with query string support.

### 3. CREATE js/caretaker-calendar.js
- operation: CREATE
- reason: New IIFE module implementing the calendar grid view in the sidebar, following the pattern of `caretaker-analytics.js`

#### Imports / Dependencies
- none (vanilla JS IIFE, same pattern as caretaker-analytics.js)

#### Functions

Wrap everything in `(function() { ... })();`

**Module-level variables:**
```javascript
var API_URL = 'http://' + (location.hostname || 'localhost') + ':7600';
var calendarSection = null;
var calendarContent = null;
var calendarToggle = null;
var selectedDate = null;
var currentMonth = null; // Date object for first day of displayed month
var scores = {}; // keyed by 'YYYY-MM-DD'
```

- signature: `function init()`
  - purpose: Find DOM elements, set initial month, fetch scores, bind events
  - logic:
    1. Set `calendarSection = document.getElementById('calendar-section')`; if null, return
    2. Set `calendarContent = document.getElementById('calendar-content')`
    3. Set `calendarToggle = document.getElementById('calendar-toggle')`
    4. If `calendarToggle !== null`, add click listener calling `togglePanel`
    5. Set `currentMonth = new Date()` then set its date to 1: `currentMonth.setDate(1)`; also zero out hours/mins/secs
    6. Call `fetchAndRender()`
  - calls: `fetchAndRender()`
  - returns: void

- signature: `function togglePanel()`
  - purpose: Show/hide the calendar content area
  - logic:
    1. If `calendarContent === null`, return
    2. Check `calendarContent.classList.contains('collapsed')`
    3. If collapsed: remove 'collapsed', set `calendarToggle.textContent = 'Hide'`
    4. If visible: add 'collapsed', set `calendarToggle.textContent = 'Show'`
  - returns: void

- signature: `function fetchAndRender()`
  - purpose: Fetch daily_scores for the current displayed month range and render
  - logic:
    1. Compute `startDate` as first day of `currentMonth`: `currentMonth.getFullYear() + '-' + pad(currentMonth.getMonth() + 1) + '-01'`
    2. Compute `endDate` as last day of month: create `new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0)`, format as `YYYY-MM-DD`
    3. Call `fetch(API_URL + '/calendar/scores?start=' + startDate + '&end=' + endDate)`
    4. Parse JSON response
    5. Clear `scores` object, then loop through response array and set `scores[row.date] = row` for each
    6. Call `renderCalendar()`
  - calls: `fetch(...)`, `renderCalendar()`
  - returns: void
  - error handling: `.catch` logs to `console.warn('[calendar] fetch error:', err.message)`

- signature: `function pad(n)`
  - purpose: Zero-pad a number to 2 digits
  - logic: `return n < 10 ? '0' + n : '' + n;`
  - returns: string

- signature: `function formatDateStr(year, month, day)`
  - purpose: Format a date as YYYY-MM-DD
  - logic: `return year + '-' + pad(month) + '-' + pad(day);`
  - returns: string (YYYY-MM-DD)

- signature: `function renderCalendar()`
  - purpose: Build the full calendar HTML and inject into calendarContent
  - logic:
    1. If `calendarContent === null`, return
    2. Build the navigation header:
       ```
       '<div class="cal-nav">' +
         '<button class="cal-nav-btn" id="cal-prev">&lt;</button>' +
         '<span class="cal-nav-title">' + monthName + ' ' + year + '</span>' +
         '<button class="cal-nav-btn" id="cal-next">&gt;</button>' +
       '</div>'
       ```
       where `monthName` is from array `['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][currentMonth.getMonth()]` and `year = currentMonth.getFullYear()`
    3. Build day-of-week header row: `'<div class="cal-grid"><div class="cal-dow">Su</div><div class="cal-dow">Mo</div><div class="cal-dow">Tu</div><div class="cal-dow">We</div><div class="cal-dow">Th</div><div class="cal-dow">Fr</div><div class="cal-dow">Sa</div>'`
    4. Compute `firstDayOfWeek = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1).getDay()` (0=Sun)
    5. Compute `daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate()`
    6. Add empty cells for days before the first: loop `i` from 0 to `firstDayOfWeek - 1`, append `'<div class="cal-cell cal-empty"></div>'`
    7. Loop `day` from 1 to `daysInMonth`:
       a. Compute `dateStr = formatDateStr(currentMonth.getFullYear(), currentMonth.getMonth() + 1, day)`
       b. Look up `score = scores[dateStr]` (may be undefined)
       c. Determine CSS class for score color:
          - If `score` exists and `score.composite_score !== null`:
            - If `score.composite_score > 80`: `colorClass = 'cal-green'`
            - Else if `score.composite_score >= 50`: `colorClass = 'cal-yellow'`
            - Else: `colorClass = 'cal-red'`
          - Else: `colorClass = 'cal-nodata'`
       d. Determine `selectedClass`: if `selectedDate === dateStr` then `' cal-selected'` else `''`
       e. Build the cell HTML:
          ```
          '<div class="cal-cell ' + colorClass + selectedClass + '" data-date="' + dateStr + '">' +
            '<div class="cal-day">' + day + '</div>' +
            (score ? '<div class="cal-score">' + Math.round(score.composite_score) + '</div>' +
                     '<div class="cal-details">' +
                       '<span title="Incidents">' + score.fear_incidents + 'i</span>' +
                       '<span title="Feeds">' + score.total_feeds + 'f</span>' +
                       '<span title="Avg Hunger">' + (score.avg_hunger !== null ? score.avg_hunger.toFixed(1) : '-') + 'h</span>' +
                     '</div>' : '') +
          '</div>'
          ```
       f. Append cell HTML to the grid string
    8. Close the grid div: `'</div>'`
    9. Set `calendarContent.innerHTML = navHtml + gridHtml`
    10. Bind click listeners:
        - `document.getElementById('cal-prev').addEventListener('click', prevMonth)`
        - `document.getElementById('cal-next').addEventListener('click', nextMonth)`
        - Add click delegation on calendarContent: `calendarContent.addEventListener('click', onCellClick)`
  - calls: `pad()`, `formatDateStr()`
  - returns: void

- signature: `function onCellClick(e)`
  - purpose: Handle clicks on calendar day cells to filter activity feed
  - logic:
    1. Find the closest `.cal-cell` from `e.target`: `var cell = e.target.closest('.cal-cell')`
    2. If `cell === null` or `cell.classList.contains('cal-empty')`, return
    3. Get `var dateStr = cell.getAttribute('data-date')`; if null, return
    4. If `selectedDate === dateStr`: deselect -- set `selectedDate = null`, remove `.cal-selected` from all cells, call `restoreFullFeed()`, return
    5. Else: set `selectedDate = dateStr`
    6. Remove `.cal-selected` from all `.cal-cell` elements in `calendarContent`
    7. Add `.cal-selected` to `cell`
    8. Call `filterFeedToDate(dateStr)`
  - calls: `filterFeedToDate()` or `restoreFullFeed()`
  - returns: void

- signature: `function filterFeedToDate(dateStr)`
  - purpose: Fetch activity for the selected date and replace the activity feed content
  - logic:
    1. Fetch `API_URL + '/calendar/day-activity?date=' + dateStr`
    2. Parse JSON response (array of activity entries)
    3. Get `feedList = document.getElementById('activity-feed-list')`; if null, return
    4. Set `feedList.innerHTML = ''`
    5. If response array is empty: `feedList.innerHTML = '<div class="cal-no-activity">No activity on ' + dateStr + '</div>'`; return
    6. Add a date header: create a div with class `cal-feed-date-header` and text `'Activity for ' + dateStr`; prepend to feedList
    7. Loop through entries (they are in DESC order already). For each entry:
       - Call `window.CaretakerSidebar` method indirectly: create the entry element using the same pattern as CaretakerSidebar.createEntryEl, but since that's not exposed, build the HTML directly:
         ```
         var kind = entry.kind;
         var action = entry.name;
         var params = entry.params;
         var reasoning = entry.reasoning;
         var timestamp = entry.timestamp;
         ```
       - Determine color class: if `kind === 'incident'` use `'incident'`; if `action === 'place_food' || action === 'clear_food'` use `'feed'`; if `action === 'set_light' || action === 'set_temp'` use `'comfort'`; else `'neutral'`
       - Determine icon: if `kind === 'incident'` use `'!'`; else use the iconMap: `{place_food:'F', clear_food:'X', set_light:'L', set_temp:'T', touch:'H', blow_wind:'W'}[action] || '*'`
       - Format timestamp: `new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })`
       - Build description: if `kind === 'incident'`, use `reasoning`; else build from action+params (parse params if string)
       - Create the div element with class `activity-entry activity-{colorClass}` and innerHTML matching the existing entry pattern
       - Append to feedList
  - calls: `fetch(...)`
  - returns: void
  - error handling: `.catch` logs to `console.warn('[calendar] day-activity fetch error:', err.message)`

- signature: `function restoreFullFeed()`
  - purpose: Restore the full activity feed after deselecting a calendar day
  - logic:
    1. Get `feedList = document.getElementById('activity-feed-list')`; if null, return
    2. Set `feedList.innerHTML = ''`
    3. If `window.CaretakerSidebar` exists, call `window.CaretakerSidebar.loadHistory()` -- BUT wait, there's no `loadHistory` exposed. Instead, check if `window.caretakerBridge` is connected and the bridge ws is open. The simplest approach: trigger a reconnect/reload by calling the bridge's websocket which sends `activity_history` on connect. But that's too complex.
    4. Simpler approach: fetch from `/calendar/day-activity` without a date param won't work. Instead, use the existing `getRecentActivity` endpoint pattern. BUT there is no standalone REST endpoint for full activity. The activity history is sent over WebSocket on connect.
    5. Simplest correct approach: set `feedList.innerHTML = '<div class="cal-no-activity">Reload the page to restore full feed, or click Activity to reconnect.</div>'` AND then trigger reload of history by checking if the caretaker bridge websocket is available. Actually, the cleanest approach: expose a `reloadHistory` on `CaretakerSidebar` or just add a small GET endpoint.
    6. REVISED: Add a `GET /activity/recent` endpoint to server (see step 2 revision below), then fetch from it and rebuild the feed. BUT to keep changes minimal, use a different approach: just clear the date filter indication and let the websocket's real-time flow repopulate. Add a note div saying "Live feed resumed" and the next incoming action/incident will append naturally.
    7. FINAL APPROACH: The existing WebSocket `onconnection` handler in `server/caretaker.js` sends `activity_history` with recent entries. We can trigger this by sending a special message from the browser. But that requires modifying the WS protocol. Too invasive.
    8. SIMPLEST FINAL: Just re-fetch using `/calendar/day-activity` with today's date is NOT right either since we want ALL activity not just today.
    9. ACTUAL SIMPLEST: Keep it practical. When deselecting, reload the full page activity by fetching a new endpoint. Add a `GET /activity/recent` endpoint in caretaker.js.

OK -- let me revise. The cleanest path: add one more GET endpoint to caretaker.js (`GET /activity/recent`) that calls `caretakerDb.getRecentActivity(50)` and returns the JSON. Then `restoreFullFeed()` fetches this and rebuilds entries. This requires:
  - Adding the endpoint in step 2 (caretaker.js)
  - Using it in restoreFullFeed

REVISED `restoreFullFeed`:
  - logic:
    1. Get `feedList = document.getElementById('activity-feed-list')`; if null, return
    2. Fetch `API_URL + '/activity/recent'`
    3. Parse JSON response (array of activity entries, same shape as `getRecentActivity`)
    4. Set `feedList.innerHTML = ''`
    5. Loop through entries and build entry elements the same way as `filterFeedToDate`, then append to feedList
  - calls: `fetch(...)`
  - returns: void
  - error handling: `.catch` -- set feedList.innerHTML to a message "Could not reload feed"

- signature: `function buildEntryEl(entry)`
  - purpose: Create a DOM element for an activity/incident entry (shared by filterFeedToDate and restoreFullFeed)
  - logic:
    1. Extract: `kind = entry.kind`, `action = entry.name`, `params = entry.params`, `reasoning = entry.reasoning`, `timestamp = entry.timestamp`
    2. Determine `colorClass`:
       - If `kind === 'incident'`: `'incident'`
       - Else if `action === 'place_food' || action === 'clear_food'`: `'feed'`
       - Else if `action === 'set_light' || action === 'set_temp'`: `'comfort'`
       - Else: `'neutral'`
    3. Determine `icon`:
       - If `kind === 'incident'`: `'!'`
       - Else: `{place_food:'F', clear_food:'X', set_light:'L', set_temp:'T', touch:'H', blow_wind:'W'}[action] || '*'`
    4. Format time: `new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })`
    5. Build description:
       - If `kind === 'incident'`: use `reasoning`
       - Else: try `JSON.parse(params)` into `p`. Switch on action:
         - `place_food`: `'Placed food at (' + Math.round(p.x) + ', ' + Math.round(p.y) + ')'`
         - `clear_food`: `'Cleared all food'`
         - `set_light`: `'Set light to ' + (p.level || 'unknown')`
         - `set_temp`: `'Set temp to ' + (p.level || 'unknown')`
         - `touch`: `'Touched fly'`
         - `blow_wind`: `'Blew wind'`
         - default: action name
    6. Create div element with `className = 'activity-entry activity-' + colorClass`
    7. Set innerHTML:
       ```
       '<div class="activity-entry-header">' +
         '<span class="activity-icon">' + icon + '</span>' +
         '<span class="activity-time">' + timeStr + '</span>' +
         '<span class="activity-desc">' + desc + '</span>' +
       '</div>' +
       (reasoningText ? '<div class="activity-entry-detail">' + reasoningText + '</div>' : '')
       ```
       where `reasoningText = kind === 'incident' ? '' : (reasoning || '')`
    8. Return the element
  - returns: HTMLDivElement

- signature: `function prevMonth()`
  - purpose: Navigate to the previous month
  - logic:
    1. `currentMonth.setMonth(currentMonth.getMonth() - 1)`
    2. `selectedDate = null`
    3. Call `fetchAndRender()`
  - returns: void

- signature: `function nextMonth()`
  - purpose: Navigate to the next month
  - logic:
    1. `currentMonth.setMonth(currentMonth.getMonth() + 1)`
    2. `selectedDate = null`
    3. Call `fetchAndRender()`
  - returns: void

**Initialization and exports:**
- Call `init()` at the bottom of the IIFE
- Set `window.CaretakerCalendar = { init: init, refresh: fetchAndRender }`

### 4. MODIFY server/caretaker.js (second pass)
- operation: MODIFY
- reason: Add `GET /activity/recent` endpoint for restoring full feed after calendar day deselection
- anchor: `res.writeHead(404);`

#### Functions
Add a new route block BEFORE the `res.writeHead(404);` line:

**Route: GET /activity/recent**
```javascript
if (req.method === 'GET' && req.url === '/activity/recent') {
  try {
    var recent = caretakerDb.getRecentActivity(50);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(recent));
  } catch (err) {
    process.stderr.write('[caretaker] activity/recent error: ' + err.message + '\n');
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal error' }));
  }
  return;
}
```

NOTE: Combine this with the routes from step 2. All three new routes (calendar/scores, calendar/day-activity, activity/recent) should be added together in one MODIFY pass, all before the `res.writeHead(404);` line.

### 5. MODIFY index.html
- operation: MODIFY
- reason: Add calendar section HTML div inside #caretaker-sidebar (after analytics-section), add new script tag for caretaker-calendar.js
- anchor: `<div class="analytics-section" id="analytics-section">`

#### HTML Changes

**Change 1: Add calendar section div**
After the closing `</div>` of `analytics-section` (the one on the line containing `</div>` that closes `id="analytics-section"`) and before `</div>` of `#caretaker-sidebar`, insert:

```html
<div class="calendar-section" id="calendar-section">
    <div class="calendar-section-header">
        <span class="calendar-section-title">Calendar</span>
        <button class="calendar-toggle-btn" id="calendar-toggle">Hide</button>
    </div>
    <div class="calendar-content" id="calendar-content"></div>
</div>
```

Specifically, find this exact block:
```html
        <div class="analytics-content" id="analytics-content"></div>
        </div>
    </div>
```

Replace with:
```html
        <div class="analytics-content" id="analytics-content"></div>
        </div>
        <div class="calendar-section" id="calendar-section">
            <div class="calendar-section-header">
                <span class="calendar-section-title">Calendar</span>
                <button class="calendar-toggle-btn" id="calendar-toggle">Hide</button>
            </div>
            <div class="calendar-content" id="calendar-content"></div>
        </div>
    </div>
```

**Change 2: Add script tag**
After the line `<script type="text/javascript" src="./js/caretaker-analytics.js?v=17"></script>`, add:
```html
    <script type="text/javascript" src="./js/caretaker-calendar.js?v=17"></script>
```

### 6. MODIFY css/main.css
- operation: MODIFY
- reason: Add calendar grid styles for the new calendar section in the sidebar
- anchor: `.analytics-sparkline-empty {`

#### CSS Rules
After the `.analytics-sparkline-empty { ... }` block (ending on line 1416 with `}`), and BEFORE the `/* --- Hamburger toggle (hidden on desktop) --- */` comment, insert the following CSS:

```css
/* --- Caretaker Calendar Panel --- */
.calendar-section {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    max-height: 50%;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(136, 146, 164, 0.3) transparent;
}

.calendar-section::-webkit-scrollbar {
    width: 6px;
}

.calendar-section::-webkit-scrollbar-track {
    background: transparent;
}

.calendar-section::-webkit-scrollbar-thumb {
    background: rgba(136, 146, 164, 0.3);
    border-radius: 3px;
}

.calendar-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    flex-shrink: 0;
}

.calendar-section-title {
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 600;
}

.calendar-toggle-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: var(--radius);
    cursor: pointer;
    font-family: system-ui, -apple-system, sans-serif;
}

.calendar-toggle-btn:hover {
    color: var(--text);
    border-color: var(--accent);
}

.calendar-content {
    padding: 0 0.75rem 0.75rem;
}

.calendar-content.collapsed {
    display: none;
}

.cal-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.5rem;
}

.cal-nav-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.75rem;
    padding: 0.15rem 0.4rem;
    border-radius: var(--radius);
    cursor: pointer;
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1;
}

.cal-nav-btn:hover {
    color: var(--text);
    border-color: var(--accent);
}

.cal-nav-title {
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 600;
}

.cal-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 2px;
}

.cal-dow {
    text-align: center;
    font-size: 0.6rem;
    color: var(--text-muted);
    padding: 0.15rem 0;
    font-weight: 600;
}

.cal-cell {
    background: var(--bg);
    border-radius: 4px;
    padding: 0.2rem;
    min-height: 2.5rem;
    cursor: pointer;
    border: 1px solid transparent;
    transition: border-color 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1px;
}

.cal-cell:hover {
    border-color: var(--accent);
}

.cal-cell.cal-empty {
    background: transparent;
    cursor: default;
    border: none;
}

.cal-cell.cal-empty:hover {
    border-color: transparent;
}

.cal-cell.cal-selected {
    border-color: var(--accent);
    background: var(--accent-subtle);
}

.cal-cell.cal-green {
    background: rgba(74, 222, 128, 0.12);
}

.cal-cell.cal-yellow {
    background: rgba(251, 191, 36, 0.12);
}

.cal-cell.cal-red {
    background: rgba(248, 113, 113, 0.12);
}

.cal-cell.cal-nodata {
    background: var(--bg);
}

.cal-day {
    font-size: 0.65rem;
    color: var(--text);
    font-weight: 600;
    line-height: 1;
}

.cal-score {
    font-size: 0.6rem;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
}

.cal-green .cal-score {
    color: var(--success);
}

.cal-yellow .cal-score {
    color: var(--warning);
}

.cal-red .cal-score {
    color: var(--error);
}

.cal-nodata .cal-score {
    color: var(--text-muted);
}

.cal-details {
    display: flex;
    gap: 0.2rem;
    font-size: 0.5rem;
    color: var(--text-muted);
    line-height: 1;
}

.cal-no-activity {
    font-size: 0.8rem;
    color: var(--text-muted);
    padding: 1rem 0.5rem;
    text-align: center;
}

.cal-feed-date-header {
    font-size: 0.75rem;
    color: var(--accent);
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    margin-bottom: 0.25rem;
}
```

## Verification
- build: No build step (vanilla JS). Run `node -e "require('./server/db.js')"` from the `flybrain` directory to verify db.js has no syntax errors.
- lint: No linter configured. Manually check for syntax errors with `node -c js/caretaker-calendar.js` (will fail since it's browser JS with no module -- skip this).
- test: No existing tests.
- smoke:
  1. Start the server: `cd /Users/name/homelab/flybrain && node server/caretaker.js`
  2. Test calendar scores endpoint: `curl -s 'http://localhost:7600/calendar/scores?start=2026-01-01&end=2026-03-27'` -- expect a JSON array (possibly empty if no scores exist)
  3. Test day activity endpoint: `curl -s 'http://localhost:7600/calendar/day-activity?date=2026-03-27'` -- expect a JSON array
  4. Test activity recent endpoint: `curl -s 'http://localhost:7600/activity/recent'` -- expect a JSON array
  5. Test missing date param: `curl -s 'http://localhost:7600/calendar/day-activity'` -- expect `{"error":"date parameter required"}`
  6. Open `index.html` in a browser with the server running and verify the Calendar section appears in the left sidebar below Analytics

## Constraints
- Do not modify SPEC.md, TASKS.md, or CLAUDE.md
- Do not add any npm packages
- Do not modify the WebSocket protocol in caretaker-bridge.js
- Do not modify existing analytics or sidebar functionality
- All colors must use CSS custom properties from :root (no hardcoded hex values in component styles except rgba transparency variations)
- Follow the IIFE pattern of caretaker-analytics.js for the new JS file
- Do not bump the `?v=17` version parameter on existing script/CSS tags -- only the new file needs v=17 for consistency
