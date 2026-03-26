# Plan: D18.2

## Summary

Two related data-consistency fixes across three files:

1. **Add 3 orphaned neuron groups** (NOCI, GNG_DESC, CLOCK_DN) to brain3d.js REGION_DEFS and education.js EDUCATION_REGIONS — they exist in the connectome and fire during simulation but are absent from the 3D brain and education panel.

2. **Fix type classification mismatches** in connectome.js BRAIN.neuronRegions — ANTENNAL_MECH is listed as 'central' but should be 'sensory'; DN_WALK, DN_FLIGHT, DN_TURN, DN_BACKUP, DN_STARTLE, VNC_CPG are listed as 'central' but should be 'motor'. The brain3d.js and education.js already have the correct classifications; only connectome.js needs updating.

After these changes, all three files will be consistent and the education panel's "59 functional neuron groups" claim will match reality (currently only 56 are described in its region sections).

## Dependencies
- list: none
- commands: none

## File Operations (in execution order)

### 1. MODIFY js/connectome.js
- operation: MODIFY
- reason: Fix ANTENNAL_MECH and DN_*/VNC_CPG type classifications in BRAIN.neuronRegions to match the neuroscientifically accurate categorization already used by brain3d.js and education.js

#### Change A: Move ANTENNAL_MECH from central to sensory
- anchor: `'THERMO_WARM', 'THERMO_COOL',`
- In the `sensory` array (lines 101-108), add `'ANTENNAL_MECH'` after `'THERMO_COOL',` and before the closing `],`

Replace this exact block (lines 101-108):
```js
	sensory: [
		'VIS_R1R6', 'VIS_R7R8', 'VIS_ME', 'VIS_LO', 'VIS_LC', 'VIS_LPTC',
		'OLF_ORN_FOOD', 'OLF_ORN_DANGER', 'OLF_LN', 'OLF_PN',
		'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER',
		'MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD',
		'THERMO_WARM', 'THERMO_COOL',
		'NOCI',
	],
```

With:
```js
	sensory: [
		'VIS_R1R6', 'VIS_R7R8', 'VIS_ME', 'VIS_LO', 'VIS_LC', 'VIS_LPTC',
		'OLF_ORN_FOOD', 'OLF_ORN_DANGER', 'OLF_LN', 'OLF_PN',
		'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER',
		'MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD', 'ANTENNAL_MECH',
		'THERMO_WARM', 'THERMO_COOL',
		'NOCI',
	],
```

Note: ANTENNAL_MECH is moved to the sensory array alongside other MECH_* neurons for logical grouping.

#### Change B: Remove ANTENNAL_MECH, DN_*, and VNC_CPG from central; move DN_*/VNC_CPG to motor
- anchor: `'ANTENNAL_MECH', 'GNG_DESC',`

Replace this exact block (lines 109-117):
```js
	central: [
		'MB_KC', 'MB_APL', 'MB_MBON_APP', 'MB_MBON_AV', 'MB_DAN_REW', 'MB_DAN_PUN',
		'LH_APP', 'LH_AV',
		'CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA',
		'SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER',
		'ANTENNAL_MECH', 'GNG_DESC',
		'DN_WALK', 'DN_FLIGHT', 'DN_TURN', 'DN_BACKUP', 'DN_STARTLE',
		'VNC_CPG', 'CLOCK_DN',
	],
```

With:
```js
	central: [
		'MB_KC', 'MB_APL', 'MB_MBON_APP', 'MB_MBON_AV', 'MB_DAN_REW', 'MB_DAN_PUN',
		'LH_APP', 'LH_AV',
		'CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA',
		'SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER',
		'GNG_DESC', 'CLOCK_DN',
	],
```

Note: ANTENNAL_MECH removed (moved to sensory above). DN_WALK, DN_FLIGHT, DN_TURN, DN_BACKUP, DN_STARTLE, VNC_CPG removed (will be added to motor below). GNG_DESC and CLOCK_DN remain in central (correct classification).

#### Change C: Add DN_* and VNC_CPG to the motor array
- anchor: `'MN_PROBOSCIS', 'MN_HEAD', 'MN_ABDOMEN',`

Replace this exact block (lines 122-128):
```js
	motor: [
		'MN_LEG_L1', 'MN_LEG_R1', 'MN_LEG_L2', 'MN_LEG_R2',
		'MN_LEG_L3', 'MN_LEG_R3',
		'MN_WING_L', 'MN_WING_R',
		'MN_PROBOSCIS', 'MN_HEAD', 'MN_ABDOMEN',
	],
```

With:
```js
	motor: [
		'DN_WALK', 'DN_FLIGHT', 'DN_TURN', 'DN_BACKUP', 'DN_STARTLE',
		'VNC_CPG',
		'MN_LEG_L1', 'MN_LEG_R1', 'MN_LEG_L2', 'MN_LEG_R2',
		'MN_LEG_L3', 'MN_LEG_R3',
		'MN_WING_L', 'MN_WING_R',
		'MN_PROBOSCIS', 'MN_HEAD', 'MN_ABDOMEN',
	],
```

Note: DN_* and VNC_CPG are placed before the MN_* entries for logical grouping (descending neurons, then central pattern generator, then motor neurons).

### 2. MODIFY js/brain3d.js
- operation: MODIFY
- reason: Add 3 orphaned neuron groups (NOCI, GNG_DESC, CLOCK_DN) to their appropriate REGION_DEFS entries

#### Change A: Add NOCI to Mechanosensory region
- anchor: `neurons: ['MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD', 'ANTENNAL_MECH'],`
- This is the neurons array in the Mechanosensory REGION_DEFS entry (line 104)

Replace:
```js
        neurons: ['MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD', 'ANTENNAL_MECH'],
```

With:
```js
        neurons: ['MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD', 'ANTENNAL_MECH', 'NOCI'],
```

#### Change B: Add GNG_DESC to Subesophageal Zone region
- anchor: `neurons: ['SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER', 'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER'],`
- This is the neurons array in the Subesophageal Zone REGION_DEFS entry (line 76)

Replace:
```js
        neurons: ['SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER', 'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER'],
```

With:
```js
        neurons: ['SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER', 'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER', 'GNG_DESC'],
```

#### Change C: Add CLOCK_DN to Central Complex region
- anchor: `neurons: ['CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA'],`
- This is the neurons array in the Central Complex REGION_DEFS entry (line 57)

Replace:
```js
        neurons: ['CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA'],
```

With:
```js
        neurons: ['CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA', 'CLOCK_DN'],
```

### 3. MODIFY js/education.js
- operation: MODIFY
- reason: Add 3 orphaned neuron groups (NOCI, GNG_DESC, CLOCK_DN) to their appropriate EDUCATION_REGIONS entries, matching the brain3d.js changes

#### Change A: Add NOCI to Mechanosensory region
- anchor: `neurons: ['MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD', 'ANTENNAL_MECH'],`
- This is the neurons array in the Mechanosensory EDUCATION_REGIONS entry (line 87)

Replace:
```js
            neurons: ['MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD', 'ANTENNAL_MECH'],
```

With:
```js
            neurons: ['MECH_BRISTLE', 'MECH_JO', 'MECH_CHORD', 'ANTENNAL_MECH', 'NOCI'],
```

#### Change B: Add GNG_DESC to Subesophageal Zone region
- anchor: `neurons: ['SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER', 'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER'],`
- This is the neurons array in the Subesophageal Zone EDUCATION_REGIONS entry (line 56)

Replace:
```js
            neurons: ['SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER', 'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER'],
```

With:
```js
            neurons: ['SEZ_FEED', 'SEZ_GROOM', 'SEZ_WATER', 'GUS_GRN_SWEET', 'GUS_GRN_BITTER', 'GUS_GRN_WATER', 'GNG_DESC'],
```

#### Change C: Add CLOCK_DN to Central Complex region
- anchor: `neurons: ['CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA'],`
- This is the neurons array in the Central Complex EDUCATION_REGIONS entry (line 36)

Replace:
```js
            neurons: ['CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA'],
```

With:
```js
            neurons: ['CX_EPG', 'CX_PFN', 'CX_FC', 'CX_HDELTA', 'CLOCK_DN'],
```

## Verification

- build: No build step — vanilla JS loaded via script tags
- lint: No linter configured
- test: No existing test suite
- smoke: After all edits, run the following verification script to confirm data consistency:

```bash
node -e "
// Load files and verify consistency
var fs = require('fs');

var connectomeSrc = fs.readFileSync('js/connectome.js', 'utf8');
var brain3dSrc = fs.readFileSync('js/brain3d.js', 'utf8');
var educationSrc = fs.readFileSync('js/education.js', 'utf8');

// 1. Verify ANTENNAL_MECH is in sensory, not central in connectome.js
var sensoryMatch = connectomeSrc.match(/sensory:\s*\[([\s\S]*?)\]/);
var centralMatch = connectomeSrc.match(/central:\s*\[([\s\S]*?)\]/);
var motorMatch = connectomeSrc.match(/motor:\s*\[([\s\S]*?)\]/);

var sensoryStr = sensoryMatch[1];
var centralStr = centralMatch[1];
var motorStr = motorMatch[1];

// Check ANTENNAL_MECH moved to sensory
console.assert(sensoryStr.includes('ANTENNAL_MECH'), 'FAIL: ANTENNAL_MECH not in sensory');
console.assert(!centralStr.includes('ANTENNAL_MECH'), 'FAIL: ANTENNAL_MECH still in central');

// Check DN_*/VNC_CPG moved to motor
var motorNeurons = ['DN_WALK', 'DN_FLIGHT', 'DN_TURN', 'DN_BACKUP', 'DN_STARTLE', 'VNC_CPG'];
motorNeurons.forEach(function(n) {
  console.assert(motorStr.includes(n), 'FAIL: ' + n + ' not in motor');
  console.assert(!centralStr.includes(n), 'FAIL: ' + n + ' still in central');
});

// Check GNG_DESC and CLOCK_DN remain in central
console.assert(centralStr.includes('GNG_DESC'), 'FAIL: GNG_DESC not in central');
console.assert(centralStr.includes('CLOCK_DN'), 'FAIL: CLOCK_DN not in central');

// 2. Verify orphaned neurons added to brain3d.js
console.assert(brain3dSrc.includes(\"'NOCI'\"), 'FAIL: NOCI not in brain3d.js');
console.assert(brain3dSrc.includes(\"'GNG_DESC'\"), 'FAIL: GNG_DESC not in brain3d.js');
console.assert(brain3dSrc.includes(\"'CLOCK_DN'\"), 'FAIL: CLOCK_DN not in brain3d.js');

// 3. Verify orphaned neurons added to education.js
console.assert(educationSrc.includes(\"'NOCI'\"), 'FAIL: NOCI not in education.js');
console.assert(educationSrc.includes(\"'GNG_DESC'\"), 'FAIL: GNG_DESC not in education.js');
console.assert(educationSrc.includes(\"'CLOCK_DN'\"), 'FAIL: CLOCK_DN not in education.js');

// 4. Count total neuron groups in connectome.js neuronRegions
var allNeurons = [];
[sensoryStr, centralStr, motorStr].forEach(function(s) {
  var matches = s.match(/'([A-Z_0-9]+)'/g);
  if (matches) allNeurons = allNeurons.concat(matches.map(function(m) { return m.replace(/'/g, ''); }));
});
// Add drives
var drivesMatch = connectomeSrc.match(/drives:\s*\[([\s\S]*?)\]/);
var drivesMatches = drivesMatch[1].match(/'([A-Z_0-9]+)'/g);
if (drivesMatches) allNeurons = allNeurons.concat(drivesMatches.map(function(m) { return m.replace(/'/g, ''); }));

console.assert(allNeurons.length === 59, 'FAIL: Expected 59 neuron groups in neuronRegions, got ' + allNeurons.length);

console.log('All verification checks passed. Total neuron groups: ' + allNeurons.length);
"
```

## Constraints
- Do NOT modify the neuronPopulations object in main.js — it is correct as-is
- Do NOT modify the education panel intro text ("59 functional neuron groups") — it will become correct after adding the 3 orphaned neurons
- Do NOT add new REGION_DEFS entries or EDUCATION_REGIONS entries — only append neurons to existing region entries
- Do NOT change meshDefs, descriptions, explanations, analogies, or interactions in brain3d.js or education.js
- Do NOT change any connection weights, firing logic, or simulation behavior in connectome.js
- Do NOT modify index.html, main.js, or css/main.css
- NOCI must go in the Mechanosensory region (not a new region)
- GNG_DESC must go in the Subesophageal Zone region (not a new region)
- CLOCK_DN must go in the Central Complex region (not Drives)
- The drives array in connectome.js neuronRegions must NOT be modified
