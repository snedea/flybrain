# Plan: D69.1

Fix four bugs in the Phase 8 caretaker pipeline: environment state float-vs-index mismatch, macOS date command incompatibility, missing .gitignore entry, and wasteful iOS WebSocket reconnect loop.

## Dependencies
- list: none (no new packages)
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/caretaker-bridge.js
- operation: MODIFY
- reason: Fix getState() environment fields to report integer indices instead of raw floats; add file:// protocol guard to skip WebSocket connection on iOS/WKWebView

#### Change 1: Fix getState() environment fields
- anchor: `environment: { lightLevel: BRAIN.stimulate.lightLevel, temperature: BRAIN.stimulate.temperature }`
- Replace the entire `environment` object in the return statement of `getState()` from:
  ```js
  environment: { lightLevel: BRAIN.stimulate.lightLevel, temperature: BRAIN.stimulate.temperature }
  ```
  to:
  ```js
  environment: { lightLevel: lightStateIndex, temperature: tempStateIndex }
  ```
- This changes the output from float values (lightLevel: 1.0/0.5/0.0, temperature: 0.5/0.75/0.25) to integer indices (lightLevel: 0/1/2, temperature: 0/1/2) matching the policy schema where 0=bright/1=dim/2=dark for light and 0=neutral/1=warm/2=cool for temp. The variables `lightStateIndex` and `tempStateIndex` are declared in main.js at lines 144 and 147 as global vars, accessible from this IIFE.

#### Change 2: Add index validation to set_light command handler
- anchor: `case 'set_light':`
- After the existing `if (lightMap.hasOwnProperty(params.level))` block (lines 42-47), add an `else if` branch that accepts numeric index directly:
  ```js
  case 'set_light':
    if (lightMap.hasOwnProperty(params.level)) {
      var li = lightMap[params.level];
      lightStateIndex = li;
      BRAIN.stimulate.lightLevel = lightStates[li];
      document.getElementById('lightBtn').textContent = 'Light: ' + lightLabels[li];
    } else if (typeof params.level === 'number' && params.level >= 0 && params.level <= 2) {
      var li2 = params.level;
      lightStateIndex = li2;
      BRAIN.stimulate.lightLevel = lightStates[li2];
      document.getElementById('lightBtn').textContent = 'Light: ' + lightLabels[li2];
    }
    break;
  ```
- This replaces lines 42-47 (the entire `case 'set_light':` block content before the `break;`).

#### Change 3: Add index validation to set_temp command handler
- anchor: `case 'set_temp':`
- Same pattern as set_light. Replace lines 49-54 with:
  ```js
  case 'set_temp':
    if (tempMap.hasOwnProperty(params.level)) {
      var ti = tempMap[params.level];
      tempStateIndex = ti;
      BRAIN.stimulate.temperature = tempStates[ti];
      document.getElementById('tempBtn').textContent = 'Temp: ' + tempLabels[ti];
    } else if (typeof params.level === 'number' && params.level >= 0 && params.level <= 2) {
      var ti2 = params.level;
      tempStateIndex = ti2;
      BRAIN.stimulate.temperature = tempStates[ti2];
      document.getElementById('tempBtn').textContent = 'Temp: ' + tempLabels[ti2];
    }
    break;
  ```

#### Change 4: Add file:// protocol guard in init()
- anchor: `function init() {`
- Replace the `init()` function (lines 105-108) with:
  ```js
  function init() {
    if (location.protocol === 'file:') {
      console.log('[caretaker] Skipping WebSocket connection in file:// context (iOS/local)');
      return;
    }
    if (typeof BRAIN !== 'undefined' && BRAIN.drives) { connect(); return; }
    setTimeout(init, 500);
  }
  ```
- This prevents the infinite 3-second reconnect loop when running inside WKWebView on iOS where location.protocol is "file:" and no WebSocket server exists.

### 2. MODIFY agent/run.sh
- operation: MODIFY
- reason: Fix macOS-incompatible date +%s%3N to produce valid millisecond timestamps

#### Change 1: Replace date command on line 134
- anchor: `CURRENT_TIME=$(date +%s%3N)`
- Replace:
  ```bash
  CURRENT_TIME=$(date +%s%3N)
  ```
  with:
  ```bash
  CURRENT_TIME=$(python3 -c "import time; print(int(time.time()*1000))")
  ```
- macOS BSD `date` does not support `%N` (GNU extension). The current command produces literal strings like `1711548000%3N` instead of numeric milliseconds, breaking policy rule 6 (idle > 120s check) because the LLM receives a garbage timestamp. Python3 is available on all macOS systems.

### 3. MODIFY agent/caretaker-policy.md
- operation: MODIFY
- reason: Update state schema documentation to explicitly confirm integer index semantics and document what getState() actually emits

#### Change 1: Update environment field documentation in State Schema
- anchor: `"lightLevel": 0 or 1 or 2,`
- No code change needed here -- the schema documentation already states `"lightLevel": 0 or 1 or 2` and `"temperature": 0 or 1 or 2` with field notes `lightLevel: 0=bright, 1=dim, 2=dark` and `temperature: 0=neutral, 1=warm, 2=cool`. This matches the target state after fixing caretaker-bridge.js. The documentation is already correct for the intended behavior.
- Verify the schema block and field notes are unchanged. No modification to this file is needed.

### 4. MODIFY .gitignore
- operation: MODIFY
- reason: Add caretaker-decisions.log which is written by agent/run.sh but currently not gitignored

#### Change 1: Add caretaker-decisions.log entry
- anchor: `caretaker.log`
- Add `caretaker-decisions.log` on a new line immediately after the existing `caretaker.log` line. The result should be:
  ```
  caretaker.log
  caretaker-decisions.log
  ```

## Verification
- build: no build step exists for this project (vanilla JS, no bundler)
- lint: no linter configured
- test: `node tests/run-node.js` (existing test suite -- verify it still passes; these tests do not cover caretaker-bridge directly but confirm no regressions)
- smoke:
  1. Open `js/caretaker-bridge.js` and confirm `getState()` returns `lightStateIndex` and `tempStateIndex` (not `BRAIN.stimulate.lightLevel` / `BRAIN.stimulate.temperature`)
  2. Open `agent/run.sh` and confirm line 134 uses `python3 -c "import time; print(int(time.time()*1000))"` instead of `date +%s%3N`
  3. Run `python3 -c "import time; print(int(time.time()*1000))"` in terminal and verify it outputs a 13-digit integer (milliseconds since epoch)
  4. Run `grep caretaker-decisions.log .gitignore` and verify it appears
  5. Confirm `caretaker-policy.md` state schema still shows `"lightLevel": 0 or 1 or 2` and `"temperature": 0 or 1 or 2` (unchanged -- was already correct)

## Constraints
- Do NOT modify SPEC.md, CLAUDE.md, or TASKS.md
- Do NOT modify main.js -- the lightStateIndex/tempStateIndex globals defined there are read-only from caretaker-bridge.js perspective
- Do NOT modify server/caretaker.js -- it is a pass-through relay and is not affected by these bugs
- Do NOT add any new files
- Do NOT change the caretaker-policy.md policy rules or output format -- only the state schema documentation if needed (and it turns out it is already correct)
- The set_light/set_temp numeric index validation is additive (else-if branch) -- do NOT remove or change the existing string-based lookup (`lightMap`/`tempMap`) which is the primary path used by the LLM agent
