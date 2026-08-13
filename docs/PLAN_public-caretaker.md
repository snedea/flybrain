# Plan: Public Caretaker (flybrain.app full experience)

Date: 2026-08-12
Version: v1
Status: in-progress

## Context

flybrain.app (GitHub Pages, static) serves the sim, but the caretaker
server runs only on the dev Mac, so public visitors get no Inbox, no
Claude activity, no Workday loop. Goal: every visitor sees the full
show. User approved: "deploy the caretaker so flybrain.app shows the
full thing."

## Current State

- Caretaker server is single-fly: one browserSocket, one shared SQLite,
  one Workday agent, chat via local claude CLI, driven by agent/run.sh.
- Frontend connects to ws://<hostname>:7600 (fails on https: pages).
- flybrain.app DNS is on Cloudflare (verified: andronicus/kim NS), so a
  Cloudflare Tunnel to caretaker.flybrain.app fits the homelab pattern.
- Proxmox VM chuck@192.168.1.119 is unreachable (SSH timeout) --
  deployment host TBD (user decision).

## Architecture

Public mode (env CARETAKER_PUBLIC=1) makes the server multi-session:

- Each WS connection = one visitor = one fly = one deterministic Workday
  agent instance (createAgent with per-session deps). The full loop
  (agent files -> Claude approves/denies -> food drop) needs NO claude
  CLI -- it is deterministic server code.
- Per-session in-memory history (cap 100); no SQLite writes for
  visitors; no incidents/observations; chat disabled (503); single-fly
  HTTP endpoints disabled; /health + /workday/status remain.
- Session cap (default 200) with close(1013) beyond it.
- Private mode (no env) is byte-for-byte the existing behavior.

Frontend: on https pages connect to wss://caretaker.flybrain.app and add
body.public-mode (hides Chat/Analytics tabs -- they need the private
server). On http/localhost, unchanged.

Containers: caretaker (node:22-slim) + cloudflared sidecar
(TUNNEL_TOKEN). Tunnel ingress must target http://caretaker:7600 (the
service name, NOT localhost -- known pattern trap). Healthcheck via
bash /dev/tcp (no curl in slim images).

## Implementation Steps

- [x] Plan written to disk
- [x] server/caretaker.js: PUBLIC_MODE branch -- createPublicSession(ws),
      per-session agent wiring, connection cap, endpoint gating,
      readline skipped in public mode (stdin EOF must not exit the
      container)
- [x] js/caretaker-bridge.js: wss URL on https + body.public-mode
- [x] css/main.css: .public-mode hides chat/analytics tabs+panels
- [x] Dockerfile + .dockerignore + docker-compose.yaml + example.env
      (TUNNEL_TOKEN, CARETAKER_PUBLIC, CARETAKER_MAX_SESSIONS)
- [x] tests/workday-public-smoke.js: two isolated sessions, own
      request/approval/food streams, chat 503; npm run smoke-public
- [x] Local verification: all suites + both smokes
- [ ] Doubt audit, commit
- [ ] DEPLOY (blocked on user): host choice + TUNNEL_TOKEN; create
      tunnel, route caretaker.flybrain.app -> http://caretaker:7600,
      docker compose up, verify wss from https page

## Architecture Decisions

- Per-visitor fly (not one canonical fly): each browser already runs its
  own sim; syncing one canonical fly to all viewers would be a rewrite.
  Multi-session keeps the magic (YOUR fly files ITS paperwork).
- Deterministic-only in public: no claude CLI in the container -- no
  cost exposure, no shell-out attack surface, chat off.
- Mock Workday for the public site: no tenant credentials on an
  internet-facing box. Live mode remains a supervised local demo.

## Risks & Open Questions

- Deployment host: VM 192.168.1.119 down. Options: revive it, another
  VM/LXC, or the Mac. USER DECISION.
- TUNNEL_TOKEN needed from Cloudflare Zero Trust. USER ACTION.
- better-sqlite3 in node:22-slim relies on prebuilt binaries; if the
  build falls back to source it needs python3/make/g++ (documented
  fallback: use node:22 full image).
- Fulfillment setTimeout survivors after disconnect: guarded by
  readyState checks; history array is per-session and GC'd with it.
