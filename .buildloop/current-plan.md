# Plan: D17.1

## Dependencies
- list: []
- commands: []

## File Operations (in execution order)

### 1. MODIFY js/education.js
- operation: MODIFY
- reason: Fix two user-visible data display bugs: (1) VNC/Motor neuron group count shows 6 instead of 17, (2) "~70 groups" text appears in two places but actual connectome has exactly 59 groups

#### Change A: Fix "~70" to "59" in introduction paragraph (line 131)
- anchor: `Our model compresses this into ~70 functional neuron groups`
- action: In the string on line 131, replace the substring `~70 functional neuron groups` with `59 functional neuron groups`
- exact old text: `Our model compresses this into ~70 functional neuron groups`
- exact new text: `Our model compresses this into 59 functional neuron groups`

#### Change B: Fix "70-group" to "59-group" in What's Missing section (line 213)
- anchor: `Our 70-group model is a dramatic simplification`
- action: In the string on line 213, replace the substring `Our 70-group model` with `Our 59-group model`
- exact old text: `Our 70-group model is a dramatic simplification`
- exact new text: `Our 59-group model is a dramatic simplification`

#### Change C: Fix VNC/Motor neuron group count display (lines 156-171)
- anchor: `var eduPopTotal = 0;` (line 156)
- action: Add a `mnGroupCount` counter variable alongside `eduPopTotal`, increment it inside the MN_ prefix loop, and use `(region.neurons.length + mnGroupCount)` in the display string instead of `region.neurons.length`

Replace the entire block from line 156 through line 171 (the `eduPopTotal` computation and the first branch of the `if (eduPopTotal > 0)` display). The old code is:

```javascript
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
```

The new code is:

```javascript
                var eduPopTotal = 0;
                var mnGroupCount = 0;
                if (typeof neuronPopulations !== 'undefined') {
                    for (var pi = 0; pi < region.neurons.length; pi++) {
                        eduPopTotal += (neuronPopulations[region.neurons[pi]] || 0);
                    }
                    if (region.collectMNPrefix && typeof BRAIN !== 'undefined' && BRAIN.postSynaptic) {
                        var mnKeys = Object.keys(BRAIN.postSynaptic);
                        for (var mi = 0; mi < mnKeys.length; mi++) {
                            if (mnKeys[mi].indexOf('MN_') === 0 && region.neurons.indexOf(mnKeys[mi]) === -1) {
                                eduPopTotal += (neuronPopulations[mnKeys[mi]] || 0);
                                mnGroupCount++;
                            }
                        }
                    }
                }
                if (eduPopTotal > 0) {
                    html += '<div class="edu-population">' + (region.neurons.length + mnGroupCount) + ' neuron groups representing ~' + eduPopTotal.toLocaleString() + ' real neurons</div>';
```

The differences are exactly:
1. Line after `var eduPopTotal = 0;`: add `var mnGroupCount = 0;`
2. Inside the `if (mnKeys[mi].indexOf('MN_') === 0 ...` block: add `mnGroupCount++;` after the `eduPopTotal +=` line
3. In the display string: change `region.neurons.length` to `(region.neurons.length + mnGroupCount)`

#### Wiring / Integration
- No new imports, no new files, no changes to other files. All changes are within the `_buildContent` function of the `EducationPanel` object inside the IIFE in js/education.js.

## Verification
- build: No build step (vanilla JS project loaded via script tags)
- lint: No linter configured
- test: `node tests/run-tests.js` (run from project root)
- smoke: Open index.html in a browser, click the "Learn" button in the toolbar, and verify:
  1. The introduction paragraph says "59 functional neuron groups" (not "~70")
  2. Scroll to the VNC/Motor section — it should display "17 neuron groups representing ~15,075 real neurons" (not "6 neuron groups")
  3. Scroll to the "What's Missing" section — it should say "Our 59-group model" (not "Our 70-group model")
  4. The connectome header in the bottom panel still says "59 groups / ~130K neurons" — these two numbers now match

## Constraints
- Do NOT modify any file other than js/education.js
- Do NOT change the EDUCATION_REGIONS array structure or the `collectMNPrefix` flag
- Do NOT change the population sum calculation logic — only add the counter variable and use it in display
- Do NOT change the neuron tag rendering loop (lines 147-154) — it already correctly displays MN_ neurons
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any files in .buildloop/ other than current-plan.md
