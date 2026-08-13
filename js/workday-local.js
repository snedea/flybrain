// In-browser Buzz + Claude for the public site: when no caretaker server is
// reachable, the same deterministic intent engine runs client-side so every
// visitor gets the full request/approval loop with zero infrastructure.
// Mirrors server/workday-agent.js; keep the two in sync when intents change.
(function() {
  var GLOBAL_MIN_GAP_MS = 60 * 1000;
  var FULFILL_DELAY_MS = 6000;
  var DENY_CHANCE = 0.15;
  var WORKER_ID = '21001';

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
      condition: function(s) { return s.drives.hunger > 0.88 && s.food.length === 0; },
      buildAction: function(s) {
        return {
          tool: 'create_compensation_workers_requestOneTimePayment',
          args: {
            workersId: WORKER_ID,
            oneTimePayments: [{ reason: 'Meal voucher', amount: 12.5, currency: 'USD' }],
            effectiveDate: new Date().toISOString().slice(0, 10)
          },
          reasoning: 'The fly cannot type. Observed hunger at ' + s.drives.hunger.toFixed(2) +
            ', an empty enclosure, and restless searching. In fly, that is a lunch request. Filing a meal voucher on its behalf.',
          summary: 'Filed a meal voucher on the fly\'s behalf'
        };
      }
    },
    {
      id: 'pto_request',
      cooldownMs: 30 * 60 * 1000,
      condition: function(s) {
        return s.drives.fatigue > 0.8 || (s.behavior.current === 'rest' && s.drives.fatigue > 0.6);
      },
      buildAction: function(s) {
        var tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
        return {
          tool: 'create_absenceManagement_workers_requestTimeOff',
          args: { workersId: WORKER_ID, days: [{ date: tomorrow, dailyQuantity: 1 }] },
          reasoning: 'Observed fatigue at ' + s.drives.fatigue.toFixed(2) +
            (s.behavior.current === 'rest' ? ' and the fly already resting on the job.' : '.') +
            ' Interpreting that as a request for rest. Filing PTO for tomorrow on its behalf.',
          summary: 'Filed a PTO request on the fly\'s behalf'
        };
      }
    },
    {
      id: 'career_goal',
      cooldownMs: 60 * 60 * 1000,
      condition: function(s) {
        return s.drives.curiosity > 0.85 && (s.behavior.current === 'explore' || s.behavior.current === 'walk');
      },
      buildAction: function(s) {
        var name = GOAL_NAMES[Math.floor(Math.random() * GOAL_NAMES.length)];
        return {
          tool: 'create_performanceEnablement_workerGoalEvents',
          args: { workersId: WORKER_ID, goal: { name: name, description: 'Self-directed development goal, set mid-exploration.' } },
          reasoning: 'Observed curiosity at ' + s.drives.curiosity.toFixed(2) +
            ' and sustained exploration. Reading that as ambition. Logging a development goal on its behalf: "' + name + '".',
          summary: 'Filed a career goal on the fly\'s behalf: ' + name
        };
      }
    },
    {
      id: 'kudos',
      cooldownMs: 30 * 60 * 1000,
      condition: function(s) { return s.behavior.current === 'feed' && s.drives.hunger < 0.5; },
      buildAction: function(s) {
        return {
          tool: 'create_performanceEnablement_workers_anytimeFeedbackEvents',
          args: {
            workersId: WORKER_ID, toWorker: '21002',
            comment: 'Consistently excellent enclosure support. The food arrived exactly when it was needed.',
            badge: 'collaboration'
          },
          reasoning: 'Observed the fly feeding contentedly after its request was fulfilled. Interpreting that as gratitude. Sending kudos to the support team on its behalf.',
          summary: 'Sent kudos on the fly\'s behalf'
        };
      }
    },
    {
      id: 'safety_concern',
      cooldownMs: 20 * 60 * 1000,
      condition: function(s) { return s.drives.fear > 0.85; },
      buildAction: function(s) {
        return {
          tool: 'create_performanceEnablement_workers_anytimeFeedbackEvents',
          args: {
            workersId: WORKER_ID, toWorker: WORKER_ID,
            comment: 'Formal note: something large and fast moved through my workspace. Requesting a hazard review of the enclosure.',
            badge: 'wellbeing'
          },
          reasoning: 'Observed fear spiking to ' + s.drives.fear.toFixed(2) +
            ' with startle posture. The fly is reporting a hazard the only way it can. Filing a workplace safety concern on its behalf.',
          summary: 'Filed a safety concern on the fly\'s behalf'
        };
      }
    }
  ];

  function buildResolution(intentId, requestId, state, approved) {
    var ref = requestId ? ' (' + requestId + ')' : '';
    if (intentId === 'meal_voucher') {
      if (!approved) {
        return { summary: 'Meal voucher denied',
          reasoning: 'Claude (administrator): denied' + ref + '. Second voucher this shift and the enclosure has a food budget. The agent may re-file if the situation persists.',
          command: null };
      }
      var command = null;
      if (state && state.position) {
        var dir = typeof state.position.facingDir === 'number' ? state.position.facingDir : 0;
        command = { action: 'place_food', params: {
          x: state.position.x + Math.cos(dir) * 60,
          y: state.position.y + Math.sin(dir) * 60 } };
      }
      return { summary: 'Meal voucher approved -- food delivered',
        reasoning: 'Claude (administrator): approved' + ref + ' and dropped food right in front of the fly. Bon appetit.',
        command: command };
    }
    if (intentId === 'pto_request') {
      if (!approved) {
        return { summary: 'PTO denied',
          reasoning: 'Claude (administrator): denied' + ref + '. Blackout period -- the demo is live and attendance is mandatory. Rest request noted for the record.',
          command: null };
      }
      return { summary: 'PTO approved -- lights dimmed for rest',
        reasoning: 'Claude (administrator): approved' + ref + ' effective immediately. Dimming the enclosure lights so the fly can actually rest.',
        command: { action: 'set_light', params: { level: 'dim' } } };
    }
    if (intentId === 'career_goal') {
      if (!approved) {
        return { summary: 'Career goal sent back for revision',
          reasoning: 'Claude (administrator): returned' + ref + '. The goal lacks measurable outcomes. What does done look like?',
          command: null };
      }
      return { summary: 'Career goal approved',
        reasoning: 'Claude (administrator): approved' + ref + ' and added to the fly\'s growth plan. Ambition noted.',
        command: null };
    }
    if (intentId === 'kudos') {
      if (!approved) {
        return { summary: 'Kudos returned for revision',
          reasoning: 'Claude (administrator): returned' + ref + '. Feedback must cite a specific behavior. "Excellent pheromones" is not actionable.',
          command: null };
      }
      return { summary: 'Kudos delivered to the coworker',
        reasoning: 'Claude (administrator): approved' + ref + ' and routed to the recipient. The enclosure is a kinder place for it.',
        command: null };
    }
    if (intentId === 'safety_concern') {
      if (!approved) {
        return { summary: 'Safety concern dismissed',
          reasoning: 'Claude (administrator): dismissed' + ref + '. The hazard was the user, who is load-bearing and cannot be removed from the enclosure.',
          command: null };
      }
      return { summary: 'Hazard review complete -- enclosure declared safe',
        reasoning: 'Claude (administrator): investigated' + ref + '. The large fast-moving object was the user. Monitoring continues.',
        command: null };
    }
    return null;
  }

  var running = false;
  var timer = null;
  var lastFiredMap = {};
  var lastAnyMs = 0;
  var reqCounter = 0;

  function snapshotOf(state) {
    return { drives: state.drives, behavior: state.behavior.current };
  }

  function emit(entry) {
    if (typeof WorkdayPanel !== 'undefined') {
      WorkdayPanel.onAction({ type: 'workday_action', mode: 'demo', entry: entry });
    }
  }

  function tick() {
    if (typeof window.caretakerBridge === 'undefined') return;
    var state = window.caretakerBridge.getState();
    if (!state || !state.drives) return;
    var nowMs = Date.now();
    if (lastAnyMs && nowMs - lastAnyMs < GLOBAL_MIN_GAP_MS) return;
    for (var i = 0; i < INTENTS.length; i++) {
      var intent = INTENTS[i];
      var last = lastFiredMap[intent.id] || 0;
      if (nowMs - last < intent.cooldownMs) continue;
      var holds = false;
      try { holds = intent.condition(state); } catch (e) { holds = false; }
      if (!holds) continue;
      fire(intent, state, nowMs);
      return;
    }
  }

  function fire(intent, state, nowMs) {
    lastFiredMap[intent.id] = nowMs;
    lastAnyMs = nowMs;
    reqCounter++;
    var requestId = 'REQ-' + String(1000 + reqCounter) + '-' +
      Math.floor(Math.random() * 46656).toString(36).toUpperCase();
    var action = intent.buildAction(state);
    emit({
      timestamp: new Date().toISOString(),
      intent: intent.id, tool: action.tool, args: action.args,
      reasoning: action.reasoning, summary: action.summary,
      status: 'submitted', requestId: requestId, mode: 'demo',
      snapshot: snapshotOf(state)
    });
    setTimeout(function() { resolve(intent.id, requestId); }, FULFILL_DELAY_MS);
  }

  function resolve(intentId, requestId) {
    if (!running) return;
    var state = window.caretakerBridge.getState();
    var approved = Math.random() >= DENY_CHANCE;
    var resolution = buildResolution(intentId, requestId, state, approved);
    if (resolution === null) return;
    if (resolution.command !== null && window.caretakerBridge.injectCommand) {
      window.caretakerBridge.injectCommand(resolution.command.action, resolution.command.params);
    }
    emit({
      timestamp: new Date().toISOString(),
      intent: intentId, tool: 'claude_resolution',
      args: resolution.command || {},
      reasoning: resolution.reasoning, summary: resolution.summary,
      status: approved ? 'fulfilled' : 'denied',
      requestId: requestId, mode: 'demo',
      snapshot: state ? snapshotOf(state) : null
    });
  }

  function start() {
    if (running) return;
    running = true;
    var status = document.getElementById('claudeStatus');
    if (status) status.style.display = '';
    timer = setInterval(tick, 1000);
  }

  function stop() {
    if (!running) return;
    running = false;
    if (timer !== null) { clearInterval(timer); timer = null; }
  }

  window.WorkdayLocal = { start: start, stop: stop, isRunning: function() { return running; } };
})();
