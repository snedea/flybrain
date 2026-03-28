# Plan: T8.8

## Dependencies
- list: none (all dependencies already installed -- better-sqlite3, ws, @anthropic-ai/sdk)
- commands: none

## File Operations (in execution order)

### 1. MODIFY server/db.js
- operation: MODIFY
- reason: Add two new query methods for the analytics endpoints: getAnalyticsSummary and getHungerTimeline
- anchor: `close: function() {`

#### Functions

- signature: `getAnalyticsSummary: function(dateStr)`
  - purpose: Return today's caretaker metrics for the analytics panel
  - logic:
    1. Compute dayStart = dateStr + 'T00:00:00.000Z' and dayEnd = dateStr + 'T23:59:59.999Z'
    2. Query daily_scores for the given date: `SELECT composite_score, total_feeds, avg_hunger, fear_incidents FROM daily_scores WHERE date = ?` using dateStr. Store result as `scoreRow` (may be null).
    3. Query total feeds today: `SELECT COUNT(*) as cnt FROM actions WHERE action = 'place_food' AND timestamp >= ? AND timestamp <= ?` using dayStart, dayEnd. Store as `feedsToday`.
    4. Query fear incidents today: `SELECT COUNT(*) as cnt FROM incidents WHERE type = 'scared_the_fly' AND timestamp >= ? AND timestamp <= ?` using dayStart, dayEnd. Store as `fearToday`.
    5. Query observation count today: `SELECT COUNT(*) as cnt FROM observations WHERE timestamp >= ? AND timestamp <= ?` using dayStart, dayEnd. Store as `obsCount`.
    6. Compute avg response time dynamically (not from the buggy daily_scores.avg_response_time column):
       - Query all hunger-threshold-breach observations: `SELECT id, timestamp FROM observations WHERE hunger > 0.7 AND timestamp >= ? AND timestamp <= ? ORDER BY id ASC` using dayStart, dayEnd. Store as `hungerBreaches`.
       - Query all place_food actions: `SELECT timestamp FROM actions WHERE action = 'place_food' AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC` using dayStart, dayEnd. Store as `foodPlacements`.
       - For each hungerBreach, find the first foodPlacement whose timestamp is >= the breach timestamp. Compute delta in seconds. Collect all deltas into an array `responseTimes`.
       - If responseTimes.length > 0, compute avgResponseTime = sum of responseTimes / responseTimes.length, rounded to 1 decimal. Else avgResponseTime = null.
    7. Compute feeding frequency: feedsPerHour = feedsToday / max(1, obsCount * 10 / 3600). Round to 2 decimals. This converts observation count (at 10s intervals) to approximate connected hours. If obsCount is 0, feedsPerHour = 0.
    8. Compute active hours estimate:
       - Query: `SELECT timestamp FROM observations WHERE timestamp >= ? AND timestamp <= ? ORDER BY id ASC` using dayStart, dayEnd. Store as `obsTimes`.
       - Iterate obsTimes. For each consecutive pair, compute gap = (new Date(obsTimes[i+1].timestamp).getTime() - new Date(obsTimes[i].timestamp).getTime()) / 1000. If gap <= 60 seconds, add gap to `connectedSeconds`. (Gaps > 60s indicate disconnection.)
       - If obsTimes.length >= 2, add 10 to connectedSeconds for the first observation interval.
       - Compute connectedHours = Math.round(connectedSeconds / 360) / 10 (round to 1 decimal, in hours).
       - If obsTimes.length < 2, connectedHours = 0.
    9. Return object: `{ composite_score: scoreRow ? scoreRow.composite_score : null, total_feeds: feedsToday, avg_hunger: scoreRow ? scoreRow.avg_hunger : null, fear_incidents: fearToday, avg_response_time: avgResponseTime, feeds_per_hour: feedsPerHour, connected_hours: connectedHours }`
  - calls: db.prepare().get() and db.prepare().all() (inline, not cached statements -- these are called infrequently)
  - returns: object with keys composite_score, total_feeds, avg_hunger, fear_incidents, avg_response_time, feeds_per_hour, connected_hours
  - error handling: If any query returns null/empty, use fallback values (null for scores, 0 for counts)

- signature: `getHungerTimeline: function(limit)`
  - purpose: Return recent observations (hunger + timestamp) and food placement timestamps for sparkline chart
  - logic:
    1. If limit is undefined, set limit = 120.
    2. Query observations: `SELECT timestamp, hunger FROM observations ORDER BY id DESC LIMIT ?` using limit. Store as `observations`. Call `observations.reverse()` to get chronological order.
    3. Determine time window: if observations.length > 0, set windowStart = observations[0].timestamp, windowEnd = observations[observations.length - 1].timestamp. Else windowStart = new Date().toISOString(), windowEnd = windowStart.
    4. Query food placements within that window: `SELECT timestamp FROM actions WHERE action = 'place_food' AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC` using windowStart, windowEnd. Store as `feedMarkers`.
    5. Return object: `{ observations: observations, feedMarkers: feedMarkers }`
  - calls: db.prepare().all()
  - returns: object with keys observations (array of {timestamp, hunger}) and feedMarkers (array of {timestamp})
  - error handling: If no observations, return { observations: [], feedMarkers: [] }

#### Wiring / Integration
- Both methods are added to the returned object from `openDb()`, right before the `close` method. Insert them as new properties of the returned object literal.
- Anchor for insertion point: the line `close: function() {` at db.js:251. Add both methods BEFORE this line, each followed by a comma.

### 2. MODIFY server/caretaker.js
- operation: MODIFY
- reason: Add two GET endpoint handlers for /analytics/summary and /analytics/hunger-timeline
- anchor: `res.writeHead(404);`

#### Functions (route handlers -- inline in the http.createServer callback)

- Handler 1: GET /analytics/summary
  - signature: inline `if (req.method === 'GET' && req.url === '/analytics/summary')` block
  - purpose: Return today's analytics summary JSON
  - logic:
    1. Compute today = new Date().toISOString().slice(0, 10)
    2. Call caretakerDb.getAnalyticsSummary(today) and store result as `summary`
    3. res.writeHead(200, { 'Content-Type': 'application/json' })
    4. res.end(JSON.stringify(summary))
    5. return
  - error handling: Wrap in try/catch. On error, res.writeHead(500, ...), res.end(JSON.stringify({ error: 'Internal error' }))

- Handler 2: GET /analytics/hunger-timeline
  - signature: inline `if (req.method === 'GET' && req.url === '/analytics/hunger-timeline')` block
  - purpose: Return recent hunger observations and feed marker timestamps
  - logic:
    1. Call caretakerDb.getHungerTimeline(120) and store result as `timeline`
    2. res.writeHead(200, { 'Content-Type': 'application/json' })
    3. res.end(JSON.stringify(timeline))
    4. return
  - error handling: Wrap in try/catch. On error, res.writeHead(500, ...), res.end(JSON.stringify({ error: 'Internal error' }))

#### Wiring / Integration
- Insert both route handlers BEFORE the 404 handler. The anchor line is `res.writeHead(404);` at caretaker.js:233. Place the two new `if` blocks immediately before this line, following the exact same pattern as the existing GET /state, POST /chat, and GET /chat/history handlers.

### 3. CREATE js/caretaker-analytics.js
- operation: CREATE
- reason: New frontend module for the analytics panel -- fetches data from server, renders sparkline SVGs, handles collapse/expand

#### Imports / Dependencies
- No imports. This is a browser IIFE like caretaker-sidebar.js. Accesses DOM and fetch API.

#### Module Structure
- Wrap entire file in `(function() { ... })();`
- Expose `window.CaretakerAnalytics = { init: init, refresh: refresh }` at the end of the IIFE

#### Variables (module-level inside IIFE)
- `var API_URL = 'http://' + (location.hostname || 'localhost') + ':7600';`
- `var analyticsSection = null;`
- `var analyticsContent = null;`
- `var analyticsToggle = null;`
- `var refreshTimer = null;`
- `var REFRESH_INTERVAL = 30000;`

#### Functions

- signature: `function init()`
  - purpose: Bind DOM elements, set up toggle, trigger initial fetch, start refresh timer
  - logic:
    1. Set analyticsSection = document.getElementById('analytics-section')
    2. If analyticsSection is null, return (panel not in DOM)
    3. Set analyticsContent = document.getElementById('analytics-content')
    4. Set analyticsToggle = document.getElementById('analytics-toggle')
    5. If analyticsToggle is not null, add click event listener that calls togglePanel()
    6. Call refresh()
    7. Set refreshTimer = setInterval(refresh, REFRESH_INTERVAL)
  - returns: void

- signature: `function togglePanel()`
  - purpose: Expand/collapse the analytics content area
  - logic:
    1. If analyticsContent is null, return
    2. var isCollapsed = analyticsContent.classList.contains('collapsed')
    3. If isCollapsed: analyticsContent.classList.remove('collapsed'), analyticsToggle.textContent = 'Hide'
    4. Else: analyticsContent.classList.add('collapsed'), analyticsToggle.textContent = 'Show'
  - returns: void

- signature: `function refresh()`
  - purpose: Fetch both analytics endpoints and render all metrics
  - logic:
    1. Call Promise.all([fetch(API_URL + '/analytics/summary').then(r => r.json()), fetch(API_URL + '/analytics/hunger-timeline').then(r => r.json())])
    2. In the .then handler, receive [summary, timeline]
    3. Call renderMetrics(summary, timeline)
    4. In the .catch handler, log warning to console: console.warn('[analytics] fetch error:', err.message)
  - calls: renderMetrics(summary, timeline)
  - returns: void

- signature: `function renderMetrics(summary, timeline)`
  - purpose: Build the HTML content for all 6 metrics inside analyticsContent
  - logic:
    1. If analyticsContent is null, return
    2. Build HTML string `var html = ''`
    3. Append score metric: `html += renderScoreGauge(summary.composite_score)`
    4. Append hunger sparkline: `html += renderHungerSparkline(timeline.observations, timeline.feedMarkers)`
    5. Append fear incidents: `html += renderMetricRow('Fear Incidents', summary.fear_incidents !== null ? summary.fear_incidents : 0, '/today', 'error')`
    6. Append avg response time: `html += renderMetricRow('Avg Response', summary.avg_response_time !== null ? summary.avg_response_time.toFixed(1) + 's' : 'N/A', '', null)`
    7. Append feeding frequency: `html += renderMetricRow('Feed Rate', summary.feeds_per_hour !== null ? summary.feeds_per_hour.toFixed(1) : '0', '/hr', null)`
    8. Append active hours: `html += renderMetricRow('Active Time', summary.connected_hours !== null ? summary.connected_hours.toFixed(1) : '0', 'hrs', null)`
    9. Set analyticsContent.innerHTML = html
  - calls: renderScoreGauge, renderHungerSparkline, renderMetricRow
  - returns: void

- signature: `function renderScoreGauge(score)`
  - purpose: Render the composite caretaker score (0-100) as a colored number with label
  - logic:
    1. If score is null, set displayScore = '--', color = 'var(--text-muted)'
    2. Else, set displayScore = Math.round(score), determine color: if score >= 80 then 'var(--success)', else if score >= 50 then 'var(--warning)', else 'var(--error)'
    3. Return string: `'<div class="analytics-metric analytics-score"><div class="analytics-score-value" style="color:' + color + '">' + displayScore + '</div><div class="analytics-metric-label">Caretaker Score</div></div>'`
  - returns: HTML string

- signature: `function renderHungerSparkline(observations, feedMarkers)`
  - purpose: Render an inline SVG sparkline of hunger values over time, with vertical lines at feed events
  - logic:
    1. If observations is null or observations.length === 0, return `'<div class="analytics-metric"><div class="analytics-metric-label">Hunger Timeline</div><div class="analytics-sparkline-empty">No data yet</div></div>'`
    2. Set SVG dimensions: var W = 240, H = 40
    3. Build array of {x, y} points:
       - var startTime = new Date(observations[0].timestamp).getTime()
       - var endTime = new Date(observations[observations.length - 1].timestamp).getTime()
       - var timeRange = Math.max(1, endTime - startTime)
       - For each observation at index i: x = ((new Date(observations[i].timestamp).getTime() - startTime) / timeRange) * W, y = H - (observations[i].hunger * H). Clamp y to [0, H].
    4. Build polyline points string: join all points as 'x,y' separated by spaces
    5. Build feed marker lines: for each feedMarker, compute markerX = ((new Date(feedMarker.timestamp).getTime() - startTime) / timeRange) * W. If markerX >= 0 and markerX <= W, create `'<line x1="' + markerX + '" y1="0" x2="' + markerX + '" y2="' + H + '" stroke="var(--success)" stroke-width="1" opacity="0.6"/>'`
    6. Build threshold line at hunger=0.7: var threshY = H - (0.7 * H). Create `'<line x1="0" y1="' + threshY + '" x2="' + W + '" y2="' + threshY + '" stroke="var(--warning)" stroke-width="0.5" stroke-dasharray="3,3" opacity="0.5"/>'`
    7. Assemble SVG: `'<svg viewBox="0 0 ' + W + ' ' + H + '" class="analytics-sparkline-svg" preserveAspectRatio="none">' + thresholdLine + feedMarkerLines + '<polyline points="' + pointsStr + '" fill="none" stroke="var(--accent)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"/></svg>'`
    8. Return string: `'<div class="analytics-metric"><div class="analytics-metric-label">Hunger Timeline <span class="analytics-legend"><span class="analytics-legend-marker" style="background:var(--success)"></span>fed <span class="analytics-legend-marker" style="background:var(--warning)"></span>0.7</span></div><div class="analytics-sparkline-container">' + svg + '</div></div>'`
  - returns: HTML string

- signature: `function renderMetricRow(label, value, unit, colorKey)`
  - purpose: Render a single metric row with label and value
  - logic:
    1. var colorStyle = ''
    2. If colorKey is not null: colorStyle = ' style="color:var(--' + colorKey + ')"'
    3. Return string: `'<div class="analytics-metric"><div class="analytics-metric-value"' + colorStyle + '>' + value + '<span class="analytics-metric-unit">' + unit + '</span></div><div class="analytics-metric-label">' + label + '</div></div>'`
  - returns: HTML string

### 4. MODIFY index.html
- operation: MODIFY
- reason: Add analytics section HTML inside the sidebar, add script tag for caretaker-analytics.js

#### Change 1: Add analytics section HTML
- anchor: `</div>` closing tag of `<div class="chat-section" id="chat-section">` at line 98 (the `</div>` right before `</div>` of `#caretaker-sidebar`)
- After the closing `</div>` of `.chat-section` (line 98) and before the closing `</div>` of `#caretaker-sidebar` (line 99), insert:
```html
        <div class="analytics-section" id="analytics-section">
            <div class="analytics-section-header">
                <span class="analytics-section-title">Analytics</span>
                <button class="analytics-toggle-btn" id="analytics-toggle">Hide</button>
            </div>
            <div class="analytics-content" id="analytics-content"></div>
        </div>
```

#### Change 2: Add script tag
- anchor: `<script type="text/javascript" src="./js/caretaker-sidebar.js?v=17"></script>` at line 127
- After this line, insert: `    <script type="text/javascript" src="./js/caretaker-analytics.js?v=17"></script>`
- The new script loads after caretaker-sidebar.js and before caretaker-bridge.js.

### 5. MODIFY css/main.css
- operation: MODIFY
- reason: Add styles for the analytics section, sparkline charts, metric rows, toggle, and collapsed state
- anchor: `/* --- Hamburger toggle (hidden on desktop) --- */` at line 1274

#### Styles to insert
- Insert the following CSS block BEFORE the line `/* --- Hamburger toggle (hidden on desktop) --- */` at css/main.css:1274:

```css
/* --- Caretaker Analytics Panel --- */
.analytics-section {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    max-height: 50%;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(136, 146, 164, 0.3) transparent;
}

.analytics-section::-webkit-scrollbar {
    width: 6px;
}

.analytics-section::-webkit-scrollbar-track {
    background: transparent;
}

.analytics-section::-webkit-scrollbar-thumb {
    background: rgba(136, 146, 164, 0.3);
    border-radius: 3px;
}

.analytics-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem 0.75rem;
    flex-shrink: 0;
}

.analytics-section-title {
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 600;
}

.analytics-toggle-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-muted);
    font-size: 0.7rem;
    padding: 0.15rem 0.5rem;
    border-radius: var(--radius);
    cursor: pointer;
    font-family: system-ui, -apple-system, sans-serif;
}

.analytics-toggle-btn:hover {
    color: var(--text);
    border-color: var(--accent);
}

.analytics-content {
    padding: 0 0.75rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
}

.analytics-content.collapsed {
    display: none;
}

.analytics-metric {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
}

.analytics-score {
    align-items: center;
    padding: 0.5rem 0;
}

.analytics-score-value {
    font-size: 1.75rem;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
}

.analytics-metric-value {
    font-size: 1rem;
    font-weight: 600;
    color: var(--text);
    line-height: 1;
    font-variant-numeric: tabular-nums;
}

.analytics-metric-unit {
    font-size: 0.7rem;
    color: var(--text-muted);
    font-weight: 400;
    margin-left: 0.15rem;
}

.analytics-metric-label {
    font-size: 0.7rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.analytics-legend {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.65rem;
    margin-left: auto;
}

.analytics-legend-marker {
    display: inline-block;
    width: 8px;
    height: 3px;
    border-radius: 1px;
}

.analytics-sparkline-container {
    width: 100%;
    height: 40px;
    background: var(--bg);
    border-radius: var(--radius);
    padding: 0.25rem;
    box-sizing: border-box;
}

.analytics-sparkline-svg {
    width: 100%;
    height: 100%;
    display: block;
}

.analytics-sparkline-empty {
    font-size: 0.75rem;
    color: var(--text-muted);
    padding: 0.5rem 0;
    text-align: center;
}
```

## Verification
- build: No build step (vanilla JS project). Verify server starts: `cd /Users/name/homelab/flybrain && node server/caretaker.js` (should print `[caretaker] WebSocket server on port 7600` to stderr, then Ctrl-C)
- lint: No linter configured in project
- test: No existing tests
- smoke:
  1. Start server: `cd /Users/name/homelab/flybrain && node server/caretaker.js &`
  2. Test analytics/summary endpoint: `curl -s http://localhost:7600/analytics/summary` -- expect JSON with keys composite_score, total_feeds, avg_hunger, fear_incidents, avg_response_time, feeds_per_hour, connected_hours (values may be null/0 if DB is empty)
  3. Test analytics/hunger-timeline endpoint: `curl -s http://localhost:7600/analytics/hunger-timeline` -- expect JSON with keys observations (array) and feedMarkers (array)
  4. Kill server: `kill %1`
  5. Open index.html in browser with server running. Open the left sidebar. Verify the Analytics section appears below the chat section with a "Hide" toggle button. Click "Hide" to collapse, "Show" to expand. Metrics should display (or show fallback values if DB is empty).

## Constraints
- Do NOT modify SPEC.md, CLAUDE.md, TASKS.md, or any .buildloop/ files (other than this plan)
- Do NOT add any npm dependencies
- Do NOT modify caretaker-bridge.js -- analytics uses polling (setInterval), not WebSocket push
- Do NOT fix the buggy avg_response_time column in computeDailyScore() -- the analytics endpoint computes real response time dynamically from raw observation/action data instead
- Do NOT change the version query param (?v=17) on existing script/CSS tags -- only the new script tag uses ?v=17 to match the current version
- All CSS colors must use existing CSS custom properties (--bg, --surface, --border, --text, --text-muted, --accent, --success, --warning, --error). No hardcoded hex values in new styles except within var() references.
- All SVG marker/def IDs must be prefixed with 'analytics-' to avoid namespace collisions (pattern #7 from known patterns)
- The analytics panel must handle empty DB gracefully -- show "No data yet" or fallback values, never broken SVGs or NaN
