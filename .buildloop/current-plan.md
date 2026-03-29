# Plan: T13.3

Mate interaction (spec stretch goal) and courtship behavior.

## Dependencies
- list: [] (no new dependencies -- vanilla JS project)
- commands: [] (none)

## File Operations (in execution order)

### 1. MODIFY js/connectome.js
- operation: MODIFY
- reason: Add `mateNearby` stimulus flag and olfactory stimulation pathway for mate detection. Add `accumCourtship` accumulator.

#### Anchor: `BRAIN.stimulate` object
```js
BRAIN.stimulate = {
```

#### Changes to BRAIN.stimulate
- Add field `mateNearby: false` after `waterContact: false,` (line 139 area)

#### Anchor: BRAIN behavior accumulators
```js
BRAIN.accumHead = 0;
```

#### Changes to accumulators
- Add `BRAIN.accumCourtship = 0;` after `BRAIN.accumHead = 0;` (line 90)
- Add `BRAIN.accumCourtship = 0;` in the backward-compatible section after `BRAIN.accumleft = 0;` line 93

#### Anchor: `BRAIN.update` function, after the foodNearby stimulation block
```js
	// Food nearby (olfactory)
	if (BRAIN.stimulate.foodNearby) {
		BRAIN.dendriteAccumulate('OLF_ORN_FOOD');
	}
```

#### New stimulation block (insert AFTER the foodNearby block, before the food contact block)
- Add:
```js
	// Mate nearby (olfactory -- reuses food odor pathway for pheromone detection)
	if (BRAIN.stimulate.mateNearby) {
		BRAIN.dendriteAccumulate('OLF_ORN_FOOD');
		BRAIN.dendriteAccumulateScaled('DRIVE_CURIOSITY', 0.5);
	}
```

#### Anchor: `BRAIN.motorcontrol` function, after accumStartle section
```js
	if (BRAIN.postSynaptic['DN_STARTLE']) {
		BRAIN.accumStartle = BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState];
	}
```

#### New courtship accumulator computation (insert AFTER accumStartle, BEFORE the floor section)
- Add:
```js
	// Courtship: derives from olfactory activation + low fear + moderate curiosity
	// This is a synthetic accumulator (not directly from motor neurons)
	if (BRAIN.stimulate.mateNearby) {
		var olfPN = 0;
		if (BRAIN.postSynaptic['OLF_PN']) {
			olfPN = BRAIN.postSynaptic['OLF_PN'][BRAIN.nextState];
		}
		var fearPenalty = BRAIN.drives.fear * 20;
		var fatiguePenalty = BRAIN.drives.fatigue > 0.6 ? 15 : 0;
		var curiosityBonus = BRAIN.drives.curiosity * 10;
		BRAIN.accumCourtship = Math.max(0, olfPN + curiosityBonus - fearPenalty - fatiguePenalty);
	} else {
		BRAIN.accumCourtship = 0;
	}
```

#### Add `BRAIN.accumCourtship` to the floor section
- anchor: `BRAIN.accumHead = Math.max(0, BRAIN.accumHead);`
- Add after it: `BRAIN.accumCourtship = Math.max(0, BRAIN.accumCourtship);`

### 2. MODIFY js/fly-logic.js
- operation: MODIFY
- reason: Add 'courtship' to `evaluateBehaviorEntry()` and add `BEHAVIOR_THRESHOLDS.courtship`. Add `hasNearbyMate()` helper.

#### Anchor: BEHAVIOR_THRESHOLDS
```js
var BEHAVIOR_THRESHOLDS = {
```

#### Add new threshold
- Add `courtship: 10,` after `groom: 8,` (line 23)

#### New function: `hasNearbyMate`
- Insert AFTER the `hasNearbyFood()` function (after line 46), BEFORE `evaluateBehaviorEntry()`
- signature: `function hasNearbyMate()`
- purpose: Returns true if any mate item is within 80px of the fly
- logic:
  1. Iterate over global `mates` array
  2. For each mate, compute `Math.hypot(fly.x - mates[i].x, fly.y - mates[i].y)`
  3. If distance <= 80, return true
  4. Return false after loop
- Code:
```js
/**
 * Returns true if any mate is within 80px of the fly.
 * Requires globals `mates` (array) and `fly` (object with x, y).
 */
function hasNearbyMate() {
	if (typeof mates === 'undefined') return false;
	for (var i = 0; i < mates.length; i++) {
		if (Math.hypot(fly.x - mates[i].x, fly.y - mates[i].y) <= 80) return true;
	}
	return false;
}
```

#### Modify `evaluateBehaviorEntry()`
- anchor: right after the groom check block, before the brace check:
```js
	if (BRAIN.accumGroom > BEHAVIOR_THRESHOLDS.groom && !isCoolingDown('groom', now)) {
		return 'groom';
	}
```
- Insert courtship check AFTER the groom block and BEFORE the brace block:
```js
	if (BRAIN.accumCourtship > BEHAVIOR_THRESHOLDS.courtship &&
		hasNearbyMate() && !isCoolingDown('courtship', now) &&
		BRAIN.drives.fear < 0.3 && BRAIN.drives.fatigue < 0.6) {
		return 'courtship';
	}
```
- Priority: courtship slots between groom and brace (lower than feeding/grooming, higher than brace/rest/explore). This matches the spec requirement that courtship only happens when conditions are favorable.

### 3. MODIFY js/main.js
- operation: MODIFY
- reason: Add `mates` array, mate tool handler, mate rendering, mate proximity detection, courtship behavior in state machine/movement/animation, and courtship expiry logic.

#### 3a. Add `mates` array to state section
- anchor (line 34):
```js
var waterDrops = [];
```
- Insert after: `var mates = [];`

#### 3b. Add courtship entry to BEHAVIOR_MIN_DURATION
- anchor:
```js
var BEHAVIOR_MIN_DURATION = {
```
- Add `courtship: 5000,` after `brace: 500,` (line 143 area). This enforces the 5s minimum courtship duration from the spec.

#### 3c. Add courtship entry to BEHAVIOR_COOLDOWN
- anchor:
```js
var BEHAVIOR_COOLDOWN = {
```
- Add `courtship: 5000,` after `brace: 1000,` (line 152 area). Prevents immediate re-courtship.

#### 3d. Add `courtshipWingVibration` to `anim` object
- anchor:
```js
	wingSpread: 0,
};
```
- Add before the closing `};`: `courtshipWingVibration: 0,`

#### 3e. Add mate tool button handler
- The existing tool button loop at lines 429-450 already handles any `data-tool` attribute. Since the new button will have `data-tool="mate"`, it will be picked up automatically -- clicking it sets `activeTool = 'mate'` and toggles the active class. No JS changes needed for the button handler itself.

#### 3f. Add mate placement in `handleCanvasMousedown`
- anchor (the last tool handler in the if/else chain):
```js
	} else if (activeTool === 'water') {
		var waterMinY = getLayoutBounds().top;
		var waterMaxY = window.innerHeight;
		cy = Math.max(waterMinY, Math.min(waterMaxY, cy));
		waterDrops.push({ x: cx, y: cy, radius: 6 });
	}
```
- Add a new `else if` block AFTER the water block, BEFORE the closing `}`:
```js
	} else if (activeTool === 'mate') {
		var mateMinY = getLayoutBounds().top;
		var mateMaxY = window.innerHeight;
		cy = Math.max(mateMinY, Math.min(mateMaxY, cy));
		// Only one mate at a time
		mates = [{ x: cx, y: cy, spawnTime: Date.now() }];
	}
```
- The `mates = [...]` (assignment, not push) ensures only one mate exists at a time, keeping behavior predictable.

#### 3g. Add mate to clearButton handler
- anchor (line 9-12):
```js
document.getElementById('clearButton').onclick = function () {
	food = [];
	waterDrops = [];
};
```
- Change to:
```js
document.getElementById('clearButton').onclick = function () {
	food = [];
	waterDrops = [];
	mates = [];
};
```

#### 3h. Add courtship to `syncBrainFlags`
- anchor:
```js
function syncBrainFlags() {
	var s = behavior.current;
	BRAIN._isMoving = (s === 'walk' || s === 'explore' || s === 'phototaxis' ||
		s === 'fly' || (s === 'startle' && behavior.startlePhase === 'burst'));
```
- The courtship state is NOT moving (fly is near the mate, vibrating wings). No changes needed to `_isMoving`.
- No changes to `_isFeeding` or `_isGrooming` either. `syncBrainFlags` does not need modification.

#### 3i. Add courtship to `computeMovementForBehavior`
- anchor (the `else` clause for idle at the end of the function):
```js
	} else if (state === 'groom' || state === 'rest') {
		targetSpeed = 0;
		speedChangeInterval = -speed * 0.1;
	} else {
		// idle
		targetSpeed = 0;
		speedChangeInterval = -speed * 0.05;
	}
```
- Add a new `else if` for courtship BEFORE the `groom || rest` block. Actually, to avoid reordering, add it AFTER the `groom || rest` block and BEFORE the `else` (idle) block:
- Replace the above with:
```js
	} else if (state === 'groom' || state === 'rest') {
		targetSpeed = 0;
		speedChangeInterval = -speed * 0.1;
	} else if (state === 'courtship') {
		// Approach mate slowly, then stop when close
		var nm = nearestMate();
		if (nm && nm.dist > 25) {
			var mateAngle = Math.atan2(-(nm.item.y - fly.y), nm.item.x - fly.x);
			targetDir = mateAngle;
			targetSpeed = 0.2;
			speedChangeInterval = (targetSpeed - speed) / 30;
		} else {
			targetSpeed = 0;
			speedChangeInterval = -speed * 0.1;
		}
	} else {
		// idle
		targetSpeed = 0;
		speedChangeInterval = -speed * 0.05;
	}
```

#### 3j. Add `nearestMate` helper function
- Insert AFTER `nearestFood()` function (which ends around line 991) and BEFORE `updateBehaviorState()`:
- anchor:
```js
	return { item: best, dist: bestDist };
}
```
- Add after:
```js

function nearestMate() {
	if (!mates.length) return null;
	var best = null;
	var bestDist = Infinity;
	for (var i = 0; i < mates.length; i++) {
		var d = Math.hypot(fly.x - mates[i].x, fly.y - mates[i].y);
		if (d < bestDist) {
			bestDist = d;
			best = mates[i];
		}
	}
	return best ? { item: best, dist: bestDist } : null;
}
```

#### 3k. Add courtship to `applyBehaviorMovement`
- anchor (the stationary behaviors block):
```js
	if (behavior.current === 'groom' ||
		behavior.current === 'rest' || behavior.current === 'idle' ||
		behavior.current === 'brace') {
```
- Add `behavior.current === 'courtship' ||` to this condition, making it:
```js
	if (behavior.current === 'groom' ||
		behavior.current === 'rest' || behavior.current === 'idle' ||
		behavior.current === 'courtship' ||
		behavior.current === 'brace') {
```

#### 3l. Add courtship wing vibration to `updateAnimForBehavior`
- anchor (end of the function, after the walkPhase block):
```js
	// Walk phase advances when walking (linear dt scaling for phase accumulator)
	if (state === 'walk' || state === 'explore' || state === 'phototaxis') {
		var spd = Math.abs(speed);
		anim.walkPhase += spd * 0.5 * dtScale;
	}
```
- Add after:
```js

	// Courtship wing vibration: rapid small oscillation target
	var targetCourtshipVib = 0;
	if (state === 'courtship') {
		targetCourtshipVib = 1;
	}
	anim.courtshipWingVibration += (targetCourtshipVib - anim.courtshipWingVibration) * (1 - Math.pow(0.8, dtScale));
```

#### 3m. Add courtship vibration to `drawWing` function
- anchor (inside `drawWing`, after buzzOffset computation):
```js
	// Flight buzz: rapid oscillation when wings are spread
	var buzzOffset = 0;
	if (anim.wingSpread > 0.5) {
		buzzOffset = Math.sin(Date.now() / 30) * 0.15 * anim.wingSpread;
	}
```
- Add after the buzzOffset block:
```js

	// Courtship vibration: rapid small wing angle oscillation (one wing extends more)
	var courtshipOffset = 0;
	if (anim.courtshipWingVibration > 0.1) {
		// Asymmetric vibration: left wing vibrates more (side === -1)
		var vibFreq = side === -1 ? 20 : 40;
		courtshipOffset = Math.sin(Date.now() / vibFreq) * 0.12 * anim.courtshipWingVibration;
	}
```
- Then modify the line that computes the rotation to include courtshipOffset:
- anchor:
```js
	ctx.rotate(side * (0.35 + spreadAngle) + microOffset * 0.02 + buzzOffset);
```
- Replace with:
```js
	ctx.rotate(side * (0.35 + spreadAngle) + microOffset * 0.02 + buzzOffset + courtshipOffset);
```

#### 3n. Add `drawMates` function
- Insert AFTER `drawWaterDrops()` function (line ~1304), BEFORE `drawRipples()`:
```js

/**
 * Draws mate sprites as smaller fly silhouettes.
 */
function drawMates() {
	for (var i = 0; i < mates.length; i++) {
		var m = mates[i];
		ctx.save();
		ctx.translate(m.x, m.y);
		ctx.scale(0.7, 0.7);

		// Abdomen (ellipse)
		ctx.beginPath();
		ctx.ellipse(0, 8, 7, 11, 0, 0, Math.PI * 2);
		ctx.fillStyle = '#A0750A';
		ctx.fill();
		ctx.strokeStyle = '#7A5A08';
		ctx.lineWidth = 0.8;
		ctx.stroke();

		// Thorax (ellipse)
		ctx.beginPath();
		ctx.ellipse(0, -5, 6, 9, 0, 0, Math.PI * 2);
		ctx.fillStyle = '#8B6914';
		ctx.fill();
		ctx.strokeStyle = '#6B4F10';
		ctx.lineWidth = 0.8;
		ctx.stroke();

		// Head (circle)
		ctx.beginPath();
		ctx.arc(0, -16, 4.5, 0, Math.PI * 2);
		ctx.fillStyle = '#8B6914';
		ctx.fill();
		ctx.strokeStyle = '#6B4F10';
		ctx.lineWidth = 0.8;
		ctx.stroke();

		// Eyes (two small red ovals)
		ctx.beginPath();
		ctx.ellipse(-3.5, -17, 3, 3.5, 0, 0, Math.PI * 2);
		ctx.fillStyle = '#8B0000';
		ctx.fill();
		ctx.beginPath();
		ctx.ellipse(3.5, -17, 3, 3.5, 0, 0, Math.PI * 2);
		ctx.fillStyle = '#8B0000';
		ctx.fill();

		// Wings (simplified, folded)
		ctx.save();
		ctx.translate(-5, -4);
		ctx.rotate(-0.3);
		ctx.beginPath();
		ctx.ellipse(0, 12, 5, 18, 0, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(200, 210, 230, 0.25)';
		ctx.fill();
		ctx.restore();

		ctx.save();
		ctx.translate(5, -4);
		ctx.rotate(0.3);
		ctx.beginPath();
		ctx.ellipse(0, 12, 5, 18, 0, 0, Math.PI * 2);
		ctx.fillStyle = 'rgba(200, 210, 230, 0.25)';
		ctx.fill();
		ctx.restore();

		// Subtle pheromone glow when fly is nearby
		var distToFly = Math.hypot(fly.x - m.x, fly.y - m.y);
		if (distToFly <= 80) {
			var pulse = 0.15 + Math.sin(Date.now() / 300) * 0.1;
			ctx.beginPath();
			ctx.arc(0, 0, 25, 0, Math.PI * 2);
			ctx.fillStyle = 'rgba(255, 180, 200, ' + pulse.toFixed(2) + ')';
			ctx.fill();
		}

		ctx.restore();
	}
}
```

#### 3o. Call `drawMates()` in the `draw()` function
- anchor:
```js
	drawFood();
	drawWaterDrops();
	drawRipples();
```
- Replace with:
```js
	drawFood();
	drawWaterDrops();
	drawMates();
	drawRipples();
```

#### 3p. Add mate proximity detection to `update()` function
- anchor (insert AFTER water drop proximity block, BEFORE the touch reset block):
```js
	// Water drop proximity
	BRAIN.stimulate.waterContact = false;
	for (var wi = 0; wi < waterDrops.length; wi++) {
		var wDist = Math.hypot(fly.x - waterDrops[wi].x, fly.y - waterDrops[wi].y);
		if (wDist <= 15) {
			BRAIN.stimulate.waterContact = true;
			waterDrops.splice(wi, 1);
			wi--;
		}
	}
```
- Add AFTER the water drop proximity block:
```js

	// Mate proximity
	BRAIN.stimulate.mateNearby = false;
	for (var mi = 0; mi < mates.length; mi++) {
		var mDist = Math.hypot(fly.x - mates[mi].x, fly.y - mates[mi].y);
		if (mDist <= 80) {
			BRAIN.stimulate.mateNearby = true;
		}
	}

	// Courtship completion: after 5-10s in courtship state, mate disappears and curiosity resets
	if (behavior.current === 'courtship' && mates.length > 0) {
		var courtshipElapsed = Date.now() - behavior.enterTime;
		// Random completion between 5000-10000ms (decided once at entry)
		if (!mates[0].courtshipEnd) {
			mates[0].courtshipEnd = 5000 + Math.random() * 5000;
		}
		if (courtshipElapsed >= mates[0].courtshipEnd) {
			mates = [];
			BRAIN.drives.curiosity = 0.1;
			BRAIN.stimulate.mateNearby = false;
		}
	}
```

#### 3q. Add mates to resize clamping
- anchor:
```js
	for (var i = 0; i < waterDrops.length; i++) {
		waterDrops[i].x = Math.max(resizeWb.left, Math.min(waterDrops[i].x, resizeWb.right));
		waterDrops[i].y = Math.max(resizeWb.top, Math.min(waterDrops[i].y, resizeWb.bottom));
	}
```
- Add after:
```js
	for (var i = 0; i < mates.length; i++) {
		mates[i].x = Math.max(resizeWb.left, Math.min(mates[i].x, resizeWb.right));
		mates[i].y = Math.max(resizeWb.top, Math.min(mates[i].y, resizeWb.bottom));
	}
```

#### 3r. Add mates to visibility-change snapshot/restore
- Look at visibility change handler that snapshots drives on hide. The mates array is transient UI state and does not need snapshotting -- mates persisting across tab hide/show is fine. No change needed.

#### 3s. Add courtship to turn retention in `update()`
- anchor:
```js
	var turnRetention;
	if (behavior.current === 'startle' && behavior.startlePhase === 'burst') {
		turnRetention = 0.3;
	} else if (behavior.current === 'fly') {
		turnRetention = 0.4;
	} else {
		turnRetention = 0.9;
	}
```
- Courtship uses slow gentle turning (0.9 default), so no modification is needed.

### 4. MODIFY index.html
- operation: MODIFY
- reason: Add "Mate" toolbar button and help overlay entry.

#### 4a. Add toolbar button
- anchor:
```html
            <button class="tool-btn" data-tool="water">Water</button>
```
- Add after:
```html
            <button class="tool-btn" data-tool="mate">Mate</button>
```

#### 4b. Add help overlay entry
- anchor:
```html
        <div class="help-item"><strong>Bitter food</strong> -- 10% of placed food is randomly bitter (shown in green). If the fly contacts bitter food, it triggers rejection and aversive learning.</div>
```
- Add after:
```html
        <div class="help-item"><strong>Mate</strong> -- Click on the canvas to place a mate fly. If the fly is calm (low fear, low fatigue, moderate curiosity), it will approach and perform courtship wing vibration for 5-10 seconds.</div>
```

## Verification
- build: Open `index.html` in a browser (no build step).
- lint: `No linter configured for this project.`
- test: `No automated test runner. Manual verification below.`
- smoke:
  1. Load page in browser. Verify "Mate" button appears in toolbar between "Water" and "Brain 3D".
  2. Click "Mate" button -- it should become highlighted (active class).
  3. Click on canvas -- a smaller fly silhouette should appear at click position.
  4. Wait for the fly to detect the mate (within 80px). Verify the behavior state label changes to "courtship" in the bottom panel (may require favorable drive conditions: low fear, low fatigue, moderate curiosity).
  5. Observe wing vibration animation during courtship -- wings should oscillate rapidly at a small angle.
  6. After 5-10 seconds, mate should disappear and curiosity drive should drop.
  7. Click "?" help button -- verify "Mate" entry appears in the help overlay.
  8. Click the clear button (X icon) -- verify mates are cleared along with food and water.
  9. Place a mate, then startle the fly (touch tool) -- verify fly does NOT enter courtship while fear is high.

## Constraints
- Do not modify SPEC.md, CLAUDE.md, TASKS.md, or any file in .buildloop/ other than this plan.
- Do not add any new files -- all changes are modifications to existing files.
- Use ES5 syntax throughout (var, not let/const) -- matches the existing codebase style.
- Do not add `console.log` or other debugging output.
- The `mates` array should hold at most 1 item (enforced by the placement logic using assignment, not push).
- Do not add new neuron groups to `constants.js` -- reuse the `OLF_ORN_FOOD` pathway for mate pheromone detection as specified in the task description.
- Do not modify the `clearButton` handler to reference mates if the handler uses a different pattern than shown -- adapt to the actual code.
- All canvas drawing must happen inside the zoom/pan transform block (between `ctx.save()` and `ctx.restore()` in `draw()`).
