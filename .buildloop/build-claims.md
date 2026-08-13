AUDIT_PAYLOAD::v1
AGENT: claude-fable-5/flybrain
TARGET: /Users/Shared/homelab/flybrain
SCOPE: uncommitted diff on top of 38ac3bd only (prior increments audited PASS)

== DELTA_MANIFEST ==
FILES_MODIFIED: 9
  server/workday-agent.js | intents reworded to agent-voice (agent observes behavior, interprets, files on the fly's behalf); kudos trigger CHANGED courtship -> behavior 'feed' && hunger < 0.5, texts PC-scrubbed (no mate/courtship words in Workday surfaces); buildFulfillment RENAMED buildResolution(intentId, requestId, state, approved) with denied variants for all 5 intents (denials NEVER carry a command); fulfill(): approved = Math.random() >= denyChance (config.denyChance clamped 0..1 default 0.15), entry status 'fulfilled'|'denied', tool 'claude_resolution', detail approved/denied by Claude; exports buildResolution (buildFulfillment export REMOVED)
  server/caretaker.js | config.denyChance from WORKDAY_DENY_CHANCE env
  server/db.js | getRecentWorkdayActions SELECT now includes state_snapshot
  js/workday-panel.js | per-entry actor label (submitted -> FLY'S AGENT, else CLAUDE, ADMINISTRATOR); submitted entries render 'Observed: hunger X, fatigue Y... | behavior: Z' line from entry.snapshot (live) or JSON-parsed entry.state_snapshot (history); DENIED pill (workday-pill-fail) + workday-entry-denied red border; FAILED path unchanged
  js/main.js | OBSERVER_MODE=true: handleCanvasMousedown returns immediately (no user world edits; zoom/pinch/wheel unaffected since separate handlers); brainGuideBtn wiring inside help overlay (closes overlay, sets splash flag, clicks hidden learnBtn)
  index.html | Mate tool button REMOVED from DOM entirely (PC requirement: word must not appear); learnBtn hidden inline, relabeled Brain Guide; helpBtn relabeled 'Learn'; help overlay rewritten: original science section + 'And now it has a job' (agent/administrator/Workday story) + 'What you're watching' + Open the Brain Guide button; blurb: 'The fly cannot use Workday. Its agent...'; versions css v35, main.js v31 (panel v3 from prior)
  css/main.css | observer mode: #toolbar .tool-btn[data-tool] and #clearButton display none !important; .workday-entry-actor, .workday-entry-observed, .workday-entry-denied styles
  tests/workday-node.js | kudos tests updated (feed+low hunger fires; feed+high hunger does not); buildResolution tests (approved/denied variants, denied has null command) -- 25 total
  tests/workday-smoke.js | WORKDAY_DENY_CHANCE=0 for determinism
  docs/WORKDAY.md + readme.md | agent framing intro, denial mechanics, WORKDAY_DENY_CHANCE env row, kudos row 'Content after a meal', tool claude_resolution, readme Usage section rewritten for observer mode

== SPEC ==
STORY: fly communicates only via behavior -> agent observes state stream, interprets, files Workday request (card labeled FLY'S AGENT with Observed line) -> Claude administrator resolves after WORKDAY_FULFILL_MS: approve (85% default, world delivery where applicable) or deny (15%, reason, no world effect)
OBSERVER_MODE: users cannot alter the world (tools hidden, canvas mousedown inert); Learn popup auto-shows on first visit (flybrain_seen_splash, pre-existing), explains connectome + Workday/agent story; Brain Guide reachable only from inside popup
PC_CONSTRAINT: the words mate/courtship must not appear anywhere in index.html, docs/WORKDAY.md, readme.md, server/workday-agent.js, js/workday-panel.js (sim-internal js/fly-logic.js, js/main.js, SPEC.md are out of scope)

== BUG_FIXES ==
(none claimed)

== KNOWN_GAPS ==
GAP:agent_loop_still_acts | agent/run.sh Claude caretaker still places food independently of the meal-voucher flow, so the fly sometimes gets fed without a voucher; acceptable (Claude the caretaker's job) but the Inbox no longer shows those placements
GAP:kudos_depends_on_low_hunger_feed | kudos fires only if fly still in 'feed' behavior after hunger drops below 0.5; frequency in practice unverified
GAP:hidden_tools_dom | tool buttons remain in DOM hidden (caretaker-bridge updates lightBtn/tempBtn text); keyboard shortcuts, if any exist for tools, may still work -- check and neutralize if found (MEDIUM if user can still alter world via keyboard)
GAP:education_panel_reachability | Brain Guide only reachable via Learn popup button

== VERIFICATION_MATRIX ==
CHECK:syntax | node --check js/main.js server/workday-agent.js server/caretaker.js server/db.js js/workday-panel.js | pass | PASS
CHECK:unit | node tests/workday-node.js | 25 passed, 0 failed | PASS
CHECK:existing_suite | node tests/run-node.js | 104 passed / 0 failed | PASS
CHECK:e2e | node tests/workday-smoke.js | SMOKE PASS | PASS
CHECK:pc_scrub | grep -rin 'courtship\|\bmate\b\|\bmating\b' index.html docs/WORKDAY.md readme.md server/workday-agent.js js/workday-panel.js | zero hits | UNTESTED
CHECK:observer_inert | with OBSERVER_MODE true, handleCanvasMousedown has early return before any world mutation; no other user-reachable world-mutation path in index.html toolbar (visible buttons: hamburger, Brain 3D, Learn, Lite, center, github) | UNTESTED
CHECK:denied_no_food | buildResolution meal_voucher denied returns command null (unit-covered); fulfill with denyChance=1 produces status denied and no sendCommand call | UNTESTED
CHECK:snapshot_in_history | GET /workday/actions rows include state_snapshot | UNTESTED
