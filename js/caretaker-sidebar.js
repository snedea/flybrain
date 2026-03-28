(function() {
  var feedList = null;
  var sidebar = null;
  var userScrolled = false;

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

  function toggle() {
    if (sidebar === null) return false;
    sidebar.classList.toggle('sidebar-open');
    return sidebar.classList.contains('sidebar-open');
  }

  function isOpen() {
    return sidebar !== null && sidebar.classList.contains('sidebar-open');
  }

  init();

  window.CaretakerSidebar = {
    init: init,
    onAction: onAction,
    onIncident: onIncident,
    onHistory: onHistory,
    toggle: toggle,
    isOpen: isOpen
  };
})();
