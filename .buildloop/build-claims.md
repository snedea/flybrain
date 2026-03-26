# Build Claims -- T5.2

## Files Changed
- MODIFY js/connectome.js -- Added light-dependent fatigue gain (2x at lightLevel < 0.3), reduced curiosity range (1/3 at lightLevel < 0.3), and halved tonic background activity (4 instead of 8) at lightLevel === 0
- MODIFY js/main.js -- Lowered rest fatigue threshold to 0.4 in complete darkness, doubled antenna twitch interval at lightLevel === 0, reduced idle leg jitter by 50% at lightLevel === 0

## Verification Results
- Build: PASS (no build step -- vanilla JS loaded via script tags)
- Tests: SKIPPED (no existing tests)
- Lint: PASS (node -c js/connectome.js && node -c js/main.js -- syntax check passed)

## Claims
- [ ] Claim 1: In connectome.js BRAIN.updateDrives, when lightLevel < 0.3, fatigue gain rate is 0.006 per tick while moving (double the normal 0.003) -- see line 195
- [ ] Claim 2: In connectome.js BRAIN.updateDrives, when lightLevel < 0.3, curiosity random walk range is 0.02 (one-third of normal 0.06) -- see line 202
- [ ] Claim 3: In connectome.js tonic background activity, when lightLevel === 0, tonic injection to CX_FC/CX_EPG/CX_PFN is 4 (half of normal 8) -- see line 372
- [ ] Claim 4: In main.js evaluateBehaviorEntry, when lightLevel === 0, rest fatigue threshold is 0.4 instead of BEHAVIOR_THRESHOLDS.restFatigue (0.7) -- see line 488
- [ ] Claim 5: In main.js drawAntennae, when lightLevel === 0, antenna twitch interval is doubled (antennaBase * 2) at re-roll time, preserving the pre-rolled timer pattern -- see line 1169
- [ ] Claim 6: In main.js drawLegs, when lightLevel === 0, idle/feed/default leg jitter is multiplied by 0.5 (50% reduction); resting and bracing jitter branches are unaffected -- see line 1342
- [ ] Claim 7: BEHAVIOR_THRESHOLDS.restFatigue constant (0.7) is NOT modified; the darkness override is local to evaluateBehaviorEntry
- [ ] Claim 8: All light level comparisons use correct operators: `< 0.3` for low-light checks (fatigue, curiosity), `=== 0` for complete darkness checks (tonic, rest threshold, antenna, legs)
- [ ] Claim 9: No new files created, no dependencies added, no behavior state machine logic changed beyond the restThreshold check

## Gaps and Assumptions
- Smoke testing (visual observation in browser) was not performed as this is a headless environment; syntax validation was performed instead
- The fatigue recovery rate (-0.01) is unchanged in darkness; only the accumulation rate doubles -- this means the fly will still eventually recover from rest, just enters rest sooner
- At lightLevel 0.5 (Dim mode), the < 0.3 threshold means fatigue gain and curiosity remain at normal rates, which matches the plan's intent
