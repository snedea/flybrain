# Build Claims -- T8.5

## Files Changed
- [CREATE] server/db.js -- SQLite schema (5 tables, indexes), prepared statements, openDb() API with insert/query/computeDailyScore methods
- [MODIFY] server/caretaker.js -- Replaced file-stream logging with SQLite via caretakerDb, added observation rate-limiting (10s), HTTP /state endpoint, daily_scores interval (5min), forgot_to_feed incident rate-limiting (60s)
- [MODIFY] agent/run.sh -- Replaced grep-based get_latest_state() with HTTP curl to /state endpoint, removed LOG variable
- [CREATE] server/migrate-logs.js -- One-time migration script reads caretaker.log, inserts into SQLite in a transaction, computes historical daily_scores
- [MODIFY] package.json -- Added better-sqlite3 dependency (^12.8.0, plan said ^11.0.0 but Node 25 required v12), added migrate-logs script
- [MODIFY] .gitignore -- Added data/ to prevent committing database files

## Verification Results
- Build: PASS (npm install)
- Tests: SKIPPED (no test suite configured)
- Lint: SKIPPED (no linter configured)
- Smoke 1: PASS (node -e "..." -- db.js insert/query/computeDailyScore all returned expected values)
- Smoke 2: PASS (node server/migrate-logs.js -- migrated 3161 observations, 17 actions, 1943 incidents, 0 parse errors, computed 1 day of scores)
- Smoke 3: PASS (caretaker.js server started, curl /state returned "null" as expected with no browser connected)
- Smoke 4: PASS (ls -la data/caretaker.db -- 3.0MB file exists after migration)

## Claims
- [ ] server/db.js exports openDb() which creates 5 tables: observations, actions, incidents, chat_messages, daily_scores
- [ ] Each table has a timestamp index; daily_scores has a unique date index
- [ ] observations table stores denormalized drive/behavior/position/firing/environment columns plus raw_data JSON blob
- [ ] insertObservation safely handles null/missing nested properties (drives, behavior, position, firingStats, environment)
- [ ] computeDailyScore calculates composite score (0-100) with penalties for hunger, fear incidents, and forgot_to_feed incidents, upserts into daily_scores
- [ ] server/caretaker.js rate-limits observations to one insert per 10 seconds (OBSERVATION_INTERVAL_MS = 10000)
- [ ] All state messages are still forwarded to stdout regardless of observation sampling
- [ ] forgot_to_feed incidents are rate-limited to one per 60 seconds via getLastIncidentTime query
- [ ] scared_the_fly incidents are logged with severity 'high', forgot_to_feed with 'medium'
- [ ] HTTP GET /state returns lastState JSON from memory (not database), returns "null" string when no state available
- [ ] daily_scores are computed every 5 minutes via setInterval
- [ ] shutdown() calls caretakerDb.close() instead of logStream.end()
- [ ] writeLog function is fully removed; all call sites replaced with direct caretakerDb method calls
- [ ] agent/run.sh get_latest_state() uses curl to HTTP /state endpoint instead of grepping caretaker.log
- [ ] server/migrate-logs.js reads caretaker.log, wraps all inserts in a single transaction, then computes daily_scores for each distinct day
- [ ] migrate-logs.js classifies entries by type field: observation, action, incident; skips unknown types
- [ ] data/ directory is gitignored

## Gaps and Assumptions
- better-sqlite3 version is ^12.8.0 instead of plan's ^11.0.0 -- Node 25.1.0 has V8 API changes incompatible with v11; v12 compiles and works correctly
- caretaker.log is not deleted by migration (per plan constraints)
- The `fs` module import on line 3 of caretaker.js is no longer used for logging but may be used elsewhere or by future code; left in place to avoid unintended breakage
- Migration was tested against actual caretaker.log data (3161 obs, 17 actions, 1943 incidents) but edge cases in log format (malformed JSON, missing fields) were not exhaustively tested beyond the 0-error result
- The daily_scores interval starts immediately on server boot; no initial computation on startup (first computation happens after 5 minutes)
- chat_messages table is created but no code path currently inserts into it (per plan -- insertChatMessage is exposed on the API for future use)
