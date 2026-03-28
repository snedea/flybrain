# Scout Report: T8.2

## Key Facts (read this first)

- **T8.1 is fully complete**: `server/caretaker.js` (WebSocket + stdin/stdout relay) and `js/caretaker-bridge.js` (browser-side client) are built and already loaded in `index.html:99`. No modifications to existing files are needed.
- **Only two new files required**: `agent/caretaker-policy.md` and `agent/run.sh`. The `agent/` directory does not exist -- it must be created.
- **Claude Code CLI v2.1.86 is available** (`command claude`). Key flags for this task: `-p/--print` (non-interactive), `--system-prompt <string>` (system prompt as a string, NOT a file path), `--no-session-persistence` (avoid session file accumulation per loop iteration).
- **Server protocol (critical for run.sh)**: stdin expects JSON lines `{action, params, reasoning}`; stdout emits JSON lines `{type:'state', data:{...}}`. The server also writes every observation + action to `caretaker.log` as JSON Lines. The agent can read latest state from `caretaker.log` instead of piping server stdout.
- **State schema** (from `js/caretaker-bridge.js:7-18`): drives `{hunger, fear, fatigue, curiosity, groom}` (0.0-1.0), behavior `{current, enterTime}`, position `{x, y, facingDir, speed}`, food `[{x, y, radius, eaten}]`, environment `{lightLevel: 0-2, temperature: 0-2}`.

## Relevant Files

| File | Role |
|------|------|
| `server/caretaker.js` | Server: relays state from browser to stdout, commands from stdin to browser. Logs to `caretaker.log`. Do NOT modify. |
| `js/caretaker-bridge.js` | Browser client: defines `getState()` schema, `executeCommand()` dispatch, command set. Do NOT modify. |
| `index.html:99` | Already loads `caretaker-bridge.js`. No change needed. |
| `package.json` | Has `"caretaker": "node server/caretaker.js"` script. run.sh can use `node server/caretaker.js` directly. |

## Architecture Notes

**Data flow:**
```
Browser (caretaker-bridge.js)
  -> WebSocket -> server/caretaker.js
    -> stdout JSON lines (type:'state') + caretaker.log writes
    <- stdin JSON lines {action, params, reasoning}
  <- WebSocket command dispatch
```

**Command set** (from `js/caretaker-bridge.js:34-71`):
- `place_food` params: `{x, y}` -- coordinates within canvas bounds (x >= 0, y >= 44)
- `set_light` params: `{level: "bright"|"dim"|"dark"}`
- `set_temp` params: `{level: "neutral"|"warm"|"cool"}`
- `touch` params: `{x, y}` (optional -- omit to touch fly center)
- `blow_wind` params: `{strength: 0-1, direction: deg}`
- `clear_food` params: `{}`

**Environment state mapping** (from `js/caretaker-bridge.js:33-34`):
- `lightLevel` in state: 0=bright, 1=dim, 2=dark
- `temperature` in state: 0=neutral, 1=warm, 2=cool

**Behavior time tracking**: `behavior.enterTime` is `Date.now()` ms. To detect idle > 120s: `(Date.now() - enterTime) / 1000 > 120` and `behavior.current === 'idle'`.

**Fear spike backoff tracking**: Must be tracked in shell script state (timestamp of last fear > 0.5 detection), since each `claude -p` call is stateless.

**Loop architecture for run.sh**:
1. Create a named FIFO (`/tmp/caretaker_cmd_pipe`) for server stdin
2. Start `node server/caretaker.js < FIFO &` (background)
3. Open FIFO for writing with `exec 3>FIFO` to keep it open (prevents server stdin EOF)
4. Every 5s: read last `"type":"observation"` line from `caretaker.log`, invoke `claude -p --system-prompt "$(cat policy)" --no-session-persistence` with state, parse response, write to fd 3

**caretaker.log format** (from `server/caretaker.js:17-20,52`):
- Observation entries: `{"timestamp":"...","type":"observation","data":{state}}`
- Action entries: `{"timestamp":"...","type":"action","action":"...","params":{},"reasoning":"...",...}`

## Suggested Approach

**`agent/caretaker-policy.md`** -- Write as a system prompt document (not CLAUDE.md format). Include:
1. Role description (you are a caretaker for a virtual Drosophila)
2. Decision loop context (called every 5s with current state)
3. Full policy rules verbatim from task spec
4. State JSON schema with field descriptions
5. Output format: single JSON object `{action, params, reasoning}` or `{action: "wait", reasoning}` -- no other output, no markdown, no explanation
6. Policy application examples (fear > 0.3 -> set_temp neutral; hunger > 0.6 + no food -> place_food near fly)
7. Coordinate calculation guidance: place food 60-80px from fly in a random cardinal direction, not on top

**`agent/run.sh`** -- Shell script:
1. Resolve paths relative to script location (use `$(cd "$(dirname "$0")/.." && pwd)` for flybrain root)
2. Check `node` is available; check `caretaker.log` writability
3. FIFO creation + server startup with SIGTERM trap for cleanup
4. Fear-backoff state: track `FEAR_SPIKE_TIME` variable updated when fear > 0.5 detected
5. Parse `claude -p` response with `jq` (require jq; if absent, use `python3 -c` fallback)
6. Validate action field is in allowed set before sending to FIFO
7. Log each decision to `caretaker-decisions.log` alongside `caretaker.log`

## Risks and Constraints (read this last)

- **`--system-prompt` takes a string, not a file path**: run.sh must do `--system-prompt "$(cat "$POLICY")"`. Quotes inside the policy file must not break the shell expansion -- use single-line substitution or a temp file approach. Safest: write policy to a temp file and use command substitution.
- **FIFO deadlock**: `mkfifo` + `node ... < FIFO` will block until a writer opens FIFO. The `exec 3>FIFO` line in the script must come *after* the node backgrounded process has started and before the loop. Actually: node opens FIFO for read when it starts, blocking until a writer appears; exec 3>FIFO provides the writer. Order: node background first, then exec -- this should work but needs to account for node startup delay.
- **claude -p startup time**: Each loop iteration forks a new Claude Code process (~1-3s startup). With a 5s sleep, real decision frequency will be ~5s + startup. That's acceptable per spec.
- **caretaker.log may not exist on first loop iteration**: Guard with `[[ -f "$LOG" ]]` before reading.
- **No browser connected yet**: Server will still receive stdin commands but `action_ack` will show `success: false, error: 'no browser connected'`. Agent should handle this gracefully (it's logged, not a fatal error).
- **Coordinate space**: `place_food` needs canvas-relative coordinates. Canvas spans full window (`window.innerWidth` x `window.innerHeight`). The policy should instruct the agent to compute x/y as fly position + 60-80px offset in a random direction, clamped to [0, innerWidth] x [44, innerHeight]. Since the agent doesn't know canvas size from the state alone, use fly position +/- 80px and trust the bridge's clamp at `js/caretaker-bridge.js:37-38`.
- **`jq` may not be installed**: run.sh should check for `jq` and fail with a helpful message. Alternative: use `python3 -c "import json,sys; ..."` as fallback.
- **Claude Code's `command claude`** is a shell function wrapping `command claude "$@"` with a `switch` subcommand override. Use `command claude` not `claude` inside run.sh to bypass the function wrapper.
