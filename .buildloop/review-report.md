# Doubt Review: caretaker single-fly + Claude activity indicator batch

Auditor: fresh-context sub-agent. Scope: uncommitted diff vs HEAD 75b6304.
Verdict: findings present, one HIGH fixed. Re-ran all affected checks after the fix.

## DELTA_MANIFEST verdicts

- server/caretaker.js (ws message guard) | PASS | harness T1a: stale socket's
  hunger=0.11 never reflected in GET /state (stayed null); T1b: current socket's
  hunger=0.99 reflected. Guard at server/caretaker.js:381 works.
- js/caretaker-bridge.js (activity indicator) | PASS | activityLabel maps at
  :30-43; setClaudeActivity at :45-54 with ACTIVITY_HOLD_MS=6000 (:27) revert;
  called before the switch at :63; WS-open init 'Claude: watching' at :146.
- index.html (id, copy, versions) | PASS | claudeStatusText id at :27; blurb
  shortened; pill 'DEMO'; bridge v26 / panel v4 / main.js v34 all present.
- js/workday-panel.js (LIVE/DEMO) | PASS | :15 'LIVE'/'DEMO'.
- js/main.js (stopPropagation) | PASS | e.stopPropagation() added before
  closeHelpOverlay()/learnBtn.click() at brainGuideBtn handler.
- agent/chat-policy.md (commentator role) | PASS | appended section present.
- agent/caretaker-policy.md (no redundant env cmds) | PASS | appended section
  present.

## VERIFICATION_MATRIX re-run (mine, not recorded)

- CHECK:syntax | node --check on all 4 files | PASS
- CHECK:unit | node tests/workday-node.js | 25 passed | PASS
- CHECK:suite | node tests/run-node.js | 104 passed | PASS
- CHECK:smoke | node tests/workday-smoke.js | SMOKE PASS | PASS
- CHECK:stale_socket_ignored | two-client WS harness, ephemeral port 49227,
  temp DB, WORKDAY_MODE=mock | PASS (T1a false, T1b true)
- CHECK:no_mock_mode_copy | grep -n 'MOCK MODE' index.html js/workday-panel.js |
  no matches (exit 1) | PASS
- CHECK:indicator_wiring | grep confirmed claudeStatusText + 6000ms + call site |
  PASS
- CHECK:stopprop | git diff js/main.js | PASS

## FINDINGS

### HIGH (FIXED) -- stale tab closing silences the live tab

server/caretaker.js close handler nulled browserSocket unconditionally
(`browserSocket = null` for ANY socket close). Combined with the newly added
message guard (`if (ws !== browserSocket) return;`), this produced wrong
behavior in the exact multi-tab flow the change targets:

1. Tab A connects (browserSocket = A).
2. Tab B connects (browserSocket = B) -- B is the live fly.
3. Tab A (the stale one) closes -> close handler set browserSocket = null.
4. Tab B keeps sending state, but `B !== null` -> every message dropped.
   The fly the user is actively watching goes silent; the caretaker loop and
   the Workday agent keep evaluating frozen state.

Reproduced with the two-client harness BEFORE the fix:
`T2 current_still_processed_after_stale_close=false` (GET /state frozen at the
old 0.99 instead of the new 0.42).

Fix (server/caretaker.js close handler): only clear the primary when the socket
that closed IS the primary:

    ws.on('close', function() {
      if (ws !== browserSocket) return;
      browserSocket = null;
      process.stderr.write('[caretaker] Browser disconnected\n');
    });

After the fix the harness reports `T2 ...=true` (GET /state reflects 0.42), and
T1a/T1b still hold. node --check, the 104-test suite, and the smoke test all
still pass.

### Documented behavior (per context-note probe) -- ACCEPTABLE

When the CURRENT primary tab closes, browserSocket goes null and a still-open
older tab CANNOT become primary again without reconnecting: the older tab's
messages satisfy `ws !== browserSocket` (ws !== null) and are dropped, so it
appears frozen to the backend until its WS reconnects. This is by design
(newest connection wins; there is no promotion of an existing socket) and is
acceptable -- the older tab is stale precisely because a newer one superseded
it. Worth noting as a known limitation. The HIGH fix above narrows the blast
radius: closing a stale tab no longer harms the live tab; only closing the
live tab leaves the enclosure without a primary until some tab reconnects.

### MEDIUM (NOT this batch; left untouched) -- unclaimed css/main.css change

`git status` shows css/main.css modified, but it is NOT in the DELTA_MANIFEST.
It was NOT present at the start of this audit and appeared mid-review, so it is
a concurrent edit (the live :7600 server workflow / another session), not part
of the audited caretaker batch. Content: help-modal centering switched from
flex align/justify-center to margin:auto + overflow-y:auto on the overlay
(tall-modal scroll fix). Left as-is: reverting would clobber concurrent work
and it is out of this batch's scope. Flagged here per the manifest cross-check
rule so it is not mistaken for part of this commit.

### LOW (not fixed) -- indicator label claim wording

build-claims says setClaudeActivity is "called ... for every valid command."
It is actually called for every message with type==='command', including
unknown actions (which fall through to the 'tending the enclosure' label).
Harmless; label copy only.

## KNOWN_GAPS validation

- GAP:policy_effect_unverified | accurate | policy text steers a probabilistic LLM.
- GAP:indicator_shows_any_source | accurate | label does not distinguish
  caretaker-loop vs Workday-fulfillment commands; both arrive as WS commands.
- GAP:public_site_no_caretaker | accurate | file:// short-circuits in
  caretaker-bridge.js init(); https page cannot open ws://:7600.

## Net

One HIGH bug in the batch's own changed path found and fixed; affected checks
re-run green. One out-of-batch concurrent css change flagged, not touched.
