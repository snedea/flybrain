# Scout Report: T8.5

## Key Facts (read this first)

- **Tech stack**: Node.js v25.1.0, plain CommonJS (`var` style, no build step), `ws` is the only current dependency. `better-sqlite3` is **not installed** -- `npm install better-sqlite3` required.
- **Logging today**: `server/caretaker.js` writes JSON Lines to `caretaker.log` via `fs.createWriteStream`. Log has 5,121 lines: 3,161 observations, 1,943 incidents, 17 actions. Zero `chat_message` entries (new table for T8.7).
- **Critical break**: `agent/run.sh:get_latest_state()` greps `caretaker.log` for the latest observation. Removing the flat-file log **breaks the agent loop**. The planner must decide: add a server HTTP/JSON endpoint for run.sh to query, OR keep writing `caretaker.log` in parallel (defeats purpose), OR modify run.sh to query SQLite via node CLI.
- **Observation rate**: task spec says 0.1Hz (1 per 10s); browser currently sends at ~1Hz. The server needs to downsample in `handleStateMessage()` -- only write to DB every 10th call (or time-gate to 10s intervals).
- **`tools/query-log.sh`** uses DuckDB on `caretaker.log`. After migration it will break, but T8.7 replaces it with SQLite queries. The task description does not require updating `query-log.sh` -- leave it or document it as deprecated.

## Relevant Files

| File | Role |
|------|------|
| `server/caretaker.js` | **MODIFY** -- replace `logStream`/`writeLog()` with `db.js` calls; add observation rate-limiting |
| `server/db.js` | **CREATE** -- schema DDL + prepared-statement query module |
| `server/migrate-logs.js` | **CREATE** -- reads `caretaker.log`, inserts rows into new DB tables |
| `package.json` | **MODIFY** -- add `"better-sqlite3": "^9.x"` to dependencies |
| `agent/run.sh` | **ASSESS** -- currently reads from `caretaker.log`; will break post-migration |

## Architecture Notes

### caretaker.js structure
- Three globals track last state: `lastState`, `lastActionTime`, `lastActionType`, `preFearLevel`
- `writeLog(entry)` -- single point for all writes. This is the only function to replace.
- `detectIncidents(state)` -- called from `handleStateMessage()` after every observation. Writes incidents inline.
- `handleStdinCommand(line)` -- writes action entries. Called from readline on stdin.
- WebSocket single-client (`browserSocket`). No HTTP API exists today.

### Log entry shapes (what migrate-logs.js must parse)
- `observation`: `{type, timestamp, data: {drives, behavior, position, firingStats, food, environment}}`
- `action`: `{type, timestamp, action, params, reasoning, flyState}`
- `incident`: `{type, timestamp, incident: "scared_the_fly"|"forgot_to_feed", ...flyState fields}`
- No `chat_message` entries exist yet (new table only).

### daily_scores computation
Task spec: composite score, total feeds, avg hunger, fear incidents, avg response time. No formula given. Planner must define one. Suggested: `score = 100 - (avg_hunger*30) - (fear_incidents*5) - (missed_feeds*10)`. Runs on `setInterval(5 * 60 * 1000)` in `caretaker.js`.

## Suggested Approach

1. **`server/db.js`** -- export `openDb(dbPath)` returning a db handle with:
   - `createSchema()` -- CREATE TABLE IF NOT EXISTS for all 5 tables
   - Prepared insert statements: `insertObservation`, `insertAction`, `insertIncident`, `insertChatMessage`, `upsertDailyScore`
   - `getLatestObservation()` -- for run.sh replacement
   - `computeDailyScore(date)` -- aggregates from observations/actions/incidents

2. **`server/caretaker.js`** -- replace `writeLog()` body with `db.insertObservation()` / `db.insertAction()` / `db.insertIncident()` calls. Add time-gate for 0.1Hz observation sampling. Add `setInterval` for daily score computation. Keep `writeStdout()` unchanged (agent reads stdout, not the log file). To fix run.sh: add a `latest_state` JSON endpoint over HTTP on the same port, OR add a simple `node server/get-state.js` CLI wrapper that queries SQLite.

3. **`server/migrate-logs.js`** -- standalone script: open `caretaker.log`, parse line by line, batch-insert into all tables. Handle missing/null fields gracefully (some log entries lack `reasoning`, incident entries vary in shape).

4. **run.sh fix** -- simplest approach: add a tiny HTTP GET `/state` endpoint to `caretaker.js` that returns `JSON.stringify(lastState)`. Then change `get_latest_state()` in run.sh to `curl -sf http://localhost:$PORT/state`. This is minimal and doesn't require run.sh to know about SQLite.

## Risks and Constraints (read this last)

- **better-sqlite3 native module**: Requires node-gyp / C++ build tools. On macOS with Node v25 this typically works with Xcode CLI tools installed. If the build fails, consider `sql.js` (pure JS, no native binding) as a fallback -- but `better-sqlite3` is preferred for synchronous API.
- **Observation volume**: 3,161 observations for a short session suggests ~1Hz current rate. At 0.1Hz the DB will stay manageable. But migration inserts ALL existing 1Hz observations -- that's fine for a one-time script.
- **Synchronous writes**: `better-sqlite3` is synchronous (unlike `node-sqlite3`). This is correct here -- the server is single-threaded and sync writes avoid write-ordering bugs. No WAL mode needed unless file sharing with query-log.sh simultaneously.
- **`daily_scores` for partial days**: migration script inserts historical observations but daily scores for past days need to be computed retroactively. The migrate script should also compute historical `daily_scores` rows after bulk-inserting observations.
- **Incident deduplication**: `detectIncidents()` currently fires `forgot_to_feed` on EVERY observation when hunger > 0.9 and food is empty (1,943 incidents for 3,161 observations). The migration will faithfully insert all 1,943 rows. The new DB code should consider rate-limiting: only insert a new `forgot_to_feed` if none was inserted in the last 60s.
- **`caretaker-decisions.log`**: `run.sh` writes its own separate decisions log. This is NOT part of `caretaker.js` and is not in scope for T8.5.
