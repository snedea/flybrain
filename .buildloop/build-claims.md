# Build Claims -- D68.3

## Files Changed
- [MODIFY] js/neuro-renderer.js -- Extracted 4 pure functions (computeSectionLayout, needsResize, cssToCanvasCoords, computeLabelMaxWidths) from the IIFE; refactored buildLayout() and handleResize() to call the extracted functions; added _test export block gated on BRAIN._testMode
- [MODIFY] tests/run-node.js -- Added window global stub for IIFE compatibility; added js/neuro-renderer.js to the moreFiles load list
- [MODIFY] tests/tests.js -- Added 11 test functions covering all 6 D68.3 checklist items, guarded by NeuroRenderer._test availability

## Verification Results
- Build: PASS (no build step -- vanilla JS)
- Tests: PASS (node tests/run-node.js -- 99 passed / 0 failed / 99 total)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] computeSectionLayout is a pure function that takes regionCounts array and container dimensions, returns sections with x0/x1/sectionW/pointSize/localRows/neuronCount, canvasWidth, canvasHeight, displayScale, and rowsAvail
- [ ] computeSectionLayout produces numerically identical layout results to the original inline code in buildLayout() -- same algorithm, same variable names, same computation order
- [ ] buildLayout() now calls computeSectionLayout() and uses its return value to drive neuron positioning and GL buffer creation
- [ ] needsResize is a pure function that returns true when height changes OR when width delta >= 2 (accounting for displayScale)
- [ ] handleResize() now calls needsResize() instead of inlining the check
- [ ] cssToCanvasCoords is a pure function that converts CSS client coordinates to canvas pixel coordinates, accounting for rect offset, scroll, and CSS stretch ratio
- [ ] cssToCanvasCoords is standalone (not wired into onMouseMove) -- the existing inline code in onMouseMove is untouched for performance
- [ ] computeLabelMaxWidths is a pure function that computes max CSS widths for section labels, skipping empty sections and applying displayScale
- [ ] computeLabelMaxWidths is standalone (not wired into buildLabels) -- existing buildLabels code is untouched
- [ ] NeuroRenderer._test is only set when BRAIN._testMode is true, exposing all 4 functions and 6 constants
- [ ] neuro-renderer.js IIFE loads cleanly in Node without DOM/WebGL errors (no DOM calls at module level)
- [ ] 11 new test functions follow the existing var test_* naming convention and are auto-discovered by runAllTests()
- [ ] Tests are guarded by if (typeof NeuroRenderer !== 'undefined' && NeuroRenderer._test) so they are skipped if the module fails to load
- [ ] No changes to vertex shader, fragment shader, or any WebGL rendering code
- [ ] No changes to the visual output or behavior of neuro-renderer.js in the browser

## Gaps and Assumptions
- computeLabelMaxWidths is not wired into buildLabels() -- it's a standalone pure function for testability only; the existing buildLabels code was not refactored to call it (per plan: "No need to refactor ... purely for testability")
- cssToCanvasCoords is not wired into onMouseMove -- same rationale as above
- The test for checklist item 5 (high-DPI crisp points via image-rendering:pixelated) is CSS-only and not tested here -- it requires browser rendering verification
- The test for checklist item 3 (label truncation with ellipsis) tests the max-width computation but not the actual CSS text-overflow:ellipsis rendering
- The plan expected 80 total tests (69 + 11) but the actual count is 99 (88 existing + 11 new) -- more tests were added in prior tasks than the plan accounted for
