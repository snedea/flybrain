# Build Claims -- T8.7

## Files Changed
- [CREATE] agent/chat-policy.md -- System prompt for chat mode telling Claude how to answer user questions about the fly using DB context
- [MODIFY] server/db.js -- Added 4 query methods: getRecentObservations, getRecentActions, getRecentIncidents, getChatHistory
- [MODIFY] server/caretaker.js -- Added Anthropic SDK import, buildChatContext(), handleChatRequest(), CORS headers, POST /chat and GET /chat/history endpoints
- [MODIFY] index.html -- Added chat-section div with chat-history, chat-input, and chat-send-btn below activity feed inside caretaker sidebar
- [MODIFY] css/main.css -- Added 120+ lines of chat styles: .chat-section, .chat-history, .chat-msg variants, .chat-input-row, .chat-send-btn, .chat-loading with animation
- [MODIFY] js/caretaker-sidebar.js -- Added chat variables, escapeHtml, appendChatMessage, sendChatMessage, loadChatHistory functions; init() now initializes chat elements and binds Enter/click; exported loadChatHistory on window.CaretakerSidebar
- [CREATE] example.env -- Documents ANTHROPIC_API_KEY requirement with placeholder value
- [MODIFY] package.json (via npm install) -- Added @anthropic-ai/sdk dependency

## Verification Results
- Build: PASS (cd /Users/name/homelab/flybrain && npm install -- "up to date, audited 44 packages, found 0 vulnerabilities")
- Tests: SKIPPED (no test framework configured)
- Lint: SKIPPED (no linter configured)
- Smoke Test 1: PASS (server starts on port 7600 with ANTHROPIC_API_KEY=test)
- Smoke Test 2: PASS (GET /chat/history returns 200 with empty array [])
- Smoke Test 3: PASS (POST /chat with {} returns 400 {"error":"message field is required"})
- Smoke Test 4: PASS (grep 'chat-section' index.html finds match)
- Smoke Test 5: PASS (grep 'chat-input-row' css/main.css finds match)
- Smoke Test 6: PASS (agent/chat-policy.md exists and is non-empty)

## Claims
- [ ] POST /chat endpoint accepts JSON body with {message: string, context?: object}, validates message is non-empty string, returns 400 on invalid input
- [ ] POST /chat calls Claude API (claude-sonnet-4-20250514, max_tokens 512) with chat-policy.md as system prompt plus DB context (last 20 observations, actions, incidents)
- [ ] POST /chat includes last 20 chat_messages from DB as conversation history in the messages array sent to Claude
- [ ] POST /chat persists both user and assistant messages to chat_messages table ONLY after successful API response
- [ ] POST /chat returns {role: 'assistant', message: string, timestamp: string} on success, or {error: true, message: string} on API failure
- [ ] GET /chat/history returns last 50 chat messages in chronological order as JSON array
- [ ] CORS headers (Access-Control-Allow-Origin: *, Methods, Headers) are set on all HTTP responses; OPTIONS preflight returns 204
- [ ] db.js getRecentObservations(limit) returns rows in chronological order (oldest first) with drives, behavior, position, food_count
- [ ] db.js getRecentActions(limit) returns rows in chronological order with timestamp, action, params, reasoning
- [ ] db.js getRecentIncidents(limit) returns rows in chronological order with timestamp, type, severity, description
- [ ] db.js getChatHistory(limit) returns rows in chronological order with id, timestamp, role, message
- [ ] index.html contains chat-section div with chat-history, chat-input, and chat-send-btn inside the caretaker-sidebar
- [ ] CSS styles: chat-section max-height 45%, min-height 120px; activity-feed flex:1 unchanged; chat messages have user/assistant/error variants
- [ ] JS: sendChatMessage() POSTs to http://{hostname}:7600/chat, shows loading indicator, displays response or error
- [ ] JS: loadChatHistory() fetches GET /chat/history on init and populates chat-history div
- [ ] JS: Enter key sends message, input is cleared on send, button disabled during loading
- [ ] JS: escapeHtml() prevents XSS by using textContent/innerHTML DOM technique
- [ ] agent/chat-policy.md contains system prompt instructing Claude to reference timestamps, be data-backed, not output JSON, not make up data
- [ ] Anthropic constructor reads ANTHROPIC_API_KEY from process.env automatically -- no hardcoded keys
- [ ] handleChatRequest catches API errors and returns error object instead of throwing

## Gaps and Assumptions
- Claude API call was not tested end-to-end (would require a real ANTHROPIC_API_KEY); only the error path and input validation were smoke-tested
- Chat history alternation: if the DB has consecutive same-role messages (e.g., two user messages), the Anthropic API may reject them -- no deduplication or role-alternation enforcement is implemented
- The viewContext parameter is always null from the frontend (plan says "if provided"); no UI sends it
- No rate limiting on the /chat endpoint -- rapid user messages could hit API rate limits
- The existing activity feed CSS (flex: 1) was not modified; the chat section relies on max-height: 45% to share space, which was not visually verified in a browser
- No maximum message length validation on user input
