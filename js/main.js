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
	var scalingFactor = 20;
	var newDir = (BRAIN.accumleft - BRAIN.accumright) / scalingFactor;
	targetDir = facingDir + newDir * Math.PI;
	targetSpeed =
		(Math.abs(BRAIN.accumleft) + Math.abs(BRAIN.accumright)) /
		(scalingFactor * 5);
	speedChangeInterval = (targetSpeed - speed) / (scalingFactor * 1.5);

	// Update drive meter bars
	var driveHungerEl = document.getElementById('driveHunger');
	var driveFearEl = document.getElementById('driveFear');
	var driveFatigueEl = document.getElementById('driveFatigue');
	var driveCuriosityEl = document.getElementById('driveCuriosity');
	if (driveHungerEl) driveHungerEl.style.width = (BRAIN.drives.hunger * 100) + '%';
	if (driveFearEl) driveFearEl.style.width = (BRAIN.drives.fear * 100) + '%';
	if (driveFatigueEl) driveFatigueEl.style.width = (BRAIN.drives.fatigue * 100) + '%';
	if (driveCuriosityEl) driveCuriosityEl.style.width = (BRAIN.drives.curiosity * 100) + '%';
}

BRAIN.randExcite();
setInterval(updateBrain, 500);

// --- Canvas setup ---
var canvas = document.getElementById('canvas');
var ctx = canvas.getContext('2d');

canvas.addEventListener('mousedown', handleCanvasMousedown, false);
canvas.addEventListener('mousemove', handleCanvasMousemove, false);
canvas.addEventListener('mouseup', handleCanvasMouseup, false);

function handleCanvasMousedown(event) {
	var cx = event.clientX;
	var cy = event.clientY;

	if (activeTool === 'feed') {
		food.push({ x: cx, y: cy });
	} else if (activeTool === 'touch') {
		applyTouchTool(cx, cy);
	} else if (activeTool === 'air') {
		isDragging = true;
		dragStart.x = cx;
		dragStart.y = cy;
		BRAIN.stimulate.wind = true;
		BRAIN.stimulate.windStrength = 0.3;
	}
}

function handleCanvasMousemove(event) {
	if (!isDragging || activeTool !== 'air') return;
	var dx = event.clientX - dragStart.x;
	var dy = event.clientY - dragStart.y;
	var dragDist = Math.sqrt(dx * dx + dy * dy);
	BRAIN.stimulate.windStrength = Math.min(1, dragDist / 150);
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

	setTimeout(function () {
		BRAIN.stimulate.touch = false;
		BRAIN.stimulate.touchLocation = null;
	}, 2000);
}

function cycleLightLevel() {
	lightStateIndex = (lightStateIndex + 1) % lightStates.length;
	BRAIN.stimulate.lightLevel = lightStates[lightStateIndex];
	var btn = document.getElementById('lightBtn');
	if (btn) btn.textContent = 'Light: ' + lightLabels[lightStateIndex];
}

function drawFood() {
	for (var i = 0; i < food.length; i++) {
		ctx.beginPath();
		ctx.arc(food[i].x, food[i].y, 10, 0, Math.PI * 2);
		ctx.fillStyle = 'rgb(251,192,45)';
		ctx.fill();
	}
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
	var spd = Math.abs(speed);
	var isMoving = spd > 0.15;

	// Update walk animation
	if (isMoving) {
		anim.walkPhase += spd * 0.5;
	}

	// --- Wings (drawn first, behind body) ---
	drawWing(-1); // left
	drawWing(1);  // right

	// --- Legs (behind body) ---
	drawLegs(isMoving);

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

	// --- Proboscis (hidden by default) ---
	// Uncomment if feeding behavior is active:
	// drawProboscis();
}

/**
 * Draws one wing (side = -1 for left, +1 for right).
 */
function drawWing(side) {
	var wx = BODY.wingOffsetX * side;
	var wy = BODY.wingOffsetY;
	var wl = BODY.wingLength;
	var ww = BODY.wingWidth * side;

	// Wing micro-movement
	var microOffset = anim.wingMicro * 0.5 * side;

	ctx.save();
	ctx.translate(wx + microOffset, wy);
	ctx.rotate(side * 0.15 + microOffset * 0.02); // slight fold angle

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
	ctx.fillStyle = COLORS.wing;
	ctx.fill();
	ctx.strokeStyle = COLORS.wingStroke;
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
	ctx.strokeStyle = COLORS.wingVein;
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
function drawProboscis() {
	ctx.beginPath();
	ctx.moveTo(0, BODY.proboscisBaseY);
	ctx.lineTo(0, BODY.proboscisBaseY - BODY.proboscisLength);
	ctx.strokeStyle = COLORS.proboscis;
	ctx.lineWidth = 1.2;
	ctx.lineCap = 'round';
	ctx.stroke();

	// Tiny tip
	ctx.beginPath();
	ctx.arc(0, BODY.proboscisBaseY - BODY.proboscisLength, 1, 0, Math.PI * 2);
	ctx.fillStyle = COLORS.proboscis;
	ctx.fill();
}

/**
 * Draws all 6 legs with walking or idle animation.
 * Tripod gait: Group A (front-left, mid-right, rear-left) vs Group B.
 */
function drawLegs(isMoving) {
	var t = Date.now() / 1000;

	// Update idle jitter targets
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

	// Leg indices: 0=front-left, 1=front-right, 2=mid-left, 3=mid-right, 4=rear-left, 5=rear-right
	// Tripod groups:
	//   A: front-left(0), mid-right(3), rear-left(4)
	//   B: front-right(1), mid-left(2), rear-right(5)
	var groupA = [0, 3, 4];
	var groupB = [1, 2, 5];

	for (var legIdx = 0; legIdx < 6; legIdx++) {
		var pairIdx = Math.floor(legIdx / 2); // 0=front, 1=mid, 2=rear
		var side = (legIdx % 2 === 0) ? -1 : 1; // even=left(-1), odd=right(+1)
		var attach = BODY.legAttach[pairIdx];
		var restAngles = BODY.legRestAngles[pairIdx];

		// Walk animation: determine phase offset for this leg
		var walkOffset = 0;
		if (isMoving) {
			var inGroupA = groupA.indexOf(legIdx) !== -1;
			// Group A and B alternate: A at phase 0, B at phase PI
			var legPhase = anim.walkPhase + (inGroupA ? 0 : Math.PI);
			walkOffset = Math.sin(legPhase) * 0.35;
		}

		// Idle jitter
		var jitter = isMoving ? 0 : anim.legJitter[legIdx];

		// Compute hip and knee angles
		var hipAngle = (restAngles.hip + walkOffset + jitter) * side;
		var kneeAngle = restAngles.knee * side;

		// Attachment point on body
		var ax = attach.x * side;
		var ay = attach.y;

		// Hip angle: relative to horizontal axis
		// For left legs (side=-1), angles go left; for right (side=1), angles go right
		var baseAngle = Math.PI / 2 * side + hipAngle;

		// First segment (coxa/femur)
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
function update() {
	speed += speedChangeInterval;

	var facingMinusTarget = facingDir - targetDir;
	var angleDiff = facingMinusTarget;

	if (Math.abs(facingMinusTarget) > 180) {
		if (facingDir > targetDir) {
			angleDiff = -1 * (360 - facingDir + targetDir);
		} else {
			angleDiff = 360 - targetDir + facingDir;
		}
	}

	if (angleDiff > 0) {
		facingDir -= 0.1;
	} else if (angleDiff < 0) {
		facingDir += 0.1;
	}

	fly.x += Math.cos(facingDir) * speed;
	fly.y -= Math.sin(facingDir) * speed;

	// Screen bounds
	if (fly.x < 0) {
		fly.x = 0;
		BRAIN.stimulateNoseTouchNeurons = true;
	} else if (fly.x > window.innerWidth) {
		fly.x = window.innerWidth;
		BRAIN.stimulateNoseTouchNeurons = true;
	}
	if (fly.y < 0) {
		fly.y = 0;
		BRAIN.stimulateNoseTouchNeurons = true;
	} else if (fly.y > window.innerHeight) {
		fly.y = window.innerHeight;
		BRAIN.stimulateNoseTouchNeurons = true;
	}

	// Food proximity
	for (var i = 0; i < food.length; i++) {
		var dist = Math.hypot(fly.x - food[i].x, fly.y - food[i].y);
		if (dist <= 50) {
			BRAIN.stimulateFoodSenseNeurons = true;
			if (dist <= 20) {
				food.splice(i, 1);
				i--;
			}
		}
	}

	// Reset neuron stimulation after 2 seconds
	setTimeout(function () {
		BRAIN.stimulateHungerNeurons = true;
		BRAIN.stimulateNoseTouchNeurons = false;
		BRAIN.stimulateFoodSenseNeurons = false;
	}, 2000);

	frameCount++;
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

	ctx.clearRect(0, 0, canvas.width, canvas.height);
	drawFood();

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

// --- Resize ---
(function resize() {
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
	window.onresize = resize;
})();

// --- Main loop ---
setInterval(function () {
	update();
	draw();
}, 1e3 / 60);
