#!/usr/bin/env node
// End-to-end smoke test for the Fly @ Work pipeline:
// spawn caretaker server (mock mode) -> connect as a fake browser over WS ->
// send a hungry fly state -> expect a workday_action broadcast and a
// persisted entry on GET /workday/actions.
// Run: node tests/workday-smoke.js
var spawn = require('child_process').spawn;
var path = require('path');
var http = require('http');
var WebSocket = require('ws');

var PORT = 7699;
var os = require('os');
var fs = require('fs');
var serverPath = path.join(__dirname, '..', 'server', 'caretaker.js');
var tmpDb = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'flybrain-smoke-')), 'smoke.db');
var child = null;
var finished = false;

function fail(msg) {
  if (finished) return;
  finished = true;
  console.log('SMOKE FAIL: ' + msg);
  if (child) child.kill();
  process.exit(1);
}

function pass() {
  if (finished) return;
  finished = true;
  console.log('SMOKE PASS: request + fulfillment broadcast, food command, persisted entries verified');
  child.kill();
  process.exit(0);
}

var sawRequest = false;
var sawFulfillment = false;
var sawFoodCommand = false;

var hungryState = {
  drives: { hunger: 0.95, fear: 0.0, fatigue: 0.1, curiosity: 0.5, groom: 0.1 },
  behavior: { current: 'walk', enterTime: 0, groomLocation: null },
  position: { x: 100, y: 100, facingDir: 0, speed: 1 },
  firingStats: { firedNeurons: 500 },
  food: [],
  environment: { lightLevel: 0, temperature: 0 }
};

child = spawn(process.execPath, [serverPath], {
  env: Object.assign({}, process.env, {
    CARETAKER_PORT: String(PORT),
    CARETAKER_DB: tmpDb,
    WORKDAY_MODE: 'mock',
    WORKDAY_FULFILL_MS: '500',
    WORKDAY_DENY_CHANCE: '0'
  }),
  stdio: ['pipe', 'pipe', 'pipe']
});

child.on('exit', function(code) {
  if (!finished) fail('server exited early with code ' + code);
});

setTimeout(function() { fail('timeout after 10s'); }, 10000);

function checkHttp() {
  http.get({ host: 'localhost', port: PORT, path: '/workday/actions' }, function(res) {
    var body = '';
    res.on('data', function(c) { body += c; });
    res.on('end', function() {
      var rows;
      try { rows = JSON.parse(body); } catch (e) { return fail('bad JSON from /workday/actions'); }
      if (!Array.isArray(rows) || rows.length === 0) return fail('/workday/actions is empty');
      var foundRequest = false;
      var foundFulfillment = false;
      for (var i = 0; i < rows.length; i++) {
        if (rows[i].intent === 'meal_voucher' && rows[i].status === 'submitted') foundRequest = true;
        if (rows[i].intent === 'meal_voucher' && rows[i].status === 'fulfilled') foundFulfillment = true;
      }
      if (!foundRequest) return fail('no submitted meal_voucher row in /workday/actions');
      if (!foundFulfillment) return fail('no fulfilled meal_voucher row in /workday/actions');
      pass();
    });
  }).on('error', function(e) { fail('http error: ' + e.message); });
}

// Give the server a moment to bind, then connect as the browser.
setTimeout(function() {
  var ws = new WebSocket('ws://localhost:' + PORT);
  ws.on('error', function(e) { fail('ws error: ' + e.message); });
  ws.on('open', function() {
    ws.send(JSON.stringify({ type: 'state', data: hungryState }));
  });
  ws.on('message', function(data) {
    var msg;
    try { msg = JSON.parse(data.toString()); } catch (e) { return; }
    if (msg.type === 'command' && msg.action === 'place_food') {
      if (typeof msg.params.x !== 'number' || typeof msg.params.y !== 'number') {
        return fail('place_food command missing coordinates');
      }
      sawFoodCommand = true;
    }
    if (msg.type === 'workday_action') {
      if (msg.mode !== 'mock') return fail('expected mock mode, got ' + msg.mode);
      if (!msg.entry || msg.entry.intent !== 'meal_voucher') {
        return fail('expected meal_voucher, got ' + JSON.stringify(msg.entry && msg.entry.intent));
      }
      if (msg.entry.status === 'submitted') {
        if (!/^MOCK-/.test(msg.entry.requestId)) return fail('bad request id: ' + msg.entry.requestId);
        sawRequest = true;
      }
      if (msg.entry.status === 'fulfilled') sawFulfillment = true;
    }
    if (sawRequest && sawFulfillment && sawFoodCommand) {
      checkHttp();
    }
  });
}, 1500);
