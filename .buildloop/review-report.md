# Doubt Review: T14.1 Fly @ Work (Workday integration)

Auditor: fresh-context sub-agent (opus). Target: /Users/Shared/homelab/flybrain
Date: 2026-08-12

## Verdict: NO HIGH/MEDIUM FINDINGS. 2 LOW notes.

All DELTA_MANIFEST claims verified against actual code. All VERIFICATION_MATRIX
checks re-run independently. git status matches the manifest (only the claimed
code/doc files plus the excluded .buildloop artifacts are dirty; no unclaimed
code changes). Mock is the safe default and no secrets or real tenant WIDs are
committed.

## DELTA_MANIFEST verification

FILES_CREATED
- server/workday-client.js -- PASS. createClient{getMode,callTool} (client.js:76-83).
  Mock ids `MOCK-<n>-<rand36>` (l.17-18), no network in mock. Live: JSON-RPC 2.0
  tools/call (l.29-34), Bearer token (l.40), 15s AbortController timeout (l.13,27-28,68).
  callTool never throws -- all paths return resolved promises incl. .catch (l.67-73).
  Empty-token fast-fail with no fetch (l.23-26).
- server/workday-agent.js -- PASS. createAgent{onState,getStatus} (l.199), evaluateIntents
  pure + exported (l.125-137,202), INTENTS[5] (l.16-121). Thresholds/cooldowns match the
  manifest exactly: meal_voucher hunger>0.88 && food==0 / 10m; pto_request fatigue>0.8 ||
  (rest && fatigue>0.6) / 30m; career_goal curiosity>0.85 && (explore||walk) / 60m; kudos
  courtship / 30m; safety_concern fear>0.85 / 20m. GLOBAL_MIN_GAP_MS=60000 (l.6,127).
  inFlight guard set/reset on both .then and .catch (l.151,154,160,182,185). Priority =
  array order (first match wins, l.128-135).
- js/workday-panel.js -- PASS. window.WorkdayPanel{onAction,onHistory} (l.96). Event-driven,
  no timers (grep: none). MAX_ENTRIES=50 DOM cap (l.4,67-69). Mode badge LIVE/MOCK (l.15).
  Per-entry SUBMITTED/FAILED pill (l.39-41).
- tests/workday-node.js -- PASS. 18 tests, promise-aware harness (l.16-32,176-179),
  exit 1 on failure (l.178). Ran: 18 passed, 0 failed.
- tests/workday-smoke.js -- PASS. Spawns caretaker.js on port 7699 with temp CARETAKER_DB
  (l.12-16,45-52), fake browser WS sends hungry state (l.36-43,82-84), expects
  workday_action broadcast mode=mock intent=meal_voucher MOCK- id (l.88-93) then non-empty
  GET /workday/actions (l.60-74), 10s timeout (l.58). Ran: SMOKE PASS, exit 0.
- docs/WORKDAY.md -- PASS. Exists (5760 bytes); env var table, mock/live setup, intent
  table, gotchas present.

FILES_MODIFIED
- server/db.js -- PASS. workday_actions table + idx in createSchema (l.59-72);
  stmtInsertWorkdayAction (l.118-120); insertWorkdayAction(entry) (l.183-196);
  getRecentWorkdayActions(limit=50) (l.198-204).
- server/caretaker.js -- PASS. Requires workday modules (l.8-9); createClient from
  WORKDAY_MODE/URL/TOKEN (l.25-29); createAgent wired to broadcastActivity/writeStdout/
  caretakerDb + WORKER/COWORKER ids (l.30-39); handleStateMessage calls workdayAgent.onState
  after detectIncidents (l.101-102); GET /workday/actions (l.316-327) + /workday/status
  (l.328-339); wss connection sends workday_history after activity_history (l.360-367);
  openDb(process.env.CARETAKER_DB) override (l.15). No new timers added (git diff confirms).
- js/caretaker-bridge.js -- PASS. Routes workday_action->WorkdayPanel.onAction,
  workday_history->WorkdayPanel.onHistory, typeof-guarded, separate block outside the
  CaretakerSidebar branch (l.131-137).
- index.html -- PASS. Workday tab button data-tab="workday" (l.115) + content
  data-tab-content="workday" with mode badge/feed/empty state (l.139-149). workday-panel.js?v=1
  included BEFORE caretaker-bridge.js?v=25 (l.181-182). Tab switching is generic
  (caretaker-sidebar.js:257-294 dispatches by data-tab / [data-tab-content]) so the new tab
  activates with no extra JS -- verified.
- css/main.css -- PASS. All 15 workday-* classes referenced by panel/markup are defined
  (workday-section/header/blurb/pill{,-mock,-live,-ok,-fail}/feed/empty/entry{,-head,-summary,
  -reasoning,-meta}).
- example.env -- PASS. +WORKDAY_MODE=mock, MCP_URL, TOKEN (empty), WORKER_ID=21001,
  COWORKER_ID=21002.
- package.json -- PASS. +test-workday, +smoke-workday scripts.
- readme.md -- PASS. "Fly @ Work" section links docs/WORKDAY.md.
- TASKS.md -- PASS. Phase 14 + T14.1 marked [x] [RPID].

## VERIFICATION_MATRIX (re-run independently)

- CHECK:syntax -- PASS. node --check on all 8 files: ALL SYNTAX OK.
- CHECK:unit -- PASS. 18 passed, 0 failed, exit 0.
- CHECK:existing_suite -- PASS. 104 passed / 0 failed / 104 total.
- CHECK:e2e_smoke -- PASS. "SMOKE PASS: workday_action broadcast + persisted entry verified".
- CHECK:panel_included_before_bridge -- PASS. panel l.181 < bridge l.182.
- CHECK:workday_tab_markup -- PASS. count = 2.
- CHECK:no_secrets -- PASS. WORKDAY_TOKEN= is empty (grep exit 1); only tracked non-buildloop
  change is example.env; no data/ or real .env staged. Secret scan surfaced only the
  pre-existing sk-ant-your-key-here placeholder and a doc reference to the Bearer var.
- CHECK:wiring_no_dead_path -- see LOW-1 (check as written does not hold, but wiring is sound).

## KNOWN_GAPS validation
All five gaps accurately described. Confirmed GAP:no_dotenv: caretaker.js reads process.env
directly, no dotenv require. GAP:live_untested: live path exercised only by the no-token
fast-fail unit test -- accurate. Mock default confirmed both in code (workday-client.js:10)
and in the wiring (caretaker passes process.env.WORKDAY_MODE; undefined -> mock).

## LOW findings (not fixed; filed for later per policy)

- LOW-1: CHECK:wiring_no_dead_path expects `grep -l workday_action` to match all 3 files,
  but js/workday-panel.js does not contain the literal string "workday_action" (it receives
  via WorkdayPanel.onAction). Only 2 files match. The check is a poor proxy; the actual
  end-to-end wiring is complete and verified (agent broadcasts -> bridge routes -> panel
  renders -> DOM elements exist -> tab activates). The matrix marked this UNTESTED, so no
  passing claim was made. No behavior impact.
- LOW-2: build-claims.md header reads "FILES_MODIFIED: 8" but lists 9 entries (db.js,
  caretaker.js, caretaker-bridge.js, index.html, css/main.css, example.env, package.json,
  readme.md, TASKS.md). Off-by-one count in the manifest only.

## Unclaimed changes
None touching code/markup/styles/tests/docs/config. git status shows exactly the manifest's
files plus .buildloop/{build-claims,current-plan,research-report}.md (RPID artifacts,
excluded by design).
