# Build Claims -- T6.3

## Files Changed
- MODIFY js/main.js -- Added neuronPopulations data structure (59 groups with FlyWire neuron counts), enhanced connectome dot tooltip with population counts, and injected "59 groups / ~130K neurons" summary into connectome panel header
- MODIFY js/brain3d.js -- Added per-region population total line to 3D brain hover tooltip showing "N groups representing ~X neurons"
- MODIFY js/education.js -- Replaced hardcoded populationEstimate display with dynamically computed totals from neuronPopulations, with fallback to original strings

## Verification Results
- Build: PASS (no build step — static HTML/JS project)
- Tests: PASS (node tests/run-node.js — 45 passed / 0 failed / 45 total)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Claim 1: `neuronPopulations` is declared as a `var` at module scope in js/main.js with 59 entries mapping neuron group IDs to approximate real neuron counts
- [ ] Claim 2: The connectome dot panel tooltip (mouseover on `.brainNode` elements) appends " — represents ~N neurons" with locale-formatted count from neuronPopulations, or empty string if no entry exists
- [ ] Claim 3: An IIFE after the connectome node loop creates a `<span class="connectome-summary">` displaying "59 groups / ~130K neurons" and inserts it after the `.connectome-label` element in the DOM
- [ ] Claim 4: In brain3d.js `_onMouseMove`, before building the tooltip HTML, `regionPopTotal` is computed by summing `neuronPopulations` for all neurons in the hovered region; if > 0, a `<div class="b3d-tip-pop">` line is inserted between the description and the type badge
- [ ] Claim 5: In education.js `_buildContent`, each region's population display is computed dynamically from `neuronPopulations` (including MN_ prefix collection for VNC/Motor region); falls back to `region.populationEstimate` if `neuronPopulations` is undefined or total is 0
- [ ] Claim 6: No changes made to index.html, css/main.css, js/constants.js, or js/connectome.js
- [ ] Claim 7: The `populationEstimate` field in EDUCATION_REGIONS is preserved as fallback — not removed
- [ ] Claim 8: The existing `neuronDescriptions` object is unchanged

## Gaps and Assumptions
- The "~130K" in the summary header is intentionally hardcoded per plan spec (refers to total Drosophila brain neuron count, not the sum of neuronPopulations)
- Smoke testing in a browser was not performed (headless environment); verification is limited to Node.js test suite passing
- The `NOCI`, `GNG_DESC`, and `CLOCK_DN` entries in neuronPopulations are not referenced by any region in brain3d.js or education.js EDUCATION_REGIONS, but they exist in the data structure for completeness per the plan
