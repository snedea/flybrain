# Build Claims -- T8.9

## Files Changed
- [MODIFY] server/db.js -- Added getDailyScores(startDate, endDate) and getActivityForDate(dateStr, limit) methods
- [MODIFY] server/caretaker.js -- Added GET /calendar/scores, GET /calendar/day-activity, and GET /activity/recent endpoints
- [CREATE] js/caretaker-calendar.js -- New IIFE module implementing calendar grid view with month navigation, color-coded day cells, and day-click filtering of the activity feed
- [MODIFY] index.html -- Added calendar-section HTML inside #caretaker-sidebar (after analytics-section) and script tag for caretaker-calendar.js
- [MODIFY] css/main.css -- Added calendar grid styles (.calendar-section, .cal-grid, .cal-cell color classes, .cal-nav, .cal-details, etc.)

## Verification Results
- Build: PASS (`node -e "require('./server/db.js')"` -- no syntax errors)
- Tests: SKIPPED (no test framework configured)
- Lint: SKIPPED (no linter configured)
- Smoke: PASS (all 5 endpoint tests passed via curl)
  - `curl 'http://localhost:7600/calendar/scores?start=2026-01-01&end=2026-03-27'` returned JSON array (200)
  - `curl 'http://localhost:7600/calendar/day-activity?date=2026-03-27'` returned JSON array (200)
  - `curl 'http://localhost:7600/activity/recent'` returned JSON array with real data (200)
  - `curl 'http://localhost:7600/calendar/day-activity'` returned `{"error":"date parameter required"}` (400)
  - `curl 'http://localhost:7600/calendar/scores'` returned data with default 28-day range (200)

## Claims
- [ ] getDailyScores(startDate, endDate) queries daily_scores table with date range filter and returns rows with date, composite_score, total_feeds, avg_hunger, fear_incidents
- [ ] getActivityForDate(dateStr, limit) returns union of actions and incidents for a single calendar day (using T00:00:00.000Z to T23:59:59.999Z range), ordered by timestamp DESC
- [ ] GET /calendar/scores accepts optional start and end query params, defaults to 28 days ago through today
- [ ] GET /calendar/day-activity requires date query param, returns 400 with error message if missing
- [ ] GET /activity/recent returns last 50 activity entries (used for restoring full feed after day deselection)
- [ ] Calendar JS module renders a 7-column grid with Su-Sa headers, empty padding cells for first-day offset, and day cells with score/details
- [ ] Day cells are color-coded: green (score > 80), yellow (50-80), red (< 50), nodata (no score)
- [ ] Each scored day cell shows: day number, rounded composite score, incident count (Ni), feed count (Nf), avg hunger (N.Nh)
- [ ] Month navigation (prev/next buttons) re-fetches scores and re-renders the grid
- [ ] Clicking a day cell adds cal-selected class and calls filterFeedToDate which replaces activity feed content with that day's entries
- [ ] Clicking the same selected day deselects it and calls restoreFullFeed which fetches /activity/recent and rebuilds the feed
- [ ] Toggle button (Hide/Show) adds/removes collapsed class on calendar-content
- [ ] Calendar section is placed in index.html after analytics-section and before the closing sidebar div
- [ ] Script tag loads after caretaker-analytics.js and before caretaker-bridge.js
- [ ] All CSS colors use CSS custom properties (--text, --bg, --border, --accent, etc.) except rgba transparency values for cell backgrounds

## Gaps and Assumptions
- Browser-side JS (caretaker-calendar.js) was not tested in an actual browser; only server endpoints were smoke-tested via curl
- The buildEntryEl function in caretaker-calendar.js duplicates entry rendering logic from caretaker-sidebar.js rather than sharing it (as planned, since CaretakerSidebar doesn't expose createEntryEl)
- If daily_scores table has no rows for a month, all cells show as cal-nodata with no score/details (correct behavior but not visually tested)
- The onCellClick delegation listener is bound once in init(), not per-render, avoiding duplicate handler accumulation on month navigation
- No existing script version tags were modified (only new file uses v=17)
