# Plan: T7.1

## Dependencies
- list: [python3, python3-pip, pandas (latest via pip)]
- commands:
  - `apt-get update && apt-get install -y python3 python3-pip python3-venv`
  - `python3 -m pip install --break-system-packages pandas`

## File Operations (in execution order)

### 1. CREATE scripts/build_connectome.py
- operation: CREATE
- reason: Main preprocessing script that reads FlyWire CSV data, aggregates connections, classifies neurons, and outputs connectome.bin.gz and neuron_meta.json

#### Imports / Dependencies
```python
from __future__ import annotations

import argparse
import csv
import gzip
import json
import struct
import sys
from collections import defaultdict
from pathlib import Path
```

Note: Do NOT use pandas. Use only stdlib modules. The CSV files are small enough (largest is 48MB compressed connections with 3.87M rows) to process with the csv module and defaultdict. This avoids the pip install pandas dependency entirely.

#### Constants

Define these constants at module level, immediately after imports:

```python
# Neuron groups in exact order from BRAIN.neuronRegions (js/connectome.js lines 100-128).
# group_id is the index into this list (0..58).
GROUPS: list[tuple[str, str]] = [
    # sensory (region_type=0) — 17 groups, ids 0-16
    ("VIS_R1R6", "sensory"),
    ("VIS_R7R8", "sensory"),
    ("VIS_ME", "sensory"),
    ("VIS_LO", "sensory"),
    ("VIS_LC", "sensory"),
    ("VIS_LPTC", "sensory"),
    ("OLF_ORN_FOOD", "sensory"),
    ("OLF_ORN_DANGER", "sensory"),
    ("OLF_LN", "sensory"),
    ("OLF_PN", "sensory"),
    ("MECH_BRISTLE", "sensory"),
    ("MECH_JO", "sensory"),
    ("MECH_CHORD", "sensory"),
    ("ANTENNAL_MECH", "sensory"),
    ("THERMO_WARM", "sensory"),
    ("THERMO_COOL", "sensory"),
    ("NOCI", "sensory"),
    # central (region_type=1) — 20 groups, ids 17-36
    ("MB_KC", "central"),
    ("MB_APL", "central"),
    ("MB_MBON_APP", "central"),
    ("MB_MBON_AV", "central"),
    ("MB_DAN_REW", "central"),
    ("MB_DAN_PUN", "central"),
    ("LH_APP", "central"),
    ("LH_AV", "central"),
    ("CX_EPG", "central"),
    ("CX_PFN", "central"),
    ("CX_FC", "central"),
    ("CX_HDELTA", "central"),
    ("SEZ_FEED", "central"),
    ("SEZ_GROOM", "central"),
    ("SEZ_WATER", "central"),
    ("GUS_GRN_SWEET", "central"),
    ("GUS_GRN_BITTER", "central"),
    ("GUS_GRN_WATER", "central"),
    ("GNG_DESC", "central"),
    ("CLOCK_DN", "central"),
    # drives (region_type=2) — 5 groups, ids 37-41
    ("DRIVE_HUNGER", "drives"),
    ("DRIVE_FEAR", "drives"),
    ("DRIVE_FATIGUE", "drives"),
    ("DRIVE_CURIOSITY", "drives"),
    ("DRIVE_GROOM", "drives"),
    # motor (region_type=3) — 17 groups, ids 42-58
    ("DN_WALK", "motor"),
    ("DN_FLIGHT", "motor"),
    ("DN_TURN", "motor"),
    ("DN_BACKUP", "motor"),
    ("DN_STARTLE", "motor"),
    ("VNC_CPG", "motor"),
    ("MN_LEG_L1", "motor"),
    ("MN_LEG_R1", "motor"),
    ("MN_LEG_L2", "motor"),
    ("MN_LEG_R2", "motor"),
    ("MN_LEG_L3", "motor"),
    ("MN_LEG_R3", "motor"),
    ("MN_WING_L", "motor"),
    ("MN_WING_R", "motor"),
    ("MN_PROBOSCIS", "motor"),
    ("MN_HEAD", "motor"),
    ("MN_ABDOMEN", "motor"),
    # generic fallbacks (ids 59-62)
    ("GENERIC_SENSORY", "sensory"),
    ("GENERIC_CENTRAL", "central"),
    ("GENERIC_DRIVES", "drives"),
    ("GENERIC_MOTOR", "motor"),
]

GROUP_NAME_TO_ID: dict[str, int] = {name: i for i, (name, _) in enumerate(GROUPS)}

REGION_NAME_TO_TYPE: dict[str, int] = {
    "sensory": 0,
    "central": 1,
    "drives": 2,
    "motor": 3,
}

# Generic fallback group_id per region
GENERIC_GROUP: dict[str, int] = {
    "sensory": GROUP_NAME_TO_ID["GENERIC_SENSORY"],   # 59
    "central": GROUP_NAME_TO_ID["GENERIC_CENTRAL"],   # 60
    "drives": GROUP_NAME_TO_ID["GENERIC_DRIVES"],     # 61
    "motor": GROUP_NAME_TO_ID["GENERIC_MOTOR"],       # 62
}

# nt_type -> sign multiplier. Excitatory = +1, inhibitory = -1.
# Unknown defaults to +1 with a stderr warning.
NT_SIGN: dict[str, float] = {
    "ACH": 1.0,
    "GLUT": 1.0,
    "DA": 1.0,
    "OA": 1.0,
    "SER": 1.0,
    "GABA": -1.0,
}
```

#### Functions

##### 1. `def main() -> None`
- signature: `def main() -> None`
- purpose: Entry point. Parses args, orchestrates the pipeline, writes output files.
- logic:
  1. Create argparse.ArgumentParser with description "Build FlyWire connectome binary and metadata"
  2. Add argument `--data-dir` with type=Path, default=Path("data"), help="Directory containing CSV files"
  3. Add argument `--output-dir` with type=Path, default=Path("data"), help="Directory for output files"
  4. Parse args
  5. Validate that these 3 files exist (coordinates.csv.gz is NOT needed):
     - `args.data_dir / "connections.csv.gz"`
     - `args.data_dir / "neurons.csv.gz"`
     - `args.data_dir / "classification.csv.gz"`
     If any file is missing, print to stderr: `"Error: Missing {filepath}. Place FlyWire CSV files in {args.data_dir}/"` and `sys.exit(1)`
  6. Call `root_ids, neuron_nt = load_neurons(args.data_dir / "neurons.csv.gz")` — returns (list[str], dict[str, str])
  7. Call `id_to_index = build_index(root_ids)` — returns dict[str, int]
  8. Call `neuron_region, neuron_group = classify_neurons(args.data_dir / "classification.csv.gz", root_ids, id_to_index)` — returns (list[int], list[int])
  9. Call `edges = aggregate_edges(args.data_dir / "connections.csv.gz", id_to_index, neuron_nt)` — returns list[tuple[int, int, float]]
  10. Call `args.output_dir.mkdir(parents=True, exist_ok=True)`
  11. Call `write_binary(args.output_dir / "connectome.bin.gz", len(root_ids), edges, neuron_region, neuron_group)`
  12. Call `write_meta(args.output_dir / "neuron_meta.json", len(root_ids), len(edges), neuron_region, neuron_group)`
  13. Print to stdout: `"Done: {len(root_ids)} neurons, {len(edges)} edges"` and `"Output: {args.output_dir}/connectome.bin.gz, {args.output_dir}/neuron_meta.json"`
- calls: load_neurons, build_index, classify_neurons, aggregate_edges, write_binary, write_meta
- returns: None
- error handling: sys.exit(1) if input files missing

##### 2. `def load_neurons(path: Path) -> tuple[list[str], dict[str, str]]`
- signature: `def load_neurons(path: Path) -> tuple[list[str], dict[str, str]]`
- purpose: Load neurons.csv.gz to get the canonical list of root_ids and each neuron's nt_type
- logic:
  1. Open file with `gzip.open(path, "rt", encoding="utf-8")`
  2. Create csv.DictReader from the opened file
  3. Initialize `root_ids: list[str] = []` and `neuron_nt: dict[str, str] = {}`
  4. For each row in reader:
     a. Append `row["root_id"]` to root_ids
     b. Set `neuron_nt[row["root_id"]] = row["nt_type"].strip().upper()` (normalize to uppercase)
  5. Print to stderr: `f"Loaded {len(root_ids)} neurons from {path}"`
  6. Return `(root_ids, neuron_nt)`
- returns: tuple of (list of root_id strings in file order, dict mapping root_id to uppercase nt_type string)
- error handling: Let exceptions propagate (csv.Error, KeyError for missing columns)

##### 3. `def build_index(root_ids: list[str]) -> dict[str, int]`
- signature: `def build_index(root_ids: list[str]) -> dict[str, int]`
- purpose: Create a mapping from root_id string to contiguous index 0..N-1
- logic:
  1. Return `{rid: i for i, rid in enumerate(root_ids)}`
- returns: dict[str, int]
- error handling: None

##### 4. `def classify_neurons(path: Path, root_ids: list[str], id_to_index: dict[str, int]) -> tuple[list[int], list[int]]`
- signature: `def classify_neurons(path: Path, root_ids: list[str], id_to_index: dict[str, int]) -> tuple[list[int], list[int]]`
- purpose: Read classification.csv.gz and assign each neuron a region_type (uint8) and group_id (uint16)
- logic:
  1. Initialize `neuron_region: list[int] = [1] * len(root_ids)` (default region_type=1 "central")
  2. Initialize `neuron_group: list[int] = [GENERIC_GROUP["central"]] * len(root_ids)` (default = GENERIC_CENTRAL)
  3. Open file with `gzip.open(path, "rt", encoding="utf-8")`
  4. Create csv.DictReader from the opened file
  5. For each row in reader:
     a. `rid = row["root_id"]`
     b. If `rid not in id_to_index`, skip (continue)
     c. `idx = id_to_index[rid]`
     d. `flow = row.get("flow", "").strip().lower()`
     e. `super_class = row.get("super_class", "").strip().lower()`
     f. `cls = row.get("class", "").strip().lower()`
     g. `sub_class = row.get("sub_class", "").strip().lower()`
     h. Determine region string using `determine_region(flow, super_class)` — returns one of "sensory", "central", "drives", "motor"
     i. Set `neuron_region[idx] = REGION_NAME_TO_TYPE[region]`
     j. Determine group_name using `determine_group(flow, super_class, cls, sub_class, region)` — returns a group name string
     k. Set `neuron_group[idx] = GROUP_NAME_TO_ID[group_name]`
  6. Count how many neurons were classified (matched in id_to_index): print to stderr `f"Classified {count} neurons from {path}"`
  7. Return `(neuron_region, neuron_group)`
- calls: determine_region, determine_group
- returns: tuple of (list of region_type ints, list of group_id ints), both of length len(root_ids)
- error handling: Neurons not found in classification.csv keep their defaults (central, GENERIC_CENTRAL)

##### 5. `def determine_region(flow: str, super_class: str) -> str`
- signature: `def determine_region(flow: str, super_class: str) -> str`
- purpose: Map flow and super_class fields to one of the 4 region names
- logic:
  1. If `flow == "sensory"`: return `"sensory"`
  2. If `flow == "motor"`: return `"motor"`
  3. If `super_class` starts with `"motor"` or `super_class == "motor"`: return `"motor"`
  4. If `super_class` starts with `"descending"` or `super_class == "descending"`: return `"motor"`
  5. If `super_class` contains `"endocrine"` or `super_class` contains `"modulatory"`: return `"drives"`
  6. Return `"central"` (default for flow=="intrinsic" or any other value)
- returns: one of "sensory", "central", "drives", "motor"
- error handling: None — all paths return a valid region

##### 6. `def determine_group(flow: str, super_class: str, cls: str, sub_class: str, region: str) -> str`
- signature: `def determine_group(flow: str, super_class: str, cls: str, sub_class: str, region: str) -> str`
- purpose: Map classification fields to one of the 63 group names (59 named + 4 generic)
- logic: Use a cascading if/elif chain. All string comparisons are on lowercase inputs. Return the matching group name, or the generic fallback for the region.

  The mapping rules, in this exact order:

  **Visual system:**
  1. If `cls` contains `"visual"` or `super_class` contains `"visual"` or `super_class` contains `"optic"`:
     a. If `sub_class` contains `"r1"` or `sub_class` contains `"r6"`: return `"VIS_R1R6"`
     b. If `sub_class` contains `"r7"` or `sub_class` contains `"r8"`: return `"VIS_R7R8"`
     c. If `sub_class` contains `"medulla"` or `sub_class` contains `"tm"` or `sub_class` contains `"mi"`: return `"VIS_ME"`
     d. If `sub_class` contains `"lobula"` and `sub_class` contains `"plate"`: return `"VIS_LPTC"`
     e. If `sub_class` contains `"lc"` or `sub_class` contains `"loom"`: return `"VIS_LC"`
     f. If `sub_class` contains `"lobula"` or `sub_class` contains `"lo"`: return `"VIS_LO"`
     g. If `sub_class` contains `"lptc"` or `sub_class` contains `"tangential"`: return `"VIS_LPTC"`
     h. Return `"VIS_ME"` (default visual group)

  **Olfactory system:**
  2. If `cls` contains `"olfact"` or `super_class` contains `"olfact"`:
     a. If `sub_class` contains `"orn"` or `sub_class` contains `"receptor"`:
        - If `sub_class` contains `"danger"` or `sub_class` contains `"avers"`: return `"OLF_ORN_DANGER"`
        - Else: return `"OLF_ORN_FOOD"`
     b. If `sub_class` contains `"ln"` or `sub_class` contains `"local"`: return `"OLF_LN"`
     c. If `sub_class` contains `"pn"` or `sub_class` contains `"projection"`: return `"OLF_PN"`
     d. Return `"OLF_PN"` (default olfactory group)

  **Gustatory system:**
  3. If `cls` contains `"gustat"` or `super_class` contains `"gustat"`:
     a. If `sub_class` contains `"sweet"` or `sub_class` contains `"sugar"`: return `"GUS_GRN_SWEET"`
     b. If `sub_class` contains `"bitter"`: return `"GUS_GRN_BITTER"`
     c. If `sub_class` contains `"water"`: return `"GUS_GRN_WATER"`
     d. Return `"GUS_GRN_SWEET"` (default gustatory group)

  **Mechanosensory system:**
  4. If `cls` contains `"mechano"` or `super_class` contains `"mechano"`:
     a. If `sub_class` contains `"bristle"`: return `"MECH_BRISTLE"`
     b. If `sub_class` contains `"johnston"` or `sub_class` contains `"jo"`: return `"MECH_JO"`
     c. If `sub_class` contains `"chord"` or `sub_class` contains `"propriocep"`: return `"MECH_CHORD"`
     d. If `sub_class` contains `"antenna"`: return `"ANTENNAL_MECH"`
     e. Return `"MECH_BRISTLE"` (default mechanosensory group)

  **Thermosensory system:**
  5. If `cls` contains `"thermo"` or `super_class` contains `"thermo"`:
     a. If `sub_class` contains `"warm"` or `sub_class` contains `"hot"`: return `"THERMO_WARM"`
     b. If `sub_class` contains `"cool"` or `sub_class` contains `"cold"`: return `"THERMO_COOL"`
     c. Return `"THERMO_WARM"` (default thermosensory group)

  **Nociceptive:**
  6. If `cls` contains `"nocicep"` or `super_class` contains `"nocicep"`: return `"NOCI"`

  **Mushroom body:**
  7. If `cls` contains `"kenyon"` or `sub_class` contains `"kenyon"` or `sub_class` contains `"kc"`: return `"MB_KC"`
  8. If `cls` contains `"mushroom"` or `super_class` contains `"mushroom"`:
     a. If `sub_class` contains `"apl"`: return `"MB_APL"`
     b. If `sub_class` contains `"mbon"`:
        - If `sub_class` contains `"avers"` or `sub_class` contains `"avoid"`: return `"MB_MBON_AV"`
        - Else: return `"MB_MBON_APP"`
     c. If `sub_class` contains `"dan"` or `sub_class` contains `"dopamin"`:
        - If `sub_class` contains `"pun"` or `sub_class` contains `"avers"`: return `"MB_DAN_PUN"`
        - Else: return `"MB_DAN_REW"`
     d. Return `"MB_KC"` (default mushroom body group)

  **Dopaminergic (outside mushroom body context):**
  9. If `cls` contains `"dopamin"` or `super_class` contains `"dopamin"`:
     a. If `sub_class` contains `"pun"` or `sub_class` contains `"avers"`: return `"MB_DAN_PUN"`
     b. Return `"MB_DAN_REW"`

  **Lateral horn:**
  10. If `cls` contains `"lateral_horn"` or `cls` contains `"lateral horn"` or `super_class` contains `"lateral horn"`:
      a. If `sub_class` contains `"avers"` or `sub_class` contains `"avoid"`: return `"LH_AV"`
      b. Return `"LH_APP"`

  **Central complex:**
  11. If `cls` contains `"central_complex"` or `cls` contains `"central complex"` or `super_class` contains `"central complex"`:
      a. If `sub_class` contains `"epg"` or `sub_class` contains `"compass"`: return `"CX_EPG"`
      b. If `sub_class` contains `"pfn"` or `sub_class` contains `"path"`: return `"CX_PFN"`
      c. If `sub_class` contains `"fc"` or `sub_class` contains `"fan"`: return `"CX_FC"`
      d. If `sub_class` contains `"hdelta"` or `sub_class` contains `"heading"`: return `"CX_HDELTA"`
      e. Return `"CX_EPG"` (default central complex group)

  **SEZ/feeding/grooming:**
  12. If `cls` contains `"subesophageal"` or `super_class` contains `"sez"`:
      a. If `sub_class` contains `"feed"`: return `"SEZ_FEED"`
      b. If `sub_class` contains `"groom"`: return `"SEZ_GROOM"`
      c. If `sub_class` contains `"water"`: return `"SEZ_WATER"`
      d. Return `"SEZ_FEED"` (default SEZ group)

  **Descending neurons:**
  13. If `cls` contains `"descend"` or `super_class` contains `"descend"`:
      a. If `sub_class` contains `"walk"` or `sub_class` contains `"locomot"`: return `"DN_WALK"`
      b. If `sub_class` contains `"flight"` or `sub_class` contains `"fly"`: return `"DN_FLIGHT"`
      c. If `sub_class` contains `"turn"`: return `"DN_TURN"`
      d. If `sub_class` contains `"backup"` or `sub_class` contains `"back"`: return `"DN_BACKUP"`
      e. If `sub_class` contains `"startle"` or `sub_class` contains `"escape"` or `sub_class` contains `"giant"`: return `"DN_STARTLE"`
      f. Return `"GNG_DESC"` (default descending group)

  **Motor neurons:**
  14. If `cls` contains `"motor"` or `super_class` contains `"motor"`:
      a. If `sub_class` contains `"leg"`:
         - If `sub_class` contains `"l1"` or `sub_class` contains `"front"` and `sub_class` contains `"left"`: return `"MN_LEG_L1"`
         - If `sub_class` contains `"r1"` or `sub_class` contains `"front"` and `sub_class` contains `"right"`: return `"MN_LEG_R1"`
         - If `sub_class` contains `"l2"` or `sub_class` contains `"mid"` and `sub_class` contains `"left"`: return `"MN_LEG_L2"`
         - If `sub_class` contains `"r2"` or `sub_class` contains `"mid"` and `sub_class` contains `"right"`: return `"MN_LEG_R2"`
         - If `sub_class` contains `"l3"` or `sub_class` contains `"hind"` and `sub_class` contains `"left"`: return `"MN_LEG_L3"`
         - If `sub_class` contains `"r3"` or `sub_class` contains `"hind"` and `sub_class` contains `"right"`: return `"MN_LEG_R3"`
         - Return `"MN_LEG_L1"` (default leg motor group)
      b. If `sub_class` contains `"wing"`:
         - If `sub_class` contains `"left"` or `sub_class` contains `"_l"`: return `"MN_WING_L"`
         - If `sub_class` contains `"right"` or `sub_class` contains `"_r"`: return `"MN_WING_R"`
         - Return `"MN_WING_L"` (default wing group)
      c. If `sub_class` contains `"proboscis"`: return `"MN_PROBOSCIS"`
      d. If `sub_class` contains `"head"` or `sub_class` contains `"neck"`: return `"MN_HEAD"`
      e. If `sub_class` contains `"abdom"`: return `"MN_ABDOMEN"`
      f. Return `"VNC_CPG"` (default motor group)

  **Clock neurons:**
  15. If `cls` contains `"clock"` or `sub_class` contains `"clock"` or `sub_class` contains `"circadian"`: return `"CLOCK_DN"`

  **GNG:**
  16. If `cls` contains `"gnathal"` or `super_class` contains `"gnathal"`: return `"GNG_DESC"`

  **Drives (neuromodulatory neurons):**
  17. If `region == "drives"`:
      a. If `sub_class` contains `"hunger"` or `sub_class` contains `"npf"` or `cls` contains `"hunger"`: return `"DRIVE_HUNGER"`
      b. If `sub_class` contains `"fear"` or `sub_class` contains `"alarm"` or `cls` contains `"fear"`: return `"DRIVE_FEAR"`
      c. If `sub_class` contains `"fatigue"` or `sub_class` contains `"sleep"` or `cls` contains `"fatigue"`: return `"DRIVE_FATIGUE"`
      d. If `sub_class` contains `"curios"` or `sub_class` contains `"explor"` or `cls` contains `"curios"`: return `"DRIVE_CURIOSITY"`
      e. If `sub_class` contains `"groom"` or `cls` contains `"groom"`: return `"DRIVE_GROOM"`
      f. Return `"GENERIC_DRIVES"`

  **Fallback:**
  18. Return the generic fallback group for the region:
      - If `region == "sensory"`: return `"GENERIC_SENSORY"`
      - If `region == "central"`: return `"GENERIC_CENTRAL"`
      - If `region == "drives"`: return `"GENERIC_DRIVES"`
      - If `region == "motor"`: return `"GENERIC_MOTOR"`

      Use: `return f"GENERIC_{region.upper()}"` — but since "drives" maps to "GENERIC_DRIVES", this works for all 4.

- returns: one of the 63 group name strings
- error handling: Always returns a valid group name (falls through to generic)

##### 7. `def aggregate_edges(path: Path, id_to_index: dict[str, int], neuron_nt: dict[str, str]) -> list[tuple[int, int, float]]`
- signature: `def aggregate_edges(path: Path, id_to_index: dict[str, int], neuron_nt: dict[str, str]) -> list[tuple[int, int, float]]`
- purpose: Read connections.csv.gz, aggregate syn_count across neuropils per (pre, post) pair, apply nt_type sign, return edge list
- logic:
  1. Initialize `edge_sums: dict[tuple[int, int], float] = defaultdict(float)`
  2. Initialize `skipped = 0` and `unknown_nt = 0` counters
  3. Open file with `gzip.open(path, "rt", encoding="utf-8")`
  4. Create csv.DictReader from the opened file
  5. For each row in reader:
     a. `pre_rid = row["pre_root_id"]`
     b. `post_rid = row["post_root_id"]`
     c. If `pre_rid not in id_to_index` or `post_rid not in id_to_index`: increment `skipped`, continue
     d. `pre_idx = id_to_index[pre_rid]`
     e. `post_idx = id_to_index[post_rid]`
     f. `syn_count = int(row["syn_count"])`
     g. `nt = row["nt_type"].strip().upper()`
     h. `sign = NT_SIGN.get(nt, None)`
     i. If sign is None: set `sign = 1.0`, increment `unknown_nt`
     j. `edge_sums[(pre_idx, post_idx)] += syn_count * sign`
  6. Convert to list: `edges = [(pre, post, weight) for (pre, post), weight in edge_sums.items() if weight != 0.0]`
  7. Sort edges by (pre, post) for deterministic output: `edges.sort()`
  8. Print to stderr: `f"Aggregated {len(edges)} edges from {path} (skipped {skipped} rows with unknown root_ids, {unknown_nt} rows with unknown nt_type)"`
  9. Return `edges`
- returns: list of (pre_index: int, post_index: int, weight: float) tuples, sorted by (pre, post)
- error handling: Skip rows with unknown root_ids (not in neurons.csv). Unknown nt_type defaults to excitatory sign (+1.0).

##### 8. `def write_binary(path: Path, neuron_count: int, edges: list[tuple[int, int, float]], neuron_region: list[int], neuron_group: list[int]) -> None`
- signature: `def write_binary(path: Path, neuron_count: int, edges: list[tuple[int, int, float]], neuron_region: list[int], neuron_group: list[int]) -> None`
- purpose: Write the connectome.bin.gz binary file
- logic:
  1. Open file with `gzip.open(path, "wb", compresslevel=9)`
  2. Write header: `struct.pack("<II", neuron_count, len(edges))` — two uint32 little-endian values
  3. For each `(pre, post, weight)` in edges:
     a. Write `struct.pack("<IIf", pre, post, weight)` — uint32 pre, uint32 post, float32 weight, all little-endian
  4. For each neuron index `i` in `range(neuron_count)`:
     a. Write `struct.pack("<BH", neuron_region[i], neuron_group[i])` — uint8 region_type, uint16 group_id, little-endian
  5. Close file
  6. Get file size: `path.stat().st_size`
  7. Print to stderr: `f"Wrote {path} ({file_size / 1024 / 1024:.1f} MB)"`
- returns: None
- error handling: Let I/O exceptions propagate

##### 9. `def write_meta(path: Path, neuron_count: int, edge_count: int, neuron_region: list[int], neuron_group: list[int]) -> None`
- signature: `def write_meta(path: Path, neuron_count: int, edge_count: int, neuron_region: list[int], neuron_group: list[int]) -> None`
- purpose: Write neuron_meta.json with group names, region assignments, and neuron counts
- logic:
  1. Initialize `group_counts: dict[int, int] = defaultdict(int)`
  2. For each `i` in `range(neuron_count)`:
     a. `group_counts[neuron_group[i]] += 1`
  3. Build `groups` list: for each `(gid, (name, region))` in `enumerate(GROUPS)`:
     a. Append `{"id": gid, "name": name, "region": region, "neuron_count": group_counts.get(gid, 0)}`
  4. Build the top-level dict:
     ```python
     meta = {
         "neuron_count": neuron_count,
         "edge_count": edge_count,
         "region_types": {"sensory": 0, "central": 1, "drives": 2, "motor": 3},
         "groups": groups,
     }
     ```
  5. Write to path with `json.dump(meta, f, indent=2)` (no gzip, plain JSON)
  6. Print to stderr: `f"Wrote {path}"`
- returns: None
- error handling: Let I/O exceptions propagate

##### 10. `if __name__ == "__main__":` block
- At the bottom of the file: `if __name__ == "__main__": main()`

#### Wiring / Integration
- This is a standalone script. It is not imported by other files.
- Output files (`data/connectome.bin.gz` and `data/neuron_meta.json`) will be consumed by T7.3 (Web Worker) and T7.4 (main thread integration) in subsequent tasks.
- The group_id ordering (0-62) and region_type encoding (0-3) defined in the GROUPS constant must match what T7.3/T7.4 expect. Those tasks will read the neuron_meta.json for the mapping.

## Verification
- build: `python3 scripts/build_connectome.py --help` (must print usage without error)
- lint: `python3 -c "import py_compile; py_compile.compile('scripts/build_connectome.py', doraise=True)"`
- test: no existing tests
- smoke: The script cannot be fully smoke-tested without the 4 CSV data files in data/. Verify these two things:
  1. `python3 scripts/build_connectome.py --help` prints the argparse help text with `--data-dir` and `--output-dir` options
  2. `python3 -c "import sys; sys.path.insert(0, 'scripts'); from build_connectome import GROUPS, GROUP_NAME_TO_ID, REGION_NAME_TO_TYPE, GENERIC_GROUP, NT_SIGN; assert len(GROUPS) == 63; assert len(GROUP_NAME_TO_ID) == 63; assert GROUP_NAME_TO_ID['VIS_R1R6'] == 0; assert GROUP_NAME_TO_ID['MN_ABDOMEN'] == 58; assert GROUP_NAME_TO_ID['GENERIC_SENSORY'] == 59; assert GROUP_NAME_TO_ID['GENERIC_MOTOR'] == 62; assert REGION_NAME_TO_TYPE['sensory'] == 0; assert REGION_NAME_TO_TYPE['motor'] == 3; print('All constant assertions passed')"` — must print "All constant assertions passed"

## Constraints
- Do NOT modify any existing files (no changes to js/constants.js, js/connectome.js, index.html, or any other existing file)
- Do NOT use pandas or any non-stdlib Python dependency — use only stdlib modules (csv, gzip, struct, json, argparse, collections, pathlib, sys)
- Do NOT process coordinates.csv.gz — it is not needed for T7.1
- Do NOT download data files — the script assumes they are already in the data directory
- The first line of the Python file MUST be `from __future__ import annotations`
- Use `<` (little-endian) byte order for ALL struct.pack calls
- The GROUPS list ordering must exactly match the order from BRAIN.neuronRegions in js/connectome.js (sensory groups 0-16, central 17-36, drives 37-41, motor 42-58, generics 59-62)
- The script must be executable with `python3 scripts/build_connectome.py` from the project root
- All print statements for progress/status go to stderr (`print(..., file=sys.stderr)`). Only the final summary goes to stdout.
