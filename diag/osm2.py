import json, urllib.request, urllib.parse, time
Q = """[out:json][timeout:25];
(nwr(around:500,48.1316,16.1993)["name"];
 nwr(around:500,46.6225,12.9288)["name"];);
out center tags;"""
d = {"elements": []}
for ep in ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]:
    try:
        url = ep + "?" + urllib.parse.urlencode({"data": Q})
        d = json.load(urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "hutfinder/0.1 (mountain-hut finder)"}), timeout=45)); print("via", ep); break
    except Exception as e: print(ep, e); time.sleep(3)
for e in d["elements"]:
    c = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
    t = e.get("tags", {})
    if t.get("highway") or t.get("waterway") or t.get("natural") == "peak": continue
    print("OSM", e["type"][0] + str(e["id"]), c, json.dumps(t, ensure_ascii=False))
