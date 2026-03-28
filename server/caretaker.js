var WebSocket = require('ws');
var http = require('http');
var fs = require('fs');
var path = require('path');
var readline = require('readline');
var dbModule = require('./db');

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

var server = http.createServer(function(req, res) {
  if (req.method === 'GET' && req.url === '/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    if (lastState) {
      res.end(JSON.stringify(lastState));
    } else {
      res.end('null');
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
