# Plan: D8.2

## Summary

Fix D4.2 regression where MN_HEAD locomotion signal (from DN_TURN during normal walking) leaks into the groom accumulator, causing false groom triggers without any grooming stimulus. Use approach (b) from the task description: gate the head contribution on abdomen having signal, since abdomen > 0 indicates a real groom command from SEZ_GROOM rather than locomotion noise.

## Design Decision: Why approach (b)

Three fix options were proposed:
- (a) Raise threshold from 8 to 12-15: fragile, would also raise the bar for legitimate groom triggers (user touch -> SEZ_GROOM -> MN_ABDOMEN + MN_HEAD + legs), making grooming harder to trigger overall.
- (b) Gate head on abdomen: `abdomen + (abdomen > 0 ? head : 0) + Math.min(legL1, legR1)` -- surgically fixes the problem. When SEZ_GROOM fires, it sends signal to both MN_ABDOMEN (weight 5) and MN_HEAD (weight 4), so abdomen > 0 is a reliable indicator that head signal is groom-related. When only DN_TURN fires (locomotion), abdomen = 0 and head is excluded. No threshold change needed.
- (c) Subtract tonic baseline: `abdomen + Math.max(0, head - 4) + Math.min(legL1, legR1)` -- works for the DN_TURN case (weight 4) but breaks if multiple head sources fire simultaneously (SEZ_FEED + DN_TURN = 8, minus 4 = 4, still leaks). Less robust.

Approach (b) is the cleanest fix with zero side effects on legitimate groom behavior.

## Dependencies

- list: none
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/connectome.js
- operation: MODIFY
- reason: Gate the head signal contribution to accumGroom on abdomen having nonzero signal, preventing locomotion-only MN_HEAD signal from triggering false groom state

#### Anchor
```js
BRAIN.accumGroom = abdomen + head + Math.min(legL1, legR1);
```
This is at line 469 of connectome.js, inside the `BRAIN.motorcontrol` function.

#### Change
Replace the single line:
```js
BRAIN.accumGroom = abdomen + head + Math.min(legL1, legR1);
```
With:
```js
BRAIN.accumGroom = abdomen + (abdomen > 0 ? head : 0) + Math.min(legL1, legR1);
```

#### What NOT to change
- Do NOT modify the `var head = readMotor('MN_HEAD');` line at line 467 -- head must still be read and drained every tick.
- Do NOT modify `BRAIN.accumHead = head;` at line 468 -- accumHead is used independently for head orientation bias at main.js:588-589.
- Do NOT modify `BRAIN.accumHead = Math.max(0, BRAIN.accumHead);` at line 484.
- Do NOT modify the comment block at lines 463-465.

#### Verification after change
The surrounding code block (lines 463-484) should read:
```js
	// Grooming (front legs + abdomen when both active)
	// Grooming is detected when front legs are active AND abdomen is active,
	// or when SEZ_GROOM was the dominant command
	var abdomen = readMotor('MN_ABDOMEN');
	var head = readMotor('MN_HEAD');
	BRAIN.accumHead = head;
	BRAIN.accumGroom = abdomen + (abdomen > 0 ? head : 0) + Math.min(legL1, legR1);

	// Startle is derived from DN_STARTLE neuron state (not a motor neuron per se,
	// but we track its activation level for behavior selection)
	if (BRAIN.postSynaptic['DN_STARTLE']) {
		BRAIN.accumStartle = BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState];
	}

	// Floor all accumulators at 0 (negative motor output has no physical meaning)
	BRAIN.accumWalkLeft = Math.max(0, BRAIN.accumWalkLeft);
	BRAIN.accumWalkRight = Math.max(0, BRAIN.accumWalkRight);
	BRAIN.accumFlight = Math.max(0, BRAIN.accumFlight);
	BRAIN.accumFeed = Math.max(0, BRAIN.accumFeed);
	BRAIN.accumGroom = Math.max(0, BRAIN.accumGroom);
	BRAIN.accumStartle = Math.max(0, BRAIN.accumStartle);
	BRAIN.accumHead = Math.max(0, BRAIN.accumHead);
```

### No changes to js/main.js

The BEHAVIOR_THRESHOLDS.groom value of 8 at main.js:73 does NOT need to change. With the gated formula:
- During locomotion (no groom stimulus): accumGroom = 0 (abdomen) + 0 (head gated off) + 4-7 (legs) = 4-7, which is below 8. Walk continues uninterrupted.
- During actual grooming (SEZ_GROOM fires): accumGroom = 5 (abdomen, from SEZ_GROOM weight 5) + 4 (head, gated on because abdomen > 0) + 10 (legs, from SEZ_GROOM weight 10 to each front leg, min = 10) = 19, well above 8. Groom triggers correctly.
- During user touch (touch stimulus -> groom drive -> SEZ_GROOM activation over several ticks): Same pathway as above, abdomen receives signal, head is included. Groom triggers as intended.

The evaluateBehaviorEntry check at main.js:464 (`BRAIN.accumGroom > BEHAVIOR_THRESHOLDS.groom`) remains correct with the existing strict greater-than and threshold of 8.

## Verification

- build: Open `index.html` in a browser (no build step -- vanilla JS)
- lint: No linter configured for this project
- test: No automated tests exist
- smoke:
  1. Open `index.html` in browser
  2. Let the fly walk around for 30+ seconds without any user interaction
  3. Observe behavior: the fly should walk and explore continuously without spontaneously entering groom state (no legs-rubbing-head animation should appear unless the user touches the fly)
  4. Use the touch tool to click on the fly's head -- after a few brain ticks the fly should enter groom state (front legs rubbing head), confirming legitimate groom still works
  5. Use the touch tool to click on the fly's abdomen -- the fly should enter groom state with abdomen grooming animation
  6. Open browser console and periodically check `BRAIN.accumGroom` during normal walking -- values should stay in the 4-7 range, below 8
  7. After touching the fly, check `BRAIN.accumGroom` -- values should spike well above 8 (typically 15-20+)

## Constraints

- Do NOT modify js/main.js -- no threshold change is needed
- Do NOT modify js/constants.js -- connection weights are correct as-is
- Do NOT modify index.html or css/main.css
- Do NOT add new files
- Do NOT add new dependencies
- Do NOT change any other accumulator formulas in connectome.js
- Do NOT remove the `readMotor('MN_HEAD')` call -- head must still be read/drained every tick to prevent signal buildup
- Do NOT modify `BRAIN.accumHead` assignment -- it is used independently for head orientation
