# Plan: T5.3

## Dependencies
- list: [] (no new dependencies)
- commands: [] (no install commands)

## File Operations (in execution order)

### 1. MODIFY js/connectome.js
- operation: MODIFY
- reason: Add nociception field to BRAIN.stimulate, remove lightDirection field, add nociception stimulus processing in sensory block, add dormant infrastructure comment to dangerOdor processing

#### Change A: Remove lightDirection and add nociception to BRAIN.stimulate
- anchor: `lightDirection: 0,     // angle in radians`
- Replace the line `lightDirection: 0,     // angle in radians` with `nociception: false,   // pain response (triggered by rapid repeated touch)`
- The resulting BRAIN.stimulate block will have: touch, touchLocation, foodNearby, foodContact, dangerOdor, wind, windStrength, windDirection, lightLevel, nociception, temperature

#### Change B: Add nociception stimulus processing in sensory block
- anchor: `// Proprioceptive feedback (always-on when moving)` (line 353)
- Insert the following block BEFORE the `// Proprioceptive feedback` comment (between the temperature block ending at line 351 and the proprioceptive block at line 353):
```javascript

	// Nociception (pain response from repeated rapid touch)
	if (BRAIN.stimulate.nociception) {
		BRAIN.dendriteAccumulate('NOCI');
		BRAIN.stimulate.nociception = false; // single-tick: fire once then auto-clear
	}

```
- This processes the NOCI neuron weights (DN_STARTLE: 10, DRIVE_FEAR: 8, DN_FLIGHT: 6, SEZ_GROOM: 4, SEZ_FEED: -5) for one brain tick and auto-clears

#### Change C: Add dormant infrastructure comment to dangerOdor processing
- anchor: `// Danger odor` (line 325)
- Replace `// Danger odor` with `// Danger odor (NOTE: connectome weights are wired but no user interaction currently sets BRAIN.stimulate.dangerOdor)`

### 2. MODIFY js/constants.js
- operation: MODIFY
- reason: Add dormant infrastructure comments to GUS_GRN_WATER, GUS_GRN_BITTER, and OLF_ORN_DANGER weight blocks noting they are not yet wired to user interactions

#### Change A: Add comment to GUS_GRN_BITTER
- anchor: `// Bitter taste receptors` (line 114)
- Replace `// Bitter taste receptors` with `// Bitter taste receptors (NOTE: weights defined but not yet wired to any user interaction)`

#### Change B: Add comment to GUS_GRN_WATER
- anchor: `// Water taste receptors` (line 123)
- Replace `// Water taste receptors` with `// Water taste receptors (NOTE: weights defined but not yet wired to any user interaction)`

#### Change C: Add comment to OLF_ORN_DANGER
- anchor: `// Olfactory receptor neurons -- danger/noxious odors` (line 83)
- Replace `// Olfactory receptor neurons -- danger/noxious odors` with `// Olfactory receptor neurons -- danger/noxious odors (NOTE: weights defined but no user interaction currently sets dangerOdor stimulus)`

### 3. MODIFY js/main.js
- operation: MODIFY
- reason: Add temperature cycle button handler, add nociception detection via rapid touch tracking, update tab-visibility reset, add help overlay entry for temperature

#### Change A: Add temperature state variables after light state variables
- anchor: `var lightLabels = ['Bright', 'Dim', 'Dark'];` (line 100)
- Insert the following lines AFTER `var lightLabels = ['Bright', 'Dim', 'Dark'];`:
```javascript
var tempStates = [0.5, 0.75, 0.25];
var tempStateIndex = 0;
var tempLabels = ['Neutral', 'Warm', 'Cool'];
```

#### Change B: Add touchTimestamps array for nociception detection
- anchor: `var canvasTouchActive = false;` (line 97)
- Insert the following line AFTER `var canvasTouchActive = false;`:
```javascript
var touchTimestamps = [];
```

#### Change C: Wire temperature button in the tool button handler loop
- anchor: `if (tool === 'light') {` (line 139)
- Replace the block:
```javascript
		if (tool === 'light') {
			btn.addEventListener('click', cycleLightLevel);
		} else {
```
- With:
```javascript
		if (tool === 'light') {
			btn.addEventListener('click', cycleLightLevel);
		} else if (tool === 'temp') {
			btn.addEventListener('click', cycleTempLevel);
		} else {
```

#### Change D: Add nociception detection to applyTouchTool function
- anchor: `touchResetTime = Math.max(touchResetTime, Date.now() + 2000);` (line 426, the last line before the closing `}` of applyTouchTool)
- Insert the following block AFTER `touchResetTime = Math.max(touchResetTime, Date.now() + 2000);` and BEFORE the closing `}` of applyTouchTool:
```javascript

	// Track touch timestamps for nociception (rapid repeated touch = pain)
	var now = Date.now();
	touchTimestamps.push(now);
	// Prune entries older than 4 seconds
	var cutoff = now - 4000;
	while (touchTimestamps.length > 0 && touchTimestamps[0] < cutoff) {
		touchTimestamps.shift();
	}
	// 3+ touches within 4 seconds triggers nociception for one brain tick
	if (touchTimestamps.length >= 3) {
		BRAIN.stimulate.nociception = true;
		touchTimestamps.length = 0; // reset to require fresh rapid touches
	}
```

#### Change E: Add cycleTempLevel function after cycleLightLevel
- anchor: `function cycleLightLevel() {` (line 750)
- The cycleLightLevel function spans lines 750-755. Insert the following function AFTER the closing `}` of cycleLightLevel (after line 755):
```javascript

function cycleTempLevel() {
	tempStateIndex = (tempStateIndex + 1) % tempStates.length;
	BRAIN.stimulate.temperature = tempStates[tempStateIndex];
	var btn = document.getElementById('tempBtn');
	if (btn) btn.textContent = 'Temp: ' + tempLabels[tempStateIndex];
}
```

#### Change F: Add nociception reset to tab visibility handler
- anchor: `BRAIN.stimulate.foodContact = false;` (line 262, inside the visibility change handler)
- Insert the following line AFTER `BRAIN.stimulate.foodContact = false;`:
```javascript
		BRAIN.stimulate.nociception = false;
```
- Also insert `touchTimestamps.length = 0;` AFTER the existing `touchResetTime = 0;` (line 264):
```javascript
		touchTimestamps.length = 0;
```

### 4. MODIFY index.html
- operation: MODIFY
- reason: Add temperature cycle button to toolbar, add help overlay entry for temperature, update touch help text

#### Change A: Add temperature button to toolbar after lightBtn
- anchor: `<button class="tool-btn" data-tool="light" id="lightBtn">Light: Bright</button>` (line 15)
- Insert the following line AFTER the lightBtn line:
```html
            <button class="tool-btn" data-tool="temp" id="tempBtn">Temp: Neutral</button>
```

#### Change B: Add temperature help entry and update touch help entry
- anchor: `<div class="help-item"><strong>Light</strong> -- Cycles through Bright, Dim, and Dark. The fly exhibits phototaxis toward light.</div>` (line 35)
- Insert the following line AFTER the Light help item:
```html
        <div class="help-item"><strong>Temp</strong> -- Cycles through Neutral, Warm, and Cool. Warm makes the fly more active and avoidant. Cool makes it exploratory.</div>
```
- Also modify the existing Touch help item. Replace:
```html
        <div class="help-item"><strong>Touch</strong> -- Click on the fly to touch it. Location matters: head, thorax, abdomen, or leg each triggers different grooming.</div>
```
- With:
```html
        <div class="help-item"><strong>Touch</strong> -- Click on the fly to touch it. Location matters: head, thorax, abdomen, or leg each triggers different grooming. Tap 3+ times in 4 seconds for a pain response.</div>
```

### 5. NO CHANGES to css/main.css
- reason: The temperature button uses existing .tool-btn class styling. The cycle button pattern (same as Light) does not need active-class management per Known Pattern #2. No new CSS is required.

## Verification
- build: No build step (plain browser JS loaded via script tags)
- lint: No linter configured
- test: No existing tests
- smoke: Open index.html in a browser and verify:
  1. Temperature button appears in toolbar after Light button, displays "Temp: Neutral"
  2. Clicking Temp button cycles: Neutral -> Warm -> Cool -> Neutral
  3. In Warm mode, the fly should become more active/avoidant (THERMO_WARM fires with warmIntensity=0.5, activating LH_AV and DRIVE_FEAR)
  4. In Cool mode, the fly should be more exploratory (THERMO_COOL fires with coolIntensity=0.5, activating LH_APP and DRIVE_CURIOSITY)
  5. Temp button does NOT deselect Feed/Touch/Air tools (it is a cycle button, not an active tool)
  6. Touch tool: rapidly clicking the fly 3+ times within 4 seconds triggers an intense escape response (nociception via NOCI neuron: DN_STARTLE 10, DRIVE_FEAR 8, DN_FLIGHT 6)
  7. Single touch still produces normal startle/grooming (nociception does NOT fire for fewer than 3 rapid touches)
  8. lightDirection property no longer exists in BRAIN.stimulate
  9. Comments present in constants.js for GUS_GRN_WATER, GUS_GRN_BITTER, OLF_ORN_DANGER
  10. Comment present in connectome.js for dangerOdor processing

## Constraints
- Do NOT modify SPEC.md, TASKS.md, or CLAUDE.md
- Do NOT add any new CSS rules -- use existing .tool-btn styles
- Do NOT modify the existing temperature processing logic in connectome.js lines 343-351 (it already handles the 0.75/0.25/0.5 values correctly)
- Do NOT wire GUS_GRN_WATER, GUS_GRN_BITTER, or OLF_ORN_DANGER to user interactions -- only add comments
- Do NOT modify any existing NOCI, THERMO_WARM, or THERMO_COOL weights in constants.js
- The nociception stimulus must auto-clear after exactly one brain tick (cleared inside BRAIN.update after processing, not via setTimeout)
- The temperature button must use the cycle-button pattern (separate click handler, no active-class management) per Known Pattern #2
- touchTimestamps array is self-bounding: pruned to 4-second window on each push, and cleared to empty after triggering nociception
- Do NOT add any files
