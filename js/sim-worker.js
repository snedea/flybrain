/* LIF neuron simulator Web Worker — T7.3
 *
 * Leaky integrate-and-fire simulation over the full Drosophila connectome.
 * Receives a binary connectome ArrayBuffer (optionally gzipped) on init.
 *
 * Binary format (little-endian):
 *   Header:   2 × uint32  — neuron_count, edge_count
 *   Edges:    edge_count × (uint32 pre, uint32 post, float32 weight), sorted by pre
 *   Metadata: neuron_count × (uint8 region_type, uint16 group_id)
 *
 * Message protocol:
 *   Main → Worker: init, start, stop, stimulate, setParams
 *   Worker → Main: ready, tick, error
 */

/* ---------- constants ---------- */
var DEFAULT_LEAK_RATE = 0.95;
var DEFAULT_THRESHOLD = 1.0;
var DEFAULT_REFRACTORY_PERIOD = 3;
var WEIGHT_SCALE = 0.15;

/* ---------- module-level state ---------- */
var N = 0;
var edgeCount = 0;
var V = null;
var fired = null;
var refractory = null;
var rowPtr = null;
var colIdx = null;
var values = null;
var regionType = null;
var groupId = null;
var leakRate = DEFAULT_LEAK_RATE;
var threshold = DEFAULT_THRESHOLD;
var refractoryPeriod = DEFAULT_REFRACTORY_PERIOD;
var running = false;
var sustainedIndices = null;
var sustainedIntensities = null;
var tickCount = 0;

/* ---------- decompressGzip ---------- */

async function decompressGzip(buffer) {
	var ds = new DecompressionStream('gzip');
	var writer = ds.writable.getWriter();
	writer.write(new Uint8Array(buffer));
	writer.close();
	var reader = ds.readable.getReader();
	var chunks = [];
	while (true) {
		var result = await reader.read();
		if (result.done) break;
		chunks.push(result.value);
	}
	var totalLen = 0;
	for (var c = 0; c < chunks.length; c++) {
		totalLen += chunks[c].byteLength;
	}
	var out = new Uint8Array(totalLen);
	var offset = 0;
	for (var c = 0; c < chunks.length; c++) {
		out.set(chunks[c], offset);
		offset += chunks[c].byteLength;
	}
	return out.buffer;
}

/* ---------- parseBinary ---------- */

function parseBinary(buffer) {
	var view = new DataView(buffer);
	N = view.getUint32(0, true);
	edgeCount = view.getUint32(4, true);

	var edgeOffset = 8;
	var metaOffset = edgeOffset + edgeCount * 12;

	/* allocate CSR arrays */
	rowPtr = new Uint32Array(N + 1);
	colIdx = new Uint32Array(edgeCount);
	values = new Float32Array(edgeCount);

	/* first pass — count outgoing edges per neuron */
	for (var e = 0; e < edgeCount; e++) {
		var pre = view.getUint32(edgeOffset + e * 12, true);
		rowPtr[pre + 1]++;
	}

	/* prefix sum — convert counts to cumulative offsets */
	for (var i = 1; i <= N; i++) {
		rowPtr[i] += rowPtr[i - 1];
	}

	/* second pass — fill colIdx, values, find maxAbsWeight */
	var maxAbsW = 0;
	for (var e = 0; e < edgeCount; e++) {
		var base = edgeOffset + e * 12;
		colIdx[e] = view.getUint32(base + 4, true);
		var rawW = view.getFloat32(base + 8, true);
		values[e] = rawW;
		var absW = rawW < 0 ? -rawW : rawW;
		if (absW > maxAbsW) maxAbsW = absW;
	}

	/* normalize weights */
	if (maxAbsW > 0) {
		for (var e = 0; e < edgeCount; e++) {
			values[e] = (values[e] / maxAbsW) * WEIGHT_SCALE;
		}
	}

	/* read per-neuron metadata */
	regionType = new Uint8Array(N);
	groupId = new Uint16Array(N);
	for (var i = 0; i < N; i++) {
		regionType[i] = view.getUint8(metaOffset + i * 3);
		groupId[i] = view.getUint16(metaOffset + i * 3 + 1, true);
	}

	/* allocate simulation state */
	V = new Float32Array(N);
	fired = new Uint8Array(N);
	refractory = new Uint8Array(N);
	tickCount = 0;
}

/* ---------- tick ---------- */

function tick() {
	var t0 = performance.now();

	/* step 1 — decay V and decrement refractory */
	for (var i = 0; i < N; i++) {
		if (refractory[i] > 0) {
			refractory[i]--;
			V[i] = 0;
		} else {
			V[i] *= leakRate;
		}
	}

	/* step 1.5 — apply sustained external stimulation */
	if (sustainedIndices) {
		for (var k = 0; k < sustainedIndices.length; k++) {
			var si = sustainedIndices[k];
			if (si < N && refractory[si] === 0) {
				V[si] += sustainedIntensities[k];
			}
		}
	}

	/* step 2 — propagate from fired neurons */
	for (var i = 0; i < N; i++) {
		if (fired[i] === 0) continue;
		for (var j = rowPtr[i]; j < rowPtr[i + 1]; j++) {
			V[colIdx[j]] += values[j];
		}
	}

	/* step 3 — clear fired, check threshold, set new fire state */
	fired.fill(0);
	for (var i = 0; i < N; i++) {
		if (refractory[i] === 0 && V[i] >= threshold) {
			fired[i] = 1;
			V[i] = 0;
			refractory[i] = refractoryPeriod;
		}
	}

	/* post fire state to main thread (structured clone, not transfer) */
	self.postMessage({type: 'tick', fireState: fired, tickCount: tickCount});
	tickCount++;

	/* schedule next tick */
	if (running) setTimeout(tick, 0);
}

/* ---------- message handler ---------- */

self.onmessage = function (e) {
	switch (e.data.type) {

	case 'init':
		try {
			var buffer = e.data.buffer;

			function postReady() {
				self.postMessage({type: 'ready', neuronCount: N, edgeCount: edgeCount, groupId: groupId});
			}

			var header = new Uint8Array(buffer, 0, 2);
			if (header[0] === 0x1f && header[1] === 0x8b) {
				decompressGzip(buffer).then(function (raw) {
					parseBinary(raw);
					postReady();
				}).catch(function (err) {
					self.postMessage({type: 'error', message: 'Decompression failed: ' + err.message});
				});
				return;
			}

			parseBinary(buffer);
			postReady();
		} catch (err) {
			self.postMessage({type: 'error', message: 'Init failed: ' + err.message});
		}
		break;

	case 'start':
		if (N === 0) {
			self.postMessage({type: 'error', message: 'Cannot start: not initialized'});
			return;
		}
		running = true;
		setTimeout(tick, 0);
		break;

	case 'stop':
		running = false;
		break;

	case 'stimulate':
		var indices = e.data.indices;
		var intensities = e.data.intensities;
		for (var k = 0; k < indices.length; k++) {
			var idx = indices[k];
			if (idx < N) {
				V[idx] += intensities[k];
			}
		}
		break;

	case 'setStimulusState':
		sustainedIndices = e.data.indices;
		sustainedIntensities = e.data.intensities;
		break;

	case 'setParams':
		if (e.data.leakRate !== undefined) leakRate = e.data.leakRate;
		if (e.data.threshold !== undefined) threshold = e.data.threshold;
		if (e.data.refractoryPeriod !== undefined) refractoryPeriod = e.data.refractoryPeriod;
		break;
	}
};
