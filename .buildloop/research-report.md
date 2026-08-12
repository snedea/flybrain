# Research Report: FlyBrain x Workday ("Fly @ Work")

Date: 2026-08-12
Task: T14.1 -- Workday caretaker integration (fly drives -> Workday actions)
Mode: [RPID] full (new integration, external infra)

## Goal

flybrain.app visitors watch the simulated fly (FlyWire FAFB v783, 139,255
neurons) make decisions that translate into real Workday actions: hungry ->
meal voucher request, tired -> PTO request, curious -> career goal, courting ->
kudos to a coworker. Deliverable feeds a LinkedIn post. Fun > enterprise rigor,
but the live path must actually write to a Workday tenant.

## Tech Stack

- Frontend: vanilla JS + Canvas/WebGL, no build step, static hosting (CNAME =
  flybrain.app). Sim runs in a Web Worker (js/sim-worker.js, LIF, 10 ticks/s).
- Backend: Node, server/caretaker.js (WS+HTTP port 7600, env CARETAKER_PORT),
  better-sqlite3 (data/caretaker.db via server/db.js), ws.
- No framework, no Docker, no GPU.

## Relevant Files (from research agents; trust, do not re-read wholesale)

flybrain repo:
- js/caretaker-bridge.js:7-18 -- getState() egress: drives {hunger, fear,
  fatigue, curiosity, groom}, behavior {current,...}, position, firingStats,
  food[], environment. Pushed over WS every 1000 ms. NOTE: thirst exists
  internally (js/connectome.js:162) but is NOT in egress.
- js/connectome.js:156-230 -- drive definitions and dynamics.
- js/fly-logic.js:18-28, 67-110 -- behavior thresholds + state machine
  (startle, fly, feed, groom, courtship, brace, rest, phototaxis, explore,
  walk, idle).
- server/caretaker.js -- WS server (:314-327), handleStateMessage (:68-84),
  detectIncidents (:37-66, e.g. forgot_to_feed at :51 = hunger > 0.9 && no
  food), broadcastActivity (:27-35), HTTP endpoints /state /chat /analytics/*
  /calendar/* /activity/recent (:185-310), VALID_ACTIONS (:21). CORS *.
  Single browserSocket slot (:20).
- server/db.js -- SQLite tables: observations, actions, incidents,
  chat_messages, daily_scores.
- index.html + js/caretaker-sidebar.js / caretaker-renderer.js -- existing
  caretaker UI overlay (activity feed, calendar, analytics).
- TASKS.md at Phase 13; this work is Phase 14.

Hackathon repo (/Users/Shared/homelab/2026-DevCon-Hackathon) -- READ-ONLY
Workday IP. Never commit there; do not copy sample code into public flybrain.
- docs/mcp_tools_list.json -- catalog of 633 native Workday MCP tools.
- docs/agentic/using-workday-mcp-tools.md -- external agent -> MCP endpoint
  https://us.agent.workday.com/mcp, JSON-RPC 2.0, Bearer tenant token
  (wdcli tenant token <tenant>), tokens expire every 60 min.
- docs/PLAN_transcript-to-goals.md -- proven method, tenant hack42_wcpdev1,
  Finder API for WID resolution.

## Workday action mapping (native MCP write tools)

| Fly signal | Workday action | MCP tool name |
|---|---|---|
| hunger > threshold && no food | Meal voucher (one-time payment request) | create_compensation_workers_requestOneTimePayment |
| fatigue > threshold or behavior=rest | PTO request | create_absenceManagement_workers_requestTimeOff |
| curiosity > threshold && behavior=explore | Career goal | create_performanceEnablement_workerGoalEvents (+ _goals + submit) |
| behavior=courtship | Kudos / anytime feedback | create_performanceEnablement_workers_anytimeFeedbackEvents |
| fear spike > threshold | Workplace safety concern (feedback) | create_performanceEnablement_workers_anytimeFeedbackEvents |

Tool WIDs are tenant-specific -- resolve at runtime / keep in gitignored
config, never hardcoded in public repo.

## Architecture Notes

- The Node caretaker server is the only place with secrets; the public static
  site never talks to Workday directly. Intent engine hooks into
  handleStateMessage alongside detectIncidents.
- Two modes: WORKDAY_MODE=mock (default; canned request IDs, public site safe)
  and live (real MCP JSON-RPC calls with WORKDAY_TOKEN).
- Per-intent cooldowns mandatory -- hunger rises +0.005/tick; without
  cooldowns the fly would spam the tenant with meal vouchers.
- Frontend: new "Fly @ Work" panel fed by existing broadcastActivity channel +
  a history endpoint; no changes to sim loop.

## Matched Patterns (from ~/.foundry/patterns, Ollama semantic search)

- setinterval-raf-split-brain-on-background (HIGH): do not add main-thread
  setInterval state that only resets in RAF update(); prefer event-driven
  updates in the new panel.
- unwired-stimulus-field (MEDIUM): every new signal must be wired end to end
  (egress -> server -> UI), no dead pathways.
- raf-resume-large-dt-sentinel / web-worker-tab-throttle-asymmetry /
  sim-worker-tick-vs-main-tick: no sim-loop changes planned; noted only.

## Risks

- Live tenant tokens expire every 60 min; live mode is a supervised demo mode,
  not an always-on service. Mock mode is the default for the public site.
- Tenant WIDs / worker IDs (e.g. Employee_ID 21001) are tenant-specific ->
  .env + gitignored config only.
- Hackathon repo is confidential Workday IP: reference tool names/endpoints
  (public API surface), write all code fresh in flybrain.
- patch_expense_entries only updates an existing Quick Expense -> use
  one-time payment for the meal voucher instead.
- Single browserSocket design: one live fly per server instance. Fine for the
  demo; note in docs.

## Suggested Approach

1. server/workday-client.js -- minimal MCP JSON-RPC client, mock|live modes.
2. server/workday-agent.js -- deterministic intent engine (thresholds,
   cooldowns, flavor text), called from handleStateMessage.
3. server/caretaker.js + server/db.js -- wire-in, workday_actions table,
   GET /workday/actions, broadcastActivity('workday_action', ...).
4. js/workday-panel.js + index.html + css -- "Fly @ Work" feed panel with
   LIVE/MOCK badge.
5. example.env + docs/WORKDAY.md + readme section.
6. Tests: pure intent-engine tests (node, no server needed).
