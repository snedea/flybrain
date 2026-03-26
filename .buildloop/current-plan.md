# Plan: D3.2

## Dependencies
- list: [] (no new dependencies)
- commands: [] (no install commands)

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Fix four frame-rate-dependent animation interpolations and groom-state location amnesia

There are 6 discrete changes in this file, described below in the order they should be applied. All anchors reference the file as it currently exists.

---

#### Change 1: Add `groomLocation` field to the behavior state object

- anchor: line 79-86, the block starting with `var behavior = {`

**What to do:** Add a `groomLocation` field initialized to `null` to the `behavior` object.

Replace:
```js
var behavior = {
	current: 'idle',
	previous: 'idle',
	enterTime: Date.now(),
	cooldowns: {},
	startlePhase: 'none',
	startleFreezeEnd: 0,
};
```

With:
```js
var behavior = {
	current: 'idle',
	previous: 'idle',
	enterTime: Date.now(),
	cooldowns: {},
	startlePhase: 'none',
	startleFreezeEnd: 0,
	groomLocation: null,
};
```

---

#### Change 2: Store touchLocation in behavior when entering groom state

- anchor: line 440-449, inside `updateBehaviorState()`, the block `if (newState === 'startle') {`

**What to do:** Add an `else if` clause for `newState === 'groom'` that captures `BRAIN.stimulate.touchLocation` into `behavior.groomLocation`. If `touchLocation` is `null` at that moment, default to `'thorax'`.

Replace:
```js
		// Startle: initialize freeze phase and drain DN_STARTLE
		if (newState === 'startle') {
			behavior.startlePhase = 'freeze';
			behavior.startleFreezeEnd = now + 200;
			if (BRAIN.postSynaptic['DN_STARTLE']) {
				BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState] = 0;
				BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState] = 0;
			}
		} else {
			behavior.startlePhase = 'none';
		}
```

With:
```js
		// Startle: initialize freeze phase and drain DN_STARTLE
		if (newState === 'startle') {
			behavior.startlePhase = 'freeze';
			behavior.startleFreezeEnd = now + 200;
			if (BRAIN.postSynaptic['DN_STARTLE']) {
				BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState] = 0;
				BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState] = 0;
			}
		} else {
			behavior.startlePhase = 'none';
		}

		// Groom: snapshot the touch location that triggered grooming
		if (newState === 'groom') {
			behavior.groomLocation = BRAIN.stimulate.touchLocation || 'thorax';
		}
```

---

#### Change 3: Make `updateAnimForBehavior()` accept `dtScale` and apply dt-scaling to wingSpread, proboscisExtend, and groomPhase

- anchor: line 598, `function updateAnimForBehavior() {`

**What to do:**
1. Change the function signature to accept `dtScale` parameter
2. For `anim.wingSpread`: replace the per-frame lerp `+= (target - current) * 0.15` with exponential interpolation using `Math.pow(1 - 0.15, dtScale)` as the retention factor
3. For `anim.proboscisExtend`: replace the per-frame lerp `+= (target - current) * 0.1` with exponential interpolation using `Math.pow(1 - 0.1, dtScale)` as the retention factor
4. For `anim.groomPhase`: multiply the increment `0.12` by `dtScale`

Replace:
```js
function updateAnimForBehavior() {
	var state = behavior.current;

	// Wing spread target
	var targetWingSpread = 0;
	if (state === 'fly' || (state === 'startle' && behavior.startlePhase === 'burst')) {
		targetWingSpread = 1;
	}
	anim.wingSpread += (targetWingSpread - anim.wingSpread) * 0.15;

	// Proboscis extension target
	var targetProboscis = 0;
	if (state === 'feed') {
		targetProboscis = 1;
	}
	anim.proboscisExtend += (targetProboscis - anim.proboscisExtend) * 0.1;

	// Groom phase advances when grooming
	if (state === 'groom') {
		anim.groomPhase += 0.12;
	}
}
```

With:
```js
function updateAnimForBehavior(dtScale) {
	var state = behavior.current;

	// Wing spread target (exponential interpolation for frame-rate independence)
	var targetWingSpread = 0;
	if (state === 'fly' || (state === 'startle' && behavior.startlePhase === 'burst')) {
		targetWingSpread = 1;
	}
	anim.wingSpread += (targetWingSpread - anim.wingSpread) * (1 - Math.pow(0.85, dtScale));

	// Proboscis extension target (exponential interpolation for frame-rate independence)
	var targetProboscis = 0;
	if (state === 'feed') {
		targetProboscis = 1;
	}
	anim.proboscisExtend += (targetProboscis - anim.proboscisExtend) * (1 - Math.pow(0.9, dtScale));

	// Groom phase advances when grooming (linear dt scaling for phase accumulator)
	if (state === 'groom') {
		anim.groomPhase += 0.12 * dtScale;
	}

	// Walk phase advances when walking (linear dt scaling for phase accumulator)
	if (state === 'walk' || state === 'explore' || state === 'phototaxis') {
		var spd = Math.abs(speed);
		anim.walkPhase += spd * 0.5 * dtScale;
	}
}
```

**Explanation of the exponential interpolation:**
- At 60fps, dtScale = 1.0, so `1 - Math.pow(0.85, 1) = 0.15` (same as the original `* 0.15`)
- At 120fps, dtScale = 0.5, so `1 - Math.pow(0.85, 0.5) = 0.0774` (two of these per 60fps frame = 0.149, approximately the same)
- At 30fps, dtScale = 2.0, so `1 - Math.pow(0.85, 2) = 0.2775` (one of these per 60fps pair = similar convergence)
- Similarly for proboscis: `Math.pow(0.9, dtScale)` preserves the per-60fps-frame behavior of `* 0.1`

**Walk phase moved here:** The `walkPhase` increment is moved from `drawFlyBody()` into `updateAnimForBehavior()` where `dtScale` is available. This avoids needing to pass dtScale into the draw path.

---

#### Change 4: Remove walkPhase increment from drawFlyBody()

- anchor: line 830-836, inside `function drawFlyBody()`:
```js
	var isWalking = (state === 'walk' || state === 'explore' || state === 'phototaxis');

	// Update walk animation phase only when walking
	if (isWalking) {
		var spd = Math.abs(speed);
		anim.walkPhase += spd * 0.5;
	}
```

**What to do:** Remove the walkPhase update from drawFlyBody since it was moved to updateAnimForBehavior. Keep the `isWalking` variable declaration since it is used later in the function (for drawing).

Replace:
```js
	var isWalking = (state === 'walk' || state === 'explore' || state === 'phototaxis');

	// Update walk animation phase only when walking
	if (isWalking) {
		var spd = Math.abs(speed);
		anim.walkPhase += spd * 0.5;
	}
```

With:
```js
	var isWalking = (state === 'walk' || state === 'explore' || state === 'phototaxis');
```

---

#### Change 5: Replace live touchLocation reads in drawAbdomen() with behavior.groomLocation

- anchor: line 939, inside `function drawAbdomen()`:
```js
	if (behavior.current === 'groom' && (BRAIN.stimulate.touchLocation === 'abdomen' || BRAIN.stimulate.touchLocation === null)) {
```

**What to do:** Replace `BRAIN.stimulate.touchLocation` with `behavior.groomLocation` in the abdomen curl check. Since `behavior.groomLocation` defaults to `'thorax'` when null (set at groom entry in Change 2), the null check becomes unnecessary -- but we should keep the check for `'abdomen'` and also allow `'thorax'` (thorax groom should also curl abdomen, matching the original null fallback behavior) plus allow null as a safety fallback.

Replace:
```js
	if (behavior.current === 'groom' && (BRAIN.stimulate.touchLocation === 'abdomen' || BRAIN.stimulate.touchLocation === null)) {
```

With:
```js
	if (behavior.current === 'groom' && (behavior.groomLocation === 'abdomen' || behavior.groomLocation === 'thorax')) {
```

**Rationale:** Previously, `touchLocation === null` was the fallback that triggered the abdomen curl during thorax/default grooming. Now `behavior.groomLocation` is `'thorax'` by default (set at groom entry), so we match `'thorax'` explicitly instead of null. This makes the behavior identical: abdomen curls during abdomen-specific and thorax/default grooming.

---

#### Change 6: Replace live touchLocation reads in drawLegs() with behavior.groomLocation

- anchor: line 1162, inside `drawLegs()`:
```js
		} else if (isGrooming) {
			var groomLoc = BRAIN.stimulate.touchLocation || 'thorax';
```

**What to do:** Replace the live touchLocation read with `behavior.groomLocation`.

Replace:
```js
			var groomLoc = BRAIN.stimulate.touchLocation || 'thorax';
```

With:
```js
			var groomLoc = behavior.groomLocation || 'thorax';
```

The `|| 'thorax'` fallback is kept as a safety net for the case where `behavior.groomLocation` is somehow null (e.g., groom state entered through a code path that doesn't set it), but under normal operation `behavior.groomLocation` will already be set to a valid value by Change 2.

---

#### Change 7: Pass dtScale to updateAnimForBehavior() at the call site

- anchor: line 1383, inside `update(dt)`:
```js
	updateAnimForBehavior();
```

**What to do:** Pass `dtScale` (which is already a local variable in `update()`, computed at line 1255 as `var dtScale = dt / (1000 / 60);`) to the function.

Replace:
```js
	updateAnimForBehavior();
```

With:
```js
	updateAnimForBehavior(dtScale);
```

---

## Verification
- build: "No build step -- open index.html in a browser"
- lint: "No linter configured"
- test: "No existing tests"
- smoke: "Open index.html in browser. Verify: (1) wing spread/fold animation plays at the same visual speed regardless of display refresh rate (if possible, test on 60Hz and 120Hz or use browser devtools to throttle), (2) proboscis extension/retraction animation plays smoothly, (3) grooming leg animation does not snap to thorax-mode mid-groom after ~2 seconds -- touch the fly to trigger groom, observe that the groom animation for the touched body part persists for the full groom duration, (4) abdomen curl during groom persists for the full groom duration and does not stop abruptly after ~2 seconds, (5) walk animation phase (leg movement speed) is proportional to fly speed and not double-speed on high-refresh displays"

## Constraints
- Do NOT modify SPEC.md, CLAUDE.md, TASKS.md, or any file in .buildloop/ other than current-plan.md and build-claims.md
- Do NOT add new files -- all changes are within js/main.js
- Do NOT modify the brain tick interval (setInterval at 500ms) or the RAF loop structure
- Do NOT change the touchResetFrame logic itself (line 1376-1380) -- it should still clear BRAIN.stimulate.touchLocation to null. The fix is that drawing code reads from behavior.groomLocation instead of the live stimulus, so the reset no longer causes visual glitches.
- Do NOT modify the `applyTouchTool` function or the wall-collision touch stimulus code
- The exponential interpolation math must use `(1 - Math.pow(retentionFactor, dtScale))` as the lerp factor, NOT `originalFactor * dtScale` (linear scaling of lerp factors is mathematically wrong for exponential decay)
- For phase accumulators (groomPhase, walkPhase), linear `* dtScale` is correct because these are additive per-frame increments, not decay/convergence rates
