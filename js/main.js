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
var frameCount = 0;
var touchResetFrame = 0;

// Normalize angle to [-PI, PI] range
function normalizeAngle(a) {
	a = a % (2 * Math.PI);
	if (a > Math.PI) a -= 2 * Math.PI;
	if (a < -Math.PI) a += 2 * Math.PI;
	return a;
}

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
};

// Cooldown (ms) after exiting a state before it can be re-entered
var BEHAVIOR_COOLDOWN = {
	startle: 2000,
	fly: 1000,
	groom: 3000,
	feed: 1000,
};

// Accumulator thresholds for entering each state
var BEHAVIOR_THRESHOLDS = {
	startle: 30,
	fly: 15,
	feed: 8,
	groom: 8,
	walk: 5,
	restFatigue: 0.7,
	exploreCuriosity: 0.4,
	phototaxisLight: 0.5,
};

// The behavior state object
var behavior = {
	current: 'idle',
	previous: 'idle',
	enterTime: Date.now(),
	cooldowns: {},
	startlePhase: 'none',
	startleFreezeEnd: 0,
};

// --- Tool state ---
var activeTool = 'feed';
var isDragging = false;
var dragStart = { x: 0, y: 0 };
var lightStates = [1, 0.5, 0];
var lightStateIndex = 0;
var lightLabels = ['Bright', 'Dim', 'Dark'];

// Region-based neuron color map (built after BRAIN.setup)
var neuronColorMap = {};
var regionColors = {
	sensory: '#3b82f6',
	central: '#8b5cf6',
	drives: '#f59e0b',
	motor: '#ef4444',
};

// --- Brain setup ---
BRAIN.setup();

for (var ps in BRAIN.connectome) {
	var nameBox = document.createElement('span');
	document.getElementById('nodeHolder').appendChild(nameBox);

	var newBox = document.createElement('span');
	newBox.cols = 3;
	newBox.rows = 1;
	newBox.id = ps;
	newBox.className = 'brainNode';
	document.getElementById('nodeHolder').appendChild(newBox);
}

// Build neuron -> color lookup from BRAIN.neuronRegions
for (var region in BRAIN.neuronRegions) {
	var neurons = BRAIN.neuronRegions[region];
	for (var i = 0; i < neurons.length; i++) {
		neuronColorMap[neurons[i]] = regionColors[region] || '#55FF55';
	}
}

// --- Tool button handlers ---
var toolButtons = document.querySelectorAll('.tool-btn[data-tool]');
for (var i = 0; i < toolButtons.length; i++) {
	(function (btn) {
		var tool = btn.getAttribute('data-tool');
		if (tool === 'light') {
			btn.addEventListener('click', cycleLightLevel);
		} else {
			btn.addEventListener('click', function () {
				activeTool = tool;
				for (var j = 0; j < toolButtons.length; j++) {
					var t = toolButtons[j].getAttribute('data-tool');
					if (t !== 'light') {
						toolButtons[j].classList.remove('active');
					}
				}
				btn.classList.add('active');
			});
		}
	})(toolButtons[i]);
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

// --- Connectome panel toggle ---
var connectomeToggleBtn = document.getElementById('connectomeToggleBtn');
var nodeHolder = document.getElementById('nodeHolder');

connectomeToggleBtn.addEventListener('click', function () {
	var isHidden = nodeHolder.classList.contains('hidden');
	if (isHidden) {
		nodeHolder.classList.remove('hidden');
		connectomeToggleBtn.textContent = 'Hide';
	} else {
		nodeHolder.classList.add('hidden');
		connectomeToggleBtn.textContent = 'Show';
	}
});

/**
 * Updates the brain state and converts motor output to direction/speed.
 * Interface unchanged from worm-sim.
 */
function updateBrain() {
	BRAIN.update();
	for (var postSynaptic in BRAIN.connectome) {
		var psBox = document.getElementById(postSynaptic);
		var neuron = BRAIN.postSynaptic[postSynaptic][BRAIN.thisState];
		psBox.style.backgroundColor = neuronColorMap[postSynaptic] || '#55FF55';
		psBox.style.opacity = Math.min(1, neuron / 50);
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
setInterval(updateBrain, 500);

// --- Canvas setup ---
var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');

canvas.addEventListener('mousedown', handleCanvasMousedown, false);
canvas.addEventListener('mousemove', handleCanvasMousemove, false);
canvas.addEventListener('mouseup', handleCanvasMouseup, false);

// --- Touch event handlers (mobile/tablet support) ---
canvas.addEventListener('touchstart', function (event) {
	event.preventDefault();
	var touch = event.touches[0];
	handleCanvasMousedown({ clientX: touch.clientX, clientY: touch.clientY });
}, { passive: false });

canvas.addEventListener('touchmove', function (event) {
	event.preventDefault();
	var touch = event.touches[0];
	handleCanvasMousemove({ clientX: touch.clientX, clientY: touch.clientY });
}, { passive: false });

canvas.addEventListener('touchend', function (event) {
	event.preventDefault();
	// Use changedTouches for the touch that was lifted
	var touch = event.changedTouches[0];
	handleCanvasMouseup({ clientX: touch.clientX, clientY: touch.clientY });
}, { passive: false });

function handleCanvasMousedown(event) {
	var cx = event.clientX;
	var cy = event.clientY;

	if (activeTool === 'feed') {
		food.push({ x: cx, y: cy, radius: 10, feedStart: 0, feedDuration: 0 });
	} else if (activeTool === 'touch') {
		applyTouchTool(cx, cy);
		ripples.push({ x: cx, y: cy, startTime: Date.now() });
	} else if (activeTool === 'air') {
		isDragging = true;
		dragStart.x = cx;
		dragStart.y = cy;
		BRAIN.stimulate.wind = true;
		BRAIN.stimulate.windStrength = 0.3;
	}
}

function handleCanvasMousemove(event) {
	currentMousePos.x = event.clientX;
	currentMousePos.y = event.clientY;
	if (!isDragging || activeTool !== 'air') return;
	var dx = event.clientX - dragStart.x;
	var dy = event.clientY - dragStart.y;
	var dragDist = Math.sqrt(dx * dx + dy * dy);
	BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);
	windArrowEnd = { x: event.clientX, y: event.clientY };
}

function handleCanvasMouseup(event) {
	if (isDragging && activeTool === 'air') {
		var dx = event.clientX - dragStart.x;
		var dy = event.clientY - dragStart.y;
		var dragDist = Math.sqrt(dx * dx + dy * dy);
		if (dragDist < 5) {
			// Click (no drag): wind strength from proximity to fly
			var distToFly = Math.hypot(event.clientX - fly.x, event.clientY - fly.y);
			BRAIN.stimulate.windStrength = Math.max(0.1, Math.min(1, 1 - distToFly / 200));
		} else {
			BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);
		}
		BRAIN.stimulate.wind = true;
		isDragging = false;
		windArrowEnd = null;
		setTimeout(function () {
			BRAIN.stimulate.wind = false;
			BRAIN.stimulate.windStrength = 0;
		}, 2000);
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

	touchResetFrame = Math.max(touchResetFrame, frameCount + 120);
}

/**
 * Returns true if any food item is within 50px of the fly.
 */
function hasNearbyFood() {
	for (var i = 0; i < food.length; i++) {
		if (Math.hypot(fly.x - food[i].x, fly.y - food[i].y) <= 50) return true;
	}
	return false;
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
 * Returns true if the given state is in its cooldown period.
 */
function isCoolingDown(state, now) {
	return behavior.cooldowns[state] !== undefined && now < behavior.cooldowns[state];
}

/**
 * Evaluates accumulator outputs and drives to determine which behavior
 * state should be active. Returns the state name string.
 * Priority order (highest first): startle, fly, feed, groom, rest, phototaxis, explore, walk, idle.
 */
function evaluateBehaviorEntry() {
	var now = Date.now();
	var totalWalk = BRAIN.accumWalkLeft + BRAIN.accumWalkRight;

	if (BRAIN.accumStartle > BEHAVIOR_THRESHOLDS.startle && !isCoolingDown('startle', now)) {
		return 'startle';
	}
	if (BRAIN.accumFlight > BEHAVIOR_THRESHOLDS.fly && !isCoolingDown('fly', now)) {
		return 'fly';
	}
	if (BRAIN.accumFeed > BEHAVIOR_THRESHOLDS.feed && hasNearbyFood() && !isCoolingDown('feed', now)) {
		return 'feed';
	}
	if (BRAIN.accumGroom > BEHAVIOR_THRESHOLDS.groom && !isCoolingDown('groom', now)) {
		return 'groom';
	}
	if (BRAIN.drives.fatigue > BEHAVIOR_THRESHOLDS.restFatigue) {
		return 'rest';
	}
	if (BRAIN.stimulate.lightLevel > BEHAVIOR_THRESHOLDS.phototaxisLight &&
		BRAIN.drives.curiosity > 0.2 && totalWalk > 3) {
		return 'phototaxis';
	}
	if (totalWalk > BEHAVIOR_THRESHOLDS.walk &&
		BRAIN.drives.curiosity > BEHAVIOR_THRESHOLDS.exploreCuriosity) {
		return 'explore';
	}
	if (totalWalk > BEHAVIOR_THRESHOLDS.walk) {
		return 'walk';
	}
	return 'idle';
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
		behavior.previous = behavior.current;
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
		var newDir = (BRAIN.accumleft - BRAIN.accumright) / scalingFactor;
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
				// Blend targetDir toward foodAngle
				var angleDiffToFood = foodAngle - targetDir;
				// Normalize to [-PI, PI]
				while (angleDiffToFood > Math.PI) angleDiffToFood -= 2 * Math.PI;
				while (angleDiffToFood < -Math.PI) angleDiffToFood += 2 * Math.PI;
				targetDir += angleDiffToFood * seekStrength;
				// Ensure minimum speed when seeking food
				if (targetSpeed < 0.3) targetSpeed = 0.3;
				speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 1.5);
			}
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
			// burst direction: reverse facing + jitter
			targetDir = facingDir + Math.PI + (Math.random() - 0.5) * 0.5;
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
				targetDir = facingDir + Math.PI + (Math.random() - 0.5) * 0.5;
				targetSpeed = 0.5;
				speedChangeInterval = (targetSpeed - speed) / 30;
			}
		}
	}

	if (behavior.current === 'groom' ||
		behavior.current === 'rest' || behavior.current === 'idle') {
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
function updateAnimForBehavior() {
	var state = behavior.current;

	// Wing spread target
	var targetWingSpread = 0;
	if (state === 'fly' || (state === 'startle' && behavior.startlePhase === 'burst')) {
		targetWingSpread = 1;
	}
	anim.wingSpread += (targetWingSpread - anim.wingSpread) * 0.15;

	// Proboscis extension target
	var targetProboscis = 0;
	if (state === 'feed') {
		targetProboscis = 1;
	}
	anim.proboscisExtend += (targetProboscis - anim.proboscisExtend) * 0.1;

	// Groom phase advances when grooming
	if (state === 'groom') {
		anim.groomPhase += 0.12;
	}
}

function cycleLightLevel() {
	lightStateIndex = (lightStateIndex + 1) % lightStates.length;
	BRAIN.stimulate.lightLevel = lightStates[lightStateIndex];
	var btn = document.getElementById('lightBtn');
	if (btn) btn.textContent = 'Light: ' + lightLabels[lightStateIndex];
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
	if (!isDragging || activeTool !== 'air' || !windArrowEnd) return;
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
	wingLength: 22,
	wingWidth: 9,
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
function drawFlyBody() {
	var t = Date.now() / 1000;
	var state = behavior.current;
	var isWalking = (state === 'walk' || state === 'explore' || state === 'phototaxis');

	// Update walk animation phase only when walking
	if (isWalking) {
		var spd = Math.abs(speed);
		anim.walkPhase += spd * 0.5;
	}

	// --- Wings (drawn first, behind body) ---
	drawWing(-1); // left
	drawWing(1);  // right

	// --- Legs (behind body) ---
	drawLegs(state);

	// --- Abdomen ---
	drawAbdomen();

	// --- Thorax ---
	drawThorax();

	// --- Head ---
	drawHead();

	// --- Eyes ---
	drawEyes();

	// --- Antennae ---
	drawAntennae(t);

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
	ctx.rotate(side * (0.15 + spreadAngle) + microOffset * 0.02 + buzzOffset);

	// Dynamic wing opacity (more visible when spread)
	var wingAlpha = 0.3 + anim.wingSpread * 0.35;

	// Teardrop wing shape
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.bezierCurveTo(
		ww * 1.2, -wl * 0.2,
		ww * 1.4, -wl * 0.7,
		ww * 0.3, -wl
	);
	ctx.bezierCurveTo(
		-ww * 0.2, -wl * 0.8,
		-ww * 0.1, -wl * 0.3,
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
	ctx.lineTo(ww * 0.5, -wl * 0.8);
	ctx.moveTo(0, -2);
	ctx.lineTo(ww * 1.0, -wl * 0.5);
	ctx.moveTo(0, -1);
	ctx.lineTo(ww * 0.8, -wl * 0.3);
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
	if (behavior.current === 'groom' && (BRAIN.stimulate.touchLocation === 'abdomen' || BRAIN.stimulate.touchLocation === null)) {
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
function drawAntennae(t) {
	// Update antenna twitch targets periodically
	if (t - anim.antennaTimer > 0.8 + Math.random() * 1.2) {
		anim.antennaTimer = t;
		anim.antennaTargetL = (Math.random() - 0.5) * 0.4;
		anim.antennaTargetR = (Math.random() - 0.5) * 0.4;
	}
	// Smooth interpolation toward targets
	anim.antennaTwitchL += (anim.antennaTargetL - anim.antennaTwitchL) * 0.08;
	anim.antennaTwitchR += (anim.antennaTargetR - anim.antennaTwitchR) * 0.08;

	for (var side = -1; side <= 1; side += 2) {
		var bx = BODY.antennaBaseX * side;
		var by = BODY.antennaBaseY;
		var twitch = side === -1 ? anim.antennaTwitchL : anim.antennaTwitchR;

		// Base angle: spread outward and forward
		var baseAngle = -Math.PI / 2 + side * 0.5 + twitch;
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
 * Hidden by default; call this when feeding behavior is active.
 */
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
 * Draws all 6 legs with walking or idle animation.
 * Tripod gait: Group A (front-left, mid-right, rear-left) vs Group B.
 */
/**
 * Draws all 6 legs with behavior-specific animation.
 * State-dependent modes: tripod gait (walk/explore/phototaxis),
 * grooming rub (groom), tucked (fly/rest), jump pose (startle burst),
 * idle jitter (idle/feed).
 */
function drawLegs(state) {
	var t = Date.now() / 1000;
	var isWalking = (state === 'walk' || state === 'explore' || state === 'phototaxis');
	var isGrooming = (state === 'groom');
	var isFlying = (state === 'fly');
	var isStartleBurst = (state === 'startle' && behavior.startlePhase === 'burst');
	var isStartleFreeze = (state === 'startle' && behavior.startlePhase === 'freeze');
	var isResting = (state === 'rest');

	// Update idle jitter targets periodically
	if (t - anim.legJitterTimer > 1.5 + Math.random() * 2.0) {
		anim.legJitterTimer = t;
		for (var j = 0; j < 6; j++) {
			anim.legJitterTarget[j] = (Math.random() - 0.5) * 0.15;
		}
	}
	for (var j = 0; j < 6; j++) {
		anim.legJitter[j] += (anim.legJitterTarget[j] - anim.legJitter[j]) * 0.05;
	}

	// Update wing micro-movement
	if (t - anim.wingMicroTimer > 2.0 + Math.random() * 3.0) {
		anim.wingMicroTimer = t;
		anim.wingMicroTarget = (Math.random() - 0.5) * 2;
	}
	anim.wingMicro += (anim.wingMicroTarget - anim.wingMicro) * 0.03;

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
			var groomLoc = BRAIN.stimulate.touchLocation || 'thorax';
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
				var targetPair = pairIdx; // all legs may participate
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
		} else {
			// idle / feed / default: normal idle jitter
			jitter = anim.legJitter[legIdx];
		}

		// Compute hip and knee angles
		var hipAngle = (hipMod + walkOffset + jitter) * side;
		var kneeAngle = kneeMod * side;

		// Attachment point on body
		var ax = attach.x * side;
		var ay = attach.y;

		// First segment (coxa/femur)
		var baseAngle = Math.PI / 2 * side + hipAngle;
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
	applyBehaviorMovement(dtScale);

	speed += speedChangeInterval * dtScale;

	var facingMinusTarget = facingDir - targetDir;
	var angleDiff = facingMinusTarget;

	if (Math.abs(facingMinusTarget) > Math.PI) {
		if (facingDir > targetDir) {
			angleDiff = -1 * (2 * Math.PI - facingDir + targetDir);
		} else {
			angleDiff = 2 * Math.PI - targetDir + facingDir;
		}
	}

	if (angleDiff > 0) {
		facingDir -= 0.1 * dtScale;
	} else if (angleDiff < 0) {
		facingDir += 0.1 * dtScale;
	}

	// Edge avoidance: bias targetDir away from screen edges when within 50px
	var edgeMargin = 50;
	var edgeBias = 0;
	var edgeBiasY = 0;
	var topBound = 44;
	var bottomBound = window.innerHeight - 90;
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
		while (angleDiffEdge > Math.PI) angleDiffEdge -= 2 * Math.PI;
		while (angleDiffEdge < -Math.PI) angleDiffEdge += 2 * Math.PI;
		targetDir += angleDiffEdge * awayStrength * 0.3 * dtScale;
	}

	// Normalize angles to [-PI, PI] to prevent unbounded growth
	facingDir = normalizeAngle(facingDir);
	targetDir = normalizeAngle(targetDir);

	fly.x += Math.cos(facingDir) * speed;
	fly.y -= Math.sin(facingDir) * speed;

	// Screen bounds (clamped to visible area: toolbar=44px top, panel=90px bottom)
	if (fly.x < 0) {
		fly.x = 0;
		BRAIN.stimulate.touch = true;
		touchResetFrame = Math.max(touchResetFrame, frameCount + 120);
	} else if (fly.x > window.innerWidth) {
		fly.x = window.innerWidth;
		BRAIN.stimulate.touch = true;
		touchResetFrame = Math.max(touchResetFrame, frameCount + 120);
	}
	if (fly.y < 44) {
		fly.y = 44;
		BRAIN.stimulate.touch = true;
		touchResetFrame = Math.max(touchResetFrame, frameCount + 120);
	} else if (fly.y > window.innerHeight - 90) {
		fly.y = window.innerHeight - 90;
		BRAIN.stimulate.touch = true;
		touchResetFrame = Math.max(touchResetFrame, frameCount + 120);
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

	// Reset wall-touch stimulus after 120 frames (~2 seconds at 60fps)
	if (touchResetFrame > 0 && frameCount >= touchResetFrame) {
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.touchLocation = null;
		touchResetFrame = 0;
	}

	frameCount++;
	updateAnimForBehavior();
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
	drawFlyBody();
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
	window.onresize = resize;
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
	draw();
	requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
