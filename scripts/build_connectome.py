from __future__ import annotations

import argparse
import csv
import gzip
import json
import struct
import sys
from collections import defaultdict
from pathlib import Path

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


def load_neurons(path: Path) -> tuple[list[str], dict[str, str]]:
    """Load neurons.csv.gz to get the canonical list of root_ids and each neuron's nt_type."""
    root_ids: list[str] = []
    neuron_nt: dict[str, str] = {}
    with gzip.open(path, "rt", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rid = row["root_id"]
            root_ids.append(rid)
            neuron_nt[rid] = row["nt_type"].strip().upper()
    print(f"Loaded {len(root_ids)} neurons from {path}", file=sys.stderr)
    return (root_ids, neuron_nt)


def build_index(root_ids: list[str]) -> dict[str, int]:
    """Create a mapping from root_id string to contiguous index 0..N-1."""
    return {rid: i for i, rid in enumerate(root_ids)}


def region_from_group(group_name: str) -> str:
    """Derive region from the group's definition in GROUPS, not from the flow field.

    FlyWire uses flow=afferent/intrinsic/efferent, not sensory/central/motor,
    so deriving region from flow misclassifies most neurons. The GROUPS table
    already defines the correct region for every group name.
    """
    gid = GROUP_NAME_TO_ID.get(group_name)
    if gid is not None:
        return GROUPS[gid][1]
    return "central"


def determine_group(flow: str, super_class: str, cls: str, sub_class: str, region: str, side: str = "") -> str:
    """Map classification fields to one of the 63 group names (59 named + 4 generic).

    Uses FlyWire classification.csv fields: flow, super_class, class, sub_class, side.
    Tuned to actual FlyWire FAFB v783 field values (abbreviations like cx, dan, mbon,
    sub_class values like photo_receptor, eye_bristle, wind_gravity, etc.).
    """
    # --- Visual system ---
    # FlyWire: super_class=optic (class=optic_lobe_intrinsic), super_class=visual_projection,
    #          super_class=visual_centrifugal, class=visual (afferent photoreceptors)
    if "visual" in cls or "optic" in cls or "visual" in super_class or "optic" in super_class:
        if "photo_receptor" in sub_class or "photo" in sub_class:
            # Photoreceptors: R1-R6 (broadband) vs R7-R8 (color/UV)
            if "r7" in sub_class or "r8" in sub_class or "uv" in sub_class or "pale" in sub_class:
                return "VIS_R7R8"
            return "VIS_R1R6"
        if "ocellar" in sub_class or "ocellar" in cls:
            return "VIS_R1R6"
        if "lptc" in sub_class or "tangential" in sub_class:
            return "VIS_LPTC"
        if "lc" in sub_class or "loom" in sub_class or "lobula_columnar" in sub_class:
            return "VIS_LC"
        if "lobula" in sub_class and "plate" in sub_class:
            return "VIS_LPTC"
        if "lobula" in sub_class or sub_class == "lo":
            return "VIS_LO"
        if "medulla" in sub_class or "tm" in sub_class or "mi" in sub_class:
            return "VIS_ME"
        # Default visual/optic to medulla (largest visual processing area)
        return "VIS_ME"

    # --- Olfactory system ---
    # FlyWire: class=olfactory (afferent), class=alpn/alln (central projection/local neurons)
    if "olfact" in cls:
        if "pheromone" in sub_class or "avers" in sub_class or "danger" in sub_class:
            return "OLF_ORN_DANGER"
        return "OLF_ORN_FOOD"
    if cls == "alpn":
        return "OLF_PN"
    if cls == "alln":
        return "OLF_LN"

    # --- Gustatory system ---
    # FlyWire: class=gustatory (afferent), sub_class includes sugar/water, bitter, taste_peg
    if "gustat" in cls:
        if "bitter" in sub_class:
            return "GUS_GRN_BITTER"
        if "water" in sub_class:
            return "GUS_GRN_WATER"
        return "GUS_GRN_SWEET"

    # --- Mechanosensory system ---
    # FlyWire: class=mechanosensory, sub_class: eye_bristle, head_bristle, wind_gravity,
    #          auditory, grooming, taste_peg
    if "mechano" in cls:
        if "wind" in sub_class or "gravity" in sub_class or "auditory" in sub_class:
            return "MECH_JO"
        if "groom" in sub_class:
            return "MECH_BRISTLE"
        if "bristle" in sub_class or "taste_peg" in sub_class:
            return "MECH_BRISTLE"
        if "chord" in sub_class or "propriocep" in sub_class:
            return "MECH_CHORD"
        if "antenna" in sub_class:
            return "ANTENNAL_MECH"
        return "MECH_BRISTLE"

    # --- Thermosensory ---
    # FlyWire: class=thermosensory
    if "thermo" in cls:
        if "cool" in sub_class or "cold" in sub_class:
            return "THERMO_COOL"
        return "THERMO_WARM"

    # --- Hygrosensory -> thermosensory ---
    # FlyWire: class=hygrosensory, sub_class: dry, moist
    if "hygro" in cls:
        if "dry" in sub_class:
            return "THERMO_WARM"
        return "THERMO_COOL"

    # --- Nociceptive ---
    if "nocicep" in cls:
        return "NOCI"

    # --- Unknown sensory -> generic sensory ---
    if "unknown_sensory" in cls:
        return "MECH_BRISTLE"

    # --- Mushroom body: Kenyon cells ---
    # FlyWire: class=kenyon_cell, sub_class: kcg, kca, kcab, etc.
    if "kenyon" in cls or cls == "kc":
        return "MB_KC"

    # --- Mushroom body output neurons (MBONs) ---
    # FlyWire: class=mbon (central intrinsic)
    if cls == "mbon":
        return "MB_MBON_APP"

    # --- Mushroom body input neurons (MBINs) ---
    if cls == "mbin":
        return "MB_DAN_REW"

    # --- Dopaminergic neurons (DANs) ---
    # FlyWire: class=dan (central intrinsic)
    if cls == "dan":
        return "MB_DAN_REW"

    # --- Lateral horn ---
    # FlyWire: class=lhln (local), class=lhcent (centrifugal)
    if cls == "lhln" or cls == "lhcent":
        return "LH_APP"

    # --- Central complex ---
    # FlyWire: class=cx, sub_class: columnar, tangential, ring_neuron
    if cls == "cx":
        if "ring" in sub_class:
            return "CX_EPG"
        if "tangential" in sub_class:
            return "CX_HDELTA"
        if "columnar" in sub_class:
            return "CX_PFN"
        return "CX_FC"

    # --- Antennal lobe interneurons ---
    if cls == "alin":
        return "OLF_LN"
    if cls == "alon":
        return "OLF_PN"

    # --- TuBu neurons (tubercle to bulb, visual -> CX pathway) ---
    if cls == "tubu":
        return "CX_EPG"

    # --- TPN (taste projection neurons) ---
    if cls == "tpn":
        if "water" in sub_class:
            return "GUS_GRN_WATER"
        return "GUS_GRN_SWEET"

    # --- MAL (medial accessory lobe) neurons ---
    if cls == "mal":
        return "CX_FC"

    # --- Ascending neurons ---
    # FlyWire: super_class=ascending or sensory_ascending, class=an
    if "ascending" in super_class or cls == "an":
        return "GNG_DESC"

    # --- Descending neurons ---
    # FlyWire: super_class=descending, class is usually empty, sub_class has dn subtypes
    if "descend" in super_class or "descend" in cls:
        if "dn1p" in sub_class:
            return "DN_STARTLE"
        if "dn3" in sub_class:
            return "DN_WALK"
        if "walk" in sub_class or "locomot" in sub_class:
            return "DN_WALK"
        if "flight" in sub_class:
            return "DN_FLIGHT"
        if "turn" in sub_class:
            return "DN_TURN"
        if "back" in sub_class:
            return "DN_BACKUP"
        if "startle" in sub_class or "escape" in sub_class or "giant" in sub_class:
            return "DN_STARTLE"
        return "GNG_DESC"

    # --- Motor neurons ---
    # FlyWire FAFB brain-only: class=brain_motor_neuron. No VNC leg/wing motor neurons.
    if "motor" in cls or "motor" in super_class:
        if "proboscis" in sub_class:
            return "MN_PROBOSCIS"
        if "neck" in sub_class or "head" in sub_class:
            return "MN_HEAD"
        if "abdom" in sub_class or "crop" in sub_class:
            return "MN_ABDOMEN"
        if "ingestion" in sub_class or "haustellum" in sub_class or "salivary" in sub_class:
            return "SEZ_FEED"
        if "eye" in sub_class or "antenna" in sub_class:
            return "MN_HEAD"
        return "VNC_CPG"

    # --- Clock neurons ---
    if "clock" in cls or "circadian" in cls:
        return "CLOCK_DN"

    # --- Endocrine / neurosecretory ---
    # FlyWire: super_class=endocrine, class=pars_intercerebralis or pars_lateralis
    if "endocrine" in super_class:
        if "pars_lateralis" in cls:
            return "DRIVE_FATIGUE"
        return "DRIVE_HUNGER"

    # --- Fallback: use flow to pick a region-appropriate generic ---
    if flow == "afferent":
        return "GENERIC_SENSORY"
    if flow == "efferent":
        return "GENERIC_MOTOR"
    return "GENERIC_CENTRAL"


def classify_neurons(path: Path, root_ids: list[str], id_to_index: dict[str, int]) -> tuple[list[int], list[int]]:
    """Read classification.csv.gz and assign each neuron a region_type and group_id."""
    neuron_region: list[int] = [1] * len(root_ids)
    neuron_group: list[int] = [GENERIC_GROUP["central"]] * len(root_ids)
    count = 0
    with gzip.open(path, "rt", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rid = row["root_id"]
            if rid not in id_to_index:
                continue
            idx = id_to_index[rid]
            flow = row.get("flow", "").strip().lower()
            super_class = row.get("super_class", "").strip().lower()
            cls = row.get("class", "").strip().lower()
            sub_class = row.get("sub_class", "").strip().lower()
            side = row.get("side", "").strip().lower()
            group_name = determine_group(flow, super_class, cls, sub_class, "central", side)
            region = region_from_group(group_name)
            neuron_region[idx] = REGION_NAME_TO_TYPE[region]
            neuron_group[idx] = GROUP_NAME_TO_ID[group_name]
            count += 1
    print(f"Classified {count} neurons from {path}", file=sys.stderr)
    return (neuron_region, neuron_group)


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


def aggregate_edges(path: Path, id_to_index: dict[str, int], neuron_nt: dict[str, str]) -> list[tuple[int, int, float]]:
    """Read connections.csv.gz, aggregate syn_count across neuropils, apply nt_type sign."""
    edge_sums: dict[tuple[int, int], float] = defaultdict(float)
    skipped = 0
    unknown_nt = 0
    with gzip.open(path, "rt", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            pre_rid = row["pre_root_id"]
            post_rid = row["post_root_id"]
            if pre_rid not in id_to_index or post_rid not in id_to_index:
                skipped += 1
                continue
            pre_idx = id_to_index[pre_rid]
            post_idx = id_to_index[post_rid]
            syn_count = int(row["syn_count"])
            nt = row["nt_type"].strip().upper()
            sign = NT_SIGN.get(nt, None)
            if sign is None:
                sign = 1.0
                unknown_nt += 1
            edge_sums[(pre_idx, post_idx)] += syn_count * sign
    edges = [(pre, post, weight) for (pre, post), weight in edge_sums.items() if weight != 0.0]
    edges.sort()
    print(f"Aggregated {len(edges)} edges from {path} (skipped {skipped} rows with unknown root_ids, {unknown_nt} rows with unknown nt_type)", file=sys.stderr)
    return edges


def write_binary(path: Path, neuron_count: int, edges: list[tuple[int, int, float]], neuron_region: list[int], neuron_group: list[int]) -> None:
    """Write the connectome.bin.gz binary file."""
    with gzip.open(path, "wb", compresslevel=9) as f:
        f.write(struct.pack("<II", neuron_count, len(edges)))
        for pre, post, weight in edges:
            f.write(struct.pack("<IIf", pre, post, weight))
        for i in range(neuron_count):
            f.write(struct.pack("<BH", neuron_region[i], neuron_group[i]))
    file_size = path.stat().st_size
    print(f"Wrote {path} ({file_size / 1024 / 1024:.1f} MB)", file=sys.stderr)


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


def main() -> None:
    """Entry point. Parses args, orchestrates the pipeline, writes output files."""
    parser = argparse.ArgumentParser(description="Build FlyWire connectome binary and metadata")
    parser.add_argument("--data-dir", type=Path, default=Path("data"), help="Directory containing CSV files")
    parser.add_argument("--output-dir", type=Path, default=Path("data"), help="Directory for output files")
    args = parser.parse_args()

    required_files = [
        args.data_dir / "connections.csv.gz",
        args.data_dir / "neurons.csv.gz",
        args.data_dir / "classification.csv.gz",
    ]
    for filepath in required_files:
        if not filepath.exists():
            print(f"Error: Missing {filepath}. Place FlyWire CSV files in {args.data_dir}/", file=sys.stderr)
            sys.exit(1)

    root_ids, neuron_nt = load_neurons(args.data_dir / "neurons.csv.gz")
    id_to_index = build_index(root_ids)
    neuron_region, neuron_group = classify_neurons(args.data_dir / "classification.csv.gz", root_ids, id_to_index)
    print_mapping_stats(len(root_ids), neuron_region, neuron_group)
    edges = aggregate_edges(args.data_dir / "connections.csv.gz", id_to_index, neuron_nt)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    write_binary(args.output_dir / "connectome.bin.gz", len(root_ids), edges, neuron_region, neuron_group)
    write_meta(args.output_dir / "neuron_meta.json", len(root_ids), len(edges), neuron_region, neuron_group)

    print(f"Done: {len(root_ids)} neurons, {len(edges)} edges")
    print(f"Output: {args.output_dir}/connectome.bin.gz, {args.output_dir}/neuron_meta.json")


if __name__ == "__main__":
    main()
