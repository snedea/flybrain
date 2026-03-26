# Scout Report: T7.1

## Key Facts (read this first)

- **Tech stack**: Vanilla JS frontend (no build step). Project has Node 22 and yarn but **no Python installed** in this environment — the builder must install it (`apt-get install python3 python3-pip` or use a shebang with `#!/usr/bin/env python3` plus docs on prerequisites).
- **No `data/` directory exists** — the 4 CSV source files are not present. Script must either download them from the FlyWire GCS bucket or document clearly that the user must place them there. The TASKS.md description implies they should be at `data/connections.csv.gz`, `data/neurons.csv.gz`, `data/classification.csv.gz`, `data/coordinates.csv.gz`.
- **No `scripts/` directory exists** — builder must create it.
- **59 existing neuron groups** are defined in `js/connectome.js` (via `BRAIN.neuronRegions`) and `js/constants.js` (via `weights` object). These are the exact group names the output must use. Enumerated below in Architecture Notes.
- **Output binary format is strictly specified**: header (uint32 neuron_count, uint32 edge_count) + edges (uint32 pre, uint32 post, float32 weight) + per-neuron metadata (uint8 region_type, uint16 group_id). Gzipped target ~6–7 MB.

## Relevant Files

- `js/constants.js` — Defines all 59 group names (the `weights` object keys). Builder must replicate this exact set for group_id assignment.
- `js/connectome.js` — Defines `BRAIN.neuronRegions` with 4 buckets: `sensory` (17 groups), `central` (20 groups), `drives` (5 groups), `motor` (17 groups). Region type uint8 encoding must match downstream consumers (T7.3–T7.5).
- `TASKS.md` — Contains the full spec for T7.1 (lines 21–23) and T7.2 (lines 25–27); T7.2's mapping logic is required as part of T7.1 as well.
- `SPEC.md` — High-level project context; not needed for implementation.
- `index.html` — Frontend entry point; shows where output files will be consumed (no direct changes needed for T7.1).

## Architecture Notes

### Existing 59 neuron groups (from `BRAIN.neuronRegions` in connectome.js)

- **sensory** (region_type=0, 17 groups): VIS_R1R6, VIS_R7R8, VIS_ME, VIS_LO, VIS_LC, VIS_LPTC, OLF_ORN_FOOD, OLF_ORN_DANGER, OLF_LN, OLF_PN, MECH_BRISTLE, MECH_JO, MECH_CHORD, ANTENNAL_MECH, THERMO_WARM, THERMO_COOL, NOCI
- **central** (region_type=1, 20 groups): MB_KC, MB_APL, MB_MBON_APP, MB_MBON_AV, MB_DAN_REW, MB_DAN_PUN, LH_APP, LH_AV, CX_EPG, CX_PFN, CX_FC, CX_HDELTA, SEZ_FEED, SEZ_GROOM, SEZ_WATER, GUS_GRN_SWEET, GUS_GRN_BITTER, GUS_GRN_WATER, GNG_DESC, CLOCK_DN
- **drives** (region_type=2, 5 groups): DRIVE_HUNGER, DRIVE_FEAR, DRIVE_FATIGUE, DRIVE_CURIOSITY, DRIVE_GROOM
- **motor** (region_type=3, 17 groups): DN_WALK, DN_FLIGHT, DN_TURN, DN_BACKUP, DN_STARTLE, VNC_CPG, MN_LEG_L1, MN_LEG_R1, MN_LEG_L2, MN_LEG_R2, MN_LEG_L3, MN_LEG_R3, MN_WING_L, MN_WING_R, MN_PROBOSCIS, MN_HEAD, MN_ABDOMEN

Total = 59 named groups. group_id 0–58 in fixed order; each region also needs a generic fallback group for unmapped neurons, bringing the JSON group list to 63 (59 + 4 generic fallbacks).

### CSV schema (from TASKS.md)
- `connections.csv.gz`: `pre_root_id, post_root_id, neuropil, syn_count, nt_type` — 3.87M rows, 48MB compressed
- `neurons.csv.gz`: `root_id, group, nt_type` — 139,255 rows, 1.6MB compressed
- `classification.csv.gz`: `root_id, flow, super_class, class, sub_class, side` — 0.9MB compressed
- `coordinates.csv.gz`: `root_id, position, supervoxel_id` — 5.1MB compressed (NOT needed for T7.1 output)

### Weight derivation
- `weight = syn_count × sign(nt_type)` where sign is +1 for excitatory (ACh, Glu, DA, OA, 5HT) and -1 for inhibitory (GABA). Store as float32.
- Aggregate across neuropils: sum syn_count for same (pre_root_id, post_root_id) pairs before remapping.

### Classification → group mapping strategy
- `flow == 'sensory'` → region=sensory; `flow == 'motor'` → region=motor; `flow == 'intrinsic'` → region=central (drives are a subset)
- `class` field drives specific group: `visual` → VIS_*, `olfactory` → OLF_*, `gustatory` → GUS_*, `mechanosensory` → MECH_*, `thermosensory` → THERMO_*, `kenyon_cell` → MB_KC, `mushroom_body_output` → MB_MBON_APP/AV (needs sub_class), `dopaminergic` → MB_DAN_REW/PUN, `central_complex` → CX_*, `lateral_horn` → LH_*, `descending` → DN_* or MN_*, etc.
- Unmapped neurons: use generic group `GENERIC_SENSORY`, `GENERIC_CENTRAL`, `GENERIC_DRIVES`, `GENERIC_MOTOR` (group_ids 59–62).

### Binary layout math
- Header: 8 bytes
- Edges: ~2.7M × 12 bytes = ~32.4 MB uncompressed → compresses well to ~6–7 MB gzipped
- Metadata: 139,255 × 3 bytes = ~418 KB uncompressed
- Total uncompressed: ~33 MB → gzip target 6–7 MB is achievable

## Suggested Approach

1. **Script structure**: `scripts/build_connectome.py` with clear sections: (a) load CSVs, (b) build root_id→index remapping, (c) classify neurons → region + group, (d) aggregate edges, (e) write binary, (f) write JSON.
2. **Use pandas**: Only stdlib dependency is `struct`, `gzip`, `json`. Pandas is highly recommended for the 48MB CSV but must be installed. Add a `requirements.txt` or inline `pip install` check.
3. **Download logic**: Add an optional `--download` flag or a `download_data.sh` helper to fetch from the GCS bucket (`gs://flywire-data/` or similar). Alternatively, check `data/` exists and error clearly if files are missing.
4. **Group ID ordering**: Assign group_ids 0–58 in the exact order they appear in `BRAIN.neuronRegions` (sensory first, then central, drives, motor), then 59–62 for generics. Document this ordering in neuron_meta.json so T7.3/T7.4 can decode it.
5. **neuron_meta.json schema**: `{ "groups": [{"id": 0, "name": "VIS_R1R6", "region": "sensory", "neuron_count": N}, ...], "neuron_count": 139255, "edge_count": N }`.

## Risks and Constraints (read this last)

- **Python not available**: Debian bookworm has `python3` in apt but it is not installed. Builder must add install instructions. The script itself cannot be tested in this environment without installing Python.
- **Data files absent**: The 4 CSV files in `data/` don't exist yet. Builder should include a download script or clear instructions. GCS bucket URL not explicitly stated in TASKS.md — builder should use `https://storage.googleapis.com/flywire-data/` or the Codex API. The public FlyWire Codex download URL pattern should be verified.
- **Memory pressure**: 48MB compressed connections = likely 200–400MB in memory as a pandas DataFrame. On a low-RAM environment this may OOM. Builder may want to use chunked reading or dask for large files.
- **nt_type sign mapping**: The actual nt_type string values in the FlyWire dataset (`ACh`, `GABA`, `Glu`, `DA`, `OA`, `5HT`, `unknown`) are not confirmed from the code — builder must verify against actual CSV header or FlyWire docs. Unknown nt_type should default to excitatory (+1) with a warning.
- **Duplicate edges after aggregation**: After summing syn_count across neuropils, the resulting edge list should be unique (pre_index, post_index) pairs — verify with a groupby + sum before writing.
- **T7.2 overlap**: T7.2 is a separate task but T7.1's spec says "maps each neuron to one of the existing 59 behavioral groups" — T7.1 must include the full mapping logic. T7.2 appears to be a refinement/documentation task, not a blocker.
- **coordinates.csv not needed for T7.1**: The spatial positions are only needed for T7.5 (WebGL layout). Builder should skip loading this file to save time/memory.
