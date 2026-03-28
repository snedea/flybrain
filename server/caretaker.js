var WebSocket = require('ws');
var http = require('http');
var fs = require('fs');
var path = require('path');
var readline = require('readline');

var PORT = parseInt(process.env.CARETAKER_PORT, 10) || 7600;
var LOG_PATH = path.join(__dirname, '..', 'caretaker.log');
var logStream = fs.createWriteStream(LOG_PATH, { flags: 'a' });
var lastState = null;
var lastActionTime = 0;
var lastActionType = null;
var preFearLevel = 0;
var browserSocket = null;
var VALID_ACTIONS = ['place_food', 'set_light', 'set_temp', 'touch', 'blow_wind', 'clear_food'];

function writeLog(entry) {
  entry.timestamp = new Date().toISOString();
  logStream.write(JSON.stringify(entry) + '\n');
}

function writeStdout(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

function detectIncidents(state) {
  var fear = state.drives.fear;
  var hunger = state.drives.hunger;
  var foodCount = state.food.length;
  if (lastActionTime > 0 && Date.now() - lastActionTime < 5000 && fear - preFearLevel > 0.2) {
    var inc = { type: 'incident', incident: 'scared_the_fly', action: lastActionType,
      fearBefore: preFearLevel, fearAfter: fear, flyState: state };
    writeLog(inc);
    writeStdout(inc);
    lastActionTime = 0;
  }
  if (hunger > 0.9 && foodCount === 0) {
    var inc2 = { type: 'incident', incident: 'forgot_to_feed', hunger: hunger, flyState: state };
    writeLog(inc2);
    writeStdout(inc2);
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
  writeLog({ type: 'observation', data: msg.data });
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
  writeLog({ type: 'action', action: cmd.action, params: cmd.params || {},
    reasoning: cmd.reasoning || '', flyState: lastState });
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

var server = http.createServer();
var wss = new WebSocket.Server({ server: server });

wss.on('connection', function(ws) {
  browserSocket = ws;
  process.stderr.write('[caretaker] Browser connected\n');
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

function shutdown() { logStream.end(); wss.close(); process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
