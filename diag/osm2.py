import json, urllib.request, urllib.parse, time, sys
Q = """[out:json][timeout:60];
(nwr["name"~"Kampthal",i](47.0,13.0,49.1,17.2);
 nwr(around:400,48.1316,16.1993)["tourism"];
 nwr(around:400,48.1316,16.1993)["building"]["name"];
 nwr["name"~"Valentin",i](46.55,12.80,46.72,13.10);
 nwr(around:1500,46.62,12.93)["tourism"~"alpine_hut|guest_house|chalet|hostel"];);
out center tags;"""
d = {"elements": []}
for ep in ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://overpass.kumi.systems/api/interpreter"]:
    try:
        req = urllib.request.Request(ep, data=urllib.parse.urlencode({"data": Q}).encode(), headers={"User-Agent": "hutfinder/0.1 (mountain-hut finder)"})
        d = json.load(urllib.request.urlopen(req, timeout=90)); break
    except Exception as e: print(ep, e); time.sleep(5)
for e in d["elements"]:
    c = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
    print("OSM", e["type"][0] + str(e["id"]), c, json.dumps(e.get("tags"), ensure_ascii=False))
