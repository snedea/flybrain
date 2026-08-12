# Plan: T14.1 Fly @ Work -- Workday integration

Date: 2026-08-12
Status: in-progress

## Dependencies
- Node >= 18 (global fetch, AbortController) -- server only.
- No new npm deps. No sim-loop changes.
- Env (no dotenv; pass via shell): WORKDAY_MODE (mock|live, default mock),
  WORKDAY_MCP_URL (default https://us.agent.workday.com/mcp), WORKDAY_TOKEN,
  WORKDAY_WORKER_ID, WORKDAY_COWORKER_ID.

## Matched Patterns
- setinterval-raf-split-brain-on-background (HIGH): new frontend panel is
  event-driven only (WS messages); add NO new main-thread setInterval.
- unwired-stimulus-field (MEDIUM): every intent must be wired end to end:
  server detect -> DB -> WS broadcast -> panel render. No dead pathways.

## Intent map (deterministic, no LLM in the loop)
| id | trigger | cooldown | Workday MCP tool |
|---|---|---|---|
| meal_voucher | hunger > 0.88 && food.length === 0 | 10 min | create_compensation_workers_requestOneTimePayment |
| pto_request | fatigue > 0.8, or behavior=rest && fatigue > 0.6 | 30 min | create_absenceManagement_workers_requestTimeOff |
| career_goal | curiosity > 0.85 && behavior in {explore, walk} | 60 min | create_performanceEnablement_workerGoalEvents |
| kudos | behavior = courtship | 30 min | create_performanceEnablement_workers_anytimeFeedbackEvents |
| safety_concern | fear > 0.85 | 20 min | create_performanceEnablement_workers_anytimeFeedbackEvents |
Global: min 60 s between any two actions; at most one intent per state tick;
priority = table order.

## File Operations (in order)

1. CREATE server/workday-client.js
   - createClient(opts) -> { callTool(name, args), getMode() }
   - opts from caller: { mode, url, token, timeoutMs }
   - mock mode: returns Promise of { ok: true, requestId: 'MOCK-<n>-<rand>',
     detail: 'mock' } with counter; no network.
   - live mode: POST JSON-RPC 2.0 { jsonrpc, id, method: 'tools/call',
     params: { name, arguments } }, Authorization: Bearer <token>,
     AbortController timeout 15 s; returns { ok, requestId, detail, raw };
     never throws (catches into ok:false).
   - module.exports = { createClient }

2. CREATE server/workday-agent.js
   - INTENTS array as per table; each { id, cooldownMs, condition(state),
     buildAction(state, cfg) -> { tool, args, reasoning, summary } }
   - evaluateIntents(state, lastFiredMap, nowMs, lastAnyMs) -> intent | null
     (pure; exported for tests)
   - createAgent({ client, db, broadcast, writeStdout, config }) ->
     { onState(state), getStatus() }
   - onState: evaluate; if intent fires -> client.callTool -> db.insertWorkdayAction
     -> broadcast({ type: 'workday_action', ... }) -> writeStdout same.
     In-flight guard (no concurrent dispatch).
   - Flavor text: fun, first-person-fly reasoning strings. No emojis.
   - module.exports = { createAgent, evaluateIntents, INTENTS }

3. MODIFY server/db.js
   - createSchema: add workday_actions table (id, timestamp, intent, tool,
     args, reasoning, summary, status, request_id, mode, state_snapshot)
     + idx on timestamp.
   - Add insertWorkdayAction(ts, entry), getRecentWorkdayActions(limit=50).

4. MODIFY server/caretaker.js
   - require ./workday-client + ./workday-agent; build config from process.env;
     instantiate after caretakerDb.
   - handleStateMessage: after detectIncidents(msg.data) call
     workdayAgent.onState(msg.data).
   - HTTP: GET /workday/actions -> getRecentWorkdayActions(50);
     GET /workday/status -> workdayAgent.getStatus() (mode, intents,
     cooldown remaining).
   - wss connection handler: after activity_history, send
     { type: 'workday_history', mode, entries: getRecentWorkdayActions(50) }.

5. CREATE js/workday-panel.js
   - IIFE -> window.WorkdayPanel = { onAction(msg), onHistory(msg) }.
   - Renders into #workday-feed (newest first, cap 50 DOM entries), shows
     mode badge (LIVE/MOCK) in #workday-mode, per-entry status pill.
   - Event-driven only; no timers.

6. MODIFY js/caretaker-bridge.js
   - onmessage router: add workday_action -> WorkdayPanel.onAction,
     workday_history -> WorkdayPanel.onHistory (guard typeof).

7. MODIFY index.html
   - Add tab button data-tab="workday" labeled "Workday" and
     .sidebar-tab-content div data-tab-content="workday" with
     #workday-mode badge + #workday-feed list + one-line explainer.
   - Include ./js/workday-panel.js?v=1 before caretaker-bridge.js include;
     bump caretaker-bridge.js to ?v=25.

8. MODIFY css/main.css
   - .workday-feed entry, .workday-pill (mock/live/submitted/failed variants)
     matching existing sidebar styles.

9. MODIFY example.env -- add the 5 WORKDAY_* vars with placeholders.

10. CREATE tests/workday-node.js
    - Pure-node test of evaluateIntents: hungry state fires meal_voucher;
      cooldown suppresses repeat; rest+fatigue fires pto; courtship fires
      kudos; fear fires safety_concern; global gap suppresses second intent;
      calm state fires nothing. Also mock client callTool returns ok + id.
    - Exits non-zero on failure; plain assert.

11. CREATE tests/workday-smoke.js
    - e2e: spawn server/caretaker.js (WORKDAY_MODE=mock, CARETAKER_PORT=7699,
      temp DB path via WORKDAY_DB? -- db.openDb takes optional path; caretaker
      uses default; acceptable: use default DB), connect ws client, send
      hungry state, expect workday_action message within 5 s, then GET
      /workday/actions contains entry. Kill server. Exits non-zero on failure.

12. MODIFY package.json -- scripts: "test-workday": "node tests/workday-node.js",
    "smoke-workday": "node tests/workday-smoke.js".

13. CREATE docs/WORKDAY.md -- setup guide: architecture diagram (ascii),
    intent table, mock vs live, ASOR agent registration + tenant token
    (wdcli tenant token), env vars, cooldowns, troubleshooting (60-min token
    expiry, WID resolution note). readme.md: add short "Fly @ Work" section
    linking to it.

14. MODIFY TASKS.md -- append Phase 14 + T14.1, mark on completion.

## Verification
- node --check server/workday-client.js server/workday-agent.js
  server/db.js server/caretaker.js js/workday-panel.js js/caretaker-bridge.js
- node tests/workday-node.js -> exit 0
- node tests/run-node.js -> existing suite still passes
- node tests/workday-smoke.js -> exit 0
- grep wiring: workday_action appears in agent, bridge, panel (no dead path)

## Constraints
- Match repo style: var, ES5 functions, no build step, no emojis, no em-dashes.
- No secrets or tenant WIDs committed; env only. Hackathon repo code is not
  copied (Workday IP) -- tool names are public API surface.
- Do not touch sim loop or drives dynamics.
