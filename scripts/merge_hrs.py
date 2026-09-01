#!/usr/bin/env python3
"""
merge_hrs.py — fold the HRS mapping + detail catalog into public/huts.json.

Consumes:
  data/hr_mapping.json  (from match_huts.py) — uses only rows that are band=="auto"
                        OR verified==true, and have a non-null osm_id
  data/hrs_huts.json    (from build_hrs_catalog.py) — the rich per-hut detail

For each linked OSM hut it SETS hr_hut_id (the field already exists, null, in
huts.json) and ADDS the HRS-derived fields below. It does not touch region,
elevation, or any other existing field — non-destructive, re-runnable. The one
refinement it makes to an existing field: association is set to "alpine_club"
for linked huts, since presence on the alpine-club reservation system with a club
tenant is authoritative (more reliable than the OSM operator guess).

Run from the project root:  python3 scripts/merge_hrs.py
"""

import json
import shutil
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HUTS = ROOT / "public" / "huts.json"
MAP = ROOT / "data" / "hr_mapping.json"
HRS = ROOT / "data" / "hrs_huts.json"


def main():
    huts = json.loads(HUTS.read_text(encoding="utf-8"))
    mapping = json.loads(MAP.read_text(encoding="utf-8"))
    hrs = {r["hr_hut_id"]: r for r in json.loads(HRS.read_text(encoding="utf-8"))}
    by_osm = {h["id"]: h for h in huts}

    # rows we trust: auto, or hand-verified; and actually linked
    use = [m for m in mapping if m.get("osm_id") and (m.get("band") == "auto" or m.get("verified"))]
    print(f"{len(huts)} huts | {len(mapping)} mapping rows | {len(use)} linked (auto + verified)")

    linked = assoc_changed = 0
    seen_osm = Counter(m["osm_id"] for m in use)
    for m in use:
        hut = by_osm.get(m["osm_id"])
        rec = hrs.get(m["hr_hut_id"])
        if hut is None or rec is None:
            print(f"  ! skip: osm {m['osm_id']} / hr {m['hr_hut_id']} not found")
            continue
        if seen_osm[m["osm_id"]] > 1:
            print(f"  ! two HRS ids map to {m['osm_id']} ({hut['name']}) — using {m['hr_hut_id']}, check this")

        hut["hr_hut_id"] = m["hr_hut_id"]
        hut["club"] = rec.get("association")                 # OEAV / DAV / AVS / ...
        if hut.get("association") != "alpine_club":
            hut["association"] = "alpine_club"
            assoc_changed += 1
        hut["hr_capacity"] = rec.get("capacity")
        hut["hr_bed_categories"] = rec.get("bed_categories")  # [{id,label,places}] — decodes availability
        hut["hr_dogs"] = rec.get("dogs")
        hut["hr_payment"] = rec.get("payment")
        hut["hr_booking_url"] = rec.get("booking_url")
        hut["hr_price_pdf"] = rec.get("price_pdf")
        hut["hr_half_board_eur"] = rec.get("half_board_eur")
        hut["hr_photo"] = rec.get("photo")
        hut["hr_notes"] = rec.get("notes")
        # fill contact gaps only where OSM had nothing
        if not hut.get("website") and rec.get("website"):
            hut["website"] = rec["website"]
        if not hut.get("phone") and rec.get("phone"):
            hut["phone"] = rec["phone"]
        linked += 1

    shutil.copy(HUTS, HUTS.with_suffix(".json.hrsbak"))
    HUTS.write_text(json.dumps(huts, ensure_ascii=False, indent=2), encoding="utf-8")

    club = Counter(h.get("club") for h in huts if h.get("hr_hut_id"))
    print(f"\nLinked {linked} huts | association upgraded to alpine_club on {assoc_changed}")
    print("club (tenantCode):", dict(club))
    print("with hr_capacity:", sum(1 for h in huts if h.get("hr_capacity")))
    print("with dog policy: ", sum(1 for h in huts if h.get("hr_dogs") is not None))
    print("with price PDF:  ", sum(1 for h in huts if h.get("hr_price_pdf")))
    print(f"\nWrote {HUTS}  (backup: {HUTS.with_suffix('.json.hrsbak')})")


if __name__ == "__main__":
    main()
