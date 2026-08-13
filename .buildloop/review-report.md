# Doubt Review -- UI modal pass + spin fixes

Scope: uncommitted diff on top of HEAD ae52307. Auditor: fresh-context sub-agent.

## Verdict: NO HIGH/MEDIUM FINDINGS (one LOW noted, not fixed)

## DELTA_MANIFEST verification

index.html | PASS. Brain 3D button removed (grep -c id="brain3dBtn" -> 0).
Calendar tab button, calendar content div, and caretaker-calendar.js script
include all removed (grep for caretaker-calendar / data-tab="calendar" /
calendar-content -> no matches). Tabs now Inbox/Chat/Analytics.
#helpOverlay restructured into full-screen backdrop wrapping new .help-modal;
header title "A fly that works here"; new .help-chain strip with 3 nodes
(THE FLY / ITS AGENT / CLAUDE) and -> arrows; brainGuideBtn has help-modal-cta.
Versions bumped css v36, main.js v33. All confirmed in diff.

css/main.css | PASS. .help-overlay rewritten as backdrop (inset 0, flex center,
blur, z-index 90). New .help-modal (min(620px,100%), max-height min(84vh,46rem),
scroll, help-modal-in 0.18s entrance, disabled under prefers-reduced-motion).
Gradient hairline moved .help-overlay::before -> .help-modal::before (no orphan
::before on .help-overlay; grep confirms only .help-modal::before at line 482).
New .help-chain* styles and .help-modal-cta present. Mobile rule now padding-only.

js/main.js | PASS. display 'block' -> 'flex' on both show paths (first-visit and
helpBtn toggle); no remaining `helpOverlay.style.display = 'block'` (grep empty).
New closeHelpOverlay() sets flybrain_seen_splash. Backdrop click closes only on
e.target === helpOverlay (main.js:552). Escape closes only when visible
(main.js:556). helpCloseBtn and brainGuideBtn route through closeHelpOverlay.
Spin fixes all present: walk/explore floor 0.25 (1182), phototaxis dead-zone
dist<40 -> targetDir=facingDir/targetSpeed=0 (1210-1214), boundary steer gated on
speed > 0.05 (2170), headBiasSign module-level (1164) flipping only on
|walkAsym| > 1 (1203).

## VERIFICATION_MATRIX re-run (all PASS)

- syntax: `node --check js/main.js` -> OK.
- existing_suite: `node tests/run-node.js` -> 104 passed / 0 failed / 104 total.
- no_calendar_refs: grep -> no matches (exit 1). PASS.
- no_brain3d_button: grep -c -> 0; guard `if (brain3dBtn)` at main.js:499. PASS.
- modal_z: .help-overlay z-index 90 > .caretaker-sidebar 30 > .education-panel 25.
  Modal renders above the permanent sidebar. PASS. (See LOW below re: claim text.)
- overlay_show_flex: no `display = 'block'` remains. PASS.
- spin_conditions: floor precedes speedChangeInterval calc; phototaxis dead-zone
  feeds speedChangeInterval; boundary steer wrapped in speed guard; headBiasSign
  is module-level. PASS.
- escape_close: keydown gated on display !== 'none'; backdrop click gated on
  e.target === helpOverlay (inside-modal clicks do not close). PASS.

## Targeted concerns from the task

(a) Phototaxis dead-zone deadlock -- CLEARED. Behavior transitions are decided by
evaluateBehaviorEntry() (fly-logic.js:67-110), which reads only BRAIN
accumulators, drives, light level, totalWalk, and cooldown/min-duration timers.
None reference fly.x/fly.y or speed. updateBehaviorState (main.js:1093) calls it
every tick and switches state independent of movement. The dead-zone only zeroes
visual translation; it cannot introduce a state lock that would not also exist
without the fix. Exits available regardless of position: light drop, curiosity
< 0.2, totalWalk <= 3, rising fatigue (rest outranks phototaxis), or any
higher-priority behavior. No permanent center-lock.

(b) Walk floor 0.25 vs feed/food-seek -- CLEARED. The 0.25 floor lives only in the
walk/explore branch (main.js:1182). The food-seek steering block that follows in
the same branch (1187-1198) sets its own higher floor of 0.3 and recomputes
speedChangeInterval, so 0.25 never suppresses food approach. The `feed` behavior
is a separate branch (1247-1258) with its own targetSpeed 0.25-approach / 0-contact
logic, untouched by the walk floor. No breakage.

(c) Modal layering and first-visit -- CLEARED. Backdrop is z-index 90, above the
permanent sidebar (30) and education panel (25/23 mobile). .help-overlay CSS uses
display:flex; first visit sets inline display 'flex' to match centering, so
auto-show renders correctly and centered, not behind the sidebar.

## git scope

Only 4 files differ from HEAD: build-claims.md (expected artifact) + the 3 claimed
source files. No unclaimed changes.

## KNOWN_GAPS accuracy

- motor_scale_uncalibrated: accurate. MOTOR_SCALE = 0.6 at
  brain-worker-bridge.js:261.
- calendar_code_orphaned: accurate. js/caretaker-calendar.js still on disk (9301 B);
  CaretakerSidebar 'calendar' branch remains typeof-guarded
  (caretaker-sidebar.js:285) and is unreachable now that the script is not loaded.
- spin_fix_visual / modal_visual: accurate as stated (reasoning + suite, no long
  visual run / screenshot).

## LOW finding (not fixed -- claim text only, no code impact)

- build-claims CHECK:modal_z and the css/main.js manifest note state
  ".education-panel 40". Actual value is z-index 25 (mobile 23). The conclusion
  (90 > all) is unaffected and modal_z still PASSES. Numeric inaccuracy in the
  claims document, not in shipped code. Filed as LOW; no fix applied.
