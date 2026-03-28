# Build Claims -- T8.1

## Files Changed
- [CREATE] package.json -- npm project config with ws@8.18.0 dependency
- [CREATE] package-lock.json -- auto-generated lockfile from npm install
- [CREATE] server/caretaker.js -- WebSocket server bridging browser state to Claude Code via stdin/stdout, with JSON Lines logging and incident detection (112 lines)
- [CREATE] js/caretaker-bridge.js -- Browser-side IIFE that serializes fly state at 1Hz over WebSocket and executes commands from the server (104 lines)
- [MODIFY] index.html -- Added script tag for caretaker-bridge.js after main.js
- [MODIFY] .gitignore -- Added node_modules/ and caretaker.log

## Verification Results
- Build: PASS (`npm install` -- 0 vulnerabilities)
- Lint: PASS (`node -c server/caretaker.js` -- no syntax errors)
- Tests: PASS (`node tests/run-node.js` -- 99 passed / 0 failed / 99 total)
- Smoke: PASS (server starts on port 7600, stdin commands produce action_ack on stdout, caretaker.log written with timestamped JSON Lines)

## Claims
- [ ] server/caretaker.js starts a WebSocket server on port 7600 (or CARETAKER_PORT env var)
- [ ] server/caretaker.js reads JSON commands from stdin and writes JSON responses to stdout
- [ ] server/caretaker.js validates actions against whitelist: place_food, set_light, set_temp, touch, blow_wind, clear_food
- [ ] server/caretaker.js forwards commands to connected browser via WebSocket
- [ ] server/caretaker.js writes all observations, actions, and incidents to caretaker.log as JSON Lines with ISO timestamps
- [ ] server/caretaker.js detects "scared_the_fly" incident when fear spikes > 0.2 within 5s of a Claude action
- [ ] server/caretaker.js detects "forgot_to_feed" incident when hunger > 0.9 and food array is empty
- [ ] server/caretaker.js sends action_ack with success:false and error message when no browser is connected
- [ ] js/caretaker-bridge.js is wrapped in an IIFE, exposes window.caretakerBridge for debugging
- [ ] js/caretaker-bridge.js polls for BRAIN initialization before connecting
- [ ] js/caretaker-bridge.js sends fly state (drives, behavior, position, firingStats, food, environment) at 1Hz
- [ ] js/caretaker-bridge.js executes all 6 command types: place_food (with coordinate clamping), set_light, set_temp, touch (defaults to fly center), blow_wind, clear_food
- [ ] js/caretaker-bridge.js auto-reconnects after 3s on disconnect
- [ ] index.html loads caretaker-bridge.js after main.js
- [ ] .gitignore includes node_modules/ and caretaker.log
- [ ] No existing JS files were modified
- [ ] All 99 existing tests still pass (caretaker-bridge.js is not loaded in Node tests)
- [ ] server/caretaker.js is under 150 lines (112 lines)
- [ ] js/caretaker-bridge.js is under 120 lines (104 lines)

## Gaps and Assumptions
- Browser-side testing not performed (requires DOM + WebSocket APIs in a real browser)
- Only one browser connection is supported at a time (last connection wins)
- "forgot_to_feed" incident fires on every state update while condition holds (no debouncing) -- this matches the plan but could be noisy
- The bridge assumes globals (fly, food, behavior, BRAIN, facingDir, speed, lightStates, lightStateIndex, lightLabels, tempStates, tempStateIndex, tempLabels, windResetTime, applyTouchTool) are defined by the time BRAIN.drives exists -- reasonable given script load order but not independently verified
- place_food coordinate clamping uses toolbar height 44 as lower y bound, matching main.js convention
