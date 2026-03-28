# Plan: T8.5

## Dependencies
- list: ["better-sqlite3@^11.0.0"]
- commands: ["cd /Users/name/homelab/flybrain && npm install better-sqlite3"]

## File Operations (in execution order)

### 1. MODIFY package.json
- operation: MODIFY
- reason: Add better-sqlite3 dependency and migrate-logs script
- anchor: `"ws": "^8.18.0"`

#### Changes
- Add `"better-sqlite3": "^11.0.0"` to the `dependencies` object after the `ws` entry
- Add `"migrate-logs": "node server/migrate-logs.js"` to the `scripts` object after the `query-log` entry

### 2. CREATE server/db.js
- operation: CREATE
- reason: SQLite schema definition, prepared statements, and query module

#### Imports / Dependencies
```js
var Database = require('better-sqlite3');
var path = require('path');
```

#### Module-level constants
- `var DB_PATH = path.join(__dirname, '..', 'data', 'caretaker.db');`

#### Functions

- signature: `function openDb(dbPath)`
  - purpose: Open (or create) the SQLite database, enable WAL mode, create all tables, prepare statements, return an API object
  - logic:
    1. If `dbPath` is undefined, use `DB_PATH`
    2. Create parent directory: `var fs = require('fs'); fs.mkdirSync(path.dirname(dbPath), { recursive: true });`
    3. Open database: `var db = new Database(dbPath);`
    4. Run `db.pragma('journal_mode = WAL');`
    5. Run `db.pragma('foreign_keys = ON');`
    6. Call `createSchema(db)` (defined below)
    7. Prepare all statements (defined below)
    8. Return the API object (defined below)
  - returns: API object (see "Exported API object" section below)
  - error handling: Let better-sqlite3 throw on open failure (caller handles)

- signature: `function createSchema(db)`
  - purpose: Create all 5 tables if they don't exist
  - logic: Run `db.exec()` with the following SQL (one exec call with all statements concatenated):

```sql
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  hunger REAL,
  fear REAL,
  fatigue REAL,
  curiosity REAL,
  groom REAL,
  behavior TEXT,
  pos_x REAL,
  pos_y REAL,
  facing_dir REAL,
  speed REAL,
  fired_neurons INTEGER,
  food_count INTEGER,
  light_level REAL,
  temperature REAL,
  raw_data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  action TEXT NOT NULL,
  params TEXT NOT NULL DEFAULT '{}',
  reasoning TEXT NOT NULL DEFAULT '',
  fly_state TEXT
);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'medium',
  description TEXT NOT NULL DEFAULT '',
  state_snapshot TEXT
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  role TEXT NOT NULL,
  message TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  composite_score REAL,
  total_feeds INTEGER NOT NULL DEFAULT 0,
  avg_hunger REAL,
  fear_incidents INTEGER NOT NULL DEFAULT 0,
  avg_response_time REAL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_observations_timestamp ON observations(timestamp);
CREATE INDEX IF NOT EXISTS idx_actions_timestamp ON actions(timestamp);
CREATE INDEX IF NOT EXISTS idx_incidents_timestamp ON incidents(timestamp);
CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_daily_scores_date ON daily_scores(date);
```

  - returns: nothing

**Prepared statements** (created inside `openDb` after `createSchema`):

```js
var stmtInsertObservation = db.prepare(
  'INSERT INTO observations (timestamp, hunger, fear, fatigue, curiosity, groom, behavior, pos_x, pos_y, facing_dir, speed, fired_neurons, food_count, light_level, temperature, raw_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
);

var stmtInsertAction = db.prepare(
  'INSERT INTO actions (timestamp, action, params, reasoning, fly_state) VALUES (?, ?, ?, ?, ?)'
);

var stmtInsertIncident = db.prepare(
  'INSERT INTO incidents (timestamp, type, severity, description, state_snapshot) VALUES (?, ?, ?, ?, ?)'
);

var stmtInsertChatMessage = db.prepare(
  'INSERT INTO chat_messages (timestamp, role, message) VALUES (?, ?, ?)'
);

var stmtUpsertDailyScore = db.prepare(
  'INSERT INTO daily_scores (date, composite_score, total_feeds, avg_hunger, fear_incidents, avg_response_time, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(date) DO UPDATE SET composite_score=excluded.composite_score, total_feeds=excluded.total_feeds, avg_hunger=excluded.avg_hunger, fear_incidents=excluded.fear_incidents, avg_response_time=excluded.avg_response_time, updated_at=excluded.updated_at'
);

var stmtGetLatestObservation = db.prepare(
  'SELECT raw_data FROM observations ORDER BY id DESC LIMIT 1'
);

var stmtGetLastIncidentByType = db.prepare(
  'SELECT timestamp FROM incidents WHERE type = ? ORDER BY id DESC LIMIT 1'
);
```

**Exported API object** (returned from `openDb`):

```js
return {
  insertObservation: function(timestamp, data) {
    var d = data.drives || {};
    var b = data.behavior || {};
    var p = data.position || {};
    var f = data.firingStats || {};
    var e = data.environment || {};
    stmtInsertObservation.run(
      timestamp,
      d.hunger != null ? d.hunger : null,
      d.fear != null ? d.fear : null,
      d.fatigue != null ? d.fatigue : null,
      d.curiosity != null ? d.curiosity : null,
      d.groom != null ? d.groom : null,
      b.current || null,
      p.x != null ? p.x : null,
      p.y != null ? p.y : null,
      p.facingDir != null ? p.facingDir : null,
      p.speed != null ? p.speed : null,
      f.firedNeurons != null ? f.firedNeurons : null,
      data.food ? data.food.length : 0,
      e.lightLevel != null ? e.lightLevel : null,
      e.temperature != null ? e.temperature : null,
      JSON.stringify(data)
    );
  },

  insertAction: function(timestamp, action, params, reasoning, flyState) {
    stmtInsertAction.run(
      timestamp,
      action,
      JSON.stringify(params),
      reasoning,
      flyState ? JSON.stringify(flyState) : null
    );
  },

  insertIncident: function(timestamp, type, severity, description, stateSnapshot) {
    stmtInsertIncident.run(
      timestamp,
      type,
      severity,
      description,
      stateSnapshot ? JSON.stringify(stateSnapshot) : null
    );
  },

  insertChatMessage: function(timestamp, role, message) {
    stmtInsertChatMessage.run(timestamp, role, message);
  },

  getLatestObservation: function() {
    var row = stmtGetLatestObservation.get();
    return row ? JSON.parse(row.raw_data) : null;
  },

  getLastIncidentTime: function(type) {
    var row = stmtGetLastIncidentByType.get(type);
    return row ? row.timestamp : null;
  },

  computeDailyScore: function(dateStr) {
    // dateStr format: "YYYY-MM-DD"
    var dayStart = dateStr + 'T00:00:00.000Z';
    var dayEnd = dateStr + 'T23:59:59.999Z';

    var obsStats = db.prepare(
      'SELECT AVG(hunger) as avg_hunger FROM observations WHERE timestamp >= ? AND timestamp <= ?'
    ).get(dayStart, dayEnd);

    var feedCount = db.prepare(
      'SELECT COUNT(*) as cnt FROM actions WHERE action = ? AND timestamp >= ? AND timestamp <= ?'
    ).get('place_food', dayStart, dayEnd);

    var fearCount = db.prepare(
      'SELECT COUNT(*) as cnt FROM incidents WHERE type = ? AND timestamp >= ? AND timestamp <= ?'
    ).get('scared_the_fly', dayStart, dayEnd);

    // Avg response time: for each forgot_to_feed incident, find the next place_food action.
    // Simplified: count forgot_to_feed incidents as a proxy (lower is better).
    var forgotCount = db.prepare(
      'SELECT COUNT(*) as cnt FROM incidents WHERE type = ? AND timestamp >= ? AND timestamp <= ?'
    ).get('forgot_to_feed', dayStart, dayEnd);

    var avgHunger = obsStats && obsStats.avg_hunger != null ? obsStats.avg_hunger : 0.5;
    var totalFeeds = feedCount ? feedCount.cnt : 0;
    var fearIncidents = fearCount ? fearCount.cnt : 0;
    var forgotIncidents = forgotCount ? forgotCount.cnt : 0;

    // Composite: start at 100, penalize for avg hunger, fear, and forgot-to-feed
    // avgHunger of 0.5 is neutral (expected), penalize above that
    var hungerPenalty = Math.max(0, (avgHunger - 0.3)) * 40;
    var fearPenalty = Math.min(fearIncidents * 5, 30);
    var forgotPenalty = Math.min(forgotIncidents * 0.5, 20);
    var composite = Math.max(0, Math.min(100, 100 - hungerPenalty - fearPenalty - forgotPenalty));
    composite = Math.round(composite * 10) / 10;

    // avg_response_time stored as forgot_to_feed count (proxy; real response time requires pairing incidents with actions)
    var avgResponseTime = forgotIncidents;

    var now = new Date().toISOString();
    stmtUpsertDailyScore.run(dateStr, composite, totalFeeds, avgHunger, fearIncidents, avgResponseTime, now);

    return { date: dateStr, composite_score: composite, total_feeds: totalFeeds, avg_hunger: avgHunger, fear_incidents: fearIncidents, avg_response_time: avgResponseTime };
  },

  close: function() {
    db.close();
  },

  db: db
};
```

- signature: `module.exports = { openDb: openDb };`

### 3. MODIFY server/caretaker.js
- operation: MODIFY
- reason: Replace file-stream logging with SQLite calls, add observation rate-limiting, add daily_scores interval, add HTTP /state endpoint, add incident rate-limiting

#### Imports / Dependencies
- Add after line 5 (`var readline = require('readline');`): `var dbModule = require('./db');`

#### Changes (in order)

**Change A: Remove logStream, add db handle and observation timing**
- anchor: `var LOG_PATH = path.join(__dirname, '..', 'caretaker.log');`
- Remove these two lines:
  ```
  var LOG_PATH = path.join(__dirname, '..', 'caretaker.log');
  var logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
  ```
- Replace with:
  ```js
  var caretakerDb = dbModule.openDb();
  var lastObservationTime = 0;
  var OBSERVATION_INTERVAL_MS = 10000;
  ```

**Change B: Replace writeLog function**
- anchor: `function writeLog(entry) {`
- Remove the entire `writeLog` function (lines 17-20)
- Do NOT add a replacement function. Calls to `writeLog` will be replaced with direct `caretakerDb` method calls at each call site.

**Change C: Modify detectIncidents to use db and add rate-limiting**
- anchor: `function detectIncidents(state) {`
- Replace the entire `detectIncidents` function with:
```js
function detectIncidents(state) {
  var now = new Date().toISOString();
  var fear = state.drives.fear;
  var hunger = state.drives.hunger;
  var foodCount = state.food.length;
  if (lastActionTime > 0 && Date.now() - lastActionTime < 5000 && fear - preFearLevel > 0.2) {
    caretakerDb.insertIncident(now, 'scared_the_fly', 'high',
      'Fear spiked from ' + preFearLevel.toFixed(2) + ' to ' + fear.toFixed(2) + ' after ' + lastActionType,
      state);
    writeStdout({ type: 'incident', incident: 'scared_the_fly', action: lastActionType,
      fearBefore: preFearLevel, fearAfter: fear, flyState: state, timestamp: now });
    lastActionTime = 0;
  }
  if (hunger > 0.9 && foodCount === 0) {
    var lastForgot = caretakerDb.getLastIncidentTime('forgot_to_feed');
    var shouldLog = true;
    if (lastForgot) {
      var elapsed = Date.now() - new Date(lastForgot).getTime();
      if (elapsed < 60000) shouldLog = false;
    }
    if (shouldLog) {
      caretakerDb.insertIncident(now, 'forgot_to_feed', 'medium',
        'Hunger at ' + hunger.toFixed(2) + ' with no food available',
        state);
      writeStdout({ type: 'incident', incident: 'forgot_to_feed', hunger: hunger, flyState: state, timestamp: now });
    }
  }
}
```

**Change D: Modify handleStateMessage to rate-limit observations**
- anchor: `function handleStateMessage(data) {`
- Replace the entire `handleStateMessage` function with:
```js
function handleStateMessage(data) {
  var msg;
  try { msg = JSON.parse(data); } catch (e) {
    process.stderr.write('[caretaker] Bad JSON from browser: ' + e.message + '\n');
    return;
  }
  if (msg.type !== 'state') return;
  lastState = msg.data;
  var now = Date.now();
  if (now - lastObservationTime >= OBSERVATION_INTERVAL_MS) {
    lastObservationTime = now;
    var ts = new Date().toISOString();
    caretakerDb.insertObservation(ts, msg.data);
  }
  writeStdout({ type: 'state', timestamp: new Date().toISOString(), data: msg.data });
  detectIncidents(msg.data);
}
```

**Change E: Modify handleStdinCommand to use db**
- anchor: `function handleStdinCommand(line) {`
- Replace the `writeLog(...)` call at line 72-73 with:
```js
  var ts = new Date().toISOString();
  caretakerDb.insertAction(ts, cmd.action, cmd.params || {}, cmd.reasoning || '', lastState);
```
- The rest of the function remains unchanged. Full replacement of `handleStdinCommand`:
```js
function handleStdinCommand(line) {
  var cmd;
  try { cmd = JSON.parse(line); } catch (e) {
    process.stderr.write('[caretaker] Bad JSON from stdin: ' + e.message + '\n');
    writeStdout({ type: 'error', message: 'Invalid JSON: ' + e.message });
    return;
  }
  if (VALID_ACTIONS.indexOf(cmd.action) === -1) {
    process.stderr.write('[caretaker] Unknown action: ' + cmd.action + '\n');
    writeStdout({ type: 'error', message: 'Unknown action: ' + cmd.action });
    return;
  }
  preFearLevel = lastState ? lastState.drives.fear : 0;
  lastActionTime = Date.now();
  lastActionType = cmd.action;
  var ts = new Date().toISOString();
  caretakerDb.insertAction(ts, cmd.action, cmd.params || {}, cmd.reasoning || '', lastState);
  if (browserSocket !== null && browserSocket.readyState === WebSocket.OPEN) {
    try {
      browserSocket.send(JSON.stringify({ type: 'command', action: cmd.action, params: cmd.params || {} }));
    } catch (e) {
      process.stderr.write('[caretaker] WebSocket send error: ' + e.message + '\n');
    }
    writeStdout({ type: 'action_ack', action: cmd.action, success: true });
  } else {
    writeStdout({ type: 'action_ack', action: cmd.action, success: false, error: 'no browser connected' });
  }
}
```

**Change F: Add HTTP /state endpoint to the http server**
- anchor: `var server = http.createServer();`
- Replace with:
```js
var server = http.createServer(function(req, res) {
  if (req.method === 'GET' && req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (lastState) {
      res.end(JSON.stringify(lastState));
    } else {
      res.end('null');
    }
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});
```

**Change G: Add daily_scores computation interval**
- anchor: `server.listen(PORT, function() {`
- After the `server.listen(...)` block (after line 108), add:
```js
var DAILY_SCORE_INTERVAL_MS = 5 * 60 * 1000;
setInterval(function() {
  try {
    var today = new Date().toISOString().slice(0, 10);
    caretakerDb.computeDailyScore(today);
  } catch (e) {
    process.stderr.write('[caretaker] daily_scores error: ' + e.message + '\n');
  }
}, DAILY_SCORE_INTERVAL_MS);
```

**Change H: Replace shutdown function**
- anchor: `function shutdown() { logStream.end(); wss.close(); process.exit(0); }`
- Replace with:
```js
function shutdown() { caretakerDb.close(); wss.close(); process.exit(0); }
```

### 4. MODIFY agent/run.sh
- operation: MODIFY
- reason: Replace grep-based state reading with HTTP call to /state endpoint

**Change A: Remove LOG variable**
- anchor: `LOG="$PROJECT_DIR/caretaker.log"`
- Remove the line `LOG="$PROJECT_DIR/caretaker.log"`

**Change B: Replace get_latest_state function**
- anchor: `get_latest_state() {`
- Replace the entire `get_latest_state` function (lines 60-72) with:
```bash
get_latest_state() {
  local PORT="${CARETAKER_PORT:-7600}"
  local RESULT
  RESULT=$(curl -sf "http://localhost:${PORT}/state" 2>/dev/null) || true
  if [[ -z "$RESULT" || "$RESULT" == "null" ]]; then
    echo ""
    return 1
  fi
  echo "$RESULT"
  return 0
}
```

### 5. CREATE server/migrate-logs.js
- operation: CREATE
- reason: One-time migration script to import existing caretaker.log into SQLite

#### Imports / Dependencies
```js
var fs = require('fs');
var path = require('path');
var readline = require('readline');
var dbModule = require('./db');
```

#### Module-level constants
```js
var LOG_PATH = process.argv[2] || path.join(__dirname, '..', 'caretaker.log');
var DB_PATH = process.argv[3] || undefined;
```

#### Functions

- signature: `function migrate()`
  - purpose: Read caretaker.log line by line, parse JSON, insert into appropriate table, then compute historical daily_scores
  - logic:
    1. Check `LOG_PATH` exists with `fs.existsSync(LOG_PATH)`. If not, print `'No log file found at ' + LOG_PATH` to stderr and `process.exit(1)`.
    2. Open database: `var caretakerDb = dbModule.openDb(DB_PATH);`
    3. Read file contents: `var content = fs.readFileSync(LOG_PATH, 'utf8');`
    4. Split into lines: `var lines = content.split('\n');`
    5. Start a transaction: `var insertMany = caretakerDb.db.transaction(function(lines) { ... });`
    6. Inside the transaction, loop over each line:
       - Skip empty lines (`if (!line.trim()) continue;`)
       - Parse JSON: `try { var entry = JSON.parse(line); } catch (e) { errCount++; continue; }`
       - Read `entry.timestamp` (already an ISO string)
       - If `entry.type === 'observation'`:
         - Call `caretakerDb.insertObservation(entry.timestamp, entry.data)`
         - Increment `obsCount`
       - If `entry.type === 'action'`:
         - Call `caretakerDb.insertAction(entry.timestamp, entry.action, entry.params || {}, entry.reasoning || '', entry.flyState || null)`
         - Increment `actCount`
       - If `entry.type === 'incident'`:
         - Determine severity: if `entry.incident === 'scared_the_fly'` then `'high'`, else `'medium'`
         - Build description: `entry.incident + (entry.hunger != null ? ' (hunger: ' + entry.hunger + ')' : '') + (entry.fearBefore != null ? ' (fear: ' + entry.fearBefore + ' -> ' + entry.fearAfter + ')' : '')`
         - Call `caretakerDb.insertIncident(entry.timestamp, entry.incident, severity, description, entry.flyState || null)`
         - Increment `incCount`
       - Else: increment `skipCount`
    7. Call `insertMany(lines)` to execute the transaction
    8. Print summary to stderr: `'Migration complete: ' + obsCount + ' observations, ' + actCount + ' actions, ' + incCount + ' incidents, ' + errCount + ' parse errors, ' + skipCount + ' skipped'`
    9. Compute historical daily_scores:
       - Query `SELECT DISTINCT substr(timestamp, 1, 10) as day FROM observations ORDER BY day` from `caretakerDb.db`
       - For each `day`, call `caretakerDb.computeDailyScore(day)`
       - Print `'Computed daily scores for ' + days.length + ' days'` to stderr
    10. Call `caretakerDb.close()`
    11. Print `'Done.'` to stderr
  - returns: nothing (exits process)
  - error handling: Wrap entire function body in try/catch. On error, print `e.message` to stderr and `process.exit(1)`.

#### Wiring / Integration
- Run as: `node server/migrate-logs.js` (default paths) or `node server/migrate-logs.js /path/to/caretaker.log /path/to/db`
- npm script: `npm run migrate-logs`

## Verification
- build: `cd /Users/name/homelab/flybrain && npm install`
- lint: no linter configured -- skip
- test: no existing tests -- skip
- smoke:
  1. Run `node -e "var db = require('./server/db'); var d = db.openDb('/tmp/test-caretaker.db'); d.insertObservation(new Date().toISOString(), {drives:{hunger:0.5,fear:0.1,fatigue:0.2,curiosity:0.3,groom:0}, behavior:{current:'walk'}, position:{x:100,y:200,facingDir:0,speed:1}, firingStats:{firedNeurons:10}, food:[], environment:{lightLevel:1,temperature:0.5}}); console.log(d.getLatestObservation()); d.insertAction(new Date().toISOString(), 'place_food', {x:100,y:200}, 'test', null); d.insertIncident(new Date().toISOString(), 'forgot_to_feed', 'medium', 'test', null); d.insertChatMessage(new Date().toISOString(), 'user', 'hello'); var s = d.computeDailyScore(new Date().toISOString().slice(0,10)); console.log(s); d.close(); console.log('All db operations OK');"` -- expect JSON output and "All db operations OK"
  2. Run `node server/migrate-logs.js` -- expect migration summary with observation/action/incident counts and "Done."
  3. Run `node server/caretaker.js &` then `curl -sf http://localhost:7600/state` -- expect "null" (no browser connected yet). Kill the server after.
  4. Verify `data/caretaker.db` exists after migration: `ls -la data/caretaker.db`

## Constraints
- Do NOT modify SPEC.md, TASKS.md, or CLAUDE.md
- Do NOT modify or remove `caretaker.log` -- migration reads it but does not delete it
- Do NOT modify `tools/query-log.sh` -- it will be updated in a later task
- Do NOT modify `js/caretaker-bridge.js` or any browser-side JS files
- Do NOT add any npm dependencies beyond `better-sqlite3`
- Keep the CommonJS `var` style consistent with existing code -- no `const`, `let`, arrow functions, or ES module syntax
- Keep `writeStdout()` unchanged -- the agent loop reads stdout, not the database
- The `/state` HTTP endpoint returns `lastState` from memory (not from the database) for zero-latency agent reads
- The `forgot_to_feed` incident rate limit is 60 seconds between consecutive inserts of the same type
- Observation downsampling: only insert when `Date.now() - lastObservationTime >= 10000` (0.1Hz). All state messages are still forwarded to stdout regardless of sampling.
