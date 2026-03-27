# Plan: T7.7

## Dependencies
- list: [] (no new packages needed)
- commands: [] (no install commands needed)

## File Operations (in execution order)

### 1. MODIFY js/sim-worker.js
- operation: MODIFY
- reason: Add performance profiling, tick rate control, neuropil-gated simulation with group-level activity tracking, and self-adjusting tick rate fallback

#### New Constants
- anchor: `var WEIGHT_SCALE = 0.15;`
- Add these lines immediately AFTER `var WEIGHT_SCALE = 0.15;`:

```js
var TARGET_TICK_RATE = 20;
var MIN_TICK_RATE = 10;
var ADJUST_THRESHOLD_MS = 40;
var COOLDOWN_TICKS = 20;
var STATS_INTERVAL = 20;
```

- `TARGET_TICK_RATE`: default target ticks per second (20)
- `MIN_TICK_RATE`: fallback tick rate if tick time exceeds threshold (10)
- `ADJUST_THRESHOLD_MS`: if average tick ms exceeds this, drop to MIN_TICK_RATE (40ms)
- `COOLDOWN_TICKS`: ticks before an idle group deactivates (1 second at 20 ticks/sec)
- `STATS_INTERVAL`: report performance stats every N ticks (20)

#### New State Variables
- anchor: `var tickCount = 0;`
- Add these lines immediately AFTER `var tickCount = 0;`:

```js
var targetTickRate = TARGET_TICK_RATE;
var tickTimeSum = 0;
var tickTimeSamples = 0;
var activeNeuronCount = 0;

/* neuropil-gated simulation structures (built by buildGroupStructures) */
var numGroups = 0;
var groupOffset = null;
var sortedByGroup = null;
var groupActive = null;
var groupCooldown = null;
```

- `targetTickRate`: current target (may be adjusted at runtime between TARGET_TICK_RATE and MIN_TICK_RATE)
- `tickTimeSum` / `tickTimeSamples`: rolling profiling accumulators
- `activeNeuronCount`: count of neurons in currently active groups (for stats)
- `numGroups`: total number of neuron groups (derived from max groupId + 1)
- `groupOffset`: Uint32Array[numGroups + 1] — prefix-sum offsets into sortedByGroup per group
- `sortedByGroup`: Uint32Array[N] — neuron indices sorted by group; neurons of group g occupy indices groupOffset[g] .. groupOffset[g+1]-1
- `groupActive`: Uint8Array[numGroups] — 1 if group is active (being ticked), 0 if dormant
- `groupCooldown`: Uint8Array[numGroups] — ticks remaining before group deactivates (reset on activity)

#### New Function: buildGroupStructures
- Insert this function AFTER the closing `}` of `parseBinary` (after the line `tickCount = 0;` and the closing brace of parseBinary)

```
function buildGroupStructures() {
```

- signature: `function buildGroupStructures()`
  - purpose: Build group-sorted neuron structure and activity tracking arrays for neuropil-gated simulation
  - logic:
    1. Compute `numGroups` by iterating `groupId[0..N-1]` and tracking the maximum value + 1
    2. Allocate `counts = new Uint32Array(numGroups)`. Iterate all N neurons, incrementing `counts[groupId[i]]`
    3. Build `groupOffset = new Uint32Array(numGroups + 1)`. For g = 0 to numGroups-1: `groupOffset[g + 1] = groupOffset[g] + counts[g]`
    4. Allocate `sortedByGroup = new Uint32Array(N)`. Create `writePos = new Uint32Array(numGroups)`. Copy groupOffset[g] into writePos[g] for each g. Iterate all N neurons: `sortedByGroup[writePos[groupId[i]]++] = i`
    5. Allocate `groupActive = new Uint8Array(numGroups)` (initialized to 0)
    6. Allocate `groupCooldown = new Uint8Array(numGroups)` (initialized to 0)
  - calls: none
  - returns: void (sets module-level variables)
  - error handling: none needed; if N is 0, all loops are no-ops

#### Modify parseBinary: add call to buildGroupStructures
- anchor: `tickCount = 0;` (line 124, inside parseBinary)
- Add `buildGroupStructures();` on the line immediately AFTER `tickCount = 0;`

#### Replace tick() Function
- anchor: `function tick() {`
- Replace the ENTIRE `tick()` function (from `function tick() {` through the closing `}` just before `/* ---------- message handler ---------- */`) with:

- signature: `function tick()`
  - purpose: Neuropil-gated LIF simulation tick with profiling and rate control
  - logic:
    1. Record `var t0 = performance.now();`
    2. **Step 1 — Decay V and decrement refractory for ACTIVE groups only:**
       - For each group g from 0 to numGroups-1: if `groupActive[g]` is 0, skip. Otherwise iterate k from `groupOffset[g]` to `groupOffset[g+1]-1`. Let `i = sortedByGroup[k]`. If `refractory[i] > 0`: decrement `refractory[i]`, set `V[i] = 0`. Else: `V[i] *= leakRate`.
    3. **Step 1.5 — Apply sustained external stimulation and activate groups:**
       - If `sustainedIndices` is not null, iterate k from 0 to `sustainedIndices.length - 1`. Let `si = sustainedIndices[k]`. If `si < N` and `refractory[si] === 0`: add `sustainedIntensities[k]` to `V[si]`. Then: `var sg = groupId[si]; if (!groupActive[sg]) { groupActive[sg] = 1; } groupCooldown[sg] = COOLDOWN_TICKS;`
    4. **Step 2 — Propagate from fired neurons in ACTIVE groups, lazy-activate target groups:**
       - For each group g from 0 to numGroups-1: if `groupActive[g]` is 0, skip. Otherwise iterate k from `groupOffset[g]` to `groupOffset[g+1]-1`. Let `i = sortedByGroup[k]`. If `fired[i] === 0`, continue. Otherwise iterate j from `rowPtr[i]` to `rowPtr[i+1]-1`. Let `post = colIdx[j]`. Add `values[j]` to `V[post]`. Let `pg = groupId[post]`. If `!groupActive[pg]`: set `groupActive[pg] = 1; groupCooldown[pg] = COOLDOWN_TICKS;`
    5. **Step 3 — Clear fired, check threshold for ACTIVE groups:**
       - Call `fired.fill(0)` (memset clears all N neurons; fast and ensures clean state for inactive groups)
       - For each group g from 0 to numGroups-1: if `groupActive[g]` is 0, skip. Otherwise iterate k from `groupOffset[g]` to `groupOffset[g+1]-1`. Let `i = sortedByGroup[k]`. If `refractory[i] === 0` and `V[i] >= threshold`: set `fired[i] = 1`, set `V[i] = 0`, set `refractory[i] = refractoryPeriod`, set `groupCooldown[g] = COOLDOWN_TICKS`.
    6. **Step 4 — Update group cooldowns and deactivate idle groups:**
       - Set `activeNeuronCount = 0`. For each group g from 0 to numGroups-1: if `groupActive[g]` is 0, skip. Add `groupOffset[g+1] - groupOffset[g]` to `activeNeuronCount`. Decrement `groupCooldown[g]`. If `groupCooldown[g] <= 0`: set `groupActive[g] = 0`, then iterate k from `groupOffset[g]` to `groupOffset[g+1]-1` and set `V[sortedByGroup[k]] = 0; fired[sortedByGroup[k]] = 0; refractory[sortedByGroup[k]] = 0;`
    7. **Post fire state to main thread:**
       - `self.postMessage({type: 'tick', fireState: fired, tickCount: tickCount});`
       - Increment `tickCount`
    8. **Performance tracking and self-adjusting tick rate:**
       - `var elapsed = performance.now() - t0;`
       - Add `elapsed` to `tickTimeSum`, increment `tickTimeSamples`
       - If `tickTimeSamples >= STATS_INTERVAL`:
         - Compute `var avgMs = tickTimeSum / tickTimeSamples;`
         - Compute `var activeGroupCount = 0; for (var g = 0; g < numGroups; g++) { if (groupActive[g]) activeGroupCount++; }`
         - Post stats: `self.postMessage({type: 'stats', avgTickMs: avgMs, activeNeurons: activeNeuronCount, activeGroups: activeGroupCount, tickRate: targetTickRate});`
         - Reset: `tickTimeSum = 0; tickTimeSamples = 0;`
         - Self-adjust: if `avgMs > ADJUST_THRESHOLD_MS && targetTickRate > MIN_TICK_RATE`: set `targetTickRate = MIN_TICK_RATE`. Else if `avgMs < ADJUST_THRESHOLD_MS * 0.5 && targetTickRate < TARGET_TICK_RATE`: set `targetTickRate = TARGET_TICK_RATE`.
    9. **Schedule next tick with rate control:**
       - If `running`: compute `var targetMs = 1000 / targetTickRate; var delay = Math.max(0, Math.floor(targetMs - elapsed)); setTimeout(tick, delay);`
  - calls: self.postMessage (twice per tick: tick + optionally stats)
  - returns: void
  - error handling: none; all array accesses are bounds-checked by the group structure

#### Modify 'start' message handler
- anchor: `case 'start':`
- Replace the line `setTimeout(tick, 0);` (line 215) with `setTimeout(tick, Math.floor(1000 / targetTickRate));`

#### Modify 'stimulate' message handler
- anchor (unique line): `case 'stimulate':`
- After the existing `V[idx] += intensities[k];` line, add these 4 lines:
```js
var sg = groupId[idx];
if (!groupActive[sg]) {
    groupActive[sg] = 1;
}
groupCooldown[sg] = COOLDOWN_TICKS;
```

#### Modify 'setStimulusState' message handler
- anchor: `case 'setStimulusState':`
- After the existing `sustainedIntensities = e.data.intensities;` line, add:
```js
if (sustainedIndices) {
    for (var k = 0; k < sustainedIndices.length; k++) {
        var idx = sustainedIndices[k];
        if (idx < N) {
            var sg = groupId[idx];
            if (!groupActive[sg]) {
                groupActive[sg] = 1;
            }
            groupCooldown[sg] = COOLDOWN_TICKS;
        }
    }
}
```

#### Add 'setTickRate' message handler
- anchor: `case 'setParams':`
- Add this new case BEFORE `case 'setParams':`:
```js
case 'setTickRate':
    if (e.data.rate >= MIN_TICK_RATE && e.data.rate <= 60) {
        targetTickRate = e.data.rate;
    }
    break;
```

### 2. MODIFY js/brain-worker-bridge.js
- operation: MODIFY
- reason: Handle performance stats messages from worker, expose group count and stats on BRAIN object

#### Add BRAIN.workerGroupCount in 'ready' handler
- anchor: `BRAIN.workerEdgeCount = e.data.edgeCount;` (line 149)
- Add this line immediately AFTER that anchor:
```js
BRAIN.workerGroupCount = groupCount;
BRAIN.workerStats = null;
```

#### Add 'stats' case in handleWorkerMessage
- anchor: `case 'error':` (line 183, inside handleWorkerMessage switch)
- Add this new case BEFORE `case 'error':`:
```js
case 'stats':
    BRAIN.workerStats = {
        avgTickMs: e.data.avgTickMs,
        activeNeurons: e.data.activeNeurons,
        activeGroups: e.data.activeGroups,
        tickRate: e.data.tickRate
    };
    break;
```

### 3. MODIFY js/neuro-renderer.js
- operation: MODIFY
- reason: Replace binary brightness with smooth decay interpolation for visual continuity at lower tick rates

#### Modify renderLoop brightness computation (fire present)
- anchor: `brightnessData[i] = fire[i] ? 1.0 : 0.0;` (line 277)
- Replace that single line with:
```js
brightnessData[i] = fire[i] ? 1.0 : brightnessData[i] * 0.85;
```

#### Modify renderLoop brightness computation (no fire state available)
- anchor: the SECOND for-loop inside renderLoop that sets `brightnessData[i] = 0.0;` (line 281)
- Replace `brightnessData[i] = 0.0;` with:
```js
brightnessData[i] *= 0.85;
```

### 4. MODIFY index.html
- operation: MODIFY
- reason: Add performance stats overlay element

#### Add perfStats div
- anchor: `<div id="left-panel">` (line 42)
- Add this line immediately BEFORE `<div id="left-panel">`:
```html
    <div id="perfStats" style="display:none;position:fixed;top:48px;right:8px;background:rgba(0,0,0,0.7);color:#4ade80;font-family:monospace;font-size:0.75rem;padding:4px 8px;border-radius:4px;z-index:100;pointer-events:none;"></div>
```

### 5. MODIFY js/main.js
- operation: MODIFY
- reason: Add keyboard shortcut 'p' to toggle performance stats overlay, and update stats display in brain tick

#### Add 'p' keyboard shortcut listener
- anchor: the closing `});` of the 'v' keydown listener, which is on the line after `connectomeToggleBtn.click();` (line 520-521 area)
- Add this block immediately AFTER the closing `});` of the 'v' key listener:
```js

// Keyboard shortcut: 'p' toggles performance stats overlay
document.addEventListener('keydown', function (e) {
    if (e.key === 'p' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        var el = document.getElementById('perfStats');
        if (el) el.style.display = el.style.display === 'none' ? '' : 'none';
    }
});
```

#### Add stats display update in updateBrain
- anchor: `if (behaviorStateEl) behaviorStateEl.textContent = behavior.current;` (line 499)
- Add this block immediately AFTER that line (still inside the updateBrain function, before the closing `}`):
```js

    // Update performance stats overlay if visible
    var perfStatsEl = document.getElementById('perfStats');
    if (perfStatsEl && perfStatsEl.style.display !== 'none' && BRAIN.workerStats) {
        var s = BRAIN.workerStats;
        var activeK = (s.activeNeurons / 1000).toFixed(0);
        var totalK = BRAIN.workerNeuronCount ? (BRAIN.workerNeuronCount / 1000).toFixed(0) : '?';
        var totalGroups = BRAIN.workerGroupCount || '?';
        perfStatsEl.textContent = 'Tick: ' + s.avgTickMs.toFixed(1) + 'ms | Rate: ' + s.tickRate + '/s | Active: ' + activeK + 'K/' + totalK + 'K neurons (' + s.activeGroups + '/' + totalGroups + ' groups)';
    }
```

### 6. MODIFY SPEC.md
- operation: MODIFY
- reason: Document performance characteristics as required by T7.7

#### Add Performance Characteristics section
- anchor: `## Stretch Goals (not in v0.1)` (line 123)
- Add this entire section BEFORE the `## Stretch Goals` line:

```markdown
## Performance Characteristics

### Simulation Tick Rate
- Target: 20 ticks/second (50ms per tick budget)
- Fallback: 10 ticks/second if average tick time exceeds 40ms
- Self-adjusting: the Web Worker automatically switches between 20 and 10 ticks/sec based on measured performance. When average tick time drops below 20ms, it restores 20 ticks/sec.
- Brain update on main thread runs at 2Hz (500ms interval), reading the latest fire state from the worker

### Neuropil-Gated Simulation
The simulator gates computation by neuron group (63 groups total). Only groups with recent activity are ticked each cycle:

- **Activation**: A group activates when any of its neurons receives external stimulation (sensory or drive input from main thread) or synaptic input from a neuron in another active group
- **Deactivation**: A group deactivates after 20 ticks (~1 second at 20 ticks/sec) with no new input or firing
- **Lazy propagation**: When a fired neuron's outgoing edge targets a neuron in an inactive group, that target group is immediately activated and its cooldown timer reset
- **Cleanup**: On deactivation, all membrane potentials (V), fire states, and refractory counters for the group's neurons are zeroed to prevent stale state accumulation
- **Benefit**: Idle regions consume zero computation. Typical active neuron count during user interaction: 40-80K of 139K (30-60% of total). During idle periods with only tonic central-complex stimulation: ~15-30K

### Memory Layout (Struct-of-Arrays)
All per-neuron state uses separate TypedArrays for SIMD-friendly linear access:
- `V`: Float32Array[139,255] — membrane potential (~544 KB)
- `fired`: Uint8Array[139,255] — binary fire state (~136 KB)
- `refractory`: Uint8Array[139,255] — refractory counter (~136 KB)
- CSR sparse adjacency: `rowPtr` Uint32Array[139,256], `colIdx` Uint32Array[~2.7M], `values` Float32Array[~2.7M] (~21.6 MB)
- Group-sorted index: `sortedByGroup` Uint32Array[139,255] (~544 KB)

Total worker memory: ~24 MB for simulation state + ~6 MB compressed connectome binary

### Renderer Interpolation
The WebGL neuron renderer (neuro-renderer.js) runs at display refresh rate (typically 60fps). Brightness for each neuron decays by factor 0.85 per frame when not firing, providing smooth visual fade-out between simulation ticks. At 60fps, a neuron that stops firing fades from full brightness to ~20% over 10 frames (~167ms), creating visual continuity regardless of tick rate.

### Performance Stats Overlay
Press **P** to toggle a real-time performance overlay showing:
- Average tick computation time (ms)
- Current tick rate (ticks/sec, 20 or 10)
- Active neuron count and percentage
- Active group count out of 63 total

### Browser Compatibility
- **Chrome**: Best performance due to V8 JIT optimization of TypedArray operations in Web Workers. Expected tick time: 5-15ms.
- **Firefox**: SpiderMonkey handles TypedArray loops well. Expected tick time: 8-20ms. Uses setTimeout minimum of 4ms in workers.
- **Safari**: JavaScriptCore Web Worker performance varies. Expected tick time: 10-25ms. DecompressionStream for gzip decoding is supported in Safari 16.4+.

```

## Verification
- build: no build step (vanilla JS project)
- lint: `node --check js/sim-worker.js && node --check js/neuro-renderer.js && node --check js/brain-worker-bridge.js`
- test: no existing tests cover the worker simulation. Existing tests in tests/tests.js cover the 59-group BRAIN logic which is unchanged.
- smoke: Open index.html in a browser. Wait for "Loading connectome..." to complete. Press **P** to verify the performance stats overlay appears with tick rate, tick time, active neurons, and active groups. Interact with the fly (Feed, Touch, Air tools) and verify: (1) tick rate stays at 20/s or adjusts to 10/s, (2) active neuron count increases during interaction, (3) fly behavior qualitatively matches the 59-group version — walk, feed, groom, startle, flight behaviors all trigger correctly. Test in Chrome, Firefox, and Safari. Verify the WebGL neuron visualization shows smooth brightness decay (neurons glow and fade rather than flickering on/off). Toggle to 59-group view with V key and confirm legacy mode still works. If the connectome binary fails to load, verify fallback to 59-group mode with console warning.

## Constraints
- Do NOT modify js/constants.js, js/fly-logic.js, or js/connectome.js — the behavioral layer must remain unchanged
- Do NOT modify tests/tests.js — existing tests must continue to pass
- Do NOT change the binary connectome format or neuron_meta.json schema — these are outputs of T7.1/T7.2
- Do NOT change the worker message protocol for existing message types (init, start, stop, stimulate, setStimulusState, setParams, ready, tick, error) — only ADD new types (stats, setTickRate)
- Do NOT use ES6+ syntax (let, const, arrow functions, template literals) — project uses ES5 var-style throughout for maximum browser compatibility
- Do NOT add external dependencies — this is a zero-dependency vanilla JS project
- The `fired` Uint8Array is posted via structured clone (not transferable) — this is intentional; at 20 ticks/sec the 139K clone overhead (~2.8 MB/s) is negligible and avoids double-buffer complexity
- Keep `fired.fill(0)` as a full-array memset in step 3 of tick() — do NOT attempt to selectively clear only active-group neurons, as memset is faster than conditional iteration for 139K bytes
- The self-adjusting tick rate logic MUST only reduce from 20 to 10 (never below 10) and restore from 10 to 20 (never above 20), using hysteresis (reduce at >40ms avg, restore at <20ms avg) to prevent oscillation
