AUDIT_PAYLOAD::v1
AGENT: claude-fable-5/flybrain
TARGET: /Users/Shared/homelab/flybrain
SCOPE: uncommitted diff on top of 4081c83 (public deployment mode + Buzz naming + sidebar/modal UI pass)

== DELTA_MANIFEST ==
FILES_CREATED: 4
  Dockerfile | node:22-slim, npm ci --omit=dev, copies server/+agent/, CARETAKER_PUBLIC=1, CMD node server/caretaker.js
  .dockerignore | excludes node_modules/data/frontend assets/tests/docs/logs
  docker-compose.yaml | caretaker (env passthrough, bash /dev/tcp healthcheck, named network flybrain) + cloudflared sidecar (TUNNEL_TOKEN, depends_on healthy)
  tests/workday-public-smoke.js | spawns CARETAKER_PUBLIC=1 server (port 7698, temp db, stdio ignore -- proves stdin EOF does not kill it); visitors A+B each get own submitted/fulfilled/place_food; request-id isolation asserted; POST /chat expects 503
FILES_MODIFIED: 8
  server/caretaker.js | PUBLIC_MODE (CARETAKER_PUBLIC=1): createPublicSession(ws) with per-session createAgent (in-memory history cap 100, session-scoped broadcast/sendCommand, shared mock client, workdayAgentConfig extracted); wss connection public branch with MAX_PUBLIC_SESSIONS cap (close 1013); HTTP public gating (/health both modes, /workday/status public variant, /chat 503, everything else 404); readline only in private mode; private path unchanged
  js/caretaker-bridge.js | https pages -> wss://caretaker.flybrain.app + body.public-mode class; http/localhost unchanged
  css/main.css | .public-mode hides chat/analytics tabs+content; .sidebar-tab font 0.95rem padding up (3 tabs now); .sidebar-tab-logo flex center; close btn in tab row styling
  js/workday-panel.js | actor label 'BUZZ, THE FLY'S AGENT' for submitted entries
  index.html | sidebar header row REMOVED (logo is now the Inbox tab itself, 26px; close button moved into tab row -- desktop-hidden as before); workday-header blurb row removed (sentence moved into Learn modal Inbox item); modal: Buzz named in chain + prose, 'And now it has a job' rewritten smoother (fewer strongs), ALL Brain Guide references + CTA button removed; versions css v39 bridge v28 panel v5
  package.json | +smoke-public script
  example.env | +TUNNEL_TOKEN, CARETAKER_MAX_SESSIONS with ingress note (http://caretaker:7600 not localhost)
  docs/PLAN_public-caretaker.md | plan file, steps checked through local verification

== SPEC ==
PUBLIC: each WS connection = one visitor session with own deterministic Workday agent; no claude CLI, no SQLite writes for sessions, no incidents/observations; deploy = compose (caretaker+cloudflared) behind caretaker.flybrain.app (Cloudflare DNS verified)
FRONTEND: https -> wss public host + hide Chat/Analytics; localhost dev unchanged
NAMING: agent is 'Buzz' in panel actor label, modal chain, modal prose; server data fields unchanged (intent ids, tools)
REMOVED: Brain Guide modal item + CTA (brainGuideBtn handler in main.js is null-guarded; learnBtn hidden; education panel now unreachable BY DESIGN per user)

== BUG_FIXES ==
(none claimed)

== KNOWN_GAPS ==
GAP:deploy_blocked | actual deployment needs host (VM 192.168.1.119 down) + TUNNEL_TOKEN from user; docker build not run locally (no image built yet) -- compose/Dockerfile verified by review only
GAP:better_sqlite3_prebuilt | node:22-slim assumes prebuilt binding downloads; source fallback needs build tools (documented in plan)
GAP:education_orphaned | education.js + brain3d.js + hidden learnBtn remain loaded but unreachable; deliberate per user
GAP:public_host_hardcoded | caretaker.flybrain.app hardcoded in caretaker-bridge.js; fine for this single-site app

== VERIFICATION_MATRIX ==
CHECK:syntax | node --check server/caretaker.js js/caretaker-bridge.js js/workday-panel.js tests/workday-public-smoke.js | pass | PASS
CHECK:unit | node tests/workday-node.js | 25 passed | PASS
CHECK:suite | node tests/run-node.js | 104 passed | PASS
CHECK:private_smoke | node tests/workday-smoke.js | SMOKE PASS (private mode regression) | PASS
CHECK:public_smoke | node tests/workday-public-smoke.js | PUBLIC SMOKE PASS | PASS
CHECK:private_mode_untouched | with CARETAKER_PUBLIC unset, wss/http/readline paths identical to 4081c83 behavior (private smoke is the proxy; also diff-review the PUBLIC_MODE guards) | UNTESTED
CHECK:session_cap | server with CARETAKER_MAX_SESSIONS=1: second WS client gets closed with 1013 | UNTESTED
CHECK:no_brain_guide_refs | grep -in 'brain guide\|brainGuideBtn' index.html returns nothing | UNTESTED
CHECK:compose_lint | docker compose config -q (if docker present) validates yaml + env defaults | UNTESTED
