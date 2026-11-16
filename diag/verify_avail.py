"""Compare public/availability.json with hut-reservation.org right now, for every bookable hut."""
import json, sys, time, urllib.request, collections
from datetime import date
sys.path.insert(0, "scripts")
from fetch_availability import bucket_of, fetch, WINDOW_DAYS
huts = json.load(open("public/huts.json"))
snap = json.load(open("public/availability.json"))
print("snapshot generated", snap["generated"], "huts", len(snap["huts"]))
today = date.today(); cutoff = today.toordinal() + WINDOW_DAYS
st = collections.Counter(); unknown_cat = collections.Counter(); sum_mismatch = 0
same = diff = only_live = only_snap = 0; big = []; missing = []; checked = 0
for h in huts:
    hid = h.get("hr_hut_id")
    if not hid: continue
    cm = {str(c["id"]): bucket_of(c.get("label")) for c in h.get("hr_bed_categories") or []}
    try: data = fetch(hid)
    except Exception as e: print("x", hid, e); continue
    checked += 1
    live = {}
    for d in data:
        st[d.get("hutStatus")] += 1
        if d.get("hutStatus") != "SERVICED": continue
        ds = d["date"][:10]; dd = date.fromisoformat(ds)
        if dd < today or dd.toordinal() > cutoff: continue
        b = [0, 0, 0]
        for cid, free in (d.get("freeBedsPerCategory") or {}).items():
            if str(cid) not in cm: unknown_cat[(hid, h["name"], cid)] += 1
            b[cm.get(str(cid), 1)] += free or 0
        if d.get("freeBeds") is not None and d["freeBeds"] != sum(b): sum_mismatch += 1
        live[ds] = b
    rec = snap["huts"].get(str(hid))
    if rec is None: missing.append((hid, h["name"])); continue
    sd = rec["days"]
    for ds in set(live) | set(sd):
        if ds in live and ds in sd:
            if live[ds] == sd[ds]: same += 1
            else:
                diff += 1
                if abs(sum(live[ds]) - sum(sd[ds])) > 5: big.append((h["name"], ds, sd[ds], live[ds]))
        elif ds in live: only_live += 1
        else: only_snap += 1
    time.sleep(0.3)
print(f"checked {checked} huts; missing from snapshot: {missing}")
print(f"nights identical {same}, changed since snapshot {diff} (>5 beds: {len(big)}), open now but absent in snapshot {only_live}, in snapshot but not open now {only_snap}")
for b in big[:15]: print("  big change", b)
print("hutStatus values:", dict(st))
print("freeBeds != sum of categories:", sum_mismatch)
print("category ids not in huts.json (would be counted as shared rooms):", len(unknown_cat))
for k, v in list(unknown_cat.items())[:30]: print("  ", k, v, "nights")
