# Plan: T6.1

## Dependencies
- list: [Three.js r158 via CDN (no npm install)]
- commands: [none — CDN scripts added directly to index.html]

## File Operations (in execution order)

### 1. MODIFY index.html
- operation: MODIFY
- reason: Add Three.js CDN scripts, brain3d.js script tag, Brain 3D toggle button, overlay container div, and tooltip div

#### Change 1: Add Three.js CDN and OrbitControls scripts before existing scripts
- anchor: `<script type="text/javascript" src="./js/constants.js"></script>`
- Insert BEFORE that anchor line, these two script tags:
```html
<script src="https://cdn.jsdelivr.net/npm/three@0.158.0/build/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.158.0/examples/js/controls/OrbitControls.js"></script>
```

#### Change 2: Add brain3d.js script tag after fly-logic.js but before main.js
- anchor: `<script type="text/javascript" src="./js/fly-logic.js"></script>`
- Insert AFTER that anchor line:
```html
<script type="text/javascript" src="./js/brain3d.js"></script>
```
- Final script load order must be: three.min.js → OrbitControls.js → constants.js → connectome.js → fly-logic.js → brain3d.js → main.js

#### Change 3: Add "Brain 3D" toggle button to toolbar-left
- anchor: `<button class="tool-btn" id="helpBtn">?</button>`
- Insert BEFORE that anchor line:
```html
<button class="tool-btn" id="brain3dBtn" aria-pressed="false">Brain 3D</button>
```

#### Change 4: Add brain3d overlay container and tooltip div after the canvas element
- anchor: `<canvas id='canvas'></canvas>`
- Insert AFTER that anchor line:
```html
<div id="brain3d-overlay" style="display:none;"></div>
<div id="brain3d-tooltip" style="display:none;"></div>
```

### 2. CREATE js/brain3d.js
- operation: CREATE
- reason: New file containing the entire Brain3D module — Three.js scene setup, brain region meshes, raycasting, update loop, tooltip

#### Module Structure
The file is a single IIFE that exposes `window.Brain3D` as an object with the following properties and methods:

```javascript
window.Brain3D = {
    active: false,
    _initialized: false,
    _scene: null,
    _camera: null,
    _renderer: null,
    _controls: null,
    _regions: [],       // array of region objects
    _allMeshes: [],     // flat array of all THREE.Mesh for raycasting
    _raycaster: null,
    _mouse: null,
    _container: null,
    _tooltipEl: null,
    _animFrameId: null,
    init: function() { ... },
    show: function() { ... },
    hide: function() { ... },
    toggle: function() { ... },
    update: function() { ... },
    _onMouseMove: function(event) { ... },
    _onResize: function() { ... },
    _buildRegions: function() { ... },
    _createRegionMeshes: function(regionDef) { ... },
    _renderLoop: function() { ... }
};
```

#### Constants (top of IIFE, before Brain3D object)

```javascript
var REGION_COLORS = {
    sensory: 0x3b82f6,
    central: 0x8b5cf6,
    drives:  0xf59e0b,
    motor:   0xef4444
};

var ACTIVATION_DIVISOR = 80;  // raw postSynaptic values divided by this, clamped to [0,1]
var BASE_OPACITY = 0.3;
var MAX_OPACITY = 0.8;
var BASE_EMISSIVE_INTENSITY = 0.0;
var MAX_EMISSIVE_INTENSITY = 1.0;
```

#### Region Definitions (array, defined inside IIFE)

Each region definition is an object with: `name`, `description`, `type`, `neurons`, `meshDefs` (array of mesh definition objects).

The complete region definitions array (REGION_DEFS):

```javascript
var REGION_DEFS = [
    {
        name: 'Optic Lobes',
        description: 'Visual processing — motion detection, color, pattern recognition, and optic flow',
        type: 'sensory',
        neurons: ['VIS_R1R6', 'VIS_R7R8', 'VIS_ME', 'VIS_LO', 'VIS_LC', 'VIS_LPTC'],
        meshDefs: [
            { geo: 'sphere', args: [1.4, 16, 12], pos: [-3.2, 0.2, -0.3], scale: [1, 0.75, 1.1] },
            { geo: 'sphere', args: [1.4, 16, 12], pos: [3.2, 0.2, -0.3], scale: [1, 0.75, 1.1] }
        ]
    },
    {
        name: 'Antennal Lobes',
        description: 'Olfactory processing — food and danger odor detection',
        type: 'sensory',
        neurons: ['OLF_ORN_FOOD', 'OLF_ORN_DANGER', 'OLF_LN', 'OLF_PN'],
        meshDefs: [
            { geo: 'sphere', args: [0.45, 12, 10], pos: [-0.7, -0.6, 2.2], scale: [1, 1, 1] },
            { geo: 'sphere', args: [0.45, 12, 10], pos: [0.7, -0.6, 2.2], scale: [1, 1, 1] }
        ]
    },
    {
        name: 'Mushroom Bodies',
        description: 'Learning and memory — associative odor memories, reward and punishment',
        type: 'central',
        neurons: ['MB_KC', 'MB_APL', 'MB_MBON_APP', 'MB_MBON_AV', 'MB_DAN_REW', 'MB_DAN_PUN'],
        meshDefs: [
            { geo: 'sphere', args: [0.6, 12, 10], pos: [-1.3, 1.0, -0.3], scale: [1, 1, 1] },
            { geo: 'sphere', args: [0.6, 12, 10], pos: [1.3, 1.0, -0.3], scale: [1, 1, 1] },
            { geo: 'torus', args: [0.4, 0.12, 8, 16], pos: [-0.6, 0.2, 1.0], scale: [1, 1, 1], rot: [Math.PI / 2, 0, 0] },
            { geo: 'torus', args: [0.4, 0.12, 8, 16], pos: [0.6, 0.2, 1.0], scale: [1, 1, 1], rot: [Math.PI / 2, 0, 0] }
        ]
    },
    {
        name: 'Central Complex',
        description: 'Navigation — heading direction, path integration, locomotion coordination',
        type: 'central',
        neurons: ['CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA'],
        meshDefs: [
            { geo: 'cylinder', args: [0.8, 0.8, 0.2, 16], pos: [0, 0.5, 0], scale: [1, 1, 1], rot: [Math.PI / 2, 0, 0] }
        ]
    },
    {
        name: 'Lateral Horn',
        description: 'Innate odor responses — hardwired approach and avoidance behaviors',
        type: 'central',
        neurons: ['LH_APP', 'LH_AV'],
        meshDefs: [
            { geo: 'sphere', args: [0.45, 12, 10], pos: [-1.8, 0.5, 0.3], scale: [1, 1, 1] },
            { geo: 'sphere', args: [0.45, 12, 10], pos: [1.8, 0.5, 0.3], scale: [1, 1, 1] }
        ]
    },
    {
        name: 'Subesophageal Zone',
        description: 'Feeding and grooming command center — taste processing, motor commands',
        type: 'central',
        neurons: ['SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER', 'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER'],
        meshDefs: [
            { geo: 'sphere', args: [0.7, 12, 10], pos: [0, -1.0, 1.2], scale: [1.2, 0.7, 0.8] }
        ]
    },
    {
        name: 'VNC / Motor',
        description: 'Motor output — locomotion, flight, and body movement commands',
        type: 'motor',
        neurons: ['DN_WALK', 'DN_FLIGHT', 'DN_TURN', 'DN_BACKUP', 'DN_STARTLE', 'VNC_CPG'],
        collectMNPrefix: true,
        meshDefs: [
            { geo: 'cylinder', args: [0.35, 0.25, 2.5, 12], pos: [0, -1.5, -1.8], scale: [1, 1, 1], rot: [0.3, 0, 0] }
        ]
    },
    {
        name: 'Thermosensory',
        description: 'Temperature sensing — warm and cool detection',
        type: 'sensory',
        neurons: ['THERMO_WARM', 'THERMO_COOL'],
        meshDefs: [
            { geo: 'sphere', args: [0.3, 10, 8], pos: [0, 0.0, 2.8], scale: [1, 1, 1] }
        ]
    },
    {
        name: 'Mechanosensory',
        description: 'Touch and proprioception — bristle, wind, and body position sensing',
        type: 'sensory',
        neurons: ['MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD', 'ANTENNAL_MECH'],
        meshDefs: [
            { geo: 'sphere', args: [0.35, 10, 8], pos: [0, 0.7, 1.8], scale: [1, 1, 1] }
        ]
    },
    {
        name: 'Drives',
        description: 'Internal motivational states — hunger, fear, fatigue, curiosity, grooming urge',
        type: 'drives',
        neurons: ['DRIVE_HUNGER', 'DRIVE_FEAR', 'DRIVE_FATIGUE', 'DRIVE_CURIOSITY', 'DRIVE_GROOM'],
        meshDefs: [
            { geo: 'sphere', args: [0.5, 12, 10], pos: [0, 0.3, -0.3], scale: [1, 1, 1] }
        ]
    }
];
```

#### Functions

##### signature: `Brain3D.init()`
- purpose: Initialize the Three.js scene, camera, renderer, controls, lighting, brain region meshes, and raycaster. Called once from main.js after BRAIN.setup().
- logic:
  1. If `Brain3D._initialized` is true, return immediately (prevent double init).
  2. Set `Brain3D._container` to `document.getElementById('brain3d-overlay')`.
  3. Set `Brain3D._tooltipEl` to `document.getElementById('brain3d-tooltip')`.
  4. Wrap steps 4-14 in a try/catch. On catch, log error to console and set `Brain3D._initialized = false`, then return.
  5. Create `Brain3D._scene = new THREE.Scene()`. Set `Brain3D._scene.background = new THREE.Color(0x0a0a1a)`.
  6. Compute `width = Brain3D._container.clientWidth || window.innerWidth` and `height = Brain3D._container.clientHeight || (window.innerHeight - 44 - 90)`.
  7. Create `Brain3D._camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100)`. Set `Brain3D._camera.position.set(0, 6, 10)`.
  8. Create `Brain3D._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })`. Call `Brain3D._renderer.setSize(width, height)`. Call `Brain3D._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`. Append `Brain3D._renderer.domElement` to `Brain3D._container`.
  9. Create `Brain3D._controls = new THREE.OrbitControls(Brain3D._camera, Brain3D._renderer.domElement)`. Set `Brain3D._controls.enableDamping = true`, `Brain3D._controls.dampingFactor = 0.08`, `Brain3D._controls.target.set(0, 0, 0)`. Call `Brain3D._controls.update()`.
  10. Add lighting: `Brain3D._scene.add(new THREE.AmbientLight(0x404060, 0.6))`. Create `var pointLight1 = new THREE.PointLight(0xffffff, 0.8, 50)`, set `pointLight1.position.set(5, 8, 5)`, add to scene. Create `var pointLight2 = new THREE.PointLight(0x8888ff, 0.4, 50)`, set `pointLight2.position.set(-5, -3, -5)`, add to scene.
  11. Call `Brain3D._buildRegions()`.
  12. Create `Brain3D._raycaster = new THREE.Raycaster()`. Create `Brain3D._mouse = new THREE.Vector2()`.
  13. Bind event listeners: `Brain3D._renderer.domElement.addEventListener('mousemove', Brain3D._onMouseMove)`. `window.addEventListener('resize', Brain3D._onResize)`.
  14. Set `Brain3D._initialized = true`.
- calls: `Brain3D._buildRegions()`
- returns: void
- error handling: try/catch around WebGLRenderer creation logs error to console.warn('Brain3D: WebGL not available') and returns early

##### signature: `Brain3D._buildRegions()`
- purpose: Create Three.js meshes for all brain regions from REGION_DEFS, add them to the scene, and populate `Brain3D._regions` and `Brain3D._allMeshes` arrays.
- logic:
  1. Set `Brain3D._regions = []` and `Brain3D._allMeshes = []`.
  2. Iterate over each `regionDef` in `REGION_DEFS`:
     a. Copy the `neurons` array: `var neuronList = regionDef.neurons.slice()`.
     b. If `regionDef.collectMNPrefix === true`, iterate all keys of `BRAIN.postSynaptic`. For each key that starts with `'MN_'` and is NOT already in `neuronList`, push it to `neuronList`.
     c. Resolve color: `var colorHex = REGION_COLORS[regionDef.type]`.
     d. Create a `region` object: `{ name: regionDef.name, description: regionDef.description, type: regionDef.type, neurons: neuronList, meshes: [], activation: 0 }`.
     e. Iterate over each `meshDef` in `regionDef.meshDefs`:
        - Create geometry based on `meshDef.geo`:
          - If `'sphere'`: `new THREE.SphereGeometry(meshDef.args[0], meshDef.args[1], meshDef.args[2])`
          - If `'torus'`: `new THREE.TorusGeometry(meshDef.args[0], meshDef.args[1], meshDef.args[2], meshDef.args[3])`
          - If `'cylinder'`: `new THREE.CylinderGeometry(meshDef.args[0], meshDef.args[1], meshDef.args[2], meshDef.args[3])`
        - Create material: `new THREE.MeshStandardMaterial({ color: colorHex, emissive: colorHex, emissiveIntensity: 0, transparent: true, opacity: 0.3, depthWrite: false, roughness: 0.6, metalness: 0.1 })`
        - Create mesh: `var mesh = new THREE.Mesh(geometry, material)`.
        - Set `mesh.position.set(meshDef.pos[0], meshDef.pos[1], meshDef.pos[2])`.
        - Set `mesh.scale.set(meshDef.scale[0], meshDef.scale[1], meshDef.scale[2])`.
        - If `meshDef.rot` exists, set `mesh.rotation.set(meshDef.rot[0], meshDef.rot[1], meshDef.rot[2])`.
        - Set `mesh.userData.region = region` (back-reference for raycasting).
        - Set `mesh.renderOrder = 1` (transparent objects render after opaque).
        - Add mesh to scene: `Brain3D._scene.add(mesh)`.
        - Push mesh to `region.meshes`.
        - Push mesh to `Brain3D._allMeshes`.
     f. Push `region` to `Brain3D._regions`.
  3. Add a faint wireframe "outline" mesh for spatial reference (optional but good visual context):
     - Create `new THREE.SphereGeometry(4.5, 16, 12)` with `new THREE.MeshBasicMaterial({ color: 0x223355, wireframe: true, transparent: true, opacity: 0.06 })`.
     - Set `position.set(0, 0, 0)` and `scale.set(1, 0.6, 0.9)`.
     - Add to scene.
- calls: THREE.SphereGeometry, THREE.TorusGeometry, THREE.CylinderGeometry, THREE.MeshStandardMaterial, THREE.Mesh
- returns: void
- error handling: none

##### signature: `Brain3D.show()`
- purpose: Show the 3D overlay panel and start the internal render loop.
- logic:
  1. If `!Brain3D._initialized`, call `Brain3D.init()`. If still `!Brain3D._initialized` after init, return (WebGL failed).
  2. Set `Brain3D._container.style.display = 'block'`.
  3. Set `Brain3D.active = true`.
  4. Call `Brain3D._onResize()` to size the renderer to the current container dimensions.
  5. Call `Brain3D._renderLoop()` to start the internal animation frame loop.
- calls: `Brain3D.init()`, `Brain3D._onResize()`, `Brain3D._renderLoop()`
- returns: void
- error handling: none

##### signature: `Brain3D.hide()`
- purpose: Hide the 3D overlay panel and stop the internal render loop.
- logic:
  1. Set `Brain3D._container.style.display = 'none'`.
  2. Set `Brain3D.active = false`.
  3. Set `Brain3D._tooltipEl.style.display = 'none'`.
  4. If `Brain3D._animFrameId !== null`, call `cancelAnimationFrame(Brain3D._animFrameId)` and set `Brain3D._animFrameId = null`.
- returns: void

##### signature: `Brain3D.toggle()`
- purpose: Toggle visibility of the 3D overlay panel.
- logic:
  1. If `Brain3D.active`, call `Brain3D.hide()`. Else call `Brain3D.show()`.
- returns: void

##### signature: `Brain3D._renderLoop()`
- purpose: Internal requestAnimationFrame loop that renders the Three.js scene when the overlay is active.
- logic:
  1. If `!Brain3D.active`, return (stop loop).
  2. Set `Brain3D._animFrameId = requestAnimationFrame(Brain3D._renderLoop)`.
  3. Call `Brain3D._controls.update()` (for damping).
  4. Call `Brain3D._renderer.render(Brain3D._scene, Brain3D._camera)`.
- returns: void

##### signature: `Brain3D.update()`
- purpose: Read live connectome activation levels from BRAIN.postSynaptic and update each region mesh's emissive intensity and opacity. Called from main.js loop() each frame.
- logic:
  1. If `!Brain3D.active || !Brain3D._initialized`, return immediately.
  2. Iterate over each `region` in `Brain3D._regions`:
     a. Compute average activation: `var sum = 0; var count = 0;`. Iterate over each `neuronName` in `region.neurons`. If `BRAIN.postSynaptic[neuronName]` exists, add `BRAIN.postSynaptic[neuronName][BRAIN.thisState]` to `sum` and increment `count`. If `count > 0`, set `var avg = sum / count`, else `var avg = 0`.
     b. Normalize: `var normalized = Math.min(1, Math.max(0, avg / ACTIVATION_DIVISOR))`. Store `region.activation = normalized`.
     c. Compute opacity: `var opacity = BASE_OPACITY + normalized * (MAX_OPACITY - BASE_OPACITY)` (range 0.3-0.8).
     d. Compute emissive intensity: `var emissiveIntensity = BASE_EMISSIVE_INTENSITY + normalized * (MAX_EMISSIVE_INTENSITY - BASE_EMISSIVE_INTENSITY)` (range 0.0-1.0).
     e. Iterate over each `mesh` in `region.meshes`. Set `mesh.material.opacity = opacity`. Set `mesh.material.emissiveIntensity = emissiveIntensity`.
- calls: reads `BRAIN.postSynaptic[name][BRAIN.thisState]`
- returns: void

##### signature: `Brain3D._onMouseMove(event)`
- purpose: Handle mouse movement over the Three.js canvas for raycasting hover detection and tooltip display.
- logic:
  1. Get renderer DOM element bounds: `var rect = Brain3D._renderer.domElement.getBoundingClientRect()`.
  2. Compute normalized device coordinates: `Brain3D._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1`. `Brain3D._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1`.
  3. Set raycaster from camera: `Brain3D._raycaster.setFromCamera(Brain3D._mouse, Brain3D._camera)`.
  4. Intersect: `var intersects = Brain3D._raycaster.intersectObjects(Brain3D._allMeshes)`.
  5. If `intersects.length > 0`:
     a. Get `var region = intersects[0].object.userData.region`.
     b. Build tooltip HTML string:
        - Start with `'<div class="b3d-tip-name">' + region.name + '</div>'`.
        - Add `'<div class="b3d-tip-desc">' + region.description + '</div>'`.
        - Add `'<div class="b3d-tip-type">' + region.type.charAt(0).toUpperCase() + region.type.slice(1) + '</div>'`.
        - Add `'<div class="b3d-tip-neurons">'`.
        - Iterate over each `neuronName` in `region.neurons`:
          - Read raw value: `var raw = BRAIN.postSynaptic[neuronName] ? BRAIN.postSynaptic[neuronName][BRAIN.thisState] : 0`.
          - Read description: look up the neuron name in the `neuronDescriptions` variable from main.js. Access it as `(typeof neuronDescriptions !== 'undefined' && neuronDescriptions[neuronName]) ? neuronDescriptions[neuronName] : neuronName`.
          - Compute percentage: `var pct = Math.min(100, Math.max(0, Math.round(raw / ACTIVATION_DIVISOR * 100)))`.
          - Append: `'<div class="b3d-tip-neuron"><span class="b3d-tip-neuron-name">' + desc + '</span><span class="b3d-tip-neuron-val">' + pct + '%</span></div>'`.
        - Close: `'</div>'`.
     c. Set `Brain3D._tooltipEl.innerHTML = html`.
     d. Position tooltip: `Brain3D._tooltipEl.style.left = (event.clientX + 12) + 'px'`. `Brain3D._tooltipEl.style.top = (event.clientY + 12) + 'px'`.
     e. Clamp tooltip to stay on screen: if `event.clientX + 12 + 260 > window.innerWidth`, set `left = (event.clientX - 270) + 'px'`. If `event.clientY + 12 + Brain3D._tooltipEl.offsetHeight > window.innerHeight - 90`, set `top = (event.clientY - Brain3D._tooltipEl.offsetHeight - 12) + 'px'`.
     f. Set `Brain3D._tooltipEl.style.display = 'block'`.
  6. Else (no intersection): set `Brain3D._tooltipEl.style.display = 'none'`.
- returns: void

##### signature: `Brain3D._onResize()`
- purpose: Update camera aspect ratio and renderer size when the window or container resizes.
- logic:
  1. If `!Brain3D._renderer`, return.
  2. Compute `var width = Brain3D._container.clientWidth || window.innerWidth`. `var height = Brain3D._container.clientHeight || (window.innerHeight - 44 - 90)`.
  3. Set `Brain3D._camera.aspect = width / height`. Call `Brain3D._camera.updateProjectionMatrix()`.
  4. Call `Brain3D._renderer.setSize(width, height)`.
- returns: void

#### Wiring / Integration
- `window.Brain3D` is the global entry point. Main.js calls `Brain3D.init()` after `BRAIN.setup()` and calls `Brain3D.update()` from the main loop. The button handler calls `Brain3D.toggle()`.

### 3. MODIFY js/main.js
- operation: MODIFY
- reason: (A) Call Brain3D.init() after BRAIN.setup(), (B) Add Brain 3D button click handler, (C) Call Brain3D.update() in the main loop

#### Change A: Initialize Brain3D after BRAIN.setup() and neuronColorMap build
- anchor: `BRAIN.randExcite();`
- Insert BEFORE that anchor line (after the neuronColorMap loop that ends at approximately line 180):
```javascript
// Initialize Brain3D module (deferred — actual Three.js setup happens on first toggle)
if (typeof Brain3D !== 'undefined') {
    Brain3D.init();
}
```

#### Change B: Add Brain 3D toggle button handler
- anchor: `// --- Help overlay toggle ---`
- Insert BEFORE that anchor line:
```javascript
// --- Brain 3D toggle ---
var brain3dBtn = document.getElementById('brain3dBtn');
if (brain3dBtn) {
    brain3dBtn.addEventListener('click', function () {
        if (typeof Brain3D !== 'undefined') {
            Brain3D.toggle();
            var isActive = Brain3D.active;
            brain3dBtn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
            if (isActive) {
                brain3dBtn.classList.add('active');
            } else {
                brain3dBtn.classList.remove('active');
            }
        }
    });
}
```

#### Change C: Call Brain3D.update() in the main loop
- anchor: `update(dt);` (inside the `loop` function at approximately line 1644)
- Insert AFTER that line (before `draw();`):
```javascript
    if (typeof Brain3D !== 'undefined' && Brain3D.active) { Brain3D.update(); }
```

### 4. MODIFY css/main.css
- operation: MODIFY
- reason: Add styles for the brain3d overlay panel, tooltip, and tooltip inner elements

#### Change: Add brain3d styles at the end of the file
- anchor: `#nodeHolder.hidden {` (last rule block in the file)
- Insert AFTER that entire rule block (after the closing `}`):

```css
/* --- Brain 3D Overlay --- */
#brain3d-overlay {
    position: fixed;
    top: 44px;
    left: 0;
    right: 0;
    bottom: 90px;
    z-index: 15;
    background: #0a0a1a;
}

#brain3d-overlay canvas {
    display: block;
    width: 100% !important;
    height: 100% !important;
}

/* --- Brain 3D Tooltip --- */
#brain3d-tooltip {
    position: fixed;
    z-index: 45;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 0.5rem 0.75rem;
    font-family: system-ui, -apple-system, sans-serif;
    pointer-events: none;
    max-width: 260px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}

.b3d-tip-name {
    color: var(--text);
    font-size: 0.8rem;
    font-weight: 600;
    margin-bottom: 0.15rem;
}

.b3d-tip-desc {
    color: var(--text-muted);
    font-size: 0.7rem;
    margin-bottom: 0.25rem;
    line-height: 1.3;
}

.b3d-tip-type {
    color: var(--accent);
    font-size: 0.65rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-weight: 500;
    margin-bottom: 0.35rem;
}

.b3d-tip-neurons {
    border-top: 1px solid var(--border);
    padding-top: 0.3rem;
    max-height: 180px;
    overflow-y: auto;
}

.b3d-tip-neuron {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.65rem;
    color: var(--text-muted);
    padding: 0.1rem 0;
}

.b3d-tip-neuron-name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.b3d-tip-neuron-val {
    flex-shrink: 0;
    color: var(--text);
    font-weight: 500;
    min-width: 32px;
    text-align: right;
}
```

## Verification
- build: no build step — open index.html in a browser directly (or via local file server)
- lint: no linter configured in project
- test: no existing test runner for this project
- smoke: Open the application in a browser. Click the "Brain 3D" button in the toolbar. Verify: (1) a dark overlay appears between the toolbar and bottom panel showing a 3D brain model with colored translucent regions, (2) the regions glow and become more opaque as the fly's connectome is active, (3) you can orbit/rotate the brain with mouse drag, zoom with scroll wheel, (4) hovering over a brain region shows a tooltip with region name, description, type, and neuron activation percentages, (5) clicking "Brain 3D" again hides the overlay, (6) the simulation continues running underneath while the overlay is open, (7) the button shows active state (orange border/text) when the panel is visible.

## Constraints
- Do NOT install any npm packages or use any build step
- Do NOT modify js/connectome.js, js/constants.js, or js/fly-logic.js
- Do NOT create a second requestAnimationFrame loop in main.js — the Brain3D module manages its own internal render loop via `_renderLoop()`
- Do NOT add `type="module"` to any script tag — the project uses global script loading
- Three.js CDN version MUST be exactly 0.158.0 for both three.min.js and OrbitControls.js — mismatched versions cause runtime errors
- OrbitControls CDN path MUST be `examples/js/controls/OrbitControls.js` (NOT `examples/jsm/` which is the ES module version)
- All brain region materials MUST set `depthWrite: false` to prevent z-fighting between transparent meshes
- All CSS values MUST use the existing CSS custom properties from `:root` (var(--surface), var(--border), var(--text), var(--text-muted), var(--accent), var(--radius)) — no hardcoded hex values except for the scene background (0x0a0a1a) and region colors that match the existing regionColors in main.js
- The Brain 3D button must NOT have a `data-tool` attribute — it is a toggle button (like the help button), not a canvas click tool
- The `Brain3D.update()` call in main.js loop MUST be guarded with `typeof Brain3D !== 'undefined' && Brain3D.active` to handle cases where brain3d.js fails to load
- The `neuronDescriptions` object from main.js is accessed by brain3d.js as a global variable — since brain3d.js loads before main.js, use `typeof neuronDescriptions !== 'undefined'` guard when reading it in the tooltip
