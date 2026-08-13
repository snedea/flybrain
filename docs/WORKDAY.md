# Fly @ Work: the Workday integration

The fly cannot use Workday. It has no keyboard, no mouse, and no language --
its only communication medium is behavior. So a real Drosophila connectome
(FlyWire FAFB v783, 139,255 neurons) runs in your browser, and an **agent**
(`server/workday-agent.js`) observes that behavior through the state stream,
interprets it as communication (hunger 1.00 plus an empty enclosure is a
lunch request in fly), and files the corresponding Workday request on the
fly's behalf through native Workday MCP tools. Hungry fly, meal voucher.
Tired fly, PTO request. It is exactly as serious as it sounds.

Then the loop closes: a few seconds after each request, Claude plays the
Workday administrator and reviews it -- approving (default 85%) with a real
in-world delivery where one makes sense (an approved meal voucher drops food
in front of the fly; approved PTO dims the enclosure lights), or denying with
a reason (a denied meal voucher means the fly stays hungry until its agent
can re-file after the cooldown). Every observed-interpreted-filed request and
its resolution shows up in the sidebar's **Inbox** tab, labeled by actor:
FLY'S AGENT for filings, CLAUDE, ADMINISTRATOR for resolutions.

## How it works

```
browser (flybrain.app)                 caretaker server (node)          Workday
+---------------------+   state/1s    +------------------------+
| 139K-neuron sim     | ------------> | workday-agent.js       |  MCP tools/call
| drives: hunger,     |   WebSocket   |  thresholds+cooldowns  | --------------->
| fatigue, fear, ...  | <------------ | workday-client.js      |  Agent Gateway
| Inbox tab (feed)    | workday_action|  mock | live           |  us.agent.workday.com
+---------------------+               +------------------------+
```

- The browser pushes the fly's state (drives, behavior, food, environment) to
  the caretaker server once per second (`js/caretaker-bridge.js`).
- `server/workday-agent.js` evaluates deterministic intent rules on every
  state tick. No LLM in the loop: thresholds and cooldowns only.
- `server/workday-client.js` submits the action. In `mock` mode (default) it
  fabricates a request ID locally. In `live` mode it POSTs a JSON-RPC 2.0
  `tools/call` to the Workday Agent Gateway MCP endpoint.
- Results are stored in SQLite (`workday_actions` table), broadcast to the
  browser, and rendered in the sidebar's **Inbox** tab.
- After a submitted action, `server/workday-agent.js` schedules a resolution
  `WORKDAY_FULFILL_MS` (default 6000 ms) later. Approval is probabilistic:
  denied with probability `WORKDAY_DENY_CHANCE` (default 0.15).
  `buildResolution()` produces the approval or denial summary/reasoning and,
  for approved intents with a delivery, a world command routed back through
  the caretaker's `dispatchCommand` (meal_voucher drops food in front of the
  fly, pto_request dims the lights). Denials never carry a world command.
  The resolution is persisted as a second `workday_actions` row with
  `status: 'fulfilled'` or `'denied'` and `tool: 'claude_resolution'`, then
  broadcast. Only successfully submitted actions are resolved.

## The intent map

| The fly is... | Trigger | Workday action | MCP tool | Cooldown | Fulfillment (approval effect) |
|---|---|---|---|---|---|
| Hungry | hunger > 0.88 and no food in the enclosure | Meal voucher (one-time payment request) | `create_compensation_workers_requestOneTimePayment` | 10 min | Approved; drops food ~60px in front of the fly (`place_food`) |
| Tired | fatigue > 0.8, or resting with fatigue > 0.6 | PTO request for tomorrow | `create_absenceManagement_workers_requestTimeOff` | 30 min | Approved; dims the enclosure lights (`set_light` dim) |
| Curious | curiosity > 0.85 while exploring or walking | Adds a career goal (e.g. "Map the eastern rim of the petri dish") | `create_performanceEnablement_workerGoalEvents` | 60 min | Approved; log entry only, no world command |
| Content after a meal | feeding with hunger below 0.5 | Sends anytime feedback (kudos) to the enclosure support team | `create_performanceEnablement_workers_anytimeFeedbackEvents` | 30 min | Delivered; log entry only, no world command |
| Scared | fear > 0.85 | Files a workplace safety concern | `create_performanceEnablement_workers_anytimeFeedbackEvents` | 20 min | Reviewed; log entry only, no world command |

At most one action fires per state tick, with a 60 second global gap between
any two actions. Priority is table order (hunger wins ties). Each submitted
action is then resolved by Claude (the administrator) after
`WORKDAY_FULFILL_MS`: approved and fulfilled per the table, or denied with
probability `WORKDAY_DENY_CHANCE` (each intent has a denial reason; denials
have no world effect). Either way a second row (`fulfilled` or `denied`) is
added per request.

## Running it

### Mock mode (default, no credentials)

```bash
npm run caretaker
# then open http://localhost:<your static server port>/index.html
```

Open the sidebar, pick the **Inbox** tab. Starve the fly (no food) and watch
it escalate to Compensation, then watch Claude approve the voucher and drop
food a few seconds later. The MOCK MODE badge means no network calls leave
the machine.

### Live mode (real Workday tenant)

Prerequisites, one-time:

1. A Workday tenant with the Agent System of Record (ASOR) enabled.
2. An agent registered in the Agent Registry with the tools from the intent
   map enabled (tool WIDs are tenant-specific; resolve them in your tenant,
   do not copy them from anywhere).
3. The acting user/ISU in an unconstrained security group with domain access
   to Absence, Compensation, and Performance Enablement.
4. A worker for the fly (its `Employee_ID`, e.g. `21001`) and a coworker for
   the kudos target.

Then:

```bash
cp example.env .env   # fill in the WORKDAY_* values
WORKDAY_MODE=live \
WORKDAY_TOKEN="$(wdcli tenant token <your-tenant>)" \
WORKDAY_WORKER_ID=21001 \
WORKDAY_COWORKER_ID=21002 \
npm run caretaker
```

Note: the caretaker server does not read `.env` itself; pass the variables in
the environment (or `source` the file).

### Environment variables

| Var | Default | Purpose |
|---|---|---|
| `WORKDAY_MODE` | `mock` | `mock` or `live` |
| `WORKDAY_MCP_URL` | `https://us.agent.workday.com/mcp` | MCP endpoint |
| `WORKDAY_TOKEN` | (empty) | Bearer tenant token, live mode only |
| `WORKDAY_WORKER_ID` | `21001` | The fly's Employee_ID |
| `WORKDAY_COWORKER_ID` | `21002` | Kudos recipient |
| `WORKDAY_FULFILL_MS` | `6000` | Delay before Claude resolves a submitted action (ms) |
| `WORKDAY_DENY_CHANCE` | `0.15` | Probability Claude denies a request (0 to 1) |
| `CARETAKER_DB` | `data/caretaker.db` | SQLite path override (used by tests) |

## API surface added to the caretaker server

- `GET /workday/actions` -- last 50 Workday actions (JSON).
- `GET /workday/status` -- mode, worker ID, per-intent cooldown state.
- WS broadcast `workday_action` -- fired per submitted/failed action and per
  resolution (the `fulfilled` approval or `denied` row).
- WS broadcast `workday_history` -- last 50 actions, sent on connect.
- stdout event `workday_action` -- for the agent loop / log pipeline.

## Testing

```bash
npm run test-workday    # 23 unit tests on the intent engine + fulfillment + client modes
npm run smoke-workday   # end-to-end: server + fake browser + mock Workday, request through fulfillment
node tests/run-node.js  # existing sim test suite (unaffected)
```

## Gotchas

- **Tenant tokens expire every 60 minutes.** Live mode is a supervised demo
  mode, not an always-on service. A 401 mid-demo means re-run
  `wdcli tenant token`.
- **The public site stays in mock mode.** flybrain.app is static; only the
  caretaker server holds credentials, and you should not run live mode on an
  internet-exposed server (the HTTP API is CORS `*` and unauthenticated).
- **Live-mode argument shapes are tenant-dependent.** The `args` built in
  `server/workday-agent.js` follow the native tool schemas but were verified
  against mock mode only; expect to adjust field shapes (especially
  `businessProcessParameters` and time-off plan references) the first time
  you point at a real tenant.
- **The fly does not read your HR data.** No Workday data flows back into the
  sim. The only Workday writes are the five intents above; the only effects on
  the fly are the local world commands the fulfillment step issues (food drop,
  light dim), which are generated by `buildFulfillment` and never carry tenant
  data.
