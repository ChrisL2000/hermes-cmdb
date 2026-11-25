#!/usr/bin/env python3
"""Validate the CMDB data set.

Checks the two files that make the viewer work:

  data/osi.json   the model: 7 layers, each with sub-layers
  data/cmdb.json  the inventory: hosts, CIs, links

Rules enforced
  * schema tags present and matching
  * layer numbers are exactly 1..7, ids unique
  * sub-layer ids globally unique, every layer has at least one
  * every CI references an existing layer number and sub-layer id
  * every CI host references a declared host (or the literal "lab")
  * link endpoints reference a host id
  * no duplicate CI ids

Exit code 0 = clean, 1 = problems (printed one per line).
"""

from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OSI = ROOT / "data" / "osi.json"
CMDB = ROOT / "data" / "cmdb.json"

RAW_HOST_ALIASES = {"lab"}


def load(path: Path) -> dict:
    with path.open(encoding="utf-8") as fh:
        return json.load(fh)


def validate(osi: dict, cmdb: dict) -> list[str]:
    errors: list[str] = []

    if osi.get("schema") != "cmdb.osi/v1":
        errors.append(f"osi.json: unexpected schema {osi.get('schema')!r}")
    if cmdb.get("schema") != "cmdb/v1":
        errors.append(f"cmdb.json: unexpected schema {cmdb.get('schema')!r}")

    layers = osi.get("layers") or []
    nums = [l.get("num") for l in layers]
    if sorted(nums) != list(range(1, 8)):
        errors.append(f"osi.json: layer numbers must be 1..7, got {sorted(nums)}")
    ids = [l.get("id") for l in layers]
    if len(set(ids)) != len(ids):
        errors.append("osi.json: duplicate layer ids")

    sub_ids: set[str] = set()
    sub_to_layer: dict[str, int] = {}
    for layer in layers:
        subs = layer.get("sublayers") or []
        if not subs:
            errors.append(f"osi.json: layer {layer.get('id')} has no sub-layers")
        for sub in subs:
            sid = sub.get("id")
            if not sid:
                errors.append(f"osi.json: layer {layer.get('id')} has a sub-layer without id")
                continue
            if sid in sub_ids:
                errors.append(f"osi.json: duplicate sub-layer id {sid}")
            sub_ids.add(sid)
            sub_to_layer[sid] = layer["num"]
            for field in ("name", "discipline", "detail"):
                if not sub.get(field):
                    errors.append(f"osi.json: sub-layer {sid} missing {field}")
        for field in ("name", "discipline", "color", "summary"):
            if not layer.get(field):
                errors.append(f"osi.json: layer {layer.get('id')} missing {field}")

    host_ids = {h.get("id") for h in cmdb.get("hosts") or []}
    host_ids |= RAW_HOST_ALIASES
    if len(host_ids) < 2:
        errors.append("cmdb.json: expected multiple hosts")

    cis = cmdb.get("cis") or []
    ci_ids = [c.get("id") for c in cis]
    for dup, count in Counter(ci_ids).items():
        if count > 1:
            errors.append(f"cmdb.json: duplicate ci id {dup}")

    for ci in cis:
        cid = ci.get("id", "<no id>")
        layer_num = ci.get("layer")
        if layer_num not in range(1, 8):
            errors.append(f"cmdb.json: {cid} has bad layer {layer_num!r}")
            continue
        sub = ci.get("sublayer")
        if sub not in sub_ids:
            errors.append(f"cmdb.json: {cid} references unknown sub-layer {sub!r}")
        elif sub_to_layer.get(sub) != layer_num:
            errors.append(
                f"cmdb.json: {cid} layer {layer_num} disagrees with sub-layer {sub} "
                f"(belongs to {sub_to_layer.get(sub)})"
            )
        if ci.get("host") not in host_ids:
            errors.append(f"cmdb.json: {cid} references unknown host {ci.get('host')!r}")
        if not ci.get("name"):
            errors.append(f"cmdb.json: {cid} has no name")

    for link in cmdb.get("links") or []:
        for end in ("from", "to"):
            if link.get(end) not in host_ids:
                errors.append(f"cmdb.json: link {link} has unknown {end} endpoint")

    return errors


def report(osi: dict, cmdb: dict) -> str:
    by_layer = Counter(c["layer"] for c in cmdb["cis"])
    names = {l["num"]: l["name"] for l in osi["layers"]}
    lines = [f"{'L':<3}{'layer':<18}{'sub-layers':>11}{'CIs':>6}"]
    for num in range(1, 8):
        layer = next(l for l in osi["layers"] if l["num"] == num)
        lines.append(f"{num:<3}{names[num]:<18}{len(layer['sublayers']):>11}{by_layer.get(num, 0):>6}")
    lines.append(f"{'':<3}{'TOTAL':<18}{sum(len(l['sublayers']) for l in osi['layers']):>11}{len(cmdb['cis']):>6}")
    return "\n".join(lines)


def main() -> int:
    osi, cmdb = load(OSI), load(CMDB)
    errors = validate(osi, cmdb)
    print(report(osi, cmdb))
    if errors:
        print("\nPROBLEMS:")
        for e in errors:
            print(" -", e)
        return 1
    print("\nOK: data set is consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
