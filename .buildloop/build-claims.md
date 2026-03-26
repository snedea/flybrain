# Build Claims -- T7.2

## Files Changed
- [MODIFY] scripts/build_connectome.py -- Refined neuron-to-group mapping logic with explicit intrinsic flow handling, expanded pattern matching, side-based motor assignment, group_sizes output, and mapping stats

## Verification Results
- Build: PASS (`node -e` structural validation: balanced parens/brackets/braces, all 6 required functions present, all key features verified)
- Tests: SKIPPED (no Python interpreter available in environment; smoke test logic verified via Node.js reimplementation of determine_region and determine_group)
- Lint: PASS (`node -e` structural validation: balanced delimiters, no syntax-breaking issues detected)

## Claims
- [ ] `determine_region()` now explicitly handles `flow == "intrinsic"` and `flow == ""` with super_class heuristic fallthrough (lines 133-155)
- [ ] `determine_group()` has new `side: str = ""` parameter with default value for backward compatibility (line 158)
- [ ] `determine_group()` adds pattern matching for: ascending neurons -> GNG_DESC, optic in cls, vnc/ventral_nerve_cord -> VNC_CPG, fan_shaped/fan-shaped -> CX_FC, ellipsoid -> CX_EPG, noduli/nodulus -> CX_PFN, pars_intercerebralis/neurosecretory -> DRIVE_HUNGER, protocerebral/superior_brain/superior_medial -> CX_EPG (lines 259-371)
- [ ] `determine_group()` uses `side` field for left/right leg motor neuron and wing motor neuron assignment (lines 317-348)
- [ ] `classify_neurons()` reads the `side` column from classification.csv and passes it to `determine_group()` (line 407, 410)
- [ ] `write_meta()` outputs `group_count` (int, value 63) and `group_sizes` (flat array of length 63 indexed by group_id) in neuron_meta.json (lines 494-499)
- [ ] `print_mapping_stats()` new function prints region counts, generic fallback percentage, and top 10 groups to stderr (lines 417-441)
- [ ] `main()` calls `print_mapping_stats()` after classification, before edge aggregation (line 528)
- [ ] GROUPS list order and count (63) unchanged; group_id assignments 0-62 stable
- [ ] Binary file format unchanged (header + edges + per-neuron uint8 region + uint16 group_id)
- [ ] No new imports or external dependencies added
- [ ] No JavaScript files modified

## Gaps and Assumptions
- No Python interpreter was available in the build environment, so syntax correctness was verified via Node.js structural analysis (balanced delimiters, function presence) rather than `py_compile`
- Smoke test assertions were verified by reimplementing determine_region/determine_group logic in JavaScript and confirming all 11 test cases pass
- The `"kc" == cls` check on line 230 is an exact equality check (matching cls exactly equal to "kc"), which differs from T7.1's substring `"kc" in sub_class` — this follows the plan exactly
- Cannot verify end-to-end with real FlyWire CSV data (data files not present in repo)
