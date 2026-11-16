import json, urllib.request, sys
sys.path.insert(0, "scripts")
from fetch_availability import fetch
H = {"User-Agent": "hutfinder/0.1 (live check)"}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=30).read().decode("utf-8")
B = "https://www.hutfinder.at"
a = json.loads(get(B + "/availability.json"))
print("live availability generated", a["generated"], "huts", len(a["huts"]), "with open nights", sum(1 for v in a["huts"].values() if v["days"]))
huts = json.loads(get(B + "/huts.json"))
huts = huts if isinstance(huts, list) else huts.get("huts")
print("live huts.json:", len(huts), "huts; Oberwalderhütte:", [h.get("hr_hut_id") for h in huts if h["id"] == "r14435621"], "; with seasons:", sum(1 for h in huts if h.get("seasons")))
for path, want in [("/en/hut/oberwalderhuette/", "Oberwalderhütte"), ("/en/hut/guttenberghaus/", "Winter room"), ("/de/hut/sonnschienhuette/", "Sonnschienhütte"), ("/", "Hüttenfinder")]:
    s = get(B + path); print("page", path, "ok" if want in s else "MISSING " + want, len(s))
# spot check live numbers against hut-reservation.org right now
for hid in ["469", "493", "261", "103", "121"]:
    live = {}
    for d in fetch(int(hid)):
        if d.get("hutStatus") == "SERVICED": live[d["date"][:10]] = d.get("freeBeds") or 0
    site = a["huts"].get(hid, {}).get("days", {})
    same = sum(1 for k, v in site.items() if live.get(k) == sum(v))
    print("hut", hid, "site nights", len(site), "matching hut-reservation.org now", same)
