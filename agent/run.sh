#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
POLICY="$SCRIPT_DIR/caretaker-policy.md"
SERVER="$PROJECT_DIR/server/caretaker.js"
LOG="$PROJECT_DIR/caretaker.log"
DECISION_LOG="$PROJECT_DIR/caretaker-decisions.log"
FIFO="/tmp/caretaker_cmd_pipe_$$"
LOOP_INTERVAL=5
FEAR_BACKOFF_DURATION=30
SERVER_PID=""
FEAR_SPIKE_TIME=0

cleanup() {
  if [[ -n "$SERVER_PID" ]] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID"
    wait "$SERVER_PID" 2>/dev/null
  fi
  exec 3>&- 2>/dev/null || true
  rm -f "$FIFO"
  echo "[caretaker] Shutdown complete" >&2
}

check_deps() {
  if ! command -v node >/dev/null 2>&1; then
    echo "Error: node is required but not found" >&2
    exit 1
  fi
  if ! command -v jq >/dev/null 2>&1; then
    echo "Error: jq is required but not found. Install with: brew install jq" >&2
    exit 1
  fi
  if ! command -v claude >/dev/null 2>&1; then
    echo "Error: claude CLI is required but not found. Install Claude Code first." >&2
    exit 1
  fi
  if [[ ! -f "$POLICY" ]]; then
    echo "Error: Policy file not found at $POLICY" >&2
    exit 1
  fi
  if [[ ! -f "$SERVER" ]]; then
    echo "Error: Server not found at $SERVER" >&2
    exit 1
  fi
}

start_server() {
  mkfifo "$FIFO"
  node "$SERVER" < "$FIFO" &
  SERVER_PID=$!
  sleep 1
  exec 3>"$FIFO"
  echo "[caretaker] Server started (PID $SERVER_PID)" >&2
  sleep 2
  echo "[caretaker] Waiting for browser connection..." >&2
}

get_latest_state() {
  if [[ ! -f "$LOG" ]]; then
    echo ""
    return 1
  fi
  STATE_LINE=$(grep '"type":"observation"' "$LOG" | tail -1)
  if [[ -z "$STATE_LINE" ]]; then
    echo ""
    return 1
  fi
  echo "$STATE_LINE" | jq -r '.data'
  return 0
}

check_fear_backoff() {
  local FEAR
  FEAR=$(echo "$1" | jq -r '.drives.fear')
  local NOW
  NOW=$(date +%s)
  if awk "BEGIN {exit !($FEAR > 0.5)}" 2>/dev/null; then
    FEAR_SPIKE_TIME=$NOW
  fi
  local ELAPSED=$((NOW - FEAR_SPIKE_TIME))
  if [[ "$FEAR_SPIKE_TIME" -gt 0 ]] && [[ "$ELAPSED" -lt "$FEAR_BACKOFF_DURATION" ]]; then
    return 0
  fi
  return 1
}

send_command() {
  echo "$1" >&3
  echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"command\":$1}" >> "$DECISION_LOG"
}

log_decision() {
  local state_json="$1"
  local response_json="$2"
  local in_backoff="$3"
  jq -n \
    --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg backoff "$in_backoff" \
    --argjson state "$state_json" \
    --argjson response "$response_json" \
    '{timestamp: $ts, backoff: ($backoff == "true"), state_summary: {hunger: $state.drives.hunger, fear: $state.drives.fear, fatigue: $state.drives.fatigue, behavior: $state.behavior.current}, response: $response}' \
    >> "$DECISION_LOG"
}

# --- Main ---

check_deps
trap cleanup EXIT INT TERM
start_server
echo "[caretaker] Decision loop starting (interval: ${LOOP_INTERVAL}s)" >&2
POLICY_CONTENT=$(cat "$POLICY")

while true; do
  sleep "$LOOP_INTERVAL"

  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "[caretaker] Server died, exiting" >&2
    exit 1
  fi

  STATE=$(get_latest_state) || true
  if [[ -z "$STATE" ]]; then
    echo "[caretaker] No state available yet, waiting..." >&2
    continue
  fi

  IN_BACKOFF="false"
  if check_fear_backoff "$STATE"; then
    IN_BACKOFF="true"
  fi

  CURRENT_TIME=$(python3 -c "import time; print(int(time.time()*1000))")
  PROMPT="CURRENT_TIME: ${CURRENT_TIME}
FEAR_BACKOFF: ${IN_BACKOFF}

Current fly state:
${STATE}"

  RAW_RESPONSE=$(command claude -p \
    --system-prompt "$POLICY_CONTENT" \
    --no-session-persistence \
    --model haiku \
    --output-format json \
    --max-budget-usd 0.50 \
    "$PROMPT" \
    2>/dev/null) || true

  # Extract the result text from claude's JSON envelope, then parse as our action JSON
  RESPONSE=$(echo "$RAW_RESPONSE" | jq -r '.result // empty' 2>/dev/null | jq '.' 2>/dev/null) || true

  if [[ -z "$RESPONSE" || "$RESPONSE" == "null" ]]; then
    echo "[caretaker] Could not parse response, skipping" >&2
    echo "[caretaker] Raw: $(echo "$RAW_RESPONSE" | head -c 200)" >&2
    continue
  fi

  ACTION=$(echo "$RESPONSE" | jq -r '.action' 2>/dev/null)
  if [[ -z "$ACTION" || "$ACTION" == "null" ]]; then
    echo "[caretaker] Invalid response from Claude, skipping" >&2
    continue
  fi

  log_decision "$STATE" "$RESPONSE" "$IN_BACKOFF"

  if [[ "$ACTION" == "wait" ]]; then
    echo "[caretaker] Action: wait -- $(echo "$RESPONSE" | jq -r '.reasoning')" >&2
    continue
  fi

  case "$ACTION" in
    place_food|set_light|set_temp|touch|blow_wind|clear_food) ;;
    *) echo "[caretaker] Unknown action '$ACTION', skipping" >&2; continue ;;
  esac

  send_command "$RESPONSE"
  echo "[caretaker] Action: $ACTION -- $(echo "$RESPONSE" | jq -r '.reasoning')" >&2
done
