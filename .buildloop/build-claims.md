# Build Claims -- T6.1

## Files Changed
- [CREATE] js/brain3d.js -- New Brain3D module: Three.js 3D brain visualization with 10 neuropil regions, raycasting tooltips, live connectome activation mapping
- [MODIFY] index.html -- Added Three.js CDN scripts (r158), brain3d.js script tag, Brain 3D toggle button, overlay container div, tooltip div
- [MODIFY] js/main.js -- Added Brain3D.init() call after BRAIN.setup(), Brain 3D button click handler, Brain3D.update() call in main loop
- [MODIFY] css/main.css -- Added styles for brain3d overlay panel, tooltip, and tooltip inner elements (tip-name, tip-desc, tip-type, tip-neurons, tip-neuron)

## Verification Results
- Build: PASS (no build step — CDN-only project)
- Tests: SKIPPED (no test runner configured)
- Lint: PASS (node --check js/brain3d.js && node --check js/main.js — both passed with no errors)

## Claims
- [ ] Claim 1: index.html loads Three.js r0.158.0 via CDN (three.min.js and OrbitControls.js) before all project scripts
- [ ] Claim 2: Script load order is: three.min.js → OrbitControls.js → constants.js → connectome.js → fly-logic.js → brain3d.js → main.js
- [ ] Claim 3: A "Brain 3D" toggle button exists in toolbar-left (id="brain3dBtn", aria-pressed="false"), positioned before the help button, with NO data-tool attribute
- [ ] Claim 4: div#brain3d-overlay and div#brain3d-tooltip exist in index.html after the canvas element, both initially display:none
- [ ] Claim 5: js/brain3d.js is an IIFE that exposes window.Brain3D with methods: init, show, hide, toggle, update, _buildRegions, _renderLoop, _onMouseMove, _onResize
- [ ] Claim 6: Brain3D.init() creates a Three.js scene with background 0x0a0a1a, PerspectiveCamera(55, ..., 0.1, 100) at position(0,6,10), WebGLRenderer with antialias, OrbitControls with damping, ambient light + 2 point lights
- [ ] Claim 7: 10 brain regions are defined matching the plan: Optic Lobes, Antennal Lobes, Mushroom Bodies, Central Complex, Lateral Horn, Subesophageal Zone, VNC/Motor, Thermosensory, Mechanosensory, Drives
- [ ] Claim 8: Region colors match: sensory=0x3b82f6 (blue), central=0x8b5cf6 (purple), drives=0xf59e0b (amber), motor=0xef4444 (red)
- [ ] Claim 9: All meshes use MeshStandardMaterial with transparent:true, depthWrite:false, opacity:0.3 base, emissiveIntensity:0 base
- [ ] Claim 10: VNC/Motor region dynamically collects all MN_* prefixed neurons from BRAIN.postSynaptic (collectMNPrefix flag)
- [ ] Claim 11: Brain3D.update() reads BRAIN.postSynaptic[neuronName][BRAIN.thisState], averages per region, normalizes by ACTIVATION_DIVISOR=80, maps to opacity 0.3-0.8 and emissiveIntensity 0.0-1.0
- [ ] Claim 12: Raycasting via _onMouseMove shows tooltip with region name, description, type, and per-neuron activation percentages using neuronDescriptions global (with typeof guard)
- [ ] Claim 13: Tooltip clamping logic prevents overflow past right edge (260px threshold) and bottom edge (window.innerHeight - 90)
- [ ] Claim 14: main.js calls Brain3D.init() after BRAIN.setup() with typeof guard
- [ ] Claim 15: main.js calls Brain3D.update() in the main loop() function guarded by typeof Brain3D !== 'undefined' && Brain3D.active
- [ ] Claim 16: Brain 3D button click handler toggles Brain3D.toggle(), updates aria-pressed, and toggles .active class on the button
- [ ] Claim 17: Brain3D manages its own internal render loop via _renderLoop() using requestAnimationFrame — no second RAF loop added to main.js
- [ ] Claim 18: CSS uses only existing CSS custom properties (--surface, --border, --text, --text-muted, --accent, --radius) except for scene background hex 0x0a0a1a and region color hex values
- [ ] Claim 19: Overlay positioned fixed top:44px bottom:90px (between toolbar and bottom panel) at z-index:15; tooltip at z-index:45
- [ ] Claim 20: A faint wireframe sphere outline (opacity 0.06) provides spatial reference in the 3D scene
- [ ] Claim 21: Brain3D._onResize handles window resize, updating camera aspect ratio and renderer size

## Gaps and Assumptions
- No automated tests exist for this feature; verification is manual browser-based smoke testing only
- Three.js CDN scripts require internet access to load; no offline fallback provided
- The neuronDescriptions global is defined in main.js which loads after brain3d.js, so the typeof guard in _onMouseMove is essential for avoiding runtime errors if tooltip is shown before main.js fully initializes (unlikely but handled)
- Mesh positions are anatomically approximate using the plan's coordinate values; no real neuroanatomical data was used
- The ACTIVATION_DIVISOR of 80 is a tuning constant — actual visual quality depends on the range of postSynaptic values at runtime
