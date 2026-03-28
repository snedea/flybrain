# Plan: T8.1

Build WebSocket bridge and caretaker server. Three new files + one modification.

## Dependencies
- list: [`ws@8.18.0`]
- commands: [`cd /Users/name/homelab/flybrain && npm init -y && npm install ws@8.18.0`]

## File Operations (in execution order)

### 1. CREATE `package.json`
- operation: CREATE
- reason: Project has no package.json. Needed for the `ws` npm dependency used by `server/caretaker.js`.

#### Content
```json
{
  "name": "flybrain",
  "version": "1.0.0",
  "private": true,
  "description": "Interactive virtual Drosophila",
  "scripts": {
    "caretaker": "node server/caretaker.js"
  },
  "dependencies": {
    "ws": "^8.18.0"
  }
}
```

Note: Use `npm init -y` then `npm install ws@8.18.0` to generate the lock file. Then overwrite package.json with the above content (keeping the generated lock file).

---

### 2. CREATE `server/caretaker.js`
- operation: CREATE
- reason: WebSocket server bridging browser state to Claude Code via stdin/stdout, plus JSON Lines logging and incident detection.

#### Imports / Dependencies
```javascript
var WebSocket = require('ws');
var http = require('http');
var fs = require('fs');
var path = require('path');
var readline = require('readline');
```

#### Constants
```javascript
var PORT = parseInt(process.env.CARETAKER_PORT, 10) || 7600;
var LOG_PATH = path.join(__dirname, '..', 'caretaker.log');
```

#### State Variables
```javascript
var logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
var lastState = null;         // most recent fly state from browser
var lastActionTime = 0;       // timestamp of last Claude action sent
var lastActionType = null;    // string name of last Claude action
var preFearLevel = 0;         // fear level before last Claude action
var browserSocket = null;     // current WebSocket connection (only one browser at a time)
```

#### Functions

- signature: `function writeLog(entry)`
  - purpose: Append a JSON Lines entry to caretaker.log
  - logic:
    1. Set `entry.timestamp = new Date().toISOString()`
    2. Call `logStream.write(JSON.stringify(entry) + '\n')`
  - returns: void

- signature: `function writeStdout(obj)`
  - purpose: Send a JSON line to stdout for Claude Code to read
  - logic:
    1. Call `process.stdout.write(JSON.stringify(obj) + '\n')`
  - returns: void

- signature: `function detectIncidents(state)`
  - purpose: Check for incidents based on current state and recent actions
  - logic:
    1. Extract `fear = state.drives.fear`, `hunger = state.drives.hunger`, `foodCount = state.food.length`
    2. **Scared the fly**: If `lastActionTime > 0` AND `Date.now() - lastActionTime < 5000` AND `fear - preFearLevel > 0.2`, create incident `{ type: "incident", incident: "scared_the_fly", action: lastActionType, fearBefore: preFearLevel, fearAfter: fear, flyState: state }`. Call `writeLog(incident)`. Call `writeStdout(incident)`. Reset `lastActionTime = 0`.
    3. **Forgot to feed**: If `hunger > 0.9` AND `foodCount === 0`, create incident `{ type: "incident", incident: "forgot_to_feed", hunger: hunger, flyState: state }`. Call `writeLog(incident)`. Call `writeStdout(incident)`.
  - returns: void

- signature: `function handleStateMessage(data)`
  - purpose: Process a state update from the browser
  - logic:
    1. Parse `msg = JSON.parse(data)`. If parse fails, return.
    2. If `msg.type !== 'state'`, return.
    3. Set `lastState = msg.data`
    4. Create log entry `{ type: "observation", data: msg.data }`
    5. Call `writeLog(logEntry)`
    6. Call `writeStdout({ type: "state", timestamp: new Date().toISOString(), data: msg.data })`
    7. Call `detectIncidents(msg.data)`
  - returns: void

- signature: `function handleStdinCommand(line)`
  - purpose: Process a command line from stdin (from Claude Code)
  - logic:
    1. Parse `cmd = JSON.parse(line)`. If parse fails, write error to stderr and return.
    2. Validate `cmd.action` is one of: `'place_food'`, `'set_light'`, `'set_temp'`, `'touch'`, `'blow_wind'`, `'clear_food'`. If not, write error to stderr and return.
    3. Record pre-action state: `preFearLevel = lastState ? lastState.drives.fear : 0`
    4. Set `lastActionTime = Date.now()`
    5. Set `lastActionType = cmd.action`
    6. Create log entry `{ type: "action", action: cmd.action, params: cmd.params || {}, reasoning: cmd.reasoning || "", flyState: lastState }`
    7. Call `writeLog(logEntry)`
    8. If `browserSocket` is not null and `browserSocket.readyState === WebSocket.OPEN`:
       - Send `JSON.stringify({ type: "command", action: cmd.action, params: cmd.params || {} })` to `browserSocket`
       - Call `writeStdout({ type: "action_ack", action: cmd.action, success: true })`
    9. Else: call `writeStdout({ type: "action_ack", action: cmd.action, success: false, error: "no browser connected" })`
  - returns: void

#### Server Setup (top-level wiring after function definitions)

1. Create HTTP server: `var server = http.createServer()` (no routes needed, only WebSocket).
2. Create WebSocket server: `var wss = new WebSocket.Server({ server: server })`.
3. On `wss` `'connection'` event with callback `function(ws)`:
   - Set `browserSocket = ws`
   - Write to stderr: `'[caretaker] Browser connected\n'`
   - On `ws` `'message'` event: call `handleStateMessage(data.toString())`
   - On `ws` `'close'` event: set `browserSocket = null`, write to stderr `'[caretaker] Browser disconnected\n'`
   - On `ws` `'error'` event: write error to stderr
4. Set up stdin readline:
   ```javascript
   var rl = readline.createInterface({ input: process.stdin, terminal: false });
   rl.on('line', handleStdinCommand);
   rl.on('close', function() { process.exit(0); });
   ```
5. Start server: `server.listen(PORT, function() { process.stderr.write('[caretaker] WebSocket server on port ' + PORT + '\n'); })`
6. Handle SIGINT/SIGTERM: close `logStream`, close `wss`, call `process.exit(0)`.

#### Error Handling
- JSON parse errors in `handleStateMessage`: catch and write to stderr, do not crash.
- JSON parse errors in `handleStdinCommand`: catch and write to stderr, write error JSON to stdout.
- WebSocket send errors: catch and write to stderr.

---

### 3. CREATE `js/caretaker-bridge.js`
- operation: CREATE
- reason: Browser-side WebSocket client that serializes fly state at ~1Hz and executes commands received from the server.

#### Design Notes
- All variables referenced (`fly`, `food`, `behavior`, `BRAIN`, `facingDir`, `speed`, `lightStates`, `lightStateIndex`, `lightLabels`, `tempStates`, `tempStateIndex`, `tempLabels`, `windResetTime`, `touchResetTime`, `applyTouchTool`) are globals defined in `main.js` and `connectome.js`. Since all scripts share the global scope, they are accessible directly.
- Wrap everything in an IIFE `(function() { ... })()` to avoid polluting global scope with bridge internals.
- Expose `window.caretakerBridge` for debugging (connection status, manual send).

#### Constants
```javascript
var WS_URL = 'ws://' + (location.hostname || 'localhost') + ':7600';
var STATE_INTERVAL = 1000; // 1Hz state broadcast
var RECONNECT_DELAY = 3000; // retry after 3s on disconnect
```

#### State Variables
```javascript
var ws = null;
var stateTimer = null;
var reconnectTimer = null;
var connected = false;
```

#### Functions

- signature: `function getState()`
  - purpose: Serialize current fly state into a plain object
  - logic:
    1. Return object:
       ```javascript
       {
         drives: {
           hunger: BRAIN.drives.hunger,
           fear: BRAIN.drives.fear,
           fatigue: BRAIN.drives.fatigue,
           curiosity: BRAIN.drives.curiosity,
           groom: BRAIN.drives.groom
         },
         behavior: {
           current: behavior.current,
           enterTime: behavior.enterTime,
           groomLocation: behavior.groomLocation
         },
         position: {
           x: fly.x,
           y: fly.y,
           facingDir: facingDir,
           speed: speed
         },
         firingStats: {
           firedNeurons: BRAIN.workerFiredNeurons || 0
         },
         food: food.map(function(f) {
           return { x: f.x, y: f.y, radius: f.radius, eaten: f.eaten };
         }),
         environment: {
           lightLevel: BRAIN.stimulate.lightLevel,
           temperature: BRAIN.stimulate.temperature
         }
       }
       ```
  - returns: plain object with the structure above

- signature: `function sendState()`
  - purpose: Send current fly state to the WebSocket server
  - logic:
    1. If `ws === null` or `ws.readyState !== WebSocket.OPEN`, return.
    2. Call `ws.send(JSON.stringify({ type: 'state', data: getState() }))`
  - returns: void

- signature: `function executeCommand(msg)`
  - purpose: Parse and execute a command received from the server
  - logic:
    1. Parse `msg` with `JSON.parse`. If parse fails, log to console.warn and return.
    2. If `msg.type !== 'command'`, return.
    3. Extract `action = msg.action`, `params = msg.params || {}`.
    4. Switch on `action`:
       - **`'place_food'`**: Push `{ x: params.x, y: params.y, radius: 10, feedStart: 0, feedDuration: 0, eaten: 0 }` onto the global `food` array. Clamp `params.x` to `[0, window.innerWidth]` and `params.y` to `[44, window.innerHeight]` before pushing (44 is toolbar height, matching main.js line 650).
       - **`'set_light'`**: Validate `params.level` is one of `'bright'`, `'dim'`, `'dark'`. Map to index: `bright=0`, `dim=1`, `dark=2`. Set `lightStateIndex = index`. Set `BRAIN.stimulate.lightLevel = lightStates[index]`. Update button text: `document.getElementById('lightBtn').textContent = 'Light: ' + lightLabels[index]`.
       - **`'set_temp'`**: Validate `params.level` is one of `'neutral'`, `'warm'`, `'cool'`. Map to index: `neutral=0`, `warm=1`, `cool=2`. Set `tempStateIndex = index`. Set `BRAIN.stimulate.temperature = tempStates[index]`. Update button text: `document.getElementById('tempBtn').textContent = 'Temp: ' + tempLabels[index]`.
       - **`'touch'`**: Call `applyTouchTool(params.x, params.y)`. Default `params.x` to `fly.x` and `params.y` to `fly.y` if not provided (touch the fly center).
       - **`'blow_wind'`**: Set `BRAIN.stimulate.wind = true`. Set `BRAIN.stimulate.windStrength = Math.min(1, Math.max(0, params.strength || 0.5))`. Set `BRAIN.stimulate.windDirection = params.direction || 0`. Set `windResetTime = Date.now() + 2000`.
       - **`'clear_food'`**: Set `food.length = 0` (mutates the global array in-place).
       - **default**: Log unknown action to console.warn.
  - returns: void

- signature: `function connect()`
  - purpose: Establish WebSocket connection to the caretaker server
  - logic:
    1. If `reconnectTimer !== null`, call `clearTimeout(reconnectTimer)` and set `reconnectTimer = null`.
    2. Try to create `ws = new WebSocket(WS_URL)`.
    3. On `ws.onopen`:
       - Set `connected = true`
       - Log to console: `'[caretaker] Connected to ' + WS_URL`
       - Start state interval: `stateTimer = setInterval(sendState, STATE_INTERVAL)`
       - Send an initial state immediately: call `sendState()`
    4. On `ws.onmessage`:
       - Call `executeCommand(event.data)`
    5. On `ws.onclose`:
       - Set `connected = false`
       - If `stateTimer !== null`, call `clearInterval(stateTimer)` and set `stateTimer = null`.
       - Log to console: `'[caretaker] Disconnected, reconnecting in ' + (RECONNECT_DELAY / 1000) + 's'`
       - Set `reconnectTimer = setTimeout(connect, RECONNECT_DELAY)`
    6. On `ws.onerror`:
       - Do nothing (onclose will fire after onerror). Prevents console spam.
  - returns: void

- signature: `function init()`
  - purpose: Wait for BRAIN to be ready, then connect
  - logic:
    1. Check if `typeof BRAIN !== 'undefined' && BRAIN.drives`. If true, call `connect()` and return.
    2. Otherwise, `setTimeout(init, 500)` (poll until BRAIN is initialized).
  - returns: void

#### IIFE Bottom (wiring)
1. Call `init()`.
2. Expose debug handle: `window.caretakerBridge = { getState: getState, connect: connect, isConnected: function() { return connected; } }`.

---

### 4. MODIFY `.gitignore`
- operation: MODIFY
- reason: Add `node_modules/` and `caretaker.log` to prevent committing npm deps and log output.
- anchor: `.vscode/`

#### Change
Append these two lines to the end of the existing `.gitignore` file:

```
node_modules/
caretaker.log
```

The existing file contains:
```
weights.txt
extract_weights_to_json.py
.vscode/
```

After modification:
```
weights.txt
extract_weights_to_json.py
.vscode/
node_modules/
caretaker.log
```

---

### 5. MODIFY `index.html`
- operation: MODIFY
- reason: Load `caretaker-bridge.js` after `main.js` so all globals are available.
- anchor: `<script type="text/javascript" src="./js/main.js?v=7"></script>`

#### Change
Insert ONE new script tag immediately after the `main.js` script tag:

**Before:**
```html
    <script type="text/javascript" src="./js/main.js?v=7"></script>
</body>
```

**After:**
```html
    <script type="text/javascript" src="./js/main.js?v=7"></script>
    <script type="text/javascript" src="./js/caretaker-bridge.js?v=7"></script>
</body>
```

No other changes to `index.html`.

---

## Protocol Reference (for builder context)

### Browser → Server (WebSocket)
```json
{"type":"state","data":{"drives":{"hunger":0.3,"fear":0,"fatigue":0,"curiosity":0.5,"groom":0.1},"behavior":{"current":"idle","enterTime":1711540800000,"groomLocation":null},"position":{"x":500,"y":300,"facingDir":0,"speed":0},"firingStats":{"firedNeurons":0},"food":[],"environment":{"lightLevel":1,"temperature":0.5}}}
```

### Server → Browser (WebSocket)
```json
{"type":"command","action":"place_food","params":{"x":100,"y":200}}
```

### stdin → Server (from Claude Code, one JSON object per line)
```json
{"action":"place_food","params":{"x":100,"y":200},"reasoning":"Fly hunger at 0.7, placing food nearby"}
```

### Server → stdout (to Claude Code, one JSON object per line)
State update:
```json
{"type":"state","timestamp":"2026-03-27T12:00:00.000Z","data":{...same as browser state...}}
```
Action acknowledgment:
```json
{"type":"action_ack","action":"place_food","success":true}
```
Incident:
```json
{"type":"incident","timestamp":"2026-03-27T12:00:01.000Z","incident":"scared_the_fly","action":"touch","fearBefore":0.1,"fearAfter":0.6,"flyState":{...}}
```

### caretaker.log (JSON Lines, all events)
Each line is a JSON object with `timestamp` (ISO 8601) and `type` (`"observation"`, `"action"`, or `"incident"`).

---

## Verification

- build: `cd /Users/name/homelab/flybrain && npm install`
- lint: No linter configured in this project. Verify no syntax errors: `node -c server/caretaker.js`
- test: `node tests/run-node.js` (existing 69 tests must still pass -- caretaker-bridge.js is NOT loaded in tests, so no impact)
- smoke:
  1. Start the server: `node server/caretaker.js` -- verify stderr output: `[caretaker] WebSocket server on port 7600`
  2. Open `index.html` in a browser -- verify console logs `[caretaker] Connected to ws://localhost:7600` (or `Disconnected, reconnecting in 3s` if server is not running -- no errors either way)
  3. With both running, type into server stdin: `{"action":"place_food","params":{"x":300,"y":300},"reasoning":"test"}` -- verify stdout outputs an `action_ack` line and a food item appears in the browser
  4. Verify `caretaker.log` contains JSON Lines with observation and action entries
  5. Kill server with Ctrl+C -- verify browser logs reconnect message, no errors

## Constraints

- Do NOT modify any existing JS files (`main.js`, `connectome.js`, `fly-logic.js`, `brain-worker-bridge.js`, etc.) -- the bridge reads globals but changes nothing.
- Do NOT modify CSS -- no UI changes.
- Do NOT add caretaker-bridge.js to `tests/run-node.js` -- it depends on DOM/WebSocket APIs not available in Node.
- Do NOT use ES modules (`import`/`export`) -- the project is vanilla ES5 with `var` declarations and no build step. Server file uses `require()` (CommonJS).
- The `ws` package is the ONLY new npm dependency. Do not add express, socket.io, or any other packages.
- Do NOT add `.gitignore` entries -- `node_modules/` is already likely gitignored or untracked.
- `caretaker.log` should NOT be committed. Add `caretaker.log` to `.gitignore` if a `.gitignore` exists, otherwise note it for the user.
- Keep the server file under 150 lines. Keep the browser bridge under 120 lines. This is a lightweight bridge, not a framework.
