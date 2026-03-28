#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$PROJECT_DIR/caretaker.log"
DUCKDB_SETUP=""
SCHEMA_INFO=""
GENERATED_SQL=""
QUERY_RESULTS=""
ANSWER=""

check_deps() {
  if ! command -v duckdb &>/dev/null; then
    echo "Error: duckdb is required but not found. Install with: brew install duckdb" >&2
    exit 1
  fi
  if ! command -v claude &>/dev/null; then
    echo "Error: claude CLI is required but not found." >&2
    exit 1
  fi
  if ! command -v jq &>/dev/null; then
    echo "Error: jq is required but not found. Install with: brew install jq" >&2
    exit 1
  fi
}

validate_args() {
  if [[ $# -eq 0 ]]; then
    echo "Usage: tools/query-log.sh \"your question about the caretaker log\"" >&2
    echo "  Examples:" >&2
    echo "    tools/query-log.sh \"how many times did Claude forget to feed the fly?\"" >&2
    echo "    tools/query-log.sh \"what was the fly's average hunger today?\"" >&2
    echo "    tools/query-log.sh \"show me all incidents\"" >&2
    echo "    tools/query-log.sh \"how many times did Claude scare the fly?\"" >&2
    exit 1
  fi
  if [[ ! -s "$LOG_FILE" ]]; then
    echo "Error: No caretaker log found at $LOG_FILE" >&2
    echo "Run the caretaker agent first: bash agent/run.sh" >&2
    exit 1
  fi
}

build_schema() {
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
}

get_schema_info() {
  local FULL_SQL="${DUCKDB_SETUP}
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
SELECT min(timestamp::TIMESTAMP) AS earliest, max(timestamp::TIMESTAMP) AS latest FROM raw_log;"

  if ! SCHEMA_INFO=$(duckdb -markdown -c "$FULL_SQL" 2>&1); then
    echo "Error: Failed to read caretaker log with DuckDB. The log file may be malformed." >&2
    exit 1
  fi
}

generate_sql() {
  local GEN_PROMPT="You are a DuckDB SQL expert. Generate a single DuckDB SQL query to answer the user question about a virtual fly caretaker log.

Available views (created from a JSON Lines log file):

${SCHEMA_INFO}

Key domain knowledge:
- \"observations\" has one row per ~1-second state snapshot of the fly (drives, behavior, position)
- \"actions\" has one row per caretaker action (place_food, set_light, set_temp, touch, blow_wind, clear_food)
- \"incidents\" has one row per detected incident (scared_the_fly, forgot_to_feed)
- \"forgot to feed\" = incident type forgot_to_feed (hunger > 0.9 with no food present)
- \"scared the fly\" = incident type scared_the_fly (fear spike after a Claude action)
- Drives (hunger, fear, fatigue, curiosity, groom) range from 0.0 to 1.0
- light_level: 0=bright, 1=dim, 2=dark
- temperature: 0=neutral, 1=warm, 2=cool
- All timestamps are ISO 8601

User question: ${QUESTION}

Output ONLY the SQL query. No explanation, no markdown fences, no comments. Just the SQL."

  if ! GENERATED_SQL=$(command claude -p --no-session-persistence --model haiku --max-budget-usd 0.01 "$GEN_PROMPT" 2>/dev/null); then
    echo "Error: Failed to generate SQL query from Claude." >&2
    exit 1
  fi
  if [[ -z "$GENERATED_SQL" ]]; then
    echo "Error: Failed to generate SQL query from Claude." >&2
    exit 1
  fi
  GENERATED_SQL=$(echo "$GENERATED_SQL" | sed '/^```/d')
  GENERATED_SQL=$(echo "$GENERATED_SQL" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//' | sed '/^$/d')
}

run_query() {
  local FULL_QUERY="${DUCKDB_SETUP}
${GENERATED_SQL}"

  if ! QUERY_RESULTS=$(printf '%s' "$FULL_QUERY" | duckdb -markdown 2>&1); then
    echo "Error: SQL query failed. Generated SQL was:" >&2
    echo "$GENERATED_SQL" >&2
    echo "DuckDB output:" >&2
    echo "$QUERY_RESULTS" >&2
    exit 1
  fi
}

interpret_results() {
  local INTERP_PROMPT="Answer the following question based on these query results from a virtual fly caretaker log.

Question: ${QUESTION}

SQL that was run:
${GENERATED_SQL}

Results:
${QUERY_RESULTS}

Give a concise, direct answer. If the results are empty, say so. Use specific numbers from the results."

  if ! ANSWER=$(command claude -p --no-session-persistence --model haiku --max-budget-usd 0.01 "$INTERP_PROMPT" 2>/dev/null); then
    ANSWER="$QUERY_RESULTS"
  fi
  if [[ -z "$ANSWER" ]]; then
    ANSWER="$QUERY_RESULTS"
  fi
}

QUESTION="${1:-}"
check_deps
validate_args "$@"
build_schema
get_schema_info
echo "Analyzing caretaker log..." >&2
generate_sql
echo "Running query..." >&2
run_query
interpret_results
echo ""
echo "$ANSWER"
