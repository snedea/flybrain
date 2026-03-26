# Plan: D1.3

## Dependencies
- list: none
- commands: none

## Context

The `#drive-meters` container has 6 rows (1 State + 5 drive bars) inside `#bottom-panel` which has `height: 90px` and `padding: 0.5rem 1rem`. The usable content height is 90 - 2*8 = 74px. But 6 rows at ~14px each + 5 gaps of 0.4rem (~6.4px) = ~116px, causing overflow that clips the Groom meter.

**Strategy**: Reduce gap, bar height, line-height, and vertical padding so all 6 rows fit within the 90px panel. This avoids changing the panel height and avoids any JS changes (the `innerHeight - 90` constants remain correct).

**Math**: With gap `0.15rem` (2.4px), bar height `6px`, line-height `1`, padding `0.25rem` top/bottom (4px each):
- Content space: 90 - 8 = 82px
- Row height: max(0.7rem * 1.0, 6px) = 11.2px
- Total: 6 * 11.2 + 5 * 2.4 = 67.2 + 12 = 79.2px
- Margin: 2.8px to spare

No HTML changes. No JS changes.

## File Operations (in execution order)

### 1. MODIFY css/main.css
- operation: MODIFY
- reason: Reduce drive meter row/gap/padding sizing so all 6 rows fit within the 90px bottom panel without overflow

#### Change A: Reduce bottom panel vertical padding
- anchor: `padding: 0.5rem 1rem;` (inside `#bottom-panel` rule at line 152)
- action: Change `padding: 0.5rem 1rem;` to `padding: 0.25rem 1rem;`

#### Change B: Reduce drive-meters gap
- anchor: `gap: 0.4rem;` (inside `#drive-meters` rule at line 177)
- action: Change `gap: 0.4rem;` to `gap: 0.15rem;`

#### Change C: Add line-height to drive-row
- anchor: `gap: 0.5rem;` (inside `.drive-row` rule at line 183)
- action: Add `line-height: 1;` after `gap: 0.5rem;` inside the `.drive-row` rule

#### Change D: Reduce drive bar height
- anchor: `height: 8px;` (inside `.drive-bar-bg` rule at line 197)
- action: Change `height: 8px;` to `height: 6px;`

## Verification
- build: No build step (vanilla HTML/CSS/JS)
- lint: No linter configured
- test: No automated tests
- smoke: Open `index.html` in a browser. Verify that all 6 rows in the bottom-right drive meters panel are fully visible: State, Hunger, Fear, Fatigue, Curiosity, and Groom. None should be clipped or hidden by overflow. The bottom panel should not visually change its overall height (remains 90px). The fly should still be unable to walk behind the bottom panel (the `innerHeight - 90` bound is unchanged).

## Constraints
- Do NOT modify index.html
- Do NOT modify js/main.js -- the panel height stays at 90px so the `innerHeight - 90` Y-bound constants remain correct
- Do NOT change the panel height (`height: 90px` on `#bottom-panel`)
- Do NOT add `overflow: auto` or scrollbars to the drive meters
- Do NOT change the width of `#drive-meters` (stays at 180px)
- Do NOT change colors or visual identity of the drive bars
- Do NOT restructure the HTML layout (no 2-column grid) -- pure CSS sizing adjustments only
