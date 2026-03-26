# Plan: T7.3

## Dependencies
- list: none (vanilla JS Web Worker, no external packages)
- commands: none

## File Operations (in execution order)

### 1. CREATE js/sim-worker.js
- operation: CREATE
- reason: Implement the LIF neuron simulator as a dedicated Web Worker that parses the connectome binary, builds CSR adjacency, and runs the tick loop

#### Imports / Dependencies
- No imports (self-contained Web Worker script using only Web APIs)

#### Constants (top of file)
```js
var DEFAULT_LEAK_RATE = 0.95;
var DEFAULT_THRESHOLD = 1.0;
var DEFAULT_REFRACTORY_PERIOD = 3;
var WEIGHT_SCALE = 0.15;
```

#### Module-level State Variables
Declare these at the top of the file, after constants. All initially `null` or `0`:

```js
var N = 0;               // neuron count
var edgeCount = 0;        // total edges
var V = null;             // Float32Array(N) — membrane potential
var fired = null;         // Uint8Array(N) — fire state from previous tick (read during propagation, overwritten during fire check)
var refractory = null;    // Uint8Array(N) — refractory countdown per neuron
var rowPtr = null;        // Uint32Array(N+1) — CSR row pointers
var colIdx = null;        // Uint32Array(edgeCount) — CSR column indices (post-synaptic neuron index per edge)
var values = null;        // Float32Array(edgeCount) — CSR edge weights (normalized)
var regionType = null;    // Uint8Array(N) — per-neuron region type (0=sensory,1=central,2=drives,3=motor)
var groupId = null;       // Uint16Array(N) — per-neuron group id (0..62)
var leakRate = DEFAULT_LEAK_RATE;
var threshold = DEFAULT_THRESHOLD;
var refractoryPeriod = DEFAULT_REFRACTORY_PERIOD;
var running = false;
var tickCount = 0;
```

#### Functions

---

- signature: `async function decompressGzip(buffer)` — returns `Promise<ArrayBuffer>`
  - purpose: Decompress a gzipped ArrayBuffer using the native DecompressionStream API
  - logic:
    1. Create a `new DecompressionStream('gzip')`
    2. Get a writer from `ds.writable.getWriter()`
    3. Call `writer.write(new Uint8Array(buffer))` then `writer.close()`
    4. Get a reader from `ds.readable.getReader()`
    5. Read all chunks in a while loop: `while (true) { const {value, done} = await reader.read(); if (done) break; chunks.push(value); }`
    6. Compute `totalLen` by summing `c.byteLength` for each chunk
    7. Create `result = new Uint8Array(totalLen)`
    8. Copy each chunk into `result` at the correct offset using `result.set(chunk, offset)`
    9. Return `result.buffer`
  - calls: Web API `DecompressionStream`, `WritableStreamDefaultWriter`, `ReadableStreamDefaultReader`
  - returns: `ArrayBuffer` containing the decompressed binary data
  - error handling: Let errors propagate (caller catches)

---

- signature: `function parseBinary(buffer)` — returns nothing (sets module-level state)
  - purpose: Parse the decompressed connectome binary into CSR format and per-neuron metadata
  - logic:
    1. Create `var view = new DataView(buffer)`
    2. Read `N = view.getUint32(0, true)` (little-endian neuron count)
    3. Read `edgeCount = view.getUint32(4, true)` (little-endian edge count)
    4. Define `var edgeOffset = 8`
    5. Define `var metaOffset = edgeOffset + edgeCount * 12`
    6. Allocate CSR arrays: `rowPtr = new Uint32Array(N + 1)`, `colIdx = new Uint32Array(edgeCount)`, `values = new Float32Array(edgeCount)`
    7. **First pass — count outgoing edges per neuron**: loop `e` from 0 to `edgeCount - 1`, read `var pre = view.getUint32(edgeOffset + e * 12, true)`, increment `rowPtr[pre + 1]++`
    8. **Prefix sum — convert counts to cumulative offsets**: loop `i` from 1 to `N`, set `rowPtr[i] += rowPtr[i - 1]`
    9. **Second pass — fill colIdx, values, and find maxAbsWeight**: initialize `var maxAbsW = 0`. Loop `e` from 0 to `edgeCount - 1`:
       - `var base = edgeOffset + e * 12`
       - `colIdx[e] = view.getUint32(base + 4, true)`
       - `var rawW = view.getFloat32(base + 8, true)`
       - `values[e] = rawW`
       - `var absW = rawW < 0 ? -rawW : rawW; if (absW > maxAbsW) maxAbsW = absW`
    10. **Normalize weights**: if `maxAbsW > 0`, loop `e` from 0 to `edgeCount - 1`, set `values[e] = (values[e] / maxAbsW) * WEIGHT_SCALE`
    11. **Read per-neuron metadata**: allocate `regionType = new Uint8Array(N)`, `groupId = new Uint16Array(N)`. Loop `i` from 0 to `N - 1`:
        - `regionType[i] = view.getUint8(metaOffset + i * 3)`
        - `groupId[i] = view.getUint16(metaOffset + i * 3 + 1, true)`
    12. **Allocate simulation state**: `V = new Float32Array(N)` (zeroed by default), `fired = new Uint8Array(N)` (zeroed), `refractory = new Uint8Array(N)` (zeroed)
    13. Reset `tickCount = 0`
  - calls: nothing (uses DataView directly)
  - returns: nothing (sets module-level variables N, edgeCount, rowPtr, colIdx, values, regionType, groupId, V, fired, refractory)
  - error handling: none — caller (init handler) wraps in try/catch

---

- signature: `function tick()` — returns nothing
  - purpose: Execute one LIF simulation step: decay, propagate, fire, refractory, post results
  - logic:
    1. Record tick start: `var t0 = performance.now()`
    2. **Step 1 — Decay V and decrement refractory**: loop `i` from 0 to `N - 1`:
       - If `refractory[i] > 0`: decrement `refractory[i]--` and set `V[i] = 0` (neuron is silent during refractory)
       - Else: `V[i] *= leakRate`
    3. **Step 2 — Propagate from fired neurons**: loop `i` from 0 to `N - 1`:
       - If `fired[i] === 0`, continue (skip non-fired neurons)
       - Loop `j` from `rowPtr[i]` to `rowPtr[i + 1] - 1` (exclusive upper bound: `j < rowPtr[i + 1]`):
         - `V[colIdx[j]] += values[j]`
    4. **Step 3 — Clear fired, check threshold, set new fire state**: call `fired.fill(0)`. Then loop `i` from 0 to `N - 1`:
       - If `refractory[i] === 0 && V[i] >= threshold`:
         - `fired[i] = 1`
         - `V[i] = 0` (reset membrane potential)
         - `refractory[i] = refractoryPeriod`
    5. **Post fire state to main thread**: `self.postMessage({type: 'tick', fireState: fired, tickCount: tickCount})` — structured clone (not transfer) so the worker retains `fired` for the next tick's propagation step
    6. Increment `tickCount++`
    7. **Schedule next tick** (only if `running` is true): `if (running) setTimeout(tick, 0)` — yields to event loop so incoming messages (stimulate, stop) can be processed between ticks
  - calls: `self.postMessage`
  - returns: nothing
  - error handling: none (hot loop — avoid try/catch for performance)

---

- signature: `self.onmessage = function(e)` — the Web Worker message handler
  - purpose: Handle init, start, stop, stimulate, and setParams messages from the main thread
  - logic — switch on `e.data.type`:

    **Case `'init'`**:
    1. Wrap in try/catch
    2. Read `var buffer = e.data.buffer` (the ArrayBuffer)
    3. Detect gzip: `var header = new Uint8Array(buffer, 0, 2)`. If `header[0] === 0x1f && header[1] === 0x8b`, call `decompressGzip(buffer).then(function(raw) { parseBinary(raw); postReady(); }).catch(function(err) { self.postMessage({type: 'error', message: 'Decompression failed: ' + err.message}); })` and return
    4. Otherwise (not gzipped): call `parseBinary(buffer)` then `postReady()`
    5. Define inline helper `function postReady() { self.postMessage({type: 'ready', neuronCount: N, edgeCount: edgeCount}); }` (defined before step 3)
    6. In the catch block: `self.postMessage({type: 'error', message: 'Init failed: ' + err.message})`

    **Case `'start'`**:
    1. If `N === 0`, post error: `self.postMessage({type: 'error', message: 'Cannot start: not initialized'})` and return
    2. Set `running = true`
    3. Call `setTimeout(tick, 0)` to begin the tick loop

    **Case `'stop'`**:
    1. Set `running = false` — the tick loop will stop at the next `setTimeout` check

    **Case `'stimulate'`**:
    1. Read `var indices = e.data.indices` (array or Uint32Array of neuron indices)
    2. Read `var intensities = e.data.intensities` (array or Float32Array of intensity values)
    3. Loop `k` from 0 to `indices.length - 1`:
       - `var idx = indices[k]`
       - If `idx < N`: `V[idx] += intensities[k]`

    **Case `'setParams'`**:
    1. If `e.data.leakRate !== undefined`: `leakRate = e.data.leakRate`
    2. If `e.data.threshold !== undefined`: `threshold = e.data.threshold`
    3. If `e.data.refractoryPeriod !== undefined`: `refractoryPeriod = e.data.refractoryPeriod`
    4. If `e.data.weightScale !== undefined` and `N > 0`: re-normalize weights — but this is complex so skip it; only allow at init time

  - calls: `decompressGzip`, `parseBinary`, `tick` (via setTimeout), `self.postMessage`
  - returns: nothing (event handler)
  - error handling: try/catch around init; out-of-bounds check on stimulate indices

#### Wiring / Integration
- This file is a standalone Web Worker. It will be instantiated by the main thread (in T7.4) via `new Worker('js/sim-worker.js')`
- No changes to existing files are required for T7.3 — integration with the main thread is T7.4's scope
- The worker's message protocol is:
  - **Main → Worker**: `{type:'init', buffer:ArrayBuffer}`, `{type:'start'}`, `{type:'stop'}`, `{type:'stimulate', indices:Uint32Array, intensities:Float32Array}`, `{type:'setParams', leakRate:number, threshold:number, refractoryPeriod:number}`
  - **Worker → Main**: `{type:'ready', neuronCount:number, edgeCount:number}`, `{type:'tick', fireState:Uint8Array, tickCount:number}`, `{type:'error', message:string}`

#### Complete file structure (top to bottom)
1. Header comment block: `/* LIF neuron simulator Web Worker — T7.3 */` with brief description of the binary format it expects: header (2×uint32: neuron_count, edge_count) + edges (uint32 pre, uint32 post, float32 weight per edge, sorted by pre) + metadata (uint8 region_type, uint16 group_id per neuron)
2. Constants block (4 constants listed above)
3. State variables block (all `null`/`0`/`false` initially)
4. `decompressGzip` function
5. `parseBinary` function
6. `tick` function
7. `self.onmessage` handler

## Verification
- build: no build step (vanilla JS)
- lint: `npx eslint js/sim-worker.js --no-eslintrc --rule '{"no-undef":"off","no-unused-vars":"warn"}' || true` (eslint may not be installed; this is best-effort)
- test: no existing test framework; use the smoke test below
- smoke: Open the browser console and run this snippet to verify the worker loads and responds to init without errors (requires a valid `data/connectome.bin.gz` file or can be tested with a minimal synthetic binary):
  ```
  // In browser console:
  var w = new Worker('js/sim-worker.js');
  w.onmessage = function(e) { console.log('Worker says:', e.data); };
  w.onerror = function(e) { console.error('Worker error:', e); };
  // If data/connectome.bin.gz exists:
  fetch('data/connectome.bin.gz').then(r => r.arrayBuffer()).then(buf => {
    w.postMessage({type: 'init', buffer: buf}, [buf]);
  });
  // Expected: {type: 'ready', neuronCount: 139255, edgeCount: <number>}
  // Then: w.postMessage({type: 'start'});
  // Expected: stream of {type: 'tick', fireState: Uint8Array(139255), tickCount: 0, 1, 2, ...}
  ```
  If no connectome data is available, verify the worker loads without script errors by running:
  ```
  var w = new Worker('js/sim-worker.js');
  w.onerror = function(e) { console.error('Load error:', e.message); };
  // Expected: no errors logged
  ```

## Constraints
- Do NOT modify any existing files (js/main.js, js/connectome.js, js/constants.js, etc.) — integration is T7.4's scope
- Do NOT add any external dependencies — the project uses vanilla JS with no build step
- Do NOT implement the main-thread loading/decompression/integration logic — that is T7.4 and T7.6
- The `fired` Uint8Array must NOT be transferred via `postMessage` transferable list — use structured clone so the worker retains the buffer for the next tick's propagation step
- Weight normalization must happen during `parseBinary`, not per-tick — `WEIGHT_SCALE` (0.15) divides the maximum absolute raw weight so the strongest single synapse contributes 0.15 toward the threshold of 1.0
- The `tick` function must not contain try/catch (performance-critical hot loop)
- Use `var` declarations (not `let`/`const`) to match the project's existing code style in js/connectome.js and js/constants.js
- Use `setTimeout(tick, 0)` for the tick loop, not `setInterval`, so the event loop can process incoming messages between ticks
- All DataView reads must use little-endian (`true` as the last argument) to match the Python struct pack format `<`
