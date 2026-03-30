# Review Report -- Connectome Grid Flat Sort Audit

## Claims Verified

### 1. `neuronActivityScore` tracking object, `ACTIVITY_DECAY=0.92`, `SORT_INTERVAL=3000`
**PASS** -- Declared at `js/main.js:195-197`. All three variables are global-scope and accessible throughout the file.

### 2. Replaced section-based grid builder IIFE with flat list sorted by population
**PASS** -- The IIFE at `js/main.js:330-406` iterates `Object.keys(BRAIN.connectome)`, sorts by `neuronPopulations` descending, and creates a single `.cg-nodes` container (`#connectomeGrid`) with all neurons as flat `.cg-node` children. Each node gets a `.cg-region-badge` with the correct abbreviation (S/C/D/M) and region color.

### 3. `sortConnectomeGrid()` function re-sorts by activity then population
**PASS** -- Defined at `js/main.js:409-431`, called via `setInterval` at line 433. Correctly:
- Queries `#connectomeGrid` by ID
- Reads `data-neuron` attribute from each `.cg-node`
- Sorts by `neuronActivityScore` descending (with 0.5 threshold), then `neuronPopulations` descending
- Uses `grid.appendChild()` to reorder DOM
- Applies `ACTIVITY_DECAY` (0.92) to all scores with floor at 0.1

### 4. Activity score increment in `updateBrain()`
**PASS** -- At `js/main.js:704-705`, inside the `if (baseOpacity > 0.15)` block, `neuronActivityScore[postSynaptic]` is incremented by 1. This runs only in the DOM branch (guarded by `typeof NeuroRenderer === 'undefined' || !NeuroRenderer.isActive()` at line 686).

### 5. CSS: `.cg-region-badge` replaces old `.cg-section` and `.cg-label` styles
**PASS** -- `.cg-region-badge` is defined at `css/main.css:113-125`. No `.cg-section` or `.cg-label` classes exist in any `.css`, `.js`, or `.html` file (confirmed via grep). Old classes are fully removed.

## Additional Verification

### `neuronRegionLookup` accessibility
**PASS** -- Declared as a global `var` at `js/main.js:329`, populated inside the IIFE (lines 335-349), and used at line 365 (inside the same IIFE). Not used outside the IIFE currently, but accessible globally if needed. No other JS files reference it.

### `connectomeGrid` ID usage
**PASS** -- Created at `js/main.js:359` (`grid.id = 'connectomeGrid'`), queried at line 410 (`document.getElementById('connectomeGrid')`). Consistent.

### No dependencies on old `.cg-section` DOM structure
**PASS** -- Grepped all `.js`, `.html`, and `.css` files. Zero references to `cg-section` or `cg-label` in source files (only in `.buildloop/logs/` history).

### `BRAIN.connectome` keys match grid neurons
**PASS** -- Both the grid IIFE (line 352) and `updateBrain()` (line 687) iterate `BRAIN.connectome`. The `neuronActivityScore` is initialized for all keys at line 401.

## Issues Found

### MEDIUM: `.connectome-grid` CSS still has 4-column grid layout (FIXED)
**Severity: MEDIUM**
**File:** `css/main.css:103-111`

The `.connectome-grid` class (on `#nodeHolder` in `index.html:63`) still had `display: grid; grid-template-columns: repeat(4, 1fr)` from the old 4-section layout. With the new single `.cg-nodes` child, this caused the entire connectome panel to render at ~25% width (one grid cell of four).

**Fix applied:** Changed `display: grid; grid-template-columns: repeat(4, 1fr)` to `display: flex; flex-direction: column`. The `.cg-nodes` child already uses `display: flex; flex-direction: column`, so the parent just needs to be a flex container that allows its child to fill the width.

### LOW: No animation/transition on sort reorder
**Severity: LOW -- cosmetic**
The `sortConnectomeGrid()` function moves DOM nodes via `appendChild()` which causes instant reorder. With 47 nodes re-sorting every 3 seconds, this could cause visual flicker. A CSS `transition` on `order` or a requestAnimationFrame-based approach could smooth this. Not a bug, just a UX consideration for later.

### LOW: Unbounded activity score growth
**Severity: LOW**
`neuronActivityScore` is incremented by 1 every `updateBrain()` tick (500ms) for every active neuron. Decay is 0.92 per 3 seconds. At 2 ticks/sec with 6 increments between decays, a continuously active neuron reaches equilibrium around score ~75 (`6 / (1 - 0.92)`). This is fine -- scores stay bounded. No issue.

## Result: PASS

One MEDIUM issue found and fixed (CSS grid layout). All claims verified against the code. The implementation is correct and consistent.
