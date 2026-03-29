(function() {
  var cursorImg = null;
  var cursorLoaded = false;
  var attentionX = -1;
  var attentionY = -1;
  var attentionTargetX = -1;
  var attentionTargetY = -1;
  var trail = [];
  var TRAIL_MAX = 40;
  var TRAIL_LIFETIME = 2000;

  var activeEffects = [];

  var idleStart = 0;
  var idlePulseX = -1;
  var idlePulseY = -1;
  var lastCommandTime = 0;
  var caretakerConnected = false;

  var CURSOR_SIZE = 20;
  var CLAUDE_ORANGE = 'rgba(227, 115, 75, ';
  var CLAUDE_ORANGE_HEX = '#E3734B';

  function init() {
    cursorImg = new Image();
    cursorImg.src = './svg/claude-cursor.svg';
    cursorImg.onload = function() { cursorLoaded = true; };
    cursorImg.onerror = function() {
      console.warn('[caretaker-renderer] Failed to load cursor SVG');
    };
  }

  function onCommand(action, params) {
    lastCommandTime = Date.now();
    var tx, ty;
    switch (action) {
      case 'place_food':
        attentionTargetX = params.x;
        attentionTargetY = params.y;
        activeEffects.push({ type: 'ripple', x: params.x, y: params.y, startTime: Date.now() });
        highlightToolbar('feed');
        break;
      case 'touch':
        tx = params.x !== undefined ? params.x : fly.x;
        ty = params.y !== undefined ? params.y : fly.y;
        attentionTargetX = tx;
        attentionTargetY = ty;
        activeEffects.push({ type: 'ring', x: tx, y: ty, startTime: Date.now() });
        highlightToolbar('touch');
        break;
      case 'blow_wind':
        attentionTargetX = fly.x;
        attentionTargetY = fly.y;
        activeEffects.push({ type: 'arrow', x: fly.x, y: fly.y, startTime: Date.now(), params: { strength: params.strength || 0.5, direction: params.direction || 0 } });
        highlightToolbar('air');
        break;
      case 'set_light':
        highlightToolbar('light');
        attentionTargetX = fly.x;
        attentionTargetY = fly.y;
        break;
      case 'set_temp':
        highlightToolbar('temp');
        attentionTargetX = fly.x;
        attentionTargetY = fly.y;
        break;
      case 'clear_food':
        highlightToolbar('feed');
        attentionTargetX = fly.x;
        attentionTargetY = fly.y;
        break;
      default:
        attentionTargetX = fly.x;
        attentionTargetY = fly.y;
        break;
    }
    if (attentionX < 0) {
      attentionX = attentionTargetX;
      attentionY = attentionTargetY;
    }
  }

  function setConnected(isConnected) {
    caretakerConnected = isConnected;
    if (isConnected) {
      if (idleStart === 0) idleStart = Date.now();
      // Default attention to fly position so cursor is visible immediately
      if (attentionX < 0 && typeof fly !== 'undefined') {
        attentionX = fly.x;
        attentionY = fly.y;
        attentionTargetX = fly.x;
        attentionTargetY = fly.y;
      }
    } else {
      attentionX = -1;
      attentionY = -1;
      trail = [];
      activeEffects = [];
      idlePulseX = -1;
      idlePulseY = -1;
    }
  }

  function highlightToolbar(toolName) {
    var btn = document.querySelector('.tool-btn[data-tool="' + toolName + '"]');
    if (btn === null) return;
    btn.classList.add('claude-highlight');
    setTimeout(function() { btn.classList.remove('claude-highlight'); }, 1500);
  }

  function update(dt) {
    if (!caretakerConnected) return;
    // Only show cursor when Claude recently acted (within 3s of a command)
    var idleTime = Date.now() - lastCommandTime;
    if (lastCommandTime === 0 || idleTime > 3000) {
      if (lastCommandTime > 0 && attentionX >= 0) {
        idlePulseX = attentionX;
        idlePulseY = attentionY;
      }
      attentionX = -1;
      attentionY = -1;
      trail = [];
      return;
    }
    idlePulseX = -1;
    idlePulseY = -1;
    if (attentionX < 0) return;
    var lerpSpeed = 0.08;
    attentionX += (attentionTargetX - attentionX) * lerpSpeed;
    attentionY += (attentionTargetY - attentionY) * lerpSpeed;
    if (Math.abs(attentionX - attentionTargetX) < 0.5 && Math.abs(attentionY - attentionTargetY) < 0.5) {
      attentionX = attentionTargetX;
      attentionY = attentionTargetY;
    }
    if (trail.length === 0 || Math.hypot(attentionX - trail[trail.length - 1].x, attentionY - trail[trail.length - 1].y) > 3) {
      trail.push({ x: attentionX, y: attentionY, time: Date.now() });
    }
    while (trail.length > 0 && Date.now() - trail[0].time > TRAIL_LIFETIME) trail.shift();
    while (trail.length > TRAIL_MAX) trail.shift();
    var i, elapsed;
    for (i = activeEffects.length - 1; i >= 0; i--) {
      elapsed = Date.now() - activeEffects[i].startTime;
      if (activeEffects[i].type === 'ripple' && elapsed > 800) { activeEffects.splice(i, 1); }
      else if (activeEffects[i].type === 'ring' && elapsed > 600) { activeEffects.splice(i, 1); }
      else if (activeEffects[i].type === 'arrow' && elapsed > 1200) { activeEffects.splice(i, 1); }
    }
  }

  function drawOverlay(ctx) {
    if (!caretakerConnected) return;
    drawEffects(ctx);
    if (attentionX >= 0) {
      drawTrail(ctx);
      drawCursor(ctx);
    }
    drawIdlePulse(ctx);
  }

  function drawTrail(ctx) {
    if (trail.length < 2) return;
    var now = Date.now();
    var i, age, alpha;
    for (i = 1; i < trail.length; i++) {
      age = now - trail[i].time;
      alpha = (1 - age / TRAIL_LIFETIME) * 0.25;
      if (alpha <= 0) continue;
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.strokeStyle = CLAUDE_ORANGE + alpha.toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  function drawCursor(ctx) {
    if (attentionX < 0) return;
    if (cursorLoaded) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(cursorImg, attentionX - CURSOR_SIZE / 2, attentionY - CURSOR_SIZE / 2, CURSOR_SIZE, CURSOR_SIZE);
      ctx.globalAlpha = 1.0;
    } else {
      ctx.beginPath();
      ctx.moveTo(attentionX, attentionY - 8);
      ctx.lineTo(attentionX + 6, attentionY);
      ctx.lineTo(attentionX, attentionY + 8);
      ctx.lineTo(attentionX - 6, attentionY);
      ctx.closePath();
      ctx.fillStyle = CLAUDE_ORANGE + '0.85)';
      ctx.fill();
    }
  }

  function drawEffects(ctx) {
    var now = Date.now();
    var i, e, elapsed, p, p1, r1, a1, p2, r2, a2, r, a, angle, len, ex, ey, headLen;
    for (i = 0; i < activeEffects.length; i++) {
      e = activeEffects[i];
      elapsed = now - e.startTime;
      if (e.type === 'ripple') {
        p1 = elapsed / 800;
        r1 = p1 * 35;
        a1 = (1 - p1) * 0.6;
        if (p1 <= 1) {
          ctx.beginPath();
          ctx.arc(e.x, e.y, r1, 0, Math.PI * 2);
          ctx.strokeStyle = CLAUDE_ORANGE + a1.toFixed(3) + ')';
          ctx.lineWidth = 2 * (1 - p1);
          ctx.stroke();
        }
        p2 = Math.max(0, (elapsed - 200)) / 800;
        r2 = p2 * 35;
        a2 = (1 - p2) * 0.4;
        if (p2 > 0 && p2 <= 1) {
          ctx.beginPath();
          ctx.arc(e.x, e.y, r2, 0, Math.PI * 2);
          ctx.strokeStyle = CLAUDE_ORANGE + a2.toFixed(3) + ')';
          ctx.lineWidth = 2 * (1 - p2);
          ctx.stroke();
        }
      } else if (e.type === 'ring') {
        p = elapsed / 600;
        r = 8 + p * 20;
        a = (1 - p) * 0.7;
        ctx.beginPath();
        ctx.arc(e.x, e.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = CLAUDE_ORANGE + a.toFixed(3) + ')';
        ctx.lineWidth = 2.5 * (1 - p);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(e.x, e.y, 6 * (1 - p), 0, Math.PI * 2);
        ctx.fillStyle = CLAUDE_ORANGE + (a * 0.3).toFixed(3) + ')';
        ctx.fill();
      } else if (e.type === 'arrow') {
        p = elapsed / 1200;
        angle = e.params.direction;
        len = 40 * e.params.strength;
        ex = e.x + Math.cos(angle) * len;
        ey = e.y + Math.sin(angle) * len;
        a = (1 - p) * 0.6;
        ctx.beginPath();
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = CLAUDE_ORANGE + a.toFixed(3) + ')';
        ctx.lineWidth = 2.5;
        ctx.stroke();
        headLen = 8;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(angle - 0.4) * headLen, ey - Math.sin(angle - 0.4) * headLen);
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex - Math.cos(angle + 0.4) * headLen, ey - Math.sin(angle + 0.4) * headLen);
        ctx.strokeStyle = CLAUDE_ORANGE + a.toFixed(3) + ')';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }
  }

  function drawIdlePulse(ctx) {
    if (idlePulseX < 0) return;
    var t = (Date.now() % 1500) / 1500;
    var beat = 0;
    if (t < 0.15) {
      beat = Math.sin(t / 0.15 * Math.PI);
    } else if (t < 0.3) {
      beat = 0;
    } else if (t < 0.45) {
      beat = Math.sin((t - 0.3) / 0.15 * Math.PI) * 0.6;
    } else {
      beat = 0;
    }
    if (beat > 0) {
      var pulseRadius = CURSOR_SIZE / 2 + 4 + beat * 6;
      var pulseAlpha = beat * 0.25;
      ctx.beginPath();
      ctx.arc(idlePulseX, idlePulseY, pulseRadius, 0, Math.PI * 2);
      ctx.strokeStyle = CLAUDE_ORANGE + pulseAlpha.toFixed(3) + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  init();

  window.CaretakerRenderer = {
    onCommand: onCommand,
    setConnected: setConnected,
    update: update,
    drawOverlay: drawOverlay
  };
})();
