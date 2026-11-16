import json, urllib.request, urllib.parse
Q = """[out:json][timeout:60];
(nwr["name"~"Oberwalder",i](46.9,12.4,47.3,13.0);
 nwr["name"~"Kampthaler|Kampthal",i](46.4,9.5,49.0,17.2);
 nwr["name"~"Valentinalm",i](46.4,9.5,49.0,17.2););
out center tags;"""
for ep in ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]:
    try:
        req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": Q}).encode(), headers={"User-Agent": "hutfinder/0.1 (mountain-hut finder)"})
        d = json.load(urllib.request.urlopen(req, timeout=90)); break
    except Exception as e: print(ep, e)
for e in d["elements"]:
    c = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
    print(e["type"][0] + str(e["id"]), c, json.dumps(e.get("tags"), ensure_ascii=False))
