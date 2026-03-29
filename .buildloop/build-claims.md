# Build Claims -- T10.1

## Files Changed
- [MODIFY] server/db.js -- Replace buggy avgResponseTime (was storing forgotIncidents count) with median response time computation between hunger > 0.7 observations and next place_food actions; fix connectedHours divisor from /360 to /3600*10 (algebraically equivalent but semantically correct)
- [MODIFY] tools/query-log.sh -- Rewrite DuckDB schema from JSON Lines (read_json_auto) to SQLite ATTACH; fix incidents view (incident->type, remove fearBefore/fearAfter/hunger/action, add severity/description); remove raw_log view; update domain knowledge comments
- [MODIFY] package.json -- Remove unused @anthropic-ai/sdk dependency
- [MODIFY] package-lock.json -- Regenerated via npm install after removing @anthropic-ai/sdk

## Verification Results
- Build: PASS (`node -e "require('./server/db.js')"` -- no errors)
- Smoke test computeDailyScore: PASS (`db.computeDailyScore('2026-03-29')` returns `{"date":"2026-03-29","composite_score":92,"total_feeds":0,"avg_hunger":0.5,"fear_incidents":0,"avg_response_time":null}`)
- Smoke test getAnalyticsSummary: PASS (`db.getAnalyticsSummary('2026-03-29')` returns `{"composite_score":92,"total_feeds":0,"avg_hunger":0.5,"fear_incidents":0,"avg_response_time":null,"feeds_per_hour":0,"connected_hours":0}`)
- Dependencies: PASS (`Object.keys(pkg.dependencies)` returns `['better-sqlite3', 'ws']`)
- No raw_log references: PASS (`grep -c 'raw_log' tools/query-log.sh` returns 0)
- No LOG_FILE references: PASS (0 matches in query-log.sh)
- Tests: SKIPPED (no test suite exists)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] computeDailyScore avg_response_time now computes median seconds between hunger > 0.7 observations and next place_food action (was previously set to forgotIncidents count)
- [ ] Median handles edge cases: empty array returns null, odd length returns middle value, even length returns average of two middle values, all rounded to 1 decimal place
- [ ] connectedHours formula `Math.round(connectedSeconds / 3600 * 10) / 10` is algebraically identical to old `Math.round(connectedSeconds / 360) / 10` -- produces same numeric results while making the /3600 seconds-to-hours conversion explicit
- [ ] query-log.sh now uses DuckDB sqlite extension to ATTACH the SQLite database directly instead of reading JSON Lines
- [ ] query-log.sh incidents view uses `type` column (matches db.js) instead of non-existent `incident` column
- [ ] query-log.sh incidents view uses `severity` and `description` columns instead of non-existent `fearBefore`/`fearAfter` columns
- [ ] query-log.sh no longer references `raw_log` view or `LOG_FILE` variable
- [ ] @anthropic-ai/sdk removed from package.json dependencies; package-lock.json regenerated

## Gaps and Assumptions
- computeDailyScore smoke test ran against an empty day (no observations/actions for 2026-03-29), so avg_response_time returned null and connected_hours returned 0. The median computation logic was not exercised with actual data.
- query-log.sh was not end-to-end tested (requires duckdb CLI and claude CLI installed, plus a populated caretaker.db). Schema correctness was verified by reading db.js table definitions.
- The connectedHours claim of algebraic equivalence: `Math.round(x / 3600 * 10) / 10` == `Math.round(x / 360) / 10` holds because `x / 3600 * 10` == `x / 360`. Both produce the same input to Math.round, yielding identical results.
- The observations query for hunger breaches uses `ORDER BY id ASC` (matching plan); food placements use `ORDER BY timestamp ASC`. These are consistent assuming id and timestamp are monotonically increasing.
