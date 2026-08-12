AUDIT_PAYLOAD::v1
AGENT: claude-fable-5/flybrain
TARGET: /Users/Shared/homelab/flybrain

== DELTA_MANIFEST ==
FILES_CREATED: 5
  server/workday-client.js | new module | createClient{getMode,callTool} | mock mode: MOCK-<n>-<rand36> ids, no network; live mode: JSON-RPC 2.0 tools/call, Bearer token, 15s AbortController timeout, never throws
  server/workday-agent.js | new module | createAgent{onState,getStatus}, evaluateIntents (pure), INTENTS[5] | intents: meal_voucher(hunger>0.88&&food==0,10m), pto_request(fatigue>0.8||rest&&fatigue>0.6,30m), career_goal(curiosity>0.85&&explore|walk,60m), kudos(courtship,30m), safety_concern(fear>0.85,20m); GLOBAL_MIN_GAP_MS=60s; inFlight guard; priority=array order
  js/workday-panel.js | new frontend IIFE | window.WorkdayPanel{onAction,onHistory} | event-driven only, no timers; MAX_ENTRIES=50 DOM cap; mode badge LIVE/MOCK; per-entry SUBMITTED/FAILED pill
  tests/workday-node.js | new test file | 18 tests | pure intent-engine + mock/live-no-token client; promise-aware harness; exit 1 on failure
  tests/workday-smoke.js | new e2e test | spawns caretaker.js (port 7699, temp CARETAKER_DB), fake browser WS, hungry state -> expects workday_action broadcast (mode=mock, intent=meal_voucher, MOCK- id) then non-empty GET /workday/actions | 10s timeout
FILES_CREATED_DOCS: 1
  docs/WORKDAY.md | new doc | architecture ascii, intent table, mock/live setup, env var table, API surface, gotchas
FILES_MODIFIED: 8
  server/db.js | added workday_actions table + idx in createSchema; stmtInsertWorkdayAction; insertWorkdayAction(entry); getRecentWorkdayActions(limit=50)
  server/caretaker.js | require workday modules; createClient from WORKDAY_MODE/URL/TOKEN env; createAgent wired to broadcastActivity/writeStdout/caretakerDb + WORKDAY_WORKER_ID/COWORKER_ID; handleStateMessage calls workdayAgent.onState after detectIncidents; GET /workday/actions + /workday/status; wss connection sends workday_history; openDb(process.env.CARETAKER_DB) override
  js/caretaker-bridge.js | onmessage: routes workday_action->WorkdayPanel.onAction, workday_history->WorkdayPanel.onHistory (typeof-guarded, outside CaretakerSidebar else-branch)
  index.html | Workday tab button + tab-content (workday-mode badge, workday-feed, empty state); include js/workday-panel.js?v=1 BEFORE caretaker-bridge.js; bridge bumped ?v=25
  css/main.css | .workday-* styles inserted before mobile media query; matches existing sidebar vars
  example.env | +WORKDAY_MODE/WORKDAY_MCP_URL/WORKDAY_TOKEN/WORKDAY_WORKER_ID/WORKDAY_COWORKER_ID
  package.json | +scripts test-workday, smoke-workday
  readme.md | +"Fly @ Work" section linking docs/WORKDAY.md
  TASKS.md | +Phase 14, T14.1 marked [x] [RPID]
FILES_MODIFIED_BUILDLOOP: research-report.md, current-plan.md (RPID artifacts, not audit targets)

== SPEC ==
PIPELINE: browser sim --(WS state/1s)--> caretaker.js handleStateMessage -> workdayAgent.onState -> evaluateIntents -> client.callTool(mock|live) -> db.insertWorkdayAction + broadcast{type:workday_action,mode,entry} + writeStdout -> caretaker-bridge -> WorkdayPanel render
HISTORY: wss connection -> broadcast{type:workday_history,mode,entries[<=50]} after activity_history
HTTP: GET /workday/actions -> rows{id,timestamp,intent,tool,args,reasoning,summary,status,request_id,mode}; GET /workday/status -> {mode,workerId,intents[{id,cooldownMs,cooldownRemainingMs}]}
CONSTRAINTS: no sim-loop changes; no new main-thread timers (pattern setinterval-raf-split-brain); no secrets/tenant WIDs committed; repo style var/ES5; no emojis/em-dashes

== BUG_FIXES ==
(none claimed -- greenfield feature)

== KNOWN_GAPS ==
GAP:live_args_shape | live-mode tool argument shapes (businessProcessParameters, time-off plan refs, one-time payment plan) follow native tool names but are unverified against a real tenant | acceptable: mock is default; documented in docs/WORKDAY.md gotchas
GAP:live_untested | live mode network path tested only via no-token fast-fail unit test | acceptable: requires tenant token; supervised demo mode
GAP:public_exposure | caretaker HTTP is CORS * and unauthenticated (pre-existing); live mode on exposed host discouraged in docs only, not enforced | LOW, documented
GAP:career_goal_reachability | career_goal requires curiosity>0.85 while behavior explore/walk; curiosity is a random walk (connectome.js:176-230) so trigger frequency in practice unknown | acceptable for demo; thresholds tunable in INTENTS
GAP:no_dotenv | server does not read .env; env must be passed in shell; documented in WORKDAY.md and example.env comment

== VERIFICATION_MATRIX ==
CHECK:syntax | cd /Users/Shared/homelab/flybrain && node --check server/workday-client.js server/workday-agent.js server/db.js server/caretaker.js js/workday-panel.js js/caretaker-bridge.js tests/workday-node.js tests/workday-smoke.js | all pass | PASS
CHECK:unit | cd /Users/Shared/homelab/flybrain && node tests/workday-node.js | 18 passed, 0 failed, exit 0 | PASS
CHECK:existing_suite | cd /Users/Shared/homelab/flybrain && node tests/run-node.js | 104 passed / 0 failed | PASS
CHECK:e2e_smoke | cd /Users/Shared/homelab/flybrain && node tests/workday-smoke.js | SMOKE PASS line, exit 0 | PASS
CHECK:wiring_no_dead_path | grep -l workday_action server/workday-agent.js js/caretaker-bridge.js js/workday-panel.js | all 3 files match | UNTESTED
CHECK:panel_included_before_bridge | grep -n "workday-panel\|caretaker-bridge" index.html | panel line number < bridge line number | UNTESTED
CHECK:no_secrets | grep -rn "WORKDAY_TOKEN=." example.env; git diff --stat | token placeholder empty; no data/ or .env files staged | UNTESTED
CHECK:workday_tab_markup | grep -c 'data-tab="workday"\|data-tab-content="workday"' index.html | 2 | UNTESTED
