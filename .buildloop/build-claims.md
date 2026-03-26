# Build Claims -- T5.3

## Files Changed
- MODIFY js/connectome.js -- Replaced lightDirection with nociception in BRAIN.stimulate, added nociception stimulus processing block (single-tick auto-clear), added dormant infrastructure comment on dangerOdor
- MODIFY js/constants.js -- Added dormant infrastructure comments to OLF_ORN_DANGER, GUS_GRN_BITTER, and GUS_GRN_WATER weight blocks
- MODIFY js/main.js -- Added temperature cycle button state (tempStates, tempStateIndex, tempLabels), touchTimestamps array, temp button wiring in tool handler loop, nociception detection in applyTouchTool (3+ touches in 4s), cycleTempLevel function, nociception/touchTimestamps reset in visibility handler, excluded temp from active-class removal
- MODIFY index.html -- Added Temp: Neutral button after lightBtn, added Temp help overlay entry after Light, updated Touch help text to mention pain response

## Verification Results
- Build: PASS (no build step; plain browser JS)
- Tests: SKIPPED (no test suite configured)
- Lint: PASS (node -c js/connectome.js && node -c js/constants.js && node -c js/main.js -- all passed syntax check)

## Claims
- [ ] BRAIN.stimulate.lightDirection has been removed from connectome.js; the property no longer exists
- [ ] BRAIN.stimulate.nociception field added as boolean (default false) in connectome.js BRAIN.stimulate block
- [ ] Nociception stimulus processing block in BRAIN.update sensory section fires BRAIN.dendriteAccumulate('NOCI') when nociception is true, then auto-clears to false (single-tick)
- [ ] NOCI neuron weights (DN_STARTLE: 10, DRIVE_FEAR: 8, DN_FLIGHT: 6, SEZ_GROOM: 4, SEZ_FEED: -5) in constants.js are unchanged and will be propagated by the new processing block
- [ ] Temperature cycle button (id=tempBtn, data-tool=temp) in toolbar after lightBtn, displays "Temp: Neutral" initially
- [ ] cycleTempLevel function cycles through Neutral(0.5) -> Warm(0.75) -> Cool(0.25) -> Neutral, setting BRAIN.stimulate.temperature and updating button text
- [ ] Temperature button uses cycle-button pattern: separate click handler, no active-class management, does not deselect feed/touch/air tools
- [ ] Temp button excluded from active-class removal in tool handler (t !== 'light' && t !== 'temp')
- [ ] Rapid touch nociception: touchTimestamps array tracks touch times; 3+ touches within 4 seconds sets BRAIN.stimulate.nociception = true and clears the array
- [ ] touchTimestamps self-bounding: pruned to 4-second window on each push, cleared to empty after triggering
- [ ] Tab visibility handler resets BRAIN.stimulate.nociception to false and touchTimestamps.length to 0
- [ ] Existing temperature processing in connectome.js (lines 343-351 original, now ~347-355) is unchanged -- warm(>0.65) fires THERMO_WARM, cool(<0.35) fires THERMO_COOL
- [ ] Dormant comment on dangerOdor processing in connectome.js: "NOTE: connectome weights are wired but no user interaction currently sets BRAIN.stimulate.dangerOdor"
- [ ] Dormant comment on OLF_ORN_DANGER in constants.js: "NOTE: weights defined but no user interaction currently sets dangerOdor stimulus"
- [ ] Dormant comment on GUS_GRN_BITTER in constants.js: "NOTE: weights defined but not yet wired to any user interaction"
- [ ] Dormant comment on GUS_GRN_WATER in constants.js: "NOTE: weights defined but not yet wired to any user interaction"
- [ ] Help overlay has Temp entry: "Cycles through Neutral, Warm, and Cool. Warm makes the fly more active and avoidant. Cool makes it exploratory."
- [ ] Touch help text updated to mention: "Tap 3+ times in 4 seconds for a pain response."
- [ ] No new CSS rules added; temp button uses existing .tool-btn styling
- [ ] No new files created
- [ ] NOCI, THERMO_WARM, THERMO_COOL weights in constants.js are unmodified
- [ ] GUS_GRN_WATER, GUS_GRN_BITTER, OLF_ORN_DANGER are NOT wired to user interactions -- comments only

## Gaps and Assumptions
- No automated browser tests exist; behavioral correctness (warm=active/avoidant, cool=exploratory) relies on the existing connectome weight propagation which was verified by reading the weight tables
- The nociception trigger requires the user to be in Touch tool mode and actually hit the fly; touches that miss the fly body don't call applyTouchTool and won't count toward nociception
- No CSS changes were needed per the plan; the temp button inherits .tool-btn styling which handles button appearance
