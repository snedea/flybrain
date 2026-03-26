# Plan: T6.3

## Dependencies
- list: [] (no new dependencies)
- commands: [] (no install commands)

## File Operations (in execution order)

### 1. MODIFY js/main.js
- operation: MODIFY
- reason: Add neuronPopulations data structure, enhance connectome tooltip with population counts, and inject summary line into connectome panel header

#### Change A: Add `neuronPopulations` object after `neuronDescriptions`
- anchor: `MN_ABDOMEN: 'Motor: abdomen',` followed by `};` (end of neuronDescriptions, line ~155-156)
- Insert the following object immediately AFTER the closing `};` of neuronDescriptions and BEFORE the `// --- Brain setup ---` comment (line 158):

```js
// Approximate real neuron counts per functional group (FlyWire data)
var neuronPopulations = {
	VIS_R1R6: 6000,
	VIS_R7R8: 1600,
	VIS_ME: 39000,
	VIS_LO: 9000,
	VIS_LC: 3500,
	VIS_LPTC: 900,
	OLF_ORN_FOOD: 1100,
	OLF_ORN_DANGER: 700,
	OLF_LN: 400,
	OLF_PN: 400,
	GUS_GRN_SWEET: 800,
	GUS_GRN_BITTER: 600,
	GUS_GRN_WATER: 600,
	MECH_BRISTLE: 2200,
	MECH_JO: 480,
	MECH_CHORD: 500,
	ANTENNAL_MECH: 320,
	THERMO_WARM: 30,
	THERMO_COOL: 30,
	NOCI: 100,
	MB_KC: 2000,
	MB_APL: 1,
	MB_MBON_APP: 35,
	MB_MBON_AV: 35,
	MB_DAN_REW: 165,
	MB_DAN_PUN: 165,
	LH_APP: 700,
	LH_AV: 700,
	CX_EPG: 50,
	CX_PFN: 400,
	CX_FC: 2200,
	CX_HDELTA: 350,
	SEZ_FEED: 2500,
	SEZ_GROOM: 1800,
	SEZ_WATER: 700,
	GNG_DESC: 3000,
	DN_WALK: 50,
	DN_FLIGHT: 40,
	DN_TURN: 30,
	DN_BACKUP: 20,
	DN_STARTLE: 15,
	VNC_CPG: 14400,
	CLOCK_DN: 150,
	DRIVE_HUNGER: 200,
	DRIVE_FEAR: 150,
	DRIVE_FATIGUE: 100,
	DRIVE_CURIOSITY: 100,
	DRIVE_GROOM: 100,
	MN_LEG_L1: 50,
	MN_LEG_R1: 50,
	MN_LEG_L2: 50,
	MN_LEG_R2: 50,
	MN_LEG_L3: 50,
	MN_LEG_R3: 50,
	MN_WING_L: 45,
	MN_WING_R: 45,
	MN_PROBOSCIS: 30,
	MN_HEAD: 40,
	MN_ABDOMEN: 60
};
```

#### Change B: Modify connectome dot panel tooltip to append population count
- anchor: `var desc = neuronDescriptions[id] || id;` (line 188)
- Replace the single line:
```js
	neuronTooltip.textContent = desc;
```
- With these lines:
```js
	var pop = neuronPopulations[id];
	var popText = pop ? ' \u2014 represents ~' + pop.toLocaleString() + ' neurons' : '';
	neuronTooltip.textContent = desc + popText;
```

Explanation: `\u2014` is an em-dash. `toLocaleString()` adds thousand-separator commas. If the neuron has no population entry, the suffix is empty.

#### Change C: Inject summary line into connectome panel header
- anchor: `// Build neuron -> color lookup from BRAIN.neuronRegions` (line 174)
- Insert the following block AFTER the closing `}` of the `for (var ps in BRAIN.connectome)` loop (line 172) and BEFORE the `// Build neuron -> color lookup` comment (line 174):

```js
// Inject connectome compression summary into header
(function () {
	var groupCount = Object.keys(neuronPopulations).length;
	var summarySpan = document.createElement('span');
	summarySpan.className = 'connectome-summary';
	summarySpan.style.fontSize = '0.6rem';
	summarySpan.style.color = '#8892a4';
	summarySpan.style.marginLeft = '0.3rem';
	summarySpan.textContent = groupCount + ' groups / ~130K neurons';
	var headerLabel = document.querySelector('.connectome-label');
	if (headerLabel) {
		headerLabel.parentNode.insertBefore(summarySpan, headerLabel.nextSibling);
	}
})();
```

Explanation: This IIFE computes the group count from neuronPopulations keys (will be 59), creates a styled span, and inserts it right after the "Connectome" label in the header. The "~130K" is hardcoded because it refers to the total Drosophila brain neuron count (the connectome compresses ~130K real neurons into our functional groups). Uses inline styles to avoid CSS file changes.

### 2. MODIFY js/brain3d.js
- operation: MODIFY
- reason: Add per-region neuron population totals to the 3D brain hover tooltip

#### Change A: Add population total to tooltip in `_onMouseMove`
- anchor: `html += '<div class="b3d-tip-neurons">';` (line 339 inside `_onMouseMove`)
- Replace the existing tooltip-building block (lines 336-347) with an updated version that adds a population summary line. The exact old block is:

```js
            var html = '<div class="b3d-tip-name">' + region.name + '</div>';
            html += '<div class="b3d-tip-desc">' + region.description + '</div>';
            html += '<div class="b3d-tip-type">' + region.type.charAt(0).toUpperCase() + region.type.slice(1) + '</div>';
            html += '<div class="b3d-tip-neurons">';
            for (var i = 0; i < region.neurons.length; i++) {
                var nName = region.neurons[i];
                var raw = BRAIN.postSynaptic[nName] ? BRAIN.postSynaptic[nName][BRAIN.thisState] : 0;
                var desc = (typeof neuronDescriptions !== 'undefined' && neuronDescriptions[nName]) ? neuronDescriptions[nName] : nName;
                var pct = Math.min(100, Math.max(0, Math.round(raw / ACTIVATION_DIVISOR * 100)));
                html += '<div class="b3d-tip-neuron"><span class="b3d-tip-neuron-name">' + desc + '</span><span class="b3d-tip-neuron-val">' + pct + '%</span></div>';
            }
            html += '</div>';
```

Replace with:

```js
            var regionPopTotal = 0;
            if (typeof neuronPopulations !== 'undefined') {
                for (var p = 0; p < region.neurons.length; p++) {
                    regionPopTotal += (neuronPopulations[region.neurons[p]] || 0);
                }
            }
            var html = '<div class="b3d-tip-name">' + region.name + '</div>';
            html += '<div class="b3d-tip-desc">' + region.description + '</div>';
            if (regionPopTotal > 0) {
                html += '<div class="b3d-tip-pop" style="font-size:0.7rem;color:#8892a4;margin:2px 0 4px;">' + region.neurons.length + ' groups representing ~' + regionPopTotal.toLocaleString() + ' neurons</div>';
            }
            html += '<div class="b3d-tip-type">' + region.type.charAt(0).toUpperCase() + region.type.slice(1) + '</div>';
            html += '<div class="b3d-tip-neurons">';
            for (var i = 0; i < region.neurons.length; i++) {
                var nName = region.neurons[i];
                var raw = BRAIN.postSynaptic[nName] ? BRAIN.postSynaptic[nName][BRAIN.thisState] : 0;
                var desc = (typeof neuronDescriptions !== 'undefined' && neuronDescriptions[nName]) ? neuronDescriptions[nName] : nName;
                var pct = Math.min(100, Math.max(0, Math.round(raw / ACTIVATION_DIVISOR * 100)));
                html += '<div class="b3d-tip-neuron"><span class="b3d-tip-neuron-name">' + desc + '</span><span class="b3d-tip-neuron-val">' + pct + '%</span></div>';
            }
            html += '</div>';
```

Explanation: Before building the HTML, compute `regionPopTotal` by summing `neuronPopulations[name]` for every neuron in the hovered region. If the total is > 0, insert a new `b3d-tip-pop` div between the description and the type badge showing "N groups representing ~X neurons". The inline style keeps the text small and muted. The existing neuron list and activation display are unchanged.

### 3. MODIFY js/education.js
- operation: MODIFY
- reason: Replace hardcoded populationEstimate strings with dynamically computed totals from neuronPopulations for consistency

#### Change A: Update population display in `_buildContent` to use computed totals
- anchor: `html += '<div class="edu-population">' + region.populationEstimate + '</div>';` (line 156)
- Replace that single line with:

```js
                var eduPopTotal = 0;
                if (typeof neuronPopulations !== 'undefined') {
                    for (var pi = 0; pi < region.neurons.length; pi++) {
                        eduPopTotal += (neuronPopulations[region.neurons[pi]] || 0);
                    }
                    if (region.collectMNPrefix && typeof BRAIN !== 'undefined' && BRAIN.postSynaptic) {
                        var mnKeys = Object.keys(BRAIN.postSynaptic);
                        for (var mi = 0; mi < mnKeys.length; mi++) {
                            if (mnKeys[mi].indexOf('MN_') === 0 && region.neurons.indexOf(mnKeys[mi]) === -1) {
                                eduPopTotal += (neuronPopulations[mnKeys[mi]] || 0);
                            }
                        }
                    }
                }
                if (eduPopTotal > 0) {
                    html += '<div class="edu-population">' + region.neurons.length + ' neuron groups representing ~' + eduPopTotal.toLocaleString() + ' real neurons</div>';
                } else {
                    html += '<div class="edu-population">' + region.populationEstimate + '</div>';
                }
```

Explanation: Compute the population total by summing `neuronPopulations` for each neuron in the education region. For the VNC/Motor region (`collectMNPrefix: true`), also sum all `MN_*` prefixed neurons not already in the list (same logic already used for neuron tag display on lines 147-154). If computed total > 0, display the dynamic string. If `neuronPopulations` is not defined (defensive fallback), display the original hardcoded `populationEstimate` string.

## Verification
- build: No build step — open `index.html` in a browser directly.
- lint: No linter configured.
- test: `node tests/run_tests.js`
- smoke: Open `index.html` in a browser. Verify all four features:
  1. Hover over any neuron dot in the bottom connectome panel — tooltip should show description text followed by " — represents ~N neurons" (e.g., "Kenyon cells (odor memory) — represents ~2,000 neurons")
  2. The connectome panel header should display a summary like "59 groups / ~130K neurons" right after the "Connectome" label
  3. Click "Brain 3D" toolbar button, hover over a brain region — tooltip should show a line like "6 groups representing ~2,401 neurons" between the description and the type badge
  4. Click "Learn" toolbar button — each region section should show computed population totals like "6 neuron groups representing ~2,401 real neurons" instead of the old hardcoded strings

## Constraints
- Do NOT modify index.html or css/main.css — all changes are in JS files only
- Do NOT modify js/constants.js or js/connectome.js
- Do NOT add new dependencies or CDN scripts
- Do NOT change the existing neuronDescriptions object — neuronPopulations is a separate parallel structure
- Do NOT remove the `populationEstimate` field from EDUCATION_REGIONS — it serves as fallback if neuronPopulations is unavailable
- The `neuronPopulations` object must be declared as a `var` at module scope in main.js (same pattern as `neuronDescriptions`) so it is accessible as a global from brain3d.js and education.js
- Use `\u2014` for em-dash characters in JS strings (not literal `—`) to avoid encoding issues
- Use inline styles for the summary span and the population line in brain3d tooltip to avoid CSS file changes
- The hardcoded "~130K" in the summary refers to the total Drosophila brain neuron count — do not change it to match the sum of neuronPopulations
