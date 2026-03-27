# Problem: Fly Not Moving Despite 90% Active Neurons

## Context

FlyBrain is a browser-based Drosophila brain simulation. It uses the real FlyWire FAFB v783 connectome (139,255 neurons, 2.7M connections) running in a Web Worker (`js/sim-worker.js`) with a leaky integrate-and-fire model. The main thread behavioral layer reads motor neuron activations to drive fly movement on a canvas.

## Symptom

The fly displays "139,255 neurons (90% active, 0.5ms/tick)" but remains in "idle" state and never moves. Console debug shows:
```
[motor] GNG_DESC=0.0 VNC_CPG=0.0 total=0.0 accumL=0.0 accumR=0.0
```

## Root Cause: `aggregateFireState()` produces all zeros

Despite 90% of neurons firing in the worker, the `aggregateFireState()` function in `brain-worker-bridge.js` produces 0 for all groups including GNG_DESC. This means the virtual motor layer (`synthesizeMotorOutputs()`) receives 0 descending neuron input and produces 0 motor output.

## Architecture (data flow)

```
sim-worker.js (Web Worker)
  - Receives connectome.bin.gz (binary: edges + per-neuron group_id + region_type)
  - Runs LIF simulation at 10-20 Hz
  - Posts Uint8Array `fired` state back to main thread each tick
  - Also posts stats (activeNeurons count) periodically

brain-worker-bridge.js (main thread)
  - Loads data/neuron_meta.json for group names, sizes
  - Loads data/connectome.bin.gz, sends to worker
  - On worker 'ready': receives groupId (Uint16Array) and regionType (Uint8Array)
  - Replaces BRAIN.update() with workerUpdate()
  - workerUpdate() calls:
    1. BRAIN.updateDrives() -- drive state machine
    2. sendStimulation() -- maps BRAIN.stimulate flags to neuron indices, sends to worker
    3. aggregateFireState() -- sums fired neurons per group, writes to BRAIN.postSynaptic
    4. synthesizeMotorOutputs() -- virtual VNC: converts GNG_DESC activation to leg/wing motor groups
    5. BRAIN.motorcontrol() -- reads motor postSynaptic values, sets accumulators
    6. State swap

connectome.js (constants + legacy)
  - BRAIN.postSynaptic: keyed by group name (e.g., 'GNG_DESC'), value is [state0, state1]
  - BRAIN.weights: 59-group connectome weights (in constants.js)
  - BRAIN.setup() initializes postSynaptic from weights
  - BRAIN.motorcontrol() reads MN_LEG_L1..R3, MN_WING_L/R, etc. from postSynaptic
```

## What needs debugging

The `aggregateFireState()` function iterates 139K neurons, checks `fire[i]`, and increments `groupFires[groupIdArr[i]]`. Then it writes `(groupFires[g] / groupSizes[g]) * 100` to `BRAIN.postSynaptic[name][nextState]`.

Possible failure points (in order of likelihood):

### 1. `groupIdArr` mismatch
The bridge receives `groupIdArr` (Uint16Array) from the worker's 'ready' message (`e.data.groupId`). The worker parses this from the binary file. The bridge also loads `neuron_meta.json` for group names and sizes. If the binary and the JSON disagree on group IDs (e.g., stale cached binary), the aggregation maps neurons to wrong groups.

**Check**: Compare `groupIdArr[i]` distribution against `groupSizes` from meta.json. They should match.

### 2. `latestFireState` is always zeros
The worker reports 90% active in its stats message (computed internally), but the `fired` Uint8Array posted to the main thread via `{type: 'tick', fireState: fired}` might be all zeros when received. The worker reuses the `fired` array and may clear it between posting and the main thread reading it (race condition with structured clone).

**Check**: In `aggregateFireState()`, count how many `fire[i] !== 0` entries there are. If 0, the fire state transfer is broken.

### 3. `groupSizes` mismatch
The bridge reads `groupSizes` from `neuron_meta.json`. If this is a stale cached version (from a previous build), the sizes won't match the current binary's group assignments.

**Check**: Verify `data/neuron_meta.json` and `data/connectome.bin.gz` are from the same build. Add cache busters to the fetch URLs.

### 4. The 90% active figure is misleading
The worker's stats count active neurons internally. If the LIF simulation is in runaway excitation (all-excitatory saturated state), neurons may fire every tick but the `fired` array sent to the main thread might be from a different simulation phase.

**Check**: Add logging in `aggregateFireState()` to count total fired neurons from the received `latestFireState`.

## Key Files

| File | Role |
|------|------|
| `js/brain-worker-bridge.js` | Bridge between worker and behavioral layer. Contains `aggregateFireState()`, `synthesizeMotorOutputs()`, `sendStimulation()` |
| `js/sim-worker.js` | Web Worker running LIF simulation. Posts `fired` Uint8Array each tick |
| `js/connectome.js` | BRAIN object, postSynaptic, weights, motorcontrol() |
| `js/constants.js` | 59-group weight definitions |
| `js/fly-logic.js` | Behavior state machine (evaluateBehaviorEntry), movement |
| `js/main.js` | Main loop, calls BRAIN.update() + updateBehaviorState() + computeMovementForBehavior() |
| `data/connectome.bin.gz` | Binary connectome (edges + per-neuron metadata) |
| `data/neuron_meta.json` | Group names, sizes, region assignments |
| `scripts/build_connectome.py` | Preprocessing script that generates the binary + JSON |

## What the fix should achieve

1. `aggregateFireState()` should produce nonzero values for groups that have firing neurons
2. `GNG_DESC` (3,581 neurons, group_id 35) should have activation ~= (fired_count / 3581) * 100
3. `synthesizeMotorOutputs()` should convert GNG_DESC activation into MN_LEG_* values
4. `BRAIN.motorcontrol()` should set `accumWalkLeft + accumWalkRight > 5` (walk threshold)
5. The fly should transition from 'idle' to 'walk' or 'explore'

## Quick test

Add this to the top of `aggregateFireState()` after building `groupFires`:
```javascript
var totalFired = 0;
for (var i = 0; i < neuronCount; i++) { if (fire[i]) totalFired++; }
console.log('[agg] totalFired=' + totalFired + ' fire.length=' + fire.length + ' fire.constructor=' + fire.constructor.name);
```
If `totalFired` is 0 but the worker reports 90% active, the fire state transfer is broken.

## Additional context

- The layout was also changed from left sidebar to horizontal bottom panel (CSS + neuro-renderer.js)
- The build script (`scripts/build_connectome.py`) was modified to fix classification rules
- FlyWire FAFB is brain-only; no VNC (leg/wing motor neurons). A virtual motor layer in the bridge synthesizes motor outputs from descending neuron (GNG_DESC) activity.
