# Build Claims -- D8.1

## Files Changed
- [MODIFY] js/main.js -- Added drag state resets (isDragging, dragToolOrigin, windArrowEnd) and food feedStart timestamp resets to the visibilitychange resume branch (lines 263-274)

## Verification Results
- Build: PASS (no build step; vanilla JS project loaded via index.html)
- Tests: SKIPPED (no test suite exists)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: The visibilitychange resume branch (else block starting at line 252) now sets isDragging=false, dragToolOrigin=null, and windArrowEnd=null immediately after the timer resets (touchResetTime, windResetTime) and before the drive snapshot restoration
- [ ] Claim 2: The visibilitychange resume branch now iterates food[] and for any item with feedStart !== 0, resets feedStart to 0 and radius to 10, placed after drag state resets and before drive snapshot restoration
- [ ] Claim 3: The drag state reset block uses the exact same variable names declared at main.js:93 (isDragging), main.js:27 (dragToolOrigin), and main.js:40 (windArrowEnd)
- [ ] Claim 4: The food feedStart reset loop uses the same pattern as the existing D5.1 reset at main.js:498-499 (check feedStart !== 0, reset feedStart to 0, restore radius to 10)
- [ ] Claim 5: No new global variables were introduced; only existing variables are referenced
- [ ] Claim 6: No other files were modified; change is confined to a single insertion in js/main.js
- [ ] Claim 7: The drive snapshot restoration remains the last state-fixup step before lastTime reset and brain tick restart

## Gaps and Assumptions
- No automated tests exist to verify the fix; verification requires manual smoke testing (drag mid-hide, feed mid-hide scenarios)
- Assumes radius=10 is always the correct "full size" reset value for food items (matches the value used in food.push at line 321 and the D5.1 reset pattern)
- The loop variable `fi` does not shadow the existing `fi` at line 496 because they are in separate function scopes (visibilitychange handler vs update function)
