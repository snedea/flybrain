# Plan: T13.1

Wire unused connectome pathways (danger odor, bitter taste, water taste) to user interactions.

## Dependencies
- list: none (vanilla JS, no packages)
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/connectome.js
- operation: MODIFY
- reason: Add `bitterContact` and `waterContact` stimulus flags and wire them into BRAIN.update() sensory processing; also add `thirst` drive

#### anchor: `BRAIN.stimulate = {`

Add two new boolean fields to `BRAIN.stimulate`:
```
bitterContact: false,
waterContact: false,
```
Place them after the `foodContact: false,` line (line 138).

#### anchor: `BRAIN.drives = {`

Add a `thirst` drive:
```
thirst: 0.4,
```
Place it after `curiosity: 0.5,` (line 157). Initial value 0.4 (starts moderately thirsty).

#### anchor: `BRAIN.updateDrives = function () {`

In the `updateDrives` function body, add thirst logic:
1. After the hunger block (`if (BRAIN._isFeeding) { d.hunger -= 0.3; }`), add:
```js
// Thirst: increases over time (slower than hunger), decreases on water contact
d.thirst += 0.003;
if (BRAIN.stimulate.waterContact) {
    d.thirst -= 0.4;
}
```
2. The existing clamp loop at the end (`for (var key in d)`) already handles clamping `thirst` to [0, 1] since it iterates all keys. No change needed there.

#### anchor: `// Food contact (gustatory)`

After the existing `foodContact` block (lines 322-324):
```js
if (BRAIN.stimulate.foodContact) {
    BRAIN.dendriteAccumulate('GUS_GRN_SWEET');
}
```

Add two new blocks immediately after:
```js
// Bitter food contact (gustatory -- aversion)
if (BRAIN.stimulate.bitterContact) {
    BRAIN.dendriteAccumulate('GUS_GRN_BITTER');
}

// Water contact (gustatory -- thirst reduction)
if (BRAIN.stimulate.waterContact) {
    BRAIN.dendriteAccumulate('GUS_GRN_WATER');
}
```

### 2. MODIFY index.html
- operation: MODIFY
- reason: Add "Danger" and "Water" toolbar buttons; add help text for new tools and update existing Temp help with Water info

#### anchor: `<button class="tool-btn" data-tool="temp" id="tempBtn">Temp: Neutral</button>`

Insert two new buttons immediately after the Temp button:
```html
<button class="tool-btn" data-tool="danger">Danger</button>
<button class="tool-btn" data-tool="water">Water</button>
```

#### anchor: `<div class="help-item"><strong>Temp</strong>`

After the Temp help-item div, add three new help items:
```html
<div class="help-item"><strong>Danger</strong> -- Click near the fly to emit a danger odor. The fly detects noxious chemicals via olfactory neurons and triggers an avoidance/flight response.</div>
<div class="help-item"><strong>Water</strong> -- Click on the canvas to place a water droplet. The fly drinks when thirsty, reducing its thirst drive.</div>
<div class="help-item"><strong>Bitter food</strong> -- 10% of placed food is randomly bitter (shown in green). If the fly contacts bitter food, it triggers rejection and aversive learning.</div>
```

#### anchor: `<script type="text/javascript" src="./js/constants.js?v=23"></script>`

Bump all `?v=23` cache-bust params to `?v=24` on these script tags: `constants.js`, `connectome.js`, `fly-logic.js`, `main.js`. Also bump the CSS link from `?v=23` to `?v=24`.

Change every occurrence of `?v=23` in `index.html` to `?v=24`.

### 3. MODIFY js/main.js
- operation: MODIFY
- reason: Add danger tool handler, water drop item array, bitter food marking on food placement, water/bitter contact detection in update loop, drawing routines for water drops and bitter food, and thirst drive meter sync

#### 3a. Add water items array and danger reset time
- anchor: `var food = [];`

After this line (line 31), add:
```js
var waterDrops = [];
var dangerResetTime = 0;
```

#### 3b. Add danger tool to handleCanvasMousedown
- anchor: `} else if (activeTool === 'air') {`

Before this `else if`, add a new branch:
```js
} else if (activeTool === 'danger') {
    // Emit danger odor at click location -- affects fly if within 80px
    var distToFly = Math.hypot(cx - fly.x, cy - fly.y);
    if (distToFly <= 80) {
        BRAIN.stimulate.dangerOdor = true;
        dangerResetTime = Date.now() + 2000;
    }
    ripples.push({ x: cx, y: cy, startTime: Date.now() });
```

#### 3c. Add water tool to handleCanvasMousedown
- anchor: the same `handleCanvasMousedown` function, after the existing `} else if (activeTool === 'air') {` block

After the air tool's opening brace block (after line 849 `}`), but before the closing `}` of `handleCanvasMousedown`, add:
```js
} else if (activeTool === 'water') {
    var waterMinY = getLayoutBounds().top;
    var waterMaxY = window.innerHeight;
    cy = Math.max(waterMinY, Math.min(waterMaxY, cy));
    waterDrops.push({ x: cx, y: cy, radius: 6 });
```

The complete structure of `handleCanvasMousedown` after edits should be:
```
if (activeTool === 'feed') { ... }
else if (activeTool === 'touch') { ... }
else if (activeTool === 'danger') { ... }
else if (activeTool === 'air') { ... }
else if (activeTool === 'water') { ... }
```

#### 3d. Mark 10% of food as bitter on placement
- anchor: `food.push({ x: cx, y: cy, radius: 10, feedStart: 0, feedDuration: 0, eaten: 0 });`

Replace this line with:
```js
food.push({ x: cx, y: cy, radius: 10, feedStart: 0, feedDuration: 0, eaten: 0, bitter: Math.random() < 0.1 });
```

#### 3e. Add bitter contact detection in food proximity loop
- anchor: In the `update()` function, the food proximity loop starts at line 1930 with `// Food proximity`

Inside the existing food proximity loop, in the `if (dist <= 20)` block (line 1937-1955), after the line `BRAIN.stimulate.foodContact = true;`, add bitter detection:
```js
// Bitter food detection
if (food[i].bitter) {
    BRAIN.stimulate.bitterContact = true;
    // Bitter food causes immediate rejection: remove food and skip feeding
    food.splice(i, 1);
    i--;
    continue;
}
```

This must go immediately after `BRAIN.stimulate.foodContact = true;` and before the `if (behavior.current === 'feed')` block.

Also, at the top of the food proximity section (after resetting `foodContact` and `foodNearby` to false), add:
```js
BRAIN.stimulate.bitterContact = false;
```
Place this after line `BRAIN.stimulate.foodNearby = false;` (line 1932).

#### 3f. Add water contact detection in update()
- anchor: In the `update()` function, after the entire food proximity loop (after line 1974 approximately, the closing `}` of the food for-loop)

Add a water proximity loop:
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

#### 3g. Add danger odor reset timer
- anchor: `// Reset wind stimulus after wall-clock expiry (2 seconds)`

Before this comment block (line 1983), add:
```js
// Reset danger odor stimulus after wall-clock expiry (2 seconds)
if (dangerResetTime > 0 && Date.now() >= dangerResetTime) {
    BRAIN.stimulate.dangerOdor = false;
    dangerResetTime = 0;
}
```

#### 3h. Update clearButton to also clear water drops
- anchor: `document.getElementById('clearButton').onclick = function () {`

Change the body from:
```js
food = [];
```
to:
```js
food = [];
waterDrops = [];
```

#### 3i. Draw bitter food with distinct color
- anchor: In `drawFood()`, the line `ctx.fillStyle = 'rgb(251,192,45)';` (line 1225)

Replace this single line with:
```js
ctx.fillStyle = f.bitter ? 'rgb(120, 200, 80)' : 'rgb(251,192,45)';
```

#### 3j. Add drawWaterDrops function
- anchor: Place this new function immediately after `drawFood()` function (after line 1228 `}`)

```js
/**
 * Draws water droplets on the canvas as small blue circles.
 */
function drawWaterDrops() {
    for (var i = 0; i < waterDrops.length; i++) {
        var w = waterDrops[i];
        ctx.beginPath();
        ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(100, 180, 255, 0.8)';
        ctx.fill();
    }
}
```

#### 3k. Call drawWaterDrops in draw()
- anchor: `drawFood();` inside the `draw()` function (line 2016)

After `drawFood();`, add:
```js
drawWaterDrops();
```

So the draw calls become:
```js
drawFood();
drawWaterDrops();
drawRipples();
drawWindArrow();
```

#### 3l. Add thirst drive meter to UI sync
- anchor: `if (driveGroomEl) driveGroomEl.style.width = (BRAIN.drives.groom * 100) + '%';` (line 649)

Immediately after this line, add:
```js
var driveThirstEl = document.getElementById('driveThirst');
if (driveThirstEl) driveThirstEl.style.width = (BRAIN.drives.thirst * 100) + '%';
```

#### 3m. Clamp water drop positions on resize
- anchor: In the resize function, after the food position clamping loop:
```js
for (var i = 0; i < food.length; i++) {
    food[i].x = Math.max(0, Math.min(food[i].x, window.innerWidth));
```

After this food clamping loop, add:
```js
for (var i = 0; i < waterDrops.length; i++) {
    waterDrops[i].x = Math.max(0, Math.min(waterDrops[i].x, window.innerWidth));
    waterDrops[i].y = Math.max(getLayoutBounds().top, Math.min(waterDrops[i].y, window.innerHeight));
}
```

#### 3n. Add danger ripple color variant
The existing ripple drawing (`drawRipples`) uses orange (`rgba(227, 115, 75, ...)`). No change needed -- danger tool reuses the same ripple visual. The ripple gives feedback that the click registered.

### 4. MODIFY index.html (thirst drive meter)
- operation: MODIFY
- reason: Add thirst drive bar row to the drive-meters panel

#### anchor: The last drive-row div in drive-meters (the Groom row):
```html
<div class="drive-row">
    <span class="drive-label">Groom</span>
    <div class="drive-bar-bg"><div class="drive-bar" id="driveGroom"></div></div>
</div>
```

After this div, add:
```html
<div class="drive-row">
    <span class="drive-label">Thirst</span>
    <div class="drive-bar-bg"><div class="drive-bar" id="driveThirst"></div></div>
</div>
```

### 5. MODIFY js/main.js (neuron descriptions)
- operation: MODIFY
- reason: The neuron descriptions already include entries for GUS_GRN_BITTER, GUS_GRN_WATER, and OLF_ORN_DANGER (lines 170-175). No changes needed here.

Actually -- skip this step, descriptions already exist.

### 6. MODIFY js/fly-logic.js
- operation: MODIFY
- reason: No changes needed. The bitter contact causes immediate food removal (no behavior state change needed), danger odor triggers avoidance via the existing connectome pathway (OLF_ORN_DANGER -> fear -> startle/flight), and water contact is handled by drive reduction. The existing `evaluateBehaviorEntry()` already handles startle/fly based on accumulators.

Actually -- skip this step, no changes needed.

## Verification
- build: No build step. Open `index.html` in a browser directly.
- lint: No linter configured.
- test: `open js/tests.html` (if it exists) -- or "no existing test runner for these features"
- smoke: Open `index.html` in a browser and verify:
  1. **Danger tool**: Select "Danger" from toolbar. Click within 80px of fly. Verify fly's fear drive spikes and it enters startle/flight behavior. Verify the danger odor auto-clears after 2 seconds.
  2. **Bitter food**: Select "Feed" and place ~20 food items. Verify roughly 2 appear in green (bitter). When fly contacts a green food, verify it disappears immediately (rejection) and the fly does NOT enter feed state for that item. Check that the connectome panel shows GUS_GRN_BITTER firing briefly.
  3. **Water tool**: Select "Water" from toolbar. Click to place a water droplet (blue circle). Verify fly approaches and the droplet disappears on contact. Verify thirst drive bar decreases. Verify GUS_GRN_WATER fires in connectome panel.
  4. **Thirst drive**: Verify the "Thirst" drive bar appears in the left panel under Groom. It should slowly increase over time.
  5. **Clear button**: Click the X/clear icon. Verify both food and water drops are cleared.
  6. **Help overlay**: Click "?" and verify Danger, Water, and Bitter food entries appear.

## Constraints
- Do NOT modify SPEC.md, CLAUDE.md, or TASKS.md
- Do NOT modify js/constants.js -- the weights are already correctly defined (confirmed at lines 83-128)
- Do NOT add new dependencies or build steps
- Do NOT modify js/fly-logic.js unless a behavior state change is truly needed (it is not for this task)
- Do NOT modify js/brain-worker-bridge.js (the simplified connectome path in connectome.js handles stimulation directly)
- Use ES5 syntax throughout (var, not let/const) to match existing codebase style
- All new `BRAIN.stimulate` flags must be boolean and default to false
- Bitter food removal must happen BEFORE the feeding logic runs to prevent the fly from eating bitter food
- Water drops use a smaller radius (6px) than food (10px) to be visually distinct
- Danger tool range is 80px (slightly larger than touch's 50px, since odor diffuses)
- The danger odor stimulus auto-clears via setTimeout pattern (2 second timer), consistent with how touch and wind stimuli clear (pattern #3 from known patterns)
- The "Danger" button is a click-to-apply tool (like Feed, Touch) that participates in active-class management (pattern #9 -- it is NOT a cycle button like Light/Temp)
- The "Water" button is also a click-to-apply tool
- Bump all cache-bust query params from `?v=23` to `?v=24`
