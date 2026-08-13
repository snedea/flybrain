// Fly @ Work intent engine.
// Watches the fly's drive/behavior state (pushed every second by the browser)
// and translates biological needs into Workday actions via native MCP tools.
// Deterministic thresholds + cooldowns; no LLM in the loop.

var GLOBAL_MIN_GAP_MS = 60 * 1000;

var GOAL_NAMES = [
  'Map the eastern rim of the petri dish',
  'Achieve sustained flight for 3 consecutive seconds',
  'Complete a full perimeter patrol of the enclosure',
  'Cross-train on phototaxis best practices',
  'Mentor a junior larva'
];

var INTENTS = [
  {
    id: 'meal_voucher',
    cooldownMs: 10 * 60 * 1000,
    condition: function(state) {
      return state.drives.hunger > 0.88 && state.food.length === 0;
    },
    buildAction: function(state, cfg) {
      return {
        tool: 'create_compensation_workers_requestOneTimePayment',
        args: {
          workersId: cfg.workerId,
          oneTimePayments: [{ reason: 'Meal voucher', amount: 12.5, currency: 'USD' }],
          effectiveDate: new Date().toISOString().slice(0, 10)
        },
        reasoning: 'Hunger at ' + state.drives.hunger.toFixed(2) +
          ' and the enclosure is out of food. Escalating to Compensation.',
        summary: 'Requested a meal voucher (one-time payment)'
      };
    }
  },
  {
    id: 'pto_request',
    cooldownMs: 30 * 60 * 1000,
    condition: function(state) {
      return state.drives.fatigue > 0.8 ||
        (state.behavior.current === 'rest' && state.drives.fatigue > 0.6);
    },
    buildAction: function(state, cfg) {
      var tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
      return {
        tool: 'create_absenceManagement_workers_requestTimeOff',
        args: {
          workersId: cfg.workerId,
          days: [{ date: tomorrow, dailyQuantity: 1 }]
        },
        reasoning: 'Fatigue at ' + state.drives.fatigue.toFixed(2) +
          (state.behavior.current === 'rest' ? ' and already resting on the job.' : '.') +
          ' Submitting a time off request for tomorrow.',
        summary: 'Requested PTO for tomorrow'
      };
    }
  },
  {
    id: 'career_goal',
    cooldownMs: 60 * 60 * 1000,
    condition: function(state) {
      return state.drives.curiosity > 0.85 &&
        (state.behavior.current === 'explore' || state.behavior.current === 'walk');
    },
    buildAction: function(state, cfg) {
      var name = GOAL_NAMES[Math.floor(Math.random() * GOAL_NAMES.length)];
      return {
        tool: 'create_performanceEnablement_workerGoalEvents',
        args: {
          workersId: cfg.workerId,
          goal: { name: name, description: 'Self-directed development goal, set mid-exploration.' }
        },
        reasoning: 'Curiosity at ' + state.drives.curiosity.toFixed(2) +
          ' while exploring. Channeling it into a development goal: "' + name + '".',
        summary: 'Added career goal: ' + name
      };
    }
  },
  {
    id: 'kudos',
    cooldownMs: 30 * 60 * 1000,
    condition: function(state) {
      return state.behavior.current === 'courtship';
    },
    buildAction: function(state, cfg) {
      return {
        tool: 'create_performanceEnablement_workers_anytimeFeedbackEvents',
        args: {
          workersId: cfg.workerId,
          toWorker: cfg.coworkerId,
          comment: 'Outstanding wing posture and excellent pheromone communication. A pleasure to share the enclosure with.',
          badge: 'collaboration'
        },
        reasoning: 'Courtship behavior detected. Sending anytime feedback to a valued colleague.',
        summary: 'Gave kudos to a coworker'
      };
    }
  },
  {
    id: 'safety_concern',
    cooldownMs: 20 * 60 * 1000,
    condition: function(state) {
      return state.drives.fear > 0.85;
    },
    buildAction: function(state, cfg) {
      return {
        tool: 'create_performanceEnablement_workers_anytimeFeedbackEvents',
        args: {
          workersId: cfg.workerId,
          toWorker: cfg.workerId,
          comment: 'Formal note: something large and fast moved through my workspace. Requesting a hazard review of the enclosure.',
          badge: 'wellbeing'
        },
        reasoning: 'Fear spiked to ' + state.drives.fear.toFixed(2) +
          '. Filing a workplace safety concern.',
        summary: 'Filed a workplace safety concern'
      };
    }
  }
];

// Claude is also the Workday administrator: every submitted request gets
// approved and fulfilled a few seconds later, with a real in-world effect
// where one makes sense. Pure builder, exported for tests.
function buildFulfillment(intentId, requestId, state) {
  var ref = requestId ? ' (' + requestId + ')' : '';
  if (intentId === 'meal_voucher') {
    var command = null;
    if (state && state.position) {
      var dir = typeof state.position.facingDir === 'number' ? state.position.facingDir : 0;
      command = {
        action: 'place_food',
        params: {
          x: state.position.x + Math.cos(dir) * 60,
          y: state.position.y + Math.sin(dir) * 60
        }
      };
    }
    return {
      summary: 'Meal voucher approved -- food delivered',
      reasoning: 'Claude (administrator): approved the meal voucher' + ref + ' and dropped food right in front of the fly. Bon appetit.',
      command: command
    };
  }
  if (intentId === 'pto_request') {
    return {
      summary: 'PTO approved -- lights dimmed for rest',
      reasoning: 'Claude (administrator): time off request' + ref + ' approved effective immediately. Dimming the enclosure lights so the fly can actually rest.',
      command: { action: 'set_light', params: { level: 'dim' } }
    };
  }
  if (intentId === 'career_goal') {
    return {
      summary: 'Career goal approved',
      reasoning: 'Claude (administrator): development goal' + ref + ' approved and added to the fly\'s growth plan. Ambition noted.',
      command: null
    };
  }
  if (intentId === 'kudos') {
    return {
      summary: 'Kudos delivered to the coworker',
      reasoning: 'Claude (administrator): anytime feedback' + ref + ' routed to the recipient. The enclosure is a kinder place for it.',
      command: null
    };
  }
  if (intentId === 'safety_concern') {
    return {
      summary: 'Hazard review complete -- enclosure declared safe',
      reasoning: 'Claude (administrator): investigated the safety concern' + ref + '. The large fast-moving object was the user. Monitoring continues.',
      command: null
    };
  }
  return null;
}

// Pure: returns the first intent whose condition holds and whose cooldown
// (and the global gap) has elapsed, or null. Exported for tests.
function evaluateIntents(state, lastFiredMap, nowMs, lastAnyMs) {
  if (!state || !state.drives || !state.behavior || !state.food) return null;
  if (lastAnyMs && nowMs - lastAnyMs < GLOBAL_MIN_GAP_MS) return null;
  for (var i = 0; i < INTENTS.length; i++) {
    var intent = INTENTS[i];
    var last = lastFiredMap[intent.id] || 0;
    if (nowMs - last < intent.cooldownMs) continue;
    var holds = false;
    try { holds = intent.condition(state); } catch (e) { holds = false; }
    if (holds) return intent;
  }
  return null;
}

function createAgent(deps) {
  var client = deps.client;
  var db = deps.db;
  var broadcast = deps.broadcast;
  var writeStdout = deps.writeStdout;
  var config = deps.config || {};
  var sendCommand = deps.sendCommand || function() { return false; };
  var workerCfg = {
    workerId: config.workerId || '21001',
    coworkerId: config.coworkerId || '21002'
  };
  var fulfillDelayMs = config.fulfillDelayMs != null && !isNaN(config.fulfillDelayMs)
    ? config.fulfillDelayMs : 6000;
  var lastFiredMap = {};
  var lastAnyMs = 0;
  var inFlight = false;
  var lastState = null;

  function fulfill(intentId, requestId) {
    var fulfillment = buildFulfillment(intentId, requestId, lastState);
    if (fulfillment === null) return;
    if (fulfillment.command !== null) {
      sendCommand(fulfillment.command.action, fulfillment.command.params, fulfillment.summary);
    }
    var entry = {
      timestamp: new Date().toISOString(),
      intent: intentId,
      tool: 'claude_fulfillment',
      args: fulfillment.command || {},
      reasoning: fulfillment.reasoning,
      summary: fulfillment.summary,
      status: 'fulfilled',
      requestId: requestId,
      detail: 'fulfilled by Claude',
      mode: client.getMode(),
      snapshot: lastState ? { drives: lastState.drives, behavior: lastState.behavior.current } : null
    };
    try { db.insertWorkdayAction(entry); } catch (e) {
      process.stderr.write('[workday] db insert error: ' + e.message + '\n');
    }
    broadcast({ type: 'workday_action', mode: entry.mode, entry: entry });
    writeStdout({ type: 'workday_action', entry: entry });
  }

  function onState(state) {
    lastState = state;
    if (inFlight) return;
    var nowMs = Date.now();
    var intent = evaluateIntents(state, lastFiredMap, nowMs, lastAnyMs);
    if (intent === null) return;
    lastFiredMap[intent.id] = nowMs;
    lastAnyMs = nowMs;
    inFlight = true;
    var action = intent.buildAction(state, workerCfg);
    var ts = new Date().toISOString();
    client.callTool(action.tool, action.args).then(function(result) {
      var entry = {
        timestamp: ts,
        intent: intent.id,
        tool: action.tool,
        args: action.args,
        reasoning: action.reasoning,
        summary: action.summary,
        status: result.ok ? 'submitted' : 'failed',
        requestId: result.requestId,
        detail: result.detail,
        mode: client.getMode(),
        snapshot: { drives: state.drives, behavior: state.behavior.current }
      };
      try { db.insertWorkdayAction(entry); } catch (e) {
        process.stderr.write('[workday] db insert error: ' + e.message + '\n');
      }
      broadcast({ type: 'workday_action', mode: entry.mode, entry: entry });
      writeStdout({ type: 'workday_action', entry: entry });
      if (result.ok) {
        setTimeout(function() { fulfill(intent.id, entry.requestId); }, fulfillDelayMs);
      }
      inFlight = false;
    }).catch(function(err) {
      process.stderr.write('[workday] dispatch error: ' + err.message + '\n');
      inFlight = false;
    });
  }

  function getStatus() {
    var nowMs = Date.now();
    var intents = INTENTS.map(function(intent) {
      var last = lastFiredMap[intent.id] || 0;
      var remaining = Math.max(0, intent.cooldownMs - (nowMs - last));
      return { id: intent.id, cooldownMs: intent.cooldownMs, cooldownRemainingMs: remaining };
    });
    return { mode: client.getMode(), workerId: workerCfg.workerId, intents: intents };
  }

  return { onState: onState, getStatus: getStatus };
}

module.exports = { createAgent: createAgent, evaluateIntents: evaluateIntents, buildFulfillment: buildFulfillment, INTENTS: INTENTS };
