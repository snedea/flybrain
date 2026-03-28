# Plan: T8.4

## Dependencies
- list: [duckdb (already installed at /opt/homebrew/bin/duckdb v1.5.1), jq (already required by agent/run.sh), claude CLI (already required by agent/run.sh)]
- commands: [] (no new installs needed)

## File Operations (in execution order)

### 1. CREATE tools/query-log.sh
- operation: CREATE
- reason: New shell script that loads caretaker.log into DuckDB, uses Claude Code to generate SQL from natural language questions, runs the SQL, and presents interpreted results

#### Structure

The script has these sections in order: shebang + set flags, constants, dependency checks, argument validation, DuckDB schema setup, schema extraction, SQL generation via Claude, SQL execution, result interpretation via Claude, output.

#### Constants
```bash
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$PROJECT_DIR/caretaker.log"
DUCKDB_SETUP=""  # will hold the SQL that creates views, built in build_schema()
```

#### Functions

- signature: `check_deps()`
  - purpose: Verify required CLI tools are available
  - logic:
    1. Check `command -v duckdb` exists, if not print `"Error: duckdb is required but not found. Install with: brew install duckdb"` to stderr and exit 1
    2. Check `command -v claude` exists, if not print `"Error: claude CLI is required but not found."` to stderr and exit 1
    3. Check `command -v jq` exists, if not print `"Error: jq is required but not found. Install with: brew install jq"` to stderr and exit 1
  - calls: none
  - returns: nothing (exits on failure)
  - error handling: exit 1 with descriptive message for each missing tool

- signature: `validate_args()`
  - purpose: Check that a question argument was provided and log file exists
  - logic:
    1. If `$#` is 0, print usage message to stderr: `"Usage: tools/query-log.sh \"your question about the caretaker log\""` followed by example queries (one per line): `"  Examples:"`, `"    tools/query-log.sh \"how many times did Claude forget to feed the fly?\""`, `"    tools/query-log.sh \"what was the fly's average hunger today?\""`, `"    tools/query-log.sh \"show me all incidents\""`, `"    tools/query-log.sh \"how many times did Claude scare the fly?\""`. Then exit 1.
    2. If `$LOG_FILE` does not exist or is empty (test with `[[ ! -s "$LOG_FILE" ]]`), print `"Error: No caretaker log found at $LOG_FILE"` followed by `"Run the caretaker agent first: bash agent/run.sh"` to stderr and exit 1.
  - calls: none
  - returns: nothing (exits on failure)
  - error handling: exit 1 with usage or missing-log message

- signature: `build_schema()`
  - purpose: Build the DuckDB SQL preamble that creates views from the JSON Lines log
  - logic:
    1. Set the variable `DUCKDB_SETUP` to the following multi-line SQL string (use a heredoc assigned to the variable):
    ```sql
    CREATE VIEW raw_log AS
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
    WHERE type = 'incident';
    ```
    Note: `${LOG_FILE}` must be interpolated into the SQL string (it is a shell variable holding the absolute path). Use double quotes around the heredoc delimiter to allow variable expansion (i.e., `DUCKDB_SETUP=$(cat <<EOF` not `<<'EOF'`).
  - calls: none
  - returns: nothing (sets DUCKDB_SETUP variable)
  - error handling: none needed (static SQL construction)

- signature: `get_schema_info()`
  - purpose: Run DuckDB to extract view schemas and sample data for Claude's context
  - logic:
    1. Build a SQL string that consists of `$DUCKDB_SETUP` followed by these queries separated by newlines:
       ```sql
       SELECT 'OBSERVATIONS_SCHEMA' AS label;
       DESCRIBE observations;
       SELECT 'OBSERVATIONS_SAMPLE' AS label;
       SELECT * FROM observations LIMIT 3;
       SELECT 'OBSERVATIONS_COUNT' AS label;
       SELECT count(*) AS total_observations FROM observations;
       SELECT 'ACTIONS_SCHEMA' AS label;
       DESCRIBE actions;
       SELECT 'ACTIONS_SAMPLE' AS label;
       SELECT * FROM actions LIMIT 3;
       SELECT 'ACTIONS_COUNT' AS label;
       SELECT count(*) AS total_actions FROM actions;
       SELECT 'INCIDENTS_SCHEMA' AS label;
       DESCRIBE incidents;
       SELECT 'INCIDENTS_SAMPLE' AS label;
       SELECT * FROM incidents LIMIT 5;
       SELECT 'INCIDENTS_COUNT' AS label;
       SELECT count(*) AS total_incidents FROM incidents;
       SELECT 'TIME_RANGE' AS label;
       SELECT min(timestamp::TIMESTAMP) AS earliest, max(timestamp::TIMESTAMP) AS latest FROM raw_log;
       ```
    2. Run `duckdb -markdown -c "$FULL_SQL"` (in-memory mode, no database file argument) and capture stdout into a variable `SCHEMA_INFO`
    3. If duckdb exits non-zero, print `"Error: Failed to read caretaker log with DuckDB. The log file may be malformed."` to stderr and exit 1
  - calls: `duckdb` CLI
  - returns: nothing (sets SCHEMA_INFO variable)
  - error handling: check duckdb exit code, exit 1 on failure

- signature: `generate_sql(question, schema_info)`
  - purpose: Call Claude Code to generate a DuckDB SQL query from the natural language question
  - logic:
    1. Build a prompt string (store in variable `GEN_PROMPT`) using a heredoc with the following exact content:
       ```
       You are a DuckDB SQL expert. Generate a single DuckDB SQL query to answer the user's question about a virtual fly caretaker log.

       Available views (created from a JSON Lines log file):

       ${SCHEMA_INFO}

       Key domain knowledge:
       - "observations" has one row per ~1-second state snapshot of the fly (drives, behavior, position)
       - "actions" has one row per caretaker action (place_food, set_light, set_temp, touch, blow_wind, clear_food)
       - "incidents" has one row per detected incident (scared_the_fly, forgot_to_feed)
       - "forgot to feed" = incident type 'forgot_to_feed' (hunger > 0.9 with no food present)
       - "scared the fly" = incident type 'scared_the_fly' (fear spike after a Claude action)
       - Drives (hunger, fear, fatigue, curiosity, groom) range from 0.0 to 1.0
       - light_level: 0=bright, 1=dim, 2=dark
       - temperature: 0=neutral, 1=warm, 2=cool
       - All timestamps are ISO 8601

       User's question: ${QUESTION}

       Output ONLY the SQL query. No explanation, no markdown fences, no comments. Just the SQL.
       ```
    2. Call: `GENERATED_SQL=$(command claude -p --no-session-persistence --model haiku --max-budget-usd 0.01 "$GEN_PROMPT" 2>/dev/null)`
    3. If the exit code is non-zero or `GENERATED_SQL` is empty, print `"Error: Failed to generate SQL query from Claude."` to stderr and exit 1
    4. Strip markdown code fences if present: pipe `GENERATED_SQL` through `sed` to remove lines matching `^\`\`\`.*` (i.e., `GENERATED_SQL=$(echo "$GENERATED_SQL" | sed '/^```/d')`)
    5. Trim leading/trailing whitespace: `GENERATED_SQL=$(echo "$GENERATED_SQL" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | sed '/^$/d')`
  - calls: `command claude -p`, `sed`
  - returns: nothing (sets GENERATED_SQL variable)
  - error handling: check claude exit code and empty output, exit 1 on failure

- signature: `run_query(sql)`
  - purpose: Execute the generated SQL against the DuckDB views and capture results
  - logic:
    1. Build the full SQL: `FULL_QUERY="${DUCKDB_SETUP}\n${GENERATED_SQL}"`
    2. Run: `QUERY_RESULTS=$(echo -e "$FULL_QUERY" | duckdb -markdown 2>&1)`
    3. Store the exit code: `QUERY_EXIT=$?`
    4. If `QUERY_EXIT` is non-zero, print to stderr: `"Error: SQL query failed. Generated SQL was:"` followed by `"$GENERATED_SQL"` followed by `"DuckDB output:"` followed by `"$QUERY_RESULTS"`. Then exit 1.
  - calls: `duckdb` CLI
  - returns: nothing (sets QUERY_RESULTS variable)
  - error handling: check duckdb exit code, print the failed SQL and error output for debugging, exit 1

- signature: `interpret_results(question, sql, results)`
  - purpose: Call Claude Code to produce a natural language answer from the SQL results
  - logic:
    1. Build prompt (store in `INTERP_PROMPT`):
       ```
       Answer the user's question based on these query results from a virtual fly caretaker log.

       Question: ${QUESTION}

       SQL that was run:
       ${GENERATED_SQL}

       Results:
       ${QUERY_RESULTS}

       Give a concise, direct answer. If the results are empty, say so. Use specific numbers from the results.
       ```
    2. Call: `ANSWER=$(command claude -p --no-session-persistence --model haiku --max-budget-usd 0.01 "$INTERP_PROMPT" 2>/dev/null)`
    3. If the exit code is non-zero or `ANSWER` is empty, fall back to printing raw results: set `ANSWER="$QUERY_RESULTS"`
  - calls: `command claude -p`
  - returns: nothing (sets ANSWER variable)
  - error handling: on failure, gracefully fall back to raw query results (no exit, just degrade)

#### Main Flow
The main body of the script (after the function definitions) executes in this exact order:
1. `QUESTION="$1"` -- capture the first argument
2. `check_deps`
3. `validate_args "$@"` -- pass all args for the `$#` check
4. `build_schema`
5. `get_schema_info` -- populates SCHEMA_INFO
6. Print to stderr: `"Analyzing caretaker log..."`
7. `generate_sql` -- populates GENERATED_SQL
8. Print to stderr: `"Running query..."`
9. `run_query` -- populates QUERY_RESULTS
10. `interpret_results` -- populates ANSWER
11. Print to stdout: empty line, then `"$ANSWER"`

#### Shebang and Flags
- First line: `#!/usr/bin/env bash`
- Second line: `set -euo pipefail`

#### File Permissions
- After creating the file, run `chmod +x tools/query-log.sh`

### 2. MODIFY package.json
- operation: MODIFY
- reason: Add a convenience npm script for the query tool
- anchor: `"caretaker": "node server/caretaker.js"`

#### Wiring / Integration
- Add a new script entry after the `"caretaker"` line:
  ```json
  "query-log": "bash tools/query-log.sh"
  ```
- The `"caretaker"` line needs a trailing comma added before the new entry. The result should be:
  ```json
  "scripts": {
    "caretaker": "node server/caretaker.js",
    "query-log": "bash tools/query-log.sh"
  },
  ```

## Verification
- build: `bash -n tools/query-log.sh` (syntax check only -- no runtime deps needed)
- lint: `shellcheck tools/query-log.sh || true` (shellcheck may not be installed; non-blocking)
- test: no existing tests for shell scripts
- smoke: Run `bash tools/query-log.sh` with no arguments and verify it prints the usage message with examples and exits with code 1. Verify the exit code with `echo $?`. Then run `bash tools/query-log.sh "test question"` and verify it prints the "No caretaker log found" error (since caretaker.log does not exist) and exits with code 1.

## Constraints
- Do NOT modify server/caretaker.js, js/caretaker-bridge.js, agent/run.sh, agent/caretaker-policy.md, or any file in js/, css/, or server/ (except package.json)
- Do NOT install any new npm or system packages
- Do NOT create a .env file or any configuration files
- The tools/ directory does not exist yet -- it must be created by writing the file (the Write tool will create parent directories)
- Use `command claude` (not bare `claude`) inside the script to match the pattern in agent/run.sh
- Use `--model haiku` and `--max-budget-usd 0.01` for Claude calls to keep costs low, matching agent/run.sh conventions
- Use `--no-session-persistence` for all Claude calls to avoid session file accumulation
- DuckDB must be invoked in in-memory mode (no database file argument) -- just `duckdb` not `duckdb some.db`
- Use `-markdown` flag for DuckDB output to get readable table formatting
- The script must work with both existing and fresh (empty/nonexistent) caretaker.log files (graceful error for missing/empty log)
- All stderr output from Claude calls must be suppressed with `2>/dev/null` to keep the UX clean
- The JSONL log path is always `$PROJECT_DIR/caretaker.log` (matching `server/caretaker.js:8` which writes to `path.join(__dirname, '..', 'caretaker.log')`)
