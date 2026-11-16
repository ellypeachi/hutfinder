import json, urllib.request, urllib.parse, signal, time, sys
signal.alarm(300)
Q = '[out:json][timeout:25];nwr["name"~"Oberwalder",i](47.05,12.65,47.15,12.78);out center tags;'
for ep in ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]:
    try:
        url = ep + "?" + urllib.parse.urlencode({"data": Q})
        req = urllib.request.Request(url, headers={"User-Agent": "hutfinder/0.1 (mountain-hut finder)"})
        d = json.load(urllib.request.urlopen(req, timeout=40))
        for e in d["elements"]:
            c = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
            print(e["type"][0] + str(e["id"]), c, json.dumps(e.get("tags"), ensure_ascii=False))
        print("done via", ep); sys.exit(0)
    except Exception as ex:
        print(ep, ex); time.sleep(5)
