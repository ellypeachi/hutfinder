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
print("REFETCHED_JSON_START")
print(json.dumps(new, ensure_ascii=False))
print("REFETCHED_JSON_END")
