# Build Claims -- T8.2

## Files Changed
- [CREATE] agent/caretaker-policy.md -- Caretaker policy document defining the Claude Code system prompt with role, output format, available actions, state schema, 7 priority-ordered policy rules, and safety notes
- [CREATE] agent/run.sh -- Bash launch script that starts caretaker server via FIFO, runs a 5s decision loop calling Claude Code with the policy, tracks fear backoff state, validates and relays commands, logs decisions

## Verification Results
- Build: PASS (node -c server/caretaker.js -- existing server syntax unchanged)
- Lint: PASS (bash -n agent/run.sh -- no syntax errors)
- Tests: SKIPPED (no existing test suite for agent subsystem)
- Smoke: PASS (policy starts with role description, 8 action references found (>5), run.sh is executable)

## Claims
- [ ] agent/caretaker-policy.md contains all 6 sections: Role, Output Format, Available Actions, State Schema, Policy Rules, Important Notes
- [ ] Policy defines 7 priority-ordered rules: (1) fear backoff, (2) no stacking stressors, (3) fear > 0.3 comfort, (4) hunger > 0.6 feed, (5) fatigue > 0.5 dim lights, (6) idle > 120s stimulate, (7) default wait
- [ ] Policy output format requires raw JSON only (no markdown fences, no preamble)
- [ ] Policy specifies food placement offset of 80px in cardinal directions with clamping to [20,800] x [64,560]
- [ ] Policy forbids placing food at fly's exact position (minimum 60px offset)
- [ ] Policy forbids stacking stressors (no simultaneous wind + touch + bright)
- [ ] agent/run.sh has executable permission (chmod +x applied)
- [ ] run.sh checks for node, jq, and claude CLI dependencies before starting
- [ ] run.sh creates a PID-namespaced FIFO at /tmp/caretaker_cmd_pipe_$$ to avoid collisions
- [ ] run.sh starts server with FIFO stdin and opens fd 3 for writing commands
- [ ] run.sh cleanup trap kills server, closes fd 3, and removes FIFO on EXIT/INT/TERM
- [ ] run.sh decision loop sleeps LOOP_INTERVAL (5s), reads latest state from caretaker.log via grep + jq
- [ ] run.sh tracks FEAR_SPIKE_TIME and enforces 30s backoff when fear > 0.5 detected
- [ ] run.sh uses awk (not bc) for float comparisons (macOS compatibility)
- [ ] run.sh invokes claude with: command claude -p --system-prompt, --no-session-persistence, --model haiku, --max-budget-usd 0.01
- [ ] run.sh validates Claude response is valid JSON with an action field before relaying
- [ ] run.sh validates action is in allowed set (place_food, set_light, set_temp, touch, blow_wind, clear_food) via case statement
- [ ] run.sh logs decisions to caretaker-decisions.log with timestamp, backoff state, state summary, and response
- [ ] No existing files were modified (server/caretaker.js, js/caretaker-bridge.js, index.html, package.json untouched)
- [ ] No files created outside agent/ directory (except .buildloop/build-claims.md)

## Gaps and Assumptions
- The claude CLI flag --no-session-persistence is assumed to exist based on the plan; not verified at runtime
- The --max-budget-usd flag is assumed to exist in the current Claude Code CLI version
- date +%s%3N for millisecond timestamps may not work on all macOS versions (GNU date vs BSD date) -- on BSD date it may output literal %3N. This would affect the CURRENT_TIME metadata but not break the loop.
- The policy file contains no dollar signs, backticks, or unescaped double quotes that would break shell expansion via --system-prompt "$POLICY_CONTENT"
- The FIFO + backgrounded node approach assumes node opens stdin for reading immediately; a 1s sleep is used as buffer but may be insufficient on slow machines
- No end-to-end integration test was run (requires browser + WebSocket connection)
- The policy instructs the LLM to pick a "random" cardinal direction, but LLM randomness is not truly random -- it may favor certain directions
