(function() {
  var WS_URL = 'ws://' + (location.hostname || 'localhost') + ':7600';
  var STATE_INTERVAL = 1000;
  var RECONNECT_DELAY = 3000;
  var ws = null, stateTimer = null, reconnectTimer = null, connected = false;

  function getState() {
    return {
      drives: { hunger: BRAIN.drives.hunger, fear: BRAIN.drives.fear,
        fatigue: BRAIN.drives.fatigue, curiosity: BRAIN.drives.curiosity, groom: BRAIN.drives.groom },
      behavior: { current: behavior.current, enterTime: behavior.enterTime,
        groomLocation: behavior.groomLocation },
      position: { x: fly.x, y: fly.y, facingDir: facingDir, speed: speed },
      firingStats: { firedNeurons: BRAIN.workerFiredNeurons || 0 },
      food: food.map(function(f) { return { x: f.x, y: f.y, radius: f.radius, eaten: f.eaten }; }),
      environment: { lightLevel: lightStateIndex, temperature: tempStateIndex }
    };
  }

  function sendState() {
    if (ws === null || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'state', data: getState() }));
  }

  function executeCommand(raw) {
    var msg;
    try { msg = JSON.parse(raw); } catch (e) {
      console.warn('[caretaker] Bad JSON from server:', e.message);
      return;
    }
    if (msg.type !== 'command') return;
    var action = msg.action, params = msg.params || {};
    var lightMap = { bright: 0, dim: 1, dark: 2 };
    var tempMap = { neutral: 0, warm: 1, cool: 2 };
    switch (action) {
      case 'place_food':
        if (typeof params.x !== 'number' || typeof params.y !== 'number' ||
            !isFinite(params.x) || !isFinite(params.y)) {
          console.warn('[caretaker] place_food: invalid x/y', params.x, params.y);
          break;
        }
        var fx = Math.max(0, Math.min(window.innerWidth, params.x));
        var fy = Math.max(44, Math.min(window.innerHeight, params.y));
        food.push({ x: fx, y: fy, radius: 10, feedStart: 0, feedDuration: 0, eaten: 0 });
        break;
      case 'set_light':
        if (lightMap.hasOwnProperty(params.level)) {
          var li = lightMap[params.level];
          lightStateIndex = li;
          BRAIN.stimulate.lightLevel = lightStates[li];
          document.getElementById('lightBtn').textContent = 'Light: ' + lightLabels[li];
        } else if (typeof params.level === 'number' && params.level >= 0 && params.level <= 2) {
          var li2 = Math.floor(params.level);
          lightStateIndex = li2;
          BRAIN.stimulate.lightLevel = lightStates[li2];
          document.getElementById('lightBtn').textContent = 'Light: ' + lightLabels[li2];
        } else {
          console.warn('[caretaker] set_light: invalid level (expected bright/dim/dark or 0-2):', params.level);
        }
        break;
      case 'set_temp':
        if (tempMap.hasOwnProperty(params.level)) {
          var ti = tempMap[params.level];
          tempStateIndex = ti;
          BRAIN.stimulate.temperature = tempStates[ti];
          document.getElementById('tempBtn').textContent = 'Temp: ' + tempLabels[ti];
        } else if (typeof params.level === 'number' && params.level >= 0 && params.level <= 2) {
          var ti2 = Math.floor(params.level);
          tempStateIndex = ti2;
          BRAIN.stimulate.temperature = tempStates[ti2];
          document.getElementById('tempBtn').textContent = 'Temp: ' + tempLabels[ti2];
        } else {
          console.warn('[caretaker] set_temp: invalid level (expected warm/neutral/cool or 0-2):', params.level);
        }
        break;
      case 'touch':
        var tx = typeof params.x === 'number' && isFinite(params.x)
          ? Math.max(0, Math.min(window.innerWidth, params.x)) : fly.x;
        var ty = typeof params.y === 'number' && isFinite(params.y)
          ? Math.max(44, Math.min(window.innerHeight, params.y)) : fly.y;
        applyTouchTool(tx, ty);
        break;
      case 'blow_wind':
        BRAIN.stimulate.wind = true;
        BRAIN.stimulate.windStrength = Math.min(1, Math.max(0,
          typeof params.strength === 'number' && isFinite(params.strength) ? params.strength : 0.5));
        BRAIN.stimulate.windDirection = typeof params.direction === 'number' && isFinite(params.direction)
          ? params.direction : 0;
        windResetTime = Date.now() + 2000;
        break;
      case 'clear_food':
        food.length = 0;
        break;
      default:
        console.warn('[caretaker] Unknown action:', action);
    }
    if (typeof CaretakerRenderer !== 'undefined') {
      CaretakerRenderer.onCommand(action, params);
    }
  }

  function connect() {
    if (reconnectTimer !== null) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    try { ws = new WebSocket(WS_URL); } catch (e) {
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
      return;
    }
    ws.onopen = function() {
      connected = true;
      if (typeof CaretakerRenderer !== 'undefined') { CaretakerRenderer.setConnected(true); }
      var statusEl = document.getElementById('claudeStatus');
      if (statusEl) statusEl.style.display = '';
      console.log('[caretaker] Connected to ' + WS_URL);
      stateTimer = setInterval(sendState, STATE_INTERVAL);
      sendState();
    };
    ws.onmessage = function(event) {
      var msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }
      if (msg.type === 'command') {
        executeCommand(event.data);
      } else if (typeof CaretakerSidebar !== 'undefined') {
        if (msg.type === 'activity_action') {
          CaretakerSidebar.onAction(msg);
        } else if (msg.type === 'activity_incident') {
          CaretakerSidebar.onIncident(msg);
        } else if (msg.type === 'activity_history') {
          CaretakerSidebar.onHistory(msg);
        }
      }
    };
    ws.onclose = function() {
      connected = false;
      if (typeof CaretakerRenderer !== 'undefined') { CaretakerRenderer.setConnected(false); }
      var statusEl = document.getElementById('claudeStatus');
      if (statusEl) statusEl.style.display = 'none';
      if (stateTimer !== null) { clearInterval(stateTimer); stateTimer = null; }
      console.log('[caretaker] Disconnected, reconnecting in ' + (RECONNECT_DELAY / 1000) + 's');
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
    };
    ws.onerror = function() {};
  }

  function init() {
    if (location.protocol === 'file:') {
      console.log('[caretaker] Skipping WebSocket connection in file:// context (iOS/local)');
      return;
    }
    if (typeof BRAIN !== 'undefined' && BRAIN.drives) { connect(); return; }
    setTimeout(init, 500);
  }

  init();
  window.caretakerBridge = { getState: getState, connect: connect,
    isConnected: function() { return connected; } };
})();
