import json, urllib.request, urllib.parse, time, sys
Q = '[out:json][timeout:120];area["ISO3166-1"="AT"][admin_level=2]->.at;(relation["tourism"~"^(alpine_hut|wilderness_hut)$"](area.at););out center tags;'
huts = {h["id"] for h in json.load(open("public/huts.json"))}
for ep in ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"]:
    try:
        req = urllib.request.Request(ep + "?" + urllib.parse.urlencode({"data": Q}), headers={"User-Agent": "hutfinder/0.1 (mountain-hut finder)"})
        d = json.load(urllib.request.urlopen(req, timeout=150)); break
    except Exception as e: print(ep, e); time.sleep(5)
els = d["elements"]
print(len(els), "relations tagged as huts in Austria")
for e in els:
    i = "r" + str(e["id"]); t = e.get("tags", {})
    print("ON SITE" if i in huts else "MISSING", i, t.get("tourism"), t.get("name"), t.get("ele"), t.get("operator"), e.get("center"))
