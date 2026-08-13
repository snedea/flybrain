#!/usr/bin/env node
// Pure-node tests for the Fly @ Work intent engine (server/workday-agent.js)
// and the mock Workday client. Run: node tests/workday-node.js
var assert = require('assert');
var path = require('path');
var agentModule = require(path.join(__dirname, '..', 'server', 'workday-agent.js'));
var clientModule = require(path.join(__dirname, '..', 'server', 'workday-client.js'));

var evaluateIntents = agentModule.evaluateIntents;
var INTENTS = agentModule.INTENTS;

var passed = 0;
var failed = 0;
var pending = [];

function test(name, fn) {
  try {
    var result = fn();
    if (result && typeof result.then === 'function') {
      pending.push(result.then(
        function() { passed++; console.log('  PASS ' + name); },
        function(e) { failed++; console.log('  FAIL ' + name + ' -- ' + e.message); }
      ));
      return;
    }
    passed++;
    console.log('  PASS ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + ' -- ' + e.message);
  }
}

function makeState(overrides) {
  var state = {
    drives: { hunger: 0.3, fear: 0.0, fatigue: 0.1, curiosity: 0.5, groom: 0.1 },
    behavior: { current: 'idle', enterTime: 0 },
    position: { x: 100, y: 100, facingDir: 0, speed: 0 },
    firingStats: { firedNeurons: 500 },
    food: [],
    environment: { lightLevel: 0, temperature: 0 }
  };
  overrides = overrides || {};
  if (overrides.drives) Object.assign(state.drives, overrides.drives);
  if (overrides.behavior) Object.assign(state.behavior, overrides.behavior);
  if (overrides.food) state.food = overrides.food;
  return state;
}

var NOW = 10000000;

console.log('workday-node tests:');

test('calm state fires nothing', function() {
  assert.strictEqual(evaluateIntents(makeState(), {}, NOW, 0), null);
});

test('hungry with no food fires meal_voucher', function() {
  var s = makeState({ drives: { hunger: 0.92 } });
  var intent = evaluateIntents(s, {}, NOW, 0);
  assert.ok(intent, 'expected an intent');
  assert.strictEqual(intent.id, 'meal_voucher');
});

test('hungry WITH food present fires nothing', function() {
  var s = makeState({ drives: { hunger: 0.92 }, food: [{ x: 1, y: 1, radius: 10, eaten: 0 }] });
  assert.strictEqual(evaluateIntents(s, {}, NOW, 0), null);
});

test('meal_voucher cooldown suppresses repeat', function() {
  var s = makeState({ drives: { hunger: 0.92 } });
  var lastFired = { meal_voucher: NOW - 60000 }; // fired 1 min ago, cooldown 10 min
  assert.strictEqual(evaluateIntents(s, lastFired, NOW, 0), null);
});

test('meal_voucher fires again after cooldown expires', function() {
  var s = makeState({ drives: { hunger: 0.92 } });
  var lastFired = { meal_voucher: NOW - 11 * 60 * 1000 };
  var intent = evaluateIntents(s, lastFired, NOW, 0);
  assert.ok(intent && intent.id === 'meal_voucher');
});

test('high fatigue fires pto_request', function() {
  var s = makeState({ drives: { fatigue: 0.85 } });
  var intent = evaluateIntents(s, {}, NOW, 0);
  assert.ok(intent && intent.id === 'pto_request');
});

test('resting with moderate fatigue fires pto_request', function() {
  var s = makeState({ drives: { fatigue: 0.65 }, behavior: { current: 'rest' } });
  var intent = evaluateIntents(s, {}, NOW, 0);
  assert.ok(intent && intent.id === 'pto_request');
});

test('resting with low fatigue fires nothing', function() {
  var s = makeState({ drives: { fatigue: 0.3 }, behavior: { current: 'rest' } });
  assert.strictEqual(evaluateIntents(s, {}, NOW, 0), null);
});

test('curious explorer fires career_goal', function() {
  var s = makeState({ drives: { curiosity: 0.9 }, behavior: { current: 'explore' } });
  var intent = evaluateIntents(s, {}, NOW, 0);
  assert.ok(intent && intent.id === 'career_goal');
});

test('curious but idle fires nothing', function() {
  var s = makeState({ drives: { curiosity: 0.9 }, behavior: { current: 'idle' } });
  assert.strictEqual(evaluateIntents(s, {}, NOW, 0), null);
});

test('contented feeding fires kudos', function() {
  var s = makeState({ drives: { hunger: 0.3 }, behavior: { current: 'feed' } });
  var intent = evaluateIntents(s, {}, NOW, 0);
  assert.ok(intent && intent.id === 'kudos');
});

test('feeding while still very hungry does not fire kudos', function() {
  var s = makeState({ drives: { hunger: 0.7 }, behavior: { current: 'feed' } });
  assert.strictEqual(evaluateIntents(s, {}, NOW, 0), null);
});

test('high fear fires safety_concern', function() {
  var s = makeState({ drives: { fear: 0.9 } });
  var intent = evaluateIntents(s, {}, NOW, 0);
  assert.ok(intent && intent.id === 'safety_concern');
});

test('global gap suppresses any intent within 60s of the last action', function() {
  var s = makeState({ drives: { hunger: 0.92 } });
  assert.strictEqual(evaluateIntents(s, {}, NOW, NOW - 30000), null);
});

test('priority: hunger beats fear when both are critical', function() {
  var s = makeState({ drives: { hunger: 0.92, fear: 0.9 } });
  var intent = evaluateIntents(s, {}, NOW, 0);
  assert.ok(intent && intent.id === 'meal_voucher');
});

test('malformed state returns null, no throw', function() {
  assert.strictEqual(evaluateIntents(null, {}, NOW, 0), null);
  assert.strictEqual(evaluateIntents({}, {}, NOW, 0), null);
  assert.strictEqual(evaluateIntents({ drives: {} }, {}, NOW, 0), null);
});

test('every intent buildAction returns tool, args, reasoning, summary', function() {
  var cfg = { workerId: '21001', coworkerId: '21002' };
  var states = {
    meal_voucher: makeState({ drives: { hunger: 0.92 } }),
    pto_request: makeState({ drives: { fatigue: 0.85 } }),
    career_goal: makeState({ drives: { curiosity: 0.9 }, behavior: { current: 'explore' } }),
    kudos: makeState({ drives: { hunger: 0.3 }, behavior: { current: 'feed' } }),
    safety_concern: makeState({ drives: { fear: 0.9 } })
  };
  for (var i = 0; i < INTENTS.length; i++) {
    var intent = INTENTS[i];
    var action = intent.buildAction(states[intent.id], cfg);
    assert.ok(action.tool && typeof action.tool === 'string', intent.id + ' tool');
    assert.ok(action.args && typeof action.args === 'object', intent.id + ' args');
    assert.ok(action.reasoning.length > 0, intent.id + ' reasoning');
    assert.ok(action.summary.length > 0, intent.id + ' summary');
  }
});

test('buildResolution: approved meal_voucher drops food in front of the fly', function() {
  var state = makeState();
  state.position = { x: 200, y: 300, facingDir: 0, speed: 0 };
  var r = agentModule.buildResolution('meal_voucher', 'MOCK-1', state, true);
  assert.ok(r.summary.indexOf('approved') !== -1, r.summary);
  assert.ok(r.command && r.command.action === 'place_food');
  assert.ok(Math.abs(r.command.params.x - 260) < 0.001, 'x: ' + r.command.params.x);
  assert.ok(Math.abs(r.command.params.y - 300) < 0.001, 'y: ' + r.command.params.y);
});

test('buildResolution: denied meal_voucher has no command, no food', function() {
  var state = makeState();
  state.position = { x: 200, y: 300, facingDir: 0, speed: 0 };
  var r = agentModule.buildResolution('meal_voucher', 'MOCK-1', state, false);
  assert.ok(r.summary.toLowerCase().indexOf('denied') !== -1, r.summary);
  assert.strictEqual(r.command, null);
});

test('buildResolution: approved meal_voucher without state still approves, no command', function() {
  var r = agentModule.buildResolution('meal_voucher', 'MOCK-2', null, true);
  assert.ok(r !== null && r.command === null);
});

test('buildResolution: approved pto_request dims the lights, denied does not', function() {
  var ok = agentModule.buildResolution('pto_request', 'MOCK-3', makeState(), true);
  assert.ok(ok.command && ok.command.action === 'set_light' && ok.command.params.level === 'dim');
  var no = agentModule.buildResolution('pto_request', 'MOCK-3', makeState(), false);
  assert.strictEqual(no.command, null);
});

test('buildResolution: every intent has approved and denied variants', function() {
  for (var i = 0; i < INTENTS.length; i++) {
    var ok = agentModule.buildResolution(INTENTS[i].id, 'MOCK-N', makeState(), true);
    var no = agentModule.buildResolution(INTENTS[i].id, 'MOCK-N', makeState(), false);
    assert.ok(ok && ok.summary.length > 0 && ok.reasoning.length > 0, INTENTS[i].id + ' approved');
    assert.ok(no && no.summary.length > 0 && no.reasoning.length > 0, INTENTS[i].id + ' denied');
    assert.strictEqual(no.command, null, INTENTS[i].id + ' denied must have no world effect');
  }
});

test('buildResolution: unknown intent returns null', function() {
  assert.strictEqual(agentModule.buildResolution('nonsense', 'X', makeState(), true), null);
});

test('mock client returns ok with a REQ request id', function() {
  var client = clientModule.createClient({ mode: 'mock' });
  assert.strictEqual(client.getMode(), 'mock');
  return client.callTool('create_absenceManagement_workers_requestTimeOff', {}).then(function(result) {
    assert.strictEqual(result.ok, true);
    assert.ok(/^REQ-/.test(result.requestId), 'request id: ' + result.requestId);
  });
});

test('live client without token fails fast without network', function() {
  var client = clientModule.createClient({ mode: 'live', token: '' });
  return client.callTool('anything', {}).then(function(result) {
    assert.strictEqual(result.ok, false);
    assert.ok(result.detail.indexOf('WORKDAY_TOKEN') !== -1);
  });
});

Promise.all(pending).then(function() {
  console.log('workday-node: ' + passed + ' passed, ' + failed + ' failed');
  process.exit(failed > 0 ? 1 : 0);
});
