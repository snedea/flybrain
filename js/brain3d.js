/* brain3d.js — Interactive 3D Drosophila brain visualization
 * Reads live connectome activation levels from BRAIN.postSynaptic
 * and renders a Three.js scene with glowing neuropil regions.
 */
(function () {

var REGION_COLORS = {
    sensory: 0x3b82f6,
    central: 0x8b5cf6,
    drives:  0xf59e0b,
    motor:   0xef4444
};

var ACTIVATION_DIVISOR = 80;
var BASE_OPACITY = 0.3;
var MAX_OPACITY = 0.8;
var BASE_EMISSIVE_INTENSITY = 0.0;
var MAX_EMISSIVE_INTENSITY = 1.0;

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

window.Brain3D = {
    active: false,
    _initialized: false,
    _scene: null,
    _camera: null,
    _renderer: null,
    _controls: null,
    _regions: [],
    _allMeshes: [],
    _raycaster: null,
    _mouse: null,
    _container: null,
    _tooltipEl: null,
    _animFrameId: null,

    init: function () {
        if (Brain3D._initialized) return;
        Brain3D._container = document.getElementById('brain3d-overlay');
        Brain3D._tooltipEl = document.getElementById('brain3d-tooltip');
        try {
            Brain3D._scene = new THREE.Scene();
            Brain3D._scene.background = new THREE.Color(0x0a0a1a);

            var width = Brain3D._container.clientWidth || window.innerWidth;
            var height = Brain3D._container.clientHeight || (window.innerHeight - 44 - 90);

            Brain3D._camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 100);
            Brain3D._camera.position.set(0, 6, 10);

            Brain3D._renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
            Brain3D._renderer.setSize(width, height);
            Brain3D._renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
            Brain3D._container.appendChild(Brain3D._renderer.domElement);

            Brain3D._controls = new THREE.OrbitControls(Brain3D._camera, Brain3D._renderer.domElement);
            Brain3D._controls.enableDamping = true;
            Brain3D._controls.dampingFactor = 0.08;
            Brain3D._controls.target.set(0, 0, 0);
            Brain3D._controls.update();

            Brain3D._scene.add(new THREE.AmbientLight(0x404060, 0.6));
            var pointLight1 = new THREE.PointLight(0xffffff, 0.8, 50);
            pointLight1.position.set(5, 8, 5);
            Brain3D._scene.add(pointLight1);
            var pointLight2 = new THREE.PointLight(0x8888ff, 0.4, 50);
            pointLight2.position.set(-5, -3, -5);
            Brain3D._scene.add(pointLight2);

            Brain3D._buildRegions();

            Brain3D._raycaster = new THREE.Raycaster();
            Brain3D._mouse = new THREE.Vector2();

            Brain3D._renderer.domElement.addEventListener('mousemove', Brain3D._onMouseMove);
            window.addEventListener('resize', Brain3D._onResize);

            Brain3D._initialized = true;
        } catch (e) {
            console.warn('Brain3D: WebGL not available', e);
            Brain3D._initialized = false;
            return;
        }
    },

    _buildRegions: function () {
        Brain3D._regions = [];
        Brain3D._allMeshes = [];

        for (var i = 0; i < REGION_DEFS.length; i++) {
            var regionDef = REGION_DEFS[i];
            var neuronList = regionDef.neurons.slice();

            if (regionDef.collectMNPrefix === true) {
                var keys = Object.keys(BRAIN.postSynaptic);
                for (var k = 0; k < keys.length; k++) {
                    if (keys[k].indexOf('MN_') === 0 && neuronList.indexOf(keys[k]) === -1) {
                        neuronList.push(keys[k]);
                    }
                }
            }

            var colorHex = REGION_COLORS[regionDef.type];
            var region = {
                name: regionDef.name,
                description: regionDef.description,
                type: regionDef.type,
                neurons: neuronList,
                meshes: [],
                activation: 0
            };

            for (var m = 0; m < regionDef.meshDefs.length; m++) {
                var meshDef = regionDef.meshDefs[m];
                var geometry;
                if (meshDef.geo === 'sphere') {
                    geometry = new THREE.SphereGeometry(meshDef.args[0], meshDef.args[1], meshDef.args[2]);
                } else if (meshDef.geo === 'torus') {
                    geometry = new THREE.TorusGeometry(meshDef.args[0], meshDef.args[1], meshDef.args[2], meshDef.args[3]);
                } else if (meshDef.geo === 'cylinder') {
                    geometry = new THREE.CylinderGeometry(meshDef.args[0], meshDef.args[1], meshDef.args[2], meshDef.args[3]);
                }

                var material = new THREE.MeshStandardMaterial({
                    color: colorHex,
                    emissive: colorHex,
                    emissiveIntensity: 0,
                    transparent: true,
                    opacity: 0.3,
                    depthWrite: false,
                    roughness: 0.6,
                    metalness: 0.1
                });

                var mesh = new THREE.Mesh(geometry, material);
                mesh.position.set(meshDef.pos[0], meshDef.pos[1], meshDef.pos[2]);
                mesh.scale.set(meshDef.scale[0], meshDef.scale[1], meshDef.scale[2]);
                if (meshDef.rot) {
                    mesh.rotation.set(meshDef.rot[0], meshDef.rot[1], meshDef.rot[2]);
                }
                mesh.userData.region = region;
                mesh.renderOrder = 1;
                Brain3D._scene.add(mesh);
                region.meshes.push(mesh);
                Brain3D._allMeshes.push(mesh);
            }

            Brain3D._regions.push(region);
        }

        // Faint wireframe outline for spatial reference
        var outlineGeo = new THREE.SphereGeometry(4.5, 16, 12);
        var outlineMat = new THREE.MeshBasicMaterial({
            color: 0x223355,
            wireframe: true,
            transparent: true,
            opacity: 0.06
        });
        var outline = new THREE.Mesh(outlineGeo, outlineMat);
        outline.position.set(0, 0, 0);
        outline.scale.set(1, 0.6, 0.9);
        Brain3D._scene.add(outline);
    },

    show: function () {
        if (!Brain3D._initialized) {
            Brain3D.init();
            if (!Brain3D._initialized) return;
        }
        Brain3D._container.style.display = 'block';
        Brain3D.active = true;
        Brain3D._onResize();
        Brain3D._renderLoop();
    },

    hide: function () {
        Brain3D._container.style.display = 'none';
        Brain3D.active = false;
        Brain3D._tooltipEl.style.display = 'none';
        if (Brain3D._animFrameId !== null) {
            cancelAnimationFrame(Brain3D._animFrameId);
            Brain3D._animFrameId = null;
        }
    },

    toggle: function () {
        if (Brain3D.active) {
            Brain3D.hide();
        } else {
            Brain3D.show();
        }
    },

    _renderLoop: function () {
        if (!Brain3D.active) return;
        Brain3D._animFrameId = requestAnimationFrame(Brain3D._renderLoop);
        Brain3D._controls.update();
        Brain3D._renderer.render(Brain3D._scene, Brain3D._camera);
    },

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

            for (var j = 0; j < region.meshes.length; j++) {
                region.meshes[j].material.opacity = opacity;
                region.meshes[j].material.emissiveIntensity = emissiveIntensity;
            }
        }
    },

    _onMouseMove: function (event) {
        var rect = Brain3D._renderer.domElement.getBoundingClientRect();
        Brain3D._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        Brain3D._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        Brain3D._raycaster.setFromCamera(Brain3D._mouse, Brain3D._camera);
        var intersects = Brain3D._raycaster.intersectObjects(Brain3D._allMeshes);

        if (intersects.length > 0) {
            var region = intersects[0].object.userData.region;
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
            Brain3D._tooltipEl.innerHTML = html;
            Brain3D._tooltipEl.style.left = (event.clientX + 12) + 'px';
            Brain3D._tooltipEl.style.top = (event.clientY + 12) + 'px';
            if (event.clientX + 12 + 260 > window.innerWidth) {
                Brain3D._tooltipEl.style.left = (event.clientX - 270) + 'px';
            }
            if (event.clientY + 12 + Brain3D._tooltipEl.offsetHeight > window.innerHeight - 90) {
                Brain3D._tooltipEl.style.top = (event.clientY - Brain3D._tooltipEl.offsetHeight - 12) + 'px';
            }
            Brain3D._tooltipEl.style.display = 'block';
        } else {
            Brain3D._tooltipEl.style.display = 'none';
        }
    },

    _onResize: function () {
        if (!Brain3D._renderer) return;
        var width = Brain3D._container.clientWidth || window.innerWidth;
        var height = Brain3D._container.clientHeight || (window.innerHeight - 44 - 90);
        Brain3D._camera.aspect = width / height;
        Brain3D._camera.updateProjectionMatrix();
        Brain3D._renderer.setSize(width, height);
    }
};

})();
