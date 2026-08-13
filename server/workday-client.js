// Workday MCP client for the Fly @ Work integration.
// Two modes: 'mock' (default, no network, canned request IDs) and 'live'
// (JSON-RPC 2.0 tools/call against the Workday Agent Gateway MCP endpoint).
// callTool never throws; failures come back as { ok: false, detail }.

var mockCounter = 0;

function createClient(opts) {
  opts = opts || {};
  var mode = opts.mode === 'live' ? 'live' : 'mock';
  var url = opts.url || 'https://us.agent.workday.com/mcp';
  var token = opts.token || '';
  var timeoutMs = opts.timeoutMs || 15000;

  function callToolMock(name, args) {
    mockCounter++;
    // Reads like a real Workday request reference; 'mock' stays internal
    var requestId = 'REQ-' + String(1000 + mockCounter) + '-' +
      Math.floor(Math.random() * 46656).toString(36).toUpperCase();
    return Promise.resolve({ ok: true, requestId: requestId, detail: 'mock', raw: null });
  }

  function callToolLive(name, args) {
    if (token === '') {
      return Promise.resolve({ ok: false, requestId: null,
        detail: 'WORKDAY_TOKEN not set', raw: null });
    }
    var controller = new AbortController();
    var timer = setTimeout(function() { controller.abort(); }, timeoutMs);
    var body = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: { name: name, arguments: args }
    };
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(body),
      signal: controller.signal
    }).then(function(res) {
      return res.text().then(function(text) {
        var parsed = null;
        try { parsed = JSON.parse(text); } catch (e) {}
        if (!res.ok) {
          return { ok: false, requestId: null,
            detail: 'HTTP ' + res.status + (res.status === 401 ? ' (token expired? tokens last 60 min)' : ''),
            raw: parsed || text };
        }
        if (parsed && parsed.error) {
          return { ok: false, requestId: null,
            detail: 'MCP error: ' + (parsed.error.message || JSON.stringify(parsed.error)),
            raw: parsed };
        }
        var requestId = null;
        if (parsed && parsed.result) {
          // Best effort: surface an id from the tool result if one exists
          var r = parsed.result;
          if (r.structuredContent && r.structuredContent.id) requestId = r.structuredContent.id;
          else if (r.id) requestId = r.id;
        }
        return { ok: true, requestId: requestId || 'WD-' + body.id, detail: 'submitted', raw: parsed };
      });
    }).catch(function(err) {
      var detail = err && err.name === 'AbortError'
        ? 'timeout after ' + timeoutMs + 'ms' : String(err && err.message || err);
      return { ok: false, requestId: null, detail: detail, raw: null };
    }).finally(function() {
      clearTimeout(timer);
    });
  }

  return {
    getMode: function() { return mode; },
    callTool: function(name, args) {
      if (mode === 'mock') return callToolMock(name, args);
      return callToolLive(name, args);
    }
  };
}

module.exports = { createClient: createClient };
