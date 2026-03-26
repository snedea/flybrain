#!/usr/bin/env node
// Node.js test runner for FlyBrain.
// Loads all scripts into the V8 global context (simulating browser <script> tags)
// then calls runAllTests().
var fs = require('fs');
var vm = require('vm');
var path = require('path');

var root = path.join(__dirname, '..');
var files = [
	'js/constants.js',
	'js/connectome.js',
	'js/fly-logic.js',
	'tests/tests.js',
];

for (var i = 0; i < files.length; i++) {
	var filePath = path.join(root, files[i]);
	var code = fs.readFileSync(filePath, 'utf8');
	vm.runInThisContext(code, { filename: files[i] });
}

runAllTests();
