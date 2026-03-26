# Plan: T7.2

## Context

T7.1 already built `scripts/build_connectome.py` with `determine_region()`, `determine_group()`, `classify_neurons()`, binary output (uint16 group_id per neuron), and `neuron_meta.json`. T7.2 refines the mapping logic, adds explicit handling for FlyWire `flow == "intrinsic"`, improves pattern coverage for edge-case classification values, adds a flat `group_sizes` array to `neuron_meta.json` for efficient JS-side aggregation (needed by T7.4), and adds mapping quality stats to stderr.

## Dependencies
- list: [] (no new packages)
- commands: [] (no install commands)

## File Operations (in execution order)

### 1. MODIFY scripts/build_connectome.py
- operation: MODIFY
- reason: Refine neuron-to-group mapping logic for FlyWire classification.csv field patterns, add explicit intrinsic flow handling, add group_sizes flat array output, add mapping stats

#### Change 1: Refine `determine_region()` to explicitly handle `flow == "intrinsic"`
- anchor: `def determine_region(flow: str, super_class: str) -> str:`

Replace the entire `determine_region` function body with:

```python
def determine_region(flow: str, super_class: str) -> str:
    """Map flow and super_class fields to one of the 4 region names."""
    if flow == "sensory":
        return "sensory"
    if flow == "motor":
        return "motor"
    # FlyWire uses "intrinsic" for interneurons; these map to central or drives
    if flow == "intrinsic" or flow == "":
        if super_class.startswith("motor") or super_class == "motor":
            return "motor"
        if super_class.startswith("descending") or super_class == "descending":
            return "motor"
        if "endocrine" in super_class or "modulatory" in super_class:
            return "drives"
        return "central"
    # flow not recognized — fall back to super_class heuristics
    if super_class.startswith("motor") or super_class == "motor":
        return "motor"
    if super_class.startswith("descending") or super_class == "descending":
        return "motor"
    if "endocrine" in super_class or "modulatory" in super_class:
        return "drives"
    return "central"
```

Logic:
1. If flow is "sensory", return "sensory"
2. If flow is "motor", return "motor"
3. If flow is "intrinsic" or empty string, fall through to super_class heuristics: check for motor/descending super_class -> "motor", endocrine/modulatory -> "drives", else "central"
4. If flow is any other unrecognized value, apply the same super_class heuristics as step 3

#### Change 2: Refine `determine_group()` with improved pattern matching
- anchor: `def determine_group(flow: str, super_class: str, cls: str, sub_class: str, region: str) -> str:`

Replace the entire `determine_group` function body. The new version adds these improvements over T7.1:
- Handles `class == "ascending"` neurons (map to GNG_DESC)
- Handles `class == "optic_lobes"` or `class == "optic"` explicitly
- Adds `"vnc"` and `"ventral_nerve_cord"` class matching -> VNC_CPG
- Adds `"protocerebral"` or `"superior_brain"` -> CX_EPG fallback
- Adds `"pars_intercerebralis"` or `"median_neurosecretory"` -> DRIVE_HUNGER (neuropeptide F neurons)
- Adds `"fan_shaped"` or `"fan-shaped"` -> CX_FC
- Adds `"ellipsoid"` -> CX_EPG
- Adds `"noduli"` -> CX_PFN
- Better side-based leg motor neuron assignment using the `side` field from classification.csv

```python
def determine_group(flow: str, super_class: str, cls: str, sub_class: str, region: str, side: str = "") -> str:
    """Map classification fields to one of the 63 group names (59 named + 4 generic).

    Uses FlyWire classification.csv fields: flow, super_class, class, sub_class, side.
    Priority: specific class matches first, then super_class fallbacks, then region generic.
    """
    # Visual system
    if "visual" in cls or "optic" in cls or "visual" in super_class or "optic" in super_class:
        if "r1" in sub_class or "r6" in sub_class:
            return "VIS_R1R6"
        if "r7" in sub_class or "r8" in sub_class:
            return "VIS_R7R8"
        if "medulla" in sub_class or "tm" in sub_class or "mi" in sub_class:
            return "VIS_ME"
        if "lobula" in sub_class and "plate" in sub_class:
            return "VIS_LPTC"
        if "lptc" in sub_class or "tangential" in sub_class:
            return "VIS_LPTC"
        if "lc" in sub_class or "loom" in sub_class:
            return "VIS_LC"
        if "lobula" in sub_class or "lo" in sub_class:
            return "VIS_LO"
        # Default visual neuron to medulla (largest visual processing area)
        return "VIS_ME"

    # Olfactory system
    if "olfact" in cls or "olfact" in super_class:
        if "orn" in sub_class or "receptor" in sub_class:
            if "danger" in sub_class or "avers" in sub_class:
                return "OLF_ORN_DANGER"
            return "OLF_ORN_FOOD"
        if "ln" in sub_class or "local" in sub_class:
            return "OLF_LN"
        if "pn" in sub_class or "projection" in sub_class:
            return "OLF_PN"
        return "OLF_PN"

    # Gustatory system
    if "gustat" in cls or "gustat" in super_class:
        if "sweet" in sub_class or "sugar" in sub_class:
            return "GUS_GRN_SWEET"
        if "bitter" in sub_class:
            return "GUS_GRN_BITTER"
        if "water" in sub_class:
            return "GUS_GRN_WATER"
        return "GUS_GRN_SWEET"

    # Mechanosensory system
    if "mechano" in cls or "mechano" in super_class:
        if "bristle" in sub_class:
            return "MECH_BRISTLE"
        if "johnston" in sub_class or "jo" in sub_class:
            return "MECH_JO"
        if "chord" in sub_class or "propriocep" in sub_class:
            return "MECH_CHORD"
        if "antenna" in sub_class:
            return "ANTENNAL_MECH"
        return "MECH_BRISTLE"

    # Thermosensory system
    if "thermo" in cls or "thermo" in super_class:
        if "warm" in sub_class or "hot" in sub_class:
            return "THERMO_WARM"
        if "cool" in sub_class or "cold" in sub_class:
            return "THERMO_COOL"
        return "THERMO_WARM"

    # Nociceptive
    if "nocicep" in cls or "nocicep" in super_class:
        return "NOCI"

    # Mushroom body — Kenyon cells
    if "kenyon" in cls or "kenyon" in sub_class or "kc" == cls or ("kc" in sub_class and "kc" != "back"):
        return "MB_KC"

    # Mushroom body — other types
    if "mushroom" in cls or "mushroom" in super_class:
        if "apl" in sub_class:
            return "MB_APL"
        if "mbon" in sub_class or "output" in cls:
            if "avers" in sub_class or "avoid" in sub_class:
                return "MB_MBON_AV"
            return "MB_MBON_APP"
        if "dan" in sub_class or "dopamin" in sub_class:
            if "pun" in sub_class or "avers" in sub_class:
                return "MB_DAN_PUN"
            return "MB_DAN_REW"
        return "MB_KC"

    # Dopaminergic (outside mushroom body context)
    if "dopamin" in cls or "dopamin" in super_class:
        if "pun" in sub_class or "avers" in sub_class:
            return "MB_DAN_PUN"
        return "MB_DAN_REW"

    # Lateral horn
    if "lateral_horn" in cls or "lateral horn" in cls or "lateral_horn" in super_class or "lateral horn" in super_class:
        if "avers" in sub_class or "avoid" in sub_class:
            return "LH_AV"
        return "LH_APP"

    # Central complex — fan-shaped body
    if "fan_shaped" in cls or "fan-shaped" in cls or "fan_shaped" in sub_class:
        return "CX_FC"

    # Central complex — ellipsoid body
    if "ellipsoid" in cls or "ellipsoid" in sub_class:
        return "CX_EPG"

    # Central complex — noduli
    if "noduli" in cls or "noduli" in sub_class or "nodulus" in sub_class:
        return "CX_PFN"

    # Central complex — general
    if "central_complex" in cls or "central complex" in cls or "central_complex" in super_class or "central complex" in super_class:
        if "epg" in sub_class or "compass" in sub_class:
            return "CX_EPG"
        if "pfn" in sub_class or "path" in sub_class:
            return "CX_PFN"
        if "fc" in sub_class or "fan" in sub_class:
            return "CX_FC"
        if "hdelta" in sub_class or "heading" in sub_class:
            return "CX_HDELTA"
        return "CX_EPG"

    # SEZ/feeding/grooming
    if "subesophageal" in cls or "sez" in cls or "sez" in super_class:
        if "feed" in sub_class:
            return "SEZ_FEED"
        if "groom" in sub_class:
            return "SEZ_GROOM"
        if "water" in sub_class:
            return "SEZ_WATER"
        return "SEZ_FEED"

    # Ascending neurons
    if "ascending" in cls or "ascending" in super_class:
        return "GNG_DESC"

    # Descending neurons
    if "descend" in cls or "descend" in super_class:
        if "walk" in sub_class or "locomot" in sub_class:
            return "DN_WALK"
        if "flight" in sub_class or "fly" in sub_class:
            return "DN_FLIGHT"
        if "turn" in sub_class:
            return "DN_TURN"
        if "backup" in sub_class or "back" in sub_class:
            return "DN_BACKUP"
        if "startle" in sub_class or "escape" in sub_class or "giant" in sub_class:
            return "DN_STARTLE"
        return "GNG_DESC"

    # VNC / ventral nerve cord interneurons
    if "vnc" in cls or "ventral_nerve_cord" in cls or "vnc" in super_class:
        return "VNC_CPG"

    # Motor neurons
    if "motor" in cls or "motor" in super_class:
        if "leg" in sub_class:
            # Use side field for left/right assignment when available
            is_left = "left" in side or "_l" in side
            is_right = "right" in side or "_r" in side
            if "l1" in sub_class or "t1" in sub_class or "front" in sub_class:
                if is_right:
                    return "MN_LEG_R1"
                return "MN_LEG_L1"
            if "r1" in sub_class:
                return "MN_LEG_R1"
            if "l2" in sub_class or "t2" in sub_class or "mid" in sub_class:
                if is_right:
                    return "MN_LEG_R2"
                return "MN_LEG_L2"
            if "r2" in sub_class:
                return "MN_LEG_R2"
            if "l3" in sub_class or "t3" in sub_class or "hind" in sub_class:
                if is_right:
                    return "MN_LEG_R3"
                return "MN_LEG_L3"
            if "r3" in sub_class:
                return "MN_LEG_R3"
            # No segment info: use side to distribute evenly
            if is_right:
                return "MN_LEG_R2"
            return "MN_LEG_L2"
        if "wing" in sub_class or "flight" in sub_class:
            is_left = "left" in side or "_l" in side
            is_right = "right" in side or "_r" in side
            if is_right:
                return "MN_WING_R"
            return "MN_WING_L"
        if "proboscis" in sub_class:
            return "MN_PROBOSCIS"
        if "head" in sub_class or "neck" in sub_class:
            return "MN_HEAD"
        if "abdom" in sub_class:
            return "MN_ABDOMEN"
        return "VNC_CPG"

    # Clock neurons
    if "clock" in cls or "clock" in sub_class or "circadian" in cls or "circadian" in sub_class:
        return "CLOCK_DN"

    # GNG (gnathal ganglia)
    if "gnathal" in cls or "gnathal" in super_class:
        return "GNG_DESC"

    # Pars intercerebralis / neurosecretory (neuromodulatory neurons mapping to drives)
    if "pars_intercerebralis" in cls or "neurosecretory" in cls or "median_neurosecretory" in sub_class:
        return "DRIVE_HUNGER"

    # Superior brain / protocerebral neurons without more specific classification
    if "protocerebral" in cls or "superior_brain" in cls or "superior_medial" in cls:
        return "CX_EPG"

    # Drives (neuromodulatory neurons)
    if region == "drives":
        if "hunger" in sub_class or "npf" in sub_class or "hunger" in cls:
            return "DRIVE_HUNGER"
        if "fear" in sub_class or "alarm" in sub_class or "fear" in cls:
            return "DRIVE_FEAR"
        if "fatigue" in sub_class or "sleep" in sub_class or "fatigue" in cls:
            return "DRIVE_FATIGUE"
        if "curios" in sub_class or "explor" in sub_class or "curios" in cls:
            return "DRIVE_CURIOSITY"
        if "groom" in sub_class or "groom" in cls:
            return "DRIVE_GROOM"
        return "GENERIC_DRIVES"

    # Fallback
    return f"GENERIC_{region.upper()}"
```

#### Change 3: Update `classify_neurons()` to pass `side` field to `determine_group()`
- anchor: `def classify_neurons(path: Path, root_ids: list[str], id_to_index: dict[str, int]) -> tuple[list[int], list[int]]:`

In the `classify_neurons` function, after line `sub_class = row.get("sub_class", "").strip().lower()`, add:
```python
            side = row.get("side", "").strip().lower()
```

And change the `determine_group` call from:
```python
            group_name = determine_group(flow, super_class, cls, sub_class, region)
```
to:
```python
            group_name = determine_group(flow, super_class, cls, sub_class, region, side)
```

#### Change 4: Update `write_meta()` to include flat `group_sizes` array
- anchor: `def write_meta(path: Path, neuron_count: int, edge_count: int, neuron_region: list[int], neuron_group: list[int]) -> None:`

Replace the entire `write_meta` function body with:

```python
def write_meta(path: Path, neuron_count: int, edge_count: int, neuron_region: list[int], neuron_group: list[int]) -> None:
    """Write neuron_meta.json with group names, region assignments, neuron counts, and flat group_sizes array."""
    group_counts: dict[int, int] = defaultdict(int)
    for i in range(neuron_count):
        group_counts[neuron_group[i]] += 1
    groups = []
    for gid, (name, region) in enumerate(GROUPS):
        groups.append({"id": gid, "name": name, "region": region, "neuron_count": group_counts.get(gid, 0)})
    # Flat array indexed by group_id for efficient JS-side aggregation:
    # groupActivation[g] = sum(fireState[i] for i where groupId[i]==g) / group_sizes[g]
    group_sizes = [group_counts.get(gid, 0) for gid in range(len(GROUPS))]
    meta = {
        "neuron_count": neuron_count,
        "edge_count": edge_count,
        "region_types": {"sensory": 0, "central": 1, "drives": 2, "motor": 3},
        "group_count": len(GROUPS),
        "group_sizes": group_sizes,
        "groups": groups,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2)
    print(f"Wrote {path}", file=sys.stderr)
```

Logic changes from T7.1 version:
1. Build `group_sizes` as a flat list indexed by group_id (length = 63, one entry per group including generics)
2. Add `"group_count"` integer field (value: 63)
3. Add `"group_sizes"` flat array field
4. Keep existing `"groups"` array unchanged for backward compatibility

#### Change 5: Add `print_mapping_stats()` function after `classify_neurons`
- anchor: This is a new function. Add it immediately after the `classify_neurons` function definition (after line `return (neuron_region, neuron_group)`)

```python
def print_mapping_stats(neuron_count: int, neuron_region: list[int], neuron_group: list[int]) -> None:
    """Print mapping quality statistics to stderr."""
    region_names = {0: "sensory", 1: "central", 2: "drives", 3: "motor"}
    region_counts: dict[int, int] = defaultdict(int)
    group_counts: dict[int, int] = defaultdict(int)
    for i in range(neuron_count):
        region_counts[neuron_region[i]] += 1
        group_counts[neuron_group[i]] += 1

    print("\n=== Mapping Statistics ===", file=sys.stderr)
    print(f"Total neurons: {neuron_count}", file=sys.stderr)
    for rt, name in sorted(region_names.items()):
        print(f"  {name}: {region_counts.get(rt, 0)}", file=sys.stderr)

    generic_total = 0
    for gid in [GENERIC_GROUP["sensory"], GENERIC_GROUP["central"], GENERIC_GROUP["drives"], GENERIC_GROUP["motor"]]:
        generic_total += group_counts.get(gid, 0)
    print(f"Generic fallback neurons: {generic_total} ({100.0 * generic_total / neuron_count:.1f}%)", file=sys.stderr)

    print("Top 10 groups by neuron count:", file=sys.stderr)
    sorted_groups = sorted(group_counts.items(), key=lambda x: x[1], reverse=True)
    for gid, count in sorted_groups[:10]:
        name = GROUPS[gid][0]
        print(f"  {name}: {count}", file=sys.stderr)
    print("=========================\n", file=sys.stderr)
```

#### Change 6: Call `print_mapping_stats()` in `main()`
- anchor: `neuron_region, neuron_group = classify_neurons(args.data_dir / "classification.csv.gz", root_ids, id_to_index)`

Immediately after that line, add:
```python
    print_mapping_stats(len(root_ids), neuron_region, neuron_group)
```

So the main() function lines become:
```python
    neuron_region, neuron_group = classify_neurons(args.data_dir / "classification.csv.gz", root_ids, id_to_index)
    print_mapping_stats(len(root_ids), neuron_region, neuron_group)
    edges = aggregate_edges(args.data_dir / "connections.csv.gz", id_to_index, neuron_nt)
```

#### Imports / Dependencies
- No new imports needed. All existing imports (`defaultdict`, `csv`, `gzip`, `json`, `struct`, `sys`, `Path`, `argparse`) are sufficient.

#### Wiring / Integration
- `determine_group()` gains a new optional parameter `side: str = ""` — this is backward compatible; existing calls without `side` still work.
- `classify_neurons()` now reads the `side` column from classification.csv and passes it to `determine_group()`.
- `write_meta()` now outputs two additional fields in neuron_meta.json: `group_count` (int) and `group_sizes` (flat array).
- `print_mapping_stats()` is called from `main()` after classification, before edge aggregation. It writes to stderr only (no file output changes).
- The binary file format is UNCHANGED — still: header (uint32 neuron_count, uint32 edge_count) + edges (uint32 pre, uint32 post, float32 weight) + per-neuron metadata (uint8 region_type, uint16 group_id).

## Verification
- build: `python3 scripts/build_connectome.py --help` (verify script parses args without error)
- lint: `python3 -c "import py_compile; py_compile.compile('scripts/build_connectome.py', doraise=True)"` (verify no syntax errors)
- test: no existing tests (data CSV files are not present in repo — script cannot run end-to-end without them)
- smoke: `python3 -c "from scripts.build_connectome import determine_group, determine_region, GROUP_NAME_TO_ID, GROUPS; assert determine_region('sensory', '') == 'sensory'; assert determine_region('intrinsic', '') == 'central'; assert determine_region('intrinsic', 'endocrine') == 'drives'; assert determine_region('motor', '') == 'motor'; assert determine_group('sensory', 'visual', 'visual', 'medulla', 'sensory') == 'VIS_ME'; assert determine_group('intrinsic', '', 'kenyon_cell', '', 'central') == 'MB_KC'; assert determine_group('intrinsic', '', 'fan_shaped', '', 'central') == 'CX_FC'; assert determine_group('intrinsic', '', 'ascending', '', 'central') == 'GNG_DESC'; assert determine_group('motor', 'motor', 'motor', 'leg', 'motor', 'right') == 'MN_LEG_R2'; assert determine_group('intrinsic', '', 'vnc', '', 'central') == 'VNC_CPG'; assert determine_group('', '', '', '', 'central') == 'GENERIC_CENTRAL'; assert len(GROUPS) == 63; assert GROUP_NAME_TO_ID['VIS_R1R6'] == 0; assert GROUP_NAME_TO_ID['GENERIC_MOTOR'] == 62; print('All smoke tests passed')"`

## Constraints
- Do NOT modify any JavaScript files (js/connectome.js, js/constants.js, js/fly-logic.js, etc.)
- Do NOT modify SPEC.md, TASKS.md, or any .buildloop/ files other than current-plan.md
- Do NOT change the binary file format (header + edges + per-neuron metadata layout must remain identical)
- Do NOT add new Python package dependencies — use only stdlib modules
- Do NOT rename or remove any existing group from the GROUPS list — only the mapping logic and metadata output change
- Do NOT change the order of groups in the GROUPS list (group_id assignments 0-62 must remain stable)
- The `side` parameter in `determine_group()` MUST have a default value of `""` so existing calls without it still work
