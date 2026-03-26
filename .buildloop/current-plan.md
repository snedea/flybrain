# Plan: T2.1

## Dependencies
- list: [] (vanilla JS, no packages)
- commands: [] (no install commands)

## File Operations (in execution order)

### 1. MODIFY js/constants.js
- operation: MODIFY
- reason: Tune connectome weights so feed/groom accumulators reach actionable thresholds. Currently SEZ_FEED and SEZ_GROOM pathways are too weak to produce sustained behavioral output.

#### Change A: Increase SEZ_FEED -> MN_PROBOSCIS
- anchor: `MN_PROBOSCIS: 10,    // extend proboscis`
- Replace `MN_PROBOSCIS: 10,` with `MN_PROBOSCIS: 14,`

#### Change B: Increase SEZ_GROOM -> MN_LEG_L1
- anchor: `MN_LEG_L1: 7,        // front left leg (grooming effector)`
- Replace `MN_LEG_L1: 7,` with `MN_LEG_L1: 10,`

#### Change C: Increase SEZ_GROOM -> MN_LEG_R1
- anchor: `MN_LEG_R1: 7,        // front right leg (grooming effector)`
- Replace `MN_LEG_R1: 7,` with `MN_LEG_R1: 10,`

#### Change D: Increase DRIVE_GROOM -> SEZ_GROOM
- anchor (inside DRIVE_GROOM block): `SEZ_GROOM: 6,         // grooming drive triggers grooming command`
- Replace `SEZ_GROOM: 6,` with `SEZ_GROOM: 8,`

---

### 2. MODIFY index.html
- operation: MODIFY
- reason: Add a behavior state label element in the bottom panel to display the current behavioral state.
- anchor: `<div id="drive-meters">`

#### HTML Changes
Insert a new `drive-row` as the FIRST child of `<div id="drive-meters">`:

```html
<div id="drive-meters">
    <div class="drive-row">
        <span class="drive-label">State</span>
        <span id="behaviorState" class="behavior-state">idle</span>
    </div>
```

The existing drive rows (Hunger, Fear, Fatigue, Curiosity) remain unchanged below this new row.

---

### 3. MODIFY css/main.css
- operation: MODIFY
- reason: Add styling for the behavior state label.
- anchor: `#driveCuriosity {`

#### CSS Changes
Insert the following rule block AFTER the `#driveCuriosity` block (after `background: var(--success);` and its closing `}`):

```css
.behavior-state {
    font-size: 0.7rem;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-weight: 600;
}
```

---

### 4. MODIFY js/main.js
- operation: MODIFY
- reason: Add the behavioral state machine, per-state animation, movement overrides, and update all drawing functions to respond to behavior state. This is the primary file for T2.1.

All changes below are sub-operations within this single file.

---

#### 4A. Add behavior constants and state object

- anchor: `var frameCount = 0;`
- Insert the following block AFTER `var frameCount = 0;`:

```js
// ============================================================
// BEHAVIOR STATE MACHINE
// ============================================================

// Minimum time (ms) the fly must stay in a state before transitioning out
var BEHAVIOR_MIN_DURATION = {
	idle: 0,
	walk: 500,
	explore: 1000,
	phototaxis: 1000,
	rest: 3000,
	groom: 2000,
	feed: 2000,
	fly: 1500,
	startle: 800,
};

// Cooldown (ms) after exiting a state before it can be re-entered
var BEHAVIOR_COOLDOWN = {
	startle: 2000,
	fly: 1000,
	groom: 3000,
	feed: 1000,
};

// Accumulator thresholds for entering each state
var BEHAVIOR_THRESHOLDS = {
	startle: 30,
	fly: 15,
	feed: 8,
	groom: 8,
	walk: 5,
	restFatigue: 0.7,
	exploreCuriosity: 0.4,
	phototaxisLight: 0.5,
};

// The behavior state object
var behavior = {
	current: 'idle',
	previous: 'idle',
	enterTime: Date.now(),
	cooldowns: {},
	startlePhase: 'none',
	startleFreezeEnd: 0,
};
```

---

#### 4B. Add new fields to anim object

- anchor: `wingMicroTimer: 0,`
- Insert the following 3 fields AFTER `wingMicroTimer: 0,` (before the closing `};` of `var anim`):

```js
	// Behavior animation state (T2.1)
	groomPhase: 0,
	proboscisExtend: 0,
	wingSpread: 0,
```

---

#### 4C. Add behavior helper functions

- anchor: `function cycleLightLevel() {`
- Insert the following function block BEFORE `function cycleLightLevel()`:

##### Function: hasNearbyFood
```js
/**
 * Returns true if any food item is within 50px of the fly.
 */
function hasNearbyFood() {
	for (var i = 0; i < food.length; i++) {
		if (Math.hypot(fly.x - food[i].x, fly.y - food[i].y) <= 50) return true;
	}
	return false;
}
```
- signature: `function hasNearbyFood()`
- purpose: Check if any food is within interaction range of the fly
- logic:
  1. Loop through `food` array
  2. Compute distance from fly.x/y to each food item
  3. Return true if any food within 50px
  4. Return false if none found
- returns: boolean

##### Function: isCoolingDown
```js
/**
 * Returns true if the given state is in its cooldown period.
 */
function isCoolingDown(state, now) {
	return behavior.cooldowns[state] !== undefined && now < behavior.cooldowns[state];
}
```
- signature: `function isCoolingDown(state, now)`
- purpose: Check if a behavior state is still in cooldown
- logic:
  1. Look up `behavior.cooldowns[state]`
  2. Return true if it exists and `now < cooldowns[state]`
- returns: boolean

##### Function: evaluateBehaviorEntry
```js
/**
 * Evaluates accumulator outputs and drives to determine which behavior
 * state should be active. Returns the state name string.
 * Priority order (highest first): startle, fly, feed, groom, rest, phototaxis, explore, walk, idle.
 */
function evaluateBehaviorEntry() {
	var now = Date.now();
	var totalWalk = BRAIN.accumWalkLeft + BRAIN.accumWalkRight;

	if (BRAIN.accumStartle > BEHAVIOR_THRESHOLDS.startle && !isCoolingDown('startle', now)) {
		return 'startle';
	}
	if (BRAIN.accumFlight > BEHAVIOR_THRESHOLDS.fly && !isCoolingDown('fly', now)) {
		return 'fly';
	}
	if (BRAIN.accumFeed > BEHAVIOR_THRESHOLDS.feed && hasNearbyFood() && !isCoolingDown('feed', now)) {
		return 'feed';
	}
	if (BRAIN.accumGroom > BEHAVIOR_THRESHOLDS.groom && !isCoolingDown('groom', now)) {
		return 'groom';
	}
	if (BRAIN.drives.fatigue > BEHAVIOR_THRESHOLDS.restFatigue) {
		return 'rest';
	}
	if (BRAIN.stimulate.lightLevel > BEHAVIOR_THRESHOLDS.phototaxisLight &&
		BRAIN.drives.curiosity > 0.2 && totalWalk > 3) {
		return 'phototaxis';
	}
	if (totalWalk > BEHAVIOR_THRESHOLDS.walk &&
		BRAIN.drives.curiosity > BEHAVIOR_THRESHOLDS.exploreCuriosity) {
		return 'explore';
	}
	if (totalWalk > BEHAVIOR_THRESHOLDS.walk) {
		return 'walk';
	}
	return 'idle';
}
```
- signature: `function evaluateBehaviorEntry()`
- purpose: Determine which behavior state should be active based on accumulator values and drives
- logic:
  1. Read `Date.now()` and compute `totalWalk = accumWalkLeft + accumWalkRight`
  2. Check states in strict priority order (startle first, idle last)
  3. Each check tests: accumulator above threshold AND not in cooldown (AND extra conditions for feed/phototaxis/explore)
  4. Feed additionally requires `hasNearbyFood()` to be true
  5. Phototaxis requires `lightLevel > 0.5`, `curiosity > 0.2`, `totalWalk > 3`
  6. Explore requires `curiosity > 0.4`
  7. Return the first matching state name, or 'idle' if none match
- returns: string (state name)

##### Function: updateBehaviorState
```js
/**
 * Called on the 500ms brain tick. Evaluates state transitions and
 * updates BRAIN behavior flags for the next tick's drive computation.
 */
function updateBehaviorState() {
	var now = Date.now();
	var elapsed = now - behavior.enterTime;
	var minDur = BEHAVIOR_MIN_DURATION[behavior.current] || 0;

	// Do not transition if minimum duration has not elapsed
	if (elapsed < minDur) {
		// Update BRAIN flags based on current state (for drive computation)
		syncBrainFlags();
		return;
	}

	var newState = evaluateBehaviorEntry();

	if (newState !== behavior.current) {
		// Set cooldown for the state being exited
		if (BEHAVIOR_COOLDOWN[behavior.current]) {
			behavior.cooldowns[behavior.current] = now + BEHAVIOR_COOLDOWN[behavior.current];
		}
		behavior.previous = behavior.current;
		behavior.current = newState;
		behavior.enterTime = now;

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
	}

	syncBrainFlags();
}
```
- signature: `function updateBehaviorState()`
- purpose: Transition behavior state based on accumulator evaluation; drain DN_STARTLE on startle entry
- logic:
  1. Compute elapsed time since entering current state
  2. If elapsed < minDuration for current state, skip transition, call syncBrainFlags(), return
  3. Call evaluateBehaviorEntry() to get candidate state
  4. If candidate differs from current:
     a. Set cooldown timer for exiting state (if it has a cooldown)
     b. Record previous state
     c. Set new current state and reset enterTime
     d. If entering startle: set startlePhase='freeze', set startleFreezeEnd = now + 200, zero out DN_STARTLE postSynaptic in both state buffers
     e. Else: set startlePhase='none'
  5. Call syncBrainFlags()
- calls: evaluateBehaviorEntry(), syncBrainFlags(), isCoolingDown (transitively)
- returns: void

##### Function: syncBrainFlags
```js
/**
 * Syncs BRAIN._isMoving/_isFeeding/_isGrooming flags with the
 * behavioral state machine so that drive updates in the next
 * brain tick reflect actual behavior, not just accumulator values.
 */
function syncBrainFlags() {
	var s = behavior.current;
	BRAIN._isMoving = (s === 'walk' || s === 'explore' || s === 'phototaxis' ||
		s === 'fly' || (s === 'startle' && behavior.startlePhase === 'burst'));
	BRAIN._isFeeding = (s === 'feed');
	BRAIN._isGrooming = (s === 'groom');
}
```
- signature: `function syncBrainFlags()`
- purpose: Set BRAIN._isMoving/Feeding/Grooming based on behavior state, overriding accumulator-based flags set inside BRAIN.update()
- logic:
  1. Read behavior.current
  2. Set `BRAIN._isMoving` true for walk/explore/phototaxis/fly/startle-burst
  3. Set `BRAIN._isFeeding` true only for feed
  4. Set `BRAIN._isGrooming` true only for groom
- returns: void

##### Function: computeMovementForBehavior
```js
/**
 * Computes targetDir, targetSpeed, speedChangeInterval based on the
 * current behavioral state. Called on the 500ms brain tick.
 * Replaces the old hardcoded accumleft/right -> speed/dir computation.
 */
function computeMovementForBehavior() {
	var scalingFactor = 20;
	var state = behavior.current;

	if (state === 'walk' || state === 'explore') {
		var newDir = (BRAIN.accumleft - BRAIN.accumright) / scalingFactor;
		targetDir = facingDir + newDir * Math.PI;
		targetSpeed = (Math.abs(BRAIN.accumleft) + Math.abs(BRAIN.accumright)) / (scalingFactor * 5);
		speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 1.5);
		if (state === 'explore') {
			targetDir += (Math.random() - 0.5) * 0.3;
		}
	} else if (state === 'phototaxis') {
		// Steer toward canvas center (light source placeholder)
		var dx = window.innerWidth / 2 - fly.x;
		var dy = -(window.innerHeight / 2 - fly.y);
		targetDir = Math.atan2(dy, dx);
		targetSpeed = (Math.abs(BRAIN.accumleft) + Math.abs(BRAIN.accumright)) / (scalingFactor * 5);
		if (targetSpeed < 0.3) targetSpeed = 0.3;
		speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 1.5);
	} else if (state === 'fly') {
		var newDir = (BRAIN.accumleft - BRAIN.accumright) / scalingFactor;
		targetDir = facingDir + newDir * Math.PI + (Math.random() - 0.5) * 0.2;
		targetSpeed = ((Math.abs(BRAIN.accumleft) + Math.abs(BRAIN.accumright)) / (scalingFactor * 5)) * 2.5;
		if (targetSpeed < 1.5) targetSpeed = 1.5;
		speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 0.5);
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
	} else if (state === 'feed' || state === 'groom' || state === 'rest') {
		targetSpeed = 0;
		speedChangeInterval = -speed * 0.1;
	} else {
		// idle
		targetSpeed = 0;
		speedChangeInterval = -speed * 0.05;
	}
}
```
- signature: `function computeMovementForBehavior()`
- purpose: Set global targetDir, targetSpeed, speedChangeInterval based on behavior state
- logic:
  1. For walk/explore: use existing accumleft/right -> dir/speed formula. Explore adds random 0.3rad drift to targetDir.
  2. For phototaxis: compute angle from fly position to canvas center using `Math.atan2`. Y is inverted (negative of screen delta) because `fly.y -= sin(facingDir) * speed`. Minimum targetSpeed = 0.3.
  3. For fly: same as walk but speed multiplied by 2.5, minimum 1.5, faster acceleration (scalingFactor * 0.5), random 0.2rad direction jitter.
  4. For startle-freeze: targetSpeed = 0, rapid decel via speedChangeInterval = -speed * 0.5.
  5. For startle-burst: reverse direction (facingDir + PI + jitter), targetSpeed = 0.5, slow decay.
  6. For feed/groom/rest: targetSpeed = 0, gradual decel via speedChangeInterval = -speed * 0.1.
  7. For idle: targetSpeed = 0, very slow decel via speedChangeInterval = -speed * 0.05.
- returns: void (sets globals)

##### Function: applyBehaviorMovement
```js
/**
 * Called every frame (60fps) BEFORE speed interpolation.
 * Handles frame-rate-dependent overrides: startle freeze/burst transitions,
 * and speed clamping for stationary behaviors.
 */
function applyBehaviorMovement() {
	if (behavior.current === 'startle') {
		var now = Date.now();
		if (behavior.startlePhase === 'freeze') {
			speed = 0;
			speedChangeInterval = 0;
			if (now >= behavior.startleFreezeEnd) {
				behavior.startlePhase = 'burst';
				speed = 3.0;
				targetDir = facingDir + Math.PI + (Math.random() - 0.5) * 0.5;
				targetSpeed = 0.5;
				speedChangeInterval = (targetSpeed - speed) / 30;
			}
		}
	}

	if (behavior.current === 'feed' || behavior.current === 'groom' ||
		behavior.current === 'rest' || behavior.current === 'idle') {
		if (speed > 0.05) {
			speed *= 0.92;
		} else {
			speed = 0;
		}
	}
}
```
- signature: `function applyBehaviorMovement()`
- purpose: Per-frame movement overrides that need 60fps resolution (startle freeze->burst transition, speed clamping for stationary states)
- logic:
  1. If startle + freeze: force speed=0 and speedChangeInterval=0. Check if freeze timer expired. If yes: set startlePhase='burst', set speed=3.0 (direct impulse bypassing interpolation), set targetDir to reverse+jitter, set targetSpeed=0.5 for decay.
  2. If feed/groom/rest/idle: multiply speed by 0.92 each frame if above 0.05, else clamp to 0. This ensures the fly actually stops.
- returns: void (modifies globals)

##### Function: updateAnimForBehavior
```js
/**
 * Called every frame (60fps). Smoothly interpolates animation parameters
 * toward their targets based on the current behavior state.
 */
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
- signature: `function updateAnimForBehavior()`
- purpose: Interpolate anim.wingSpread, anim.proboscisExtend, and advance anim.groomPhase toward their behavior-appropriate targets each frame
- logic:
  1. Set targetWingSpread=1 for fly or startle-burst, else 0. Lerp anim.wingSpread toward target at rate 0.15.
  2. Set targetProboscis=1 for feed, else 0. Lerp anim.proboscisExtend toward target at rate 0.1.
  3. If grooming, advance anim.groomPhase by 0.12 per frame (gives ~7.5 rads/sec at 60fps, roughly one full cycle per second).
- returns: void

---

#### 4D. Modify updateBrain()

- anchor: the entire block from `var scalingFactor = 20;` through `speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 1.5);` (lines 101-107)
- Replace that 7-line block with:

```js
	// Evaluate behavioral state and compute movement
	updateBehaviorState();
	computeMovementForBehavior();
```

- Then, AFTER the drive meter updates (after line 117: `if (driveCuriosityEl) driveCuriosityEl.style.width = ...`), add:

```js
	// Update behavior state label
	var behaviorStateEl = document.getElementById('behaviorState');
	if (behaviorStateEl) behaviorStateEl.textContent = behavior.current;
```

Full modified updateBrain function for reference:
```js
function updateBrain() {
	BRAIN.update();
	for (var postSynaptic in BRAIN.connectome) {
		var psBox = document.getElementById(postSynaptic);
		var neuron = BRAIN.postSynaptic[postSynaptic][BRAIN.thisState];
		psBox.style.backgroundColor = neuronColorMap[postSynaptic] || '#55FF55';
		psBox.style.opacity = Math.min(1, neuron / 50);
	}

	// Evaluate behavioral state and compute movement
	updateBehaviorState();
	computeMovementForBehavior();

	// Update drive meter bars
	var driveHungerEl = document.getElementById('driveHunger');
	var driveFearEl = document.getElementById('driveFear');
	var driveFatigueEl = document.getElementById('driveFatigue');
	var driveCuriosityEl = document.getElementById('driveCuriosity');
	if (driveHungerEl) driveHungerEl.style.width = (BRAIN.drives.hunger * 100) + '%';
	if (driveFearEl) driveFearEl.style.width = (BRAIN.drives.fear * 100) + '%';
	if (driveFatigueEl) driveFatigueEl.style.width = (BRAIN.drives.fatigue * 100) + '%';
	if (driveCuriosityEl) driveCuriosityEl.style.width = (BRAIN.drives.curiosity * 100) + '%';

	// Update behavior state label
	var behaviorStateEl = document.getElementById('behaviorState');
	if (behaviorStateEl) behaviorStateEl.textContent = behavior.current;
}
```

---

#### 4E. Modify update() function

- anchor: `function update() {`

##### E1: Add applyBehaviorMovement() call
Insert `applyBehaviorMovement();` as the FIRST line inside update(), BEFORE `speed += speedChangeInterval;`.

##### E2: Add updateAnimForBehavior() call
Insert `updateAnimForBehavior();` AFTER `frameCount++;` (the last line before the closing `}`).

##### E3: Fix food proximity to set foodContact and gate consumption on feed state
- anchor: the food proximity block starting with `// Food proximity` (line 727)
- Replace the entire block from `// Food proximity` through the end of the for loop (lines 727-736) with:

```js
	// Food proximity
	BRAIN.stimulate.foodContact = false;
	BRAIN.stimulate.foodNearby = false;
	for (var i = 0; i < food.length; i++) {
		var dist = Math.hypot(fly.x - food[i].x, fly.y - food[i].y);
		if (dist <= 50) {
			BRAIN.stimulateFoodSenseNeurons = true;
			BRAIN.stimulate.foodNearby = true;
			if (dist <= 20) {
				BRAIN.stimulate.foodContact = true;
				if (behavior.current === 'feed') {
					food.splice(i, 1);
					i--;
				}
			}
		}
	}
```

Logic changes from original:
1. Reset `foodContact` and `foodNearby` each frame (instead of relying on timeout)
2. Set `BRAIN.stimulate.foodNearby = true` when dist <= 50 (previously only set via backward-compat flag)
3. Set `BRAIN.stimulate.foodContact = true` when dist <= 20 (previously never set -- this drives gustatory neurons)
4. Only splice (consume) food when `behavior.current === 'feed'` (previously consumed food immediately on contact)

##### E4: Update the stimulation timeout
- anchor: `// Reset neuron stimulation after 2 seconds`
- Replace the existing setTimeout block (lines 739-743) with:

```js
	// Reset legacy neuron stimulation flags after 2 seconds
	setTimeout(function () {
		BRAIN.stimulateHungerNeurons = true;
		BRAIN.stimulateNoseTouchNeurons = false;
		BRAIN.stimulateFoodSenseNeurons = false;
	}, 2000);
```

(This is unchanged from original -- keeping it for backward compat. The new foodContact/foodNearby flags are reset per-frame in E3.)

Full modified update function for reference:
```js
function update() {
	applyBehaviorMovement();

	speed += speedChangeInterval;

	var facingMinusTarget = facingDir - targetDir;
	var angleDiff = facingMinusTarget;

	if (Math.abs(facingMinusTarget) > 180) {
		if (facingDir > targetDir) {
			angleDiff = -1 * (360 - facingDir + targetDir);
		} else {
			angleDiff = 360 - targetDir + facingDir;
		}
	}

	if (angleDiff > 0) {
		facingDir -= 0.1;
	} else if (angleDiff < 0) {
		facingDir += 0.1;
	}

	fly.x += Math.cos(facingDir) * speed;
	fly.y -= Math.sin(facingDir) * speed;

	// Screen bounds
	if (fly.x < 0) {
		fly.x = 0;
		BRAIN.stimulateNoseTouchNeurons = true;
	} else if (fly.x > window.innerWidth) {
		fly.x = window.innerWidth;
		BRAIN.stimulateNoseTouchNeurons = true;
	}
	if (fly.y < 0) {
		fly.y = 0;
		BRAIN.stimulateNoseTouchNeurons = true;
	} else if (fly.y > window.innerHeight) {
		fly.y = window.innerHeight;
		BRAIN.stimulateNoseTouchNeurons = true;
	}

	// Food proximity
	BRAIN.stimulate.foodContact = false;
	BRAIN.stimulate.foodNearby = false;
	for (var i = 0; i < food.length; i++) {
		var dist = Math.hypot(fly.x - food[i].x, fly.y - food[i].y);
		if (dist <= 50) {
			BRAIN.stimulateFoodSenseNeurons = true;
			BRAIN.stimulate.foodNearby = true;
			if (dist <= 20) {
				BRAIN.stimulate.foodContact = true;
				if (behavior.current === 'feed') {
					food.splice(i, 1);
					i--;
				}
			}
		}
	}

	// Reset legacy neuron stimulation flags after 2 seconds
	setTimeout(function () {
		BRAIN.stimulateHungerNeurons = true;
		BRAIN.stimulateNoseTouchNeurons = false;
		BRAIN.stimulateFoodSenseNeurons = false;
	}, 2000);

	frameCount++;
	updateAnimForBehavior();
}
```

---

#### 4F. Modify drawFlyBody()

- anchor: `function drawFlyBody() {`
- Replace the ENTIRE function body (lines 335-370) with:

```js
function drawFlyBody() {
	var t = Date.now() / 1000;
	var state = behavior.current;
	var isWalking = (state === 'walk' || state === 'explore' || state === 'phototaxis');

	// Update walk animation phase only when walking
	if (isWalking) {
		var spd = Math.abs(speed);
		anim.walkPhase += spd * 0.5;
	}

	// --- Wings (drawn first, behind body) ---
	drawWing(-1); // left
	drawWing(1);  // right

	// --- Legs (behind body) ---
	drawLegs(state);

	// --- Abdomen ---
	drawAbdomen();

	// --- Thorax ---
	drawThorax();

	// --- Head ---
	drawHead();

	// --- Eyes ---
	drawEyes();

	// --- Antennae ---
	drawAntennae(t);

	// --- Proboscis (shown when extending) ---
	if (anim.proboscisExtend > 0.01) {
		drawProboscis(anim.proboscisExtend);
	}
}
```

Changes from original:
1. `isMoving` replaced by `isWalking` derived from behavior state (not speed)
2. `drawLegs(isMoving)` changed to `drawLegs(state)`
3. Proboscis is drawn conditionally based on `anim.proboscisExtend > 0.01` instead of being commented out
4. `drawProboscis()` called with `anim.proboscisExtend` argument

---

#### 4G. Modify drawWing()

- anchor: `function drawWing(side) {`
- Replace the ENTIRE function body (lines 375-420) with:

```js
function drawWing(side) {
	var wx = BODY.wingOffsetX * side;
	var wy = BODY.wingOffsetY;
	var wl = BODY.wingLength;
	var ww = BODY.wingWidth * side;

	// Wing micro-movement (idle flutter)
	var microOffset = anim.wingMicro * 0.5 * side;

	// Wing spread for flight/startle
	var spreadAngle = anim.wingSpread * 0.85;

	// Flight buzz: rapid oscillation when wings are spread
	var buzzOffset = 0;
	if (anim.wingSpread > 0.5) {
		buzzOffset = Math.sin(Date.now() / 30) * 0.15 * anim.wingSpread;
	}

	ctx.save();
	ctx.translate(wx + microOffset, wy);
	ctx.rotate(side * (0.15 + spreadAngle) + microOffset * 0.02 + buzzOffset);

	// Dynamic wing opacity (more visible when spread)
	var wingAlpha = 0.3 + anim.wingSpread * 0.35;

	// Teardrop wing shape
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.bezierCurveTo(
		ww * 1.2, -wl * 0.2,
		ww * 1.4, -wl * 0.7,
		ww * 0.3, -wl
	);
	ctx.bezierCurveTo(
		-ww * 0.2, -wl * 0.8,
		-ww * 0.1, -wl * 0.3,
		0, 0
	);
	ctx.fillStyle = 'rgba(200, 210, 230, ' + wingAlpha.toFixed(2) + ')';
	ctx.fill();
	ctx.strokeStyle = 'rgba(180, 190, 210, ' + Math.min(1, wingAlpha + 0.2).toFixed(2) + ')';
	ctx.lineWidth = 0.5;
	ctx.stroke();

	// Wing veins
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(ww * 0.5, -wl * 0.8);
	ctx.moveTo(0, -2);
	ctx.lineTo(ww * 1.0, -wl * 0.5);
	ctx.moveTo(0, -1);
	ctx.lineTo(ww * 0.8, -wl * 0.3);
	ctx.strokeStyle = 'rgba(160, 170, 190, ' + Math.min(1, wingAlpha + 0.1).toFixed(2) + ')';
	ctx.lineWidth = 0.3;
	ctx.stroke();

	ctx.restore();
}
```

Changes from original:
1. Added `spreadAngle = anim.wingSpread * 0.85` -- wings rotate outward up to 0.85 radians from body when fully spread
2. Added `buzzOffset` -- rapid sinusoidal oscillation at `Date.now()/30` frequency (about 33Hz) when wingSpread > 0.5
3. Rotation now includes both spread and buzz: `side * (0.15 + spreadAngle) + microOffset * 0.02 + buzzOffset`
4. Wing fill color uses dynamic alpha `wingAlpha = 0.3 + wingSpread * 0.35` (goes from 0.3 transparent to 0.65 semi-opaque)
5. Stroke alpha also dynamic, slightly higher than fill

---

#### 4H. Modify drawLegs()

- anchor: `function drawLegs(isMoving) {`
- Replace the ENTIRE function (lines 589-683) with:

```js
/**
 * Draws all 6 legs with behavior-specific animation.
 * State-dependent modes: tripod gait (walk/explore/phototaxis),
 * grooming rub (groom), tucked (fly/rest), jump pose (startle burst),
 * idle jitter (idle/feed).
 */
function drawLegs(state) {
	var t = Date.now() / 1000;
	var isWalking = (state === 'walk' || state === 'explore' || state === 'phototaxis');
	var isGrooming = (state === 'groom');
	var isFlying = (state === 'fly');
	var isStartleBurst = (state === 'startle' && behavior.startlePhase === 'burst');
	var isStartleFreeze = (state === 'startle' && behavior.startlePhase === 'freeze');
	var isResting = (state === 'rest');

	// Update idle jitter targets periodically
	if (t - anim.legJitterTimer > 1.5 + Math.random() * 2.0) {
		anim.legJitterTimer = t;
		for (var j = 0; j < 6; j++) {
			anim.legJitterTarget[j] = (Math.random() - 0.5) * 0.15;
		}
	}
	for (var j = 0; j < 6; j++) {
		anim.legJitter[j] += (anim.legJitterTarget[j] - anim.legJitter[j]) * 0.05;
	}

	// Update wing micro-movement
	if (t - anim.wingMicroTimer > 2.0 + Math.random() * 3.0) {
		anim.wingMicroTimer = t;
		anim.wingMicroTarget = (Math.random() - 0.5) * 2;
	}
	anim.wingMicro += (anim.wingMicroTarget - anim.wingMicro) * 0.03;

	// Tripod groups
	var groupA = [0, 3, 4];
	var groupB = [1, 2, 5];

	for (var legIdx = 0; legIdx < 6; legIdx++) {
		var pairIdx = Math.floor(legIdx / 2); // 0=front, 1=mid, 2=rear
		var side = (legIdx % 2 === 0) ? -1 : 1; // even=left(-1), odd=right(+1)
		var attach = BODY.legAttach[pairIdx];
		var restAngles = BODY.legRestAngles[pairIdx];

		var hipMod = restAngles.hip;
		var kneeMod = restAngles.knee;
		var walkOffset = 0;
		var jitter = 0;

		if (isWalking) {
			// Tripod gait animation
			var inGroupA = groupA.indexOf(legIdx) !== -1;
			var legPhase = anim.walkPhase + (inGroupA ? 0 : Math.PI);
			walkOffset = Math.sin(legPhase) * 0.35;
		} else if (isGrooming && pairIdx === 0) {
			// Front legs: grooming rub -- swing inward and oscillate
			hipMod = -0.2 + Math.sin(anim.groomPhase) * 0.5;
			kneeMod = -0.6 + Math.sin(anim.groomPhase * 1.3) * 0.2;
		} else if (isFlying) {
			// Tucked legs during flight
			hipMod *= 0.4;
			kneeMod *= 0.3;
		} else if (isStartleBurst && pairIdx >= 1) {
			// Middle and rear legs extend for jump
			hipMod *= 1.5;
			kneeMod *= 0.5;
		} else if (isStartleFreeze) {
			// Legs frozen in current position -- no jitter, no walk
			// Use rest angles as-is (no modification)
		} else if (isResting) {
			// Slightly tucked with slow jitter
			hipMod *= 0.7;
			jitter = anim.legJitter[legIdx] * 0.3;
		} else {
			// idle / feed / default: normal idle jitter
			jitter = anim.legJitter[legIdx];
		}

		// Compute hip and knee angles
		var hipAngle = (hipMod + walkOffset + jitter) * side;
		var kneeAngle = kneeMod * side;

		// Attachment point on body
		var ax = attach.x * side;
		var ay = attach.y;

		// First segment (coxa/femur)
		var baseAngle = Math.PI / 2 * side + hipAngle;
		var seg1EndX = ax + Math.cos(baseAngle) * BODY.legSeg1;
		var seg1EndY = ay + Math.sin(baseAngle) * BODY.legSeg1;

		// Second segment (tibia) -- bends at knee
		var kneeAngleAbs = baseAngle + kneeAngle + side * 0.5;
		var seg2EndX = seg1EndX + Math.cos(kneeAngleAbs) * BODY.legSeg2;
		var seg2EndY = seg1EndY + Math.sin(kneeAngleAbs) * BODY.legSeg2;

		// Third segment (tarsus) -- slight hook
		var tarsusAngle = kneeAngleAbs + side * 0.3;
		var seg3EndX = seg2EndX + Math.cos(tarsusAngle) * BODY.legSeg3;
		var seg3EndY = seg2EndY + Math.sin(tarsusAngle) * BODY.legSeg3;

		// Draw leg segments
		ctx.beginPath();
		ctx.moveTo(ax, ay);
		ctx.lineTo(seg1EndX, seg1EndY);
		ctx.lineTo(seg2EndX, seg2EndY);
		ctx.lineTo(seg3EndX, seg3EndY);
		ctx.strokeStyle = COLORS.leg;
		ctx.lineWidth = 1.4;
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';
		ctx.stroke();

		// Joint dots
		ctx.beginPath();
		ctx.arc(seg1EndX, seg1EndY, 1.2, 0, Math.PI * 2);
		ctx.fillStyle = COLORS.legJoint;
		ctx.fill();

		ctx.beginPath();
		ctx.arc(seg2EndX, seg2EndY, 1.0, 0, Math.PI * 2);
		ctx.fillStyle = COLORS.legJoint;
		ctx.fill();
	}
}
```

Changes from original:
1. Parameter changed from `isMoving` (bool) to `state` (string)
2. Boolean flags derived from state: `isWalking`, `isGrooming`, `isFlying`, `isStartleBurst`, `isStartleFreeze`, `isResting`
3. Leg animation branching:
   - Walking: unchanged tripod gait
   - Grooming (front legs only, pairIdx===0): `hipMod = -0.2 + sin(groomPhase) * 0.5`, `kneeMod = -0.6 + sin(groomPhase * 1.3) * 0.2` -- swings front legs inward and oscillates for rubbing
   - Flying: `hipMod *= 0.4, kneeMod *= 0.3` -- legs tucked close to body
   - Startle burst (middle/rear legs, pairIdx>=1): `hipMod *= 1.5, kneeMod *= 0.5` -- legs extend outward for jump pose
   - Startle freeze: no modification to rest angles, no jitter
   - Resting: `hipMod *= 0.7`, `jitter *= 0.3` -- slightly tucked with reduced jitter
   - Default (idle/feed): normal idle jitter unchanged
4. Segment drawing code (angles, positions, canvas calls) is UNCHANGED from original
5. Wing micro-movement update remains in this function (same location as original)

---

#### 4I. Modify drawProboscis()

- anchor: `function drawProboscis() {`
- Replace the ENTIRE function (lines 569-583) with:

```js
/**
 * Draws the proboscis (retractable feeding tube).
 * @param {number} extend - Extension amount from 0 (retracted) to 1 (fully extended).
 */
function drawProboscis(extend) {
	var len = BODY.proboscisLength * extend;

	ctx.beginPath();
	ctx.moveTo(0, BODY.proboscisBaseY);
	ctx.lineTo(0, BODY.proboscisBaseY - len);
	ctx.strokeStyle = COLORS.proboscis;
	ctx.lineWidth = 1.2;
	ctx.lineCap = 'round';
	ctx.stroke();

	// Tiny tip
	ctx.beginPath();
	ctx.arc(0, BODY.proboscisBaseY - len, 1, 0, Math.PI * 2);
	ctx.fillStyle = COLORS.proboscis;
	ctx.fill();
}
```

Changes from original:
1. Added `extend` parameter (number, 0 to 1)
2. `len` is now `BODY.proboscisLength * extend` instead of full length
3. Tip position uses `BODY.proboscisBaseY - len` instead of `BODY.proboscisBaseY - BODY.proboscisLength`
4. Function is now called from `drawFlyBody()` when `anim.proboscisExtend > 0.01` (see 4F)

---

## Verification

- build: Open `index.html` in a browser (no build step). Verify the page loads without console errors by opening the browser developer console (Cmd+Option+J in Chrome).
- lint: No linter configured. Manually check for syntax errors by loading the page.
- test: No existing tests.
- smoke: Perform the following checks in the browser:
  1. **Walk/Idle**: Load the page. The fly should move around using the tripod gait. The behavior label in the bottom-right panel should show "walk" or "idle" and transition between them. The fly should eventually explore (direction changes) when curiosity is high.
  2. **Feed**: Select the Feed tool, click near the fly to place food. When the fly approaches food, the behavior should transition to "feed", the fly should stop moving, and the proboscis should extend downward from the head. Food is consumed while in feed state.
  3. **Touch/Groom**: Select the Touch tool, click on the fly body. The behavior should briefly show "startle" (freeze then burst away), then after cooldown it may show "groom" (front legs should visibly oscillate in a rubbing motion). The fear drive meter should spike.
  4. **Air/Startle/Fly**: Select the Air tool, click near the fly. On strong wind (drag for high strength), the fly should startle (200ms freeze, then rapid movement) and may enter flight mode (wings spread outward with visible buzz, legs tucked, fast movement).
  5. **Light/Phototaxis**: Click the Light button to cycle to "Bright". When the fly is away from canvas center and curiosity is above 0.2, it should enter "phototaxis" and steer toward the canvas center.
  6. **Rest**: Wait for the fly to accumulate fatigue (fatigue drive > 0.7). The behavior should show "rest", the fly should stop, and legs should appear slightly tucked.
  7. **Transitions**: Observe that behavior transitions are smooth -- wing spread/retract animate gradually, proboscis extends/retracts smoothly, leg gaits blend visually.
  8. **State label**: The behavior state label in the bottom-right panel should update every 500ms and display the current state name (idle, walk, explore, feed, groom, rest, fly, startle, phototaxis).

## Constraints
- Do NOT create any new files. All changes are in the existing 4 files.
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any file in .buildloop/ other than current-plan.md.
- Do NOT add any external dependencies, npm packages, or build tools.
- Do NOT change the 500ms brain tick interval or the 60fps render interval.
- Do NOT modify the BRAIN.setup(), BRAIN.runconnectome(), BRAIN.fireNeuron(), or BRAIN.dendriteAccumulate() functions in connectome.js -- only constants.js weights are tuned.
- Do NOT change the neuron names, region classifications, or motor group definitions in connectome.js.
- Keep the `BRAIN.accumleft` / `BRAIN.accumright` backward-compatible assignments in connectome.js motorcontrol() unchanged.
- The `behavior` object and `anim` extensions must NOT grow without bound (all fields are fixed scalars, not arrays/maps that could accumulate).
- All animation interpolation must use simple lerp (multiply by rate constant) -- no CSS transitions or requestAnimationFrame-based easing libraries.
