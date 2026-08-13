#!/usr/bin/env node
// Public-mode smoke test: two visitors, two flies, two isolated Workday
// sessions. Run: node tests/workday-public-smoke.js
var spawn = require('child_process').spawn;
var path = require('path');
var http = require('http');
var os = require('os');
var fs = require('fs');
var WebSocket = require('ws');

var PORT = 7698;
var serverPath = path.join(__dirname, '..', 'server', 'caretaker.js');
var tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'flybrain-pub-')), 'pub.db');
var child = null;
var finished = false;

function fail(msg) {
  if (finished) return;
  finished = true;
  console.log('PUBLIC SMOKE FAIL: ' + msg);
  if (child) child.kill();
  process.exit(1);
}

function pass() {
  if (finished) return;
  finished = true;
  console.log('PUBLIC SMOKE PASS: two isolated sessions, own request/approval/food streams, chat 503');
  child.kill();
  process.exit(0);
}

function hungryState() {
  return {
    drives: { hunger: 0.95, fear: 0.0, fatigue: 0.1, curiosity: 0.5, groom: 0.1 },
    behavior: { current: 'walk', enterTime: 0, groomLocation: null },
    position: { x: 100, y: 100, facingDir: 0, speed: 1 },
    firingStats: { firedNeurons: 500 },
    food: [],
    environment: { lightLevel: 0, temperature: 0 }
  };
}

child = spawn(process.execPath, [serverPath], {
  env: Object.assign({}, process.env, {
    CARETAKER_PORT: String(PORT),
    CARETAKER_DB: tmpDb,
    CARETAKER_PUBLIC: '1',
    WORKDAY_MODE: 'mock',
    WORKDAY_FULFILL_MS: '400',
    WORKDAY_DENY_CHANCE: '0'
  }),
  stdio: ['ignore', 'pipe', 'pipe']
});

child.on('exit', function(code) {
  if (!finished) fail('server exited early with code ' + code + ' (stdin must not kill public mode)');
});

setTimeout(function() { fail('timeout after 15s'); }, 15000);

function makeVisitor(name) {
  var visitor = { name: name, requestIds: {}, sawFulfilled: false, sawFood: false, ready: null };
  visitor.promise = new Promise(function(resolve) { visitor.ready = resolve; });
  var ws = new WebSocket('ws://localhost:' + PORT);
  visitor.ws = ws;
  ws.on('error', function(e) { fail(name + ' ws error: ' + e.message); });
  ws.on('open', function() {
    ws.send(JSON.stringify({ type: 'state', data: hungryState() }));
  });
  ws.on('message', function(data) {
    var msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (msg.type === 'command' && msg.action === 'place_food') visitor.sawFood = true;
    if (msg.type === 'workday_action' && msg.entry) {
      if (msg.entry.status === 'submitted') visitor.requestIds[msg.entry.requestId] = true;
      if (msg.entry.status === 'fulfilled') visitor.sawFulfilled = true;
    }
    if (Object.keys(visitor.requestIds).length > 0 && visitor.sawFulfilled && visitor.sawFood) {
      visitor.ready(visitor);
    }
  });
  return visitor;
}

setTimeout(function() {
  var a = makeVisitor('A');
  var b = makeVisitor('B');
  Promise.all([a.promise, b.promise]).then(function() {
    // Isolation: no shared request ids between the two sessions
    var overlap = Object.keys(a.requestIds).filter(function(id) { return b.requestIds[id]; });
    if (overlap.length > 0) return fail('sessions shared request ids: ' + overlap.join(','));
    // Chat must be disabled in public mode
    var req = http.request({ host: 'localhost', port: PORT, path: '/chat', method: 'POST' }, function(res) {
      if (res.statusCode !== 503) return fail('/chat returned ' + res.statusCode + ', expected 503');
      res.resume();
      pass();
    });
    req.on('error', function(e) { fail('chat check error: ' + e.message); });
    req.end(JSON.stringify({ message: 'hi' }));
  });
}, 1500);
