# Plan: D18.1

## Dependencies
- list: []
- commands: []

## File Operations (in execution order)

### 1. MODIFY js/brain3d.js
- operation: MODIFY
- reason: Add a `_highlightUntil` timestamp property to each region object and make `update()` skip material overwrites for regions that are currently highlighted; also expose a public `highlightRegion(regionName)` method on Brain3D so education.js can call it cleanly without reaching into internal state.

#### Change A: Add `_highlightUntil` property to each region object in `_buildRegions()`
- anchor: the line `activation: 0` inside the region object literal at line 207
- After the `activation: 0` property, add: `_highlightUntil: 0`
- The region object literal becomes:
  ```js
  var region = {
      name: regionDef.name,
      description: regionDef.description,
      type: regionDef.type,
      neurons: neuronList,
      meshes: [],
      activation: 0,
      _highlightUntil: 0
  };
  ```

#### Change B: Make `update()` skip material writes for highlighted regions
- anchor: the line `region.activation = normalized;` at line 319
- In the `update()` function, after `region.activation = normalized;` (line 319) and before the material-write loop (line 324), add a check: if `region._highlightUntil > 0 && Date.now() < region._highlightUntil`, then `continue` to skip the material-write loop for this region. If the timestamp has expired (`Date.now() >= region._highlightUntil`), reset `region._highlightUntil = 0` and let the normal material write proceed.
- The modified `update()` loop body (lines 306-328) should become:
  ```js
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
  ```

#### Change C: Add a public `highlightRegion` method on Brain3D
- anchor: the closing `}` of the `update` function at line 328-329, just before `_onMouseMove: function`
- Add a new method `highlightRegion` to the Brain3D object, placed between the `update` method and `_onMouseMove` method:
  ```js
  highlightRegion: function (regionName) {
      if (!Brain3D.active || !Brain3D._initialized || !Brain3D._regions) return;

      var foundRegion = null;
      for (var i = 0; i < Brain3D._regions.length; i++) {
          if (Brain3D._regions[i].name === regionName) {
              foundRegion = Brain3D._regions[i];
              break;
          }
      }
      if (!foundRegion) return;

      foundRegion._highlightUntil = Date.now() + 1200;
      for (var j = 0; j < foundRegion.meshes.length; j++) {
          foundRegion.meshes[j].material.emissiveIntensity = 1.5;
          foundRegion.meshes[j].material.opacity = 0.9;
      }
  },
  ```
- This method: (1) finds the region by name, (2) sets `_highlightUntil` to `Date.now() + 1200` (1200ms from now), (3) sets highlight material values (emissiveIntensity: 1.5, opacity: 0.9) on all meshes. The `update()` function will skip overwriting these values until the timestamp expires, at which point it resumes normal activation-based material calculation.

### 2. MODIFY js/education.js
- operation: MODIFY
- reason: Replace the entire `highlightRegion` implementation with a simple delegation to `Brain3D.highlightRegion()`, removing the broken setTimeout restore logic and stale-value capture.

#### Change: Replace the `highlightRegion` function body
- anchor: `highlightRegion: function (regionName) {` at line 248
- Replace the entire `highlightRegion` method (lines 248-278) with:
  ```js
  highlightRegion: function (regionName) {
      if (typeof Brain3D !== 'undefined' && Brain3D.highlightRegion) {
          Brain3D.highlightRegion(regionName);
      }
  },
  ```
- This replaces lines 248-278 entirely. The old code that saved originals, set highlight values, and used setTimeout to restore is completely removed. All highlight logic now lives in `Brain3D.highlightRegion()` and `Brain3D.update()`.

## Verification
- build: no build step (vanilla JS, no bundler)
- lint: no linter configured
- test: no existing tests
- smoke: Open the app in a browser. Click "Brain 3D" to open the 3D panel. Click "Learn" to open the education panel. Click any region name link (e.g., "Optic Lobes") in the education panel. The corresponding 3D brain region should visibly glow brighter (opacity 0.9, high emissive) for approximately 1.2 seconds, then smoothly return to its activation-based glow level. The highlight should persist for the full 1200ms and not flicker or disappear after one frame.

## Constraints
- Do not modify js/main.js — the `Brain3D.update()` call at line 1769 stays as-is
- Do not modify js/connectome.js
- Do not modify css/main.css
- Do not modify index.html
- Do not add any new files
- Do not add any new dependencies or CDN scripts
- The highlight duration must remain 1200ms
- The highlight material values must remain emissiveIntensity: 1.5 and opacity: 0.9 (matching the original education.js values)
- The `_highlightUntil` timestamp approach is preferred over a boolean flag because it is self-expiring (no cleanup timer needed) and avoids the stale-setTimeout problem entirely
- When the highlight expires, `update()` must let the normal activation-based material calculation proceed in the same frame (not skip one more frame) — this is achieved by resetting `_highlightUntil = 0` and falling through to the material write code
