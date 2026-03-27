# FlyBrain Tasks

- Phase 1: Foundation (3 tasks archived to TASKS-ARCHIVE.md)
- Phase 2: Behavioral Polish (1 tasks archived to TASKS-ARCHIVE.md)
- Phase 3: Bug Fixes and Rendering (1 tasks archived to TASKS-ARCHIVE.md)
- Phase 4: Missing Features and Interaction Polish (2 tasks archived to TASKS-ARCHIVE.md)
- Discovery Rounds 1-21 (archived to TASKS-ARCHIVE.md)
- Phase 5: Spec Compliance and Behavioral Enrichment (4 tasks archived to TASKS-ARCHIVE.md)
- Phase 6: Educational 3D Brain Visualization (3 tasks archived to TASKS-ARCHIVE.md)

## Phase 7: Full FlyWire Connectome (139K Neurons)

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

- [x] T7.4: Replace BRAIN.update() with Web Worker communication. Main thread sends stimulation events to the worker (food detected -> activate OLF_ORN neurons, touch -> activate MECH neurons, etc.) by mapping the existing BRAIN.stimulateNeuron calls to individual neuron indices using the group mapping. Worker posts back Uint8Array fire states. Main thread aggregates fire states into the 59 functional groups (sum of fires / group size) and writes to BRAIN.postSynaptic format so the existing behavioral state machine (updateBehaviorState, computeMovementForBehavior, drive updates) works unchanged. Add a compatibility shim: if connectome.bin.gz fails to load, fall back to current 59-group BRAIN.update() with a console warning. [-PI-]

### T7.5: WebGL2 Visualization

- [x] T7.5: Replace the DOM-based dot clusters in the left sidebar with a WebGL2 canvas (js/neuro-renderer.js) that renders 139K neurons as instanced points. Each neuron is a 1-2px point colored by region type (sensory blue, central purple, drives amber, motor red), brightness driven by fire state from the Uint8Array. Layout: neurons arranged within their region section in a grid pattern, with section labels (Sensory, Central, Drives, Motor) as HTML overlays positioned above the canvas regions. Single draw call using ANGLE_instanced_arrays. Update at display refresh rate, reading from the latest fire state buffer. Keep the tooltip on hover (raycast from mouse position to nearest neuron, show group name + description). [-PI-]

### T7.6: Loading and Fallback

- [x] T7.6: Load connectome.bin.gz at startup with a progress indicator in the left sidebar ("Loading connectome... 4.2/6.1 MB"). Parse in the Web Worker (receives ArrayBuffer, builds CSR, posts ready message). Show the existing 59-group dots while loading, then swap to the WebGL canvas when the worker is ready. Add a scale indicator to the header: "139,255 neurons / 2,713,004 connections -- FlyWire FAFB v783". Add a toggle (keyboard shortcut or button) to switch between full connectome and 59-group view. [-PI-]

### T7.7: Performance Tuning

- [x] T7.7: Profile and optimize. If 20 ticks/sec at 139K neurons is not achievable: (1) implement neuropil-gated simulation -- only tick neurons in neuropil regions that have active sensory input, lazy-activate regions when stimulation arrives, (2) use SIMD-friendly memory layout (struct-of-arrays), (3) reduce tick rate to 10/sec with interpolation in the renderer. Test on Chrome, Firefox, Safari. Verify fly behavior qualitatively matches the 59-group version. Document performance characteristics in SPEC.md. [SPI-]

## Discovery Round 22

- [ ] D22.1: Fix sim-worker not pausing on tab hide causing stale neural state on resume. The visibilitychange handler in main.js:535 stops the setInterval brain tick and resets drives/stimuli, but the sim-worker tick loop (setTimeout-based) continues running in background tabs at a throttled rate. The worker accumulates stale neural state (V, fired, refractory, group activation) using the last sustained stimulation snapshot. On resume, aggregateFireState() reads this drifted state, causing a burst of anomalous activity. The bridge module (brain-worker-bridge.js) scopes `worker` inside its IIFE and exposes no pause/resume API, so main.js cannot signal the worker. Fix: expose stopWorker()/startWorker() from the bridge (or add them to BRAIN), and call them from the visibilitychange handler alongside the existing setInterval cleanup.
- [ ] D22.2: Fix NeuroRenderer (js/neuro-renderer.js) GPU resource leak and missing resize handling. (1) destroy() sets posBuffer/colorBuffer/brightnessBuffer/program to null but never calls gl.deleteBuffer() or gl.deleteProgram(), leaking GPU resources each time the user toggles between 59-group and 139K views via the connectome toggle button. (2) Canvas width, neuron grid positions, section bounds, and GL viewport are computed once in init() and never updated on window resize. The main fly canvas has a resize handler (main.js:1833) but the NeuroRenderer has none. Fix: add gl.delete* calls in destroy() before nulling references, and add a ResizeObserver (or window resize listener) that recomputes layout and re-uploads position buffers.
