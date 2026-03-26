# Plan: T5.1

## Dependencies
- list: [] (no new dependencies)
- commands: [] (no install commands)

## File Operations (in execution order)

### 1. MODIFY js/connectome.js
- operation: MODIFY
- reason: Add windDirection field to BRAIN.stimulate; remove Math.max(0.3, ...) floor from wind MECH_JO stimulation so weak wind produces less fear; reset windDirection on wind stimulus clear

#### Change A: Add windDirection to BRAIN.stimulate
- anchor: `windStrength: 0,       // 0-1`
- After the line `windStrength: 0,       // 0-1` (line 141), add a new field:
  ```javascript
  windDirection: 0,      // radians, direction wind is blowing FROM (math convention: 0=right, PI/2=up)
  ```

#### Change B: Remove windStrength floor in wind MECH_JO stimulation
- anchor: `var windScale = Math.max(0.3, BRAIN.stimulate.windStrength);`
- Replace line 328:
  ```javascript
  var windScale = Math.max(0.3, BRAIN.stimulate.windStrength);
  ```
  with:
  ```javascript
  var windScale = BRAIN.stimulate.windStrength;
  ```
  This makes weak wind produce proportionally less MECH_JO activation, so weak wind no longer triggers startle/fly.

---

### 2. MODIFY js/main.js
- operation: MODIFY
- reason: Add wind-direction tracking in input handlers, add brace behavior state to state machine, add brace animation in drawLegs and wind-sensing in drawAntennae, reset windDirection in visibility handler and wind reset timer

#### Change A: Add windDirection computation to handleCanvasMousemove
- anchor: `BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);` (line 366, inside handleCanvasMousemove)
- After the line `BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);` and before the line `windArrowEnd = { x: event.clientX, y: event.clientY };`, insert:
  ```javascript
  BRAIN.stimulate.windDirection = Math.atan2(-(dy), dx);
  ```
  This computes wind direction in math convention (negated Y for canvas→math conversion, per known pattern #8). The direction represents where the wind is blowing FROM (drag start to cursor = wind flow direction).

#### Change B: Add windDirection computation to handleCanvasMouseup
- anchor: `BRAIN.stimulate.windStrength = Math.max(0.1, Math.min(1, 1 - distToFly / 200));` (line 378, short-drag case)
- In the short-drag case (dragDist < 5), after the line `BRAIN.stimulate.windStrength = Math.max(0.1, Math.min(1, 1 - distToFly / 200));`, add:
  ```javascript
  BRAIN.stimulate.windDirection = Math.atan2(-(fly.y - event.clientY), fly.x - event.clientX);
  ```
  This computes wind direction as blowing from click point toward fly. Uses negated Y for canvas→math conversion.

- anchor: `BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);` (line 380, long-drag case in handleCanvasMouseup)
- In the long-drag case (else branch), after the line `BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);`, add:
  ```javascript
  BRAIN.stimulate.windDirection = Math.atan2(-(dy), dx);
  ```

#### Change C: Add windDirection to handleCanvasMousedown air tool init
- anchor: `BRAIN.stimulate.windStrength = 0.3;` (line 355, inside handleCanvasMousedown air tool branch)
- After the line `BRAIN.stimulate.windStrength = 0.3;`, add:
  ```javascript
  BRAIN.stimulate.windDirection = 0;
  ```
  Initializes windDirection to 0 at drag start; it will be updated by mousemove.

#### Change D: Reset windDirection in tab-resume handler
- anchor: `BRAIN.stimulate.windStrength = 0;` (line 257, inside visibilitychange handler)
- After the line `BRAIN.stimulate.windStrength = 0;` (in the tab-resume else branch), add:
  ```javascript
  BRAIN.stimulate.windDirection = 0;
  ```

#### Change E: Reset windDirection in wind reset timer
- anchor: `BRAIN.stimulate.windStrength = 0;` (line 1483, inside windResetTime block)
- After the line `BRAIN.stimulate.windStrength = 0;` (inside the `if (windResetTime > 0 && Date.now() >= windResetTime)` block), add:
  ```javascript
  BRAIN.stimulate.windDirection = 0;
  ```

#### Change F: Add brace to BEHAVIOR_MIN_DURATION
- anchor: `startle: 800,` (line 57, last entry in BEHAVIOR_MIN_DURATION)
- After the line `startle: 800,`, add:
  ```javascript
  brace: 500,
  ```

#### Change G: Add brace to BEHAVIOR_COOLDOWN
- anchor: `feed: 1000,` (line 65, last entry in BEHAVIOR_COOLDOWN)
- After the line `feed: 1000,`, add:
  ```javascript
  brace: 1000,
  ```

#### Change H: Insert brace into evaluateBehaviorEntry between groom and rest
- anchor: lines 474-477 in evaluateBehaviorEntry:
  ```javascript
  	if (BRAIN.accumGroom > BEHAVIOR_THRESHOLDS.groom && !isCoolingDown('groom', now)) {
  		return 'groom';
  	}
  	if (BRAIN.drives.fatigue > BEHAVIOR_THRESHOLDS.restFatigue) {
  ```
- After the closing `}` of the groom check (after `return 'groom'; }`) and before the `if (BRAIN.drives.fatigue > BEHAVIOR_THRESHOLDS.restFatigue) {` line, insert:
  ```javascript
  	if (BRAIN.stimulate.wind && BRAIN.stimulate.windStrength < 0.5 &&
  		BRAIN.accumStartle < BEHAVIOR_THRESHOLDS.startle && !isCoolingDown('brace', now)) {
  		return 'brace';
  	}
  ```
  Entry condition: wind is active AND windStrength is below 0.5 (weak-to-moderate) AND startle threshold not reached AND not cooling down from previous brace.

#### Change I: Add brace to syncBrainFlags as non-moving
- anchor: `BRAIN._isMoving = (s === 'walk' || s === 'explore' || s === 'phototaxis' ||` (line 557)
- No change needed to this line. The brace state is not in the moving list, so `BRAIN._isMoving` will be false for brace by default. This is correct — brace is non-moving.

#### Change J: Add brace branch to computeMovementForBehavior
- anchor: `} else if (state === 'groom' || state === 'rest') {` (line 638)
- Replace the line:
  ```javascript
  	} else if (state === 'groom' || state === 'rest') {
  ```
  with:
  ```javascript
  	} else if (state === 'brace') {
  		targetSpeed = 0;
  		speedChangeInterval = -speed * 0.1;
  		// Orient to face into the wind (toward wind source = windDirection + PI)
  		var braceDir = normalizeAngle(BRAIN.stimulate.windDirection + Math.PI);
  		var braceDiff = normalizeAngle(braceDir - targetDir);
  		targetDir += braceDiff * 0.8;
  		targetDir = normalizeAngle(targetDir);
  	} else if (state === 'groom' || state === 'rest') {
  ```
  The fly faces into the wind source (windDirection + PI). Uses normalizeAngle for angle difference (per known pattern #9). The 0.8 blend factor provides a strong but not instant turn toward wind source. normalizeAngle on targetDir prevents unbounded growth (per known pattern #10).

#### Change K: Add brace to applyBehaviorMovement speed-damping block
- anchor: `if (behavior.current === 'groom' ||` (line 671)
- Replace:
  ```javascript
  	if (behavior.current === 'groom' ||
  		behavior.current === 'rest' || behavior.current === 'idle') {
  ```
  with:
  ```javascript
  	if (behavior.current === 'groom' ||
  		behavior.current === 'rest' || behavior.current === 'idle' ||
  		behavior.current === 'brace') {
  ```

#### Change L: Add isBracing flag and brace animation branch to drawLegs
- anchor: `var isResting = (state === 'rest');` (line 1219)
- After the line `var isResting = (state === 'rest');`, add:
  ```javascript
  	var isBracing = (state === 'brace');
  ```

- anchor: (in the if/else chain inside drawLegs, the else block at line 1299-1301):
  ```javascript
  	} else if (isResting) {
  		// Slightly tucked with slow jitter
  		hipMod *= 0.7;
  		jitter = anim.legJitter[legIdx] * 0.3;
  	} else {
  ```
- Insert a new branch between the isResting branch and the final else. Replace:
  ```javascript
  	} else if (isResting) {
  		// Slightly tucked with slow jitter
  		hipMod *= 0.7;
  		jitter = anim.legJitter[legIdx] * 0.3;
  	} else {
  ```
  with:
  ```javascript
  	} else if (isResting) {
  		// Slightly tucked with slow jitter
  		hipMod *= 0.7;
  		jitter = anim.legJitter[legIdx] * 0.3;
  	} else if (isBracing) {
  		// Widened stance with suppressed jitter to show bracing
  		hipMod *= 1.1;
  		jitter = anim.legJitter[legIdx] * 0.1;
  	} else {
  ```

#### Change M: Add wind-sensing antenna bias to drawAntennae
- anchor: `var baseAngle = -Math.PI / 2 + side * 0.5 + twitch;` (line 1161, inside drawAntennae)
- Replace:
  ```javascript
  		var baseAngle = -Math.PI / 2 + side * 0.5 + twitch;
  ```
  with:
  ```javascript
  		var baseAngle = -Math.PI / 2 + side * 0.5 + twitch;

  		// Wind-sensing posture: bias antennae toward wind direction
  		if (BRAIN.stimulate.wind || behavior.current === 'brace') {
  			// Convert world-space windDirection to body-local frame.
  			// The canvas transform is: rotate(-facingDir + PI/2), so body-local
  			// "forward" (-Y in body space) corresponds to facingDir in world space.
  			// Body-local angle of wind = windDirection - facingDir, then rotate by
  			// PI/2 because body space has forward = -Y (up on canvas).
  			var localWindAngle = normalizeAngle(BRAIN.stimulate.windDirection - facingDir + Math.PI / 2);
  			// Blend antenna toward wind source with modest strength
  			var windBias = normalizeAngle(localWindAngle - baseAngle) * 0.3;
  			baseAngle += windBias;
  		}
  ```
  This converts world-space windDirection to body-local coordinates accounting for the `ctx.rotate(-facingDir + Math.PI / 2)` transform. The 0.3 blend produces a subtle but visible antenna bias toward the wind direction.

## Verification
- build: N/A (no build step — pure browser JavaScript loaded via script tags)
- lint: N/A (no linter configured)
- test: N/A (no existing test suite)
- smoke: Open index.html in a browser. Select the Air tool. (1) Click and release near the fly without dragging — verify weak wind causes the fly to brace (slow down, widen stance) and orient toward the wind source, not startle. (2) Click and drag a long distance — verify strong wind (long drag) causes startle/fly escape as before. (3) During brace, verify antennae visually bias toward the wind direction. (4) Verify that after 2 seconds the wind stimulus clears and the fly returns to idle. (5) Switch tabs and return — verify no stuck wind/brace state.

## Constraints
- Do not modify js/constants.js (read-only weights)
- Do not modify index.html or css/main.css (no UI changes needed for this task)
- Do not add new files
- Do not add new dependencies or build steps
- Do not change the BRAIN.dendriteAccumulateScaled function signature
- Do not modify the connectome weight values — only the scale parameter passed to dendriteAccumulateScaled for wind
- When computing angles, always negate canvas Y (use `Math.atan2(-dy, dx)`) per known pattern #8
- Always normalize angle differences to [-PI, PI] before blending per known pattern #9
- Normalize targetDir after modification per known pattern #10
- The brace behavior entry condition must check `BRAIN.stimulate.wind && BRAIN.stimulate.windStrength < 0.5 && BRAIN.accumStartle < BEHAVIOR_THRESHOLDS.startle && !isCoolingDown('brace', now)` — all four conditions are required
