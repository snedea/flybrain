# Build Claims -- T12.1

## Files Changed
- [MODIFY] js/caretaker-renderer.js -- Fix idle pulse (new idlePulseX/Y vars, wire into drawOverlay, rewrite drawIdlePulse); remove double radian conversion on wind arrow angle
- [MODIFY] js/caretaker-bridge.js -- Add input validation to executeCommand: place_food (type+finite check), set_light/set_temp (else-warn + Math.floor on numeric branch), touch (type check + bounds clamp), blow_wind (type+finite check on strength/direction)

## Verification Results
- Build: PASS (no build step -- vanilla JS served directly)
- Tests: SKIPPED (no test suite exists)
- Lint: PASS (node -c syntax check on both files passed)

## Claims
- [ ] Idle pulse now draws: `idlePulseX`/`idlePulseY` capture the last cursor position when transitioning to idle (>3s since last command). `drawIdlePulse()` is called from `drawOverlay()` and uses these saved coordinates.
- [ ] Idle pulse disappears on disconnect: `setConnected(false)` resets `idlePulseX`/`idlePulseY` to -1.
- [ ] Idle pulse coordinates are cleared when cursor becomes active: lines 125-126 set `idlePulseX = -1; idlePulseY = -1` when idleTime <= 3000.
- [ ] Wind arrow angle no longer double-converts: line 236 uses `e.params.direction` directly (was `e.params.direction * Math.PI / 180`).
- [ ] `place_food` rejects non-number and non-finite x/y with console.warn and early break (lines 37-41 of bridge).
- [ ] `set_light` logs warning for invalid level values (line 58 of bridge).
- [ ] `set_temp` logs warning for invalid level values (line 73 of bridge).
- [ ] `set_light` and `set_temp` numeric branches use `Math.floor()` to ensure integer index (lines 53, 68 of bridge).
- [ ] `touch` validates x/y are finite numbers and clamps to canvas bounds [0, innerWidth] x [44, innerHeight], falls back to fly position if invalid (lines 77-81 of bridge).
- [ ] `blow_wind` validates strength is finite number before clamping to [0,1], defaults 0.5; validates direction is finite number, defaults 0 (lines 85-88 of bridge).
- [ ] Public API unchanged: `window.CaretakerRenderer` exports same 4 methods; `window.caretakerBridge` exports same 3 methods.
- [ ] ES5 style maintained throughout (var, no let/const/arrow functions).

## Gaps and Assumptions
- No automated tests exist for either module; all claims require manual or visual verification.
- The `place_food` early-break on invalid params means `CaretakerRenderer.onCommand` is still called afterward (line 97-99) -- the renderer will receive the invalid params but only uses them for `attentionTargetX/Y` positioning, which is benign for the invalid case since the food won't be placed.
- The idle pulse position is captured from `attentionX`/`attentionY` at the moment of transition to idle. If the cursor was still lerping toward its target, the pulse position may be slightly off from the target. This matches the plan's intent.
- `lastCommandTime === 0` (no commands ever sent) correctly prevents idle pulse: the `lastCommandTime > 0` guard inside the idle block prevents setting idlePulseX/Y.
