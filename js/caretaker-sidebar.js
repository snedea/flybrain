(function() {
  var feedList = null;
  var sidebar = null;
  var userScrolled = false;
  var chatHistory = null;
  var chatInput = null;
  var chatSendBtn = null;
  var chatLoading = false;
  var CHAT_API_URL = 'http://' + (location.hostname || 'localhost') + ':7600';

  var iconMap = {
    place_food: 'F',
    clear_food: 'X',
    set_light: 'L',
    set_temp: 'T',
    touch: 'H',
    blow_wind: 'W'
  };

  function init() {
    feedList = document.getElementById('activity-feed-list');
    sidebar = document.getElementById('caretaker-sidebar');
    if (feedList === null) return;

    feedList.addEventListener('click', function(e) {
      var entry = e.target.closest('.activity-entry');
      if (entry) {
        var expanded = entry.getAttribute('data-expanded') === 'true';
        entry.setAttribute('data-expanded', expanded ? 'false' : 'true');
        if (expanded) {
          entry.classList.remove('expanded');
        } else {
          entry.classList.add('expanded');
        }
      }
    });

    feedList.addEventListener('scroll', function() {
      if (feedList.scrollTop > 20) {
        userScrolled = true;
      } else if (feedList.scrollTop <= 5) {
        userScrolled = false;
      }
    });

    chatHistory = document.getElementById('chat-history');
    chatInput = document.getElementById('chat-input');
    chatSendBtn = document.getElementById('chat-send-btn');

    if (chatSendBtn) {
      chatSendBtn.addEventListener('click', sendChatMessage);
    }
    if (chatInput) {
      chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage();
        }
      });
    }

    loadChatHistory();
    initSheetGestures();
    initTabs();
  }

  function formatTime(isoString) {
    var d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function getColorClass(kind, action, severity) {
    if (kind === 'incident' && severity === 'high') return 'incident';
    if (kind === 'incident') return 'warning';
    if (action === 'place_food' || action === 'clear_food') return 'feed';
    if (action === 'set_light' || action === 'set_temp') return 'comfort';
    return 'neutral';
  }

  function getIcon(kind, action) {
    if (kind === 'incident') return '!';
    return iconMap[action] || '*';
  }

  function buildDescription(kind, action, params, reasoning) {
    if (kind === 'incident') return reasoning;
    var p;
    try {
      p = typeof params === 'string' ? JSON.parse(params) : (params || {});
    } catch (e) {
      return action;
    }
    switch (action) {
      case 'place_food':
        return 'Placed food at (' + Math.round(p.x) + ', ' + Math.round(p.y) + ')';
      case 'clear_food':
        return 'Cleared all food';
      case 'set_light':
        return 'Set light to ' + (p.level || 'unknown');
      case 'set_temp':
        return 'Set temp to ' + (p.level || 'unknown');
      case 'touch':
        return 'Touched fly at (' + Math.round(p.x || 0) + ', ' + Math.round(p.y || 0) + ')';
      case 'blow_wind':
        return 'Blew wind (strength ' + (p.strength || 0.5).toFixed(1) + ')';
      default:
        return action;
    }
  }

  function createEntryEl(kind, action, params, reasoning, severity, timestamp) {
    var colorClass = getColorClass(kind, action, severity);
    var icon = getIcon(kind, action);
    var desc = buildDescription(kind, action, params, reasoning);
    var time = formatTime(timestamp);
    var el = document.createElement('div');
    el.className = 'activity-entry activity-' + colorClass;
    el.setAttribute('data-expanded', 'false');
    var reasoningText = kind === 'incident' ? '' : (reasoning || '');
    el.innerHTML =
      '<div class="activity-entry-header">' +
        '<span class="activity-icon">' + icon + '</span>' +
        '<span class="activity-time">' + time + '</span>' +
        '<span class="activity-desc">' + desc + '</span>' +
      '</div>' +
      (reasoningText ? '<div class="activity-entry-detail">' + reasoningText + '</div>' : '');
    return el;
  }

  function addEntry(kind, action, params, reasoning, severity, timestamp) {
    if (feedList === null) return;
    var el = createEntryEl(kind, action, params, reasoning, severity, timestamp);
    feedList.insertBefore(el, feedList.firstChild);
    if (feedList.children.length > 200) {
      feedList.removeChild(feedList.lastChild);
    }
    if (!userScrolled) {
      feedList.scrollTop = 0;
    }
  }

  function onAction(msg) {
    addEntry('action', msg.action, msg.params, msg.reasoning, null, msg.timestamp);
  }

  function onIncident(msg) {
    addEntry('incident', msg.incidentType, null, msg.description, msg.severity, msg.timestamp);
  }

  function onHistory(msg) {
    if (feedList === null) return;
    feedList.innerHTML = '';
    for (var i = 0; i < msg.entries.length; i++) {
      var e = msg.entries[i];
      var el;
      if (e.kind === 'action') {
        el = createEntryEl('action', e.name, e.params, e.reasoning, null, e.timestamp);
      } else if (e.kind === 'incident') {
        el = createEntryEl('incident', e.name, null, e.reasoning, null, e.timestamp);
      }
      if (el) feedList.appendChild(el);
    }
    feedList.scrollTop = 0;
  }

  // Bottom sheet states: closed -> peek -> full -> closed
  var sheetState = 'closed'; // closed, peek, full
  var dragStartY = 0;
  var dragStartState = '';
  var isDragging = false;

  function setSheetState(state) {
    if (sidebar === null) return;
    sheetState = state;
    sidebar.classList.remove('sheet-peek', 'sheet-full');
    if (state === 'peek') sidebar.classList.add('sheet-peek');
    else if (state === 'full') sidebar.classList.add('sheet-full');
  }

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function toggle() {
    if (sidebar === null) return false;
    if (isMobile()) {
      // Mobile: closed -> peek -> full -> closed
      if (sheetState === 'closed') setSheetState('peek');
      else if (sheetState === 'peek') setSheetState('full');
      else setSheetState('closed');
    } else {
      // Desktop: closed <-> full (no peek)
      if (sheetState === 'closed') setSheetState('full');
      else setSheetState('closed');
    }
    return sheetState !== 'closed';
  }

  function isOpen() {
    return sheetState !== 'closed';
  }

  function initSheetGestures() {
    var handle = document.getElementById('sheet-handle');
    if (!handle) return;

    function onStart(y) {
      isDragging = true;
      dragStartY = y;
      dragStartState = sheetState;
      sidebar.style.transition = 'none';
    }

    function onEnd(y) {
      if (!isDragging) return;
      isDragging = false;
      sidebar.style.transition = '';
      var dy = y - dragStartY;

      if (dragStartState === 'peek') {
        if (dy < -60) setSheetState('full');
        else if (dy > 60) setSheetState('closed');
        else setSheetState('peek');
      } else if (dragStartState === 'full') {
        if (dy > 100) setSheetState('closed');
        else if (dy > 40) setSheetState('peek');
        else setSheetState('full');
      } else {
        if (dy < -40) setSheetState('peek');
        else setSheetState('closed');
      }
    }

    // Mouse
    handle.addEventListener('mousedown', function(e) { onStart(e.clientY); });
    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      e.preventDefault();
    });
    document.addEventListener('mouseup', function(e) { onEnd(e.clientY); });

    // Touch
    handle.addEventListener('touchstart', function(e) {
      onStart(e.touches[0].clientY);
    }, { passive: true });
    handle.addEventListener('touchend', function(e) {
      onEnd(e.changedTouches[0].clientY);
    }, { passive: true });

    // Close button
    var closeBtn = document.getElementById('caretaker-sidebar-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', function() { setSheetState('closed'); });
    }
  }

  function initTabs() {
    var tabContainer = document.getElementById('sidebar-tabs');
    if (!tabContainer) return;

    tabContainer.addEventListener('click', function(e) {
      var btn = e.target.closest('.sidebar-tab');
      if (!btn) return;
      var tabName = btn.getAttribute('data-tab');
      if (!tabName) return;

      // Update tab buttons
      var tabs = tabContainer.querySelectorAll('.sidebar-tab');
      for (var i = 0; i < tabs.length; i++) {
        tabs[i].classList.remove('active');
      }
      btn.classList.add('active');

      // Update tab content panels
      var panels = sidebar.querySelectorAll('.sidebar-tab-content');
      for (var j = 0; j < panels.length; j++) {
        panels[j].classList.remove('active');
      }
      var target = sidebar.querySelector('[data-tab-content="' + tabName + '"]');
      if (target) target.classList.add('active');

      if (tabName === 'analytics' && typeof CaretakerAnalytics !== 'undefined') {
        CaretakerAnalytics.activate();
      }
      if (tabName === 'calendar' && typeof CaretakerCalendar !== 'undefined') {
        CaretakerCalendar.activate();
      }

      // Update header title
      var title = sidebar.querySelector('.caretaker-sidebar-title');
      if (title) {
        title.textContent = btn.textContent;
      }
    });
  }

  function formatChatTime(isoString) {
    var d = new Date(isoString);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function escapeHtml(str) {
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function appendChatMessage(role, message, timestamp, isError) {
    if (chatHistory === null) return;
    var el = document.createElement('div');
    el.className = 'chat-msg chat-msg-' + (isError ? 'error' : role);
    el.innerHTML = '<div class="chat-msg-time">' + (role === 'user' ? 'You' : 'Claude') + ' -- ' + formatChatTime(timestamp) + '</div>' + '<div>' + escapeHtml(message) + '</div>';
    chatHistory.appendChild(el);
    chatHistory.scrollTop = chatHistory.scrollHeight;
  }

  function sendChatMessage() {
    if (chatInput === null || chatLoading === true) return;
    var msg = chatInput.value.trim();
    if (msg === '') return;
    chatInput.value = '';
    appendChatMessage('user', msg, new Date().toISOString(), false);
    chatLoading = true;
    chatSendBtn.disabled = true;
    var loadingEl = document.createElement('div');
    loadingEl.className = 'chat-loading';
    loadingEl.textContent = 'Thinking';
    chatHistory.appendChild(loadingEl);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    var body = JSON.stringify({ message: msg, context: null });
    fetch(CHAT_API_URL + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })
      .then(function(res) { return res.json(); })
      .then(function(data) {
        if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
        if (data.error) {
          appendChatMessage('assistant', data.error, new Date().toISOString(), true);
        } else {
          appendChatMessage('assistant', data.message, data.timestamp, false);
        }
        chatLoading = false;
        chatSendBtn.disabled = false;
        chatInput.focus();
      })
      .catch(function(err) {
        if (loadingEl.parentNode) loadingEl.parentNode.removeChild(loadingEl);
        appendChatMessage('assistant', 'Connection error: ' + err.message, new Date().toISOString(), true);
        chatLoading = false;
        chatSendBtn.disabled = false;
      });
  }

  function loadChatHistory() {
    if (chatHistory === null) return;
    fetch(CHAT_API_URL + '/chat/history')
      .then(function(res) { return res.json(); })
      .then(function(messages) {
        chatHistory.innerHTML = '';
        for (var i = 0; i < messages.length; i++) {
          appendChatMessage(messages[i].role, messages[i].message, messages[i].timestamp, false);
        }
      })
      .catch(function(err) {
        console.warn('[chat] Failed to load history:', err.message);
      });
  }

  init();

  window.CaretakerSidebar = {
    init: init,
    onAction: onAction,
    onIncident: onIncident,
    onHistory: onHistory,
    toggle: toggle,
    isOpen: isOpen,
    loadChatHistory: loadChatHistory
  };
})();
