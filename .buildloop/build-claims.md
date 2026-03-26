# Build Claims -- D2.2

## Files Changed
- [MODIFY] js/main.js -- Changed mouseup listener target from canvas to document (line 230) and touchend listener target from canvas to document (line 245) so releasing mouse/touch outside the canvas clears air-tool drag and wind state

## Verification Results
- Build: SKIPPED (vanilla JS project, no build step)
- Tests: SKIPPED (no existing tests)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: Line 230 of js/main.js reads `document.addEventListener('mouseup', handleCanvasMouseup, false);` (was `canvas.addEventListener`)
- [ ] Claim 2: Line 245 of js/main.js reads `document.addEventListener('touchend', function (event) {` (was `canvas.addEventListener`)
- [ ] Claim 3: No other lines in js/main.js were modified -- only the two addEventListener target elements changed from `canvas` to `document`
- [ ] Claim 4: The handleCanvasMouseup function body is unchanged -- it still sets isDragging=false, clears windArrowEnd, and schedules BRAIN.stimulate.wind=false via setTimeout(2000)
- [ ] Claim 5: mousedown and mousemove listeners remain on canvas (correct -- they only need canvas-scoped events)
- [ ] Claim 6: touchstart and touchmove listeners remain on canvas (correct -- only touchend needs document scope)
- [ ] Claim 7: No new variables, functions, or files were added

## Gaps and Assumptions
- No automated tests exist to verify the fix; manual browser testing required per the smoke test in the plan
- The touchend handler calls event.preventDefault() on the document level, which could theoretically interfere with other document-level touch interactions -- however, the existing code already did this on the canvas, and the handler only acts when isDragging is true (checked inside handleCanvasMouseup)
- Edge case: if the user never triggers mousedown on canvas but somehow triggers mouseup on document, handleCanvasMouseup will be called but isDragging will be false so it will no-op safely (existing guard at line 282)
