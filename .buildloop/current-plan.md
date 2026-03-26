# Plan: D4.2

## Dependencies
- list: [] (no new dependencies)
- commands: [] (no install commands)

## File Operations (in execution order)

### 1. MODIFY js/connectome.js
- operation: MODIFY
- reason: Wire MN_HEAD motor neuron into a new accumHead accumulator and into accumGroom; remove dead _isMoving/_isFeeding/_isGrooming flag assignments

#### Change A: Add accumHead accumulator declaration
- anchor: `BRAIN.accumStartle = 0;` (line 89)
- action: Add `BRAIN.accumHead = 0;` on the line immediately after `BRAIN.accumStartle = 0;`
- The resulting block should read:
  ```
  BRAIN.accumStartle = 0;
  BRAIN.accumHead = 0;
  ```

#### Change B: Reset accumHead in motorcontrol()
- anchor: `BRAIN.accumStartle = 0;` inside the `BRAIN.motorcontrol = function ()` body (line 436)
- action: Add `BRAIN.accumHead = 0;` on the line immediately after that `BRAIN.accumStartle = 0;`
- The resulting block should read:
  ```
  BRAIN.accumGroom = 0;
  BRAIN.accumStartle = 0;
  BRAIN.accumHead = 0;
  ```

#### Change C: Assign accumHead and add head into accumGroom
- anchor: The two lines (470-471):
  ```
  	var head = readMotor('MN_HEAD');
  	BRAIN.accumGroom = abdomen + Math.min(legL1, legR1);
  ```
- action: Replace those two lines with:
  ```
  	var head = readMotor('MN_HEAD');
  	BRAIN.accumHead = head;
  	BRAIN.accumGroom = abdomen + head + Math.min(legL1, legR1);
  ```
- Rationale: MN_HEAD receives signal from SEZ_GROOM (grooming head position, weight 4) and SEZ_FEED (head lowering toward food, weight 4). Adding head to accumGroom makes the groom accumulator more sensitive when head motor signal is active, giving these connectome pathways a behavioral effect. The separate accumHead preserves the raw signal for orientation biasing in main.js.

#### Change D: Floor accumHead at 0
- anchor: `BRAIN.accumStartle = Math.max(0, BRAIN.accumStartle);` (line 485)
- action: Add `BRAIN.accumHead = Math.max(0, BRAIN.accumHead);` on the line immediately after
- The resulting block should read:
  ```
  BRAIN.accumStartle = Math.max(0, BRAIN.accumStartle);
  BRAIN.accumHead = Math.max(0, BRAIN.accumHead);
  ```

#### Change E: Remove dead _isMoving/_isFeeding/_isGrooming flag assignments
- anchor: The block at lines 376-380:
  ```
  	// --- Update behavioral state flags for next tick ---
  	BRAIN._isMoving = (Math.abs(BRAIN.accumWalkLeft) + Math.abs(BRAIN.accumWalkRight) > 5) ||
  	                   (BRAIN.accumFlight > 5);
  	BRAIN._isFeeding = BRAIN.accumFeed > 5;
  	BRAIN._isGrooming = BRAIN.accumGroom > 5;
  ```
- action: Delete these 5 lines entirely (the comment line and the 4 assignment lines). The closing `};` of `BRAIN.update` that follows on line 381 remains.
- Rationale: syncBrainFlags() in main.js:471-476 immediately overwrites these three flags after every BRAIN.update() call, making these assignments dead code. The flag declarations at lines 160-162 (`BRAIN._isMoving = false;` etc.) remain -- they are still needed as initial values and are read by BRAIN.updateDrives().

### 2. MODIFY js/main.js
- operation: MODIFY
- reason: Use accumHead to bias targetDir in walk/explore states; remove duplicate JSDoc blocks

#### Change A: Add head-turn orientation bias in computeMovementForBehavior()
- anchor: The food-seeking block closing brace and the `} else if (state === 'phototaxis')` line. Specifically, the two lines:
  ```
  		}
  	} else if (state === 'phototaxis') {
  ```
  where the first `}` closes the `if (nf)` block and the second `}` closes the `if (BRAIN.stimulate.foodNearby ...)` block, located around line 512-513.
- action: Insert a head-turn bias block BETWEEN the closing of the foodNearby block and the `} else if (state === 'phototaxis')` line. The new code goes right after the `}` that closes the foodNearby check (but before the `} else if (state === 'phototaxis')`):
  ```
  		// Head-turn bias from MN_HEAD (CX_FC orientation signal)
  		if (BRAIN.accumHead > 3) {
  			var headBias = (BRAIN.accumHead / 40) * 0.15;
  			var headSign = (BRAIN.accumWalkLeft - BRAIN.accumWalkRight > 0) ? 1 : -1;
  			targetDir += headBias * headSign;
  		}
  ```
- Exact result: The walk/explore block should end with:
  ```
  		}
  		// Head-turn bias from MN_HEAD (CX_FC orientation signal)
  		if (BRAIN.accumHead > 3) {
  			var headBias = (BRAIN.accumHead / 40) * 0.15;
  			var headSign = (BRAIN.accumWalkLeft - BRAIN.accumWalkRight > 0) ? 1 : -1;
  			targetDir += headBias * headSign;
  		}
  	} else if (state === 'phototaxis') {
  ```
- Logic explanation:
  1. Only apply when accumHead exceeds a minimum threshold of 3 (avoids noise from tonic activity)
  2. Scale the head signal: divide by 40 to normalize (MN_HEAD typically ranges 0-40 from its 4 sources at weights 3-4), then multiply by 0.15 radians max (~8.6 degrees) to keep the bias subtle
  3. Direction of the head turn follows the walk asymmetry: if left walk accumulator > right, the fly is turning left, so head bias reinforces that direction (sign = +1); otherwise sign = -1
  4. This captures the CX_FC "head turns" signal giving it a modest effect on targetDir without overriding the primary walk-based steering

#### Change B: Remove duplicate JSDoc for drawProboscis
- anchor: The four lines (around 1089-1092):
  ```
  /**
   * Draws the proboscis (retractable feeding tube).
   * Hidden by default; call this when feeding behavior is active.
   */
  ```
  These are the FIRST (stale) JSDoc block, immediately before the SECOND (real) JSDoc block that starts with `/** * Draws the proboscis (retractable feeding tube).` and contains `@param {number} extend`.
- action: Delete exactly these 4 lines:
  ```
  /**
   * Draws the proboscis (retractable feeding tube).
   * Hidden by default; call this when feeding behavior is active.
   */
  ```
  The remaining (real) JSDoc block that follows (with the @param tag) is kept.

#### Change C: Remove duplicate JSDoc for drawLegs
- anchor: The four lines (around 1115-1118):
  ```
  /**
   * Draws all 6 legs with walking or idle animation.
   * Tripod gait: Group A (front-left, mid-right, rear-left) vs Group B.
   */
  ```
  These are the FIRST (stale) JSDoc block, immediately before the SECOND (real) JSDoc block that starts with `/** * Draws all 6 legs with behavior-specific animation.`.
- action: Delete exactly these 4 lines:
  ```
  /**
   * Draws all 6 legs with walking or idle animation.
   * Tripod gait: Group A (front-left, mid-right, rear-left) vs Group B.
   */
  ```
  The remaining (real) JSDoc block that follows (describing behavior-specific animation) is kept.

## Verification
- build: No build step (vanilla JS, no bundler). Open `index.html` in a browser.
- lint: `grep -n 'var head' js/connectome.js` should show exactly one line (the readMotor line). `grep -n 'accumHead' js/connectome.js` should show 5 lines (declaration, reset, assignment, floor, no stale leftover). `grep -n '_isMoving.*accumWalkLeft\|_isFeeding.*accumFeed\|_isGrooming.*accumGroom' js/connectome.js` should return zero matches (dead assignments removed).
- test: No existing test suite.
- smoke: Open index.html in browser. Verify: (1) fly still walks, grooms, feeds, startles normally (no regressions from accumGroom formula change), (2) check browser console for zero JS errors, (3) during grooming the fly should trigger groom state slightly more readily due to head contribution to accumGroom, (4) during walking the fly's direction changes should be slightly more pronounced when CX_FC is active (subtle, hard to verify visually but confirms accumHead wiring works).

## Constraints
- Do NOT modify js/constants.js -- the weights table is correct; only the wiring in connectome.js was missing
- Do NOT modify index.html or css/main.css -- no UI changes in this task
- Do NOT add new dependencies or external files
- Do NOT change the BRAIN._isMoving / _isFeeding / _isGrooming declarations at connectome.js:160-162 -- only remove the dead reassignments at the end of BRAIN.update()
- Do NOT modify the readMotor helper function or the motor neuron drain behavior
- Do NOT modify SPEC.md, CLAUDE.md, or TASKS.md
- Keep the head-turn bias conservative (max ~0.15 radians) to avoid destabilizing existing walk/explore behavior
