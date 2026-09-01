#!/usr/bin/env python3
"""Coordinate-gated matcher: HRS huts -> OSM huts. See header notes in repo."""
import json, math, re, unicodedata
from pathlib import Path
from rapidfuzz import process, fuzz

ROOT = Path(__file__).resolve().parent.parent
OSM_PATH = ROOT / "public" / "huts.json"
HRS_PATH = ROOT / "data" / "hrs_huts.json"
MAP_PATH = ROOT / "data" / "hr_mapping.json"

RADIUS_KM = 2.5
COORD_AUTO, COORD_REVIEW = 80, 62
NAME_AUTO, NAME_REVIEW = 90, 82
ORG = re.compile(r"\b(sac|cas|dav|oeav|oav|avs|aacz|aacb|aacbs|utoe|lav)\b", re.IGNORECASE)

def norm(name):
    s = (name or "").lower().strip()
    s = re.sub(r"\(.*?\)", " ", s)
    s = s.replace("ä","a").replace("ö","o").replace("ü","u").replace("ß","ss")
    s = unicodedata.normalize("NFKD", s).encode("ascii","ignore").decode()
    s = ORG.sub(" ", s)
    return re.sub(r"[^a-z0-9]+", "", s)

def haversine(a_lat,a_lng,b_lat,b_lng):
    R=6371.0; p1,p2=math.radians(a_lat),math.radians(b_lat)
    dp=math.radians(b_lat-a_lat); dl=math.radians(b_lng-a_lng)
    h=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*R*math.asin(math.sqrt(h))

def load_existing():
    if MAP_PATH.exists():
        return {m["hr_hut_id"]: m for m in json.loads(MAP_PATH.read_text())}
    return {}

def main():
    osm=json.loads(OSM_PATH.read_text(encoding="utf-8"))
    hrs=json.loads(HRS_PATH.read_text(encoding="utf-8"))
    for o in osm: o["_n"]=norm(o["name"])
    print(f"OSM huts: {len(osm)} | HRS huts: {len(hrs)}")
    existing=load_existing(); out=[]
    bands={"auto":0,"review":0,"none":0,"kept-verified":0}
    methods={"coord+name":0,"name-only":0,"conflict":0}
    for h in hrs:
        hid=h["hr_hut_id"]
        if existing.get(hid,{}).get("verified"):
            out.append(existing[hid]); bands["kept-verified"]+=1; continue
        q=norm(h["name"]); osm_hut=None; score=0.0; dist=None; method="name-only"; ambiguous=False
        if h.get("lat") is not None:
            near=[(o,haversine(h["lat"],h["lng"],o["lat"],o["lng"])) for o in osm]
            near=[(o,d) for o,d in near if d<=RADIUS_KM]
            if near:
                best=max(near,key=lambda od: fuzz.WRatio(q,od[0]["_n"]))
                osm_hut,dist=best; score=fuzz.WRatio(q,osm_hut["_n"]); method="coord+name"
                band="auto" if score>=COORD_AUTO else "review" if score>=COORD_REVIEW else "none"
                if band=="none": osm_hut=None
            else:
                hit=process.extractOne(q,[o["_n"] for o in osm],scorer=fuzz.WRatio)
                if hit and hit[1]>=NAME_AUTO:
                    osm_hut=osm[hit[2]]; score=hit[1]
                    dist=haversine(h["lat"],h["lng"],osm_hut["lat"],osm_hut["lng"])
                    method,band="conflict","review"
                else: band="none"
        else:
            names=[o["_n"] for o in osm]
            hit=process.extractOne(q,names,scorer=fuzz.WRatio)
            score=hit[1] if hit else 0
            tied=[osm[i] for i,n in enumerate(names) if n==hit[0]] if hit else []
            ambiguous=len(tied)>1; osm_hut=tied[0] if len(tied)==1 else None
            band="auto" if score>=NAME_AUTO else "review" if score>=NAME_REVIEW else "none"
            if score>=NAME_AUTO and osm_hut is None: band="review"
        if band!="none": methods[method]=methods.get(method,0)+1
        bands[band]+=1
        out.append({"hr_hut_id":hid,"hr_name":h["name"],
            "osm_id":osm_hut["id"] if osm_hut else None,
            "osm_name":osm_hut["name"] if osm_hut else None,
            "name_score":round(score,1),
            "distance_km":round(dist,3) if dist is not None else None,
            "method":method if band!="none" else None,"band":band,
            "verified":False,"ambiguous":ambiguous})
    MAP_PATH.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding="utf-8")
    print("\nBands:  ",bands); print("Methods:",methods)
    print("\nAUTO via coordinate gate (sample):")
    for m in [m for m in out if m["band"]=="auto" and m["method"]=="coord+name"][:6]:
        print(f"  {m['name_score']:5} {m['distance_km']:>6}km  {m['hr_name']:30} -> {m['osm_name']}")
    print("\nREVIEW:")
    for m in [m for m in out if m["band"]=="review"]:
        d=f"{m['distance_km']}km" if m["distance_km"] is not None else "no-coord"
        print(f"  {m['name_score']:5} {d:>9}  {m['hr_name']:30} -> {m['osm_name']}  [{m['method'] or ''}]")
    print("\nNONE:")
    for m in [m for m in out if m["band"]=="none"]:
        print(f"        {m['hr_name']}")
    print(f"\nWrote {MAP_PATH}")

if __name__=="__main__": main()
