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
      environment: { lightLevel: BRAIN.stimulate.lightLevel, temperature: BRAIN.stimulate.temperature }
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
        }
        break;
      case 'set_temp':
        if (tempMap.hasOwnProperty(params.level)) {
          var ti = tempMap[params.level];
          tempStateIndex = ti;
          BRAIN.stimulate.temperature = tempStates[ti];
          document.getElementById('tempBtn').textContent = 'Temp: ' + tempLabels[ti];
        }
        break;
      case 'touch':
        applyTouchTool(params.x !== undefined ? params.x : fly.x, params.y !== undefined ? params.y : fly.y);
        break;
      case 'blow_wind':
        BRAIN.stimulate.wind = true;
        BRAIN.stimulate.windStrength = Math.min(1, Math.max(0, params.strength || 0.5));
        BRAIN.stimulate.windDirection = params.direction || 0;
        windResetTime = Date.now() + 2000;
        break;
      case 'clear_food':
        food.length = 0;
        break;
      default:
        console.warn('[caretaker] Unknown action:', action);
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
      console.log('[caretaker] Connected to ' + WS_URL);
      stateTimer = setInterval(sendState, STATE_INTERVAL);
      sendState();
    };
    ws.onmessage = function(event) { executeCommand(event.data); };
    ws.onclose = function() {
      connected = false;
      if (stateTimer !== null) { clearInterval(stateTimer); stateTimer = null; }
      console.log('[caretaker] Disconnected, reconnecting in ' + (RECONNECT_DELAY / 1000) + 's');
      reconnectTimer = setTimeout(connect, RECONNECT_DELAY);
    };
    ws.onerror = function() {};
  }

  function init() {
    if (typeof BRAIN !== 'undefined' && BRAIN.drives) { connect(); return; }
    setTimeout(init, 500);
  }

  init();
  window.caretakerBridge = { getState: getState, connect: connect,
    isConnected: function() { return connected; } };
})();
