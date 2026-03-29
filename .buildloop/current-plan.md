# Plan: T10.1

## Dependencies
- list: none (no new packages)
- commands: `cd /Users/name/homelab/flybrain && npm install` (after removing @anthropic-ai/sdk, to regenerate lock file)

## File Operations (in execution order)

### 1. MODIFY server/db.js
- operation: MODIFY
- reason: Fix avgResponseTime bug in computeDailyScore (stores count instead of median response time) and refactor connectedHours formula in getAnalyticsSummary for clarity

#### Change A: Replace avgResponseTime in computeDailyScore (line 243)
- anchor: `var avgResponseTime = forgotIncidents;`

Replace the single line `var avgResponseTime = forgotIncidents;` (line 243) with a block that computes the **median** response time in seconds between hunger > 0.7 observations and subsequent place_food actions. The new code block replaces ONLY line 243 (`var avgResponseTime = forgotIncidents;`). It does NOT touch any other lines in computeDailyScore.

**Exact replacement logic (insert between line 242 `composite = Math.round(...)` and line 245 `var now = ...`):**

```javascript
      // Compute median response time: seconds between hunger > 0.7 and next place_food
      var hungerBreaches = db.prepare(
        'SELECT timestamp FROM observations WHERE hunger > 0.7 AND timestamp >= ? AND timestamp <= ? ORDER BY id ASC'
      ).all(dayStart, dayEnd);

      var foodPlacements = db.prepare(
        'SELECT timestamp FROM actions WHERE action = \'place_food\' AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC'
      ).all(dayStart, dayEnd);

      var responseTimesArr = [];
      for (var hb = 0; hb < hungerBreaches.length; hb++) {
        var breachMs = new Date(hungerBreaches[hb].timestamp).getTime();
        for (var fp = 0; fp < foodPlacements.length; fp++) {
          var foodMs = new Date(foodPlacements[fp].timestamp).getTime();
          if (foodMs >= breachMs) {
            responseTimesArr.push((foodMs - breachMs) / 1000);
            break;
          }
        }
      }

      var avgResponseTime = null;
      if (responseTimesArr.length > 0) {
        responseTimesArr.sort(function(a, b) { return a - b; });
        var mid = Math.floor(responseTimesArr.length / 2);
        if (responseTimesArr.length % 2 === 0) {
          avgResponseTime = Math.round(((responseTimesArr[mid - 1] + responseTimesArr[mid]) / 2) * 10) / 10;
        } else {
          avgResponseTime = Math.round(responseTimesArr[mid] * 10) / 10;
        }
      }
```

The old_string for the Edit tool is exactly: `var avgResponseTime = forgotIncidents;`

The new_string is the entire block above (indented with 6 spaces to match surrounding code).

#### Change B: Refactor connectedHours formula in getAnalyticsSummary (line 318)
- anchor: `var connectedHours = obsTimes.length >= 2 ? Math.round(connectedSeconds / 360) / 10 : 0;`

Replace with:
```javascript
      var connectedHours = obsTimes.length >= 2 ? Math.round(connectedSeconds / 3600 * 10) / 10 : 0;
```

This is algebraically identical (`/360 then /10` == `/3600 * 10 then /10`) but makes the seconds-to-hours conversion explicit. Do NOT change to just `/3600` without the `* 10` and `/ 10` -- that would lose the one-decimal-place rounding and produce 10x smaller results.

The old_string for the Edit tool is exactly: `Math.round(connectedSeconds / 360) / 10`
The new_string is exactly: `Math.round(connectedSeconds / 3600 * 10) / 10`

### 2. MODIFY tools/query-log.sh
- operation: MODIFY
- reason: Switch from non-existent JSON Lines log to SQLite database via DuckDB ATTACH; fix schema mismatches (incident->type, fearBefore/fearAfter removed)

#### Change A: Replace LOG_FILE variable with DB_FILE (line 6)
- anchor: `LOG_FILE="$PROJECT_DIR/caretaker.log"`

old_string: `LOG_FILE="$PROJECT_DIR/caretaker.log"`
new_string: `DB_FILE="$PROJECT_DIR/data/caretaker.db"`

#### Change B: Replace validate_args file check (lines 38-42)
- anchor: `if [[ ! -s "$LOG_FILE" ]]; then`

old_string:
```
  if [[ ! -s "$LOG_FILE" ]]; then
    echo "Error: No caretaker log found at $LOG_FILE" >&2
    echo "Run the caretaker agent first: bash agent/run.sh" >&2
    exit 1
  fi
```

new_string:
```
  if [[ ! -f "$DB_FILE" ]]; then
    echo "Error: No caretaker database found at $DB_FILE" >&2
    echo "Run the caretaker agent first: bash agent/run.sh" >&2
    exit 1
  fi
```

Note: changed `-s` (exists and non-empty) to `-f` (exists and is regular file) since SQLite WAL files can make the main file appear empty. Changed error message from "log" to "database" and from `$LOG_FILE` to `$DB_FILE`.

#### Change C: Rewrite build_schema function (lines 45-86)
- anchor: `DUCKDB_SETUP="CREATE VIEW raw_log AS`

Replace the entire DUCKDB_SETUP assignment (lines 46-85, from `DUCKDB_SETUP="CREATE VIEW raw_log AS` through the closing `WHERE type = 'incident';"`) with:

old_string:
```
  DUCKDB_SETUP="CREATE VIEW raw_log AS
SELECT * FROM read_json_auto('${LOG_FILE}', format='newline_delimited', union_by_name=true);

CREATE VIEW observations AS
SELECT
  timestamp::TIMESTAMP AS ts,
  data.drives.hunger AS hunger,
  data.drives.fear AS fear,
  data.drives.fatigue AS fatigue,
  data.drives.curiosity AS curiosity,
  data.drives.groom AS groom,
  data.behavior.current AS behavior,
  data.position.x AS pos_x,
  data.position.y AS pos_y,
  data.position.speed AS speed,
  data.environment.lightLevel AS light_level,
  data.environment.temperature AS temperature,
  len(data.food) AS food_count
FROM raw_log
WHERE type = 'observation';

CREATE VIEW actions AS
SELECT
  timestamp::TIMESTAMP AS ts,
  action,
  params,
  reasoning
FROM raw_log
WHERE type = 'action';

CREATE VIEW incidents AS
SELECT
  timestamp::TIMESTAMP AS ts,
  incident,
  action,
  fearBefore AS fear_before,
  fearAfter AS fear_after,
  hunger
FROM raw_log
WHERE type = 'incident';"
```

new_string:
```
  DUCKDB_SETUP="INSTALL sqlite; LOAD sqlite;
ATTACH '${DB_FILE}' AS flydb (TYPE sqlite, READ_ONLY);

CREATE VIEW observations AS
SELECT
  id,
  timestamp::TIMESTAMP AS ts,
  hunger,
  fear,
  fatigue,
  curiosity,
  groom,
  behavior,
  pos_x,
  pos_y,
  facing_dir,
  speed,
  fired_neurons,
  food_count,
  light_level,
  temperature
FROM flydb.main.observations;

CREATE VIEW actions AS
SELECT
  id,
  timestamp::TIMESTAMP AS ts,
  action,
  params,
  reasoning
FROM flydb.main.actions;

CREATE VIEW incidents AS
SELECT
  id,
  timestamp::TIMESTAMP AS ts,
  type,
  severity,
  description
FROM flydb.main.incidents;"
```

Key schema mappings:
- `raw_log` view is removed entirely (no more JSON Lines)
- `observations`: columns come directly from SQLite table (id, all drive columns, behavior, position, environment fields already stored as individual columns)
- `actions`: columns directly from SQLite (id, timestamp, action, params, reasoning); `fly_state` omitted from view for brevity (large JSON blob)
- `incidents`: uses `type` (not `incident`), `severity`, `description` (not `fearBefore`/`fearAfter`/`hunger`/`action` which never existed as columns)

#### Change D: Rewrite get_schema_info to remove raw_log references (lines 88-115)
- anchor: `SELECT 'TIME_RANGE' AS label;`

old_string:
```
SELECT 'TIME_RANGE' AS label;
SELECT min(timestamp::TIMESTAMP) AS earliest, max(timestamp::TIMESTAMP) AS latest FROM raw_log;"
```

new_string:
```
SELECT 'TIME_RANGE' AS label;
SELECT min(ts) AS earliest, max(ts) AS latest FROM observations;"
```

This replaces the `raw_log` reference with `observations` (which is the view we created from the SQLite table). Use `ts` since that's the aliased column name in the view.

#### Change E: Update generate_sql domain knowledge comment (lines 120-127)
- anchor: `Available views (created from a JSON Lines log file):`

old_string: `Available views (created from a JSON Lines log file):`
new_string: `Available views (created from the caretaker SQLite database):`

Also update the incidents domain knowledge. Find:
- anchor: `- \"incidents\" has one row per detected incident (scared_the_fly, forgot_to_feed)`

old_string:
```
- \"incidents\" has one row per detected incident (scared_the_fly, forgot_to_feed)
- \"forgot to feed\" = incident type forgot_to_feed (hunger > 0.9 with no food present)
- \"scared the fly\" = incident type scared_the_fly (fear spike after a Claude action)
```

new_string:
```
- \"incidents\" has one row per detected incident; type column has values: scared_the_fly, forgot_to_feed
- \"forgot to feed\" = type='forgot_to_feed' (hunger > 0.9 with no food present); details in description column
- \"scared the fly\" = type='scared_the_fly' (fear spike after Claude action); details in description column
- incidents have severity (low/medium/high) and description (human-readable text with context)
```

### 3. MODIFY package.json
- operation: MODIFY
- reason: Remove unused @anthropic-ai/sdk dependency (server uses claude CLI via execSync, not the SDK)
- anchor: `"@anthropic-ai/sdk": "^0.80.0",`

old_string:
```
    "@anthropic-ai/sdk": "^0.80.0",
    "better-sqlite3": "^12.8.0",
```

new_string:
```
    "better-sqlite3": "^12.8.0",
```

After this edit, run `cd /Users/name/homelab/flybrain && npm install` to regenerate package-lock.json with the removed dependency.

## Verification
- build: `cd /Users/name/homelab/flybrain && node -e "require('./server/db.js')"` (verifies db.js parses and the module loads without syntax errors)
- lint: no linter configured (vanilla JS project, no eslint)
- test: no existing tests
- smoke: run these checks in order:
  1. `cd /Users/name/homelab/flybrain && node -e "var db = require('./server/db.js'); console.log(typeof db.computeDailyScore)"` -- expect `function`
  2. `cd /Users/name/homelab/flybrain && node -e "var db = require('./server/db.js'); var result = db.computeDailyScore('2026-03-29'); console.log(JSON.stringify(result))"` -- expect JSON with `avg_response_time` as a number or null (not a count)
  3. `cd /Users/name/homelab/flybrain && node -e "var db = require('./server/db.js'); var result = db.getAnalyticsSummary('2026-03-29'); console.log(JSON.stringify(result))"` -- expect JSON with `connected_hours` as a reasonable number
  4. `cd /Users/name/homelab/flybrain && bash -c 'head -5 tools/query-log.sh'` -- verify DB_FILE variable, no LOG_FILE
  5. `cd /Users/name/homelab/flybrain && node -e "var pkg = require('./package.json'); console.log(Object.keys(pkg.dependencies))"` -- expect `['better-sqlite3', 'ws']` (no @anthropic-ai/sdk)
  6. `cd /Users/name/homelab/flybrain && grep -c 'raw_log' tools/query-log.sh` -- expect 0

## Constraints
- Do NOT modify any files other than: server/db.js, tools/query-log.sh, package.json
- Do NOT change the `computeDailyScore` function signature or its return shape -- the callers expect the same keys
- Do NOT change the `getAnalyticsSummary` return shape
- The connectedHours refactor MUST produce the same numeric results as before: `Math.round(x / 3600 * 10) / 10` == `Math.round(x / 360) / 10`. Do NOT just change 360 to 3600 without adding `* 10`.
- The median computation in computeDailyScore must handle: empty array (return null), single element (return that element), even length (average of two middle values), odd length (middle value). Round to one decimal place.
- In query-log.sh, use `INSTALL sqlite; LOAD sqlite;` before ATTACH to ensure the DuckDB sqlite extension is available
- Run `npm install` after editing package.json to regenerate package-lock.json
- Do NOT modify SPEC.md, CLAUDE.md, TASKS.md, or any .buildloop/ files other than current-plan.md
