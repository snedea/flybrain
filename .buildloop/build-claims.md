# Build Claims -- T8.4

## Files Changed
- [CREATE] tools/query-log.sh -- Shell script that loads caretaker.log into DuckDB, uses Claude Code (haiku) to generate SQL from natural language, executes it, and interprets results
- [MODIFY] package.json -- Added "query-log" npm script entry pointing to tools/query-log.sh

## Verification Results
- Build: PASS (`bash -n tools/query-log.sh` -- syntax check clean)
- Lint: PASS (`shellcheck tools/query-log.sh` -- no warnings)
- Tests: SKIPPED (no existing test framework for shell scripts)
- Smoke (no args): PASS -- prints usage with 4 example queries, exits 1
- Smoke (missing log): PASS -- prints "No caretaker log found" + "Run the caretaker agent first", exits 1
- JSON validation: PASS (`node -e "JSON.parse(...)"` on package.json)

## Claims
- [ ] `tools/query-log.sh` is executable (chmod +x applied)
- [ ] Running with no arguments prints usage message to stderr with 4 example queries and exits 1
- [ ] Running with a question but no `caretaker.log` prints an error to stderr with instructions to run the agent, and exits 1
- [ ] `check_deps()` verifies duckdb, claude, and jq are available, with descriptive error messages for each
- [ ] `build_schema()` creates DuckDB SQL preamble with 4 views: raw_log, observations, actions, incidents
- [ ] `get_schema_info()` extracts view schemas, sample data, row counts, and time range from DuckDB in markdown format
- [ ] `generate_sql()` calls `command claude -p --no-session-persistence --model haiku --max-budget-usd 0.01` to translate natural language to SQL, strips markdown fences from output
- [ ] `run_query()` executes generated SQL against DuckDB views using `-markdown` output format, prints debugging info on failure
- [ ] `interpret_results()` calls Claude haiku to produce a natural language answer, falls back to raw query results on failure
- [ ] All Claude calls use `command claude` (not bare `claude`), `--no-session-persistence`, `--model haiku`, `--max-budget-usd 0.01`, with stderr suppressed via `2>/dev/null`
- [ ] DuckDB runs in in-memory mode (no database file argument)
- [ ] Status messages ("Analyzing caretaker log...", "Running query...") are printed to stderr, only the final answer goes to stdout
- [ ] package.json has valid JSON with new `"query-log": "bash tools/query-log.sh"` script entry
- [ ] Script uses `set -euo pipefail` for strict error handling
- [ ] `QUESTION="${1:-}"` avoids unbound variable error with `set -u` when no args provided

## Gaps and Assumptions
- End-to-end test with a real caretaker.log was not performed (no log file exists yet)
- DuckDB's `read_json_auto` with `union_by_name=true` is assumed to handle the mixed-schema JSONL (observation/action/incident rows with different fields) -- not tested against real data
- The `len(data.food)` DuckDB function in the observations view assumes DuckDB can compute array length from parsed JSON -- untested with real data
- Claude haiku's SQL generation quality is untested -- bad SQL from Claude will trigger the `run_query` error path which displays the failed SQL for debugging
- The `sed '/^```/d'` fence stripping handles ``` at line start only; fences with language tags like ```sql are also handled since the pattern matches lines starting with ```
- The plan specified `echo -e` for piping to DuckDB; changed to `printf '%s'` to avoid portability issues with echo -e on macOS
- Plan specified `user's question` in prompt text; changed to `the following question` / `user question` to avoid apostrophe quoting issues in bash heredoc/string contexts
