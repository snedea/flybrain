# Build Claims -- T13.1

## Files Changed
- [MODIFY] js/connectome.js -- Added bitterContact/waterContact stimulus flags, thirst drive, thirst update logic, and GUS_GRN_BITTER/GUS_GRN_WATER dendriteAccumulate calls
- [MODIFY] js/main.js -- Added danger/water tool handlers, waterDrops array, bitter food marking (10% chance), bitter contact detection with food removal, water proximity detection, danger odor reset timer, drawWaterDrops function, thirst drive UI sync, water drop resize clamping, clear button clears water drops
- [MODIFY] index.html -- Added Danger and Water toolbar buttons, three help-item entries (Danger/Water/Bitter), Thirst drive-row in drive-meters panel, bumped all ?v=23 to ?v=24

## Verification Results
- Build: PASS (node -c js/connectome.js && node -c js/main.js -- both parse cleanly)
- Tests: SKIPPED (no automated test runner for these features)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] BRAIN.stimulate.bitterContact and BRAIN.stimulate.waterContact are new boolean fields defaulting to false in js/connectome.js:139-140
- [ ] BRAIN.drives.thirst is a new drive initialized to 0.4 in js/connectome.js:160
- [ ] Thirst increases by 0.003 per brain tick and decreases by 0.4 on water contact in BRAIN.updateDrives (connectome.js:184-186)
- [ ] GUS_GRN_BITTER fires when bitterContact is true (connectome.js:335)
- [ ] GUS_GRN_WATER fires when waterContact is true (connectome.js:340)
- [ ] Danger tool button exists in index.html:18 with data-tool="danger"
- [ ] Water tool button exists in index.html:19 with data-tool="water"
- [ ] Danger tool handler in main.js:845-852 sets BRAIN.stimulate.dangerOdor=true when click is within 80px of fly, with 2-second auto-reset via dangerResetTime
- [ ] Water tool handler in main.js:862-866 places a water drop (radius 6) at click position
- [ ] 10% of placed food is marked bitter (main.js:841 -- Math.random() < 0.1)
- [ ] Bitter food renders green (rgb(120,200,80)) vs normal yellow (main.js:1241)
- [ ] When fly contacts bitter food (dist <= 20), bitterContact is set true and food is immediately removed before feeding logic runs (main.js:1973-1978)
- [ ] Water proximity loop (main.js:2017-2024) sets waterContact=true and removes water drop when fly is within 15px
- [ ] Danger odor auto-resets after 2 seconds (main.js:2035-2038)
- [ ] Clear button clears both food[] and waterDrops[] (main.js:10-11)
- [ ] drawWaterDrops() renders blue circles (rgba(100,180,255,0.8)) and is called in draw() after drawFood() (main.js:1251-1258, 2074)
- [ ] Thirst drive bar (id="driveThirst") exists in index.html:90-91 and is synced in updateUI (main.js:651-652)
- [ ] Water drops are clamped on window resize (main.js:2116-2118)
- [ ] All ?v=23 cache-bust params bumped to ?v=24 in index.html (0 occurrences of v=23 remain)
- [ ] Help overlay includes entries for Danger, Water, and Bitter food (index.html:50-52)
- [ ] OLF_ORN_DANGER, GUS_GRN_BITTER, and GUS_GRN_WATER are already defined with weights in js/constants.js (lines 84, 115, 124) -- no changes needed there
- [ ] js/fly-logic.js was not modified (existing behavior evaluation handles startle/flight from accumulator signals)
- [ ] All new code uses ES5 syntax (var, not let/const)

## Gaps and Assumptions
- No automated tests exist for these features; verification is manual/visual only
- The thirst drive increases over time but does not currently influence behavior selection (no "seek water" behavior in fly-logic.js) -- the fly does not actively seek water drops, it only benefits when it happens to walk over one
- Bitter food detection uses the same 20px contact distance as normal food contact; the fly cannot "smell" bitterness from farther away
- The danger odor ripple visual is the same orange as touch ripples -- no distinct color was specified in the plan
- Water drops have no evaporation/timeout -- they persist until consumed or cleared
- The thirst drive is clamped by the existing generic clamp loop in updateDrives (iterates all keys in BRAIN.drives)
