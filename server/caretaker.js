var WebSocket = require('ws');
var http = require('http');
var fs = require('fs');
var path = require('path');
var readline = require('readline');
var Anthropic = require('@anthropic-ai/sdk');
var dbModule = require('./db');
var chatPolicyPath = path.join(__dirname, '..', 'agent', 'chat-policy.md');
var chatPolicyContent = fs.readFileSync(chatPolicyPath, 'utf-8');
var anthropic = new Anthropic();

var PORT = parseInt(process.env.CARETAKER_PORT, 10) || 7600;
var caretakerDb = dbModule.openDb();
var lastObservationTime = 0;
var OBSERVATION_INTERVAL_MS = 10000;
var lastState = null;
var lastActionTime = 0;
var lastActionType = null;
var preFearLevel = 0;
var browserSocket = null;
var VALID_ACTIONS = ['place_food', 'set_light', 'set_temp', 'touch', 'blow_wind', 'clear_food'];

function writeStdout(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function broadcastActivity(obj) {
  if (browserSocket !== null && browserSocket.readyState === WebSocket.OPEN) {
    try {
      browserSocket.send(JSON.stringify(obj));
    } catch (e) {
      process.stderr.write('[caretaker] broadcastActivity error: ' + e.message + '\n');
    }
  }
}

function detectIncidents(state) {
  var now = new Date().toISOString();
  var fear = state.drives.fear;
  var hunger = state.drives.hunger;
  var foodCount = state.food.length;
  if (lastActionTime > 0 && Date.now() - lastActionTime < 5000 && fear - preFearLevel > 0.2) {
    caretakerDb.insertIncident(now, 'scared_the_fly', 'high',
      'Fear spiked from ' + preFearLevel.toFixed(2) + ' to ' + fear.toFixed(2) + ' after ' + lastActionType,
      state);
    writeStdout({ type: 'incident', incident: 'scared_the_fly', action: lastActionType,
      fearBefore: preFearLevel, fearAfter: fear, flyState: state, timestamp: now });
    broadcastActivity({ type: 'activity_incident', timestamp: now, incidentType: 'scared_the_fly', severity: 'high', description: 'Fear spiked from ' + preFearLevel.toFixed(2) + ' to ' + fear.toFixed(2) + ' after ' + lastActionType });
    lastActionTime = 0;
  }
  if (hunger > 0.9 && foodCount === 0) {
    var lastForgot = caretakerDb.getLastIncidentTime('forgot_to_feed');
    var shouldLog = true;
    if (lastForgot) {
      var elapsed = Date.now() - new Date(lastForgot).getTime();
      if (elapsed < 60000) shouldLog = false;
    }
    if (shouldLog) {
      caretakerDb.insertIncident(now, 'forgot_to_feed', 'medium',
        'Hunger at ' + hunger.toFixed(2) + ' with no food available',
        state);
      writeStdout({ type: 'incident', incident: 'forgot_to_feed', hunger: hunger, flyState: state, timestamp: now });
      broadcastActivity({ type: 'activity_incident', timestamp: now, incidentType: 'forgot_to_feed', severity: 'medium', description: 'Hunger at ' + hunger.toFixed(2) + ' with no food available' });
    }
  }
}

function handleStateMessage(data) {
  var msg;
  try { msg = JSON.parse(data); } catch (e) {
    process.stderr.write('[caretaker] Bad JSON from browser: ' + e.message + '\n');
    return;
  }
  if (msg.type !== 'state') return;
  lastState = msg.data;
  var now = Date.now();
  if (now - lastObservationTime >= OBSERVATION_INTERVAL_MS) {
    lastObservationTime = now;
    var ts = new Date().toISOString();
    caretakerDb.insertObservation(ts, msg.data);
  }
  writeStdout({ type: 'state', timestamp: new Date().toISOString(), data: msg.data });
  detectIncidents(msg.data);
}

function handleStdinCommand(line) {
  var cmd;
  try { cmd = JSON.parse(line); } catch (e) {
    process.stderr.write('[caretaker] Bad JSON from stdin: ' + e.message + '\n');
    writeStdout({ type: 'error', message: 'Invalid JSON: ' + e.message });
    return;
  }
  if (VALID_ACTIONS.indexOf(cmd.action) === -1) {
    process.stderr.write('[caretaker] Unknown action: ' + cmd.action + '\n');
    writeStdout({ type: 'error', message: 'Unknown action: ' + cmd.action });
    return;
  }
  preFearLevel = lastState ? lastState.drives.fear : 0;
  lastActionTime = Date.now();
  lastActionType = cmd.action;
  var ts = new Date().toISOString();
  caretakerDb.insertAction(ts, cmd.action, cmd.params || {}, cmd.reasoning || '', lastState);
  broadcastActivity({ type: 'activity_action', timestamp: ts, action: cmd.action, params: cmd.params || {}, reasoning: cmd.reasoning || '', flyState: lastState });
  if (browserSocket !== null && browserSocket.readyState === WebSocket.OPEN) {
    try {
      browserSocket.send(JSON.stringify({ type: 'command', action: cmd.action, params: cmd.params || {} }));
    } catch (e) {
      process.stderr.write('[caretaker] WebSocket send error: ' + e.message + '\n');
    }
    writeStdout({ type: 'action_ack', action: cmd.action, success: true });
  } else {
    writeStdout({ type: 'action_ack', action: cmd.action, success: false, error: 'no browser connected' });
  }
}

function buildChatContext(userMessage) {
  var currentDate = new Date().toISOString().slice(0, 19) + 'Z';
  var observations = caretakerDb.getRecentObservations(20);
  var actions = caretakerDb.getRecentActions(20);
  var incidents = caretakerDb.getRecentIncidents(20);
  var context = 'Current date: ' + currentDate + '\n\n';
  context += '## Recent Observations (last ' + observations.length + ')\n\n';
  if (observations.length === 0) {
    context += '(none)\n';
  } else {
    for (var i = 0; i < observations.length; i++) {
      var obs = observations[i];
      context += '- ' + obs.timestamp + ' | behavior=' + obs.behavior + ' hunger=' + (obs.hunger != null ? obs.hunger.toFixed(2) : '?') + ' fear=' + (obs.fear != null ? obs.fear.toFixed(2) : '?') + ' fatigue=' + (obs.fatigue != null ? obs.fatigue.toFixed(2) : '?') + ' curiosity=' + (obs.curiosity != null ? obs.curiosity.toFixed(2) : '?') + ' food_count=' + obs.food_count + '\n';
    }
  }
  context += '\n## Recent Actions (last ' + actions.length + ')\n\n';
  if (actions.length === 0) {
    context += '(none)\n';
  } else {
    for (var j = 0; j < actions.length; j++) {
      var act = actions[j];
      context += '- ' + act.timestamp + ' | ' + act.action + ' params=' + act.params + ' reason: ' + act.reasoning + '\n';
    }
  }
  context += '\n## Recent Incidents (last ' + incidents.length + ')\n\n';
  if (incidents.length === 0) {
    context += '(none)\n';
  } else {
    for (var k = 0; k < incidents.length; k++) {
      var inc = incidents[k];
      context += '- ' + inc.timestamp + ' | ' + inc.type + ' [' + inc.severity + '] ' + inc.description + '\n';
    }
  }
  return context;
}

async function handleChatRequest(userMessage, viewContext) {
  var context = buildChatContext(userMessage);
  var systemPrompt = chatPolicyContent + '\n\n---\n\n' + context;
  if (viewContext != null) {
    systemPrompt += '\n\n## User\'s Current View\n\n' + JSON.stringify(viewContext);
  }
  var history = caretakerDb.getChatHistory(20);
  var messages = [];
  for (var i = 0; i < history.length; i++) {
    messages.push({ role: history[i].role, content: history[i].message });
  }
  messages.push({ role: 'user', content: userMessage });
  try {
    var response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: systemPrompt,
      messages: messages
    });
    var assistantMessage = response.content[0].text;
    var ts = new Date().toISOString();
    caretakerDb.insertChatMessage(ts, 'user', userMessage);
    caretakerDb.insertChatMessage(ts, 'assistant', assistantMessage);
    return { role: 'assistant', message: assistantMessage, timestamp: ts };
  } catch (err) {
    return { role: 'assistant', message: 'Sorry, I could not process that question. Error: ' + err.message, timestamp: new Date().toISOString(), error: true };
  }
}

var server = http.createServer(function(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
  if (req.method === 'GET' && req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (lastState) {
      res.end(JSON.stringify(lastState));
    } else {
      res.end('null');
    }
    return;
  }
  if (req.method === 'POST' && req.url === '/chat') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      var parsed;
      try { parsed = JSON.parse(body); } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      if (!parsed.message || typeof parsed.message !== 'string' || parsed.message.trim() === '') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'message field is required' }));
        return;
      }
      handleChatRequest(parsed.message.trim(), parsed.context || null)
        .then(function(result) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        })
        .catch(function(err) {
          process.stderr.write('[caretaker] chat error: ' + err.message + '\n');
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal error' }));
        });
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/chat/history') {
    var history = caretakerDb.getChatHistory(50);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(history));
    return;
  }
  if (req.method === 'GET' && req.url === '/analytics/summary') {
    try {
      var today = new Date().toISOString().slice(0, 10);
      var summary = caretakerDb.getAnalyticsSummary(today);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(summary));
    } catch (err) {
      process.stderr.write('[caretaker] analytics/summary error: ' + err.message + '\n');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
    return;
  }
  if (req.method === 'GET' && req.url === '/analytics/hunger-timeline') {
    try {
      var timeline = caretakerDb.getHungerTimeline(120);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(timeline));
    } catch (err) {
      process.stderr.write('[caretaker] analytics/hunger-timeline error: ' + err.message + '\n');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/calendar/scores')) {
    try {
      var calUrl = new URL(req.url, 'http://localhost');
      var start = calUrl.searchParams.get('start');
      var end = calUrl.searchParams.get('end');
      if (!start) start = new Date(Date.now() - 28 * 86400000).toISOString().slice(0, 10);
      if (!end) end = new Date().toISOString().slice(0, 10);
      var scores = caretakerDb.getDailyScores(start, end);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(scores));
    } catch (err) {
      process.stderr.write('[caretaker] calendar/scores error: ' + err.message + '\n');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/calendar/day-activity')) {
    try {
      var dayUrl = new URL(req.url, 'http://localhost');
      var date = dayUrl.searchParams.get('date');
      if (!date) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'date parameter required' }));
        return;
      }
      var dayActivity = caretakerDb.getActivityForDate(date, 100);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(dayActivity));
    } catch (err) {
      process.stderr.write('[caretaker] calendar/day-activity error: ' + err.message + '\n');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
    return;
  }
  if (req.method === 'GET' && req.url === '/activity/recent') {
    try {
      var recent = caretakerDb.getRecentActivity(50);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(recent));
    } catch (err) {
      process.stderr.write('[caretaker] activity/recent error: ' + err.message + '\n');
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal error' }));
    }
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});
var wss = new WebSocket.Server({ server: server });

wss.on('connection', function(ws) {
  browserSocket = ws;
  process.stderr.write('[caretaker] Browser connected\n');
  var history = caretakerDb.getRecentActivity(50);
  broadcastActivity({ type: 'activity_history', entries: history });
  ws.on('message', function(data) { handleStateMessage(data.toString()); });
  ws.on('close', function() {
    browserSocket = null;
    process.stderr.write('[caretaker] Browser disconnected\n');
  });
  ws.on('error', function(err) {
    process.stderr.write('[caretaker] WebSocket error: ' + err.message + '\n');
  });
});

var rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on('line', handleStdinCommand);
rl.on('close', function() { process.exit(0); });

server.listen(PORT, function() {
  process.stderr.write('[caretaker] WebSocket server on port ' + PORT + '\n');
});

var DAILY_SCORE_INTERVAL_MS = 5 * 60 * 1000;
setInterval(function() {
  try {
    var today = new Date().toISOString().slice(0, 10);
    caretakerDb.computeDailyScore(today);
  } catch (e) {
    process.stderr.write('[caretaker] daily_scores error: ' + e.message + '\n');
  }
}, DAILY_SCORE_INTERVAL_MS);

function shutdown() { caretakerDb.close(); wss.close(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
