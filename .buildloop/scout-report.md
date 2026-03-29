# Scout Report: T10.1

## Key Facts (read this first)

- **Tech stack**: Node.js, `better-sqlite3` (SQLite), no bundler. `server/db.js` owns all DB logic. `tools/query-log.sh` is a bash script using DuckDB to query a JSON Lines log file -- but that log is no longer written (agent/run.sh does not redirect stdout to a file), so the tool currently targets a non-existent file.
- **avgResponseTime bug is real** (`db.js:243`): `var avgResponseTime = forgotIncidents;` -- stores a count, not seconds. `getAnalyticsSummary()` already has the correct hunger-breach-to-food-placement logic (lines 272-296) but computes mean; the task asks for **median**. The fix for `computeDailyScore` should mirror that query pattern and compute median.
- **connectedHours divisor caveat**: `Math.round(connectedSeconds / 360) / 10` is mathematically identical to `Math.round(connectedSeconds / 3600 * 10) / 10`. The task says "inflates by 10x" but the current math is actually correct due to the compensating `/10`. The fix is a readability refactor -- restructure as `Math.round(connectedSeconds / 3600 * 10) / 10`. **Do NOT just swap 360→3600 without adjusting the rounding factor** -- that would produce 10x smaller results.
- **query-log.sh must switch from JSON log to SQLite**: DuckDB can read SQLite directly via `ATTACH ... (TYPE sqlite, READ_ONLY)`. The JSON log file no longer exists. All three view definitions need to be rewritten against the SQLite table schema.
- **`@anthropic-ai/sdk` is safe to remove**: `grep -r anthropic server/` finds no imports outside package.json/package-lock.json; caretaker.js uses `execSync('claude ...')` (line 6, 165).

---

## Relevant Files

| File | Role |
|------|------|
| `server/db.js` | MODIFY -- `computeDailyScore` (line 243 avgResponseTime bug) and `getAnalyticsSummary` (line 318 connectedHours refactor) |
| `tools/query-log.sh` | MODIFY -- `build_schema()` (lines 46-85) rewrites DuckDB views to read SQLite; `validate_args()` (line 38) checks for DB file instead of log file |
| `package.json` | MODIFY -- remove `@anthropic-ai/sdk` from dependencies |

---

## Architecture Notes

### db.js computeDailyScore (lines 212-248)
- Runs four SQLite queries: avg hunger, feed count, fear incidents, forgot incidents
- `avgResponseTime` at line 243 is simply `var avgResponseTime = forgotIncidents;` -- wrong, stores count
- The correct query pattern is already present in `getAnalyticsSummary` lines 272-290: fetch hunger > 0.7 observations, fetch place_food actions, iterate to find first food action after each breach, accumulate deltas in seconds
- Task asks for **median** not mean. After collecting `responseTimes[]`, sort and take the middle element (or average of two middle elements for even length)

### db.js getAnalyticsSummary (lines 251-329)
- Line 318: `Math.round(connectedSeconds / 360) / 10` -- algebraically `= Math.round(connectedSeconds / 3600 * 10) / 10`
- The clearer form: divide by 3600 first (seconds → hours), multiply by 10 before rounding (preserve one decimal), divide by 10 after. No change to output values.

### SQLite incidents table schema (db.js lines 35-42)
```
id, timestamp, type, severity, description, state_snapshot
```
- `type` field (not `incident`): values are `'scared_the_fly'`, `'forgot_to_feed'`
- `description` is a human string like `"Fear spiked from 0.23 to 0.81 after place_food"` or `"Hunger at 0.91 with no food available"` -- no separate fearBefore/fearAfter columns
- `state_snapshot` is JSON (stringified fly state)

### SQLite actions table schema (db.js lines 27-34)
```
id, timestamp, action, params, reasoning, fly_state
```

### SQLite observations table schema (db.js lines 6-26)
```
id, timestamp, hunger, fear, fatigue, curiosity, groom, behavior, pos_x, pos_y, facing_dir, speed, fired_neurons, food_count, light_level, temperature, raw_data
```

### Current query-log.sh schema mismatches (build_schema, lines 46-85)
1. Reads `caretaker.log` (JSON Lines) -- this file no longer exists; agent/run.sh does not redirect stdout to a file
2. `observations` view: `WHERE type = 'observation'` -- old log wrote `type: 'state'`; SQLite has a proper `observations` table
3. `incidents` view: selects `incident` (old log field) -- SQLite table has `type`; selects `fearBefore`/`fearAfter` (old log top-level fields) -- SQLite stores these only inside `description` string; `action` field also doesn't exist as a column
4. `actions` view: `WHERE type = 'action'` -- old log wrote `type: 'action_ack'`; SQLite has a proper `actions` table

### DuckDB SQLite reading syntax
DuckDB supports: `ATTACH 'path.db' AS db (TYPE sqlite, READ_ONLY); SELECT * FROM db.main.observations;`
Or alternatively the sqlite_scan function. The ATTACH approach produces cleaner view definitions.

---

## Suggested Approach

1. **`server/db.js` -- `computeDailyScore` (line 243)**: Replace `var avgResponseTime = forgotIncidents;` with a small query block similar to `getAnalyticsSummary` lines 272-296 but compute **median** instead of mean:
   - Fetch hunger > 0.7 observations for the day, ordered by id ASC
   - Fetch place_food actions for the day, ordered by timestamp ASC
   - For each breach, find the first food action at or after it, push delta in seconds
   - Sort the array, return middle value (or null if empty)
   - Pass result to `stmtUpsertDailyScore.run()`

2. **`server/db.js` -- `getAnalyticsSummary` (line 318)**: Change `Math.round(connectedSeconds / 360) / 10` to `Math.round(connectedSeconds / 3600 * 10) / 10`. Same math, clearer intent.

3. **`tools/query-log.sh`**:
   - Change `LOG_FILE` variable to `DB_FILE="$PROJECT_DIR/data/caretaker.db"`
   - Update `validate_args` to check `$DB_FILE` with `-f` instead of `-s "$LOG_FILE"`
   - Rewrite `build_schema()` to ATTACH the SQLite DB and create views from real tables:
     - `observations`: direct `SELECT` from `db.main.observations` (columns already match)
     - `actions`: direct `SELECT` from `db.main.actions`
     - `incidents`: SELECT from `db.main.incidents` using `type` field, expose `description` as-is (no fearBefore/fearAfter), include `severity`
   - Update `validate_args` error message
   - Update `get_schema_info` to not reference `raw_log` (no longer needed)

4. **`package.json`**: Remove `"@anthropic-ai/sdk": "^0.80.0"` from dependencies. Run `npm install` to regenerate lock file.

---

## Risks and Constraints

- **connectedHours "fix" is a no-op mathematically**: `/ 360 / 10 == / 3600`. Implement as `/ 3600 * 10` before `/ 10` to make intent clear, but do NOT just swap 360→3600 without the `* 10` or it outputs 10x smaller values.
- **DuckDB SQLite ATTACH requires DuckDB ≥ 0.8 with sqlite extension loaded**. The script already checks `duckdb` is installed but doesn't verify the sqlite extension. Add `LOAD sqlite;` before the ATTACH, or use `INSTALL sqlite; LOAD sqlite;` -- but INSTALL requires internet. Check if the user's DuckDB has sqlite bundled (most brew installs do). The builder should add `LOAD sqlite;` before the ATTACH statement.
- **`data/caretaker.db` path**: DB is at `data/caretaker.db` relative to project root (set in `db.js` line 4 as `path.join(__dirname, '..', 'data', 'caretaker.db')`). The query-log.sh `PROJECT_DIR` already resolves to the project root, so `$PROJECT_DIR/data/caretaker.db` is correct.
- **median with empty or single-element array**: Handle `responseTimes.length === 0` (return null) and `=== 1` (return the single value) to avoid out-of-bounds access.
- **`package-lock.json`**: Removing `@anthropic-ai/sdk` from package.json requires running `npm install` to update the lock file. Builder must run this command.
- **No tests exist**: No test suite to run for verification. Verification will need manual inspection of the query outputs.
