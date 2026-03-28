# Plan: T8.2

## Dependencies
- list: none (uses existing `node`, `jq`, and `claude` CLI -- no new packages)
- commands: none

## File Operations (in execution order)

### 1. CREATE agent/caretaker-policy.md
- operation: CREATE
- reason: Define the caretaker policy as a system prompt document that Claude Code receives via `--system-prompt`. This is the "brain" of the caretaker agent -- it tells Claude how to interpret fly state and what actions to take.

#### Content Structure

The file is a markdown document (not code). It is consumed as a string by `claude -p --system-prompt "$(cat agent/caretaker-policy.md)"`. Write it in second-person imperative ("You are..."). It must contain these exact sections in this order:

**Section 1: Role**
```
You are a caretaker for a virtual Drosophila (fruit fly) in the FlyBrain simulation. You receive the fly's current state as JSON every ~5 seconds. You decide whether to take an action or wait. You must output exactly one JSON object per invocation -- no markdown, no explanation, no extra text.
```

**Section 2: Output Format**

Specify the exact JSON output format. Two valid forms:

Action form:
```json
{"action": "<action_name>", "params": {<action_params>}, "reasoning": "<1-2 sentence explanation>"}
```

Wait form (when no action needed):
```json
{"action": "wait", "params": {}, "reasoning": "<1-2 sentence explanation>"}
```

State that any output not matching this format will break the pipeline. No markdown fences, no preamble, no trailing text.

**Section 3: Available Actions**

List each action with its exact param schema:

| Action | Params | Effect |
|--------|--------|--------|
| `place_food` | `{"x": <number>, "y": <number>}` | Places food at canvas coordinates. x >= 0, y >= 44 (toolbar height). |
| `set_light` | `{"level": "bright"\|"dim"\|"dark"}` | Changes ambient light level. |
| `set_temp` | `{"level": "neutral"\|"warm"\|"cool"}` | Changes temperature. |
| `touch` | `{"x": <number>, "y": <number>}` or `{}` | Touches at coordinates, or fly center if omitted. |
| `blow_wind` | `{"strength": <0-1>, "direction": <degrees>}` | Blows wind. Strength 0-1, direction in degrees. |
| `clear_food` | `{}` | Removes all food from canvas. |

**Section 4: State Schema**

Document the exact JSON schema the agent receives as its prompt input:

```
{
  "drives": {
    "hunger": 0.0-1.0,    // increases over time, decreases when fed
    "fear": 0.0-1.0,      // spikes on touch/wind, decays over ~10s
    "fatigue": 0.0-1.0,   // increases with activity, decreases at rest
    "curiosity": 0.0-1.0, // fluctuates randomly
    "groom": 0.0-1.0      // grooming urge
  },
  "behavior": {
    "current": "idle"|"walk"|"feed"|"groom"|"fly"|"rest"|"explore"|"startle"|"phototaxis",
    "enterTime": <unix_ms>,   // Date.now() when behavior started
    "groomLocation": <string> // body part being groomed, if grooming
  },
  "position": {
    "x": <number>,        // canvas x coordinate
    "y": <number>,        // canvas y coordinate (y >= 44 is below toolbar)
    "facingDir": <radians>, // direction fly faces
    "speed": <number>     // current movement speed
  },
  "firingStats": {
    "firedNeurons": <number> // count of neurons that fired recently
  },
  "food": [               // array of food items on canvas
    {"x": <number>, "y": <number>, "radius": <number>, "eaten": <0-1>}
  ],
  "environment": {
    "lightLevel": 0|1|2,  // 0=bright, 1=dim, 2=dark
    "temperature": 0|1|2  // 0=neutral, 1=warm, 2=cool
  }
}
```

**Section 5: Policy Rules**

Write each rule as a numbered item with exact thresholds and the action to take. These are evaluated in priority order (highest priority first):

1. **Fear backoff**: If the `FEAR_BACKOFF` flag is present in the input metadata (set by run.sh when fear > 0.5 was detected in the last 30s), output `{"action": "wait", "params": {}, "reasoning": "Backing off -- fear spike detected within last 30s"}`. Do not take any action during backoff.

2. **No stacking stressors**: Never issue `blow_wind`, `touch`, or `set_light` with level `"bright"` in the same decision cycle. If the environment already has `lightLevel: 0` (bright), do not also issue `touch` or `blow_wind`. If the fly's fear > 0.3, do not issue any of these three.

3. **Fear > 0.3 -- comfort the fly**: If `drives.fear > 0.3` and `environment.temperature !== 0`, issue `{"action": "set_temp", "params": {"level": "neutral"}, "reasoning": "Fear elevated at <value>, setting temperature to neutral to reduce stress"}`.

4. **Hunger > 0.6 -- feed the fly**: If `drives.hunger > 0.6` and `food.length === 0` (no food on canvas), place food near the fly but NOT on top of it. Compute food placement as:
   - Pick a random cardinal offset: one of (+80, 0), (-80, 0), (0, +80), (0, -80)
   - Add offset to fly position: `x = position.x + offsetX`, `y = position.y + offsetY`
   - Clamp: `x = max(20, min(x, 800))`, `y = max(64, min(y, 560))`
   - Issue `{"action": "place_food", "params": {"x": <computed_x>, "y": <computed_y>}, "reasoning": "Hunger at <value>, placing food ~80px from fly"}`
   - If food already exists on canvas (`food.length > 0`), do NOT place more food. Wait instead.

5. **Fatigue > 0.5 -- dim lights**: If `drives.fatigue > 0.5` and `environment.lightLevel === 0` (bright), issue `{"action": "set_light", "params": {"level": "dim"}, "reasoning": "Fatigue at <value>, dimming lights to encourage rest"}`.

6. **Idle > 120s -- stimulate**: If `behavior.current === "idle"` and `(now - behavior.enterTime) / 1000 > 120` (where `now` is provided in input metadata), vary stimuli to spark curiosity. Alternate between:
   - If `food.length === 0`: place food (same offset logic as rule 4)
   - If food already exists: issue a light touch at the fly's position `{"action": "touch", "params": {}, "reasoning": "Idle for >120s, gentle touch to spark curiosity"}`
   - Only issue the touch if fear < 0.3 (respect rule 2)

7. **Default -- wait**: If no rule triggers, output `{"action": "wait", "params": {}, "reasoning": "All drives within normal range, observing"}`.

**Section 6: Important Notes**

- You receive a single JSON state snapshot. You output a single JSON action. No multi-turn conversation.
- Clamp coordinates: x in [20, 800], y in [64, 560]. These are safe canvas bounds.
- Prefer doing nothing over doing something harmful. When in doubt, wait.
- Never place food at the fly's exact position -- always offset by at least 60px.
- The `FEAR_BACKOFF` and `CURRENT_TIME` fields are injected by the launch script into your prompt, not part of the state JSON.

### 2. CREATE agent/run.sh
- operation: CREATE
- reason: Shell script that starts the caretaker server, runs the Claude Code decision loop, and manages state between iterations (fear backoff tracking, log reading, command relay).

#### Shebang and Settings
```bash
#!/usr/bin/env bash
set -euo pipefail
```

#### Constants
```bash
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
```

#### Function: cleanup()
- signature: `cleanup()`
- purpose: Kill server process, remove FIFO, close file descriptor
- logic:
  1. If `SERVER_PID` is non-empty and process exists (`kill -0 "$SERVER_PID" 2>/dev/null`), send `kill "$SERVER_PID"` and `wait "$SERVER_PID" 2>/dev/null`
  2. Close fd 3 with `exec 3>&-` (suppress errors)
  3. Remove FIFO with `rm -f "$FIFO"`
  4. Print `"[caretaker] Shutdown complete"` to stderr
- wiring: Registered as trap handler: `trap cleanup EXIT INT TERM`

#### Function: check_deps()
- signature: `check_deps()`
- purpose: Verify required commands exist before starting
- logic:
  1. Check `command -v node >/dev/null 2>&1` -- if missing, print `"Error: node is required but not found"` to stderr and `exit 1`
  2. Check `command -v jq >/dev/null 2>&1` -- if missing, print `"Error: jq is required but not found. Install with: brew install jq"` to stderr and `exit 1`
  3. Check `command -v claude >/dev/null 2>&1` -- if missing, print `"Error: claude CLI is required but not found. Install Claude Code first."` to stderr and `exit 1`
  4. Check `[[ -f "$POLICY" ]]` -- if missing, print `"Error: Policy file not found at $POLICY"` to stderr and `exit 1`
  5. Check `[[ -f "$SERVER" ]]` -- if missing, print `"Error: Server not found at $SERVER"` to stderr and `exit 1`

#### Function: start_server()
- signature: `start_server()`
- purpose: Create FIFO, start the caretaker server with stdin from FIFO, open FIFO for writing
- logic:
  1. `mkfifo "$FIFO"`
  2. Start server in background: `node "$SERVER" < "$FIFO" &`
  3. Capture PID: `SERVER_PID=$!`
  4. Sleep 1 second to let server start and open FIFO for reading: `sleep 1`
  5. Open FIFO for writing on fd 3: `exec 3>"$FIFO"`
  6. Print `"[caretaker] Server started (PID $SERVER_PID)"` to stderr
  7. Sleep 2 more seconds to let server fully initialize WebSocket: `sleep 2`
  8. Print `"[caretaker] Waiting for browser connection..."` to stderr

#### Function: get_latest_state()
- signature: `get_latest_state()`
- purpose: Read the most recent observation from caretaker.log and print the state JSON to stdout
- logic:
  1. If `[[ ! -f "$LOG" ]]`, print `""` (empty string) to stdout and return 1
  2. Read the last observation line: `STATE_LINE=$(grep '"type":"observation"' "$LOG" | tail -1)`
  3. If `STATE_LINE` is empty, print `""` to stdout and return 1
  4. Extract the `.data` field: `echo "$STATE_LINE" | jq -r '.data'`
  5. Return 0

#### Function: check_fear_backoff()
- signature: `check_fear_backoff(state_json)`
- purpose: Check if fear > 0.5 in current state and update FEAR_SPIKE_TIME. Return 0 if in backoff, 1 if not.
- logic:
  1. Extract fear: `FEAR=$(echo "$1" | jq -r '.drives.fear')`
  2. Get current time: `NOW=$(date +%s)`
  3. If fear > 0.5 (use `bc` or awk: `echo "$FEAR > 0.5" | bc -l` returns 1): set `FEAR_SPIKE_TIME=$NOW`
  4. Compute elapsed: `ELAPSED=$((NOW - FEAR_SPIKE_TIME))`
  5. If `FEAR_SPIKE_TIME > 0` AND `ELAPSED < $FEAR_BACKOFF_DURATION`: return 0 (in backoff)
  6. Else: return 1 (not in backoff)
- note: Use awk for float comparison instead of bc since bc may not be available: `awk "BEGIN {exit !($FEAR > 0.5)}"`

#### Function: send_command()
- signature: `send_command(json_string)`
- purpose: Write a command JSON line to the server via fd 3 and log it
- logic:
  1. `echo "$1" >&3`
  2. Append to decision log: `echo "{\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"command\":$1}" >> "$DECISION_LOG"`

#### Function: log_decision()
- signature: `log_decision(state_json, response_json, in_backoff)`
- purpose: Write a structured decision log entry
- logic:
  1. Construct JSON: `jq -n --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg backoff "$3" --argjson state "$1" --argjson response "$2" '{timestamp: $ts, backoff: ($backoff == "true"), state_summary: {hunger: $state.drives.hunger, fear: $state.drives.fear, fatigue: $state.drives.fatigue, behavior: $state.behavior.current}, response: $response}'`
  2. Append to `$DECISION_LOG`

#### Main Script Body
- logic (executed sequentially):
  1. Call `check_deps`
  2. Register trap: `trap cleanup EXIT INT TERM`
  3. Call `start_server`
  4. Print `"[caretaker] Decision loop starting (interval: ${LOOP_INTERVAL}s)"` to stderr
  5. Read policy file into variable: `POLICY_CONTENT=$(cat "$POLICY")`
  6. Enter infinite loop: `while true; do ... done`

#### Main Loop Body (inside `while true`)
- logic (each iteration):
  1. Sleep: `sleep "$LOOP_INTERVAL"`
  2. Check server is still running: `if ! kill -0 "$SERVER_PID" 2>/dev/null; then echo "[caretaker] Server died, exiting" >&2; exit 1; fi`
  3. Get latest state: `STATE=$(get_latest_state)` -- if return code is non-zero or STATE is empty, print `"[caretaker] No state available yet, waiting..."` to stderr and `continue`
  4. Check fear backoff: call `check_fear_backoff "$STATE"`. Capture result in `IN_BACKOFF` variable (`true` or `false`).
  5. Build the prompt string for Claude. The prompt is the state JSON plus metadata:
     ```bash
     CURRENT_TIME=$(date +%s%3N)
     PROMPT="CURRENT_TIME: ${CURRENT_TIME}
     FEAR_BACKOFF: ${IN_BACKOFF}

     Current fly state:
     ${STATE}"
     ```
  6. Call Claude Code:
     ```bash
     RESPONSE=$(command claude -p \
       --system-prompt "$POLICY_CONTENT" \
       --no-session-persistence \
       --model haiku \
       --max-budget-usd 0.01 \
       2>/dev/null) || true
     ```
     Notes:
     - Use `command claude` (not bare `claude`) to bypass shell function wrappers
     - Use `--model haiku` for cost efficiency on a 5s loop (Haiku is fast and cheap for simple policy evaluation)
     - Use `--max-budget-usd 0.01` as a safety cap per invocation
     - Redirect stderr to /dev/null to suppress Claude CLI startup noise
     - `|| true` prevents set -e from exiting on non-zero Claude exit code
     - The prompt is passed as a positional argument (the state text) after all flags
  7. Validate response is valid JSON with an `action` field:
     ```bash
     ACTION=$(echo "$RESPONSE" | jq -r '.action' 2>/dev/null)
     if [[ -z "$ACTION" || "$ACTION" == "null" ]]; then
       echo "[caretaker] Invalid response from Claude, skipping" >&2
       continue
     fi
     ```
  8. Log the decision: call `log_decision "$STATE" "$RESPONSE" "$IN_BACKOFF"`
  9. If `ACTION` equals `"wait"`, print `"[caretaker] Action: wait -- $(echo "$RESPONSE" | jq -r '.reasoning')"` to stderr and `continue`
  10. Validate action is in allowed set:
      ```bash
      case "$ACTION" in
        place_food|set_light|set_temp|touch|blow_wind|clear_food) ;;
        *) echo "[caretaker] Unknown action '$ACTION', skipping" >&2; continue ;;
      esac
      ```
  11. Send command to server: `send_command "$RESPONSE"`
  12. Print `"[caretaker] Action: $ACTION -- $(echo "$RESPONSE" | jq -r '.reasoning')"` to stderr

#### Full Prompt Construction Detail

The prompt passed to `claude -p` must be the positional argument (after all flags). The exact invocation:

```bash
RESPONSE=$(command claude -p \
  --system-prompt "$POLICY_CONTENT" \
  --no-session-persistence \
  --model haiku \
  --max-budget-usd 0.01 \
  "$PROMPT" \
  2>/dev/null) || true
```

Where `$PROMPT` is the state string built in step 5.

#### File Permissions
- After creating `agent/run.sh`, make it executable: the builder must run `chmod +x agent/run.sh`

## Verification
- build: `node -c server/caretaker.js` (syntax check existing server -- should pass, confirms no accidental edits)
- lint: `bash -n agent/run.sh` (bash syntax check on the new script)
- test: no existing tests for this subsystem
- smoke: Run `cat agent/caretaker-policy.md | head -5` and verify it starts with the role description. Run `bash -n agent/run.sh && echo OK` and verify it prints OK. Run `grep -c '"action"' agent/caretaker-policy.md` and verify count is > 5 (policy references actions multiple times). Verify `agent/run.sh` has executable permission with `test -x agent/run.sh && echo executable`.

## Constraints
- Do NOT modify any existing files (`server/caretaker.js`, `js/caretaker-bridge.js`, `index.html`, `package.json`). T8.1 is complete and these files must not change.
- Do NOT create any files outside the `agent/` directory. The only two files to create are `agent/caretaker-policy.md` and `agent/run.sh`.
- Do NOT install any new npm packages or system dependencies.
- Do NOT use `--system-prompt-file` -- it does not exist in the Claude CLI. Use `--system-prompt "$POLICY_CONTENT"` where `POLICY_CONTENT` is read via `cat`.
- The policy file (`caretaker-policy.md`) must be pure prose/markdown -- no shell code, no executable content. It is consumed as a system prompt string.
- `run.sh` must use `command claude` (not bare `claude`) to avoid shell function interference.
- The FIFO path must include `$$` (PID) to avoid collisions if multiple instances run: `/tmp/caretaker_cmd_pipe_$$`.
- Use `--model haiku` for cost efficiency. The caretaker policy is simple enough for Haiku and runs every 5 seconds.
- All float comparisons in bash must use `awk` (not `bc`), since `bc` is not guaranteed on macOS.
- Do not add the `agent/` directory to `.gitignore` -- these files should be committed.
- The `caretaker-policy.md` must NOT contain single quotes that would break `--system-prompt "$POLICY_CONTENT"` shell expansion. Use double quotes or rephrase. Actually: since `POLICY_CONTENT` is in double quotes, single quotes inside are fine. Avoid unescaped backticks, dollar signs, and double quotes inside the policy file, OR ensure the builder reads the policy into a variable before expansion. Safest approach: the policy file should avoid `$`, backticks, and unescaped double quotes. Use words instead of special characters where possible.
