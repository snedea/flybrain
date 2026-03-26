# Plan: T5.2

## Dependencies
- list: none
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/connectome.js
- operation: MODIFY
- reason: Add light-level-dependent drive modulation (fatigue, curiosity) and reduce tonic background activity in darkness

#### Change 1A: Light-dependent fatigue gain rate in BRAIN.updateDrives
- anchor: `// Fatigue: increases when moving, decreases when resting`
- This block currently reads (lines 192-197):
```javascript
	// Fatigue: increases when moving, decreases when resting
	if (BRAIN._isMoving) {
		d.fatigue += 0.003;
	} else {
		d.fatigue -= 0.01;
	}
```

Replace the entire fatigue block with:
```javascript
	// Fatigue: increases when moving, decreases when resting
	// In low light (< 0.3), fatigue accumulates faster (fly winds down in darkness)
	if (BRAIN._isMoving) {
		var fatigueGain = BRAIN.stimulate.lightLevel < 0.3 ? 0.006 : 0.003;
		d.fatigue += fatigueGain;
	} else {
		d.fatigue -= 0.01;
	}
```

Logic:
1. Declare local variable `fatigueGain`
2. If `BRAIN.stimulate.lightLevel < 0.3`, set `fatigueGain` to `0.006` (double the normal rate)
3. Otherwise set `fatigueGain` to `0.003` (the existing normal rate)
4. Add `fatigueGain` to `d.fatigue`
5. The rest recovery (`d.fatigue -= 0.01`) remains unchanged

#### Change 1B: Light-dependent curiosity bias in BRAIN.updateDrives
- anchor: `// Curiosity: random walk`
- This line currently reads (line 199-200):
```javascript
	// Curiosity: random walk
	d.curiosity += (Math.random() - 0.5) * 0.06;
```

Replace with:
```javascript
	// Curiosity: random walk (reduced range in low light -- less exploratory in darkness)
	var curiosityRange = BRAIN.stimulate.lightLevel < 0.3 ? 0.02 : 0.06;
	d.curiosity += (Math.random() - 0.5) * curiosityRange;
```

Logic:
1. Declare local variable `curiosityRange`
2. If `BRAIN.stimulate.lightLevel < 0.3`, set `curiosityRange` to `0.02` (one-third of normal, making the fly less exploratory)
3. Otherwise set `curiosityRange` to `0.06` (the existing value)
4. Use `curiosityRange` as the multiplier instead of the hardcoded `0.06`

#### Change 1C: Reduce tonic background activity in complete darkness
- anchor: `var tonicTargets = ['CX_FC', 'CX_EPG', 'CX_PFN'];`
- This block currently reads (lines 368-373):
```javascript
	var tonicTargets = ['CX_FC', 'CX_EPG', 'CX_PFN'];
	for (var t = 0; t < tonicTargets.length; t++) {
		if (BRAIN.postSynaptic[tonicTargets[t]]) {
			BRAIN.postSynaptic[tonicTargets[t]][BRAIN.nextState] += 8;
		}
	}
```

Replace with:
```javascript
	var tonicTargets = ['CX_FC', 'CX_EPG', 'CX_PFN'];
	var tonicLevel = BRAIN.stimulate.lightLevel === 0 ? 4 : 8;
	for (var t = 0; t < tonicTargets.length; t++) {
		if (BRAIN.postSynaptic[tonicTargets[t]]) {
			BRAIN.postSynaptic[tonicTargets[t]][BRAIN.nextState] += tonicLevel;
		}
	}
```

Logic:
1. After declaring `tonicTargets`, declare `var tonicLevel`
2. If `BRAIN.stimulate.lightLevel === 0` (complete darkness), set `tonicLevel` to `4`
3. Otherwise set `tonicLevel` to `8` (the existing value)
4. Use `tonicLevel` in place of the hardcoded `8` on the line `BRAIN.postSynaptic[tonicTargets[t]][BRAIN.nextState] += 8;`

### 2. MODIFY js/main.js
- operation: MODIFY
- reason: (a) Lower rest fatigue threshold in darkness, (b) add dark-mode antenna and leg animation changes

#### Change 2A: Lower rest fatigue threshold in darkness in evaluateBehaviorEntry
- anchor: `if (BRAIN.drives.fatigue > BEHAVIOR_THRESHOLDS.restFatigue) {`
- This line currently reads (line 488):
```javascript
	if (BRAIN.drives.fatigue > BEHAVIOR_THRESHOLDS.restFatigue) {
```

Replace with:
```javascript
	var restThreshold = BRAIN.stimulate.lightLevel === 0 ? 0.4 : BEHAVIOR_THRESHOLDS.restFatigue;
	if (BRAIN.drives.fatigue > restThreshold) {
```

Logic:
1. Declare local variable `restThreshold`
2. If `BRAIN.stimulate.lightLevel === 0` (complete darkness), set `restThreshold` to `0.4`
3. Otherwise use `BEHAVIOR_THRESHOLDS.restFatigue` (which is `0.7`)
4. Use `restThreshold` in the comparison instead of `BEHAVIOR_THRESHOLDS.restFatigue`

#### Change 2B: Double antenna twitch interval in complete darkness in drawAntennae
- anchor: `anim.antennaNextInterval = 0.8 + Math.random() * 1.2;` (the one inside the `if (t - anim.antennaTimer > anim.antennaNextInterval)` block, at line 1167)
- This block currently reads (lines 1165-1169):
```javascript
	if (t - anim.antennaTimer > anim.antennaNextInterval) {
		anim.antennaTimer = t;
		anim.antennaNextInterval = 0.8 + Math.random() * 1.2;
		anim.antennaTargetL = (Math.random() - 0.5) * 0.4;
		anim.antennaTargetR = (Math.random() - 0.5) * 0.4;
```

Replace with:
```javascript
	if (t - anim.antennaTimer > anim.antennaNextInterval) {
		anim.antennaTimer = t;
		var antennaBase = 0.8 + Math.random() * 1.2;
		anim.antennaNextInterval = BRAIN.stimulate.lightLevel === 0 ? antennaBase * 2 : antennaBase;
		anim.antennaTargetL = (Math.random() - 0.5) * 0.4;
		anim.antennaTargetR = (Math.random() - 0.5) * 0.4;
```

Logic:
1. Compute the base interval as before: `var antennaBase = 0.8 + Math.random() * 1.2`
2. If `BRAIN.stimulate.lightLevel === 0`, double it: `antennaBase * 2` (sleepier, slower twitching)
3. Otherwise use `antennaBase` as-is
4. Assign the result to `anim.antennaNextInterval`
5. The random roll happens once when the timer fires (pre-rolled pattern per Known Pattern #1), which is preserved

#### Change 2C: Reduce idle leg jitter intensity by 50% in complete darkness in drawLegs
- anchor: `// idle / feed / default: normal idle jitter`
- This block currently reads (lines 1338-1341):
```javascript
		} else {
			// idle / feed / default: normal idle jitter
			jitter = anim.legJitter[legIdx];
		}
```

Replace with:
```javascript
		} else {
			// idle / feed / default: normal idle jitter (reduced 50% in complete darkness)
			jitter = anim.legJitter[legIdx] * (BRAIN.stimulate.lightLevel === 0 ? 0.5 : 1.0);
		}
```

Logic:
1. When in the default/idle branch, multiply `anim.legJitter[legIdx]` by `0.5` if `BRAIN.stimulate.lightLevel === 0`
2. Otherwise multiply by `1.0` (no change)
3. This only affects the idle/feed/default case. The resting and bracing cases already have their own jitter multipliers and are unaffected.

## Verification
- build: no build step (vanilla JS loaded via script tags)
- lint: no linter configured
- test: no existing tests
- smoke: Open index.html in a browser. Click the Light toggle until it shows "Dark" (lightLevel = 0). Observe: (1) the fly should become less active and settle into rest state significantly sooner than in bright mode (fatigue threshold drops from 0.7 to 0.4), (2) antennae should twitch at roughly half the frequency compared to bright mode, (3) idle leg jitter should be visibly reduced, (4) toggling back to Bright should restore normal activity levels within a few brain ticks. Also test Dim mode (lightLevel = 0.5): verify the fatigue gain rate is doubled (lightLevel 0.5 >= 0.3 so it should NOT be doubled — only < 0.3 triggers it). Then test with lightLevel = 0 (Dark): curiosity should stabilize near its current value rather than fluctuating widely.

## Constraints
- Do not modify SPEC.md, TASKS.md, CLAUDE.md, or any files in .buildloop/ other than current-plan.md
- Do not add new files — all changes are within the two existing files js/connectome.js and js/main.js
- Do not add any new dependencies or imports
- Do not modify any behavior state machine logic beyond the restThreshold change in evaluateBehaviorEntry — the brace behavior, startle, fly, groom, feed, walk, explore, phototaxis states must remain unchanged
- Do not change the BEHAVIOR_THRESHOLDS.restFatigue constant itself (0.7) — the darkness override is local to evaluateBehaviorEntry
- Do not change the lightLevel values associated with the light toggle states (1, 0.5, 0) — those are existing UI state
- Preserve the pre-rolled timer interval pattern (Known Pattern #1): the antenna interval is re-rolled only when the timer fires, not every frame. The dark-mode scaling must happen at re-roll time, not in the timer check condition
- Use `=== 0` (strict equality) for complete darkness checks, and `< 0.3` (less-than comparison) for low-light checks, matching the thresholds specified in the task description
