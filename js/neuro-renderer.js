/* neuro-renderer.js — T7.5
 *
 * WebGL2 renderer that draws 139K neurons as GL_POINTS in the left sidebar,
 * colored by region type, brightness driven by fire state from the worker.
 * Replaces the DOM-based dot clusters with a single-draw-call WebGL canvas.
 */
(function () {
	'use strict';

	var REGION_COLORS = [
		[0.231, 0.510, 0.965],  // region_type 0 = sensory: #3b82f6
		[0.545, 0.361, 0.965],  // region_type 1 = central: #8b5cf6
		[0.961, 0.620, 0.043],  // region_type 2 = drives:  #f59e0b
		[0.937, 0.267, 0.267]   // region_type 3 = motor:   #ef4444
	];
	var POINT_SIZE = 2.0;
	var SECTION_GAP = 24;
	var PAD = 4;
	var PICK_RADIUS_SQ = 16;
	var SECTION_NAMES = ['Sensory', 'Central', 'Drives', 'Motor'];
	var LABEL_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];
	var LABEL_BGS = ['rgba(59,130,246,0.1)', 'rgba(139,92,246,0.1)', 'rgba(245,158,11,0.1)', 'rgba(239,68,68,0.1)'];

	var canvas = null;
	var gl = null;
	var program = null;
	var posBuffer = null;
	var colorBuffer = null;
	var brightnessBuffer = null;
	var brightnessData = null;     // Float32Array(neuronCount)
	var neuronCount = 0;
	var cols = 0;                  // columns per row in the grid layout
	var animFrameId = null;
	var active = false;
	var tooltipEl = null;
	var labelContainer = null;
	var sectionBounds = [];        // Array of {y0, y1, region, neuronIndices}
	var neuronPositions = null;    // Float32Array(neuronCount * 2) pixel coords for hit-testing
	var _onMouseMove = null;
	var _onMouseLeave = null;

	function init() {
		if (!BRAIN.workerNeuronCount) return false;
		neuronCount = BRAIN.workerNeuronCount;

		var holder = document.getElementById('nodeHolder');
		holder.style.display = 'none';

		var panel = document.getElementById('connectome-panel');

		var existing = document.getElementById('neuro-renderer-wrap');
		if (existing) existing.parentNode.removeChild(existing);

		var wrap = document.createElement('div');
		wrap.id = 'neuro-renderer-wrap';
		panel.appendChild(wrap);

		canvas = document.createElement('canvas');
		canvas.id = 'neuro-canvas';
		wrap.appendChild(canvas);

		labelContainer = document.createElement('div');
		labelContainer.id = 'neuro-labels';
		wrap.appendChild(labelContainer);

		gl = canvas.getContext('webgl2', {antialias: false, alpha: false});
		if (!gl) {
			console.warn('WebGL2 not available');
			holder.style.display = '';
			wrap.parentNode.removeChild(wrap);
			canvas = null;
			labelContainer = null;
			return false;
		}

		canvas.width = Math.floor(wrap.getBoundingClientRect().width) || 320;

		buildShaders();
		if (!program) {
			holder.style.display = '';
			wrap.parentNode.removeChild(wrap);
			gl = null;
			canvas = null;
			labelContainer = null;
			return false;
		}

		buildLayout();
		buildLabels();

		tooltipEl = document.getElementById('neuronTooltip');

		_onMouseMove = onMouseMove;
		canvas.addEventListener('mousemove', _onMouseMove);
		_onMouseLeave = onMouseLeave;
		canvas.addEventListener('mouseleave', _onMouseLeave);

		active = true;
		animFrameId = requestAnimationFrame(renderLoop);
		return true;
	}

	function destroy() {
		active = false;
		if (animFrameId !== null) {
			cancelAnimationFrame(animFrameId);
			animFrameId = null;
		}
		if (canvas && _onMouseMove) canvas.removeEventListener('mousemove', _onMouseMove);
		if (canvas && _onMouseLeave) canvas.removeEventListener('mouseleave', _onMouseLeave);
		if (tooltipEl) tooltipEl.style.display = 'none';
		var wrap = document.getElementById('neuro-renderer-wrap');
		if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
		var holder = document.getElementById('nodeHolder');
		if (holder) holder.style.display = '';
		gl = null;
		canvas = null;
		program = null;
		neuronCount = 0;
		brightnessData = null;
		neuronPositions = null;
		sectionBounds = [];
		posBuffer = null;
		colorBuffer = null;
		brightnessBuffer = null;
		labelContainer = null;
	}

	function isActive() {
		return active;
	}

	function buildShaders() {
		var vertSrc = [
			'#version 300 es',
			'in vec2 a_position;',
			'in vec3 a_color;',
			'in float a_brightness;',
			'uniform vec2 u_resolution;',
			'out vec3 v_color;',
			'out float v_brightness;',
			'void main() {',
			'    vec2 clipPos = (a_position / u_resolution) * 2.0 - 1.0;',
			'    clipPos.y = -clipPos.y;',
			'    gl_Position = vec4(clipPos, 0.0, 1.0);',
			'    gl_PointSize = 2.0;',
			'    v_color = a_color;',
			'    v_brightness = a_brightness;',
			'}'
		].join('\n');

		var fragSrc = [
			'#version 300 es',
			'precision mediump float;',
			'in vec3 v_color;',
			'in float v_brightness;',
			'out vec4 fragColor;',
			'void main() {',
			'    float b = 0.15 + v_brightness * 0.85;',
			'    fragColor = vec4(v_color * b, 1.0);',
			'}'
		].join('\n');

		var vs = gl.createShader(gl.VERTEX_SHADER);
		gl.shaderSource(vs, vertSrc);
		gl.compileShader(vs);
		if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
			console.warn('VS compile:', gl.getShaderInfoLog(vs));
			program = null;
			return;
		}

		var fs = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(fs, fragSrc);
		gl.compileShader(fs);
		if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
			console.warn('FS compile:', gl.getShaderInfoLog(fs));
			program = null;
			return;
		}

		program = gl.createProgram();
		gl.attachShader(program, vs);
		gl.attachShader(program, fs);
		gl.linkProgram(program);
		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.warn('Link:', gl.getProgramInfoLog(program));
			program = null;
			return;
		}

		program.a_position = gl.getAttribLocation(program, 'a_position');
		program.a_color = gl.getAttribLocation(program, 'a_color');
		program.a_brightness = gl.getAttribLocation(program, 'a_brightness');
		program.u_resolution = gl.getUniformLocation(program, 'u_resolution');
	}

	function buildLayout() {
		var regionType = BRAIN.workerRegionType;
		var regionNeurons = [[], [], [], []];
		for (var i = 0; i < neuronCount; i++) {
			regionNeurons[regionType[i]].push(i);
		}

		var W = canvas.width;
		var usableW = W - PAD * 2;
		cols = Math.max(1, Math.floor(usableW / POINT_SIZE));

		neuronPositions = new Float32Array(neuronCount * 2);
		var posData = new Float32Array(neuronCount * 2);
		var colorData = new Float32Array(neuronCount * 3);
		var cursorY = 0;
		sectionBounds = [];

		for (var r = 0; r < 4; r++) {
			var neurons = regionNeurons[r];
			if (neurons.length === 0) {
				sectionBounds.push({y0: cursorY, y1: cursorY, region: r, neuronIndices: []});
				continue;
			}
			var sectionY0 = cursorY;
			cursorY += SECTION_GAP;
			var rowCount = Math.ceil(neurons.length / cols);
			for (var j = 0; j < neurons.length; j++) {
				var nIdx = neurons[j];
				var c = j % cols;
				var row = Math.floor(j / cols);
				var px = PAD + c * POINT_SIZE + POINT_SIZE * 0.5;
				var py = cursorY + row * POINT_SIZE + POINT_SIZE * 0.5;
				posData[nIdx * 2] = px;
				posData[nIdx * 2 + 1] = py;
				neuronPositions[nIdx * 2] = px;
				neuronPositions[nIdx * 2 + 1] = py;
				var rgb = REGION_COLORS[r];
				colorData[nIdx * 3] = rgb[0];
				colorData[nIdx * 3 + 1] = rgb[1];
				colorData[nIdx * 3 + 2] = rgb[2];
			}
			cursorY += rowCount * POINT_SIZE + 2;
			sectionBounds.push({y0: sectionY0, y1: cursorY, region: r, neuronIndices: neurons});
		}

		canvas.height = Math.ceil(cursorY);
		gl.viewport(0, 0, canvas.width, canvas.height);

		posBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW);

		colorBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.STATIC_DRAW);

		brightnessData = new Float32Array(neuronCount);
		brightnessBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, brightnessData, gl.DYNAMIC_DRAW);
	}

	function buildLabels() {
		labelContainer.innerHTML = '';
		for (var r = 0; r < 4; r++) {
			if (sectionBounds[r].neuronIndices.length === 0) continue;
			var div = document.createElement('div');
			div.style.cssText = 'position:absolute;left:4px;top:' + sectionBounds[r].y0 + 'px;font-size:0.6rem;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;padding:0.15rem 0.3rem;border-radius:3px;font-family:system-ui,-apple-system,sans-serif;color:' + LABEL_COLORS[r] + ';background:' + LABEL_BGS[r] + ';';
			div.textContent = SECTION_NAMES[r];
			labelContainer.appendChild(div);
		}
	}

	function renderLoop() {
		if (!active) return;

		var fire = BRAIN.latestFireState;
		if (fire && fire.length >= neuronCount) {
			for (var i = 0; i < neuronCount; i++) {
				brightnessData[i] = fire[i] ? 1.0 : 0.0;
			}
		} else {
			for (var i = 0; i < neuronCount; i++) {
				brightnessData[i] = 0.0;
			}
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer);
		gl.bufferSubData(gl.ARRAY_BUFFER, 0, brightnessData);

		gl.clearColor(0.086, 0.129, 0.243, 1.0);
		gl.clear(gl.COLOR_BUFFER_BIT);

		gl.useProgram(program);
		gl.uniform2f(program.u_resolution, canvas.width, canvas.height);

		gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
		gl.enableVertexAttribArray(program.a_position);
		gl.vertexAttribPointer(program.a_position, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
		gl.enableVertexAttribArray(program.a_color);
		gl.vertexAttribPointer(program.a_color, 3, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer);
		gl.enableVertexAttribArray(program.a_brightness);
		gl.vertexAttribPointer(program.a_brightness, 1, gl.FLOAT, false, 0, 0);

		gl.drawArrays(gl.POINTS, 0, neuronCount);

		animFrameId = requestAnimationFrame(renderLoop);
	}

	function onMouseMove(e) {
		var rect = canvas.getBoundingClientRect();
		var mx = e.clientX - rect.left;
		var scrollTop = canvas.parentElement.scrollTop;
		var canvasY = (e.clientY - rect.top) + scrollTop;

		var bounds = null;
		for (var r = 0; r < 4; r++) {
			if (canvasY >= sectionBounds[r].y0 && canvasY < sectionBounds[r].y1 && sectionBounds[r].neuronIndices.length > 0) {
				bounds = sectionBounds[r];
				break;
			}
		}
		if (!bounds) {
			if (tooltipEl) tooltipEl.style.display = 'none';
			return;
		}

		var neurons = bounds.neuronIndices;
		var sectionTopY = bounds.y0 + SECTION_GAP;
		var approxRow = Math.floor((canvasY - sectionTopY) / POINT_SIZE);
		var approxCol = Math.floor((mx - PAD) / POINT_SIZE);
		var maxRow = Math.ceil(neurons.length / cols) - 1;
		if (approxRow < 0) approxRow = 0;
		if (approxRow > maxRow) approxRow = maxRow;
		if (approxCol < 0) approxCol = 0;
		if (approxCol >= cols) approxCol = cols - 1;

		var bestDist = PICK_RADIUS_SQ;
		var bestIdx = -1;
		for (var dr = -1; dr <= 1; dr++) {
			for (var dc = -1; dc <= 1; dc++) {
				var checkRow = approxRow + dr;
				var checkCol = approxCol + dc;
				if (checkRow < 0 || checkRow > maxRow || checkCol < 0 || checkCol >= cols) continue;
				var j = checkRow * cols + checkCol;
				if (j >= neurons.length) continue;
				var nIdx = neurons[j];
				var dx = neuronPositions[nIdx * 2] - mx;
				var dy = neuronPositions[nIdx * 2 + 1] - canvasY;
				var dist = dx * dx + dy * dy;
				if (dist < bestDist) {
					bestDist = dist;
					bestIdx = nIdx;
				}
			}
		}

		if (bestIdx === -1) {
			if (tooltipEl) tooltipEl.style.display = 'none';
			return;
		}

		var gid = BRAIN.workerGroupIdArr[bestIdx];
		var groupName = BRAIN.workerGroupIdToName[gid] || ('group_' + gid);
		var desc = (typeof neuronDescriptions !== 'undefined' && neuronDescriptions[groupName]) ? neuronDescriptions[groupName] : groupName.replace(/_/g, ' ');
		tooltipEl.textContent = desc;
		tooltipEl.style.display = 'block';
		tooltipEl.style.left = (e.clientX + 10) + 'px';
		tooltipEl.style.bottom = (window.innerHeight - e.clientY + 10) + 'px';
		tooltipEl.style.top = 'auto';
	}

	function onMouseLeave(e) {
		if (tooltipEl) tooltipEl.style.display = 'none';
	}

	window.NeuroRenderer = { init: init, destroy: destroy, isActive: isActive };
})();
