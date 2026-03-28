# FlyBrain Tasks

- Phase 1: Foundation (3 tasks archived to TASKS-ARCHIVE.md)
- Phase 2: Behavioral Polish (1 tasks archived to TASKS-ARCHIVE.md)
- Phase 3: Bug Fixes and Rendering (1 tasks archived to TASKS-ARCHIVE.md)
- Phase 4: Missing Features and Interaction Polish (2 tasks archived to TASKS-ARCHIVE.md)
- Discovery Rounds 1-21 (archived to TASKS-ARCHIVE.md)
- Phase 5: Spec Compliance and Behavioral Enrichment (4 tasks archived to TASKS-ARCHIVE.md)
- Phase 6: Educational 3D Brain Visualization (3 tasks archived to TASKS-ARCHIVE.md)

- Phase 7: Full FlyWire Connectome (139K Neurons) (1 archived, 6 retained) (6 tasks archived to TASKS-ARCHIVE.md)
## Discovery Round 23: Motor Pipeline & Visual Panel Regression Fix

Commit 5516089 ("Fix FlyWire classification, horizontal layout, and motor output pipeline") introduced two major regressions: (1) the fly is stuck in idle and never walks, flies, startles, or exhibits any behavior, and (2) the bottom neuron visualization panel has badly unbalanced region proportions, making Drives and Motor regions nearly invisible.

**Root cause (confirmed via neuron_meta.json):** 31 of 63 neuron groups have ZERO neurons, including every group critical to the behavioral pipeline:
- Drives: DRIVE_FEAR=0, DRIVE_CURIOSITY=0, DRIVE_GROOM=0 (only HUNGER=46, FATIGUE=34 survive)
- Motor: ALL MN_LEG=0, ALL MN_WING=0, ALL DN_*=0 (only VNC_CPG=4, PROBOSCIS=24, HEAD=40, ABDOMEN=8)
- Avoidance circuit: MB_MBON_AV=0, LH_AV=0, SEZ_GROOM=0, DN_STARTLE=0, NOCI=0
- 21,955 neurons (16% of total) are dumped into GENERIC_CENTRAL, which the behavioral pipeline ignores

The classification rules in `scripts/build_connectome.py` don't match FlyWire FAFB v783 field values for most groups. No amount of JavaScript scaling will fix empty groups -- the build script must be fixed first, then the JS motor pipeline tuned to the corrected data.

### D23.1: Fix build_connectome.py classification rules and rebuild binary

The Python build script's `determine_group()` function fails to classify neurons into 31 of 63 groups. These neurons fall through to GENERIC_CENTRAL (21,955 neurons) or are mis-assigned to overly broad groups (VIS_ME has 82,318 neurons -- likely absorbing neurons that belong in VIS_R7R8, VIS_LC, etc.).

**Step 1: Audit current classification rules against FlyWire field values.**
Run diagnostic queries against `data/classification.csv.gz` to understand the actual distribution of `flow`, `super_class`, `class`, and `sub_class` values. Identify which field value combinations produce neurons that should map to the currently-empty groups. Key questions:
- What `class`/`sub_class` values correspond to R7/R8 photoreceptors vs R1-R6? (VIS_R7R8 is currently 0)
- What `class` values identify lobula columnar neurons? (VIS_LC is 0)
- What `class`/`sub_class` identifies nociceptors? (NOCI is 0)
- What `class` values map to MBONs with avoidance valence vs approach? (MB_MBON_AV is 0)
- What `class` identifies lateral horn neurons by valence? (LH_AV is 0)
- Why are all DN_* groups empty when `flow=efferent` neurons exist?
- What fields distinguish leg/wing/flight motor neurons?

**Step 2: Fix the classification rules.** FlyWire FAFB is brain-only, so VNC motor neurons (MN_LEG_*, MN_WING_*) genuinely don't exist in the dataset. These groups should remain empty and be handled by the virtual VNC layer in JavaScript. But descending neurons (DN_WALK, DN_FLIGHT, DN_STARTLE, etc.) DO exist in the brain dataset as efferent/motor neurons -- they need proper classification rules. Similarly, drives don't map 1:1 to FlyWire cell types -- they're functional abstractions. The fix should:
- Map efferent descending neurons to DN_* groups based on their target neuropil or known cell types
- Map nociceptive sensory neurons to NOCI based on class/sub_class
- Split VIS_ME's 82K neurons properly across VIS_R7R8, VIS_LC, VIS_ME by using sub_class or neuropil
- Map avoidance-valence MBONs to MB_MBON_AV and punishment DANs to MB_DAN_PUN using known MBON/DAN naming conventions from FlyWire
- Map lateral horn neurons to LH_AV vs LH_APP by their known connectivity patterns or sub_class
- For groups that genuinely can't be mapped from FlyWire fields (DRIVE_FEAR, DRIVE_CURIOSITY, DRIVE_GROOM, SEZ_GROOM, CLOCK_DN), document them as "virtual groups" that exist only in the behavioral layer, not in the connectome

**Step 3: Rebuild and validate.**
- Run `python scripts/build_connectome.py` to regenerate `data/connectome.bin.gz` and `data/neuron_meta.json`
- Validate: every group that the behavioral pipeline reads via `sendStimulation()` or `synthesizeMotorOutputs()` must have nonzero neuron count OR be explicitly handled as a virtual group
- The target distribution: no group should have more than ~30% of total neurons (VIS_ME's current 59% is a red flag for mis-classification). GENERIC_CENTRAL should be under 5%.
- Add cache-busting query params to the fetch URLs in `brain-worker-bridge.js` to prevent stale binary serving

**Step 4: Handle virtual groups in JavaScript.**
Groups that genuinely don't exist in FlyWire FAFB (drives, MN_LEG/WING) need a bypass in `brain-worker-bridge.js`:
- For DRIVE_FEAR, DRIVE_CURIOSITY, DRIVE_GROOM: `workerUpdate()` should write `BRAIN.drives.fear/curiosity/groom` directly to `BRAIN.postSynaptic['DRIVE_FEAR'][nextState]` etc., bypassing the worker aggregation path. The drives are computed by `updateDrives()` on the main thread already -- they just need to appear in postSynaptic for `synthesizeMotorOutputs()` to read.
- For MN_LEG_*, MN_WING_*: these are already handled by `synthesizeMotorOutputs()` writing to them. No change needed as long as the function actually executes (see D23.2).

Files: `scripts/build_connectome.py` (classification rules), `data/classification.csv.gz` (source data to audit), `data/neuron_meta.json` (output validation), `data/connectome.bin.gz` (rebuild target), `js/brain-worker-bridge.js` (cache busting, virtual group bypass, workerUpdate)

### D23.2: Fix synthesizeMotorOutputs() early exit, scaling, and state timing

After D23.1 populates the neuron groups, `synthesizeMotorOutputs()` in `brain-worker-bridge.js:272` has multiple bugs that prevent motor output from reaching the behavioral layer. The severity of these bugs depends on the actual postSynaptic values after D23.1 -- some may self-resolve, others won't.

**Bug 1: Fatal early exit (line 312).** `if (total < 0.5) return;` gates ALL motor output on `GNG_DESC + VNC_CPG >= 0.5`. The `descProxy` fallback (lines 299-304) computes motor intent from central circuits and can boost `desc`, but only if those central circuits have nonzero postSynaptic values (which depends on D23.1). Even with D23.1 fixed, the early exit is fragile -- if tonic CX stimulation produces `descProxy < 0.5` during the first few seconds before the network ramps up, the fly sits idle.
- Fix: Remove the early exit entirely. Let the magnitude of `walkDrive`, `flightIntent`, etc. naturally control whether motor output is meaningful. If everything is near zero, the addPS calls will add near-zero values, which is fine -- the behavioral thresholds in fly-logic.js will filter them.

**Bug 2: MOTOR_SCALE calibration unknown.** `MOTOR_SCALE = 0.6` was tuned (or guessed) before D23.1. After fixing the classification, the actual postSynaptic values for GNG_DESC, CX_*, DRIVE_FEAR etc. may be very different. With FIRE_STATE_SCALE=100 and proper group populations, CX groups could produce values of 50-100, making `walkDrive` extremely large (e.g., ~200 per side), which would far exceed the walk threshold of 5 and produce absurdly fast walking.
- Fix: After D23.1, add temporary logging to measure actual postSynaptic ranges for key groups (GNG_DESC, CX_PFN, CX_FC, DRIVE_FEAR, flightIntent, walkIntent). Then calibrate MOTOR_SCALE so that: idle-state walk emerges at accumWalkLeft+Right ~= 6-10 (just above threshold 5), strong touch produces accumFlight ~= 20-30 (above threshold 15), and startle produces accumStartle ~= 35-50 (above threshold 30).

**Bug 3: flightIntent depends on zero-neuron groups.** `flightIntent = dFear * 2.0 + (mbAv + lhAv) * 0.8 + dnStartle * 1.5 + noci * 1.0`. After D23.1 step 4, DRIVE_FEAR will have values from the main-thread bypass. But MB_MBON_AV, LH_AV, and DN_STARTLE depend on proper classification (D23.1 step 2). NOCI needs real neurons too. If any of these remain at zero after D23.1, flight and startle are still broken.
- Fix: After D23.1, verify each input to flightIntent has a plausible activation path. For any that remain as virtual/empty groups, add a main-thread bypass similar to drives.

**Bug 4: DN_STARTLE state mismatch.** `synthesizeMotorOutputs()` writes `DN_STARTLE` to `BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState]` via `addPS()`. But `motorcontrol()` reads `DN_STARTLE` from `BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState]` (line 485 in connectome.js). This means the synthesized startle value is always read one tick late, causing transient startle events to be missed.
- Fix: Change `motorcontrol()` to read DN_STARTLE from `nextState` instead of `thisState`, consistent with how all other motor groups are read.

**Bug 5: Flight and startle gates too aggressive.** `flightIntent > 1.0` (line 336) and `dFear > 3.0` (line 343) may be appropriate or not depending on the actual value ranges after D23.1. Defer calibration until after D23.1 values are measured.

Files: `js/brain-worker-bridge.js` (synthesizeMotorOutputs), `js/connectome.js` (motorcontrol DN_STARTLE read), `js/fly-logic.js` (BEHAVIOR_THRESHOLDS for reference)

### D23.3: Fix neuron visualization panel -- region proportions unreadable

The bottom panel (neuro-renderer.js) allocates width to each region proportional to its raw neuron count. With the current (broken) classification, Sensory=103,847 and Central=35,252 consume ~99.9% of panel width, while Drives=80 and Motor=76 get less than 1 pixel each -- completely invisible.

Even after D23.1 fixes classification, the fundamental ratio problem remains: sensory neurons vastly outnumber motor/drive neurons in any brain. The panel needs a non-linear layout strategy.

**Problem 1: Linear width allocation.** `buildLayout()` at neuro-renderer.js:246 computes `colsNeeded = Math.ceil(neurons.length / rowsAvail)` and `sectionW = colsNeeded * POINT_SIZE`. With POINT_SIZE=1.0 and ~140 rows available, Sensory gets ~740 columns while Motor gets ~1 column. The labels overlap or are invisible for small regions.

**Problem 2: POINT_SIZE=1.0 too small.** Reduced from 2.0 to 1.0 in the horizontal layout commit. At 1px per neuron on a high-DPI display, individual neuron firing is invisible. The vertex shader also has `gl_PointSize = 1.0;` hardcoded at neuro-renderer.js:162, so changing the JS constant alone won't increase rendered point size.

**Problem 3: Labels overflow small regions.** `buildLabels()` at line 286 positions labels at `sectionBounds[r].x0`. When a region is 1px wide, the label "Motor (76)" overflows and overlaps adjacent regions.

**Problem 4: handleResize only checks height.** The resize handler at neuro-renderer.js:303 compares `newH === canvas.height` and returns early if unchanged. Width-only window resizes (e.g., dragging browser edge horizontally) don't trigger a relayout.

Fix approach:
- **Minimum section width**: Enforce a floor of 60-80px per region so Drives and Motor always have enough space for their label and a readable neuron grid. Distribute remaining width proportionally (or sqrt-proportionally) among the larger regions.
- **Increase POINT_SIZE to 2.0** and update the vertex shader's `gl_PointSize` to match. For small regions with few neurons, consider rendering at an even larger point size (3-4px) to fill their allocated space and make firing patterns visible.
- **Increase SECTION_GAP to 20-24px** for clearer visual separation.
- **Label overflow protection**: Position labels with `max-width` and `overflow: hidden` or `text-overflow: ellipsis`. For regions wider than their label, center the label.
- **Fix handleResize**: Check both width AND height changes before early-returning.
- **Adaptive point size per region**: Small regions (< 200 neurons) could render at 3-4px point size to fill their minimum-width section, while large regions use 1.5-2px.

Files: `js/neuro-renderer.js` (buildLayout, buildLabels, POINT_SIZE, SECTION_GAP, vertex shader gl_PointSize, handleResize), `css/main.css` (#left-panel height)

### D23.4: End-to-end behavioral verification and tuning

After D23.1-D23.3 are fixed, verify the full pipeline produces correct emergent behavior. This is a verification and tuning pass, not a rewrite.

**Prerequisites**: D23.1 must be complete (groups populated, binary rebuilt, virtual group bypass in place). D23.2 must be complete (early exit removed, DN_STARTLE state fix applied). D23.3 can be done independently/in parallel.

**Step 1: Instrument the pipeline.** Add temporary console.log at each stage of the motor pipeline in `brain-worker-bridge.js`:
- After `aggregateFireState()`: log key group postSynaptic values (GNG_DESC, CX_PFN, CX_FC, DRIVE_FEAR, DRIVE_CURIOSITY, MECH_BRISTLE)
- After `synthesizeMotorOutputs()`: log walkIntent, flightIntent, groomIntent, and the MN_LEG/WING values written
- After `motorcontrol()`: log accumWalkLeft, accumWalkRight, accumFlight, accumStartle, accumFeed, accumGroom
- In `evaluateBehaviorEntry()`: log the returned state

**Step 2: Verify each behavior pathway.**
1. **Idle -> Walk**: With no stimuli, tonic CX stimulation should produce accumWalkLeft+Right > 5 within 10-15 seconds. If not, increase tonic intensity in sendStimulation() lines 472-475 (currently 0.03-0.08).
2. **Touch -> Groom**: Click fly body. Verify MECH_BRISTLE fires, groom drive increases (via updateDrives), DRIVE_GROOM postSynaptic reflects it (via virtual group bypass), and accumGroom > 8.
3. **Touch -> Startle -> Fly**: Quick tap. Verify fear drive spikes, DRIVE_FEAR postSynaptic reflects it, flightIntent > gate threshold, MN_WING values written, accumFlight > 15. If not, trace which stage drops the signal.
4. **Food -> Feed**: Place food near fly. Verify two distinct entry paths: (a) neural pathway -- OLF_ORN_FOOD fires, fly walks toward food, GUS_GRN_SWEET fires on contact (dist <= 20px), accumFeed > 8, proboscis extends; (b) hunger bypass -- when hunger > 0.7 and food is within 50px (foodNearby), fly enters feed state directly without needing 20px contact first (fly-logic.js:64). In both paths, verify food shrinks proportionally as eaten progress accumulates, persists across feed-state exits, and food is removed when fully consumed.
5. **Wind -> Brace/Fly**: Air tool. Light wind = MECH_JO moderate activation -> brace. Strong wind = high activation + fear spike -> flight.
6. **Light -> Phototaxis**: Bright mode. Verify VIS_R1R6 fires (VIS_R7R8 too if populated by D23.1), fly orients toward light.
7. **Temperature**: Warm/Cool. Verify THERMO_WARM or THERMO_COOL fires.
8. **Rest**: After extended activity, fatigue > 0.7 -> rest state.

**Step 3: Calibrate MOTOR_SCALE and thresholds.**
Using the logged values from Step 1, adjust:
- `MOTOR_SCALE` so walk emerges at accumWalkLeft+Right ~= 6-10
- `flightIntent` gate so strong touch/wind produces accumFlight ~= 20-30
- `dFear` gate so sudden fear produces accumStartle ~= 35-50
- If needed, adjust `BEHAVIOR_THRESHOLDS` in fly-logic.js, but prefer tuning the motor scaling first

**Step 4: Remove instrumentation.** Delete all temporary console.log calls after tuning is complete.

Files: `js/brain-worker-bridge.js`, `js/fly-logic.js`, `js/connectome.js`, `js/main.js`

- Discovery Round 24: Test Coverage for Worker Bridge Pipeline (1 tasks archived to TASKS-ARCHIVE.md)
## Discovery Round 25

No new tasks discovered.

## Discovery Round 26

No new tasks discovered.

## Discovery Round 27

No new tasks discovered.

- Discovery Round 28 (1 tasks archived to TASKS-ARCHIVE.md)
## Discovery Round 29

No new tasks discovered.

## Discovery Round 30

No new tasks discovered.

## Discovery Round 31

No new tasks discovered.

## Discovery Round 32

No new tasks discovered.

## Discovery Round 33

No new tasks discovered.

## Discovery Round 34

No new tasks discovered.

## Discovery Round 35

No new tasks discovered.

## Discovery Round 36

No new tasks discovered.

## Discovery Round 37

No new tasks discovered.

## Discovery Round 38

No new tasks discovered.

## Discovery Round 39

No new tasks discovered.

## Discovery Round 40

No new tasks discovered.

## Discovery Round 41

No new tasks discovered.

## Discovery Round 42

No new tasks discovered.

## Discovery Round 43

No new tasks discovered.

## Discovery Round 44

No new tasks discovered.

## Discovery Round 45

No new tasks discovered.

## Discovery Round 46

No new tasks discovered.

## Discovery Round 48

No new tasks discovered.

## Discovery Round 50

No new tasks discovered.

## Discovery Round 51

No new tasks discovered.

## Discovery Round 52

No new tasks discovered.

## Discovery Round 53

No new tasks discovered.

## Discovery Round 55

No new tasks discovered.

## Discovery Round 56

No new tasks discovered.

## Discovery Round 58

No new tasks discovered.

## Discovery Round 59

No new tasks discovered.

## Discovery Round 60

No new tasks discovered.

## Discovery Round 61

No new tasks discovered.

## Discovery Round 62

No new tasks discovered.

## Discovery Round 63

No new tasks discovered.

## Discovery Round 64

No new tasks discovered.

- Discovery Round 65 (1 tasks archived to TASKS-ARCHIVE.md)
## Discovery Round 66

No new tasks discovered.

- Discovery Round 67 (1 tasks archived to TASKS-ARCHIVE.md)
## Discovery Round 68

- [x] D68.1: Fix worker stats reset correctness. The averaged firedNeurons logic in sim-worker.js accumulates cumulativeFiredCount across the stats window and resets it when stats are emitted (line 384). However, cumulativeFiredCount is NOT cleared on worker reset (sim-worker.js case 'reset' at line 460), so post-reset stats can include stale pre-reset spikes in the first averaged window. Fix: add `cumulativeFiredCount = 0;` to the reset handler alongside the existing tickTimeSum/tickTimeSamples resets. Files: js/sim-worker.js (reset handler around line 474).

- [x] D68.2: Add test coverage for post-D24 files still unexercised by the 69-test suite. D24.1 (TASKS.md:174) added brain-worker-bridge.js coverage, but main.js, sim-worker.js, neuro-renderer.js, and CSS are still untested. Add tests or extract pure helper functions for: (a) main.js food-seeking -- verify steering angle uses facingDir (not targetDir), seekStrength scales with hunger, feed approach speed is 0.25; (b) main.js feed entry -- verify feed state enters at 50px when hunger > 0.7 via bypass, still requires 20px for neural pathway; (c) main.js food consumption -- verify eaten progress accumulates across feed-state exits, food removed at progress >= 1; (d) sim-worker.js averaged stats -- verify cumulativeFiredCount is accumulated, averaged, and reset correctly across the stats window and on worker reset; (e) connectome.js DN_STARTLE -- verify accumStartle reads from nextState, not thisState. Files: tests/tests.js (new test functions), tests/run-node.js (load paths), js/main.js and js/sim-worker.js (extract testable pure functions if needed). [SPI-]

- [x] D68.3: Browser smoke verification checklist for neuro-renderer.js changes. The renderer now includes canvas CSS stretch, per-section adaptive point sizes, resize rebuilds on width change, per-vertex gl_PointSize attribute, and displayScale-aware hit-testing -- significantly broader than the original label overlap fix. Manual verification checklist: (1) width-only window resize triggers relayout (not just height), (2) tooltip hover aligns with neurons after CSS stretch (mouse coords correctly convert via canvas.width/rect.width), (3) labels truncate with ellipsis when sections are narrow (box-sizing:border-box prevents overflow), (4) DRIVES/MOTOR sections render as visible grids at all zoom levels (not 1px slivers), (5) high-DPI displays show crisp points (image-rendering:pixelated), (6) last section (Motor) is not clipped at container edge (canvas shrinks to fit via displayScale < 1). Files: js/neuro-renderer.js (manual testing), css/main.css (#neuro-renderer-wrap overflow). [-PI-]

## Phase 8: Autonomous Claude Code Caretaker (GitHub Issue #1)

Claude Code acts as a hands-off caretaker for the virtual fly -- feeding it, managing its environment, and keeping it healthy. All actions and observations are logged in structured JSON Lines for AI-powered querying ("how many times did Claude forget to feed the fly?").

- [ ] T8.1: Build WebSocket bridge and caretaker server. Add a lightweight WebSocket server (Node.js) that bridges between the browser and Claude Code. Browser-side: expose fly state (drives, behavior, position, firing stats, food positions) at ~1Hz over WebSocket, accept commands (place_food, set_light, set_temp, touch, blow_wind, clear_food). Server-side: relay state/commands between browser and Claude Code via stdin/stdout, write every observation and action to `caretaker.log` as JSON Lines with timestamps, action type, parameters, reasoning, and fly state snapshot. Include incident detection (fear spike after Claude action = "scared the fly", hunger > 0.9 with no food = "forgot to feed"). Files: new `server/caretaker.js` (WebSocket + logging), `js/caretaker-bridge.js` (browser-side WebSocket client, state serialization, command execution), `index.html` (load caretaker-bridge.js).

- [ ] T8.2: Build Claude Code caretaker agent and policy. Define the caretaker policy as a Claude Code agent that reads fly state and decides actions. Policy rules: feed when hunger > 0.6 (place food near fly, not on top of it), dim lights when fatigue > 0.5, set temp neutral when fear > 0.3, vary stimuli when idle > 120s (light touch or food placement to spark curiosity), never stack stressors (no wind + touch + bright simultaneously), back off for 30s after any fear spike > 0.5. Agent runs on a ~5s decision loop: read state, evaluate policy, send 0-1 commands, log reasoning. Files: new `agent/caretaker-policy.md` (policy definition for Claude Code), new `agent/run.sh` (launch script that starts server + connects Claude Code).

- [ ] T8.3: Canvas rendering of Claude's visual presence. Draw Claude's presence on the canvas so the user always sees where Claude is and what it's doing. Claude cursor: small Claude logo silhouette in orange (#E3734B), rendered at Claude's current "attention point" on the canvas. Interaction indicators: orange ripple/pulse when placing food, orange ring when touching, orange arrow for wind, toolbar highlight for light/temp changes. Attention trail: faint orange line as Claude shifts focus. Idle pulse: gentle heartbeat glow when observing. All indicators are cosmetic (rendered on the canvas draw loop), not part of the simulation. Files: `js/caretaker-renderer.js` (canvas overlay drawing), `svg/claude-cursor.svg` (Claude logo silhouette), `css/main.css` (toolbar highlight for Claude actions).

- [ ] T8.4: Log query tool. Build a tool to query caretaker logs with natural language. Use DuckDB to load the JSON Lines file, then let Claude Code answer questions against it. Example queries: "how many times did Claude forget to feed the fly?" (count periods where hunger > 0.9 with no place_food within 30s), "how many times did Claude scare the fly?" (count fear spikes > 0.5 within 10s of a Claude action), "what was the fly's average hunger today?", "show me all incidents". Files: new `tools/query-log.sh` (wrapper that loads log into DuckDB and passes the user's question to Claude Code).

## Phase 9: iOS App (iPhone)

Wrap FlyBrain in a native Swift/WKWebView shell for iPhone. The web app runs as-is inside WKWebView -- no rewrite needed. Web Workers and DecompressionStream are supported in WKWebView on iOS 16.4+. The primary work is: project scaffolding, vendorizing CDN deps, fixing asset loading for local files, and adapting the UI for touch/small screens.

Target: iOS 17.0+ (drops baggage, guarantees Web Worker + DecompressionStream + CSS :has() support).
Architecture: Single-view Swift app, WKWebView loads bundled `index.html`. No server, no Capacitor, no Tauri -- just Xcode + Swift + WKWebView.
App bundle: `ios/FlyBrain/` directory within this repo. Web assets referenced via build phase copy.

- [ ] T9.1: Xcode project, WKWebView shell, and local asset loading. Create the Xcode project at `ios/FlyBrain.xcodeproj` with a single-view SwiftUI app. The main (and only) view embeds a `WKWebView` via `UIViewRepresentable`. Configure WKWebView: (a) load `index.html` via `loadFileURL(_:allowingReadAccessTo:)` with read access to the entire `web/` bundle directory, (b) enable JavaScript, (c) allow Web Workers (they need same-origin file:// access -- the `allowingReadAccessTo` directory handles this), (d) suppress WKWebView bounce/scroll (the canvas handles its own interaction), (e) disable link previews and callouts. Vendorize Three.js: download `three.min.js` v0.128.0 and `OrbitControls.js` into `js/vendor/` and update `index.html` script tags to reference local paths instead of CDN. Add a `<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">` to `index.html` (benefits mobile web too). Create an Xcode build phase that copies web assets (index.html, css/, js/, svg/, data/connectome.bin.gz, data/neuron_meta.json) into the app bundle -- exclude the large CSV files (connections.csv.gz, neurons.csv.gz, etc.) that are only used by build scripts. Verify: app launches in Simulator, connectome loads, fly walks, neuron panel renders. Files: new `ios/` directory (Xcode project), `js/vendor/three.min.js` and `js/vendor/OrbitControls.js` (vendored), `index.html` (viewport meta, local script paths).

- [ ] T9.2: iPhone UI adaptation -- touch, layout, and safe areas. The desktop layout assumes a wide viewport with mouse interaction. Adapt for iPhone: (a) CSS media queries for narrow screens (`max-width: 768px`) -- stack the toolbar vertically or use a compact horizontal strip, scale the canvas to fill the viewport, move the neuron panel to a slide-up drawer instead of a fixed bottom bar, hide the left sidebar by default (show via hamburger/swipe). (b) Touch interaction -- the web app uses mousedown/mousemove/mouseup for tools (Feed, Touch, Air). These translate automatically via WKWebView, but add `touch-action: none` on the canvas to prevent iOS gestures (scroll, zoom, back-swipe) from hijacking tool interactions. For the Air tool (click-and-drag), ensure touchmove fires continuously. (c) Safe areas -- use `env(safe-area-inset-top)` etc. in CSS so toolbar and panels don't hide behind the notch/Dynamic Island or home indicator. (d) Status bar -- set WKWebView to extend under the status bar with a translucent background (immersive feel). (e) Orientation -- support both portrait (primary) and landscape. In landscape, the neuron panel can sit beside the canvas instead of below. (f) 3D Brain view -- Three.js OrbitControls uses mouse events; add touch event mappings (single-finger rotate, pinch zoom, two-finger pan) if OrbitControls doesn't handle touch natively (v0.128.0 does via TouchEvent, but verify). (g) Performance -- if the 139K-neuron simulation drops below 30fps on iPhone, add a "Lite mode" toggle that reduces tick rate from 10Hz to 5Hz or limits the neuron panel to firing-only rendering (skip idle neurons). Files: `css/main.css` (media queries, safe areas, touch-action), `index.html` (meta viewport already added in T9.1), `js/main.js` (touch event fixes if needed), `ios/FlyBrain/ContentView.swift` (status bar, orientation config).

- [ ] T9.3: App icon, launch screen, and App Store metadata. Design and set the app icon: a stylized fruit fly brain silhouette (top-down Drosophila brain outline) in the project's existing color palette (neural-panel blues/greens from CSS custom properties). Generate all required icon sizes via a single 1024x1024 source SVG exported to the Xcode asset catalog (`AppIcon.appiconset`). Launch screen: use a simple storyboard (or SwiftUI scene) showing the app icon centered on a dark background (#1a1a2e from CSS --bg-dark) with "FlyBrain" text below in the same font as the web UI. Set `Info.plist` metadata: bundle display name "FlyBrain", bundle identifier `com.snedea.flybrain`, version 1.0.0, deployment target iOS 17.0, supported orientations (portrait + landscape), camera/mic usage descriptions = none needed. Privacy: no network requests (fully offline after install), no tracking, no data collection -- this simplifies App Store review. Add a brief App Store description and keywords to a `metadata/` directory for reference when submitting. Files: new `ios/FlyBrain/Assets.xcassets/AppIcon.appiconset/` (icon images), `ios/FlyBrain/LaunchScreen.storyboard` or SwiftUI launch scene, `ios/FlyBrain/Info.plist`, new `metadata/appstore.md` (description, keywords, screenshots checklist).
