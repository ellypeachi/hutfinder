#!/usr/bin/env python3
"""
fetch_availability.py — build public/availability.json, a compact daily snapshot
of bed availability for every bookable hut, split by room type.

Room types across huts are messy (Matratzenlager, Mehrbettzimmer, Zweierzimmer,
Dormitory, Double room, …), so we normalise every category into three buckets:
  index 0 = dormitory   (Matratzenlager / mass sleeping)
  index 1 = shared room (Mehrbettzimmer / multi-bed rooms)
  index 2 = private     (double / single / family rooms)

The classification happens here, once, from each hut's hr_bed_categories in
huts.json — the app just reads the numbers.

Run from the project root:  python3 scripts/fetch_availability.py

Format:
  { "generated": "...Z", "window_days": 120,
    "huts": { "491": { "cap": 89, "caps": [50,16,6],
                       "days": { "2026-09-01": [15,4,2], ... } } } }
  days value is [dorm, shared, private] free beds on that (open) night.
  caps is the same three buckets' total capacity. A date absent = closed.
"""

import json
import sys
import time
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HUTS = ROOT / "public" / "huts.json"
OUT = ROOT / "public" / "availability.json"
BASE = "https://www.hut-reservation.org/api/v1/reservation/getHutAvailability"
HEADERS = {"User-Agent": "hutfinder/0.1 (mountain-hut finder)", "Accept": "application/json"}
WINDOW_DAYS = 120
PAUSE = 0.4

DORM, SHARED, PRIV = 0, 1, 2


def bucket_of(label):
    """Map a room-category label to a bucket index."""
    s = (label or "").lower()
    if any(k in s for k in ("dorm", "matratzen", "lager", "mattress", "camp")):
        return DORM
    if any(
        k in s
        for k in (
            "doppel", "double", "zweier", "zweibett", "2er", "2-bett", "twin",
            "einzel", "single", "family", "familien", "privat", "private",
        )
    ):
        return PRIV
    return SHARED  # Mehrbettzimmer / generic Zimmer / room / unknown


def fetch(hid):
    req = urllib.request.Request(f"{BASE}?hutId={hid}&step=WIZARD", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main():
    huts = json.loads(HUTS.read_text(encoding="utf-8"))

    # per-hut: category-id -> bucket index, and bucket capacities
    catmap, capmap = {}, {}
    for h in huts:
        hid = h.get("hr_hut_id")
        if not hid:
            continue
        cm, cp = {}, [0, 0, 0]
        for c in h.get("hr_bed_categories") or []:
            idx = bucket_of(c.get("label"))
            cm[str(c.get("id"))] = idx
            cp[idx] += c.get("places") or 0
        catmap[hid] = cm
        capmap[hid] = cp

    ids = sorted(catmap)
    print(f"{len(ids)} bookable huts")

    today = date.today()
    cutoff = today.toordinal() + WINDOW_DAYS
    out = {}
    ok = fail = 0

    for hid in ids:
        try:
            data = fetch(hid)
        except Exception as e:
            print(f"  x {hid}: {e}", file=sys.stderr)
            fail += 1
            time.sleep(PAUSE)
            continue

        cm = catmap.get(hid, {})
        days, cap = {}, None
        for d in data if isinstance(data, list) else []:
            if d.get("hutStatus") != "SERVICED":
                continue
            ds = (d.get("date") or "")[:10]
            try:
                dd = date.fromisoformat(ds)
            except ValueError:
                continue
            if dd < today or dd.toordinal() > cutoff:
                continue
            buckets = [0, 0, 0]
            for cid, free in (d.get("freeBedsPerCategory") or {}).items():
                idx = cm.get(str(cid), SHARED)  # unknown category -> shared
                buckets[idx] += free or 0
            days[ds] = buckets
            cap = cap or d.get("totalSleepingPlaces")

        out[str(hid)] = {"cap": cap, "caps": capmap.get(hid, [0, 0, 0]), "days": days}
        ok += 1
        print(f"  ✓ {hid}: {len(days)} open days")
        time.sleep(PAUSE)

    snap = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "window_days": WINDOW_DAYS,
        "huts": out,
    }
    OUT.write_text(json.dumps(snap, ensure_ascii=False), encoding="utf-8")
    print(f"\nfetched {ok}, failed {fail}. Wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
