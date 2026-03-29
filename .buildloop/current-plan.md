# Plan: T11.1

## Dependencies
- list: [] (no new packages)
- commands: [] (no install commands)

## File Operations (in execution order)

### 1. MODIFY js/caretaker-analytics.js
- operation: MODIFY
- reason: Defer eager fetch on init; only start refresh cycle when tab is first activated

#### anchor: line 17 `refresh();`

#### Functions
- signature: `function init()` (existing, lines 9-19)
  - current logic: calls `refresh()` immediately on line 17, then starts 30s interval on line 18
  - change: Remove the immediate `refresh()` call on line 17. Remove the `refreshTimer = setInterval(refresh, REFRESH_INTERVAL);` on line 18. These will now be triggered on first tab activation instead.
  - exact edit: Replace lines 17-18:
    ```
    refresh();
    refreshTimer = setInterval(refresh, REFRESH_INTERVAL);
    ```
    with nothing (delete both lines). The `init()` function body after this edit should end with the `analyticsToggle` event listener block and then the closing `}`.

- Add a new function `activate` exposed on the global object:
  - signature: `function activate()`
  - purpose: Called once when the Analytics tab becomes active; triggers first fetch and starts the 30s auto-refresh interval
  - logic:
    1. Call `refresh()` to fetch data immediately
    2. If `refreshTimer` is null, set `refreshTimer = setInterval(refresh, REFRESH_INTERVAL)` to start the 30s cycle
  - returns: void

#### Wiring / Integration
- Change the module export on line 123 from:
  ```
  window.CaretakerAnalytics = { init: init, refresh: refresh };
  ```
  to:
  ```
  window.CaretakerAnalytics = { init: init, refresh: refresh, activate: activate };
  ```

### 2. MODIFY js/caretaker-calendar.js
- operation: MODIFY
- reason: Defer eager fetchAndRender on init; only fetch when tab is first activated

#### anchor: line 243 `fetchAndRender();`

#### Functions
- signature: `function init()` (existing, lines 233-244)
  - current logic: On line 243, calls `fetchAndRender()` immediately after setting up currentMonth
  - change: Remove the `fetchAndRender()` call on line 243. This will now be triggered on first tab activation.
  - exact edit: Delete line 243 (`fetchAndRender();`). The `init()` function body should end with `currentMonth.setHours(0, 0, 0, 0);` then the closing `}`.

- Add a new function `activate` exposed on the global object:
  - signature: `function activate()`
  - purpose: Called once when the Calendar tab becomes active; triggers initial fetch
  - logic:
    1. Call `fetchAndRender()` to load calendar data
  - returns: void

#### Wiring / Integration
- Change the module export on line 247 from:
  ```
  window.CaretakerCalendar = { init: init, refresh: fetchAndRender };
  ```
  to:
  ```
  window.CaretakerCalendar = { init: init, refresh: fetchAndRender, activate: activate };
  ```

### 3. MODIFY js/caretaker-sidebar.js
- operation: MODIFY
- reason: Add tab-activation hooks that call analytics/calendar activate+refresh when their tab is selected

#### anchor: the block inside `initTabs()` click handler, specifically after line 280 `if (target) target.classList.add('active');`

#### Functions
- signature: `function initTabs()` (existing, lines 257-288)
  - current logic: Switches active class on tabs and panels, updates header title
  - change: After the line `if (target) target.classList.add('active');` (line 280) and before the header title update block (line 283), insert tab-activation data-fetch calls:
    ```js
    if (tabName === 'analytics' && typeof CaretakerAnalytics !== 'undefined') {
      CaretakerAnalytics.activate();
    }
    if (tabName === 'calendar' && typeof CaretakerCalendar !== 'undefined') {
      CaretakerCalendar.activate();
    }
    ```
  - These call `activate()` which handles first-fetch and starts the refresh timer (analytics) or fetches calendar data (calendar). Calling activate() multiple times is safe because the analytics activate() guards against re-starting the interval (checks `refreshTimer` is null), and calendar activate() simply re-fetches (which is desired behavior -- shows fresh data each time the tab is clicked).

### 4. MODIFY css/main.css
- operation: MODIFY
- reason: (a) Add @media (min-width: 1200px) breakpoint for 260px sidebar width, (b) remove dead CSS for analytics/calendar section headers

#### Part A: Add 1200px desktop breakpoint
- anchor: The closing `}` of `.caretaker-sidebar-handle { display: none; }` block at line 976, which is the last line before `.caretaker-sidebar-header {` at line 978. Insert the new media query AFTER the `.caretaker-sidebar.sheet-peek, .caretaker-sidebar.sheet-full` block (line 969-972) and BEFORE the `.caretaker-sidebar-handle` block (line 974). Actually, better placement: insert AFTER the base `.caretaker-sidebar` styles block and its `.sheet-peek/.sheet-full` and `.caretaker-sidebar-handle` blocks, but BEFORE the mobile `@media (max-width: 768px)` query.
- Exact placement: Insert the following block immediately after the closing `}` of `.caretaker-sidebar-handle { display: none; }` on line 976 and before `.caretaker-sidebar-header {` on line 978:

```css

@media (min-width: 1200px) {
    .caretaker-sidebar {
        width: 260px;
    }
}

```

#### Part B: Remove dead analytics CSS
- anchor: `.analytics-section-header {` at line 1344
- Remove the following 6 CSS rules entirely (lines 1344-1368):
  1. `.analytics-section-header { display: none; }` (lines 1344-1346)
  2. `.analytics-section-title { ... }` (lines 1348-1352)
  3. `.analytics-toggle-btn { ... }` (lines 1354-1363)
  4. `.analytics-toggle-btn:hover { ... }` (lines 1365-1368)
- The exact text to remove starts at `.analytics-section-header {` and ends at the closing `}` of `.analytics-toggle-btn:hover` (line 1368). The line after the removal should be `.analytics-content {` (currently line 1370).

#### Part C: Remove dead calendar CSS
- anchor: `.calendar-section-header {` at line 1485
- Remove the following 6 CSS rules entirely (lines 1485-1509):
  1. `.calendar-section-header { display: none; }` (lines 1485-1487)
  2. `.calendar-section-title { ... }` (lines 1489-1493)
  3. `.calendar-toggle-btn { ... }` (lines 1495-1504)
  4. `.calendar-toggle-btn:hover { ... }` (lines 1506-1509)
- The exact text to remove starts at `.calendar-section-header {` and ends at the closing `}` of `.calendar-toggle-btn:hover` (line 1509). The line after the removal should be `.calendar-content {` (currently line 1511).

### 5. MODIFY js/main.js
- operation: MODIFY
- reason: On mobile, the hamburger button should open the caretaker-sidebar bottom sheet (not just the left-panel drawer). Currently mobile hamburger only opens left-panel drawer, leaving no way to reach the caretaker sidebar on mobile.

#### anchor: lines 508-527, specifically the `if (sidebarToggle) {` block

#### Functions
- The existing sidebarToggle click handler (lines 508-527) currently does:
  - Mobile: toggles `#left-panel` drawer via `openDrawer()`/`closeDrawer()`
  - Desktop: calls `CaretakerSidebar.toggle()`
- Change the mobile branch to toggle the caretaker sidebar bottom sheet instead of (or in addition to) the left-panel drawer.
- Replace the mobile branch (lines 511-517):
  ```js
  if (isMobile()) {
      // On mobile, hamburger toggles bottom panel drawer
      if (leftPanel && leftPanel.classList.contains('drawer-open')) {
          closeDrawer();
      } else {
          openDrawer();
      }
  }
  ```
  with:
  ```js
  if (isMobile()) {
      // On mobile, hamburger toggles caretaker sidebar bottom sheet
      if (typeof CaretakerSidebar !== 'undefined') {
          CaretakerSidebar.toggle();
      }
  }
  ```
- This lets the hamburger button cycle through closed -> peek -> full -> closed on mobile via the existing sheet state machine in caretaker-sidebar.js. The drag handle gesture also remains functional for fine-grained control.

### 6. MODIFY index.html
- operation: MODIFY
- reason: Bump cache-bust version from v=22 to v=23 on all four changed files to force browser reload

#### anchor: `?v=22` on the relevant script/link tags

#### Changes
- Line 6: change `main.css?v=22` to `main.css?v=23`
- Line 146: change `main.js?v=22` to `main.js?v=23`
- Line 148: change `caretaker-sidebar.js?v=22` to `caretaker-sidebar.js?v=23`
- Line 149: change `caretaker-analytics.js?v=22` to `caretaker-analytics.js?v=23`
- Line 150: change `caretaker-calendar.js?v=22` to `caretaker-calendar.js?v=23`
- All other `?v=22` references (lines 139-145, 147, 151) remain at v=22 since those files are not modified by this task. Only bump versions for files that actually changed.

NOTE: On reflection, to keep cache-bust versions consistent (as the task requires), bump ALL script/link tags from v=22 to v=23. This is simpler and prevents confusion about which files are at which version. Change every `?v=22` to `?v=23` across all lines (6, 139-151).

## Verification
- build: N/A (no build step -- vanilla JS served directly)
- lint: N/A (no linter configured)
- test: N/A (no existing tests for frontend)
- smoke: Open `index.html` in a browser and verify:
  1. Desktop (>1200px viewport): sidebar appears on right at 260px width when activity toggle or hamburger is clicked
  2. Desktop (<1200px viewport): sidebar appears at 360px width
  3. Click each of the 4 tabs (Activity, Chat, Analytics, Calendar) -- each should show its content panel and hide the others
  4. When clicking Analytics tab, network panel should show fetch requests to `/analytics/summary` and `/analytics/hunger-timeline` (confirming deferred fetch works)
  5. When clicking Calendar tab, network panel should show fetch request to `/calendar/scores` (confirming deferred fetch works)
  6. Mobile viewport (<=768px): hamburger button cycles bottom sheet through peek -> full -> closed states
  7. Mobile: drag the sheet handle up/down to transition between peek/full/closed
  8. Mobile: bottom sheet respects safe-area-inset-bottom (visible padding at bottom on iOS)
  9. Close button (X) closes sidebar on both desktop and mobile
  10. View page source: all `?v=` params are `v=23`
  11. CSS: no `.analytics-section-header`, `.analytics-section-title`, `.analytics-toggle-btn`, `.calendar-section-header`, `.calendar-section-title`, `.calendar-toggle-btn` rules remain

## Constraints
- Do NOT modify SPEC.md, CLAUDE.md, TASKS.md, or any file in .buildloop/ (except this plan)
- Do NOT add `let` or `const` -- the codebase uses `var` exclusively (ES5 style)
- Do NOT add new npm dependencies
- Do NOT remove or consolidate the dual close-button listeners (one in caretaker-sidebar.js, one in main.js) -- they are intentional
- Do NOT modify the 30s refresh interval logic in caretaker-analytics.js beyond deferring its start
- Do NOT touch files outside the scope: index.html, css/main.css, js/caretaker-sidebar.js, js/caretaker-analytics.js, js/caretaker-calendar.js, js/main.js
- The `analyticsToggle` / `calendarToggle` getElementById calls that return null in analytics/calendar modules are harmless dead code -- leave them as-is
