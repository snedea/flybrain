/**
 * @file Main script for the FlyBrain simulation.
 * @description Renders a top-down 2D Drosophila driven by the BRAIN connectome.
 * The fly body is drawn entirely with canvas paths -- no external images.
 * BRAIN.accumleft / BRAIN.accumright drive direction and speed (unchanged interface).
 */

// --- Controls ---
document.getElementById('clearButton').onclick = function () {
	food = [];
};

document.getElementById('centerButton').onclick = function () {
	fly.x = window.innerWidth / 2;
	fly.y = window.innerHeight / 2;
};

// --- State ---
var facingDir = 0;
var targetDir = 0;
var speed = 0;
var targetSpeed = 0;
var speedChangeInterval = 0;
var food = [];
var touchResetTime = 0;
var windResetTime = 0;
var dragToolOrigin = null;
var currentDtScale = 1;

// Visual feedback effects
var ripples = [];
var windArrowEnd = null;
var currentMousePos = { x: 0, y: 0 };

// ============================================================
// BEHAVIOR STATE MACHINE
// ============================================================

// Minimum time (ms) the fly must stay in a state before transitioning out
var BEHAVIOR_MIN_DURATION = {
	idle: 0,
	walk: 500,
	explore: 1000,
	phototaxis: 1000,
	rest: 3000,
	groom: 2000,
	feed: 2000,
	fly: 1500,
	startle: 800,
	brace: 500,
};

// Cooldown (ms) after exiting a state before it can be re-entered
var BEHAVIOR_COOLDOWN = {
	startle: 2000,
	fly: 1000,
	groom: 3000,
	feed: 1000,
	brace: 1000,
};

// The behavior state object
var behavior = {
	current: 'idle',
	enterTime: Date.now(),
	cooldowns: {},
	startlePhase: 'none',
	startleFreezeEnd: 0,
	groomLocation: null,
	burstDir: 0,
};

// --- Tool state ---
var activeTool = 'feed';
var isDragging = false;
var dragStart = { x: 0, y: 0 };
var canvasTouchActive = false;
var touchTimestamps = [];
var lightStates = [1, 0.5, 0];
var lightStateIndex = 0;
var lightLabels = ['Bright', 'Dim', 'Dark'];
var tempStates = [0.5, 0.75, 0.25];
var tempStateIndex = 0;
var tempLabels = ['Neutral', 'Warm', 'Cool'];

// Region-based neuron color map (built after BRAIN.setup)
var neuronColorMap = {};
// Cached dot element arrays per neuron group (built during DOM creation)
var neuronDotCache = {};
var regionColors = {
	sensory: '#3b82f6',
	central: '#8b5cf6',
	drives: '#f59e0b',
	motor: '#ef4444',
};

// Human-readable neuron descriptions for tooltips
var neuronDescriptions = {
	VIS_R1R6: 'R1-R6 motion photoreceptors',
	VIS_R7R8: 'R7/R8 color photoreceptors',
	VIS_ME: 'Medulla (visual processing)',
	VIS_LO: 'Lobula (pattern recognition)',
	VIS_LC: 'Lobula columnar (looming detection)',
	VIS_LPTC: 'Lobula plate tangential (optic flow)',
	OLF_ORN_FOOD: 'Olfactory receptor (food odors)',
	OLF_ORN_DANGER: 'Olfactory receptor (danger odors)',
	OLF_LN: 'Olfactory local interneurons',
	OLF_PN: 'Olfactory projection neurons',
	GUS_GRN_SWEET: 'Sweet taste receptors',
	GUS_GRN_BITTER: 'Bitter taste receptors',
	GUS_GRN_WATER: 'Water taste receptors',
	MECH_BRISTLE: 'Bristle neurons (touch)',
	MECH_JO: "Johnston's organ (wind/gravity)",
	MECH_CHORD: 'Chordotonal (proprioception)',
	THERMO_WARM: 'Warm thermosensors',
	THERMO_COOL: 'Cool thermosensors',
	NOCI: 'Nociceptors (pain)',
	MB_KC: 'Kenyon cells (odor memory)',
	MB_APL: 'APL inhibitory neuron',
	MB_MBON_APP: 'MB output (appetitive)',
	MB_MBON_AV: 'MB output (aversive)',
	MB_DAN_REW: 'Dopamine reward neurons',
	MB_DAN_PUN: 'Dopamine punishment neurons',
	LH_APP: 'Lateral horn (approach)',
	LH_AV: 'Lateral horn (avoidance)',
	CX_EPG: 'Compass neurons (heading)',
	CX_PFN: 'Path integration neurons',
	CX_FC: 'Fan-shaped body (locomotion)',
	CX_HDELTA: 'Heading change neurons',
	SEZ_FEED: 'Feeding command center',
	SEZ_GROOM: 'Grooming command center',
	SEZ_WATER: 'Water intake command',
	ANTENNAL_MECH: 'Antennal mechanosensory',
	GNG_DESC: 'Gnathal ganglia (arousal)',
	DN_WALK: 'Walk command',
	DN_FLIGHT: 'Flight command',
	DN_TURN: 'Turn command',
	DN_BACKUP: 'Backward walk command',
	DN_STARTLE: 'Startle/escape command',
	VNC_CPG: 'Central pattern generator (gait)',
	CLOCK_DN: 'Circadian clock',
	DRIVE_HUNGER: 'Hunger drive',
	DRIVE_FEAR: 'Fear drive',
	DRIVE_FATIGUE: 'Fatigue drive',
	DRIVE_CURIOSITY: 'Curiosity drive',
	DRIVE_GROOM: 'Grooming urge',
	MN_LEG_L1: 'Motor: front left leg',
	MN_LEG_R1: 'Motor: front right leg',
	MN_LEG_L2: 'Motor: middle left leg',
	MN_LEG_R2: 'Motor: middle right leg',
	MN_LEG_L3: 'Motor: rear left leg',
	MN_LEG_R3: 'Motor: rear right leg',
	MN_WING_L: 'Motor: left wing',
	MN_WING_R: 'Motor: right wing',
	MN_PROBOSCIS: 'Motor: proboscis',
	MN_HEAD: 'Motor: head',
	MN_ABDOMEN: 'Motor: abdomen',
};

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

// --- Brain setup ---
BRAIN.setup();

// Build connectome grid grouped by region type
(function () {
	var holder = document.getElementById('nodeHolder');
	var regionOrder = ['sensory', 'central', 'drives', 'motor'];
	var regionLabels = { sensory: 'Sensory', central: 'Central', drives: 'Drives', motor: 'Motor' };
	var regionNeurons = {};
	for (var r = 0; r < regionOrder.length; r++) {
		regionNeurons[regionOrder[r]] = [];
	}
	// Sort neurons into regions
	for (var ps in BRAIN.connectome) {
		var assigned = false;
		for (var regionName in BRAIN.neuronRegions) {
			var list = BRAIN.neuronRegions[regionName];
			for (var ni = 0; ni < list.length; ni++) {
				if (list[ni] === ps) {
					regionNeurons[regionName].push(ps);
					assigned = true;
					break;
				}
			}
			if (assigned) break;
		}
		if (!assigned) regionNeurons['motor'].push(ps);
	}

	for (var ri = 0; ri < regionOrder.length; ri++) {
		var type = regionOrder[ri];
		var neurons = regionNeurons[type];
		if (neurons.length === 0) continue;

		var section = document.createElement('div');
		section.className = 'cg-section cg-section-' + type;

		var label = document.createElement('div');
		label.className = 'cg-label';
		label.textContent = regionLabels[type];
		section.appendChild(label);

		var grid = document.createElement('div');
		grid.className = 'cg-nodes';

		for (var n = 0; n < neurons.length; n++) {
			var node = document.createElement('div');
			node.className = 'cg-node';
			node.id = neurons[n];
			node.setAttribute('data-neuron', neurons[n]);

			var nameSpan = document.createElement('span');
			nameSpan.className = 'cg-name';
			nameSpan.textContent = neurons[n].replace(/_/g, ' ');
			node.appendChild(nameSpan);

			var cluster = document.createElement('span');
			cluster.className = 'cg-dot-cluster';
			var pop = neuronPopulations[neurons[n]] || 1;
			var dotCount = Math.max(1, Math.min(600, Math.round(pop / 100)));
			var dotArr = [];
			for (var d = 0; d < dotCount; d++) {
				var dot = document.createElement('span');
				dot.className = 'cg-dot';
				cluster.appendChild(dot);
				dotArr.push(dot);
			}
			neuronDotCache[neurons[n]] = dotArr;
			node.appendChild(cluster);

			grid.appendChild(node);
		}

		section.appendChild(grid);
		holder.appendChild(section);
	}
})();

// Build neuron -> color lookup from BRAIN.neuronRegions
for (var region in BRAIN.neuronRegions) {
	var neurons = BRAIN.neuronRegions[region];
	for (var i = 0; i < neurons.length; i++) {
		neuronColorMap[neurons[i]] = regionColors[region] || '#55FF55';
	}
}

// --- Neuron tooltip on hover ---
var neuronTooltip = document.getElementById('neuronTooltip');
document.getElementById('nodeHolder').addEventListener('mouseover', function (e) {
	var node = e.target.closest('.cg-node');
	if (!node) return;
	var id = node.getAttribute('data-neuron');
	var desc = neuronDescriptions[id] || id;
	var pop = neuronPopulations[id];
	var popText = pop ? ' -- represents ~' + pop.toLocaleString() + ' neurons' : '';
	neuronTooltip.textContent = desc + popText;
	neuronTooltip.style.display = 'block';
});
document.getElementById('nodeHolder').addEventListener('mousemove', function (e) {
	if (neuronTooltip.style.display === 'block') {
		neuronTooltip.style.left = (e.clientX + 10) + 'px';
		neuronTooltip.style.bottom = (window.innerHeight - e.clientY + 10) + 'px';
		neuronTooltip.style.top = 'auto';
	}
});
document.getElementById('nodeHolder').addEventListener('mouseout', function (e) {
	var node = e.target.closest('.cg-node');
	if (node) {
		neuronTooltip.style.display = 'none';
	}
});

// --- Tool button handlers ---
var toolButtons = document.querySelectorAll('.tool-btn[data-tool]');
for (var i = 0; i < toolButtons.length; i++) {
	(function (btn) {
		var tool = btn.getAttribute('data-tool');
		if (tool === 'light') {
			btn.addEventListener('click', cycleLightLevel);
		} else if (tool === 'temp') {
			btn.addEventListener('click', cycleTempLevel);
		} else {
			btn.addEventListener('click', function () {
				activeTool = tool;
				for (var j = 0; j < toolButtons.length; j++) {
					var t = toolButtons[j].getAttribute('data-tool');
					if (t !== 'light' && t !== 'temp') {
						toolButtons[j].classList.remove('active');
					}
				}
				btn.classList.add('active');
			});
		}
	})(toolButtons[i]);
}

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

// --- Help overlay toggle ---
var helpOverlay = document.getElementById('helpOverlay');
var helpBtn = document.getElementById('helpBtn');
var helpCloseBtn = document.getElementById('helpCloseBtn');

helpBtn.addEventListener('click', function () {
	var isVisible = helpOverlay.style.display !== 'none';
	helpOverlay.style.display = isVisible ? 'none' : 'block';
});

helpCloseBtn.addEventListener('click', function () {
	helpOverlay.style.display = 'none';
});

// Close help overlay when clicking outside of it
document.addEventListener('click', function (e) {
	if (helpOverlay.style.display !== 'none' &&
		!helpOverlay.contains(e.target) &&
		e.target !== helpBtn) {
		helpOverlay.style.display = 'none';
	}
});

// Close education panel when clicking outside of it
document.addEventListener('click', function (e) {
    if (typeof EducationPanel !== 'undefined' && EducationPanel.active) {
        var panel = document.getElementById('education-panel');
        var learnBtnEl = document.getElementById('learnBtn');
        var brain3dOverlay = document.getElementById('brain3d-overlay');
        if (panel && !panel.contains(e.target) && e.target !== learnBtnEl && (!brain3dOverlay || !brain3dOverlay.contains(e.target))) {
            EducationPanel.hide();
            if (learnBtnEl) learnBtnEl.classList.remove('active');
        }
    }
});

// --- Connectome panel toggle ---
var connectomeToggleBtn = document.getElementById('connectomeToggleBtn');
var nodeHolder = document.getElementById('nodeHolder');

connectomeToggleBtn.addEventListener('click', function () {
	if (BRAIN.workerReady && typeof NeuroRenderer !== 'undefined') {
		if (NeuroRenderer.isActive()) {
			NeuroRenderer.destroy();
			connectomeToggleBtn.textContent = '139K View';
		} else {
			if (NeuroRenderer.init()) {
				connectomeToggleBtn.textContent = 'Groups';
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

/**
 * Updates the brain state and converts motor output to direction/speed.
 * Interface unchanged from worm-sim.
 */
function updateBrain() {
	BRAIN.update();
	if (typeof NeuroRenderer === 'undefined' || !NeuroRenderer.isActive()) {
		for (var postSynaptic in BRAIN.connectome) {
			var psBox = document.getElementById(postSynaptic);
			if (!psBox) continue;
			var neuron = BRAIN.postSynaptic[postSynaptic][BRAIN.thisState];
			var color = neuronColorMap[postSynaptic] || '#55FF55';
			var baseOpacity = Math.min(1, neuron / 50);
			var dots = neuronDotCache[postSynaptic];
			if (!dots) continue;
			for (var di = 0; di < dots.length; di++) {
				var variation = (Math.random() - 0.5) * 0.6;
				var dotOpacity = Math.max(0, Math.min(1, baseOpacity + variation * baseOpacity));
				dots[di].style.backgroundColor = color;
				dots[di].style.opacity = dotOpacity;
				dots[di].style.boxShadow = dotOpacity > 0.5 ? '0 0 ' + Math.round(dotOpacity * 4) + 'px ' + color : 'none';
			}
			psBox.classList.toggle('cg-active', baseOpacity > 0.15);
		}
	}
	// Evaluate behavioral state and compute movement
	updateBehaviorState();
	computeMovementForBehavior();

	// Update drive meter bars
	var driveHungerEl = document.getElementById('driveHunger');
	var driveFearEl = document.getElementById('driveFear');
	var driveFatigueEl = document.getElementById('driveFatigue');
	var driveCuriosityEl = document.getElementById('driveCuriosity');
	var driveGroomEl = document.getElementById('driveGroom');
	if (driveHungerEl) driveHungerEl.style.width = (BRAIN.drives.hunger * 100) + '%';
	if (driveFearEl) driveFearEl.style.width = (BRAIN.drives.fear * 100) + '%';
	if (driveFatigueEl) driveFatigueEl.style.width = (BRAIN.drives.fatigue * 100) + '%';
	if (driveCuriosityEl) driveCuriosityEl.style.width = (BRAIN.drives.curiosity * 100) + '%';
	if (driveGroomEl) driveGroomEl.style.width = (BRAIN.drives.groom * 100) + '%';

	// Update behavior state label
	var behaviorStateEl = document.getElementById('behaviorState');
	if (behaviorStateEl) behaviorStateEl.textContent = behavior.current;
}

BRAIN.randExcite();

// Poll for worker ready state to init WebGL neuron renderer
var _neuroRendererInitTimer = setInterval(function () {
	if (BRAIN.workerReady && typeof NeuroRenderer !== 'undefined') {
		clearInterval(_neuroRendererInitTimer);
		if (NeuroRenderer.init()) {
			connectomeToggleBtn.textContent = 'Groups';
		}
	}
}, 200);
setTimeout(function () { clearInterval(_neuroRendererInitTimer); }, 30000);

// Keyboard shortcut: 'v' toggles connectome view
document.addEventListener('keydown', function (e) {
	if (e.key === 'v' && !e.ctrlKey && !e.metaKey && !e.altKey) {
		if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
		connectomeToggleBtn.click();
	}
});

var brainTickId = setInterval(updateBrain, 500);

// --- Tab visibility handling ---
// When the tab is backgrounded, browsers throttle setInterval to ~1/s but
// pause requestAnimationFrame entirely. This means the brain tick keeps
// running (accumulating drives, processing stale stimuli) while update()
// never runs to clear stimulus timers or reset food flags. On resume,
// drives are maxed out causing a jarring behavioral cascade.
// Fix: pause the brain tick when hidden, resume when visible. On resume,
// clear all stale stimuli and snapshot drives to prevent drift.
var driveSnapshotOnHide = null;

document.addEventListener('visibilitychange', function () {
	if (document.hidden) {
		// Tab is being hidden: stop the brain tick entirely
		clearInterval(brainTickId);
		brainTickId = null;

		// Stop the sim-worker tick loop and clear stale neural state
		BRAIN.stopWorker();

		// Snapshot current drive values so we can restore them on resume
		driveSnapshotOnHide = {
			hunger: BRAIN.drives.hunger,
			fear: BRAIN.drives.fear,
			fatigue: BRAIN.drives.fatigue,
			curiosity: BRAIN.drives.curiosity,
			groom: BRAIN.drives.groom,
		};
	} else {
		// Tab is becoming visible again: clear all stale stimuli
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.touchLocation = null;
		BRAIN.stimulate.wind = false;
		BRAIN.stimulate.windStrength = 0;
		BRAIN.stimulate.windDirection = 0;
		BRAIN.stimulate.foodNearby = false;
		BRAIN.stimulate.foodContact = false;
		BRAIN.stimulate.nociception = false;
		touchResetTime = 0;
		windResetTime = 0;
		touchTimestamps.length = 0;

		// Reset drag/interaction state that may be stale from a mid-drag tab hide
		isDragging = false;
		dragToolOrigin = null;
		windArrowEnd = null;

		// Reset food feeding timestamps to prevent instant food consumption on resume
		for (var fi = 0; fi < food.length; fi++) {
			if (food[fi].feedStart !== 0) {
				food[fi].feedStart = 0;
				food[fi].radius = 10;
			}
		}

		// Restore drive snapshot to undo any drift from throttled ticks
		// that may have fired between the hide event and clearInterval
		if (driveSnapshotOnHide) {
			BRAIN.drives.hunger = driveSnapshotOnHide.hunger;
			BRAIN.drives.fear = driveSnapshotOnHide.fear;
			BRAIN.drives.fatigue = driveSnapshotOnHide.fatigue;
			BRAIN.drives.curiosity = driveSnapshotOnHide.curiosity;
			BRAIN.drives.groom = driveSnapshotOnHide.groom;
			driveSnapshotOnHide = null;
		}

		// Reset behavior and speed state to prevent high-speed transient
		// states from persisting after stimuli have been cleared
		behavior.current = 'idle';
		behavior.startlePhase = 'none';
		behavior.enterTime = Date.now();
		behavior.cooldowns = {};
		behavior.burstDir = 0;
		speed = 0;
		speedChangeInterval = 0;

		// Reset lastTime so the RAF loop does not compute a huge dt on resume
		lastTime = -1;

		// Restart the sim-worker with a clean neural state
		BRAIN.startWorker();

		// Restart the brain tick
		brainTickId = setInterval(updateBrain, 500);
	}
});

// --- Canvas setup ---
var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');

canvas.addEventListener('mousedown', handleCanvasMousedown, false);
canvas.addEventListener('mousemove', handleCanvasMousemove, false);
document.addEventListener('mouseup', handleCanvasMouseup, false);

// --- Touch event handlers (mobile/tablet support) ---
canvas.addEventListener('touchstart', function (event) {
	canvasTouchActive = true;
	event.preventDefault();
	var touch = event.touches[0];
	handleCanvasMousedown({ clientX: touch.clientX, clientY: touch.clientY });
}, { passive: false });

canvas.addEventListener('touchmove', function (event) {
	event.preventDefault();
	var touch = event.touches[0];
	handleCanvasMousemove({ clientX: touch.clientX, clientY: touch.clientY });
}, { passive: false });

document.addEventListener('touchend', function (event) {
	if (canvasTouchActive) {
		event.preventDefault();
		var touch = event.changedTouches[0];
		handleCanvasMouseup({ clientX: touch.clientX, clientY: touch.clientY });
		canvasTouchActive = false;
	}
}, { passive: false });

function handleCanvasMousedown(event) {
	var cx = event.clientX;
	var cy = event.clientY;

	if (activeTool === 'feed') {
		var foodMinY = 44;
		var foodMaxY = window.innerHeight;
		cy = Math.max(foodMinY, Math.min(foodMaxY, cy));
		food.push({ x: cx, y: cy, radius: 10, feedStart: 0, feedDuration: 0 });
	} else if (activeTool === 'touch') {
		applyTouchTool(cx, cy);
		ripples.push({ x: cx, y: cy, startTime: Date.now() });
	} else if (activeTool === 'air') {
		isDragging = true;
		dragToolOrigin = 'air';
		windResetTime = 0;
		dragStart.x = cx;
		dragStart.y = cy;
		BRAIN.stimulate.wind = true;
		BRAIN.stimulate.windStrength = 0.3;
		BRAIN.stimulate.windDirection = 0;
	}
}

function handleCanvasMousemove(event) {
	currentMousePos.x = event.clientX;
	currentMousePos.y = event.clientY;
	if (!isDragging || dragToolOrigin !== 'air') return;
	var dx = event.clientX - dragStart.x;
	var dy = event.clientY - dragStart.y;
	var dragDist = Math.sqrt(dx * dx + dy * dy);
	BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);
	BRAIN.stimulate.windDirection = Math.atan2(-(dy), dx);
	windArrowEnd = { x: event.clientX, y: event.clientY };
}

function handleCanvasMouseup(event) {
	if (isDragging) {
		if (dragToolOrigin === 'air') {
			var dx = event.clientX - dragStart.x;
			var dy = event.clientY - dragStart.y;
			var dragDist = Math.sqrt(dx * dx + dy * dy);
			if (dragDist < 5) {
				var distToFly = Math.hypot(event.clientX - fly.x, event.clientY - fly.y);
				BRAIN.stimulate.windStrength = Math.max(0.1, Math.min(1, 1 - distToFly / 200));
				BRAIN.stimulate.windDirection = Math.atan2(-(fly.y - event.clientY), fly.x - event.clientX);
			} else {
				BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);
				BRAIN.stimulate.windDirection = Math.atan2(-(dy), dx);
			}
			BRAIN.stimulate.wind = true;
			windResetTime = Date.now() + 2000;
		}
		isDragging = false;
		dragToolOrigin = null;
		windArrowEnd = null;
	}
}

function applyTouchTool(cx, cy) {
	var distToFly = Math.hypot(cx - fly.x, cy - fly.y);
	if (distToFly > 50) return; // click not on fly

	// Transform click to fly-local coordinates
	var dx = cx - fly.x;
	var dy = cy - fly.y;
	var angle = facingDir - Math.PI / 2;
	var cosA = Math.cos(angle);
	var sinA = Math.sin(angle);
	var localX = dx * cosA - dy * sinA;
	var localY = dx * sinA + dy * cosA;

	// Classify body part
	var location;
	if (Math.abs(localX) > 12 && localY > -20 && localY < 5) {
		location = 'leg';
	} else if (localY < -17) {
		location = 'head';
	} else if (localY < 2) {
		location = 'thorax';
	} else {
		location = 'abdomen';
	}

	BRAIN.stimulate.touch = true;
	BRAIN.stimulate.touchLocation = location;

	touchResetTime = Math.max(touchResetTime, Date.now() + 2000);

	// Track touch timestamps for nociception (rapid repeated touch = pain)
	var now = Date.now();
	touchTimestamps.push(now);
	// Prune entries older than 4 seconds
	var cutoff = now - 4000;
	while (touchTimestamps.length > 0 && touchTimestamps[0] < cutoff) {
		touchTimestamps.shift();
	}
	// 3+ touches within 4 seconds triggers nociception for one brain tick
	if (touchTimestamps.length >= 3) {
		BRAIN.stimulate.nociception = true;
		touchTimestamps.length = 0; // reset to require fresh rapid touches
	}
}

/**
 * Returns the nearest food item and its distance, or null if no food exists.
 */
function nearestFood() {
	var best = null;
	var bestDist = Infinity;
	for (var i = 0; i < food.length; i++) {
		var d = Math.hypot(fly.x - food[i].x, fly.y - food[i].y);
		if (d < bestDist) {
			bestDist = d;
			best = food[i];
		}
	}
	if (!best) return null;
	return { item: best, dist: bestDist };
}

/**
 * Called on the 500ms brain tick. Evaluates state transitions and
 * updates BRAIN behavior flags for the next tick's drive computation.
 */
function updateBehaviorState() {
	var now = Date.now();
	var elapsed = now - behavior.enterTime;
	var minDur = BEHAVIOR_MIN_DURATION[behavior.current] || 0;

	// Do not transition if minimum duration has not elapsed
	if (elapsed < minDur) {
		// Update BRAIN flags based on current state (for drive computation)
		syncBrainFlags();
		return;
	}

	var newState = evaluateBehaviorEntry();

	if (newState !== behavior.current) {
		// Set cooldown for the state being exited
		if (BEHAVIOR_COOLDOWN[behavior.current]) {
			behavior.cooldowns[behavior.current] = now + BEHAVIOR_COOLDOWN[behavior.current];
		}
		// Reset feeding timers when exiting feed state to prevent stale feedStart leak
		if (behavior.current === 'feed') {
			for (var fi = 0; fi < food.length; fi++) {
				if (food[fi].feedStart !== 0) {
					food[fi].feedStart = 0;
					food[fi].radius = 10;
				}
			}
		}
		behavior.current = newState;
		behavior.enterTime = now;

		// Startle: initialize freeze phase and drain DN_STARTLE
		if (newState === 'startle') {
			behavior.startlePhase = 'freeze';
			behavior.startleFreezeEnd = now + 200;
			if (BRAIN.postSynaptic['DN_STARTLE']) {
				BRAIN.postSynaptic['DN_STARTLE'][BRAIN.thisState] = 0;
				BRAIN.postSynaptic['DN_STARTLE'][BRAIN.nextState] = 0;
			}
		} else {
			behavior.startlePhase = 'none';
		}

		// Groom: snapshot the touch location that triggered grooming
		if (newState === 'groom') {
			behavior.groomLocation = BRAIN.stimulate.touchLocation || 'thorax';
		}
	}

	syncBrainFlags();
}

/**
 * Syncs BRAIN._isMoving/_isFeeding/_isGrooming flags with the
 * behavioral state machine so that drive updates in the next
 * brain tick reflect actual behavior, not just accumulator values.
 */
function syncBrainFlags() {
	var s = behavior.current;
	BRAIN._isMoving = (s === 'walk' || s === 'explore' || s === 'phototaxis' ||
		s === 'fly' || (s === 'startle' && behavior.startlePhase === 'burst'));
	BRAIN._isFeeding = (s === 'feed');
	BRAIN._isGrooming = (s === 'groom');
}

/**
 * Computes targetDir, targetSpeed, speedChangeInterval based on the
 * current behavioral state. Called on the 500ms brain tick.
 * Replaces the old hardcoded accumleft/right -> speed/dir computation.
 */
function computeMovementForBehavior() {
	var scalingFactor = 20;
	var state = behavior.current;

	if (state === 'walk' || state === 'explore') {
		// Direction: motor asymmetry capped to prevent worker noise from causing spinning.
		// Steering is primarily handled by behavioral biases (food-seek, explore wander).
		var newDir = (BRAIN.accumleft - BRAIN.accumright) / scalingFactor;
		newDir = Math.max(-0.05, Math.min(0.05, newDir));
		targetDir = facingDir + newDir * Math.PI;
		targetSpeed = (Math.abs(BRAIN.accumleft) + Math.abs(BRAIN.accumright)) / (scalingFactor * 5);
		speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 1.5);
		if (state === 'explore') {
			targetDir += (Math.random() - 0.5) * 0.3;
		}
		// Food-seeking: bias targetDir toward nearest food when hungry and food detected
		if (BRAIN.stimulate.foodNearby && BRAIN.drives.hunger > 0.3) {
			var nf = nearestFood();
			if (nf) {
				var foodAngle = Math.atan2(-(nf.item.y - fly.y), nf.item.x - fly.x);
				var seekStrength = Math.min(1, BRAIN.drives.hunger) * 0.6;
				var angleDiffToFood = foodAngle - targetDir;
				angleDiffToFood = normalizeAngle(angleDiffToFood);
				targetDir += angleDiffToFood * seekStrength;
				if (targetSpeed < 0.3) targetSpeed = 0.3;
				speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 1.5);
			}
		}
		// Head-turn bias from MN_HEAD (capped to prevent erratic turns)
		if (BRAIN.accumHead > 3) {
			var headBias = Math.min((BRAIN.accumHead / 40) * 0.15, 0.08);
			var headSign = (BRAIN.accumWalkLeft - BRAIN.accumWalkRight > 0) ? 1 : -1;
			targetDir += headBias * headSign;
		}
	} else if (state === 'phototaxis') {
		// Steer toward canvas center (light source placeholder)
		var dx = window.innerWidth / 2 - fly.x;
		var dy = -(window.innerHeight / 2 - fly.y);
		targetDir = Math.atan2(dy, dx);
		targetSpeed = (Math.abs(BRAIN.accumleft) + Math.abs(BRAIN.accumright)) / (scalingFactor * 5);
		if (targetSpeed < 0.3) targetSpeed = 0.3;
		speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 1.5);
	} else if (state === 'fly') {
		var newDir = (BRAIN.accumleft - BRAIN.accumright) / scalingFactor;
		targetDir = facingDir + newDir * Math.PI + (Math.random() - 0.5) * 0.2;
		targetSpeed = ((Math.abs(BRAIN.accumleft) + Math.abs(BRAIN.accumright)) / (scalingFactor * 5)) * 2.5;
		if (targetSpeed < 1.5) targetSpeed = 1.5;
		speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 0.5);
	} else if (state === 'startle') {
		if (behavior.startlePhase === 'freeze') {
			targetSpeed = 0;
			speedChangeInterval = -speed * 0.5;
		} else {
			// burst: use the pre-computed escape direction from applyBehaviorMovement freeze-to-burst transition
			targetDir = behavior.burstDir;
			targetSpeed = 0.5;
			speedChangeInterval = (targetSpeed - speed) / 30;
		}
	} else if (state === 'feed') {
		// Drift toward nearest food until within contact range (20px)
		var nf = nearestFood();
		if (nf && nf.dist > 20) {
			var foodAngle = Math.atan2(-(nf.item.y - fly.y), nf.item.x - fly.x);
			targetDir = foodAngle;
			targetSpeed = 0.15;
			speedChangeInterval = (targetSpeed - speed) / 30;
		} else {
			targetSpeed = 0;
			speedChangeInterval = -speed * 0.1;
		}
	} else if (state === 'brace') {
		targetSpeed = 0;
		speedChangeInterval = -speed * 0.1;
		// Orient to face into the wind (toward wind source = windDirection + PI)
		var braceDir = normalizeAngle(BRAIN.stimulate.windDirection + Math.PI);
		var braceDiff = normalizeAngle(braceDir - targetDir);
		targetDir += braceDiff * 0.8;
		targetDir = normalizeAngle(targetDir);
	} else if (state === 'groom' || state === 'rest') {
		targetSpeed = 0;
		speedChangeInterval = -speed * 0.1;
	} else {
		// idle
		targetSpeed = 0;
		speedChangeInterval = -speed * 0.05;
	}
}

/**
 * Called every frame (60fps) BEFORE speed interpolation.
 * Handles frame-rate-dependent overrides: startle freeze/burst transitions,
 * and speed clamping for stationary behaviors.
 */
function applyBehaviorMovement(dtScale) {
	if (behavior.current === 'startle') {
		var now = Date.now();
		if (behavior.startlePhase === 'freeze') {
			speed = 0;
			speedChangeInterval = 0;
			if (now >= behavior.startleFreezeEnd) {
				behavior.startlePhase = 'burst';
				speed = 3.0;
				behavior.burstDir = normalizeAngle(facingDir + Math.PI + (Math.random() - 0.5) * 0.5);
				targetDir = behavior.burstDir;
				facingDir = behavior.burstDir;
				targetSpeed = 0.5;
				speedChangeInterval = (targetSpeed - speed) / 30;
			}
		}
	}

	if (behavior.current === 'groom' ||
		behavior.current === 'rest' || behavior.current === 'idle' ||
		behavior.current === 'brace') {
		if (speed > 0.05) {
			speed *= Math.pow(0.92, dtScale);
		} else {
			speed = 0;
		}
	}
	if (behavior.current === 'feed') {
		var nf = nearestFood();
		if (nf && nf.dist > 20) {
			// Allow slow drift: clamp speed to max 0.2 so it doesn't overshoot
			if (speed > 0.2) {
				speed *= Math.pow(0.92, dtScale);
			}
		} else {
			if (speed > 0.05) {
				speed *= Math.pow(0.92, dtScale);
			} else {
				speed = 0;
			}
		}
	}
}

/**
 * Called every frame (60fps). Smoothly interpolates animation parameters
 * toward their targets based on the current behavior state.
 */
function updateAnimForBehavior(dtScale) {
	var state = behavior.current;

	// Wing spread target (exponential interpolation for frame-rate independence)
	var targetWingSpread = 0;
	if (state === 'fly' || (state === 'startle' && behavior.startlePhase === 'burst')) {
		targetWingSpread = 1;
	}
	anim.wingSpread += (targetWingSpread - anim.wingSpread) * (1 - Math.pow(0.85, dtScale));

	// Proboscis extension target (exponential interpolation for frame-rate independence)
	var targetProboscis = 0;
	if (state === 'feed') {
		targetProboscis = 1;
	}
	anim.proboscisExtend += (targetProboscis - anim.proboscisExtend) * (1 - Math.pow(0.9, dtScale));

	// Groom phase advances when grooming (linear dt scaling for phase accumulator)
	if (state === 'groom') {
		anim.groomPhase += 0.12 * dtScale;
	}

	// Walk phase advances when walking (linear dt scaling for phase accumulator)
	if (state === 'walk' || state === 'explore' || state === 'phototaxis') {
		var spd = Math.abs(speed);
		anim.walkPhase += spd * 0.5 * dtScale;
	}
}

function cycleLightLevel() {
	lightStateIndex = (lightStateIndex + 1) % lightStates.length;
	BRAIN.stimulate.lightLevel = lightStates[lightStateIndex];
	var btn = document.getElementById('lightBtn');
	if (btn) btn.textContent = 'Light: ' + lightLabels[lightStateIndex];
}

function cycleTempLevel() {
	tempStateIndex = (tempStateIndex + 1) % tempStates.length;
	BRAIN.stimulate.temperature = tempStates[tempStateIndex];
	var btn = document.getElementById('tempBtn');
	if (btn) btn.textContent = 'Temp: ' + tempLabels[tempStateIndex];
}

function drawFood() {
	var t = Date.now();
	for (var i = 0; i < food.length; i++) {
		var f = food[i];
		var distToFly = Math.hypot(fly.x - f.x, fly.y - f.y);

		// Approach glow: subtle pulsing glow when fly is within 50px
		if (distToFly <= 50) {
			var pulse = 0.3 + Math.sin(t / 200) * 0.15;
			ctx.beginPath();
			ctx.arc(f.x, f.y, f.radius + 6, 0, Math.PI * 2);
			ctx.fillStyle = 'rgba(251, 192, 45, ' + pulse.toFixed(2) + ')';
			ctx.fill();
		}

		// Food circle (uses dynamic radius for gradual feeding shrink)
		ctx.beginPath();
		ctx.arc(f.x, f.y, f.radius, 0, Math.PI * 2);
		ctx.fillStyle = 'rgb(251,192,45)';
		ctx.fill();
	}
}

/**
 * Draws expanding ripple effects at touch-tool click points.
 * Ripples expand from 0 to 30px radius over 500ms, fading out.
 */
function drawRipples() {
	var now = Date.now();
	for (var i = ripples.length - 1; i >= 0; i--) {
		var r = ripples[i];
		var elapsed = now - r.startTime;
		if (elapsed > 500) {
			ripples.splice(i, 1);
			continue;
		}
		var progress = elapsed / 500;
		var radius = progress * 30;
		var alpha = 1 - progress;
		ctx.beginPath();
		ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
		ctx.strokeStyle = 'rgba(227, 115, 75, ' + alpha.toFixed(2) + ')';
		ctx.lineWidth = 2 * (1 - progress);
		ctx.stroke();
	}
}

/**
 * Draws a wind direction arrow when the air tool is being dragged.
 * Arrow points from dragStart to current mouse position.
 */
function drawWindArrow() {
	if (!isDragging || dragToolOrigin !== 'air' || !windArrowEnd) return;
	var dx = windArrowEnd.x - dragStart.x;
	var dy = windArrowEnd.y - dragStart.y;
	var dist = Math.sqrt(dx * dx + dy * dy);
	if (dist < 5) return;

	var alpha = Math.min(0.7, dist / 150);

	// Shaft
	ctx.beginPath();
	ctx.moveTo(dragStart.x, dragStart.y);
	ctx.lineTo(windArrowEnd.x, windArrowEnd.y);
	ctx.strokeStyle = 'rgba(200, 210, 230, ' + alpha.toFixed(2) + ')';
	ctx.lineWidth = 2;
	ctx.stroke();

	// Arrowhead
	var angle = Math.atan2(dy, dx);
	var headLen = 10;
	ctx.beginPath();
	ctx.moveTo(windArrowEnd.x, windArrowEnd.y);
	ctx.lineTo(
		windArrowEnd.x - Math.cos(angle - 0.4) * headLen,
		windArrowEnd.y - Math.sin(angle - 0.4) * headLen
	);
	ctx.moveTo(windArrowEnd.x, windArrowEnd.y);
	ctx.lineTo(
		windArrowEnd.x - Math.cos(angle + 0.4) * headLen,
		windArrowEnd.y - Math.sin(angle + 0.4) * headLen
	);
	ctx.strokeStyle = 'rgba(200, 210, 230, ' + alpha.toFixed(2) + ')';
	ctx.lineWidth = 2;
	ctx.stroke();
}

// --- Fly body ---

/**
 * The fly object holds position and animation state.
 * All body part offsets are relative to the fly center and drawn via canvas transforms.
 */
var fly = {
	x: window.innerWidth / 2,
	y: window.innerHeight / 2,
};

// Animation state
var anim = {
	// Leg walk cycle phase (0 to 2*PI)
	walkPhase: 0,
	// Idle timers
	antennaTwitchL: 0,
	antennaTwitchR: 0,
	antennaTargetL: 0,
	antennaTargetR: 0,
	antennaTimer: 0,
	// Leg idle jitter
	legJitter: [0, 0, 0, 0, 0, 0],
	legJitterTarget: [0, 0, 0, 0, 0, 0],
	legJitterTimer: 0,
	// Wing idle
	wingMicro: 0,
	wingMicroTarget: 0,
	wingMicroTimer: 0,
	// Pre-rolled next intervals (frame-rate-independent timer frequency)
	antennaNextInterval: 0.8 + Math.random() * 1.2,
	legJitterNextInterval: 1.5 + Math.random() * 2.0,
	wingMicroNextInterval: 2.0 + Math.random() * 3.0,
	// Behavior animation state (T2.1)
	groomPhase: 0,
	proboscisExtend: 0,
	wingSpread: 0,
};

// Body dimensions (fly ~70px long)
var BODY = {
	// Overall scale
	scale: 1.0,
	// Head
	headRadius: 6,
	headOffsetY: -24, // from center (negative = forward)
	// Eyes
	eyeRadiusX: 4,
	eyeRadiusY: 5,
	eyeOffsetX: 5.5,
	eyeOffsetY: -25,
	// Antennae
	antennaBaseX: 2.5,
	antennaBaseY: -29,
	antennaLength: 10,
	antennaBulbRadius: 1.5,
	// Thorax
	thoraxRadiusX: 8,
	thoraxRadiusY: 12,
	thoraxOffsetY: -10,
	// Abdomen
	abdomenRadiusX: 10,
	abdomenRadiusY: 16,
	abdomenOffsetY: 12,
	// Wings (teardrop shapes, attached to thorax)
	wingOffsetX: 7,
	wingOffsetY: -8,
	wingLength: 42,
	wingWidth: 16,
	// Proboscis
	proboscisLength: 8,
	proboscisBaseY: -30,
	// Leg attachment points on thorax (x, y relative to center)
	// front, middle, rear -- left side (mirrored for right)
	legAttach: [
		{ x: 7, y: -16 },  // front
		{ x: 9, y: -10 },  // middle
		{ x: 8, y: -3 },   // rear
	],
	// Leg segment lengths
	legSeg1: 8,
	legSeg2: 10,
	legSeg3: 6,
	// Resting leg angles (radians from body axis, pointing outward)
	legRestAngles: [
		{ hip: -0.7, knee: -0.3 },  // front: angled forward
		{ hip: 0.0, knee: 0.2 },    // middle: straight out
		{ hip: 0.7, knee: 0.3 },    // rear: angled backward
	],
};

// --- Colors ---
var COLORS = {
	thorax: '#8B6914',
	thoraxStroke: '#6B4F10',
	abdomen: '#B8860B',
	abdomenStripe: '#9A7209',
	abdomenLight: '#C9972E',
	head: '#8B6914',
	headStroke: '#6B4F10',
	eyeFill: '#8B0000',
	eyeHighlight: '#CC2222',
	antenna: '#5C4A1E',
	antennaBulb: '#7A6428',
	wing: 'rgba(200, 210, 230, 0.3)',
	wingStroke: 'rgba(180, 190, 210, 0.5)',
	wingVein: 'rgba(160, 170, 190, 0.4)',
	leg: '#3D2B0F',
	legJoint: '#4A3412',
	proboscis: '#5C4A1E',
};

/**
 * Draws the complete fly body at (0,0) facing up (-Y direction).
 * Canvas should be translated/rotated before calling.
 */
function drawFlyBody(dtScale) {
	var t = Date.now() / 1000;
	var state = behavior.current;

	// --- Legs (behind body) ---
	drawLegs(state, dtScale);

	// --- Abdomen ---
	drawAbdomen();

	// --- Wings (over abdomen, behind thorax) ---
	drawWing(-1); // left
	drawWing(1);  // right

	// --- Thorax ---
	drawThorax();

	// --- Head ---
	drawHead();

	// --- Eyes ---
	drawEyes();

	// --- Antennae ---
	drawAntennae(t, dtScale);

	// --- Proboscis (shown when extending) ---
	if (anim.proboscisExtend > 0.01) {
		drawProboscis(anim.proboscisExtend);
	}
}

/**
 * Draws one wing (side = -1 for left, +1 for right).
 */
function drawWing(side) {
	var wx = BODY.wingOffsetX * side;
	var wy = BODY.wingOffsetY;
	var wl = BODY.wingLength;
	var ww = BODY.wingWidth * side;

	// Wing micro-movement (idle flutter)
	var microOffset = anim.wingMicro * 0.5 * side;

	// Wing spread for flight/startle
	var spreadAngle = anim.wingSpread * 0.85;

	// Flight buzz: rapid oscillation when wings are spread
	var buzzOffset = 0;
	if (anim.wingSpread > 0.5) {
		buzzOffset = Math.sin(Date.now() / 30) * 0.15 * anim.wingSpread;
	}

	ctx.save();
	ctx.translate(wx + microOffset, wy);
	ctx.rotate(side * (0.35 + spreadAngle) + microOffset * 0.02 + buzzOffset);

	// Scale wings up during flight (compensates for spread rotation)
	var wingScale = 1.0 + anim.wingSpread * 0.3;
	ctx.scale(wingScale, wingScale);

	// Dynamic wing opacity (more visible when spread)
	var wingAlpha = 0.3 + anim.wingSpread * 0.35;

	// Teardrop wing shape (extends backward toward abdomen)
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.bezierCurveTo(
		ww * 1.2, wl * 0.2,
		ww * 1.4, wl * 0.7,
		ww * 0.3, wl
	);
	ctx.bezierCurveTo(
		-ww * 0.2, wl * 0.8,
		-ww * 0.1, wl * 0.3,
		0, 0
	);
	ctx.fillStyle = 'rgba(200, 210, 230, ' + wingAlpha.toFixed(2) + ')';
	ctx.fill();
	ctx.strokeStyle = 'rgba(180, 190, 210, ' + Math.min(1, wingAlpha + 0.2).toFixed(2) + ')';
	ctx.lineWidth = 0.5;
	ctx.stroke();

	// Wing veins
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(ww * 0.5, wl * 0.8);
	ctx.moveTo(0, 2);
	ctx.lineTo(ww * 1.0, wl * 0.5);
	ctx.moveTo(0, 1);
	ctx.lineTo(ww * 0.8, wl * 0.3);
	ctx.strokeStyle = 'rgba(160, 170, 190, ' + Math.min(1, wingAlpha + 0.1).toFixed(2) + ')';
	ctx.lineWidth = 0.3;
	ctx.stroke();

	ctx.restore();
}

/**
 * Draws the abdomen with subtle stripes.
 */
function drawAbdomen() {
	var ax = 0;
	var ay = BODY.abdomenOffsetY;
	var rx = BODY.abdomenRadiusX;
	var ry = BODY.abdomenRadiusY;

	// Abdomen curl during abdomen-specific grooming
	var abdomenCurl = 0;
	if (behavior.current === 'groom' && (behavior.groomLocation === 'abdomen' || behavior.groomLocation === 'thorax')) {
		abdomenCurl = Math.sin(anim.groomPhase * 0.8) * 2;
	}
	ay += abdomenCurl;

	// Main abdomen shape
	ctx.beginPath();
	ctx.ellipse(ax, ay, rx, ry, 0, 0, Math.PI * 2);
	ctx.fillStyle = COLORS.abdomen;
	ctx.fill();

	// Stripes (darker bands across the abdomen)
	ctx.save();
	ctx.beginPath();
	ctx.ellipse(ax, ay, rx, ry, 0, 0, Math.PI * 2);
	ctx.clip();

	for (var s = 0; s < 4; s++) {
		var stripeY = ay - ry * 0.3 + s * (ry * 0.45);
		ctx.beginPath();
		ctx.ellipse(ax, stripeY, rx * 1.1, ry * 0.08, 0, 0, Math.PI * 2);
		ctx.fillStyle = COLORS.abdomenStripe;
		ctx.fill();
	}

	// Subtle highlight along center
	ctx.beginPath();
	ctx.ellipse(ax, ay - 2, rx * 0.3, ry * 0.85, 0, 0, Math.PI * 2);
	ctx.fillStyle = COLORS.abdomenLight;
	ctx.globalAlpha = 0.15;
	ctx.fill();
	ctx.globalAlpha = 1.0;

	ctx.restore();
}

/**
 * Draws the thorax (darker, slightly smaller ellipse).
 */
function drawThorax() {
	ctx.beginPath();
	ctx.ellipse(0, BODY.thoraxOffsetY, BODY.thoraxRadiusX, BODY.thoraxRadiusY, 0, 0, Math.PI * 2);
	ctx.fillStyle = COLORS.thorax;
	ctx.fill();
	ctx.strokeStyle = COLORS.thoraxStroke;
	ctx.lineWidth = 0.8;
	ctx.stroke();

	// Subtle midline groove
	ctx.beginPath();
	ctx.moveTo(0, BODY.thoraxOffsetY - BODY.thoraxRadiusY * 0.7);
	ctx.lineTo(0, BODY.thoraxOffsetY + BODY.thoraxRadiusY * 0.7);
	ctx.strokeStyle = COLORS.thoraxStroke;
	ctx.lineWidth = 0.5;
	ctx.globalAlpha = 0.3;
	ctx.stroke();
	ctx.globalAlpha = 1.0;
}

/**
 * Draws the head.
 */
function drawHead() {
	ctx.beginPath();
	ctx.ellipse(0, BODY.headOffsetY, BODY.headRadius * 1.1, BODY.headRadius, 0, 0, Math.PI * 2);
	ctx.fillStyle = COLORS.head;
	ctx.fill();
	ctx.strokeStyle = COLORS.headStroke;
	ctx.lineWidth = 0.6;
	ctx.stroke();
}

/**
 * Draws compound eyes on the head.
 */
function drawEyes() {
	for (var side = -1; side <= 1; side += 2) {
		var ex = BODY.eyeOffsetX * side;
		var ey = BODY.eyeOffsetY;

		// Main eye
		ctx.beginPath();
		ctx.ellipse(ex, ey, BODY.eyeRadiusX, BODY.eyeRadiusY, side * 0.3, 0, Math.PI * 2);
		ctx.fillStyle = COLORS.eyeFill;
		ctx.fill();

		// Highlight
		ctx.beginPath();
		ctx.ellipse(ex - side * 1, ey - 1.5, BODY.eyeRadiusX * 0.4, BODY.eyeRadiusY * 0.35, side * 0.3, 0, Math.PI * 2);
		ctx.fillStyle = COLORS.eyeHighlight;
		ctx.globalAlpha = 0.5;
		ctx.fill();
		ctx.globalAlpha = 1.0;
	}
}

/**
 * Draws antennae with idle twitching animation.
 */
function drawAntennae(t, dtScale) {
	// Update antenna twitch targets periodically
	if (t - anim.antennaTimer > anim.antennaNextInterval) {
		anim.antennaTimer = t;
		var antennaBase = 0.8 + Math.random() * 1.2;
		anim.antennaNextInterval = BRAIN.stimulate.lightLevel === 0 ? antennaBase * 2 : antennaBase;
		anim.antennaTargetL = (Math.random() - 0.5) * 0.4;
		anim.antennaTargetR = (Math.random() - 0.5) * 0.4;
	}
	// Smooth interpolation toward targets
	anim.antennaTwitchL += (anim.antennaTargetL - anim.antennaTwitchL) * (1 - Math.pow(0.92, dtScale));
	anim.antennaTwitchR += (anim.antennaTargetR - anim.antennaTwitchR) * (1 - Math.pow(0.92, dtScale));

	for (var side = -1; side <= 1; side += 2) {
		var bx = BODY.antennaBaseX * side;
		var by = BODY.antennaBaseY;
		var twitch = side === -1 ? anim.antennaTwitchL : anim.antennaTwitchR;

		// Base angle: spread outward and forward
		var baseAngle = -Math.PI / 2 + side * 0.5 + twitch;

		// Wind-sensing posture: bias antennae toward wind direction
		if (BRAIN.stimulate.wind || behavior.current === 'brace') {
			// Convert world-space windDirection to body-local frame.
			// The canvas transform is: rotate(-facingDir + PI/2), so body-local
			// "forward" (-Y in body space) corresponds to facingDir in world space.
			// Body-local angle of wind = windDirection - facingDir, then rotate by
			// PI/2 because body space has forward = -Y (up on canvas).
			var localWindAngle = normalizeAngle(BRAIN.stimulate.windDirection - facingDir + Math.PI / 2);
			// Blend antenna toward wind source with modest strength
			var windBias = normalizeAngle(localWindAngle - baseAngle) * 0.3;
			baseAngle += windBias;
		}

		var tipX = bx + Math.cos(baseAngle) * BODY.antennaLength;
		var tipY = by + Math.sin(baseAngle) * BODY.antennaLength;

		// Antenna stalk
		ctx.beginPath();
		ctx.moveTo(bx, by);
		// Slight curve via quadratic
		var cpx = bx + Math.cos(baseAngle) * BODY.antennaLength * 0.5 + side * 1;
		var cpy = by + Math.sin(baseAngle) * BODY.antennaLength * 0.5 - 1;
		ctx.quadraticCurveTo(cpx, cpy, tipX, tipY);
		ctx.strokeStyle = COLORS.antenna;
		ctx.lineWidth = 1.0;
		ctx.stroke();

		// Bulb at tip (arista)
		ctx.beginPath();
		ctx.arc(tipX, tipY, BODY.antennaBulbRadius, 0, Math.PI * 2);
		ctx.fillStyle = COLORS.antennaBulb;
		ctx.fill();
	}
}

/**
 * Draws the proboscis (retractable feeding tube).
 * @param {number} extend - Extension amount from 0 (retracted) to 1 (fully extended).
 */
function drawProboscis(extend) {
	var len = BODY.proboscisLength * extend;

	ctx.beginPath();
	ctx.moveTo(0, BODY.proboscisBaseY);
	ctx.lineTo(0, BODY.proboscisBaseY - len);
	ctx.strokeStyle = COLORS.proboscis;
	ctx.lineWidth = 1.2;
	ctx.lineCap = 'round';
	ctx.stroke();

	// Tiny tip
	ctx.beginPath();
	ctx.arc(0, BODY.proboscisBaseY - len, 1, 0, Math.PI * 2);
	ctx.fillStyle = COLORS.proboscis;
	ctx.fill();
}

/**
 * Draws all 6 legs with behavior-specific animation.
 * State-dependent modes: tripod gait (walk/explore/phototaxis),
 * grooming rub (groom), tucked (fly/rest), jump pose (startle burst),
 * idle jitter (idle/feed).
 */
function drawLegs(state, dtScale) {
	var t = Date.now() / 1000;
	var isWalking = (state === 'walk' || state === 'explore' || state === 'phototaxis');
	var isGrooming = (state === 'groom');
	var isFlying = (state === 'fly');
	var isStartleBurst = (state === 'startle' && behavior.startlePhase === 'burst');
	var isStartleFreeze = (state === 'startle' && behavior.startlePhase === 'freeze');
	var isResting = (state === 'rest');
	var isBracing = (state === 'brace');

	// Update idle jitter targets periodically
	if (t - anim.legJitterTimer > anim.legJitterNextInterval) {
		anim.legJitterTimer = t;
		anim.legJitterNextInterval = 1.5 + Math.random() * 2.0;
		for (var j = 0; j < 6; j++) {
			anim.legJitterTarget[j] = (Math.random() - 0.5) * 0.15;
		}
	}
	for (var j = 0; j < 6; j++) {
		anim.legJitter[j] += (anim.legJitterTarget[j] - anim.legJitter[j]) * (1 - Math.pow(0.95, dtScale));
	}

	// Update wing micro-movement
	if (t - anim.wingMicroTimer > anim.wingMicroNextInterval) {
		anim.wingMicroTimer = t;
		anim.wingMicroNextInterval = 2.0 + Math.random() * 3.0;
		anim.wingMicroTarget = (Math.random() - 0.5) * 2;
	}
	anim.wingMicro += (anim.wingMicroTarget - anim.wingMicro) * (1 - Math.pow(0.97, dtScale));

	// Tripod groups
	var groupA = [0, 3, 4];
	var groupB = [1, 2, 5];

	for (var legIdx = 0; legIdx < 6; legIdx++) {
		var pairIdx = Math.floor(legIdx / 2); // 0=front, 1=mid, 2=rear
		var side = (legIdx % 2 === 0) ? -1 : 1; // even=left(-1), odd=right(+1)
		var attach = BODY.legAttach[pairIdx];
		var restAngles = BODY.legRestAngles[pairIdx];

		var hipMod = restAngles.hip;
		var kneeMod = restAngles.knee;
		var walkOffset = 0;
		var jitter = 0;

		if (isWalking) {
			// Tripod gait animation
			var inGroupA = groupA.indexOf(legIdx) !== -1;
			var legPhase = anim.walkPhase + (inGroupA ? 0 : Math.PI);
			walkOffset = Math.sin(legPhase) * 0.35;
		} else if (isGrooming) {
			var groomLoc = behavior.groomLocation || 'thorax';
			if (groomLoc === 'head' && pairIdx === 0) {
				// Front legs rub the head area: swing forward and inward
				hipMod = -0.9 + Math.sin(anim.groomPhase) * 0.4;
				kneeMod = -0.8 + Math.sin(anim.groomPhase * 1.5) * 0.25;
			} else if (groomLoc === 'abdomen' && pairIdx === 2) {
				// Rear legs reach back to abdomen: swing backward
				hipMod = 1.0 + Math.sin(anim.groomPhase * 0.8) * 0.3;
				kneeMod = 0.5 + Math.sin(anim.groomPhase * 1.2) * 0.2;
			} else if (groomLoc === 'thorax' && pairIdx === 0) {
				// Full bilateral front-leg grooming: wide symmetric rub
				hipMod = -0.2 + Math.sin(anim.groomPhase) * 0.5;
				kneeMod = -0.6 + Math.sin(anim.groomPhase * 1.3) * 0.2;
			} else if (groomLoc === 'leg') {
				// Targeted single-leg cleaning: only the leg on the touched side moves
				// Use side-based targeting: left legs clean when side=-1 touch
				if (pairIdx === 1) {
					// Middle legs do the cleaning motion
					hipMod = 0.1 + Math.sin(anim.groomPhase * 1.1) * 0.4;
					kneeMod = 0.3 + Math.sin(anim.groomPhase * 1.4) * 0.3;
				}
			}
		} else if (isFlying) {
			// Tucked legs during flight
			hipMod *= 0.4;
			kneeMod *= 0.3;
		} else if (isStartleBurst && pairIdx >= 1) {
			// Middle and rear legs extend for jump
			hipMod *= 1.5;
			kneeMod *= 0.5;
		} else if (isStartleFreeze) {
			// Legs frozen in current position -- no jitter, no walk
			// Use rest angles as-is (no modification)
		} else if (isResting) {
			// Slightly tucked with slow jitter
			hipMod *= 0.7;
			jitter = anim.legJitter[legIdx] * 0.3;
		} else if (isBracing) {
			// Widened stance with suppressed jitter to show bracing
			hipMod *= 1.1;
			jitter = anim.legJitter[legIdx] * 0.1;
		} else {
			// idle / feed / default: normal idle jitter (reduced 50% in complete darkness)
			jitter = anim.legJitter[legIdx] * (BRAIN.stimulate.lightLevel === 0 ? 0.5 : 1.0);
		}

		// Compute hip and knee angles
		var hipAngle = (hipMod + walkOffset + jitter) * side;
		var kneeAngle = kneeMod * side;

		// Attachment point on body
		var ax = attach.x * side;
		var ay = attach.y;

		// First segment (coxa/femur)
		var baseAngle = (side === -1 ? Math.PI : 0) + hipAngle;
		var seg1EndX = ax + Math.cos(baseAngle) * BODY.legSeg1;
		var seg1EndY = ay + Math.sin(baseAngle) * BODY.legSeg1;

		// Second segment (tibia) -- bends at knee
		var kneeAngleAbs = baseAngle + kneeAngle + side * 0.5;
		var seg2EndX = seg1EndX + Math.cos(kneeAngleAbs) * BODY.legSeg2;
		var seg2EndY = seg1EndY + Math.sin(kneeAngleAbs) * BODY.legSeg2;

		// Third segment (tarsus) -- slight hook
		var tarsusAngle = kneeAngleAbs + side * 0.3;
		var seg3EndX = seg2EndX + Math.cos(tarsusAngle) * BODY.legSeg3;
		var seg3EndY = seg2EndY + Math.sin(tarsusAngle) * BODY.legSeg3;

		// Draw leg segments
		ctx.beginPath();
		ctx.moveTo(ax, ay);
		ctx.lineTo(seg1EndX, seg1EndY);
		ctx.lineTo(seg2EndX, seg2EndY);
		ctx.lineTo(seg3EndX, seg3EndY);
		ctx.strokeStyle = COLORS.leg;
		ctx.lineWidth = 1.4;
		ctx.lineJoin = 'round';
		ctx.lineCap = 'round';
		ctx.stroke();

		// Joint dots
		ctx.beginPath();
		ctx.arc(seg1EndX, seg1EndY, 1.2, 0, Math.PI * 2);
		ctx.fillStyle = COLORS.legJoint;
		ctx.fill();

		ctx.beginPath();
		ctx.arc(seg2EndX, seg2EndY, 1.0, 0, Math.PI * 2);
		ctx.fillStyle = COLORS.legJoint;
		ctx.fill();
	}
}

// --- Movement update (same interface as worm-sim) ---
function update(dt) {
	var dtScale = dt / (1000 / 60);
	currentDtScale = dtScale;
	applyBehaviorMovement(dtScale);

	speed += speedChangeInterval * dtScale;
	if (speed < 0) speed = 0;

	// Edge avoidance: bias targetDir away from screen edges when within 50px
	var edgeMargin = 50;
	var edgeBias = 0;
	var edgeBiasY = 0;
	var topBound = 44;
	var bottomBound = window.innerHeight - 210;
	var leftBound = 0;
	var rightBound = window.innerWidth;

	if (fly.x - leftBound < edgeMargin) {
		edgeBias += (edgeMargin - (fly.x - leftBound)) / edgeMargin; // push right (+x)
	} else if (rightBound - fly.x < edgeMargin) {
		edgeBias -= (edgeMargin - (rightBound - fly.x)) / edgeMargin; // push left (-x)
	}
	if (fly.y - topBound < edgeMargin) {
		edgeBiasY -= (edgeMargin - (fly.y - topBound)) / edgeMargin; // push down (-y, but facingDir uses -sin for y)
	} else if (bottomBound - fly.y < edgeMargin) {
		edgeBiasY += (edgeMargin - (bottomBound - fly.y)) / edgeMargin; // push up
	}

	if (edgeBias !== 0 || edgeBiasY !== 0) {
		// Compute desired direction away from edges
		var awayAngle = Math.atan2(edgeBiasY, edgeBias);
		var awayStrength = Math.min(1, Math.sqrt(edgeBias * edgeBias + edgeBiasY * edgeBiasY));
		var angleDiffEdge = awayAngle - targetDir;
		// Normalize to [-PI, PI]
		angleDiffEdge = normalizeAngle(angleDiffEdge);
		targetDir += angleDiffEdge * awayStrength * 0.3 * dtScale;
	}

	// Exponential interpolation toward targetDir using shortest-arc angle difference.
	// Behavior-dependent retention: fast (0.3) for escape states where near-instant
	// turning is needed at high speed, slow (0.9) for calm states where smooth
	// gentle turns look natural. At dtScale=1 (60fps): 0.3 closes 70% of the gap
	// per frame (~3 frames to 97%), 0.9 closes 10% per frame (~22 frames to 90%).
	var turnRetention;
	if (behavior.current === 'startle' && behavior.startlePhase === 'burst') {
		turnRetention = 0.3;
	} else if (behavior.current === 'fly') {
		turnRetention = 0.4;
	} else {
		turnRetention = 0.9;
	}
	var angleDiffTurn = normalizeAngle(targetDir - facingDir);
	facingDir += angleDiffTurn * (1 - Math.pow(turnRetention, dtScale));

	// Normalize angles to [-PI, PI] to prevent unbounded growth
	facingDir = normalizeAngle(facingDir);
	targetDir = normalizeAngle(targetDir);

	fly.x += Math.cos(facingDir) * speed * dtScale;
	fly.y -= Math.sin(facingDir) * speed * dtScale;

	// Screen bounds (clamped to visible area: toolbar=44px top, panel=90px bottom)
	if (fly.x < 0) {
		fly.x = 0;
		BRAIN.stimulate.touch = true;
		touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
	} else if (fly.x > window.innerWidth) {
		fly.x = window.innerWidth;
		BRAIN.stimulate.touch = true;
		touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
	}
	if (fly.y < 44) {
		fly.y = 44;
		BRAIN.stimulate.touch = true;
		touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
	} else if (fly.y > window.innerHeight) {
		fly.y = window.innerHeight;
		BRAIN.stimulate.touch = true;
		touchResetTime = Math.max(touchResetTime, Date.now() + 2000);
	}

	// Food proximity
	BRAIN.stimulate.foodContact = false;
	BRAIN.stimulate.foodNearby = false;
	for (var i = 0; i < food.length; i++) {
		var dist = Math.hypot(fly.x - food[i].x, fly.y - food[i].y);
		if (dist <= 50) {
			BRAIN.stimulate.foodNearby = true;
			if (dist <= 20) {
				BRAIN.stimulate.foodContact = true;
				if (behavior.current === 'feed') {
					// Gradual feeding: start timer on first contact, shrink food, remove when done
					if (food[i].feedStart === 0) {
						food[i].feedStart = Date.now();
						food[i].feedDuration = 2000 + Math.random() * 3000;
					}
					var elapsed = Date.now() - food[i].feedStart;
					var progress = Math.min(1, elapsed / food[i].feedDuration);
					food[i].radius = 10 * (1 - progress * 0.9);
					if (progress >= 1) {
						food.splice(i, 1);
						i--;
					}
				}
			} else {
				// Not in contact range: reset feeding progress if fly walked away
				if (food[i].feedStart !== 0) {
					food[i].feedStart = 0;
					food[i].radius = 10;
				}
			}
		} else {
			// Out of range: reset feeding progress
			if (food[i].feedStart !== 0) {
				food[i].feedStart = 0;
				food[i].radius = 10;
			}
		}
	}

	// Reset touch stimulus after wall-clock expiry (2 seconds)
	if (touchResetTime > 0 && Date.now() >= touchResetTime) {
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.touchLocation = null;
		touchResetTime = 0;
	}

	// Reset wind stimulus after wall-clock expiry (2 seconds)
	if (windResetTime > 0 && Date.now() >= windResetTime) {
		BRAIN.stimulate.wind = false;
		BRAIN.stimulate.windStrength = 0;
		BRAIN.stimulate.windDirection = 0;
		windResetTime = 0;
	}

	updateAnimForBehavior(dtScale);
}

// --- Draw ---
function draw() {
	// Update canvas background based on light level
	var ll = BRAIN.stimulate.lightLevel;
	if (ll >= 1) {
		canvas.style.backgroundColor = '#222';
	} else if (ll >= 0.5) {
		canvas.style.backgroundColor = '#161616';
	} else {
		canvas.style.backgroundColor = '#080808';
	}

	ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
	drawFood();
	drawRipples();
	drawWindArrow();

	// Draw fly at its position, rotated to face movement direction
	ctx.save();
	ctx.translate(fly.x, fly.y);
	// facingDir is in radians where 0 = right, PI/2 = up
	// Our fly body is drawn facing up (-Y), so rotate accordingly:
	// To face right (facingDir=0), we need to rotate +PI/2
	// The mapping is: canvas rotation = -(facingDir) + PI/2
	// But since canvas Y is inverted (down = +Y), and our sin uses -sin for Y:
	// rotation = -facingDir + PI/2
	ctx.rotate(-facingDir + Math.PI / 2);
	ctx.scale(BODY.scale, BODY.scale);
	drawFlyBody(currentDtScale);
	ctx.restore();

	// Small dot showing fly's "nose" target for debugging (very faint)
	ctx.beginPath();
	ctx.arc(fly.x, fly.y, 2, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(255,255,255,0.08)';
	ctx.fill();
}

// --- Resize (with high-DPI support) ---
(function resize() {
	var dpr = window.devicePixelRatio || 1;
	canvas.width = window.innerWidth * dpr;
	canvas.height = window.innerHeight * dpr;
	canvas.style.width = window.innerWidth + 'px';
	canvas.style.height = window.innerHeight + 'px';
	ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
	// Clamp food positions to current visible bounds so food items
	// near old edges don't become unreachable after window shrinks
	for (var i = 0; i < food.length; i++) {
		food[i].x = Math.max(0, Math.min(food[i].x, window.innerWidth));
		food[i].y = Math.max(44, Math.min(food[i].y, window.innerHeight));
	}
	// Also re-clamp the fly position to the new bounds
	fly.x = Math.max(0, Math.min(fly.x, window.innerWidth));
	fly.y = Math.max(44, Math.min(fly.y, window.innerHeight));
	window.addEventListener('resize', resize);
})();

// --- Main loop (requestAnimationFrame with delta-time) ---
var lastTime = -1;
function loop(timestamp) {
	if (lastTime < 0) {
		lastTime = timestamp;
		draw();
		requestAnimationFrame(loop);
		return;
	}
	var dt = timestamp - lastTime;
	lastTime = timestamp;
	// Clamp dt to 100ms to prevent huge jumps after tab-backgrounding
	if (dt > 100) dt = 100;
	update(dt);
	if (typeof Brain3D !== 'undefined' && Brain3D.active) { Brain3D.update(); }
	draw();
	requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
