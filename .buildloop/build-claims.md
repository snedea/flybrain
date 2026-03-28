# Build Claims -- D69.1

## Files Changed
- [MODIFY] js/caretaker-bridge.js -- getState() now reports lightStateIndex/tempStateIndex (integer indices) instead of raw BRAIN.stimulate floats; set_light and set_temp handlers accept numeric index params in addition to string names; init() skips WebSocket connection when location.protocol is "file:"
- [MODIFY] agent/run.sh -- Replaced macOS-incompatible `date +%s%3N` with portable `python3 -c "import time; print(int(time.time()*1000))"` for millisecond timestamps
- [MODIFY] .gitignore -- Added caretaker-decisions.log entry after existing caretaker.log

## Verification Results
- Build: PASS (no build step -- vanilla JS project)
- Tests: PASS (node tests/run-node.js -- 99 passed / 0 failed / 99 total)
- Lint: SKIPPED (no linter configured)
- Smoke: PASS (python3 timestamp outputs 13-digit integer; grep confirms .gitignore entry)

## Claims
- [ ] Claim 1: getState() environment object at js/caretaker-bridge.js:16 returns `lightStateIndex` and `tempStateIndex` (global integer vars from main.js) instead of `BRAIN.stimulate.lightLevel` and `BRAIN.stimulate.temperature` (floats)
- [ ] Claim 2: set_light handler (js/caretaker-bridge.js:42-52) accepts both string keys ("bright","dim","dark") via lightMap AND numeric indices (0,1,2) via else-if branch; existing string path unchanged
- [ ] Claim 3: set_temp handler (js/caretaker-bridge.js:54-65) accepts both string keys ("neutral","warm","cool") via tempMap AND numeric indices (0,1,2) via else-if branch; existing string path unchanged
- [ ] Claim 4: init() (js/caretaker-bridge.js:115-122) returns early without calling connect() when location.protocol === 'file:', preventing infinite WebSocket reconnect loop on iOS/WKWebView
- [ ] Claim 5: agent/run.sh:134 uses `python3 -c "import time; print(int(time.time()*1000))"` instead of `date +%s%3N`, producing valid 13-digit millisecond timestamps on macOS BSD
- [ ] Claim 6: .gitignore contains `caretaker-decisions.log` on its own line immediately after `caretaker.log`
- [ ] Claim 7: agent/caretaker-policy.md was NOT modified -- its state schema already documented integer indices (0/1/2) which now matches what getState() actually emits

## Gaps and Assumptions
- lightStateIndex and tempStateIndex are assumed to be accessible globals declared in main.js (lines 144, 147) -- not independently verified at runtime, but the existing set_light/set_temp handlers already read/write these same globals successfully
- The numeric index else-if branches in set_light/set_temp do not handle non-integer numbers (e.g., 1.5) -- they would be accepted since the check is `>= 0 && <= 2`; the plan did not specify integer-only validation and the LLM agent always emits whole numbers
- The file:// guard in init() prevents ALL caretaker bridge functionality (including getState via window.caretakerBridge) from being WebSocket-connected on iOS; this is intentional per the plan since no server exists in that context
- python3 availability on the target macOS system is assumed (ships with Xcode CLI tools)
