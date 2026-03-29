# Scout Report: T11.1

## Key Facts (read this first)

- **Stack**: Vanilla JS + HTML/CSS, no build step. Files are served directly. Cache-bust via `?v=N` query params. All currently at `v=22` (consistent).
- **Four files in scope**: `index.html`, `css/main.css`, `js/caretaker-sidebar.js`, `js/main.js`. Plus `js/caretaker-analytics.js` and `js/caretaker-calendar.js` need minor edits.
- **Tab infrastructure is complete**: HTML has correct `data-tab` / `data-tab-content` structure; CSS has `.sidebar-tab-content { display: none }` / `.active { display: flex }`; `initTabs()` in caretaker-sidebar.js switches panels correctly.
- **Two verified gaps** requiring code changes: (a) analytics/calendar fetch on page load instead of on tab activation; (b) no `@media (min-width: 1200px)` breakpoint at 260px exists in CSS.
- **Dead CSS to remove**: `.analytics-section-header`, `.analytics-section-title`, `.analytics-toggle-btn`, `.calendar-section-header`, `.calendar-section-title`, `.calendar-toggle-btn` -- these elements no longer exist in `index.html` (already removed from HTML; CSS not cleaned up).

---

## Relevant Files

| File | Role |
|------|------|
| `js/caretaker-sidebar.js` | Sheet state machine, `initTabs()`, close button, drag gesture. Primary edit target. |
| `css/main.css` | All layout/breakpoints. Needs 1200px query + dead CSS removal. |
| `js/caretaker-analytics.js` | Calls `refresh()` immediately in `init()` -- needs to defer until first tab activation. |
| `js/caretaker-calendar.js` | Calls `fetchAndRender()` immediately in `init()` -- needs to defer until first tab activation. |
| `js/main.js` | `activityToggle` / `sidebarToggle` / close-button wiring. Minor sync issue (see below). |
| `index.html` | HTML structure already correct. No header elements present. Cache-bust consistent at v=22. |

---

## Architecture Notes

**Sheet state machine** (`caretaker-sidebar.js:167-196`):
- `sheetState` variable: `'closed' | 'peek' | 'full'`
- `setSheetState(state)` removes both classes then adds the relevant one
- Desktop: `closed ↔ full` (no peek)
- Mobile: `closed → peek → full → closed` cycle via `toggle()`
- CSS: desktop sidebar uses `translateX(100%/0)`, mobile uses `translateY(100%/50%/0)`

**Tab switching** (`caretaker-sidebar.js:257-288`):
- `initTabs()` uses event delegation on `#sidebar-tabs`
- Correctly removes `active` from all tabs/panels, adds to clicked tab and matching content panel
- Updates header title to match tab name
- **Gap**: No `CaretakerAnalytics.refresh()` / `CaretakerCalendar.refresh()` call on tab activation

**Analytics init** (`caretaker-analytics.js:9-19`):
- Immediately calls `refresh()` on page load and sets a 30s interval
- `window.CaretakerAnalytics = { init, refresh }` is exposed globally

**Calendar init** (`caretaker-calendar.js:233-247`):
- Immediately calls `fetchAndRender()` on page load
- `window.CaretakerCalendar = { init, refresh: fetchAndRender }` is exposed globally

**Toggle wiring** (`main.js:508-547`):
- Desktop hamburger (`sidebarToggle`): calls `CaretakerSidebar.toggle()`, syncs `activityToggle.active`
- `activityToggle` button: calls `CaretakerSidebar.toggle()`, syncs its own `.active`
- Close button (`activityCloseBtn`): removes `.active` from `activityToggle` (main.js), ALSO calls `setSheetState('closed')` (caretaker-sidebar.js) -- both handlers fire correctly
- **Mobile**: hamburger on mobile opens `#left-panel` drawer only; `#activityToggle` is `display:none` on mobile; no toolbar trigger exists to open the caretaker-sidebar on mobile

**CSS breakpoints**:
- Default (desktop): `.caretaker-sidebar` at `right:0`, `width:360px`, `top:42px`, slide in from right
- `max-width: 768px`: becomes full-width bottom sheet with `height:85vh`, `translateY` transitions, safe-area padding-bottom
- `(orientation: landscape) and (max-height: 500px)`: reverts to right-side panel at `width:260px`
- **Missing**: `@media (min-width: 1200px)` with `width: 260px` -- task requires this

---

## Suggested Approach

**Fix 1 -- Tab-triggered fetches** (`caretaker-sidebar.js:initTabs`):
Add to the click handler after activating the panel:
```js
if (tabName === 'analytics' && typeof CaretakerAnalytics !== 'undefined') {
  CaretakerAnalytics.refresh();
}
if (tabName === 'calendar' && typeof CaretakerCalendar !== 'undefined') {
  CaretakerCalendar.refresh();
}
```
Also suppress the eager fetch in `caretaker-analytics.js` and `caretaker-calendar.js` on init (skip calling `refresh()`/`fetchAndRender()` immediately; let the first tab click trigger it). This avoids unnecessary requests on page load when the sidebar may never be opened.

**Fix 2 -- 1200px media query** (`css/main.css`):
Add after the existing desktop styles (before mobile `@media (max-width: 768px)`):
```css
@media (min-width: 1200px) {
    .caretaker-sidebar {
        width: 260px;
    }
}
```

**Fix 3 -- Dead CSS removal** (`css/main.css`):
Remove these blocks entirely (lines ~1344-1368 and ~1485-1514):
- `.analytics-section-header { display: none; }`
- `.analytics-section-title { ... }`
- `.analytics-toggle-btn { ... }` and `:hover`
- `.calendar-section-header { display: none; }`
- `.calendar-section-title { ... }`
- `.calendar-toggle-btn { ... }` and `:hover`

**Fix 4 -- Mobile trigger** (`main.js`):
On mobile, the hamburger (`sidebarToggle`) currently opens `#left-panel` drawer. There's no way to open the caretaker-sidebar bottom sheet. The simplest fix: on mobile, `sidebarToggle` should call `CaretakerSidebar.toggle()` (which cycles through closed/peek/full on mobile) instead of (or in addition to) the drawer toggle. This lets the drag-gesture states be reachable. Coordinate: the left-panel drawer can still open via a separate gesture or just leave it always visible at 120px on mobile.

---

## Risks and Constraints (read this last)

- **No build step**: Edits take effect immediately on page reload. No transpilation. ES5 syntax is used throughout (var, not let/const). Match this style.
- **Deferred init risk**: Suppressing eager fetch in analytics/calendar `init()` means the first tab click may have a brief loading moment. Acceptable UX tradeoff. Do not suppress the 30s interval in analytics -- keep it so data stays fresh while the tab is visible.
- **Double-registration of close button**: Both `caretaker-sidebar.js` and `main.js` add `click` listeners to `#caretaker-sidebar-close`. This is intentional -- each listener does a different thing (state machine vs button class sync). Do not consolidate.
- **`analyticsToggle` / `calendarToggle` getElementById returning null**: Both analytics/calendar modules call `getElementById('analytics-toggle')` / `getElementById('calendar-toggle')` -- these elements don't exist, silently get null, and the `if (toggle) addEventListener` guards prevent errors. Leave as-is (harmless dead code).
- **Width 360px vs 260px**: Current desktop sidebar is 360px (no breakpoint). At 1200px+ it should be 260px per task requirements. At <1200px desktop it stays 360px. This is a narrowing change -- verify no content overflow at 260px (chat input row, sparklines). The landscape query already uses 260px without reported issues.
- **`caretaker-analytics.js` 30s refresh timer**: Started in `init()` unconditionally. If analytics init is deferred to first tab click, the interval also starts on first tab click -- this is fine.
