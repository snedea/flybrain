# Plan: T7.6

## Dependencies
- list: none (no new packages)
- commands: none

## File Operations (in execution order)

### 1. MODIFY index.html
- operation: MODIFY
- reason: Add id to connectome subtitle for JS access, add scale indicator span to header toolbar, add title attribute to toggle button for keyboard shortcut hint

#### Change A: Add id to connectome subtitle
- anchor: `<div class="connectome-subtitle">59 neuron groups modeling ~130K real neurons (FlyWire 2024)</div>`
- Replace the above line with:
  ```html
  <div class="connectome-subtitle" id="connectomeSubtitle">59 neuron groups modeling ~130K real neurons (FlyWire 2024)</div>
  ```

#### Change B: Add scale indicator to toolbar-right
- anchor: `<span class="toolbar-title">FlyBrain</span>`
- Replace the above line with:
  ```html
  <span class="toolbar-title">FlyBrain</span>
  <span id="scaleIndicator" class="scale-indicator" style="display:none;"></span>
  ```

#### Change C: Add title to toggle button for shortcut hint
- anchor: `<button class="connectome-toggle-btn" id="connectomeToggleBtn">Hide</button>`
- Replace the above line with:
  ```html
  <button class="connectome-toggle-btn" id="connectomeToggleBtn" title="Toggle view (V)">Hide</button>
  ```

### 2. MODIFY css/main.css
- operation: MODIFY
- reason: Add scale-indicator style and loading-state subtitle animation

#### Change A: Add scale-indicator class after .connectome-subtitle
- anchor: `.connectome-subtitle {`
- After the entire `.connectome-subtitle` rule block (which ends with `}`), insert the following new rules:

```css
.scale-indicator {
    font-size: 0.65rem;
    color: var(--text-muted);
    opacity: 0.6;
    white-space: nowrap;
    letter-spacing: 0.01em;
}

.connectome-subtitle.loading {
    color: var(--accent);
    opacity: 1;
}
```

### 3. MODIFY js/brain-worker-bridge.js
- operation: MODIFY
- reason: Add progress indicator during connectome download using XHR, update subtitle and scale indicator on worker ready, store edgeCount on BRAIN

#### Imports / Dependencies
- None (browser APIs only: XMLHttpRequest, DOM)

#### Functions

##### New function: fetchBinaryWithProgress(url, onProgress)
- signature: `function fetchBinaryWithProgress(url, onProgress)`
- purpose: Downloads a binary file via XHR with progress callback
- logic:
  1. Return a new Promise
  2. Create `new XMLHttpRequest()`
  3. Call `xhr.open('GET', url, true)`
  4. Set `xhr.responseType = 'arraybuffer'`
  5. Set `xhr.onprogress` handler: if `e.lengthComputable`, call `onProgress(e.loaded, e.total)`, else call `onProgress(e.loaded, 0)`
  6. Set `xhr.onload` handler: if `xhr.status >= 200 && xhr.status < 300`, resolve with `xhr.response`, else reject with `new Error('HTTP ' + xhr.status + ' fetching ' + url)`
  7. Set `xhr.onerror` handler: reject with `new Error('Network error fetching ' + url)`
  8. Call `xhr.send()`
- calls: none
- returns: `Promise<ArrayBuffer>`
- error handling: Rejects promise on HTTP error or network error

##### New function: updateLoadingProgress(loaded, total)
- signature: `function updateLoadingProgress(loaded, total)`
- purpose: Updates the connectome subtitle element with download progress
- logic:
  1. `var subtitle = document.getElementById('connectomeSubtitle')`
  2. If `!subtitle` return
  3. `var loadedMB = (loaded / (1024 * 1024)).toFixed(1)`
  4. If `total > 0`: `var totalMB = (total / (1024 * 1024)).toFixed(1)`, then set `subtitle.textContent = 'Loading connectome... ' + loadedMB + ' / ' + totalMB + ' MB'`
  5. Else: set `subtitle.textContent = 'Loading connectome... ' + loadedMB + ' MB'`
  6. Add class `'loading'` to subtitle via `subtitle.classList.add('loading')`
- calls: none
- returns: void
- error handling: none

##### Modify existing function: initBridge()
- anchor: `function initBridge() {`
- Current code (lines 47-80) fetches neuron_meta.json, then fetches connectome.bin.gz via fetch(), then creates worker.
- Replace the `return fetch(binUrl);` line and the subsequent `.then(function (res) { ... return res.arrayBuffer(); })` chain with fetchBinaryWithProgress.

New logic for initBridge (complete replacement of the function body):
  1. `var metaUrl = 'data/neuron_meta.json'`
  2. `var binUrl = 'data/connectome.bin.gz'`
  3. `var subtitle = document.getElementById('connectomeSubtitle')`
  4. If `subtitle`, set `subtitle.textContent = 'Loading connectome...'` and `subtitle.classList.add('loading')`
  5. `fetch(metaUrl)` chain:
     - `.then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + metaUrl); return res.json(); })`
     - `.then(function (meta) {` — same group metadata parsing as before (lines 57-63 of existing code), then return `fetchBinaryWithProgress(binUrl, updateLoadingProgress)` instead of `return fetch(binUrl)`
     - `.then(function (buffer) {` — same as existing: set `subtitle.textContent = 'Parsing connectome...'` (but keep the loading class), then create worker, set handlers, postMessage init with transferable
     - `.catch(function (err) {` — same fallback as existing, plus: if `subtitle`, set `subtitle.textContent = '59 neuron groups — FlyWire approximation (fallback)'` and `subtitle.classList.remove('loading')`

The complete initBridge function body:
```javascript
function initBridge() {
    var metaUrl = 'data/neuron_meta.json';
    var binUrl = 'data/connectome.bin.gz';
    var subtitle = document.getElementById('connectomeSubtitle');
    if (subtitle) {
        subtitle.textContent = 'Loading connectome...';
        subtitle.classList.add('loading');
    }

    fetch(metaUrl)
        .then(function (res) {
            if (!res.ok) throw new Error('HTTP ' + res.status + ' fetching ' + metaUrl);
            return res.json();
        })
        .then(function (meta) {
            groupCount = meta.group_count;
            groupSizes = meta.group_sizes;
            for (var i = 0; i < meta.groups.length; i++) {
                var g = meta.groups[i];
                groupNameToId[g.name] = g.id;
                groupIdToName[g.id] = g.name;
            }
            return fetchBinaryWithProgress(binUrl, updateLoadingProgress);
        })
        .then(function (buffer) {
            if (subtitle) {
                subtitle.textContent = 'Parsing connectome...';
            }
            worker = new Worker('js/sim-worker.js');
            worker.onmessage = handleWorkerMessage;
            worker.onerror = handleWorkerError;
            worker.postMessage({type: 'init', buffer: buffer}, [buffer]);
        })
        .catch(function (err) {
            console.warn('connectome.bin.gz load failed, using 59-group BRAIN.update():', err);
            BRAIN.update = legacyUpdate;
            if (subtitle) {
                subtitle.textContent = '59 neuron groups — FlyWire approximation (fallback)';
                subtitle.classList.remove('loading');
            }
        });
}
```

##### Modify existing function: handleWorkerMessage(e) — case 'ready'
- anchor: `console.log('Connectome worker ready: ' + neuronCount + ' neurons, ' +`
- After the existing line `BRAIN.workerGroupSizes = groupSizes;` (line 99), add:
  ```javascript
  BRAIN.workerEdgeCount = e.data.edgeCount;
  ```
- After the existing `console.log(...)` line (line 110-111), add the following subtitle and scale indicator updates:
  ```javascript
  // Update subtitle with actual counts
  var subtitle = document.getElementById('connectomeSubtitle');
  if (subtitle) {
      subtitle.textContent = neuronCount.toLocaleString() + ' neurons / ' +
          e.data.edgeCount.toLocaleString() + ' connections \u2014 FlyWire FAFB v783';
      subtitle.classList.remove('loading');
  }
  // Update header scale indicator
  var scaleEl = document.getElementById('scaleIndicator');
  if (scaleEl) {
      scaleEl.textContent = neuronCount.toLocaleString() + ' neurons / ' +
          e.data.edgeCount.toLocaleString() + ' connections \u2014 FlyWire FAFB v783';
      scaleEl.style.display = '';
  }
  ```

##### Modify existing function: handleWorkerError(err)
- anchor: `function handleWorkerError(err) {`
- After existing body, before the closing `}`, add:
  ```javascript
  var subtitle = document.getElementById('connectomeSubtitle');
  if (subtitle) {
      subtitle.textContent = '59 neuron groups — FlyWire approximation (fallback)';
      subtitle.classList.remove('loading');
  }
  ```

#### Wiring / Integration
- `fetchBinaryWithProgress` is called by `initBridge` (replaces the previous `fetch(binUrl)` call)
- `updateLoadingProgress` is passed as the `onProgress` callback to `fetchBinaryWithProgress`
- `BRAIN.workerEdgeCount` is set so main.js can read it for the scale indicator
- The subtitle element (`#connectomeSubtitle`) is updated at each phase: loading → parsing → ready/fallback

### 4. MODIFY js/main.js
- operation: MODIFY
- reason: Enhance connectome toggle to switch between WebGL and 59-group views, add keyboard shortcut 'v', update toggle button text on worker ready

#### Change A: Modify NeuroRenderer poll timer to update button text
- anchor: `var _neuroRendererInitTimer = setInterval(function () {`
- Replace the entire poll timer block (lines 493-500):
  ```javascript
  var _neuroRendererInitTimer = setInterval(function () {
  	if (BRAIN.workerReady && typeof NeuroRenderer !== 'undefined') {
  		clearInterval(_neuroRendererInitTimer);
  		NeuroRenderer.init();
  	}
  }, 200);
  setTimeout(function () { clearInterval(_neuroRendererInitTimer); }, 30000);
  ```
  With:
  ```javascript
  var _neuroRendererInitTimer = setInterval(function () {
  	if (BRAIN.workerReady && typeof NeuroRenderer !== 'undefined') {
  		clearInterval(_neuroRendererInitTimer);
  		if (NeuroRenderer.init()) {
  			connectomeToggleBtn.textContent = '59 Groups';
  		}
  	}
  }, 200);
  setTimeout(function () { clearInterval(_neuroRendererInitTimer); }, 30000);
  ```

#### Change B: Replace connectome toggle button handler
- anchor: `connectomeToggleBtn.addEventListener('click', function () {`
- Replace the entire event listener callback (lines 431-443):
  ```javascript
  connectomeToggleBtn.addEventListener('click', function () {
  	if (typeof NeuroRenderer !== 'undefined' && NeuroRenderer.isActive()) {
  		NeuroRenderer.destroy();
  		nodeHolder.classList.remove('hidden');
  		connectomeToggleBtn.textContent = 'Hide';
  	} else if (nodeHolder.classList.contains('hidden')) {
  		nodeHolder.classList.remove('hidden');
  		connectomeToggleBtn.textContent = 'Hide';
  	} else {
  		nodeHolder.classList.add('hidden');
  		connectomeToggleBtn.textContent = 'Show';
  	}
  });
  ```
  With:
  ```javascript
  connectomeToggleBtn.addEventListener('click', function () {
  	if (BRAIN.workerReady && typeof NeuroRenderer !== 'undefined') {
  		if (NeuroRenderer.isActive()) {
  			NeuroRenderer.destroy();
  			connectomeToggleBtn.textContent = '139K View';
  		} else {
  			if (NeuroRenderer.init()) {
  				connectomeToggleBtn.textContent = '59 Groups';
  			}
  		}
  	} else {
  		if (typeof NeuroRenderer !== 'undefined' && NeuroRenderer.isActive()) {
  			NeuroRenderer.destroy();
  			nodeHolder.classList.remove('hidden');
  			connectomeToggleBtn.textContent = 'Hide';
  		} else if (nodeHolder.classList.contains('hidden')) {
  			nodeHolder.classList.remove('hidden');
  			connectomeToggleBtn.textContent = 'Hide';
  		} else {
  			nodeHolder.classList.add('hidden');
  			connectomeToggleBtn.textContent = 'Show';
  		}
  	}
  });
  ```

#### Change C: Add keyboard shortcut listener for 'v' key
- anchor: `var brainTickId = setInterval(updateBrain, 500);`
- Insert the following BEFORE that line (so after the poll timer block, before the brain tick):
  ```javascript
  // Keyboard shortcut: 'v' toggles connectome view
  document.addEventListener('keydown', function (e) {
  	if (e.key === 'v' && !e.ctrlKey && !e.metaKey && !e.altKey) {
  		if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  		connectomeToggleBtn.click();
  	}
  });
  ```

## Verification
- build: no build step (vanilla JS, open index.html in browser)
- lint: no linter configured
- test: no existing tests
- smoke: Open `index.html` in a browser. Expected behavior:
  1. The left sidebar shows 59-group dots immediately on load
  2. The subtitle area shows "Loading connectome..." with orange accent color
  3. If `data/connectome.bin.gz` exists: progress shows "Loading connectome... X.X / Y.Y MB", then "Parsing connectome...", then the subtitle updates to "139,255 neurons / 2,713,004 connections — FlyWire FAFB v783", and the WebGL canvas replaces the dots
  4. If `data/connectome.bin.gz` does NOT exist (current state): subtitle shows "59 neuron groups — FlyWire approximation (fallback)" and the 59-group dots remain visible
  5. The header shows a scale indicator span (visible only when worker is ready)
  6. The toggle button says "59 Groups" when WebGL is active, "139K View" when showing 59-group view
  7. Pressing 'v' key toggles between views (same as clicking the toggle button)
  8. The toggle button has `title="Toggle view (V)"` showing on hover

## Constraints
- Do NOT modify js/sim-worker.js — it already handles init/parse/ready correctly
- Do NOT modify js/neuro-renderer.js — it already handles init/destroy/isActive correctly
- Do NOT modify js/connectome.js — the legacy BRAIN engine is unchanged
- Do NOT modify SPEC.md, TASKS.md, or CLAUDE.md
- Do NOT add any npm/yarn dependencies
- Do NOT create new files — all changes are modifications to existing files
- The fallback to 59-group view MUST still work when data files are missing
- The `\u2014` in subtitle/scale text is the Unicode em dash character (—); write it as the literal `\u2014` escape in JS strings or as the actual `—` character
- The `connectomeSubtitle` element must keep its existing CSS class `connectome-subtitle` — only add an `id` attribute
- `fetchBinaryWithProgress` and `updateLoadingProgress` must be declared inside the IIFE in brain-worker-bridge.js (between `(function () {` and the existing `var legacyUpdate = BRAIN.update;` line), not in global scope
