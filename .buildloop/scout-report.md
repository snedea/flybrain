# Scout Report: T8.8

## Key Facts (read this first)

- **Tech stack**: Vanilla JS (no build step), Node.js WebSocket server (`server/caretaker.js`), SQLite via better-sqlite3 (`server/db.js`). No npm packages on the frontend -- all plain `<script>` tags.
- **`js/caretaker-analytics.js` does not exist** -- must be created as a new file following the IIFE pattern used in `caretaker-sidebar.js`.
- **Sidebar HTML lives in `index.html`** and is laid out as a flex column: header -> `.activity-feed` -> `.chat-section`. Analytics panel must be appended after `.chat-section` inside `#caretaker-sidebar`.
- **`avg_response_time` in `daily_scores` is currently bogus** -- `computeDailyScore()` stores `forgotIncidents` (a count) in that field, not an actual time. The analytics endpoint will need to compute real response time dynamically from DB, or document this gap.
- **CSS version query param is `?v=17`** -- the new analytics script tag must use `?v=18` (or match whatever bump is applied to other assets) to avoid stale cache.

## Relevant Files

| File | Notes |
|------|-------|
| `js/caretaker-sidebar.js` | Pattern to follow for analytics IIFE -- init, fetch, render. Exposes `window.CaretakerSidebar`. |
| `server/caretaker.js` | HTTP server with existing GET/POST endpoints. New analytics endpoints go here. Pattern: sync `if (req.method === 'GET' && req.url === ...)` blocks. |
| `server/db.js` | Schema and query methods. `daily_scores` table has `composite_score, total_feeds, avg_hunger, fear_incidents, avg_response_time`. `observations` has per-row `hunger, fear, timestamp`. Needs new query methods for analytics. |
| `index.html` | Sidebar HTML structure, script load order. Add analytics section div + new `<script>` tag. Version param is `?v=17`. |
| `css/main.css` | CSS variables: `--bg`, `--surface`, `--border`, `--text`, `--text-muted`, `--accent` (#E3734B), `--radius`. Add sparkline + analytics panel styles in the Caretaker section (around line 951). |
| `js/caretaker-bridge.js` | Dispatches WebSocket messages to `CaretakerSidebar` -- if analytics needs real-time updates, a hook must be added here for `CaretakerAnalytics`. |

## Architecture Notes

**Sidebar layout**: `.caretaker-sidebar` is `display:flex; flex-direction:column`. `.activity-feed` has `flex:1` (takes remaining space). `.chat-section` is `flex-shrink:0; max-height:45%`. Analytics panel should be `flex-shrink:0` with a fixed or max-height, collapsible via a toggle (matching the expandable pattern in the task description).

**Data sources**:
- `GET /analytics/summary` -- today's `daily_scores` row + computed metrics (feeds today, avg hunger today, fear incidents today, avg response time). Returns JSON.
- `GET /analytics/hunger-timeline` -- last N observations (hunger + timestamp) + last N food actions (timestamp) for feed markers. Returns JSON.
- Both endpoints are simple synchronous SQLite reads -- no async needed in server code (better-sqlite3 is sync).

**Observations frequency**: `OBSERVATION_INTERVAL_MS = 10000` (10s). For a 24h chart that's up to ~8640 points; use last 100-200 for a readable sparkline (last ~30 minutes).

**Active hours (connected vs disconnected)**: No explicit connection log table. Infer from observation timestamp gaps > 60s = "disconnected". The endpoint can compute this from `observations` gaps.

**SVG sparklines**: Inline SVG `<polyline>` with `viewBox="0 0 W H"`. Map data values to SVG coordinates. Feed markers = vertical `<line>` elements at the corresponding x-position. No external library needed.

**Real-time updates**: Analytics can be polled (e.g. every 30s with `setInterval`) rather than pushed via WebSocket, since this is aggregate data not a live event stream. No change needed to `caretaker-bridge.js` for the initial implementation.

## Suggested Approach

1. **`server/db.js`**: Add two new query methods:
   - `getAnalyticsSummary(dateStr)` -- returns `daily_scores` row for date (or computes if missing), plus active connection estimate.
   - `getHungerTimeline(limit)` -- returns last N observations (timestamp, hunger) + last M place_food actions (timestamp) joined or separately.

2. **`server/caretaker.js`**: Add two new GET routes:
   - `GET /analytics/summary` -- calls `getAnalyticsSummary(today)`.
   - `GET /analytics/hunger-timeline` -- calls `getHungerTimeline(120)`.

3. **`js/caretaker-analytics.js`**: New IIFE file. On `init()`:
   - Find/bind DOM elements (analytics section, toggle, chart containers).
   - `fetch('/analytics/summary')` + `fetch('/analytics/hunger-timeline')`.
   - Render 6 metrics: score gauge, hunger sparkline with feed markers, fear incidents per hour bar, avg response time, feeding frequency, active hours.
   - `setInterval(refresh, 30000)` for live-ish updates.
   - Expose `window.CaretakerAnalytics = { init, refresh }`.

4. **`index.html`**: Add `.analytics-section` div after `.chat-section` inside `#caretaker-sidebar`. Add `<script src="./js/caretaker-analytics.js?v=18">`.

5. **`css/main.css`**: Add styles for `.analytics-section`, `.analytics-toggle`, `.sparkline-container`, `.metric-row`, `.metric-value`, `.metric-label`. Keep the dark theme using existing CSS variables.

## Risks and Constraints (read this last)

- **`avg_response_time` is currently wrong** in `daily_scores` (stores `forgotIncidents` count, not seconds). Need to decide: (a) fix `computeDailyScore()` to compute real response time, or (b) compute it on-the-fly in the analytics endpoint. Option (b) is safer -- avoids touching the scheduled score computation and migration concerns. The real computation: for each `place_food` action, find the most recent observation where `hunger > 0.7` before it, compute delta in seconds.
- **Sidebar height**: The sidebar is `bottom: 180px` on desktop (leaves room for the left panel at the bottom). Adding a 3rd section risks making the sidebar too tall for small screens. Use `max-height` + `overflow-y: hidden` on the analytics panel with a collapse toggle.
- **Empty database**: On first run with no data, all analytics will be zero/null. The renderer must handle null/empty gracefully (show "No data yet" placeholder, not a broken SVG).
- **Version bump**: `index.html` uses `?v=17` on all asset URLs. The new script tag needs `?v=18` (or increment all to v=18 in the same commit to avoid mixed cache state).
- **Script load order**: `caretaker-analytics.js` should load after `caretaker-sidebar.js` and before `caretaker-bridge.js` (or after -- analytics doesn't depend on bridge events for initial load).
