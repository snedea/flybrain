# Build Claims -- T1.3

## Files Changed
- [MODIFY] css/main.css -- Rewrote entirely: added CSS custom properties (:root), removed toggle/slider/buttons styles, added toolbar + bottom panel + tool button + drive meter + connectome panel styles, updated .brainNode sizing (6px) and #nodeHolder to flexbox, updated #githubButton to inline style with hover
- [MODIFY] index.html -- Replaced body content: added #toolbar div with 4 tool buttons (Feed, Touch, Air, Light) and right-side controls (FlyBrain title, center/clear icons, GitHub link), added #bottom-panel with #connectome-panel (containing #nodeHolder) and #drive-meters (4 drive bars), removed #toggleConnectome checkbox and #buttons div
- [MODIFY] js/main.js -- Removed toggleConnectome function. Added tool state variables (activeTool, isDragging, dragStart, lightStates, lightStateIndex, lightLabels, neuronColorMap, regionColors). Built neuronColorMap from BRAIN.neuronRegions after BRAIN.setup. Added tool button click handlers with active-state toggling. Replaced addFood with handleCanvasMousedown/mousemove/mouseup dispatchers. Added applyTouchTool (proximity check, fly-local coordinate transform, body-part classification, BRAIN.stimulate.touch). Added cycleLightLevel (cycles BRAIN.stimulate.lightLevel through 1/0.5/0). Replaced hardcoded neuron color with neuronColorMap lookup. Added drive meter DOM updates in updateBrain. Added canvas background color update in draw() based on BRAIN.stimulate.lightLevel.

## Verification Results
- Build: PASS (no build step -- vanilla JS loaded via script tags)
- Tests: SKIPPED (no test framework configured)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] Top toolbar (#toolbar) is fixed at top with 4 tool buttons: Feed (active by default), Touch, Air, Light
- [ ] Toolbar right side has FlyBrain title, center icon, clear icon, and GitHub link
- [ ] Feed button is highlighted (class "active") by default; clicking another tool (Touch, Air) highlights it and un-highlights Feed
- [ ] Light button is independent -- clicking it cycles the label through "Bright" / "Dim" / "Dark" and sets BRAIN.stimulate.lightLevel to 1 / 0.5 / 0
- [ ] Canvas background transitions between #222 (bright), #161616 (dim), #080808 (dark) based on lightLevel
- [ ] With Feed tool active, clicking canvas adds food at click coordinates (same behavior as before, using clientX/clientY)
- [ ] With Touch tool active, clicking within 50px of fly sets BRAIN.stimulate.touch=true and BRAIN.stimulate.touchLocation to head/thorax/abdomen/leg based on fly-local coordinates; clicking far from fly does nothing
- [ ] With Air tool active, mousedown starts wind (BRAIN.stimulate.wind=true, windStrength=0.3); dragging adjusts windStrength proportional to drag distance; mouseup finalizes and sets 2s timeout to clear wind
- [ ] Bottom panel (#bottom-panel) is fixed at bottom with connectome visualization (left) and drive meters (right)
- [ ] Connectome neuron dots are colored by region: sensory=#3b82f6 (blue), central=#8b5cf6 (purple), drives=#f59e0b (amber), motor=#ef4444 (red)
- [ ] Drive meter bars (Hunger, Fear, Fatigue, Curiosity) update every 500ms from BRAIN.drives values with CSS transition animation
- [ ] Center button re-centers fly; Clear button clears all food dots (unchanged IDs, still wired)
- [ ] drawFood() function is unchanged
- [ ] Food proximity detection in update() (lines 726-736) is unchanged
- [ ] Backward-compatible shim flags (stimulateHungerNeurons, stimulateNoseTouchNeurons, stimulateFoodSenseNeurons) and setTimeout reset are unchanged
- [ ] Canvas remains fullscreen (window.innerWidth/Height); toolbar and bottom panel are fixed-position overlays
- [ ] js/connectome.js and js/constants.js were NOT modified by this task
- [ ] No gradients, glassmorphism, glows, or colored shadows added
- [ ] All UI colors use CSS custom properties from :root

## Gaps and Assumptions
- Touch tool body-part classification thresholds (12px for legs, -17 for head, 2 for thorax/abdomen boundary) are approximate and may need tuning based on actual fly rendering at different scales
- Air tool wind-on-click proximity formula (1 - distToFly/200) is an approximation; may feel odd at extreme distances
- No mobile/touch event support (mousedown/mousemove/mouseup only)
- The nameBox span elements created in the brainNode loop (empty spans before each .brainNode) still exist -- they are vestigial from the original worm-sim and not addressed by this task
- Drive meter values depend on BRAIN.drives being updated by connectome.js; if drives are not changing, meters will appear static
