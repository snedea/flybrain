# Build Claims -- T11.1

## Files Changed
- [MODIFY] js/caretaker-analytics.js -- Deferred eager fetch from init(); added activate() function that triggers first fetch and starts 30s refresh interval on first tab activation; exported activate on window.CaretakerAnalytics
- [MODIFY] js/caretaker-calendar.js -- Removed eager fetchAndRender() call from init(); added activate() function that calls fetchAndRender(); exported activate on window.CaretakerCalendar
- [MODIFY] js/caretaker-sidebar.js -- Added tab-activation hooks in initTabs() click handler: calls CaretakerAnalytics.activate() when analytics tab selected, CaretakerCalendar.activate() when calendar tab selected
- [MODIFY] js/main.js -- Changed mobile hamburger button handler from toggling left-panel drawer to toggling caretaker sidebar bottom sheet via CaretakerSidebar.toggle()
- [MODIFY] css/main.css -- Added @media (min-width: 1200px) breakpoint setting .caretaker-sidebar width to 260px; removed 4 dead CSS rules: .analytics-section-header, .analytics-section-title, .analytics-toggle-btn, .analytics-toggle-btn:hover, .calendar-section-header, .calendar-section-title, .calendar-toggle-btn, .calendar-toggle-btn:hover
- [MODIFY] index.html -- Bumped all cache-bust versions from v=22 to v=23 (14 occurrences across CSS and JS tags)

## Verification Results
- Build: PASS (no build step -- vanilla JS served directly)
- Tests: SKIPPED (no existing tests for frontend)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Analytics data is NOT fetched on page load; init() no longer calls refresh() or starts the interval timer
- [ ] Analytics data IS fetched when clicking the Analytics tab via CaretakerAnalytics.activate(), which calls refresh() and starts the 30s setInterval
- [ ] Analytics activate() guards against duplicate intervals by checking refreshTimer === null before creating a new setInterval
- [ ] Calendar data is NOT fetched on page load; init() no longer calls fetchAndRender()
- [ ] Calendar data IS fetched when clicking the Calendar tab via CaretakerCalendar.activate(), which calls fetchAndRender()
- [ ] All four tabs (Activity, Chat, Analytics, Calendar) switch content panels via classList.add/remove('active') in initTabs()
- [ ] Mobile hamburger button (sidebarToggle) now calls CaretakerSidebar.toggle() which cycles closed -> peek -> full -> closed via setSheetState()
- [ ] Desktop hamburger button still calls CaretakerSidebar.toggle() and syncs activityToggle button active class
- [ ] Close button (#caretaker-sidebar-close) calls setSheetState('closed') in caretaker-sidebar.js (unchanged, already correct)
- [ ] Desktop viewport >= 1200px: sidebar width is 260px via new @media query
- [ ] Desktop viewport < 1200px: sidebar width remains 360px (base style)
- [ ] All 8 dead CSS rules for analytics/calendar section headers and toggle buttons are removed from main.css
- [ ] All cache-bust versions in index.html are consistently v=23
- [ ] No new `let` or `const` keywords introduced -- all new code uses `var` (ES5 style)

## Gaps and Assumptions
- Sheet drag gesture (touchstart/touchend on #sheet-handle) and safe-area-inset-bottom padding were NOT modified and assumed to already work correctly from prior implementation
- The activityToggle button's active class is not synced when using the mobile hamburger toggle (only synced on desktop branch) -- this matches the plan which only changes the mobile branch
- Cannot verify live network requests (fetch to /analytics/summary etc.) without a running backend server
- The dual close-button listeners (one in caretaker-sidebar.js, one in main.js) were intentionally left as-is per plan constraints
