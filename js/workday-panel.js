// Fly @ Work panel: renders the fly's Workday actions in the sidebar.
// Event-driven only (fed by caretaker-bridge WS messages); no timers.
(function() {
  var MAX_ENTRIES = 50;
  var mode = null;

  function feedEl() { return document.getElementById('workday-feed'); }
  function modeEl() { return document.getElementById('workday-mode'); }

  function setMode(newMode) {
    if (!newMode || newMode === mode) return;
    mode = newMode;
    var el = modeEl();
    if (!el) return;
    el.textContent = mode === 'live' ? 'LIVE TENANT' : 'MOCK MODE';
    el.className = 'workday-pill ' + (mode === 'live' ? 'workday-pill-live' : 'workday-pill-mock');
  }

  function formatTime(ts) {
    try {
      var d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function renderEntry(entry) {
    var fulfilled = entry.status === 'fulfilled';
    var div = document.createElement('div');
    div.className = 'workday-entry' + (fulfilled ? ' workday-entry-fulfilled' : '');

    var head = document.createElement('div');
    head.className = 'workday-entry-head';

    var summary = document.createElement('span');
    summary.className = 'workday-entry-summary';
    summary.textContent = entry.summary || entry.intent || 'Workday action';
    head.appendChild(summary);

    var status = document.createElement('span');
    if (fulfilled) {
      status.className = 'workday-pill workday-pill-fulfilled';
      status.textContent = 'APPROVED';
    } else if (entry.status === 'submitted') {
      status.className = 'workday-pill workday-pill-ok';
      status.textContent = 'SUBMITTED';
    } else {
      status.className = 'workday-pill workday-pill-fail';
      status.textContent = 'FAILED';
    }
    head.appendChild(status);
    div.appendChild(head);

    var reasoning = document.createElement('div');
    reasoning.className = 'workday-entry-reasoning';
    reasoning.textContent = entry.reasoning || '';
    div.appendChild(reasoning);

    var meta = document.createElement('div');
    meta.className = 'workday-entry-meta';
    var requestId = entry.requestId || entry.request_id;
    meta.textContent = formatTime(entry.timestamp) +
      (requestId ? ' | ' + requestId : '') +
      (entry.tool ? ' | ' + entry.tool : '');
    div.appendChild(meta);

    return div;
  }

  function prependEntry(entry) {
    var el = feedEl();
    if (!el) return;
    var empty = el.querySelector('.workday-empty');
    if (empty) el.removeChild(empty);
    el.insertBefore(renderEntry(entry), el.firstChild);
    while (el.children.length > MAX_ENTRIES) {
      el.removeChild(el.lastChild);
    }
  }

  function onAction(msg) {
    setMode(msg.mode);
    if (msg.entry) prependEntry(msg.entry);
  }

  function onHistory(msg) {
    setMode(msg.mode);
    var el = feedEl();
    if (!el) return;
    el.innerHTML = '';
    var entries = msg.entries || [];
    if (entries.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'workday-empty';
      empty.textContent = 'Inbox zero. The fly is either well cared for or between crises.';
      el.appendChild(empty);
      return;
    }
    // History arrives newest first; append in order so newest stays on top.
    for (var i = 0; i < entries.length && i < MAX_ENTRIES; i++) {
      el.appendChild(renderEntry(entries[i]));
    }
  }

  window.WorkdayPanel = { onAction: onAction, onHistory: onHistory };
})();
