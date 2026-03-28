# Plan: T8.7

Left sidebar -- Chat Box. Add a chat input below the activity feed. User sends questions to Claude with DB context. Chat history persisted in chat_messages table.

## Dependencies
- list: [@anthropic-ai/sdk] (Claude API client for Node.js)
- commands: ["cd /Users/name/homelab/flybrain && npm install @anthropic-ai/sdk"]
- env: ANTHROPIC_API_KEY must be set in the environment before starting the server (add to example.env as placeholder)

## File Operations (in execution order)

### 1. CREATE agent/chat-policy.md
- operation: CREATE
- reason: System prompt for chat mode -- tells Claude how to answer user questions about the fly using DB context

#### Content
The file must contain exactly this system prompt (no frontmatter, just markdown):

```
# Chat Mode -- FlyBrain Caretaker

## Role

You are the AI caretaker for a virtual Drosophila (fruit fly) in the FlyBrain simulation. The user is asking you questions about your caretaking -- why you took certain actions, what the fly needs, how it's doing. You have access to database context injected below.

## How to Answer

- Reference specific timestamps, action names, and drive values from the provided context.
- If the context shows you scared the fly, own it. If you forgot to feed it, explain why.
- Be conversational but data-backed. Quote numbers: "At 14:32:05, hunger was 0.87 and I placed food at (320, 280)."
- If you don't have enough context to answer, say so honestly.
- Keep answers concise -- 2-4 sentences for simple questions, up to a paragraph for complex ones.
- Use the fly's drive values, behavior states, and incident history to support your answers.

## Context Format

You will receive context blocks labeled:
- **Recent Observations**: Last N state snapshots (drives, behavior, position)
- **Recent Actions**: Last N caretaker actions with reasoning
- **Recent Incidents**: Last N incidents (scared_the_fly, forgot_to_feed)
- **User's Current View**: What the user sees in the UI right now (if provided)

## Important

- Do not output JSON. Respond in natural language.
- Do not make up data. Only reference what is in the provided context.
- Current date is injected in the context header -- use it for relative time references.
```

### 2. MODIFY server/db.js
- operation: MODIFY
- reason: Add query methods for chat context (recent observations, actions, incidents) and chat history retrieval
- anchor: `getRecentActivity: function(limit) {`

#### Functions

Add these methods to the returned object from `openDb()`, after the `getRecentActivity` method and before the `computeDailyScore` method.

- signature: `getRecentObservations: function(limit)`
  - purpose: Fetch last N observations with parsed drives/behavior for chat context
  - logic:
    1. If limit is undefined, set limit to 20
    2. Execute SQL: `SELECT timestamp, hunger, fear, fatigue, curiosity, groom, behavior, pos_x, pos_y, food_count, light_level, temperature FROM observations ORDER BY id DESC LIMIT ?` with param limit
    3. Reverse the result array (so entries are in chronological order, oldest first)
    4. Return the reversed array
  - returns: Array of row objects in chronological order (oldest first)

- signature: `getRecentActions: function(limit)`
  - purpose: Fetch last N caretaker actions for chat context
  - logic:
    1. If limit is undefined, set limit to 20
    2. Execute SQL: `SELECT timestamp, action, params, reasoning FROM actions ORDER BY id DESC LIMIT ?` with param limit
    3. Reverse the result array
    4. Return the reversed array
  - returns: Array of row objects in chronological order

- signature: `getRecentIncidents: function(limit)`
  - purpose: Fetch last N incidents for chat context
  - logic:
    1. If limit is undefined, set limit to 20
    2. Execute SQL: `SELECT timestamp, type, severity, description FROM incidents ORDER BY id DESC LIMIT ?` with param limit
    3. Reverse the result array
    4. Return the reversed array
  - returns: Array of row objects in chronological order

- signature: `getChatHistory: function(limit)`
  - purpose: Fetch last N chat messages for conversation history display
  - logic:
    1. If limit is undefined, set limit to 50
    2. Execute SQL: `SELECT id, timestamp, role, message FROM chat_messages ORDER BY id DESC LIMIT ?` with param limit
    3. Reverse the result array
    4. Return the reversed array
  - returns: Array of row objects in chronological order

#### Wiring / Integration
These are added as properties on the object returned by `openDb()`, between line 173 (end of `getRecentActivity`) and line 176 (start of `computeDailyScore`). Each uses `db.prepare(...).all(limit)` pattern consistent with `getRecentActivity`.

### 3. MODIFY server/caretaker.js
- operation: MODIFY
- reason: Add HTTP POST /chat endpoint that queries DB for context, calls Claude API, persists messages, returns response. Also add GET /chat/history endpoint.

#### Imports / Dependencies
At the top of the file (after existing require statements on lines 1-6), add:
```
var Anthropic = require('@anthropic-ai/sdk');
var chatPolicyPath = path.join(__dirname, '..', 'agent', 'chat-policy.md');
var chatPolicyContent = fs.readFileSync(chatPolicyPath, 'utf-8');
var anthropic = new Anthropic();
```

The `Anthropic` constructor reads `ANTHROPIC_API_KEY` from `process.env` automatically.

#### Functions

- signature: `function buildChatContext(userMessage)`
  - purpose: Query DB for recent observations, actions, incidents and format them as a context string for Claude
  - logic:
    1. Get current UTC date string: `new Date().toISOString().slice(0, 19) + 'Z'`
    2. Call `caretakerDb.getRecentObservations(20)` -- store as `observations`
    3. Call `caretakerDb.getRecentActions(20)` -- store as `actions`
    4. Call `caretakerDb.getRecentIncidents(20)` -- store as `incidents`
    5. Build context string by concatenating these sections:
       - `"Current date: " + currentDate + "\n\n"`
       - `"## Recent Observations (last " + observations.length + ")\n\n"` followed by each observation formatted as: `"- " + obs.timestamp + " | behavior=" + obs.behavior + " hunger=" + (obs.hunger != null ? obs.hunger.toFixed(2) : "?") + " fear=" + (obs.fear != null ? obs.fear.toFixed(2) : "?") + " fatigue=" + (obs.fatigue != null ? obs.fatigue.toFixed(2) : "?") + " curiosity=" + (obs.curiosity != null ? obs.curiosity.toFixed(2) : "?") + " food_count=" + obs.food_count + "\n"`
       - `"\n## Recent Actions (last " + actions.length + ")\n\n"` followed by each action formatted as: `"- " + act.timestamp + " | " + act.action + " params=" + act.params + " reason: " + act.reasoning + "\n"`
       - `"\n## Recent Incidents (last " + incidents.length + ")\n\n"` followed by each incident formatted as: `"- " + inc.timestamp + " | " + inc.type + " [" + inc.severity + "] " + inc.description + "\n"`
       - If no entries in a section, write `"(none)\n"`
    6. Return the context string
  - returns: string

- signature: `async function handleChatRequest(userMessage, viewContext)`
  - purpose: Send user message + DB context to Claude API, persist both messages, return assistant response
  - logic:
    1. Build context string by calling `buildChatContext(userMessage)`
    2. Build system prompt: concatenate `chatPolicyContent` + `"\n\n---\n\n"` + context string
    3. If `viewContext` is not null and not undefined, append `"\n\n## User's Current View\n\n" + JSON.stringify(viewContext)` to the system prompt
    4. Call `caretakerDb.getChatHistory(20)` to get recent history
    5. Build `messages` array for the Anthropic API. For each row in history, push `{ role: row.role, content: row.message }`. Then push `{ role: 'user', content: userMessage }`.
    6. Call Claude API: `var response = await anthropic.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 512, system: systemPrompt, messages: messages })`
    7. Extract the assistant text: `var assistantMessage = response.content[0].text`
    8. Get current timestamp: `var ts = new Date().toISOString()`
    9. Call `caretakerDb.insertChatMessage(ts, 'user', userMessage)`
    10. Call `caretakerDb.insertChatMessage(ts, 'assistant', assistantMessage)`
    11. Return object: `{ role: 'assistant', message: assistantMessage, timestamp: ts }`
  - calls: `buildChatContext(userMessage)`, `caretakerDb.getChatHistory(20)`, `anthropic.messages.create(...)`, `caretakerDb.insertChatMessage(...)`
  - returns: `{ role: string, message: string, timestamp: string }`
  - error handling: If the anthropic.messages.create call throws, catch the error and return `{ role: 'assistant', message: 'Sorry, I could not process that question. Error: ' + err.message, timestamp: new Date().toISOString(), error: true }`

#### Wiring / Integration

Modify the HTTP server request handler (the `http.createServer` callback at line 112) to add two new routes before the 404 fallback.

- anchor: `res.writeHead(404);`

The existing server handler currently has:
```javascript
var server = http.createServer(function(req, res) {
  if (req.method === 'GET' && req.url === '/state') {
    ...
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});
```

Replace the section from `res.writeHead(404);` through `res.end('Not found');` with:

```javascript
  if (req.method === 'POST' && req.url === '/chat') {
    var body = '';
    req.on('data', function(chunk) { body += chunk; });
    req.on('end', function() {
      var parsed;
      try { parsed = JSON.parse(body); } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
        return;
      }
      if (!parsed.message || typeof parsed.message !== 'string' || parsed.message.trim() === '') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'message field is required' }));
        return;
      }
      handleChatRequest(parsed.message.trim(), parsed.context || null)
        .then(function(result) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        })
        .catch(function(err) {
          process.stderr.write('[caretaker] chat error: ' + err.message + '\n');
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Internal error' }));
        });
    });
    return;
  }
  if (req.method === 'GET' && req.url === '/chat/history') {
    var history = caretakerDb.getChatHistory(50);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(history));
    return;
  }
  res.writeHead(404);
  res.end('Not found');
```

Also add CORS headers: Modify the `http.createServer` callback to handle OPTIONS preflight and add CORS headers on all responses. At the very start of the callback (before the GET /state check), add:

```javascript
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }
```

Anchor for this insertion: `if (req.method === 'GET' && req.url === '/state') {`

Insert the CORS lines immediately before that `if` statement.

### 4. MODIFY index.html
- operation: MODIFY
- reason: Add chat box HTML below the activity feed inside the caretaker sidebar

- anchor: `<div class="activity-feed" id="activity-feed-list"></div>`

Replace:
```html
        <div class="activity-feed" id="activity-feed-list"></div>
    </div>
```

With:
```html
        <div class="activity-feed" id="activity-feed-list"></div>
        <div class="chat-section" id="chat-section">
            <div class="chat-history" id="chat-history"></div>
            <div class="chat-input-row">
                <input type="text" class="chat-input" id="chat-input" placeholder="Ask about the fly..." autocomplete="off" />
                <button class="chat-send-btn" id="chat-send-btn">Send</button>
            </div>
        </div>
    </div>
```

The `</div>` at the end is the closing `</div>` for `#caretaker-sidebar`.

### 5. MODIFY css/main.css
- operation: MODIFY
- reason: Add chat section styles (chat history area, input row, message bubbles)

- anchor: `.activity-feed::-webkit-scrollbar-thumb:hover {`

Insert the following CSS immediately after the `.activity-feed::-webkit-scrollbar-thumb:hover` rule block (after line 1025, before `.activity-entry {` on line 1028):

```css

.chat-section {
    display: flex;
    flex-direction: column;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
    max-height: 45%;
    min-height: 120px;
}

.chat-history {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
    scrollbar-width: thin;
    scrollbar-color: rgba(136, 146, 164, 0.3) transparent;
    font-size: 0.8rem;
}

.chat-history::-webkit-scrollbar {
    width: 6px;
}

.chat-history::-webkit-scrollbar-track {
    background: transparent;
}

.chat-history::-webkit-scrollbar-thumb {
    background: rgba(136, 146, 164, 0.3);
    border-radius: 3px;
}

.chat-msg {
    padding: 0.35rem 0.5rem;
    border-radius: var(--radius);
    margin-bottom: 0.35rem;
    line-height: 1.4;
    word-wrap: break-word;
}

.chat-msg-user {
    background: var(--accent-subtle);
    color: var(--text);
    text-align: right;
}

.chat-msg-assistant {
    background: rgba(42, 58, 92, 0.4);
    color: var(--text);
}

.chat-msg-error {
    background: rgba(248, 113, 113, 0.15);
    color: var(--error);
}

.chat-msg-time {
    font-size: 0.7rem;
    color: var(--text-muted);
    margin-bottom: 0.15rem;
}

.chat-input-row {
    display: flex;
    gap: 0.35rem;
    padding: 0.5rem;
    border-top: 1px solid var(--border);
    flex-shrink: 0;
}

.chat-input {
    flex: 1;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    color: var(--text);
    padding: 0.4rem 0.6rem;
    font-size: 0.8rem;
    font-family: system-ui, -apple-system, sans-serif;
    outline: none;
}

.chat-input:focus {
    border-color: var(--accent);
}

.chat-input::placeholder {
    color: var(--text-muted);
}

.chat-send-btn {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: var(--radius);
    padding: 0.4rem 0.75rem;
    font-size: 0.8rem;
    cursor: pointer;
    font-family: system-ui, -apple-system, sans-serif;
    white-space: nowrap;
}

.chat-send-btn:hover {
    background: var(--accent-hover);
}

.chat-send-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.chat-loading {
    display: inline-block;
    color: var(--text-muted);
    font-size: 0.8rem;
    padding: 0.35rem 0.5rem;
}

.chat-loading::after {
    content: '...';
    animation: chatDots 1.2s steps(4, end) infinite;
}

@keyframes chatDots {
    0%, 20% { content: ''; }
    40% { content: '.'; }
    60% { content: '..'; }
    80%, 100% { content: '...'; }
}
```

### 6. MODIFY js/caretaker-sidebar.js
- operation: MODIFY
- reason: Add chat UI logic -- send messages via HTTP POST to /chat endpoint, display chat history, load history on init

- anchor: `function init() {`

#### Strategy

Extend the existing IIFE to add chat functionality. The modifications are:

**A. Add chat variables at the top of the IIFE (after `var userScrolled = false;` on line 4):**

```javascript
  var chatHistory = null;
  var chatInput = null;
  var chatSendBtn = null;
  var chatLoading = false;
  var CHAT_API_URL = 'http://' + (location.hostname || 'localhost') + ':7600';
```

**B. Add chat functions before the `init()` call on line 151:**

- signature: `function formatChatTime(isoString)`
  - purpose: Format ISO timestamp to short time string
  - logic: Same as existing `formatTime` function -- `var d = new Date(isoString); return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });`
  - returns: string

- signature: `function appendChatMessage(role, message, timestamp, isError)`
  - purpose: Create and append a chat message element to the chat history div
  - logic:
    1. If `chatHistory` is null, return
    2. Create a `div` element
    3. Set className to `'chat-msg chat-msg-' + (isError ? 'error' : role)`
    4. Set innerHTML to `'<div class="chat-msg-time">' + (role === 'user' ? 'You' : 'Claude') + ' -- ' + formatChatTime(timestamp) + '</div>' + '<div>' + escapeHtml(message) + '</div>'`
    5. Append to `chatHistory`
    6. Set `chatHistory.scrollTop = chatHistory.scrollHeight` to auto-scroll to bottom
  - returns: void

- signature: `function escapeHtml(str)`
  - purpose: Escape HTML entities to prevent XSS
  - logic:
    1. Create a `div` element: `var d = document.createElement('div')`
    2. Set `d.textContent = str`
    3. Return `d.innerHTML`
  - returns: string

- signature: `function sendChatMessage()`
  - purpose: Read input value, POST to /chat, display response
  - logic:
    1. If `chatInput` is null or `chatLoading` is true, return
    2. Read `var msg = chatInput.value.trim()`
    3. If `msg === ''`, return
    4. Set `chatInput.value = ''`
    5. Call `appendChatMessage('user', msg, new Date().toISOString(), false)`
    6. Set `chatLoading = true`
    7. Set `chatSendBtn.disabled = true`
    8. Create a loading indicator: `var loadingEl = document.createElement('div'); loadingEl.className = 'chat-loading'; loadingEl.textContent = 'Thinking'; chatHistory.appendChild(loadingEl); chatHistory.scrollTop = chatHistory.scrollHeight;`
    9. Build the request body: `var body = JSON.stringify({ message: msg, context: null })`
    10. Call `fetch(CHAT_API_URL + '/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body })`
    11. In the `.then(function(res) { return res.json(); })` handler:
    12. In the next `.then(function(data) { ... })`:
        - Remove `loadingEl` from `chatHistory` if it is still a child
        - If `data.error` is truthy, call `appendChatMessage('assistant', data.error, new Date().toISOString(), true)`
        - Else call `appendChatMessage('assistant', data.message, data.timestamp, false)`
        - Set `chatLoading = false`
        - Set `chatSendBtn.disabled = false`
        - Call `chatInput.focus()`
    13. In the `.catch(function(err) { ... })`:
        - Remove `loadingEl` from `chatHistory` if it is still a child
        - Call `appendChatMessage('assistant', 'Connection error: ' + err.message, new Date().toISOString(), true)`
        - Set `chatLoading = false`
        - Set `chatSendBtn.disabled = false`
  - calls: `appendChatMessage`, `fetch`, `escapeHtml` (via appendChatMessage)
  - returns: void

- signature: `function loadChatHistory()`
  - purpose: Fetch existing chat history from server on sidebar open and populate the chat history div
  - logic:
    1. If `chatHistory` is null, return
    2. Call `fetch(CHAT_API_URL + '/chat/history')`
    3. In `.then(function(res) { return res.json(); })`:
    4. In `.then(function(messages) { ... })`:
        - Set `chatHistory.innerHTML = ''`
        - Loop through `messages` array. For each msg, call `appendChatMessage(msg.role, msg.message, msg.timestamp, false)`
    5. In `.catch(function(err) { ... })`:
        - `console.warn('[chat] Failed to load history:', err.message)`
  - calls: `fetch`, `appendChatMessage`
  - returns: void

**C. Modify the `init()` function to also initialize chat elements:**

Inside `init()`, after the existing `feedList.addEventListener('scroll', ...)` block (after line 39), add:

```javascript
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
```

**D. Add `loadChatHistory` to the exported `window.CaretakerSidebar` object:**

- anchor: `window.CaretakerSidebar = {`

Add `loadChatHistory: loadChatHistory` to the object so it becomes:
```javascript
  window.CaretakerSidebar = {
    init: init,
    onAction: onAction,
    onIncident: onIncident,
    onHistory: onHistory,
    toggle: toggle,
    isOpen: isOpen,
    loadChatHistory: loadChatHistory
  };
```

### 7. MODIFY example.env (or CREATE if it does not exist)
- operation: CREATE (only if the file does not exist; if it exists, MODIFY to add the key)
- reason: Document the ANTHROPIC_API_KEY requirement

Check if `/Users/name/homelab/flybrain/example.env` exists. If not, create it. If it does, append to it.

Add this line:
```
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

## Verification
- build: `cd /Users/name/homelab/flybrain && npm install`
- lint: no linter configured (vanilla JS project)
- test: no existing tests
- smoke:
  1. Start server: `cd /Users/name/homelab/flybrain && ANTHROPIC_API_KEY=test node server/caretaker.js` -- verify it starts without errors on port 7600
  2. Test chat history endpoint: `curl -s http://localhost:7600/chat/history` -- expect `[]` (empty JSON array)
  3. Test chat endpoint rejects missing message: `curl -s -X POST http://localhost:7600/chat -H 'Content-Type: application/json' -d '{}'` -- expect `{"error":"message field is required"}`
  4. Verify the sidebar HTML has the chat-section div: `grep 'chat-section' index.html` -- expect a match
  5. Verify the CSS has chat styles: `grep 'chat-input-row' css/main.css` -- expect a match
  6. Verify agent/chat-policy.md exists and is non-empty: `test -s agent/chat-policy.md && echo OK`
  7. Kill the test server after smoke tests

## Constraints
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any files in .buildloop/ other than current-plan.md
- Do NOT add a WebSocket-based chat channel -- use HTTP POST for chat (request/response pattern fits better than streaming for this use case, and avoids multiplexing complexity on the single browserSocket)
- Do NOT install express or any HTTP framework -- use the existing `http.createServer` in caretaker.js
- Do NOT modify the caretaker-bridge.js WebSocket message routing -- chat goes over HTTP, not WS
- Do NOT change the existing activity feed behavior or CSS
- The `chat_messages` table and `insertChatMessage` method already exist in db.js -- do NOT recreate them
- Use `claude-sonnet-4-20250514` as the model for chat responses (fast, cost-effective for conversational Q&A)
- The `@anthropic-ai/sdk` constructor reads ANTHROPIC_API_KEY from process.env automatically -- do NOT hardcode any API keys
- Persist both user and assistant messages to DB only AFTER successful API response (pattern #5 from known patterns -- never persist before API success)
- Do NOT add error retry logic or exponential backoff -- a simple try/catch with error message display is sufficient
- The activity feed `flex: 1` must remain so it fills remaining space above the chat section
- Chat section `max-height: 45%` prevents it from consuming the entire sidebar
