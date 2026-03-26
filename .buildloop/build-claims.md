# Build Claims -- T6.2

## Files Changed
- [CREATE] js/education.js -- New module containing EducationPanel with educational content, SVG signal flow diagram, region highlight integration, and all panel show/hide/toggle logic
- [MODIFY] index.html -- Added "Learn" toolbar button, education panel HTML container, and education.js script tag (after brain3d.js, before main.js)
- [MODIFY] js/main.js -- Added Learn button click handler toggling EducationPanel and active class, plus outside-click-to-close listener for education panel
- [MODIFY] css/main.css -- Appended all education panel styles: sidebar layout, section formatting, neuron tags, type badges, region links, signal flow SVG, list styles, and external link styles

## Verification Results
- Build: PASS (no build step -- vanilla JS project)
- Tests: PASS (`node tests/run-node.js` -- 45 passed / 0 failed / 45 total)
- Lint: SKIPPED (no linter configured)
- Syntax: PASS (`node -c js/education.js` and `node -c js/main.js` both OK)

## Claims
- [ ] A "Learn" button (`<button class="tool-btn" id="learnBtn">Learn</button>`) exists in the toolbar between "Brain 3D" and "?" buttons
- [ ] Clicking "Learn" opens a fixed right-side panel (380px wide, z-index 25) titled "Brain Guide"
- [ ] The panel contains an introduction section ("What is this?") explaining the 70-group model, ~130K neurons, ~50M connections, and what a connectome is
- [ ] 10 brain region sections exist: Optic Lobes, Antennal Lobes, Mushroom Bodies, Central Complex, Lateral Horn, Subesophageal Zone, VNC / Motor, Thermosensory, Mechanosensory, Drives
- [ ] Each region section includes: plain-language explanation, real-world analogy (italic), "Try it" interaction hint, neuron group tags (monospace), and population estimate
- [ ] Each region section has a type badge (sensory/central/motor/drives) with color-coded styling using CSS custom properties
- [ ] Region names are clickable (`edu-region-link` class with `data-region` attribute) and call `EducationPanel.highlightRegion()` via delegated click handler
- [ ] `highlightRegion()` temporarily boosts emissiveIntensity to 1.5 and opacity to 0.9 on matching Brain3D region meshes, restoring after 1200ms
- [ ] VNC / Motor section collects additional MN_ prefixed neurons from `BRAIN.postSynaptic` via `collectMNPrefix: true`
- [ ] "Signal Flow" section contains an inline SVG diagram (viewBox 0 0 600 200) with three boxes (Sensory Input blue, Central Processing purple, Motor Output red), connecting arrows, and a Drives box with dashed upward arrow
- [ ] "What's Missing" section lists 5 simplifications: individual neuron dynamics, synaptic plasticity, neuromodulator diffusion, electrical synapses, approximate weights
- [ ] "Learn More" section has 4 links (FlyWire Codex, Dorkenwald 2024 paper, Virtual Fly Brain, worm-sim) all with target="_blank" rel="noopener noreferrer"
- [ ] Close button (x) and clicking outside the panel both close it and remove the active class from the Learn button
- [ ] The Learn button gets/loses the `active` CSS class when panel opens/closes
- [ ] education.js uses IIFE pattern (no global scope pollution except `window.EducationPanel`)
- [ ] education.js script tag is ordered after brain3d.js and before main.js in index.html
- [ ] All CSS uses custom properties (--surface, --border, --text, etc.) except SVG inline colors which use the same palette hex values
- [ ] Only allowed shadow (`0 1px 3px rgba(0,0,0,0.3)`) and transitions (`property 0.2s ease`) are used
- [ ] Panel scrolls via `overflow-y: auto` on `.education-content`

## Gaps and Assumptions
- Browser smoke test not possible in headless environment; all structural and syntactic verification passed
- `highlightRegion` depends on Brain3D being initialized with `_regions` array populated; gracefully no-ops if Brain3D is unavailable or inactive
- The `collectMNPrefix` feature for VNC/Motor depends on `BRAIN.postSynaptic` being defined at panel init time (it is, since connectome.js loads before education.js)
- `.closest()` used in delegated click handler requires IE Edge+ (not IE11), consistent with project's existing use of modern JS features
