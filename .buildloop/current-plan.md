# Plan: D15.1

## Dependencies
- list: [] (no new dependencies)
- commands: [] (none)

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Fix startle burst boomerang trajectory, add behavior-dependent turn speed, snap facingDir on burst entry, remove dead behavior.previous

#### Change A: Add `burstDir` field to behavior object initialization

- anchor: line 81, `var behavior = {`
- Add field `burstDir: 0,` after the `groomLocation: null,` line (line 88)
- Remove field `previous: 'idle',` from the behavior object (line 83)

The behavior object should become:
```js
var behavior = {
	current: 'idle',
	enterTime: Date.now(),
	cooldowns: {},
	startlePhase: 'none',
	startleFreezeEnd: 0,
	groomLocation: null,
	burstDir: 0,
};
```

#### Change B: Remove `behavior.previous = behavior.current;` assignment in updateBehaviorState

- anchor: line 516, `behavior.previous = behavior.current;`
- Delete this entire line. It is dead code -- `behavior.previous` is never read anywhere in the codebase.

#### Change C: Store burstDir once at freeze-to-burst transition in applyBehaviorMovement, and snap facingDir

- anchor: line 659-664 inside `applyBehaviorMovement(dtScale)`:
```js
			if (now >= behavior.startleFreezeEnd) {
				behavior.startlePhase = 'burst';
				speed = 3.0;
				targetDir = facingDir + Math.PI + (Math.random() - 0.5) * 0.5;
				targetSpeed = 0.5;
				speedChangeInterval = (targetSpeed - speed) / 30;
```

Replace with:
```js
			if (now >= behavior.startleFreezeEnd) {
				behavior.startlePhase = 'burst';
				speed = 3.0;
				behavior.burstDir = normalizeAngle(facingDir + Math.PI + (Math.random() - 0.5) * 0.5);
				targetDir = behavior.burstDir;
				facingDir = behavior.burstDir;
				targetSpeed = 0.5;
				speedChangeInterval = (targetSpeed - speed) / 30;
```

Logic:
1. Compute the escape direction (reverse + jitter), normalize it, store in `behavior.burstDir`
2. Set `targetDir` to `behavior.burstDir` so the heading system tracks it
3. Snap `facingDir` to `behavior.burstDir` for instant reversal (the spec says "Freeze 200ms, then jump/fly away" -- the 200ms freeze is the wind-up, burst should be instant direction change)
4. Keep speed/targetSpeed/speedChangeInterval logic unchanged

#### Change D: Make computeMovementForBehavior read behavior.burstDir during startle burst instead of recomputing from facingDir

- anchor: lines 616-625, the startle branch in `computeMovementForBehavior`:
```js
	} else if (state === 'startle') {
		if (behavior.startlePhase === 'freeze') {
			targetSpeed = 0;
			speedChangeInterval = -speed * 0.5;
		} else {
			// burst direction: reverse facing + jitter
			targetDir = facingDir + Math.PI + (Math.random() - 0.5) * 0.5;
			targetSpeed = 0.5;
			speedChangeInterval = (targetSpeed - speed) / 30;
		}
```

Replace with:
```js
	} else if (state === 'startle') {
		if (behavior.startlePhase === 'freeze') {
			targetSpeed = 0;
			speedChangeInterval = -speed * 0.5;
		} else {
			// burst: use the pre-computed escape direction from applyBehaviorMovement freeze-to-burst transition
			targetDir = behavior.burstDir;
			targetSpeed = 0.5;
			speedChangeInterval = (targetSpeed - speed) / 30;
		}
```

Logic:
1. During burst phase, set `targetDir = behavior.burstDir` (computed once at freeze-to-burst transition in Change C)
2. This prevents the boomerang: brain ticks every 500ms no longer recompute targetDir from the (now-approaching) facingDir, so the escape direction stays locked
3. targetSpeed and speedChangeInterval remain unchanged

#### Change E: Replace uniform 0.9 retention factor with behavior-dependent retention in update()

- anchor: lines 1389-1394 in `update(dt)`:
```js
	// Exponential interpolation toward targetDir using shortest-arc angle difference.
	// Retention factor 0.9 matches proboscisExtend (line 691); at dtScale=1 (60fps),
	// facingDir closes 10% of the remaining gap per frame -- fast enough to track
	// quick heading changes but cannot overshoot because it never exceeds the gap.
	var angleDiffTurn = normalizeAngle(targetDir - facingDir);
	facingDir += angleDiffTurn * (1 - Math.pow(0.9, dtScale));
```

Replace with:
```js
	// Exponential interpolation toward targetDir using shortest-arc angle difference.
	// Behavior-dependent retention: fast (0.3) for escape states where near-instant
	// turning is needed at high speed, slow (0.9) for calm states where smooth
	// gentle turns look natural. At dtScale=1 (60fps): 0.3 closes 70% of the gap
	// per frame (~3 frames to 97%), 0.9 closes 10% per frame (~22 frames to 90%).
	var turnRetention;
	if (behavior.current === 'startle' && behavior.startlePhase === 'burst') {
		turnRetention = 0.3;
	} else if (behavior.current === 'fly') {
		turnRetention = 0.4;
	} else {
		turnRetention = 0.9;
	}
	var angleDiffTurn = normalizeAngle(targetDir - facingDir);
	facingDir += angleDiffTurn * (1 - Math.pow(turnRetention, dtScale));
```

Logic:
1. Startle burst: retention 0.3 -- closes 70% of angle gap per frame, ~97% within 3 frames (50ms at 60fps). Combined with Change C's facingDir snap, this ensures any small residual correction also converges near-instantly.
2. Fly state: retention 0.4 -- closes 60% per frame. The fly state adds angular offsets (not PI reversals) so it needs fast but not instant turning during high-speed escape flight.
3. All other states (walk, idle, groom, feed, rest, explore, phototaxis): retention 0.9 -- the original value from D7.2 that correctly fixed oscillation. These are low-speed states where smooth gentle turns are appropriate.

#### Change F: Reset burstDir in visibilitychange resume handler

- anchor: lines 289-294 in the visibilitychange resume handler:
```js
		behavior.startlePhase = 'none';
		behavior.enterTime = Date.now();
		behavior.cooldowns = {};
		speed = 0;
		speedChangeInterval = 0;
```

Add `behavior.burstDir = 0;` after the `behavior.cooldowns = {};` line. Also remove `behavior.previous` if it is still referenced here (verify -- it is not referenced in the resume handler, so no change needed there).

The block becomes:
```js
		behavior.startlePhase = 'none';
		behavior.enterTime = Date.now();
		behavior.cooldowns = {};
		behavior.burstDir = 0;
		speed = 0;
		speedChangeInterval = 0;
```

## Verification
- build: Open `index.html` in a browser (no build step -- vanilla JS project)
- lint: No linter configured for this project
- test: No automated tests exist for this project
- smoke: Open the page in a browser and perform these checks:
  1. Click the touch tool and click directly on the fly body. The fly should freeze for ~200ms, then instantly reverse direction and move away in a straight line (no S-curve, no boomerang back toward original heading). Watch for 2-3 startle events to confirm consistency.
  2. During startle burst, the fly should move decisively in the escape direction from the first frame of burst -- no visible 30px drift in the pre-startle direction.
  3. During idle/walk states, the fly should still turn smoothly and gently with no visible oscillation or jitter (the 0.9 retention is preserved for these states).
  4. Use the air tool to trigger fly state. The fly should turn quickly toward its escape heading during high-speed flight (faster than idle/walk turning, but not instant snap).
  5. Verify `behavior.previous` is no longer in the code by searching the browser console: open dev tools, search source for "behavior.previous" -- should find zero results.

## Constraints
- Do NOT modify any file other than `js/main.js`
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any file in .buildloop/ other than current-plan.md and build-claims.md
- Do NOT change the brain tick interval (500ms setInterval) or the RAF loop structure
- Do NOT change the facingDir interpolation formula structure (`normalizeAngle` + `1 - Math.pow(retention, dtScale)`) -- only change the retention value to be behavior-dependent
- Do NOT change edge avoidance, food seeking, walk, idle, groom, rest, explore, or phototaxis behavior logic
- Do NOT add new dependencies or external libraries
- The `normalizeAngle` helper at main.js:32-37 already exists and must be used (not reimplemented)
- Keep the 0.9 retention for all non-escape states -- D7.2's oscillation fix must be preserved
