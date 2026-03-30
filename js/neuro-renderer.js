/* neuro-renderer.js — T7.5
 *
 * WebGL2 renderer that draws 139K neurons as GL_POINTS in the left sidebar.
 * Brightness is driven by the same postSynaptic group activity that powers the
 * DOM "Groups" view, with raw worker fire-state spikes layered on top so the
 * two views stay semantically aligned while the 139K view keeps per-neuron
 * flicker detail.
 */
(function () {
	'use strict';

	var REGION_COLORS = [
		[0.231, 0.510, 0.965],  // region_type 0 = sensory: #3b82f6
		[0.545, 0.361, 0.965],  // region_type 1 = central: #8b5cf6
		[0.961, 0.620, 0.043],  // region_type 2 = drives:  #f59e0b
		[0.937, 0.267, 0.267]   // region_type 3 = motor:   #ef4444
	];
	var POINT_SIZE = 1.0;
	var MIN_SECTION_W = 60;        // minimum canvas-pixel width for tiny sections
	var MAX_SMALL_PS = 12;         // cap point size for tiny sections
	var SECTION_GAP = 16;
	var PAD = 2;
	var PICK_RADIUS_SQ = 16;
	var BRIGHTNESS_DECAY = 0.82;   // per-frame decay for interpolation at 10Hz tick rate
	var GROUP_PANEL_FULL_SCALE = 50; // Match main.js DOM group opacity normalization.
	var SECTION_NAMES = ['Sensory', 'Central', 'Drives', 'Motor'];
	var LABEL_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444'];
	var LABEL_BGS = ['rgba(59,130,246,0.1)', 'rgba(139,92,246,0.1)', 'rgba(245,158,11,0.1)', 'rgba(239,68,68,0.1)'];
	var liteMode = false;
	var liteSkipCount = 0;

	var canvas = null;
	var gl = null;
	var program = null;
	var posBuffer = null;
	var colorBuffer = null;
	var brightnessBuffer = null;
	var pointSizeBuffer = null;
	var brightnessData = null;     // Float32Array(neuronCount)
	var groupBrightnessData = null;
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
	var _resizeObserver = null;
	var displayScale = 1;          // CSS width / canvas pixel width for fill-stretching

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
		groupBrightnessData = new Float32Array((BRAIN.workerGroupIdToName && BRAIN.workerGroupIdToName.length) || 0);

		tooltipEl = document.getElementById('neuronTooltip');

		_onMouseMove = onMouseMove;
		canvas.addEventListener('mousemove', _onMouseMove);
		_onMouseLeave = onMouseLeave;
		canvas.addEventListener('mouseleave', _onMouseLeave);

		_resizeObserver = new ResizeObserver(function () { handleResize(); });
		_resizeObserver.observe(wrap);

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
		if (_resizeObserver) {
			_resizeObserver.disconnect();
			_resizeObserver = null;
		}
		if (gl) {
			if (posBuffer) gl.deleteBuffer(posBuffer);
			if (colorBuffer) gl.deleteBuffer(colorBuffer);
			if (brightnessBuffer) gl.deleteBuffer(brightnessBuffer);
			if (pointSizeBuffer) gl.deleteBuffer(pointSizeBuffer);
			if (program) gl.deleteProgram(program);
		}
		var wrap = document.getElementById('neuro-renderer-wrap');
		if (wrap && wrap.parentNode) wrap.parentNode.removeChild(wrap);
		var holder = document.getElementById('nodeHolder');
		if (holder) holder.style.display = '';
		gl = null;
		canvas = null;
		program = null;
		neuronCount = 0;
		brightnessData = null;
		groupBrightnessData = null;
		neuronPositions = null;
		sectionBounds = [];
		posBuffer = null;
		colorBuffer = null;
		brightnessBuffer = null;
		pointSizeBuffer = null;
		labelContainer = null;
		displayScale = 1;
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
			'in float a_pointSize;',
			'uniform vec2 u_resolution;',
			'out vec3 v_color;',
			'out float v_brightness;',
			'void main() {',
			'    vec2 clipPos = (a_position / u_resolution) * 2.0 - 1.0;',
			'    clipPos.y = -clipPos.y;',
			'    gl_Position = vec4(clipPos, 0.0, 1.0);',
			'    gl_PointSize = a_pointSize;',
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
		program.a_pointSize = gl.getAttribLocation(program, 'a_pointSize');
		program.u_resolution = gl.getUniformLocation(program, 'u_resolution');
	}

	function computeSectionLayout(regionCounts, containerW, containerH, pointSize, minSectionW, maxSmallPS, sectionGap, pad) {
		var usableH = containerH - sectionGap - pad;
		var rowsAvail = Math.max(1, Math.floor(usableH / pointSize));

		var totalNeurons = 0;
		for (var r = 0; r < regionCounts.length; r++) totalNeurons += regionCounts[r];
		var availableW = containerW - ((regionCounts.length - 1) * sectionGap);
		var minRowsForWidth = Math.ceil(totalNeurons * pointSize / Math.max(1, availableW));
		if (minRowsForWidth > rowsAvail) rowsAvail = minRowsForWidth;

		var sections = [];
		var cursorX = 0;

		for (var r = 0; r < regionCounts.length; r++) {
			var count = regionCounts[r];
			if (count === 0) {
				sections.push({x0: cursorX, x1: cursorX, sectionW: 0, pointSize: pointSize, localRows: rowsAvail, neuronCount: 0});
				continue;
			}

			var naturalW = Math.ceil(count / rowsAvail) * pointSize;
			var localPS = pointSize;
			var localRows = rowsAvail;
			if (naturalW < minSectionW) {
				localPS = Math.min(maxSmallPS, Math.sqrt(minSectionW * usableH / count));
				localPS = Math.max(pointSize, localPS);
				localRows = Math.max(1, Math.floor(usableH / localPS));
			}

			var sectionX0 = cursorX;
			var colsNeeded = Math.ceil(count / localRows);
			var sectionW = colsNeeded * localPS;

			cursorX += sectionW + sectionGap;
			sections.push({x0: sectionX0, x1: cursorX - sectionGap, sectionW: sectionW, pointSize: localPS, localRows: localRows, neuronCount: count});
		}

		var canvasWidth = Math.ceil(cursorX);
		var displayScaleVal = containerW / canvasWidth;

		return {sections: sections, canvasWidth: canvasWidth, canvasHeight: containerH, displayScale: displayScaleVal, rowsAvail: rowsAvail};
	}

	function buildLayout() {
		var regionType = BRAIN.workerRegionType;
		var regionNeurons = [[], [], [], []];
		for (var i = 0; i < neuronCount; i++) {
			regionNeurons[regionType[i]].push(i);
		}

		var wrap = canvas.parentElement;
		var wrapRect = wrap.getBoundingClientRect();
		var H = Math.floor(wrapRect.height) || 140;
		var W = Math.floor(wrapRect.width) || 800;

		var regionCounts = [regionNeurons[0].length, regionNeurons[1].length, regionNeurons[2].length, regionNeurons[3].length];
		var layout = computeSectionLayout(regionCounts, W, H, POINT_SIZE, MIN_SECTION_W, MAX_SMALL_PS, SECTION_GAP, PAD);

		neuronPositions = new Float32Array(neuronCount * 2);
		var posData = new Float32Array(neuronCount * 2);
		var colorData = new Float32Array(neuronCount * 3);
		var pointSizeData = new Float32Array(neuronCount);
		sectionBounds = [];

		for (var r = 0; r < 4; r++) {
			var neurons = regionNeurons[r];
			var sec = layout.sections[r];

			if (neurons.length === 0) {
				sectionBounds.push({x0: sec.x0, x1: sec.x1, y0: 0, y1: H, region: r, neuronIndices: [], pointSize: sec.pointSize, localRows: sec.localRows});
				continue;
			}

			var localPS = sec.pointSize;
			var localRows = sec.localRows;

			for (var j = 0; j < neurons.length; j++) {
				var nIdx = neurons[j];
				var col = Math.floor(j / localRows);
				var row = j % localRows;
				var px = sec.x0 + col * localPS + localPS * 0.5;
				var py = SECTION_GAP + row * localPS + localPS * 0.5;
				posData[nIdx * 2] = px;
				posData[nIdx * 2 + 1] = py;
				neuronPositions[nIdx * 2] = px;
				neuronPositions[nIdx * 2 + 1] = py;
				pointSizeData[nIdx] = localPS;
				var rgb = REGION_COLORS[r];
				colorData[nIdx * 3] = rgb[0];
				colorData[nIdx * 3 + 1] = rgb[1];
				colorData[nIdx * 3 + 2] = rgb[2];
			}
			sectionBounds.push({x0: sec.x0, x1: sec.x1, y0: 0, y1: H, region: r, neuronIndices: neurons, pointSize: localPS, localRows: localRows});
		}

		canvas.width = layout.canvasWidth;
		canvas.height = layout.canvasHeight;
		displayScale = layout.displayScale;
		gl.viewport(0, 0, canvas.width, canvas.height);

		canvas.style.width = W + 'px';

		if (posBuffer) gl.deleteBuffer(posBuffer);
		posBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, posData, gl.STATIC_DRAW);

		if (colorBuffer) gl.deleteBuffer(colorBuffer);
		colorBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, colorData, gl.STATIC_DRAW);

		brightnessData = new Float32Array(neuronCount);
		if (brightnessBuffer) gl.deleteBuffer(brightnessBuffer);
		brightnessBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, brightnessBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, brightnessData, gl.DYNAMIC_DRAW);

		if (pointSizeBuffer) gl.deleteBuffer(pointSizeBuffer);
		pointSizeBuffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, pointSizeBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, pointSizeData, gl.STATIC_DRAW);
	}

	function computeLabelMaxWidths(sectionBoundsArr, displayScaleVal) {
		var visible = [];
		for (var r = 0; r < sectionBoundsArr.length; r++) {
			if (sectionBoundsArr[r].neuronIndices ? sectionBoundsArr[r].neuronIndices.length > 0 : sectionBoundsArr[r].neuronCount > 0) {
				visible.push(r);
			}
		}
		var widths = [];
		for (var vi = 0; vi < visible.length; vi++) {
			var r = visible[vi];
			var leftPx = sectionBoundsArr[r].x0 * displayScaleVal;
			if (vi < visible.length - 1) {
				var nextLeft = sectionBoundsArr[visible[vi + 1]].x0 * displayScaleVal;
				widths.push({region: r, leftPx: leftPx, maxWidth: Math.max(20, nextLeft - leftPx - 4)});
			} else {
				widths.push({region: r, leftPx: leftPx, maxWidth: -1}); // -1 means uncapped
			}
		}
		return widths;
	}

	function buildLabels() {
		labelContainer.innerHTML = '';
		// Collect visible sections
		var visible = [];
		for (var r = 0; r < 4; r++) {
			if (sectionBounds[r].neuronIndices.length > 0) visible.push(r);
		}
		for (var vi = 0; vi < visible.length; vi++) {
			var r = visible[vi];
			var div = document.createElement('div');
			var leftPx = sectionBounds[r].x0 * displayScale;
			// Cap label width to space before next section so labels never overlap
			var maxWCss = '';
			if (vi < visible.length - 1) {
				var nextLeft = sectionBounds[visible[vi + 1]].x0 * displayScale;
				maxWCss = 'max-width:' + Math.max(20, nextLeft - leftPx - 4) + 'px;overflow:hidden;text-overflow:ellipsis;';
			}
			div.style.cssText = 'position:absolute;left:' + leftPx + 'px;top:0;box-sizing:border-box;white-space:nowrap;' + maxWCss + 'font-size:0.55rem;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;padding:0.1rem 0.25rem;border-radius:3px;font-family:system-ui,-apple-system,sans-serif;color:' + LABEL_COLORS[r] + ';background:' + LABEL_BGS[r] + ';';
			div.textContent = SECTION_NAMES[r] + ' (' + sectionBounds[r].neuronIndices.length.toLocaleString() + ')';
			div.title = SECTION_NAMES[r] + ' (' + sectionBounds[r].neuronIndices.length.toLocaleString() + ')';
			labelContainer.appendChild(div);
		}
	}

	function needsResize(canvasW, canvasH, curDisplayScale, newW, newH) {
		var oldDisplayW = Math.round(canvasW * curDisplayScale);
		if (newH !== canvasH) return true;
		if (Math.abs(newW - oldDisplayW) >= 2) return true;
		return false;
	}

	function handleResize() {
		if (!gl || !canvas || neuronCount === 0) return;
		var wrap = canvas.parentElement;
		if (!wrap) return;
		var rect = wrap.getBoundingClientRect();
		var newH = Math.floor(rect.height) || 140;
		var newW = Math.floor(rect.width) || 800;
		if (!needsResize(canvas.width, canvas.height, displayScale, newW, newH)) return;
		if (posBuffer) gl.deleteBuffer(posBuffer);
		if (colorBuffer) gl.deleteBuffer(colorBuffer);
		if (brightnessBuffer) gl.deleteBuffer(brightnessBuffer);
		if (pointSizeBuffer) gl.deleteBuffer(pointSizeBuffer);
		buildLayout();
		buildLabels();
	}

	function clamp01(val) {
		if (val <= 0) return 0;
		if (val >= 1) return 1;
		return val;
	}

	function normalizeGroupActivation(rawActivation) {
		if (!rawActivation || rawActivation <= 0) return 0;
		return clamp01(rawActivation / GROUP_PANEL_FULL_SCALE);
	}

	function computeBrightnessTarget(prevBrightness, fired, normalizedGroupBrightness) {
		var target = fired ? 1.0 : clamp01(normalizedGroupBrightness || 0);
		return Math.max(target, prevBrightness * BRIGHTNESS_DECAY);
	}

	function renderLoop() {
		if (!active) return;

		/* Interpolated brightness: raw spikes snap neurons to 1.0 while
		 * postSynaptic group activation keeps the 139K view aligned with the
		 * DOM Groups view. Decay smooths transitions between worker ticks. */
		var fire = BRAIN.latestFireState;
		var hasFire = !!(fire && fire.length >= neuronCount);
		var groupBrightness = null;
		var groupIdArr = BRAIN.workerGroupIdArr;
		var groupNames = BRAIN.workerGroupIdToName;
		if (groupIdArr && groupNames && BRAIN.postSynaptic) {
			if (!groupBrightnessData || groupBrightnessData.length !== groupNames.length) {
				groupBrightnessData = new Float32Array(groupNames.length);
			}
			groupBrightness = groupBrightnessData;
			for (var g = 0; g < groupNames.length; g++) {
				var gName = groupNames[g];
				groupBrightness[g] = (!gName || !BRAIN.postSynaptic[gName]) ? 0 :
					normalizeGroupActivation(BRAIN.postSynaptic[gName][BRAIN.thisState]);
			}
		}

		for (var i = 0; i < neuronCount; i++) {
			var groupActivation = 0;
			if (groupBrightness && groupIdArr && i < groupIdArr.length) {
				groupActivation = groupBrightness[groupIdArr[i]] || 0;
			}
			brightnessData[i] = computeBrightnessTarget(
				brightnessData[i],
				hasFire && !!fire[i],
				groupActivation
			);
		}

		/* Lite mode: skip GPU update when nothing is firing */
		var skipDraw = false;
		if (liteMode) {
			var maxB = 0;
			for (var i = 0; i < neuronCount; i++) {
				if (brightnessData[i] > maxB) maxB = brightnessData[i];
			}
			if (maxB < 0.01) {
				liteSkipCount++;
				/* Redraw every 30th frame even when idle to prevent stale state */
				if (liteSkipCount < 30) skipDraw = true;
			} else {
				liteSkipCount = 0;
			}
		}

		if (!skipDraw) {
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

			gl.bindBuffer(gl.ARRAY_BUFFER, pointSizeBuffer);
			gl.enableVertexAttribArray(program.a_pointSize);
			gl.vertexAttribPointer(program.a_pointSize, 1, gl.FLOAT, false, 0, 0);

			gl.drawArrays(gl.POINTS, 0, neuronCount);
		}

		animFrameId = requestAnimationFrame(renderLoop);
	}

	function cssToCanvasCoords(clientX, clientY, rectLeft, rectTop, rectWidth, rectHeight, canvasWidth, canvasHeight, scrollLeft) {
		var canvasX = ((clientX - rectLeft) + scrollLeft) * (canvasWidth / rectWidth);
		var canvasY = (clientY - rectTop) * (canvasHeight / rectHeight);
		return {x: canvasX, y: canvasY};
	}

	function onMouseMove(e) {
		var rect = canvas.getBoundingClientRect();
		var scrollLeft = canvas.parentElement.scrollLeft;
		// Convert CSS coords to canvas pixel coords (canvas is CSS-stretched to fill container)
		var canvasX = ((e.clientX - rect.left) + scrollLeft) * (canvas.width / rect.width);
		var canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);

		var bounds = null;
		for (var r = 0; r < 4; r++) {
			if (canvasX >= sectionBounds[r].x0 && canvasX < sectionBounds[r].x1 && sectionBounds[r].neuronIndices.length > 0) {
				bounds = sectionBounds[r];
				break;
			}
		}
		if (!bounds) {
			if (tooltipEl) tooltipEl.style.display = 'none';
			return;
		}

		// In horizontal layout, neurons are arranged in columns (col = j / localRows, row = j % localRows)
		var neurons = bounds.neuronIndices;
		var localPS = bounds.pointSize;
		var localRows = bounds.localRows;

		// Use raw position matching since the grid is column-major
		var bestDist = Math.max(PICK_RADIUS_SQ, localPS * localPS);
		var bestIdx = -1;
		var approxCol = Math.floor((canvasX - bounds.x0) / localPS);
		var approxRow = Math.floor((canvasY - SECTION_GAP) / localPS);
		for (var dc = -1; dc <= 1; dc++) {
			for (var dr = -1; dr <= 1; dr++) {
				var c = approxCol + dc;
				var r2 = approxRow + dr;
				if (c < 0 || r2 < 0 || r2 >= localRows) continue;
				var j = c * localRows + r2;
				if (j < 0 || j >= neurons.length) continue;
				var nIdx = neurons[j];
				var dx = neuronPositions[nIdx * 2] - canvasX;
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

	function setLiteMode(enabled) {
		liteMode = enabled;
		liteSkipCount = 0;
	}

	window.NeuroRenderer = { init: init, destroy: destroy, isActive: isActive, setLiteMode: setLiteMode };

	if (typeof BRAIN !== 'undefined' && BRAIN._testMode) {
		NeuroRenderer._test = {
			computeSectionLayout: computeSectionLayout,
			needsResize: needsResize,
			cssToCanvasCoords: cssToCanvasCoords,
			computeLabelMaxWidths: computeLabelMaxWidths,
			normalizeGroupActivation: normalizeGroupActivation,
			computeBrightnessTarget: computeBrightnessTarget,
			POINT_SIZE: POINT_SIZE,
			MIN_SECTION_W: MIN_SECTION_W,
			MAX_SMALL_PS: MAX_SMALL_PS,
			SECTION_GAP: SECTION_GAP,
			PAD: PAD,
			PICK_RADIUS_SQ: PICK_RADIUS_SQ,
			BRIGHTNESS_DECAY: BRIGHTNESS_DECAY,
			GROUP_PANEL_FULL_SCALE: GROUP_PANEL_FULL_SCALE
		};
	}
})();
