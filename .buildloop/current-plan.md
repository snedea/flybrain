# Plan: T6.2

## Dependencies
- list: [] (no new dependencies — vanilla JS, no build step)
- commands: [] (nothing to install)

## File Operations (in execution order)

### 1. CREATE js/education.js
- operation: CREATE
- reason: New module containing all educational guide panel logic, content data, SVG signal flow diagram, and Brain3D region highlight integration

#### Imports / Dependencies
- No import statements (vanilla JS IIFE pattern, same as brain3d.js)
- Reads from: `window.Brain3D` (for region highlighting), `BRAIN.postSynaptic` (for neuron lists), `neuronDescriptions` (global from main.js)

#### Data Structures

Define `EDUCATION_REGIONS` array (the educational content for each brain region). Each entry is an object:
```js
{
    id: 'optic-lobes',           // CSS-safe slug used for section IDs
    name: 'Optic Lobes',         // display name, must match Brain3D REGION_DEFS[i].name exactly
    neurons: ['VIS_R1R6', 'VIS_R7R8', 'VIS_ME', 'VIS_LO', 'VIS_LC', 'VIS_LPTC'],
    type: 'sensory',
    explanation: '...',          // plain-language what-it-does (2-3 sentences)
    analogy: '...',              // real-world analogy string
    interaction: '...',          // which user action activates it
    populationEstimate: '...'    // string like "~60,000 neurons in the real fly"
}
```

Full entries (builder must use these exact values):

1. `id: 'optic-lobes'`, `name: 'Optic Lobes'`, `neurons: ['VIS_R1R6','VIS_R7R8','VIS_ME','VIS_LO','VIS_LC','VIS_LPTC']`, `type: 'sensory'`
   - `explanation: "The optic lobes are the fly's visual processing centers, one on each side of the brain. They detect motion, color, edges, and looming objects. Almost half the fly's brain is devoted to vision."
   - `analogy: "Like your visual cortex — but optimized for detecting fast motion and avoiding swatters."
   - `interaction: "Change the Light setting from Bright to Dim or Dark and watch the optic lobes respond."
   - `populationEstimate: "~60,000 neurons in the real fly"

2. `id: 'antennal-lobes'`, `name: 'Antennal Lobes'`, `neurons: ['OLF_ORN_FOOD','OLF_ORN_DANGER','OLF_LN','OLF_PN']`, `type: 'sensory'`
   - `explanation: "The antennal lobes process smells detected by the antennae. Different odors activate different glomeruli (clusters), letting the fly distinguish food from danger."
   - `analogy: "Like your olfactory bulb — the first stop for smell information before it reaches higher brain areas."
   - `interaction: "Place food on the canvas and watch olfactory neurons fire as the fly detects it."
   - `populationEstimate: "~2,600 neurons across ~50 glomeruli"

3. `id: 'mushroom-bodies'`, `name: 'Mushroom Bodies'`, `neurons: ['MB_KC','MB_APL','MB_MBON_APP','MB_MBON_AV','MB_DAN_REW','MB_DAN_PUN']`, `type: 'central'`
   - `explanation: "The mushroom bodies are the fly's learning and memory center. They associate smells with rewards or punishments, allowing the fly to learn which odors mean food and which mean danger."
   - `analogy: "Like the fly's hippocampus — they form and recall memories about smells."
   - `interaction: "Feed the fly repeatedly and watch the reward dopamine neurons (DAN) activate alongside the Kenyon cells."
   - `populationEstimate: "~2,000 Kenyon cells + ~400 output/dopamine neurons"

4. `id: 'central-complex'`, `name: 'Central Complex'`, `neurons: ['CX_EPG','CX_PFN','CX_FC','CX_HDELTA']`, `type: 'central'`
   - `explanation: "The central complex is the fly's navigation hub. It maintains an internal compass, tracks the fly's heading, and coordinates locomotion patterns."
   - `analogy: "Like a GPS and steering system combined — it knows which way the fly is pointing and plans where to go."
   - `interaction: "Watch the compass neurons (EPG) as the fly walks and changes direction."
   - `populationEstimate: "~3,000 neurons in the real fly"

5. `id: 'lateral-horn'`, `name: 'Lateral Horn'`, `neurons: ['LH_APP','LH_AV']`, `type: 'central'`
   - `explanation: "The lateral horn handles innate (unlearned) responses to odors. Unlike the mushroom bodies which learn, the lateral horn triggers hardwired approach or avoidance behaviors."
   - `analogy: "Like an instinctive reflex — you pull your hand from a hot stove before you think about it."
   - `interaction: "Place food near the fly and watch LH_APP (approach) activate. The lateral horn responds even without prior learning."
   - `populationEstimate: "~1,400 neurons"

6. `id: 'sez'`, `name: 'Subesophageal Zone'`, `neurons: ['SEZ_FEED','SEZ_GROOM','SEZ_WATER','GUS_GRN_SWEET','GUS_GRN_BITTER','GUS_GRN_WATER']`, `type: 'central'`
   - `explanation: "The subesophageal zone (SEZ) is the feeding and grooming command center. It processes taste information and sends motor commands to extend the proboscis or initiate grooming."
   - `analogy: "Like a cafeteria manager — it decides whether to eat based on what the taste buds report."
   - `interaction: "Feed the fly and watch the SEZ light up. Touch the fly to trigger grooming commands."
   - `populationEstimate: "~7,000 neurons"

7. `id: 'vnc-motor'`, `name: 'VNC / Motor'`, `neurons: ['DN_WALK','DN_FLIGHT','DN_TURN','DN_BACKUP','DN_STARTLE','VNC_CPG']`, `type: 'motor'`, `collectMNPrefix: true`
   - `explanation: "The ventral nerve cord (VNC) is the fly's spinal cord equivalent. It contains motor neurons that control the legs, wings, proboscis, and abdomen, plus central pattern generators that coordinate rhythmic movements like walking."
   - `analogy: "Like your spinal cord — it relays commands from the brain to the muscles and coordinates repetitive movements like walking."
   - `interaction: "Watch the motor neurons activate during any behavior — walking lights up leg motors, flight lights up wing motors."
   - `populationEstimate: "~15,000 neurons including motor neurons and interneurons"

8. `id: 'thermosensory'`, `name: 'Thermosensory'`, `neurons: ['THERMO_WARM','THERMO_COOL']`, `type: 'sensory'`
   - `explanation: "Thermosensory neurons detect temperature changes. Warm and cool sensors report to the brain so the fly can seek comfortable temperatures."
   - `analogy: "Like the temperature sensors in your skin — they tell the brain whether it is too hot or too cold."
   - `interaction: "Change the Temp setting to Warm or Cool and watch the corresponding thermosensory neurons activate."
   - `populationEstimate: "~60 neurons"

9. `id: 'mechanosensory'`, `name: 'Mechanosensory'`, `neurons: ['MECH_BRISTLE','MECH_JO','MECH_CHORD','ANTENNAL_MECH']`, `type: 'sensory'`
   - `explanation: "Mechanosensory neurons detect touch, wind, gravity, and body position. Bristle neurons respond to physical contact, Johnston's organ senses wind and gravity via the antennae, and chordotonal organs track limb positions."
   - `analogy: "Like your sense of touch combined with your inner ear balance system."
   - `interaction: "Touch the fly to activate bristle neurons. Blow air to activate Johnston's organ."
   - `populationEstimate: "~2,500 neurons"

10. `id: 'drives'`, `name: 'Drives'`, `neurons: ['DRIVE_HUNGER','DRIVE_FEAR','DRIVE_FATIGUE','DRIVE_CURIOSITY','DRIVE_GROOM']`, `type: 'drives'`
    - `explanation: "Drive neurons represent internal motivational states. They fluctuate over time and bias the fly's behavior — a hungry fly seeks food, a frightened fly flees, a tired fly rests."
    - `analogy: "Like your own feelings of hunger, anxiety, or tiredness — invisible internal states that shape what you do next."
    - `interaction: "Watch the drive meters in the bottom panel. Hunger increases over time; fear spikes when you touch or blow air at the fly."
    - `populationEstimate: "Distributed — modeled as 5 functional groups"

#### Functions

- signature: `EducationPanel.init()` (no parameters, returns undefined)
  - purpose: Cache DOM references and attach event listeners
  - logic:
    1. Store reference to `document.getElementById('education-panel')` in `EducationPanel._panel`
    2. Store reference to `document.getElementById('education-close-btn')` in `closeBtn`
    3. Add click listener on `closeBtn` that calls `EducationPanel.hide()`
    4. Store reference to `document.getElementById('education-content')` in `EducationPanel._content`
    5. Call `EducationPanel._buildContent()` to populate the panel HTML
    6. Set `EducationPanel._initialized = true`
  - calls: `EducationPanel._buildContent()`
  - returns: undefined
  - error handling: none needed (DOM elements guaranteed by index.html)

- signature: `EducationPanel._buildContent()` (no parameters, returns undefined)
  - purpose: Generate the full HTML content of the education panel and insert it into `EducationPanel._content`
  - logic:
    1. Initialize empty string `html`
    2. Append Introduction section:
       - `<div class="edu-section">`
       - `<h2 class="edu-section-title">What is this?</h2>`
       - `<p class="edu-text">` containing: "This is a simplified functional model of the Drosophila melanogaster (fruit fly) brain. The real fly brain contains approximately 130,000 neurons forming around 50 million synaptic connections. Our model compresses this into ~70 functional neuron groups — clusters of neurons that work together for a specific purpose."
       - Another `<p class="edu-text">` containing: "A connectome is a complete map of neural connections in a brain. The fly connectome was fully mapped by the FlyWire consortium in 2024, making Drosophila only the second organism (after C. elegans) with a complete wiring diagram."
       - Close `</div>`
    3. Append region sections: loop through `EDUCATION_REGIONS` array, for each entry:
       - `<div class="edu-section">`
       - `<h2 class="edu-section-title">` containing a clickable region name: `<span class="edu-region-link" data-region="REGION_NAME">REGION_NAME</span>` where REGION_NAME is the entry's `name` field. After the name, append a type badge: `<span class="edu-type-badge edu-type-TYPE">TYPE</span>` where TYPE is the entry's `type` field
       - `<p class="edu-text">` with the `explanation` value
       - `<p class="edu-analogy"><strong>Analogy:</strong> ` with the `analogy` value
       - `<p class="edu-interaction"><strong>Try it:</strong> ` with the `interaction` value
       - `<div class="edu-neuron-list"><strong>Neuron groups in our model:</strong>` then loop through the entry's `neurons` array. For each neuron, output `<span class="edu-neuron-tag">NEURON_NAME</span>`. If the entry has `collectMNPrefix: true`, additionally iterate `Object.keys(BRAIN.postSynaptic)` and for each key starting with `'MN_'` that is not already in the neurons array, append it as a tag.
       - `<div class="edu-population">` with the `populationEstimate` value
       - Close `</div>`
    4. Append Signal Flow section:
       - `<div class="edu-section">`
       - `<h2 class="edu-section-title">Signal Flow</h2>`
       - `<p class="edu-text">` containing: "Information flows through the fly brain in a consistent pattern: sensory neurons detect the environment, central processing regions interpret and decide, and motor neurons execute the chosen behavior. Internal drives (hunger, fear, fatigue) bias the central processing, shifting which actions win."
       - Inline SVG diagram (see SVG specification below)
       - Close `</div>`
    5. Append "What's Missing" section:
       - `<div class="edu-section">`
       - `<h2 class="edu-section-title">What's Missing</h2>`
       - `<p class="edu-text">` containing: "Our 70-group model is a dramatic simplification. Here's what we leave out:"
       - `<ul class="edu-list">` with these exact `<li>` items:
         - "Individual neuron dynamics — each of our groups represents hundreds or thousands of real neurons that fire independently"
         - "Synaptic plasticity — real synapses strengthen and weaken with use; our connection weights are fixed"
         - "Neuromodulator diffusion — chemicals like dopamine and serotonin diffuse broadly in the real brain, not just through direct connections"
         - "Electrical synapses (gap junctions) — our model only represents chemical synapses"
         - "Approximate connection weights — our weights are educated estimates, not exact counts from the connectome"
       - Close `</ul></div>`
    6. Append "Learn More" section:
       - `<div class="edu-section">`
       - `<h2 class="edu-section-title">Learn More</h2>`
       - `<ul class="edu-links">` with these exact `<li><a>` items (each link has `target="_blank"` and `rel="noopener noreferrer"`):
         - text: "FlyWire Codex — Browse the complete fly connectome", href: "https://codex.flywire.ai"
         - text: "Dorkenwald et al. 2024 — The paper describing the full connectome mapping", href: "https://doi.org/10.1038/s41586-024-07558-y"
         - text: "Virtual Fly Brain — 3D atlas and neuron database", href: "https://www.virtualflybrain.org"
         - text: "worm-sim — The C. elegans project that inspired FlyBrain", href: "https://github.com/heyseth/worm-sim"
       - Close `</ul></div>`
    7. Set `EducationPanel._content.innerHTML = html`
    8. Attach click listeners to all `.edu-region-link` elements inside `EducationPanel._content`: use `EducationPanel._content.addEventListener('click', function(e) {...})` (single delegated listener). In the handler:
       - Check if `e.target.classList.contains('edu-region-link')` or `e.target.closest('.edu-region-link')` — get the element
       - Read `data-region` attribute from the element
       - Call `EducationPanel.highlightRegion(regionName)` with the value
  - calls: `EducationPanel.highlightRegion()` (via event delegation)
  - returns: undefined
  - error handling: none

- Signal Flow SVG specification (inline in the HTML string built by `_buildContent`):
  - Container: `<svg class="edu-signal-flow" viewBox="0 0 600 200" xmlns="http://www.w3.org/2000/svg">`
  - Three rounded rectangles, left to right:
    - x=20 y=60 width=140 height=80 rx=8: fill `#3b82f6` (sensory blue) at 20% opacity, stroke `#3b82f6`, text "Sensory Input" centered in white at font-size 14
    - x=230 y=40 width=140 height=120 rx=8: fill `#8b5cf6` (central purple) at 20% opacity, stroke `#8b5cf6`, text "Central Processing" centered in white at font-size 14
    - x=440 y=60 width=140 height=80 rx=8: fill `#ef4444` (motor red) at 20% opacity, stroke `#ef4444`, text "Motor Output" centered in white at font-size 14
  - Arrows (lines with arrowhead markers):
    - Line from x=160 y=100 to x=230 y=100 (sensory to central), stroke `#8892a4`, stroke-width 2, marker-end arrow
    - Line from x=370 y=100 to x=440 y=100 (central to motor), stroke `#8892a4`, stroke-width 2, marker-end arrow
  - Drives box below central:
    - x=250 y=175 width=100 height=25 rx=4: fill `#f59e0b` at 20% opacity, stroke `#f59e0b`, text "Drives" centered in white at font-size 12
    - Dashed line from x=300 y=175 to x=300 y=160 (drives up to central), stroke `#f59e0b`, stroke-dasharray 4,3, marker-end arrow
  - Arrow marker definition in `<defs>`: `<marker id="edu-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8892a4"/></marker>`
  - Additional arrow marker for drives: `<marker id="edu-arrow-drives" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#f59e0b"/></marker>`
  - Small labels below each box:
    - Below sensory: text at x=90 y=155, font-size 10, fill `#8892a4`: "Eyes, antennae, bristles"
    - Below central: text at x=300 y=25, font-size 10, fill `#8892a4`: "Mushroom bodies, central complex"
    - Below motor: text at x=510 y=155, font-size 10, fill `#8892a4`: "Legs, wings, proboscis"

- signature: `EducationPanel.highlightRegion(regionName)` (regionName: string, returns undefined)
  - purpose: Temporarily boost the emissive glow of the named region in the 3D brain view
  - logic:
    1. Check `if (typeof Brain3D === 'undefined' || !Brain3D._initialized || !Brain3D._regions)` — if true, return immediately (3D view not available)
    2. If `Brain3D.active === false`, do nothing (don't force-open the 3D panel, just skip)
    3. Loop through `Brain3D._regions` array. Find the region where `region.name === regionName`
    4. If not found, return
    5. For each mesh in `region.meshes`:
       - Store original emissiveIntensity: `var originalIntensity = mesh.material.emissiveIntensity`
       - Store original opacity: `var originalOpacity = mesh.material.opacity`
       - Set `mesh.material.emissiveIntensity = 1.5` (boosted)
       - Set `mesh.material.opacity = 0.9` (boosted)
    6. Set a `setTimeout` for 1200ms that restores each mesh:
       - `mesh.material.emissiveIntensity = originalIntensity`
       - `mesh.material.opacity = originalOpacity`
       (Capture the meshes array and original values in the closure)
  - calls: none
  - returns: undefined
  - error handling: guard against missing Brain3D

- signature: `EducationPanel.show()` (no parameters, returns undefined)
  - purpose: Show the education panel
  - logic:
    1. If `!EducationPanel._initialized`, call `EducationPanel.init()`
    2. Set `EducationPanel._panel.style.display = 'block'`
    3. Set `EducationPanel.active = true`
  - calls: `EducationPanel.init()` (conditionally)
  - returns: undefined
  - error handling: none

- signature: `EducationPanel.hide()` (no parameters, returns undefined)
  - purpose: Hide the education panel
  - logic:
    1. Set `EducationPanel._panel.style.display = 'none'`
    2. Set `EducationPanel.active = false`
  - calls: none
  - returns: undefined
  - error handling: none

- signature: `EducationPanel.toggle()` (no parameters, returns undefined)
  - purpose: Toggle the education panel visibility
  - logic:
    1. If `EducationPanel.active` is true, call `EducationPanel.hide()`, else call `EducationPanel.show()`
  - calls: `EducationPanel.show()` or `EducationPanel.hide()`
  - returns: undefined
  - error handling: none

Module structure: Wrap everything in an IIFE `(function() { ... })();`. At the top of the IIFE, define `EDUCATION_REGIONS` array. Then define `window.EducationPanel = { active: false, _initialized: false, _panel: null, _content: null, init: ..., _buildContent: ..., highlightRegion: ..., show: ..., hide: ..., toggle: ... }`. Export via `window.EducationPanel`.

### 2. MODIFY index.html
- operation: MODIFY
- reason: Add "Learn" toolbar button, education panel HTML container, and education.js script tag

#### Change 1: Add "Learn" button to toolbar
- anchor: `<button class="tool-btn" id="helpBtn">?</button>`
- Insert BEFORE that line (on a new line before it, inside `.toolbar-left`):
  ```html
  <button class="tool-btn" id="learnBtn">Learn</button>
  ```

#### Change 2: Add education panel HTML
- anchor: `<div id="brain3d-overlay" style="display:none;"></div>`
- Insert BEFORE that line:
  ```html
  <div id="education-panel" class="education-panel" style="display:none;">
      <div class="education-panel-header">
          <span class="education-panel-title">Brain Guide</span>
          <button class="education-close-btn" id="education-close-btn">&times;</button>
      </div>
      <div class="education-content" id="education-content"></div>
  </div>
  ```

#### Change 3: Add education.js script tag
- anchor: `<script type="text/javascript" src="./js/brain3d.js"></script>`
- Insert AFTER that line:
  ```html
  <script type="text/javascript" src="./js/education.js"></script>
  ```

### 3. MODIFY js/main.js
- operation: MODIFY
- reason: Add Learn button click handler and close-on-outside-click behavior

#### Change 1: Add Learn button toggle handler
- anchor: `// --- Help overlay toggle ---` (line 247)
- Insert BEFORE that line (on new lines):
  ```js
  // --- Learn / Education panel toggle ---
  var learnBtn = document.getElementById('learnBtn');
  if (learnBtn) {
      learnBtn.addEventListener('click', function () {
          if (typeof EducationPanel !== 'undefined') {
              EducationPanel.toggle();
              if (EducationPanel.active) {
                  learnBtn.classList.add('active');
              } else {
                  learnBtn.classList.remove('active');
              }
          }
      });
  }
  ```

#### Change 2: Add education panel to the outside-click close handler
- anchor: `if (helpOverlay.style.display !== 'none' &&` (line 263, inside the document click handler)
- The existing document click handler at line 262 closes the help overlay when clicking outside. After that handler's closing `}` and `});` on line 268, add on a new line:
  ```js
  // Close education panel when clicking outside of it
  document.addEventListener('click', function (e) {
      if (typeof EducationPanel !== 'undefined' && EducationPanel.active) {
          var panel = document.getElementById('education-panel');
          var learnBtnEl = document.getElementById('learnBtn');
          if (panel && !panel.contains(e.target) && e.target !== learnBtnEl) {
              EducationPanel.hide();
              if (learnBtnEl) learnBtnEl.classList.remove('active');
          }
      }
  });
  ```

### 4. MODIFY css/main.css
- operation: MODIFY
- reason: Add styles for the education panel (slide-out sidebar), its content sections, neuron tags, signal flow SVG, and region link highlights

#### Change 1: Append education panel styles
- anchor: `.b3d-tip-neuron-val {` (this is near the end of the file, line 438)
- After the closing `}` of that rule block (line 444, the last line of CSS), append the following CSS:

```css

/* --- Education Panel (slide-out sidebar) --- */
.education-panel {
    position: fixed;
    top: 44px;
    right: 0;
    bottom: 90px;
    width: 380px;
    max-width: 90vw;
    background: var(--surface);
    border-left: 1px solid var(--border);
    z-index: 25;
    font-family: system-ui, -apple-system, sans-serif;
    display: flex;
    flex-direction: column;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    overflow: hidden;
}

.education-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
}

.education-panel-title {
    color: var(--text);
    font-size: 0.9rem;
    font-weight: 600;
}

.education-close-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0 0.25rem;
    line-height: 1;
}

.education-close-btn:hover {
    color: var(--text);
}

.education-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
}

.edu-section {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--border);
}

.edu-section:last-child {
    border-bottom: none;
    margin-bottom: 0;
}

.edu-section-title {
    color: var(--text);
    font-size: 0.9rem;
    font-weight: 600;
    margin: 0 0 0.5rem 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
}

.edu-text {
    color: var(--text-muted);
    font-size: 0.8rem;
    line-height: 1.5;
    margin: 0 0 0.5rem 0;
}

.edu-analogy {
    color: var(--text-muted);
    font-size: 0.8rem;
    line-height: 1.5;
    margin: 0 0 0.5rem 0;
    font-style: italic;
}

.edu-analogy strong {
    font-style: normal;
    color: var(--text);
}

.edu-interaction {
    color: var(--text-muted);
    font-size: 0.8rem;
    line-height: 1.5;
    margin: 0 0 0.5rem 0;
}

.edu-interaction strong {
    color: var(--accent);
}

.edu-region-link {
    cursor: pointer;
    color: var(--text);
    transition: color 0.2s ease;
}

.edu-region-link:hover {
    color: var(--accent);
}

.edu-type-badge {
    font-size: 0.6rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
    padding: 0.1rem 0.4rem;
    border-radius: 4px;
}

.edu-type-sensory {
    color: var(--neuron-sensory);
    background: rgba(59, 130, 246, 0.15);
}

.edu-type-central {
    color: var(--neuron-central);
    background: rgba(139, 92, 246, 0.15);
}

.edu-type-drives {
    color: var(--neuron-drives);
    background: rgba(245, 158, 11, 0.15);
}

.edu-type-motor {
    color: var(--neuron-motor);
    background: rgba(239, 68, 68, 0.15);
}

.edu-neuron-list {
    font-size: 0.75rem;
    color: var(--text-muted);
    margin: 0.5rem 0;
    line-height: 1.6;
}

.edu-neuron-list strong {
    color: var(--text);
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.75rem;
}

.edu-neuron-tag {
    display: inline-block;
    background: var(--surface-hover);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.1rem 0.35rem;
    font-size: 0.65rem;
    color: var(--text-muted);
    margin: 0.1rem;
    font-family: monospace;
}

.edu-population {
    font-size: 0.7rem;
    color: var(--text-muted);
    font-style: italic;
    margin-top: 0.25rem;
}

.edu-signal-flow {
    width: 100%;
    height: auto;
    margin: 0.5rem 0;
}

.edu-list {
    color: var(--text-muted);
    font-size: 0.8rem;
    line-height: 1.5;
    margin: 0.5rem 0;
    padding-left: 1.25rem;
}

.edu-list li {
    margin-bottom: 0.4rem;
}

.edu-links {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0;
}

.edu-links li {
    margin-bottom: 0.5rem;
}

.edu-links a {
    color: var(--accent);
    text-decoration: none;
    font-size: 0.8rem;
    transition: color 0.2s ease;
}

.edu-links a:hover {
    color: var(--accent-hover);
}
```

## Verification
- build: no build step (vanilla JS, open index.html in browser)
- lint: no linter configured
- test: no existing tests for UI components
- smoke: Open `index.html` in a browser. Verify:
  1. A "Learn" button appears in the toolbar between "Brain 3D" and "?"
  2. Clicking "Learn" opens a right-side panel with title "Brain Guide"
  3. The panel contains sections: "What is this?", each of the 10 brain regions, "Signal Flow" (with SVG diagram), "What's Missing", and "Learn More"
  4. Each region section shows the region name, type badge, explanation, analogy, interaction hint, neuron tags, and population estimate
  5. Clicking a region name in the panel while Brain 3D is active causes the corresponding 3D region to briefly glow brighter for ~1.2 seconds
  6. Clicking outside the panel closes it
  7. The close (x) button closes the panel
  8. The "Learn" toolbar button gets the active class when panel is open and loses it when closed
  9. Links in "Learn More" open in new tabs
  10. The panel scrolls if content overflows

## Constraints
- Do NOT modify SPEC.md, TASKS.md, CLAUDE.md, or any files in .buildloop/ (other than current-plan.md)
- Do NOT add any npm packages, build steps, or external dependencies
- Do NOT modify js/brain3d.js — the education panel reads from Brain3D's existing public API (`Brain3D._regions`, `Brain3D._initialized`, `Brain3D.active`) but does not alter brain3d.js code
- Do NOT modify js/connectome.js or js/fly-logic.js or js/constants.js
- All colors must use CSS custom properties from :root (--bg, --surface, --border, --text, --text-muted, --accent, --neuron-sensory, --neuron-central, --neuron-drives, --neuron-motor). No hardcoded hex values in CSS except for the SVG inline diagram which uses the same palette values
- No gradients, glassmorphism, glows, or neon effects
- Only allowed shadow: `0 1px 3px rgba(0,0,0,0.3)`
- Only allowed transition: `property 0.2s ease`
- The education.js script tag must appear AFTER brain3d.js and BEFORE main.js in index.html
- The "Learn" button must be a `<button class="tool-btn" id="learnBtn">Learn</button>` — it is NOT a data-tool button (it does not participate in the active-tool selection loop for Feed/Touch/Air)
- The highlightRegion function must match region names exactly as they appear in Brain3D's REGION_DEFS (e.g., "Optic Lobes", "VNC / Motor")
- For the VNC/Motor region neuron list, use the same `collectMNPrefix` pattern as brain3d.js: iterate `Object.keys(BRAIN.postSynaptic)` and include any key starting with `'MN_'`
