#!/usr/bin/env node
// Node.js test runner for FlyBrain.
// Loads all scripts into the V8 global context (simulating browser <script> tags)
// then calls runAllTests().
var fs = require('fs');
var vm = require('vm');
var path = require('path');

var root = path.join(__dirname, '..');

// Phase 1: Load base modules (constants + connectome define BRAIN object)
var baseFiles = [
	'js/constants.js',
	'js/connectome.js',
];
for (var i = 0; i < baseFiles.length; i++) {
	var filePath = path.join(root, baseFiles[i]);
	var code = fs.readFileSync(filePath, 'utf8');
	vm.runInThisContext(code, { filename: baseFiles[i] });
}

// Phase 2: Enable test mode before loading the worker bridge IIFE.
// This prevents initBridge() from running (no DOM/fetch/Worker in Node)
// and exposes internal functions via BRAIN._bridge for testing.
BRAIN._testMode = true;

// Phase 3: Load bridge, logic, and tests
var moreFiles = [
	'js/brain-worker-bridge.js',
	'js/fly-logic.js',
	'tests/tests.js',
];
for (var i = 0; i < moreFiles.length; i++) {
	var filePath = path.join(root, moreFiles[i]);
	var code = fs.readFileSync(filePath, 'utf8');
	vm.runInThisContext(code, { filename: moreFiles[i] });
}

runAllTests();
