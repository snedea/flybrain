# FlyBrain Tasks

- Phase 1: Foundation (3 tasks archived to TASKS-ARCHIVE.md)
- Phase 2: Behavioral Polish (1 tasks archived to TASKS-ARCHIVE.md)
- Phase 3: Bug Fixes and Rendering (1 tasks archived to TASKS-ARCHIVE.md)
- Phase 4: Missing Features and Interaction Polish (2 tasks archived to TASKS-ARCHIVE.md)
- Discovery Rounds 1-21 (archived to TASKS-ARCHIVE.md)
- Phase 5: Spec Compliance and Behavioral Enrichment (4 tasks archived to TASKS-ARCHIVE.md)
- Phase 6: Educational 3D Brain Visualization (3 tasks archived to TASKS-ARCHIVE.md)

## Phase 7: Full FlyWire Connectome (139K Neurons) (1 archived, 6 retained)

Replace the 59-group approximation with the real FlyWire connectome (139,255 neurons, 2.7M connections, FAFB v783). Keep the existing behavioral layer and fly canvas; rebuild the neural simulation and connectome visualization to use real data.

Data source: FlyWire Codex GCS bucket (public, no auth). Files in data/:
- connections.csv.gz (48MB) -- 3.87M rows: pre_root_id, post_root_id, neuropil, syn_count, nt_type
- neurons.csv.gz (1.6MB) -- 139,255 rows: root_id, group, nt_type
- classification.csv.gz (0.9MB) -- root_id, flow, super_class, class, sub_class, side
- coordinates.csv.gz (5.1MB) -- root_id, position, supervoxel_id

### T7.1: Data Pipeline

- [x] T7.1: Build Python preprocessing script (scripts/build_connectome.py) that reads the 4 CSV files from data/, aggregates connections across neuropils into a single sparse edge list, remaps root_ids to contiguous indices 0..139254, classifies each neuron into a functional region (sensory/central/drives/motor) using classification.csv flow+super_class fields, maps each neuron to one of the existing 59 behavioral groups using sub_class/class/hemilineage annotations (unmapped neurons get a generic group per region), and outputs two files: (1) connectome.bin.gz (~6-7MB target) with header (uint32 neuron_count, uint32 edge_count) + edges (uint32 pre, uint32 post, float32 weight derived from syn_count and nt_type sign) + per-neuron metadata (uint8 region_type, uint16 group_id), and (2) neuron_meta.json with group names, region assignments, and neuron count per group for the UI. [SPI-]

### T7.2: Neuron-to-Group Mapping

- [x] T7.2: Define the mapping from 139K individual neurons to the 59 functional groups used by fly-logic.js. Use classification.csv fields: flow (sensory/intrinsic/motor) maps to region type, super_class+class maps to specific groups (e.g., class=visual -> VIS_*, class=olfactory -> OLF_*, class=kenyon_cell -> MB_KC). Write mapping logic in the preprocessing script. Output a lookup table in the binary file (uint16 group_id per neuron). The behavioral layer reads aggregated activation per group as before -- sum of fire states for all neurons in that group, normalized by group size. [-PI-]

### T7.3: LIF Simulation Engine (Web Worker)

- [x] T7.3: Implement a leaky integrate-and-fire (LIF) neuron simulator in a dedicated Web Worker (js/sim-worker.js). On init, receives the binary connectome data via transferable ArrayBuffer. Builds sparse adjacency from edge list (CSR format for cache-friendly iteration). Each neuron has: membrane potential V (Float32Array), leak rate (0.95 default), threshold (1.0), refractory counter (Uint8Array). Each tick: (1) decay V *= leak, (2) for each neuron that fired last tick, iterate its outgoing edges and add weight to post-synaptic V, (3) check threshold and set fire state, (4) handle refractory. Post fire state (Uint8Array, 139K bytes) back to main thread every tick. Receive sensory stimulation messages (neuron indices + intensity) from main thread. Target: 20+ simulation ticks/second. [-PI-]

### T7.4: Main Thread Integration

  ... (1 tasks archived to TASKS-ARCHIVE.md)

### T7.5: WebGL2 Visualization

- [x] T7.5: Replace the DOM-based dot clusters in the left sidebar with a WebGL2 canvas (js/neuro-renderer.js) that renders 139K neurons as instanced points. Each neuron is a 1-2px point colored by region type (sensory blue, central purple, drives amber, motor red), brightness driven by fire state from the Uint8Array. Layout: neurons arranged within their region section in a grid pattern, with section labels (Sensory, Central, Drives, Motor) as HTML overlays positioned above the canvas regions. Single draw call using ANGLE_instanced_arrays. Update at display refresh rate, reading from the latest fire state buffer. Keep the tooltip on hover (raycast from mouse position to nearest neuron, show group name + description). [-PI-]

### T7.6: Loading and Fallback

- [x] T7.6: Load connectome.bin.gz at startup with a progress indicator in the left sidebar ("Loading connectome... 4.2/6.1 MB"). Parse in the Web Worker (receives ArrayBuffer, builds CSR, posts ready message). Show the existing 59-group dots while loading, then swap to the WebGL canvas when the worker is ready. Add a scale indicator to the header: "139,255 neurons / 2,713,004 connections -- FlyWire FAFB v783". Add a toggle (keyboard shortcut or button) to switch between full connectome and 59-group view. [-PI-]

### T7.7: Performance Tuning

- [x] T7.7: Profile and optimize. If 20 ticks/sec at 139K neurons is not achievable: (1) implement neuropil-gated simulation -- only tick neurons in neuropil regions that have active sensory input, lazy-activate regions when stimulation arrives, (2) use SIMD-friendly memory layout (struct-of-arrays), (3) reduce tick rate to 10/sec with interpolation in the renderer. Test on Chrome, Firefox, Safari. Verify fly behavior qualitatively matches the 59-group version. Document performance characteristics in SPEC.md. [SPI-]

- Discovery Round 22 (2 tasks archived to TASKS-ARCHIVE.md)
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
4. **Food -> Feed**: Place food near fly. Verify OLF_ORN_FOOD fires, fly walks toward food, GUS_GRN_SWEET fires on contact, accumFeed > 8, proboscis extends.
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

## Discovery Round 24: Test Coverage for Worker Bridge Pipeline

All 45 existing tests (tests/tests.js, tests/run-node.js) cover only the legacy 59-group path (constants.js, connectome.js, fly-logic.js). The 139K-neuron worker bridge path in brain-worker-bridge.js -- which is now the primary execution path -- has zero test coverage. Regressions in motor synthesis, fire state aggregation, or virtual group bypass would go completely undetected.

- [x] D24.1: Add unit tests for brain-worker-bridge.js motor synthesis and aggregation functions. The worker bridge IIFE currently hides all functions (synthesizeMotorOutputs, aggregateFireState, buildGroupIndices, sendStimulation) in closure scope, making them untestable from outside. Refactor to expose these as testable functions: either attach them to a test-only namespace (e.g., BRAIN._bridge = {synthesizeMotorOutputs, aggregateFireState, ...} guarded by a test flag), or extract the pure computational logic into a shared module loadable by both the bridge IIFE and the test runner. Then add 15-20 new test functions to tests/tests.js covering: (1) aggregateFireState -- given a synthetic Uint8Array fire state (e.g., 100 neurons, groups of 10) and groupIndices map, verify per-group activation is correctly computed as (sum of fired neurons in group / group size) * FIRE_STATE_SCALE, (2) synthesizeMotorOutputs -- given representative postSynaptic values for GNG_DESC, CX_PFN, CX_FC, DRIVE_FEAR, MB_MBON_AV etc., verify walkDrive produces accumWalkLeft+Right in 6-10 range for idle tonic input, flightIntent exceeds gate for high DRIVE_FEAR, groomIntent exceeds gate for high DRIVE_GROOM, and DN_STARTLE writes correctly to nextState, (3) virtual group bypass -- for groups with 0 neurons (DRIVE_FEAR, DRIVE_CURIOSITY, DRIVE_GROOM), verify that workerUpdate writes BRAIN.drives values to BRAIN.postSynaptic[groupName][nextState] scaled appropriately, (4) sendStimulation mapping -- verify BRAIN.stimulate.touch maps to MECH_BRISTLE, foodNearby maps to OLF_ORN_FOOD, lightLevel > 0.2 maps to VIS_R1R6 + VIS_R7R8, temperature thresholds map to THERMO_WARM/COOL, nociception maps to NOCI with 5x intensity and auto-clears. Update tests/run-node.js to load the refactored module. Prerequisite: D23.1-D23.4 must be complete first since the functions under test will change during those tasks. Files: js/brain-worker-bridge.js (refactor for testability), tests/tests.js (new test functions), tests/run-node.js (updated load list) [SPI-]

## Discovery Round 25

No new tasks discovered.

## Discovery Round 26

No new tasks discovered.

## Discovery Round 27

No new tasks discovered.

## Discovery Round 28

- [x] D28.1: Fix Math.random mock leak in tests causing cascading false failures. 9 test functions (2 pre-existing: test_dark_curiosity_range_reduced, test_bright_curiosity_range_normal; 7 new from D24.1: test_bridge_synthesize_walk_tonic, test_bridge_synthesize_flight_fear, test_bridge_synthesize_groom, test_bridge_synthesize_feed, test_bridge_virtual_bypass_fear, test_bridge_virtual_bypass_curiosity, test_bridge_virtual_bypass_groom) mock Math.random with a bare var origRandom = Math.random; Math.random = mock; ... Math.random = origRandom; pattern. If any of these tests throws before the restore line, the mock (always returning 0.5) leaks into ALL subsequent tests. This corrupts any test that depends on Math.random -- BRAIN.updateDrives() uses it for curiosity random walk (connectome.js:203), BRAIN.randExcite() uses it (connectome.js:228), and synthesizeMotorOutputs() uses it for walk jitter (brain-worker-bridge.js:323). A single bridge test failure would cause cascading false failures with misleading error messages, making the root cause hard to identify. Fix: wrap each mock/restore pair in try/finally so Math.random is always restored even on test failure. Consider adding a helper function like withMockedRandom(value, fn) to tests.js Section 1 to DRY the pattern and prevent future instances of the same bug. No try/finally is used anywhere in the current test file (confirmed via grep). Files: tests/tests.js (9 test functions across Section 3 and Section 5) [-PI-]

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

## Discovery Round 65

- [x] D65.1: Fix stale latestFireState in aggregateFireState() causing redundant 139K-neuron iteration and full motor pipeline execution on every animation frame between worker ticks. In brain-worker-bridge.js, workerUpdate() guards the aggregation/motor/swap block with `if (latestFireState || pendingWorkerTicks > 0)`. After the primary path (pendingGroupSpikes) runs and clears pendingGroupSpikes/pendingWorkerTicks, latestFireState remains non-null because aggregateFireState() never clears it. On subsequent frames before the next worker tick (~2-3 frames at 60fps/20Hz), the guard passes via the stale latestFireState, triggering the fallback path which iterates all 139K neurons from the old Uint8Array snapshot, then runs the full pipeline (virtual bypass, synthesizeMotorOutputs, motorcontrol, state swap). Effects: (a) ~5.6M wasted neuron iterations/sec (139K neurons * ~40 stale frames/sec), (b) the 0.75 prevActivation decay in aggregateFireState is bypassed between ticks because the stale snapshot re-injects the same windowActivation each frame via Math.max(windowActivation, prevActivation * 0.75), and (c) synthesizeMotorOutputs runs with fresh Math.random jitter on each stale frame causing micro-oscillations in walk left/right balance. Fix: set latestFireState = null at the end of aggregateFireState() after the fallback branch consumes it (BRAIN.latestFireState used by neuro-renderer.js is a separate reference and remains unaffected). Files: js/brain-worker-bridge.js (aggregateFireState around line 549, workerUpdate guard at line 368) [-PI-]

## Discovery Round 66

No new tasks discovered.

## Discovery Round 67

- [x] D67.1: Fix workerUpdate() timing mismatch between main-thread frame rate and worker tick rate causing lost nociception stimuli and attenuated drive responses. Two related bugs in brain-worker-bridge.js: (1) Nociception stimulus overwrite -- collectStimulationSegments() creates a NOCI segment and immediately clears BRAIN.stimulate.nociception (line 461). sendStimulation() runs every animation frame (~60fps), posting setStimulusState which fully replaces the worker's stored sustainedIndices/sustainedIntensities. The NOCI segment only exists in the frame where nociception fires; the next frame's setStimulusState overwrites it WITHOUT NOCI before the worker tick (~10-20Hz) processes it. Result: NOCI neurons in the worker are rarely stimulated, breaking the pain-to-DN_STARTLE pathway. The worker already has a 'stimulate' message type (sim-worker.js line 435) for one-shot immediate voltage injection, but nothing sends it. Fix: send one-shot stimuli like NOCI via the worker 'stimulate' message (immediate V[idx] += intensity) instead of including them in the setStimulusState bulk replacement, OR make sendStimulation merge one-shot segments into the sustained state without clearing them until a worker tick confirms consumption. (2) Drive-motor timing mismatch (D65.1 side effect) -- after D65.1 gated the motor pipeline behind if (latestFireState || pendingWorkerTicks > 0) at line 368, updateDrives() still runs every frame at ~60fps while the virtual bypass + synthesizeMotorOutputs + motorcontrol + state swap only run on worker ticks at ~10-20Hz. Transient drive signals (fear spikes at 0.85 decay per updateDrives call) attenuate by 0.85^k where k is 3-6 frames between stimulus and next motor pipeline execution, losing 40-60% of peak signal before it reaches the motor pipeline via virtual bypass. This weakens startle/flight responses from touch compared to pre-D65.1 behavior where the motor pipeline ran every frame. Fix: restructure workerUpdate to either (a) throttle updateDrives and sendStimulation to only run on worker ticks (adjusting drive accumulation/decay rates to compensate for lower frequency), or (b) split the guard so that aggregateFireState is gated on worker ticks but virtual bypass + synthesize + motorcontrol + swap run every frame using last-known aggregated postSynaptic values for non-drive groups. Option (a) also fixes the nociception overwrite since sendStimulation would only run once per tick. Files: js/brain-worker-bridge.js (workerUpdate at line 360, sendStimulation at line 479, collectStimulationSegments line 461), js/sim-worker.js (stimulate message handler at line 435) [-PI-]
