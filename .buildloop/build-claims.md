AUDIT_PAYLOAD::v1
AGENT: claude-fable-5/flybrain
TARGET: /Users/Shared/homelab/flybrain
SCOPE: uncommitted diff on top of ae52307 only (batched: UI modal pass + spin fixes)

== DELTA_MANIFEST ==
FILES_MODIFIED: 3
  index.html | Brain 3D button REMOVED; Calendar tab button + content div + caretaker-calendar.js script include REMOVED (tabs now Inbox/Chat/Analytics); help overlay restructured: #helpOverlay is now a full-screen backdrop containing new .help-modal wrapper (header title 'A fly that works here', NEW .help-chain strip with 3 nodes THE FLY/ITS AGENT/CLAUDE + arrows, existing sections, brainGuideBtn gains .help-modal-cta); versions css v36, main.js v33
  css/main.css | .help-overlay rewritten as backdrop (inset 0, flex center, blur, z-index 90 -- above sidebar 30 and education 40); NEW .help-modal (min(620px,100%), max-height 84vh, scroll, entrance animation help-modal-in 0.18s, disabled under prefers-reduced-motion); gradient hairline moved .help-overlay::before -> .help-modal::before; NEW .help-chain* styles (eyebrow caps, accent); .help-modal-cta; mobile media rule that pinned overlay top replaced with padding-only rule
  js/main.js | display 'block' -> 'flex' for overlay show paths; NEW closeHelpOverlay() sets splash flag; backdrop click (e.target === helpOverlay) closes; Escape keydown closes when visible; helpCloseBtn/brainGuideBtn use closeHelpOverlay; SPIN FIXES: (1) walk/explore targetSpeed floor 0.25 (fly-logic walk entry threshold ~5 vs speed totalWalk/100 scale mismatch), (2) phototaxis dead-zone: dist<40 to canvas center -> targetDir=facingDir, targetSpeed=0 (atan2 flip oscillation), (3) boundary steering gated on speed > 0.05 (was rotating stationary flies), (4) headBiasSign persists across ticks, flips only when |accumWalkLeft-accumWalkRight| > 1 (jitter is +-0.04)

== SPEC ==
MODAL: Learn button (helpBtn) opens centered modal over blurred backdrop; closes via X, backdrop click, Escape; auto-shows first visit (flybrain_seen_splash unchanged); Brain Guide opens from CTA inside modal (hidden learnBtn.click())
SPIN: heading update at main.js applyframe (facingDir += angleDiff * ...) is unconditional; fixes ensure targetDir cannot keep moving while speed ~0: floor in walk/explore, dead-zone stop in phototaxis, steer gate at boundary, stable head bias sign
REMOVED: Brain 3D toolbar button (Brain3D module untouched, unreachable from toolbar), Calendar tab/panel/script (caretaker-calendar.js file remains on disk, unloaded; CaretakerSidebar 'calendar' activation branch remains but unreachable -- typeof-guarded)

== BUG_FIXES ==
FIX:spin_walk_floor | js/main.js computeMovementForBehavior walk/explore | targetSpeed floor 0.25 | was: totalWalk/100 ~0.05 at entry threshold, visually stationary while explore jitter turned heading
FIX:spin_phototaxis_deadzone | js/main.js phototaxis branch | dist<40 -> stop and hold heading | was: atan2 to hardcoded canvas center flips 180deg on overshoot, endless oscillation
FIX:spin_boundary_gate | js/main.js edge steering | requires speed > 0.05 | was: rotated stationary flies toward center every frame
FIX:head_bias_jitter | js/main.js head bias | sign persists, flips on real asymmetry > 1 | was: sign keyed to +-0.04 jitter, random per-tick heading flips

== KNOWN_GAPS ==
GAP:motor_scale_uncalibrated | MOTOR_SCALE 0.6 remains the pre-calibration guess; D23 calibration tasks in TASKS.md still unfinished; the speed floor masks the symptom at walk entry | acceptable: deliberate choice, floor vs recalibration double-correction avoided
GAP:spin_fix_visual | fixes verified by static reasoning + suite, not by long-run visual observation; residual slow rotation may persist in rest/groom (no targetDir change there, so expected none)
GAP:calendar_code_orphaned | caretaker-calendar.js + calendar CSS + db daily_scores/calendar endpoints remain server-side and on disk, now unused by UI | LOW, harmless
GAP:modal_visual | modal layout verified by markup/CSS reasoning, not screenshot

== VERIFICATION_MATRIX ==
CHECK:syntax | node --check js/main.js | pass | PASS
CHECK:existing_suite | node tests/run-node.js | 104 passed / 0 failed | PASS
CHECK:no_calendar_refs | grep -n "caretaker-calendar\|data-tab=\"calendar\"\|calendar-content" index.html returns nothing | UNTESTED
CHECK:no_brain3d_button | grep -c 'id="brain3dBtn"' index.html returns 0; grep 'if (brain3dBtn)' js/main.js confirms guard so missing element is safe | UNTESTED
CHECK:modal_z | .help-overlay z-index 90 > .caretaker-sidebar 30 and education-panel 40 | UNTESTED
CHECK:overlay_show_flex | no remaining helpOverlay.style.display = 'block' in js/main.js | UNTESTED
CHECK:spin_conditions | in computeMovementForBehavior: walk/explore targetSpeed floor present BEFORE speedChangeInterval calc; phototaxis dead-zone sets targetSpeed 0 and speedChangeInterval uses it; boundary steer wrapped in speed guard; headBiasSign module-level not per-call | UNTESTED
CHECK:escape_close | keydown handler closes only when overlay visible; backdrop click closes only on e.target === helpOverlay (not clicks inside modal) | UNTESTED
