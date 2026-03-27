# Build Claims -- D67.1

## Files Changed
- MODIFY js/brain-worker-bridge.js -- Fix nociception stimulus overwrite (one-shot via worker 'stimulate' message) and drive-motor timing mismatch (throttle updateDrives to worker tick rate with batched catch-up)
- MODIFY tests/tests.js -- Update NOCI test to use collectOneShotSegments, add test verifying NOCI absent from sustained segments, add drive throttling test

## Verification Results
- Build: PASS (no build step — vanilla JS)
- Tests: PASS (`node tests/run-node.js` — 69 passed / 0 failed / 69 total)
- Lint: SKIPPED (no linter configured)

## Claims
- [ ] NOCI stimulus is now collected via `collectOneShotSegments()` (new function) instead of `collectStimulationSegments()`, preventing overwrite by subsequent `setStimulusState` bulk replacements
- [ ] `sendOneShotStimuli()` sends NOCI segments via worker `{type: 'stimulate'}` message for immediate V[idx] += intensity injection, bypassing the sustained state replacement pipeline
- [ ] `sendOneShotStimuli()` runs every animation frame (not gated on worker ticks), ensuring NOCI is delivered promptly regardless of worker tick timing
- [ ] `updateDrives()` is now throttled to only run when the motor pipeline guard `(latestFireState || pendingWorkerTicks > 0)` is true, preventing drive decay between worker ticks
- [ ] `pendingDriveFrames` counter accumulates elapsed frames and batch-runs `updateDrives()` N times when the guard becomes true, preserving per-frame decay rates (e.g. fear *= 0.85^N)
- [ ] `pendingDriveFrames` is capped at 20 via `Math.min(pendingDriveFrames + 1, 20)` to prevent runaway accumulation
- [ ] `pendingDriveFrames` is reset to 0 in `stopWorker()`, `startWorker()`, and `_setGroupState()`
- [ ] `collectOneShotSegments` is exported via `BRAIN._bridge` for test access
- [ ] Test `test_bridge_stim_noci_intensity_and_clear` updated to use `collectOneShotSegments()` instead of `collectStimulationSegments()`
- [ ] New test `test_bridge_stim_noci_not_in_sustained` verifies NOCI does not appear in sustained segments and nociception flag is not cleared by `collectStimulationSegments()`
- [ ] New test `test_bridge_workerUpdate_drives_throttled` verifies drives are not updated when guard is false, and are batch-updated for accumulated frames when guard becomes true

## Gaps and Assumptions
- Smoke test (browser interaction with touch tool) not performed — requires browser environment
- sim-worker.js was not modified per plan constraints; the existing `stimulate` message handler at line 435 is assumed correct for one-shot V injection
- Drive decay rate (0.85) is assumed to be the current value in BRAIN.updateDrives(); batched calling preserves whatever rate is actually used
