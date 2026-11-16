import json, subprocess, sys, collections, urllib.request
from pathlib import Path
IDS = [121, 205, 309, 365, 475, 300]
p = Path("data/hrs_huts.json")
recs = json.loads(p.read_text(encoding="utf-8"))
p.write_text(json.dumps([r for r in recs if r["hr_hut_id"] not in IDS], ensure_ascii=False, indent=2), encoding="utf-8")
subprocess.run([sys.executable, "scripts/build_hrs_catalog.py"], check=True)
new = [r for r in json.loads(p.read_text(encoding="utf-8")) if r["hr_hut_id"] in IDS]
Path("/tmp/out").mkdir(exist_ok=True)
Path("/tmp/out/refetched.json").write_text(json.dumps(new, ensure_ascii=False, indent=2), encoding="utf-8")
for r in new: print(r["hr_hut_id"], r["name"], r.get("bed_categories"))
# Unserviced nights: which huts, and are they bookable?
sys.path.insert(0, "scripts")
from fetch_availability import fetch
huts = json.load(open("public/huts.json"))
seen = collections.Counter(); ex = {}
for h in huts:
    hid = h.get("hr_hut_id")
    if not hid: continue
    for d in fetch(hid):
        if d.get("hutStatus") == "UNSERVICED" and d["date"][:10] >= "2026-11-16":
            seen[(hid, h["name"])] += 1
            if hid not in ex: ex[hid] = d
for (hid, name), n in seen.most_common(40):
    d = ex[hid]; print("UNSERVICED", hid, name, n, "nights; sample", d["date"][:10], "freeBeds", d.get("freeBeds"), d.get("freeBedsPerCategory"), [c for c in (next(x for x in huts if x.get("hr_hut_id")==hid).get("hr_bed_categories") or [])])
