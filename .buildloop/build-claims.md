# Build Claims -- T7.1

## Files Changed
- [CREATE] scripts/build_connectome.py -- Python preprocessing script that reads FlyWire CSV data, aggregates connections, classifies neurons into 63 groups across 4 regions, and outputs connectome.bin.gz and neuron_meta.json

## Verification Results
- Build: PASS (`python3 scripts/build_connectome.py --help` prints usage with --data-dir and --output-dir options)
- Lint: PASS (`python3 -c "import py_compile; py_compile.compile('scripts/build_connectome.py', doraise=True)"` — no errors)
- Tests: SKIPPED (no existing tests; smoke test of constants passed)
- Constants check: PASS (`assert len(GROUPS) == 63; assert GROUP_NAME_TO_ID['VIS_R1R6'] == 0; assert GROUP_NAME_TO_ID['MN_ABDOMEN'] == 58; assert GROUP_NAME_TO_ID['GENERIC_SENSORY'] == 59; assert GROUP_NAME_TO_ID['GENERIC_MOTOR'] == 62; assert REGION_NAME_TO_TYPE['sensory'] == 0; assert REGION_NAME_TO_TYPE['motor'] == 3` — all passed)

## Claims
- [ ] Claim 1: scripts/build_connectome.py uses ONLY stdlib modules (csv, gzip, struct, json, argparse, collections, pathlib, sys) — no pandas or external dependencies
- [ ] Claim 2: First line of the file is `from __future__ import annotations`
- [ ] Claim 3: GROUPS list has exactly 63 entries: 17 sensory (ids 0-16), 20 central (ids 17-36), 5 drives (ids 37-41), 17 motor (ids 42-58), 4 generic fallbacks (ids 59-62)
- [ ] Claim 4: Group ordering matches BRAIN.neuronRegions from js/connectome.js lines 100-128
- [ ] Claim 5: load_neurons() reads neurons.csv.gz and returns (root_ids list, neuron_nt dict mapping root_id to uppercase nt_type)
- [ ] Claim 6: build_index() creates contiguous 0..N-1 index mapping from root_ids
- [ ] Claim 7: classify_neurons() reads classification.csv.gz using flow+super_class for region and sub_class/class/hemilineage for group; defaults to central/GENERIC_CENTRAL for unclassified neurons
- [ ] Claim 8: determine_region() maps flow/super_class to sensory/central/drives/motor with exact cascade from plan
- [ ] Claim 9: determine_group() implements full 18-rule cascade mapping classification fields to one of 63 group names
- [ ] Claim 10: aggregate_edges() reads connections.csv.gz, aggregates syn_count across neuropils per (pre,post) pair, applies NT_SIGN (+1/-1) based on nt_type, filters zero-weight edges, sorts by (pre,post)
- [ ] Claim 11: write_binary() outputs gzipped binary with header (uint32 neuron_count, uint32 edge_count) + edges (uint32 pre, uint32 post, float32 weight) + per-neuron metadata (uint8 region_type, uint16 group_id), all little-endian
- [ ] Claim 12: write_meta() outputs plain JSON with neuron_count, edge_count, region_types mapping, and groups array with id/name/region/neuron_count per group
- [ ] Claim 13: All progress/status prints go to stderr; only final summary goes to stdout
- [ ] Claim 14: Script validates existence of 3 required CSV files (connections, neurons, classification) before processing; coordinates.csv.gz is NOT required
- [ ] Claim 15: No existing files were modified

## Gaps and Assumptions
- Cannot fully smoke-test without actual FlyWire CSV data files in data/ directory
- NT_SIGN only maps 6 known neurotransmitter types (ACH, GLUT, DA, OA, SER, GABA); unknown nt_types default to +1.0 (excitatory)
- The classification cascade relies on substring matching against lowercase field values; actual FlyWire classification.csv field values may use different naming conventions than expected, which could cause more neurons to fall into generic groups
- Output file sizes (connectome.bin.gz target ~6-7MB) cannot be verified without real data
