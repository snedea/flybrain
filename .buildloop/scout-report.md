# Scout Report: T2.1

## Key Facts (read this first)

- **Stack**: Vanilla JS, no build step. Three JS files loaded in order: `constants.js` -> `connectome.js` -> `main.js`. HTML5 Canvas. No npm, no bundler.
- **Accumulators exist, state machine does not.** `connectome.js` already computes `BRAIN.accumWalkLeft/Right`, `accumFlight`, `accumFeed`, `accumGroom`, `accumStartle` each brain tick (500ms). `main.js` ignores all but `accumleft`/`accumright` for direction/speed -- the rest are dead outputs.
- **Animations are partial.** Tripod gait `drawLegs(isMoving)` exists and works. Wing spread, proboscis extension, grooming arm movements, and startle freeze-burst do NOT exist. `drawProboscis()` is a full function but never called (commented out in `drawFlyBody`).
- **All work is in `main.js`.** The state machine, per-state animation dispatch, and movement overrides all go here. `connectome.js` / `constants.js` only need weight tuning.
- **Brain tick = 500ms, render tick = 60fps.** State machine reads accumulator snapshots on the 500ms cadence, animations interpolate smoothly on 60fps.

## Relevant Files

| File | Role for T2.1 |
|------|--------------|
| `js/main.js` | PRIMARY target -- add state machine, per-state animation, movement overrides |
| `js/connectome.js` | Read: accumulator definitions, `motorcontrol()`, drive flags; minor: may add `accumExplore` accumulator |
| `js/constants.js` | Weight tuning to make behaviors emerge naturally (DN_WALK, DN_FLIGHT, SEZ_GROOM, DN_STARTLE thresholds) |
| `css/main.css` | No changes expected unless a state indicator label is added to the UI |
| `index.html` | No changes expected |

## Architecture Notes

### Current signal flow (T1.x result)
```
BRAIN.update() @ 500ms
  -> updateDrives()
  -> stimulate sensory neurons
  -> runconnectome()
  -> motorcontrol() -> accumWalkLeft/Right/Flight/Feed/Groom/Startle
  -> accumleft = accumWalkLeft, accumright = accumWalkRight

update() @ 60fps
  -> speed += speedChangeInterval  (from targetSpeed computed in updateBrain)
  -> facingDir tracks targetDir
  -> fly.x/y += cos/sin * speed

draw() @ 60fps
  -> drawFlyBody()
    -> drawWing(side)       // always folded
    -> drawLegs(isMoving)   // tripod gait if speed > 0.15
    -> drawAbdomen/Thorax/Head/Eyes/Antennae
    -> drawProboscis()      // COMMENTED OUT
```

### Key anim object (lives on `anim` in main.js:239)
- `walkPhase`: phase counter for tripod gait, advanced by `spd * 0.5` each draw call
- `antennaTwitchL/R`, `antennaTimer`: antenna idle twitch state
- `legJitter[]`, `legJitterTimer`: idle leg micro-movement
- `wingMicro`, `wingMicroTimer`: subtle wing idle flutter
- T2.1 needs to ADD to `anim`: `groomPhase`, `proboscisExtend` (0-1), `wingSpread` (0-1), `startleFreeze`, `behaviorBlend` timer

### Leg drawing architecture (main.js:589)
- `drawLegs(isMoving)` takes a bool -- needs to become `drawLegs(behaviorState)` or take extra anim params
- Tripod groups A=[0,3,4], B=[1,2,5]. `walkOffset = sin(phase) * 0.35` per-leg
- For grooming: front legs (0,1 = L1/R1) need to swing inward and cross-rub. Current code will fight this if `isMoving` is still wired to speed
- For startle: a jump impulse should override the speed interpolation system temporarily

### Wing drawing architecture (main.js:375)
- `drawWing(side)` has hardcoded `ctx.rotate(side * 0.15 + microOffset * 0.02)` -- always folded
- Flight spread needs to rotate wings outward by ~0.8-1.2 radians from body axis
- Wing spread should animate via `anim.wingSpread` (0=folded, 1=fully spread)

### Phototaxis gap
- `BRAIN.stimulate.lightDirection` exists in connectome.js but the light tool only cycles intensity level, never sets a direction
- For phototaxis, either: (a) set a fixed direction (e.g., toward canvas edge or a static 0-radian angle), or (b) steer toward brightest area based on light level cycling. Simplest: when phototaxis active, steer toward a target point (screen center or a random bright-zone point).

### accumStartle source
- `accumStartle` reads `DN_STARTLE` neuron's `thisState` -- NOT a motor neuron, so it's NOT drained each tick like the others. This means it accumulates between ticks. The state machine should use a threshold (e.g., > 30) to detect startle rather than treating it like a continuous accumulator.

## Suggested Approach

1. **Add `fly.behaviorState` and `fly.behaviorTimer`** to the fly object (or a separate `STATE` object). States: `'idle'`, `'walk'`, `'explore'`, `'groom'`, `'feed'`, `'startle'`, `'fly'`, `'rest'`, `'phototaxis'`.

2. **Add `updateBehaviorState()`** called inside `updateBrain()` (i.e., on the 500ms tick). Reads accumulators and drives to transition states. Priority order (high to low): `startle > fly > feed > groom > rest > phototaxis > explore > walk > idle`.

3. **Wire movement to behavioral state** inside `update()`:
   - `walk/explore/phototaxis`: current accumleft/right -> speed/dir (existing)
   - `feed`: speed = 0 (or near 0)
   - `groom`: speed = 0
   - `startle`: freeze 200ms then burst (impulse to targetSpeed)
   - `fly`: higher max speed, erratic direction changes
   - `rest`: speed rapidly decays to 0

4. **Extend `drawFlyBody()`** to dispatch per-state drawing:
   - Pass `fly.behaviorState` into draw helpers
   - `drawLegs(behaviorState)`: tripod for walk/explore, grooming rubbing for groom, jump extension for startle, tucked for fly
   - `drawWing(side, wingSpread)`: add spread parameter; animate spread for fly/startle
   - Call `drawProboscis()` with `anim.proboscisExtend` when in feed state

5. **Tuning in `constants.js`**: The main gap is that `accumFeed` and `accumGroom` may never reach actionable thresholds because their pathway (SEZ_FEED -> MN_PROBOSCIS, SEZ_GROOM -> MN_LEG_L1) competes heavily with walking suppression. Consider raising `SEZ_FEED` weight to `MN_PROBOSCIS` to 14, and `SEZ_GROOM` to `MN_LEG_L1`/`MN_LEG_R1` to 10. Check `DRIVE_GROOM` -> `SEZ_GROOM` = 6 is sufficient.

## Risks and Constraints

- **Grooming leg animation requires a new anim mode** that overrides the tripod gait. The front legs need to cross in front of the head (swing to center, rub). This requires passing extra state into `drawLegs` and branching on behavior -- not just an `isMoving` bool.
- **Startle impulse vs. smooth interpolation**: the current `speedChangeInterval` system is designed for smooth ramp-up. A startle jump needs to bypass this with a direct `speed = N` assignment followed by a timer to resume normal interpolation.
- **State machine priority collisions**: when fear > 0.7 AND hunger > 0.7, startle and feed both want to fire. Priority order must be explicitly coded; accumulator thresholds must be tuned so only one "wins" clearly.
- **`accumStartle` is NOT drained** between ticks (unlike motor neurons). After a startle event, `DN_STARTLE` will hold a high value for multiple ticks. The state machine must enforce a minimum time-in-state (e.g., 1s cooldown after startle) to prevent re-triggering.
- **Phototaxis needs a direction target** -- the current light tool provides no spatial direction. Either fix the tool to set `lightDirection` or implement phototaxis as "walk toward screen center when light is bright" as a placeholder.
- **`drawFlyBody` currently reads `speed` directly** for `isMoving`. After the state machine, the source of truth for animation should be `fly.behaviorState`, not `speed`. Refactor `isMoving` usage inside `drawFlyBody` after state machine is in place.
- **All code stays in 3 files** -- no new files. The state machine should be added as a new section in `main.js`, analogous to how `connectome.js` sections are labeled.
