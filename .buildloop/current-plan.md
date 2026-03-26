# Plan: D7.1

## Dependencies
- list: none
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Store the brain tick interval ID, add visibilitychange handler to pause/resume the brain tick when the tab is backgrounded/foregrounded, and clear stale stimuli and snapshot drives on resume to prevent runaway accumulation

#### Change 1: Store brain tick interval ID in a variable
- anchor: `setInterval(updateBrain, 500);` (line 226)
- Replace the bare `setInterval` call with an assignment to a new variable `brainTickId`

Before:
```js
BRAIN.randExcite();
setInterval(updateBrain, 500);
```

After:
```js
BRAIN.randExcite();
var brainTickId = setInterval(updateBrain, 500);
```

#### Change 2: Add visibilitychange handler immediately after the brainTickId assignment (after line 226, before `// --- Canvas setup ---` comment at line 228)

Insert the following block between `var brainTickId = setInterval(updateBrain, 500);` and `// --- Canvas setup ---`:

```js
// --- Tab visibility handling ---
// When the tab is backgrounded, browsers throttle setInterval to ~1/s but
// pause requestAnimationFrame entirely. This means the brain tick keeps
// running (accumulating drives, processing stale stimuli) while update()
// never runs to clear stimulus timers or reset food flags. On resume,
// drives are maxed out causing a jarring behavioral cascade.
// Fix: pause the brain tick when hidden, resume when visible. On resume,
// clear all stale stimuli and snapshot drives to prevent drift.
var driveSnapshotOnHide = null;

document.addEventListener('visibilitychange', function () {
	if (document.hidden) {
		// Tab is being hidden: stop the brain tick entirely
		clearInterval(brainTickId);
		brainTickId = null;

		// Snapshot current drive values so we can restore them on resume
		driveSnapshotOnHide = {
			hunger: BRAIN.drives.hunger,
			fear: BRAIN.drives.fear,
			fatigue: BRAIN.drives.fatigue,
			curiosity: BRAIN.drives.curiosity,
			groom: BRAIN.drives.groom,
		};
	} else {
		// Tab is becoming visible again: clear all stale stimuli
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.touchLocation = null;
		BRAIN.stimulate.wind = false;
		BRAIN.stimulate.windStrength = 0;
		BRAIN.stimulate.foodNearby = false;
		BRAIN.stimulate.foodContact = false;
		touchResetTime = 0;
		windResetTime = 0;

		// Restore drive snapshot to undo any drift from throttled ticks
		// that may have fired between the hide event and clearInterval
		if (driveSnapshotOnHide) {
			BRAIN.drives.hunger = driveSnapshotOnHide.hunger;
			BRAIN.drives.fear = driveSnapshotOnHide.fear;
			BRAIN.drives.fatigue = driveSnapshotOnHide.fatigue;
			BRAIN.drives.curiosity = driveSnapshotOnHide.curiosity;
			BRAIN.drives.groom = driveSnapshotOnHide.groom;
			driveSnapshotOnHide = null;
		}

		// Reset lastTime so the RAF loop does not compute a huge dt on resume
		lastTime = -1;

		// Restart the brain tick
		brainTickId = setInterval(updateBrain, 500);
	}
});
```

#### Detailed logic for the visibilitychange handler:

**On hide (document.hidden === true):**
1. Call `clearInterval(brainTickId)` to stop the brain tick completely
2. Set `brainTickId = null` (defensive, not strictly needed)
3. Snapshot all 5 drive values (`hunger`, `fear`, `fatigue`, `curiosity`, `groom`) from `BRAIN.drives` into `driveSnapshotOnHide` object

**On show (document.hidden === false):**
1. Clear stale stimuli: set `BRAIN.stimulate.touch = false`, `BRAIN.stimulate.touchLocation = null`, `BRAIN.stimulate.wind = false`, `BRAIN.stimulate.windStrength = 0`, `BRAIN.stimulate.foodNearby = false`, `BRAIN.stimulate.foodContact = false`
2. Reset timer variables: set `touchResetTime = 0`, `windResetTime = 0`
3. Restore drive snapshot: copy all 5 values from `driveSnapshotOnHide` back to `BRAIN.drives`, then set `driveSnapshotOnHide = null`
4. Reset RAF timing: set `lastTime = -1` (this causes the RAF loop at line 1467 to skip the first frame and reinitialize timing, matching the existing startup pattern)
5. Restart brain tick: `brainTickId = setInterval(updateBrain, 500)`

#### Variable placement note:
- `brainTickId` is declared with `var` at line 226 (replacing the bare setInterval call), so it is function-scoped (or global-scoped since this is top-level)
- `driveSnapshotOnHide` is declared with `var` right before the event listener
- `lastTime` is already declared at line 1465 as `var lastTime = -1` -- since this is top-level `var`, it is accessible from the visibilitychange handler (same global scope)
- `touchResetTime` is already declared at line 25
- `windResetTime` is already declared at line 26

#### No other changes to js/main.js

No changes to update(), draw(), updateBrain(), or any other function. The fix is entirely additive: one line change (store interval ID) and one new event listener block.

## Verification
- build: no build step (vanilla JS, open index.html directly)
- lint: no linter configured
- test: no existing tests
- smoke: Open the simulation in a browser. Let the fly settle for a few seconds. Place food near the fly. Switch to another browser tab for 30 seconds. Switch back. Verify: (1) the fly is NOT in a panicked startle/fly/groom cascade, (2) drive meters are at roughly the same levels as when you left, (3) the simulation resumes smoothly without a visible jump or freeze. Also test: trigger a touch or wind event, immediately switch tabs, wait 5 seconds, switch back -- verify the touch/wind stimulus is cleared and drives are normal.

## Constraints
- Do NOT modify js/connectome.js -- all changes are in js/main.js only
- Do NOT modify the updateBrain() function itself
- Do NOT modify the update() function
- Do NOT modify the RAF loop (loop function at line 1466)
- Do NOT add any new dependencies or files
- Do NOT change the brain tick interval from 500ms
- Do NOT modify SPEC.md, TASKS.md, or CLAUDE.md
- The `var brainTickId` must replace the existing `setInterval(updateBrain, 500);` line, not be added as a separate line (to avoid calling setInterval twice)
