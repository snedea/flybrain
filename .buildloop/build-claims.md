# Build Claims -- D17.1

## Files Changed
- MODIFY js/education.js -- Fix two data display bugs: "~70" -> "59" group count in two places, and VNC/Motor neuron group count now includes MN_ prefix neurons

## Verification Results
- Build: PASS (no build step -- vanilla JS project)
- Tests: PASS (`node tests/run-node.js` -- 45 passed / 0 failed / 45 total)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: Line 131 intro paragraph now says "59 functional neuron groups" instead of "~70 functional neuron groups"
- [ ] Claim 2: Line 215 "What's Missing" section now says "Our 59-group model" instead of "Our 70-group model"
- [ ] Claim 3: Line 157 adds `var mnGroupCount = 0;` counter variable initialized to zero
- [ ] Claim 4: Line 167 increments `mnGroupCount++` inside the MN_ prefix loop (same condition block that sums populations)
- [ ] Claim 5: Line 173 displays `(region.neurons.length + mnGroupCount)` instead of `region.neurons.length` in the population div, so VNC/Motor shows 17 (6 static + 11 MN_ dynamic) instead of 6
- [ ] Claim 6: No other files were modified; no new files were created
- [ ] Claim 7: The population sum calculation logic is unchanged -- only the display count was fixed
- [ ] Claim 8: All 45 existing tests pass after the change

## Gaps and Assumptions
- The exact count of 11 MN_ prefix neurons (yielding 6+11=17) depends on BRAIN.postSynaptic containing exactly 11 MN_ keys at runtime; the code dynamically counts them so any change to the connectome data will be reflected automatically
- Smoke test (opening index.html in browser) was not performed -- only automated node tests were run
