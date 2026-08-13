AUDIT_PAYLOAD::v1
AGENT: claude-fable-5/flybrain
TARGET: /Users/Shared/homelab/flybrain
SCOPE: uncommitted diff on top of 75b6304 only

== DELTA_MANIFEST ==
FILES_MODIFIED: 7
  server/caretaker.js | ws message handler ignores state from sockets that are not the current browserSocket (stale tabs no longer interleave a frozen second fly into the stream)
  js/caretaker-bridge.js | NEW Claude activity indicator: activityLabel(action, params) maps commands to plain-language labels (place_food -> delivering food, set_light dim -> dimming the lights, etc.); setClaudeActivity updates #claudeStatusText, reverts to 'Claude: watching' after 6 s; called at top of executeCommand for every valid command; on WS open text initialized to 'Claude: watching'
  index.html | claude-status-text span gains id claudeStatusText, default text 'Claude: watching'; Inbox blurb shortened to 'Requests filed by the fly's agent, reviewed and resolved by Claude.'; mode pill initial text MOCK MODE -> DEMO; versions bridge v26, panel v4, main.js v34
  js/workday-panel.js | setMode pill text 'LIVE TENANT'/'MOCK MODE' -> 'LIVE'/'DEMO'
  js/main.js | brainGuideBtn handler adds e.stopPropagation() (click bubbled to the document-level 'close education panel on outside click' handler, closing the guide in the same click that opened it -> button appeared dead)
  agent/chat-policy.md | appended role section: chat Claude is a commentator, cannot act, must not offer/ask to act, speaks of the caretaker in third person
  agent/caretaker-policy.md | appended rule: check environment.lightLevel/temperature before set_light/set_temp; if already in effect output wait (stops repeated dim spam)

== SPEC ==
INDICATOR: toolbar badge shows Claude: watching | delivering food | dimming the lights | ... for 6 s per command, event-driven, no polling loops
SINGLE_FLY: only the latest WS connection's states are processed; commands already went only to latest
COPY: no 'MOCK MODE' language user-facing; DEMO (amber) / LIVE (green)

== BUG_FIXES ==
FIX:brain_guide_dead_button | js/main.js brainGuideBtn handler | stopPropagation added | was: education panel opened then instantly closed by document outside-click handler on the same bubbled event
FIX:phantom_fly_states | server/caretaker.js ws message handler | non-primary sockets ignored | was: two tabs interleaved states (one throttled/frozen), producing phantom hunger spikes and wrong food counts in chat context and workday agent evaluation

== KNOWN_GAPS ==
GAP:policy_effect_unverified | chat-policy/caretaker-policy text changes steer a haiku LLM; compliance is probabilistic, not guaranteed
GAP:indicator_shows_any_source | activity indicator reflects commands from both the caretaker loop and workday fulfillments (both arrive as WS commands); label does not distinguish who ordered it -- acceptable, both are Claude
GAP:public_site_no_caretaker | flybrain.app (GitHub Pages) has no reachable caretaker server; public visitors get sim + empty Inbox, no Claude badge (WS to :7600 fails; https page cannot open ws://). Known deployment gap, out of scope for this batch

== VERIFICATION_MATRIX ==
CHECK:syntax | node --check js/main.js js/caretaker-bridge.js js/workday-panel.js server/caretaker.js | pass | PASS
CHECK:unit | node tests/workday-node.js | 25 passed | PASS
CHECK:suite | node tests/run-node.js | 104 passed | PASS
CHECK:smoke | node tests/workday-smoke.js | SMOKE PASS | PASS
CHECK:stale_socket_ignored | two WS clients connect to an ephemeral-port server; first (stale) client sends hungry state -> no workday_action broadcast and GET /state does not reflect it; second (current) client's state IS processed | UNTESTED
CHECK:no_mock_mode_copy | grep -n 'MOCK MODE' index.html js/workday-panel.js returns nothing | UNTESTED
CHECK:indicator_wiring | claudeStatusText exists in index.html; setClaudeActivity called in executeCommand before switch; revert timer 6000 | UNTESTED
CHECK:stopprop | brainGuideBtn handler calls e.stopPropagation() before opening guide | UNTESTED
