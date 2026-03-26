# Scout Report: T1.3

## Key Facts (read this first)

- **Stack**: Vanilla JS, HTML5 Canvas, no build step, no dependencies. Files: `index.html`, `css/main.css`, `js/constants.js`, `js/connectome.js`, `js/main.js`.
- **BRAIN.stimulate API is fully wired** in `connectome.js:133-144` -- all sensory inputs exist (`touch`, `touchLocation`, `foodNearby`, `foodContact`, `wind`, `windStrength`, `lightLevel`, `lightDirection`). T1.3 only needs to set these fields from UI events.
- **BRAIN.drives exists** at `connectome.js:155-161` with `hunger`, `fear`, `fatigue`, `curiosity`, `groom` as floats 0-1. Drive meters read these directly.
- **BRAIN.neuronRegions** at `connectome.js:99-127` classifies all neurons into `sensory`, `central`, `drives`, `motor` arrays -- ready for color-coded connectome panel.
- **Hard constraint**: Canvas is full-window (`canvas.width = window.innerWidth`, `canvas.height = window.innerHeight` at `main.js:641-644`). Current UI is all absolutely positioned overlays. New toolbar and bottom panel must follow this pattern, OR canvas resize must account for panel heights.

## Relevant Files

| File | Role for T1.3 |
|------|---------------|
| `index.html` | Add `#toolbar` div (top), restructure `#nodeHolder` into `#bottom-panel`. Remove legacy `#buttons` (center/clear) or relocate. |
| `css/main.css` | Add toolbar, bottom panel, tool button, active-tool, drive-meter styles. Remove/update legacy absolute positioning that will conflict. |
| `js/main.js` | Replace `addFood` canvas mousedown with tool-aware handler. Add tool state variable. Add connectome panel draw loop. Add light toggle logic. |
| `js/connectome.js` | Read-only for T1.3. Provides `BRAIN.stimulate`, `BRAIN.drives`, `BRAIN.neuronRegions`. |
| `js/constants.js` | Read-only. |

## Architecture Notes

**Current UI layout** (all absolutely positioned over full-screen canvas):
- `#nodeHolder`: all ~70 neuron spans rendered as green `brainNode` dots at `top:0` -- worm-sim legacy
- `#toggleConnectome`: slider at `bottom:10, left:10`
- `#githubButton`: at `bottom:10, right:10`
- `#buttons`: center + clear SVG buttons at bottom center

**Canvas event handling**: Single `canvas.addEventListener('mousedown', addFood)` at `main.js:75`. This must be replaced by a dispatcher that checks `activeTool` and routes to the correct sensory stimulation.

**Brain update loop**: `setInterval(updateBrain, 500)` at `main.js:69`. Inside `updateBrain`, node spans are updated by ID lookup (`document.getElementById(postSynaptic)`). This loop is also where the connectome panel should be refreshed (or a separate interval can be used).

**Fly position for hit-testing**: `fly.x`, `fly.y` (global), `facingDir` (global radians). Body parts have offsets defined in `BODY` object (`main.js:124-173`). To detect touch location, transform click coordinates into fly-local space (rotate by `-(-facingDir + PI/2)` = `facingDir - PI/2`) and compare against BODY offsets.

**Sensory neuron mappings** (what each tool sets):
- **Feed** (click near/on fly): `BRAIN.stimulate.foodNearby = true` if within ~50px; `BRAIN.stimulate.foodContact = true` if within ~20px. Also places visible food dot.
- **Touch** (click on fly body): `BRAIN.stimulate.touch = true`; `BRAIN.stimulate.touchLocation` = `'head'|'thorax'|'abdomen'|'leg'` based on local-space click position vs BODY offsets.
- **Air** (click/drag near fly): `BRAIN.stimulate.wind = true`; `BRAIN.stimulate.windStrength` proportional to drag distance or inverse proximity; set after mouse-up.
- **Light** (toolbar toggle, no canvas click): cycle `BRAIN.stimulate.lightLevel` through `1.0 -> 0.5 -> 0.0 -> 1.0`. Button label reflects current state.

**Connectome panel visualization**: The existing `#nodeHolder` with `brainNode` spans works but is unstyled by region. Options:
1. Keep spans, color them by region using `BRAIN.neuronRegions` lookup on init, update opacity by activation.
2. Draw a small canvas inside a `#connectome-panel` div.

Option 1 is simpler (no new canvas, reuses existing DOM + `updateBrain` loop). Just move `#nodeHolder` into the bottom panel div and add region-based `background-color` on setup.

**Drive meters**: Plain HTML `<div>` progress bars. Update width% from `BRAIN.drives` each brain tick (inside `updateBrain` or a separate `requestAnimationFrame`).

## Suggested Approach

1. **index.html**: Add `<div id="toolbar">` before `<canvas>`. Inside toolbar: 4 tool buttons (Feed, Touch, Air, Light) + title. Move `#nodeHolder` inside a new `<div id="bottom-panel">`. Add `<div id="drive-meters">` alongside it. Keep or remove legacy buttons (clear/center are still useful -- relocate to toolbar or remove).

2. **css/main.css**: Make `body` a flex column: `toolbar (fixed height) | canvas (flex-grow) | bottom-panel (fixed height)`. OR keep canvas full-window and absolutely position toolbar at top + bottom-panel at bottom with semi-transparent background. The latter is simpler and requires no canvas resize change. Set canvas top offset with CSS if using flex.

3. **js/main.js**:
   - Add `var activeTool = 'feed';` global.
   - Wire tool button clicks to set `activeTool` + update active class.
   - Replace `canvas.addEventListener('mousedown', addFood)` with `handleCanvasMousedown(event)` dispatcher. Add `mousemove` and `mouseup` for Air drag support.
   - Add `function applyTool(x, y)` that reads `activeTool` and stimulates the right neurons.
   - Add touch location detection function using fly-local coordinate transform.
   - Add Light toggle (toolbar button only, no canvas interaction).
   - In `updateBrain()`: color-code neurons by region on first call (one-time setup), update drive meter bar widths.

4. **Coloring neuronRegions**: On startup (or inside `BRAIN.setup`), iterate `BRAIN.neuronRegions` and set `backgroundColor` on each span. Colors: sensory=`#3399ff`, central=`#9933ff`, drives=`#ff9900`, motor=`#ff3333`.

## Risks and Constraints (read this last)

- **Canvas resize conflict**: If using flex layout (toolbar + canvas + panel), `window.innerWidth/Height` for canvas sizing will be wrong -- must subtract toolbar and panel heights. Safest: keep canvas `position:absolute; top:toolbarH; bottom:panelH; left:0; right:0` and set `canvas.width/height` from `canvas.offsetWidth/offsetHeight` in resize. Alternatively, overlay approach avoids this entirely.
- **Legacy `#buttons` (center/clear)**: Currently at `bottom:0` center -- conflicts with new bottom panel. Must relocate or remove. The clear button now needs tool-context (it only makes sense with Feed tool active, but can remain as a global reset).
- **`#toggleConnectome` overlap**: Currently at `bottom:10, left:10` -- will overlap the new bottom panel. Relocate to toolbar or remove (replaced by the panel itself).
- **Stimulus reset timing**: `BRAIN.stimulate.touch`, `.wind`, `.foodNearby` are set to `true` and then reset in a `setTimeout(..., 2000)` at `main.js:604-608`. This works for momentary events but Air drag needs to hold `wind=true` while dragging and reset on mouseup.
- **Touch location hit-test**: Requires coordinate rotation by `(facingDir - PI/2)` to go from canvas space to fly-local space. The BODY offsets use `headOffsetY: -24`, `thoraxOffsetY: -10`, `abdomenOffsetY: 12` -- use these to classify click position. Simple bounding box checks are sufficient.
- **Light tool UX**: SPEC says "toggle light level (bright/dim/dark)" -- this is a 3-state cycle on the toolbar button, not a canvas click. The button should show current state. `BRAIN.stimulate.lightLevel` is already read by connectome on every tick, so just keeping it set is sufficient.
- **`#nodeHolder` DOM ID collision**: `updateBrain` uses `document.getElementById(postSynaptic)` to find spans by neuron name. If `#nodeHolder` is moved inside bottom-panel, these lookups still work because IDs are document-wide. No code change needed for the lookup itself.
- **Existing `BRAIN.stimulateHungerNeurons/NoseTouchNeurons/FoodSenseNeurons`** flags at `connectome.js:147-149` are backward-compat shims still used in `main.js:604-608`. The new tool system should set `BRAIN.stimulate.*` directly and leave these shims alone (they map into `BRAIN.stimulate` at the top of `BRAIN.update`).
