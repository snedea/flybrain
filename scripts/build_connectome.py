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


def determine_region(flow: str, super_class: str) -> str:
    """Map flow and super_class fields to one of the 4 region names."""
    if flow == "sensory":
        return "sensory"
    if flow == "motor":
        return "motor"
    if super_class.startswith("motor") or super_class == "motor":
        return "motor"
    if super_class.startswith("descending") or super_class == "descending":
        return "motor"
    if "endocrine" in super_class or "modulatory" in super_class:
        return "drives"
    return "central"


def determine_group(flow: str, super_class: str, cls: str, sub_class: str, region: str) -> str:
    """Map classification fields to one of the 63 group names (59 named + 4 generic)."""
    # Visual system
    if "visual" in cls or "visual" in super_class or "optic" in super_class:
        if "r1" in sub_class or "r6" in sub_class:
            return "VIS_R1R6"
        if "r7" in sub_class or "r8" in sub_class:
            return "VIS_R7R8"
        if "medulla" in sub_class or "tm" in sub_class or "mi" in sub_class:
            return "VIS_ME"
        if "lobula" in sub_class and "plate" in sub_class:
            return "VIS_LPTC"
        if "lc" in sub_class or "loom" in sub_class:
            return "VIS_LC"
        if "lobula" in sub_class or "lo" in sub_class:
            return "VIS_LO"
        if "lptc" in sub_class or "tangential" in sub_class:
            return "VIS_LPTC"
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

    # Mushroom body
    if "kenyon" in cls or "kenyon" in sub_class or "kc" in sub_class:
        return "MB_KC"
    if "mushroom" in cls or "mushroom" in super_class:
        if "apl" in sub_class:
            return "MB_APL"
        if "mbon" in sub_class:
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
    if "lateral_horn" in cls or "lateral horn" in cls or "lateral horn" in super_class:
        if "avers" in sub_class or "avoid" in sub_class:
            return "LH_AV"
        return "LH_APP"

    # Central complex
    if "central_complex" in cls or "central complex" in cls or "central complex" in super_class:
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
    if "subesophageal" in cls or "sez" in super_class:
        if "feed" in sub_class:
            return "SEZ_FEED"
        if "groom" in sub_class:
            return "SEZ_GROOM"
        if "water" in sub_class:
            return "SEZ_WATER"
        return "SEZ_FEED"

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

    # Motor neurons
    if "motor" in cls or "motor" in super_class:
        if "leg" in sub_class:
            if "l1" in sub_class or ("front" in sub_class and "left" in sub_class):
                return "MN_LEG_L1"
            if "r1" in sub_class or ("front" in sub_class and "right" in sub_class):
                return "MN_LEG_R1"
            if "l2" in sub_class or ("mid" in sub_class and "left" in sub_class):
                return "MN_LEG_L2"
            if "r2" in sub_class or ("mid" in sub_class and "right" in sub_class):
                return "MN_LEG_R2"
            if "l3" in sub_class or ("hind" in sub_class and "left" in sub_class):
                return "MN_LEG_L3"
            if "r3" in sub_class or ("hind" in sub_class and "right" in sub_class):
                return "MN_LEG_R3"
            return "MN_LEG_L1"
        if "wing" in sub_class:
            if "left" in sub_class or "_l" in sub_class:
                return "MN_WING_L"
            if "right" in sub_class or "_r" in sub_class:
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
    if "clock" in cls or "clock" in sub_class or "circadian" in sub_class:
        return "CLOCK_DN"

    # GNG
    if "gnathal" in cls or "gnathal" in super_class:
        return "GNG_DESC"

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
            region = determine_region(flow, super_class)
            neuron_region[idx] = REGION_NAME_TO_TYPE[region]
            group_name = determine_group(flow, super_class, cls, sub_class, region)
            neuron_group[idx] = GROUP_NAME_TO_ID[group_name]
            count += 1
    print(f"Classified {count} neurons from {path}", file=sys.stderr)
    return (neuron_region, neuron_group)


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
    """Write neuron_meta.json with group names, region assignments, and neuron counts."""
    group_counts: dict[int, int] = defaultdict(int)
    for i in range(neuron_count):
        group_counts[neuron_group[i]] += 1
    groups = []
    for gid, (name, region) in enumerate(GROUPS):
        groups.append({"id": gid, "name": name, "region": region, "neuron_count": group_counts.get(gid, 0)})
    meta = {
        "neuron_count": neuron_count,
        "edge_count": edge_count,
        "region_types": {"sensory": 0, "central": 1, "drives": 2, "motor": 3},
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
    edges = aggregate_edges(args.data_dir / "connections.csv.gz", id_to_index, neuron_nt)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    write_binary(args.output_dir / "connectome.bin.gz", len(root_ids), edges, neuron_region, neuron_group)
    write_meta(args.output_dir / "neuron_meta.json", len(root_ids), len(edges), neuron_region, neuron_group)

    print(f"Done: {len(root_ids)} neurons, {len(edges)} edges")
    print(f"Output: {args.output_dir}/connectome.bin.gz, {args.output_dir}/neuron_meta.json")


if __name__ == "__main__":
    main()
