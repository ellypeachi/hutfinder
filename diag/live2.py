import json, urllib.request, re, html
H = {"User-Agent": "hutfinder/0.1 (live check)"}
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=30).read().decode("utf-8")
B = "https://www.hutfinder.at"
a = json.loads(get(B + "/availability.json"))
wr = {k: v for k, v in a["huts"].items() if "wr" in v}
print("availability", a["generated"], "huts", len(a["huts"]), "with winter-room nights", len(wr), sorted(wr))
huts = json.loads(get(B + "/huts.json"))
print("huts.json", len(huts), "Valentinalm:", [h.get("hr_hut_id") for h in huts if h["id"] == "n445042938"])
text = lambda s: " ".join(html.unescape(re.sub("<[^>]+>", " ", re.sub(r"<script.*?</script>|<style.*?</style>", "", s, flags=re.S))).split())
for path, key in [("/en/hut/neue-heilbronner-huette/", "Winter room"), ("/de/hut/seethalerhuette/", "Ruhetage"), ("/en/hut/adamekhuette/", "Closed until next summer"), ("/de/hut/valentinalm/", "Valentinalm"), ("/en/free-beds-this-weekend/", "in the winter room")]:
    t = text(get(B + path)); i = t.find(key)
    print("page", path, "OK" if i >= 0 else "MISSING " + key, "|", t[max(0, i - 60):i + 120] if i >= 0 else "")
js = [m for m in re.findall(r'/assets/[^"]+\.js', get(B + "/"))]
print("app bundle has season strings:", any("season.openUntil" in get(B + j) or "Open until" in get(B + j) for j in js[:3]))
