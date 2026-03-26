# Plan: D19.1

## Dependencies
- list: none
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/connectome.js
- operation: MODIFY
- reason: Move GUS_GRN_SWEET, GUS_GRN_BITTER, GUS_GRN_WATER from the sensory array to the central array in BRAIN.neuronRegions so their dot color (purple/central) matches the SEZ region classification in brain3d.js and education.js
- anchor: `'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER',` on line 104

#### Change 1: Remove GUS_GRN_* from sensory array

Replace the sensory array (lines 101-108) from:

```js
sensory: [
    'VIS_R1R6', 'VIS_R7R8', 'VIS_ME', 'VIS_LO', 'VIS_LC', 'VIS_LPTC',
    'OLF_ORN_FOOD', 'OLF_ORN_DANGER', 'OLF_LN', 'OLF_PN',
    'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER',
    'MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD', 'ANTENNAL_MECH',
    'THERMO_WARM', 'THERMO_COOL',
    'NOCI',
],
```

to:

```js
sensory: [
    'VIS_R1R6', 'VIS_R7R8', 'VIS_ME', 'VIS_LO', 'VIS_LC', 'VIS_LPTC',
    'OLF_ORN_FOOD', 'OLF_ORN_DANGER', 'OLF_LN', 'OLF_PN',
    'MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD', 'ANTENNAL_MECH',
    'THERMO_WARM', 'THERMO_COOL',
    'NOCI',
],
```

The line `'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER',` is removed entirely.

#### Change 2: Add GUS_GRN_* to central array

Replace the central array (lines 109-115) from:

```js
central: [
    'MB_KC', 'MB_APL', 'MB_MBON_APP', 'MB_MBON_AV', 'MB_DAN_REW', 'MB_DAN_PUN',
    'LH_APP', 'LH_AV',
    'CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA',
    'SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER',
    'GNG_DESC', 'CLOCK_DN',
],
```

to:

```js
central: [
    'MB_KC', 'MB_APL', 'MB_MBON_APP', 'MB_MBON_AV', 'MB_DAN_REW', 'MB_DAN_PUN',
    'LH_APP', 'LH_AV',
    'CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA',
    'SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER',
    'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER',
    'GNG_DESC', 'CLOCK_DN',
],
```

The line `'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER',` is inserted between `'SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER',` and `'GNG_DESC', 'CLOCK_DN',`.

### 2. MODIFY js/brain3d.js
- operation: MODIFY
- reason: Add a smooth fade-out transition when the highlight timer expires, instead of snapping abruptly from highlight values to calculated activation values
- anchor: `if (region._highlightUntil > 0) {` at line 322

#### Constants to add

Add two new constants after the existing constant `var MAX_EMISSIVE_INTENSITY = 1.0;` (line 18):

```js
var HIGHLIGHT_OPACITY = 0.9;
var HIGHLIGHT_EMISSIVE = 1.5;
var HIGHLIGHT_FADE_MS = 300;
```

These define the highlight visual values (matching what highlightRegion() already uses at lines 353-354) and the fade-out duration in milliseconds.

#### Modify the highlight-check block in update()

Replace lines 322-327 (the current highlight check block) from:

```js
            if (region._highlightUntil > 0) {
                if (Date.now() < region._highlightUntil) {
                    continue;
                }
                region._highlightUntil = 0;
            }
```

to:

```js
            if (region._highlightUntil > 0) {
                var now = Date.now();
                if (now < region._highlightUntil) {
                    continue;
                }
                var fadeElapsed = now - region._highlightUntil;
                if (fadeElapsed < HIGHLIGHT_FADE_MS) {
                    var t = fadeElapsed / HIGHLIGHT_FADE_MS;
                    var fadeOpacity = HIGHLIGHT_OPACITY + (opacity - HIGHLIGHT_OPACITY) * t;
                    var fadeEmissive = HIGHLIGHT_EMISSIVE + (emissiveIntensity - HIGHLIGHT_EMISSIVE) * t;
                    for (var j = 0; j < region.meshes.length; j++) {
                        region.meshes[j].material.opacity = fadeOpacity;
                        region.meshes[j].material.emissiveIntensity = fadeEmissive;
                    }
                    continue;
                }
                region._highlightUntil = 0;
            }
```

Logic explanation:
1. `now` captures `Date.now()` once for consistency.
2. If `now < region._highlightUntil`, the highlight is still active — skip this region entirely (existing behavior, unchanged).
3. If the highlight timer has expired, compute `fadeElapsed = now - region._highlightUntil`. This is how many milliseconds have passed since the highlight expired.
4. If `fadeElapsed < HIGHLIGHT_FADE_MS` (300ms), we are in the fade-out period. Compute linear interpolation factor `t` (0 to 1). Interpolate from highlight values (HIGHLIGHT_OPACITY=0.9, HIGHLIGHT_EMISSIVE=1.5) toward the calculated target values (`opacity` and `emissiveIntensity`, which are computed on lines 329-330 — these lines must be moved BEFORE this block).
5. If `fadeElapsed >= HIGHLIGHT_FADE_MS`, the fade is complete. Set `_highlightUntil = 0` and fall through to the normal material assignment below.

**CRITICAL**: The `opacity` and `emissiveIntensity` target values (currently computed at lines 329-330) must be available BEFORE the highlight block uses them for interpolation. Move those two lines to execute before the highlight check.

#### Reorder lines in update() to compute target values before highlight check

The current order in the update() loop body (lines 307-336) is:
1. Compute activation (lines 309-320)
2. Highlight check (lines 322-327) — may `continue`
3. Compute opacity/emissiveIntensity (lines 329-330)
4. Apply to meshes (lines 332-335)

Change to:
1. Compute activation (lines 309-320) — unchanged
2. Compute opacity/emissiveIntensity — moved up from lines 329-330
3. Highlight check (new fade-out block) — uses opacity/emissiveIntensity for interpolation
4. Apply to meshes (lines 332-335) — unchanged

The complete replacement for the update() function body (lines 304-337) should be:

Replace from:
```js
    update: function () {
        if (!Brain3D.active || !Brain3D._initialized) return;

        for (var i = 0; i < Brain3D._regions.length; i++) {
            var region = Brain3D._regions[i];
            var sum = 0;
            var count = 0;
            for (var n = 0; n < region.neurons.length; n++) {
                var neuronName = region.neurons[n];
                if (BRAIN.postSynaptic[neuronName]) {
                    sum += BRAIN.postSynaptic[neuronName][BRAIN.thisState];
                    count++;
                }
            }
            var avg = count > 0 ? sum / count : 0;
            var normalized = Math.min(1, Math.max(0, avg / ACTIVATION_DIVISOR));
            region.activation = normalized;

            if (region._highlightUntil > 0) {
                if (Date.now() < region._highlightUntil) {
                    continue;
                }
                region._highlightUntil = 0;
            }

            var opacity = BASE_OPACITY + normalized * (MAX_OPACITY - BASE_OPACITY);
            var emissiveIntensity = BASE_EMISSIVE_INTENSITY + normalized * (MAX_EMISSIVE_INTENSITY - BASE_EMISSIVE_INTENSITY);

            for (var j = 0; j < region.meshes.length; j++) {
                region.meshes[j].material.opacity = opacity;
                region.meshes[j].material.emissiveIntensity = emissiveIntensity;
            }
        }
    },
```

to:
```js
    update: function () {
        if (!Brain3D.active || !Brain3D._initialized) return;

        for (var i = 0; i < Brain3D._regions.length; i++) {
            var region = Brain3D._regions[i];
            var sum = 0;
            var count = 0;
            for (var n = 0; n < region.neurons.length; n++) {
                var neuronName = region.neurons[n];
                if (BRAIN.postSynaptic[neuronName]) {
                    sum += BRAIN.postSynaptic[neuronName][BRAIN.thisState];
                    count++;
                }
            }
            var avg = count > 0 ? sum / count : 0;
            var normalized = Math.min(1, Math.max(0, avg / ACTIVATION_DIVISOR));
            region.activation = normalized;

            var opacity = BASE_OPACITY + normalized * (MAX_OPACITY - BASE_OPACITY);
            var emissiveIntensity = BASE_EMISSIVE_INTENSITY + normalized * (MAX_EMISSIVE_INTENSITY - BASE_EMISSIVE_INTENSITY);

            if (region._highlightUntil > 0) {
                var now = Date.now();
                if (now < region._highlightUntil) {
                    continue;
                }
                var fadeElapsed = now - region._highlightUntil;
                if (fadeElapsed < HIGHLIGHT_FADE_MS) {
                    var t = fadeElapsed / HIGHLIGHT_FADE_MS;
                    var fadeOpacity = HIGHLIGHT_OPACITY + (opacity - HIGHLIGHT_OPACITY) * t;
                    var fadeEmissive = HIGHLIGHT_EMISSIVE + (emissiveIntensity - HIGHLIGHT_EMISSIVE) * t;
                    for (var j = 0; j < region.meshes.length; j++) {
                        region.meshes[j].material.opacity = fadeOpacity;
                        region.meshes[j].material.emissiveIntensity = fadeEmissive;
                    }
                    continue;
                }
                region._highlightUntil = 0;
            }

            for (var j = 0; j < region.meshes.length; j++) {
                region.meshes[j].material.opacity = opacity;
                region.meshes[j].material.emissiveIntensity = emissiveIntensity;
            }
        }
    },
```

#### Update highlightRegion() to use constants

Replace lines 353-354 in highlightRegion() from:

```js
            foundRegion.meshes[j].material.emissiveIntensity = 1.5;
            foundRegion.meshes[j].material.opacity = 0.9;
```

to:

```js
            foundRegion.meshes[j].material.emissiveIntensity = HIGHLIGHT_EMISSIVE;
            foundRegion.meshes[j].material.opacity = HIGHLIGHT_OPACITY;
```

This ensures the highlight values used in highlightRegion() and the fade-out interpolation in update() are always the same constants.

## Verification
- build: no build step (vanilla JS, loaded via script tags)
- lint: no linter configured
- test: no existing tests
- smoke: Open index.html in a browser. (1) Open the connectome dot panel and verify GUS_GRN_SWEET, GUS_GRN_BITTER, GUS_GRN_WATER dots are purple (central) not blue (sensory). (2) Open Brain 3D view, open the education/Learn panel, click the "Subesophageal Zone" region name to trigger a highlight, and verify the region glows brightly then fades smoothly over ~300ms to its activation level instead of snapping abruptly.

## Constraints
- Do not modify any file other than js/connectome.js and js/brain3d.js
- Do not modify SPEC.md, TASKS.md, CLAUDE.md, or any file in .buildloop/ other than current-plan.md
- Do not add any new dependencies or files
- Do not change the highlight duration (1200ms) — only add a 300ms fade-out after it expires
- Do not change the highlight visual values (opacity 0.9, emissiveIntensity 1.5) — only extract them to named constants
- Do not modify education.js — the SEZ region is already classified as central there
- Preserve all existing variable naming conventions (var, not const/let — the codebase uses ES5 style)
