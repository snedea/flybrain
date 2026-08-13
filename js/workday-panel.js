// Fly @ Work panel: renders the fly's Workday actions in the sidebar.
// Event-driven only (fed by caretaker-bridge WS messages); no timers.
(function() {
  var MAX_ENTRIES = 50;
  var mode = null;

  function feedEl() { return document.getElementById('workday-feed'); }

  // Live counts per intent (submitted requests seen this session/history)
  var counts = { meal_voucher: 0, pto_request: 0, career_goal: 0, kudos: 0, safety_concern: 0 };

  function resetCounts() {
    for (var k in counts) counts[k] = 0;
  }

  function tally(entry) {
    if (entry && entry.status === 'submitted' && counts.hasOwnProperty(entry.intent)) {
      counts[entry.intent]++;
    }
  }

  function renderCounts() {
    for (var k in counts) {
      var el = document.getElementById('wd-stat-' + k);
      if (el) el.textContent = String(counts[k]);
    }
  }
  function modeEl() { return document.getElementById('workday-mode'); }

  function setMode(newMode) {
    if (!newMode || newMode === mode) return;
    mode = newMode;
    var el = modeEl();
    if (!el) return;
    el.textContent = mode === 'live' ? 'LIVE' : 'DEMO';
    el.className = 'workday-pill ' + (mode === 'live' ? 'workday-pill-live' : 'workday-pill-mock');
  }

  // Hover explainer for the Workday tool behind each entry
  var TOOL_EXPLAINERS = {
    create_compensation_workers_requestOneTimePayment: {
      endpoint: 'POST /compensation/workers/{id}/requestOneTimePayment',
      desc: 'Compensation REST API. Starts the Request One-Time Payment business process (the meal voucher). Called through the Workday Agent Gateway.'
    },
    create_absenceManagement_workers_requestTimeOff: {
      endpoint: 'POST /absenceManagement/workers/{id}/requestTimeOff',
      desc: 'Absence Management REST API. Starts the Request Time Off business process (PTO). Called through the Workday Agent Gateway.'
    },
    create_performanceEnablement_workerGoalEvents: {
      endpoint: 'POST /performanceEnablement/workerGoalEvents',
      desc: 'Performance Enablement REST API. Creates a development goal on the worker profile. Called through the Workday Agent Gateway.'
    },
    create_performanceEnablement_workers_anytimeFeedbackEvents: {
      endpoint: 'POST /performanceEnablement/workers/{id}/anytimeFeedbackEvents',
      desc: 'Performance Enablement REST API. Delivers Anytime Feedback (kudos or a concern). Called through the Workday Agent Gateway.'
    },
    claude_resolution: {
      endpoint: null,
      desc: 'Not a Workday API call. This is Claude\'s HR Partner review step: it reviews the request Buzz filed, approves or denies it, and triggers any enclosure delivery (food drop, dimmed lights).'
    }
  };

  function toolExplainer(tool) {
    return TOOL_EXPLAINERS[tool] ||
      { endpoint: null, desc: 'Workday REST endpoint, called through the Workday Agent Gateway.' };
  }

  // One shared popup showing what the tool is and the actual API exchange
  var toolPop = null;

  var hideTimer = null;

  function cancelHide() {
    if (hideTimer !== null) { clearTimeout(hideTimer); hideTimer = null; }
  }

  function scheduleHide() {
    cancelHide();
    hideTimer = setTimeout(hideToolPop, 250);
  }

  function getToolPop() {
    if (toolPop) return toolPop;
    toolPop = document.createElement('div');
    toolPop.className = 'wd-tool-pop';
    toolPop.style.display = 'none';
    // Body-level flyout: escapes the narrow panel into the canvas area
    document.body.appendChild(toolPop);
    toolPop.addEventListener('mouseenter', cancelHide);
    toolPop.addEventListener('mouseleave', scheduleHide);
    return toolPop;
  }

  function entryArgs(entry) {
    if (entry.args && typeof entry.args === 'object') return entry.args;
    if (typeof entry.args === 'string') {
      try { return JSON.parse(entry.args); } catch (e) { return null; }
    }
    return null;
  }

  function popBlock(label, mono) {
    var block = document.createElement('div');
    block.className = 'wd-tool-pop-block';
    var lab = document.createElement('div');
    lab.className = 'wd-tool-pop-label';
    lab.textContent = label;
    block.appendChild(lab);
    var pre = document.createElement('pre');
    pre.textContent = mono;
    block.appendChild(pre);
    return block;
  }

  function showToolPop(anchor, entry) {
    var pop = getToolPop();
    while (pop.firstChild) pop.removeChild(pop.firstChild);

    var explainer = toolExplainer(entry.tool);

    var title = document.createElement('div');
    title.className = 'wd-tool-pop-title';
    title.textContent = entry.tool;
    pop.appendChild(title);

    var desc = document.createElement('div');
    desc.className = 'wd-tool-pop-desc';
    desc.textContent = explainer.desc;
    pop.appendChild(desc);

    if (explainer.endpoint) {
      pop.appendChild(popBlock('Endpoint', explainer.endpoint));
    }

    var args = entryArgs(entry);
    if (args && Object.keys(args).length > 0) {
      pop.appendChild(popBlock('Request body', JSON.stringify(args, null, 2)));
    }

    var requestId = entry.requestId || entry.request_id;
    pop.appendChild(popBlock('Result', JSON.stringify({ ok: entry.status !== 'failed', status: entry.status, requestId: requestId || null }, null, 2)));

    // Flyout to the right of the panel, aligned with the hovered entry.
    // On narrow screens (bottom-sheet layout) center over the enclosure.
    pop.style.display = 'block';
    var a = anchor.getBoundingClientRect();
    var topBound = 52;
    var bottomBound = window.innerHeight - 8;
    var panel = document.getElementById('left-panel');
    if (panel && panel.offsetHeight) bottomBound = window.innerHeight - panel.offsetHeight - 8;

    if (window.innerWidth <= 768) {
      pop.style.left = '5vw';
      pop.style.width = '90vw';
    } else {
      var sidebar = document.getElementById('caretaker-sidebar');
      var left = sidebar ? sidebar.getBoundingClientRect().right + 10 : 340;
      pop.style.left = left + 'px';
      pop.style.width = Math.min(520, window.innerWidth - left - 16) + 'px';
    }
    pop.style.maxHeight = (bottomBound - topBound) + 'px';
    var top = Math.max(topBound, Math.min(a.top, bottomBound - pop.offsetHeight));
    pop.style.top = top + 'px';
  }

  function hideToolPop() {
    if (toolPop) toolPop.style.display = 'none';
  }

  function attachToolPopup(anchor, entry) {
    anchor.addEventListener('mouseenter', function() { cancelHide(); showToolPop(anchor, entry); });
    anchor.addEventListener('mouseleave', scheduleHide);
    anchor.addEventListener('click', function(e) {
      e.stopPropagation();
      cancelHide();
      if (toolPop && toolPop.style.display === 'block') hideToolPop();
      else showToolPop(anchor, entry);
    });
  }

  function formatTime(ts) {
    try {
      var d = new Date(ts);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) { return ''; }
  }

  function getSnapshot(entry) {
    if (entry.snapshot && entry.snapshot.drives) return entry.snapshot;
    if (entry.state_snapshot) {
      try { return JSON.parse(entry.state_snapshot); } catch (e) { return null; }
    }
    return null;
  }

  function formatObserved(snapshot) {
    if (!snapshot || !snapshot.drives) return '';
    var d = snapshot.drives;
    var parts = [];
    if (d.hunger != null) parts.push('hunger ' + d.hunger.toFixed(2));
    if (d.fatigue != null) parts.push('fatigue ' + d.fatigue.toFixed(2));
    if (d.fear != null) parts.push('fear ' + d.fear.toFixed(2));
    if (d.curiosity != null) parts.push('curiosity ' + d.curiosity.toFixed(2));
    var behavior = typeof snapshot.behavior === 'string' ? snapshot.behavior : null;
    return 'Observed: ' + parts.join(', ') + (behavior ? ' | behavior: ' + behavior : '');
  }

  function renderEntry(entry) {
    var fulfilled = entry.status === 'fulfilled';
    var denied = entry.status === 'denied';
    var submitted = entry.status === 'submitted';
    var div = document.createElement('div');
    div.className = 'workday-entry' +
      (fulfilled ? ' workday-entry-fulfilled' : '') +
      (denied ? ' workday-entry-denied' : '');

    var actor = document.createElement('div');
    actor.className = 'workday-entry-actor';
    actor.textContent = submitted ? 'BUZZ, THE FLY\'S AGENT' : 'CLAUDE, HR PARTNER';
    div.appendChild(actor);

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
    } else if (denied) {
      status.className = 'workday-pill workday-pill-fail';
      status.textContent = 'DENIED';
    } else if (submitted) {
      status.className = 'workday-pill workday-pill-ok';
      status.textContent = 'SUBMITTED';
    } else {
      status.className = 'workday-pill workday-pill-fail';
      status.textContent = 'FAILED';
    }
    head.appendChild(status);
    div.appendChild(head);

    // The fly's only communication medium is behavior; show what the
    // agent observed before it interpreted the request.
    if (submitted) {
      var observedText = formatObserved(getSnapshot(entry));
      if (observedText !== '') {
        var observed = document.createElement('div');
        observed.className = 'workday-entry-observed';
        observed.textContent = observedText;
        div.appendChild(observed);
      }
    }

    var reasoning = document.createElement('div');
    reasoning.className = 'workday-entry-reasoning';
    reasoning.textContent = entry.reasoning || '';
    div.appendChild(reasoning);

    var meta = document.createElement('div');
    meta.className = 'workday-entry-meta';

    var timeSpan = document.createElement('span');
    timeSpan.className = 'wd-meta-time';
    timeSpan.textContent = formatTime(entry.timestamp);
    meta.appendChild(timeSpan);

    var requestId = entry.requestId || entry.request_id;
    if (requestId) {
      meta.appendChild(document.createTextNode(' | '));
      var refSpan = document.createElement('span');
      refSpan.className = 'wd-meta-ref';
      refSpan.textContent = requestId;
      meta.appendChild(refSpan);
    }

    if (entry.tool) {
      meta.appendChild(document.createTextNode(' | '));
      var toolSpan = document.createElement('span');
      toolSpan.className = 'wd-meta-tool';
      toolSpan.textContent = entry.tool;
      attachToolPopup(toolSpan, entry);
      meta.appendChild(toolSpan);
    }
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
    if (msg.entry) {
      prependEntry(msg.entry);
      tally(msg.entry);
      renderCounts();
    }
  }

  function onHistory(msg) {
    setMode(msg.mode);
    var el = feedEl();
    if (!el) return;
    el.innerHTML = '';
    resetCounts();
    var entries = msg.entries || [];
    for (var t = 0; t < entries.length; t++) tally(entries[t]);
    renderCounts();
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
