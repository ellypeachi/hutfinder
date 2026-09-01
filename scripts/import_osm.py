#!/usr/bin/env python3
"""
import_osm.py — build data/huts.json for hutfinder v2 from OpenStreetMap.

Pulls Austrian mountain stops from the Overpass API and writes a flat huts.json
matching the schema in SPEC.md. Region (Bundesland) is assigned by point-in-polygon
if data/bundeslaender.geojson is present; otherwise left as "unknown".

Run locally or in Claude Code (needs network access to overpass-api.de):
    pip3 install requests shapely
    python3 scripts/import_osm.py

This script is a SEED, not gospel. OSM tagging of Almen/Jausenstationen is
inconsistent, so the tag coverage below WILL need tuning against live results.
After running, eyeball the printed counts per type and per region before trusting
the output. This script only produces raw OSM huts with hr_hut_id=null — the
hut-reservation mapping is merged in separately at build time (see hr_mapping.json)
so re-running this never destroys hand-verified matches.
"""

import json
import re
import sys
import time
from pathlib import Path

import requests

# Multiple public Overpass mirrors, tried in order. If one is busy or blocks us,
# the script falls through to the next.
OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# Overpass servers reject anonymous bot-like requests. A descriptive User-Agent
# (their etiquette asks for one) fixes the "406 Not Acceptable" rejection.
HEADERS = {
    "User-Agent": "hutfinder/0.1 (personal mountain-hut finder project)",
    "Accept": "application/json",
}

ROOT = Path(__file__).resolve().parent.parent
OUT_PATH = ROOT / "data" / "huts.json"
GEOJSON_PATH = ROOT / "data" / "bundeslaender.geojson"

# --- Overpass query -------------------------------------------------------
# Bounded to Austria via the admin_level=2 area. We fetch the reliably-tagged
# overnight huts (alpine_hut + wilderness_hut). Huts are mapped as nodes AND as
# ways/buildings, so we query both and use `out center` to get coordinates for ways.
QUERY = """
[out:json][timeout:180];
area["ISO3166-1"="AT"][admin_level=2]->.at;
(
  node["tourism"="alpine_hut"](area.at);
  way["tourism"="alpine_hut"](area.at);
  node["tourism"="wilderness_hut"](area.at);
  way["tourism"="wilderness_hut"](area.at);
);
out center tags;
"""

# Optional second pass for food-only stops (Almen / Jausenstationen not tagged as
# alpine_hut). NOISY — it also pulls valley restaurants, so it's off by default.
# When tuning: run it, then filter by elevation (e.g. ele > 900) and/or hand-review.
FOOD_QUERY = """
[out:json][timeout:180];
area["ISO3166-1"="AT"][admin_level=2]->.at;
(
  node["amenity"~"^(restaurant|cafe|bar)$"]["name"~"Alm|Alpe|Jausenstation|Hütte",i](area.at);
  way["amenity"~"^(restaurant|cafe|bar)$"]["name"~"Alm|Alpe|Jausenstation|Hütte",i](area.at);
);
out center tags;
"""


def fetch(query, attempts_per_endpoint=2):
    """POST a query to Overpass, trying mirrors in order and retrying on 'busy'."""
    last_err = None
    for url in OVERPASS_ENDPOINTS:
        for attempt in range(attempts_per_endpoint):
            try:
                r = requests.post(
                    url, data={"data": query}, headers=HEADERS, timeout=200
                )
                if r.status_code == 429:  # Too Many Requests — server is busy
                    wait = 10 * (attempt + 1)
                    print(f"  {url} busy (429), waiting {wait}s and retrying…",
                          file=sys.stderr)
                    time.sleep(wait)
                    continue
                r.raise_for_status()
                return r.json().get("elements", [])
            except Exception as e:  # noqa: BLE001 — try the next attempt/mirror
                last_err = e
                print(f"  endpoint failed ({url}): {e}", file=sys.stderr)
                time.sleep(3)
    raise RuntimeError(f"all Overpass endpoints failed: {last_err}")


def num(v):
    """Pull the first number out of a messy OSM value ('1834 m' -> 1834.0)."""
    if v is None:
        return None
    m = re.search(r"-?\d+(\.\d+)?", str(v).replace(",", "."))
    return float(m.group()) if m else None


def classify(tags):
    """Map OSM tags -> our type enum. Name heuristics because OSM has no clean tag."""
    name = (tags.get("name") or "").lower()
    if "jausenstation" in name:
        return "jausenstation"
    if "alm" in name or "alpe" in name:
        return "alm"
    return "schutzhuette"


def warden_of(tags):
    """Best-effort. OSM has no reliable warden field, so infer from type and stay honest."""
    t = tags.get("tourism")
    if t == "wilderness_hut":
        return "selbstversorger"   # unmanned/self-service by definition
    if t == "alpine_hut":
        return "bewirtschaftet"    # usually serviced — verify per hut later
    return "unknown"


def to_record(el):
    """Turn one Overpass element into a huts.json record, or None if unusable."""
    tags = el.get("tags", {})
    name = tags.get("name")
    if not name:
        return None  # unnamed points are useless in a finder

    if el["type"] == "node":
        lat, lng = el.get("lat"), el.get("lon")
    else:  # way / relation — coordinates come from `out center`
        c = el.get("center", {})
        lat, lng = c.get("lat"), c.get("lon")
    if lat is None or lng is None:
        return None

    beds = num(tags.get("beds")) or num(tags.get("capacity"))
    return {
        "id": f'{el["type"][0]}{el["id"]}',   # n123456 / w123456 — stable OSM id
        "name": name,
        "type": classify(tags),
        "region": "unknown",                   # filled by assign_region()
        "elevation": num(tags.get("ele")),
        "lat": lat,
        "lng": lng,
        "open_from": None,                     # OSM opening data unreliable; fill later
        "open_to": None,
        "warden": warden_of(tags),
        "sleeping": int(beds) if beds else 0,
        "winterraum": tags.get("winter_room") == "yes",
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "website": tags.get("website") or tags.get("contact:website"),
        "hr_hut_id": None,                     # filled by match_huts.py + hr_mapping.json
    }


def assign_region(records):
    """Point-in-polygon each hut into a Bundesland, if a boundary file is present."""
    if not GEOJSON_PATH.exists():
        print("  no bundeslaender.geojson — leaving region='unknown'")
        return records
    try:
        from shapely.geometry import shape, Point
    except ImportError:
        print("  shapely not installed — skipping region assignment")
        return records

    gj = json.loads(GEOJSON_PATH.read_text(encoding="utf-8"))
    polys = []
    for feat in gj["features"]:
        props = feat["properties"]
        # Adjust this key to match your GeoJSON's property for the state name.
        name = props.get("name") or props.get("NAME") or props.get("BL")
        polys.append((name, shape(feat["geometry"])))

    for rec in records:
        p = Point(rec["lng"], rec["lat"])
        for name, poly in polys:
            if poly.contains(p):
                rec["region"] = name
                break
    return records


def main():
    print("Fetching huts from Overpass…")
    elements = fetch(QUERY)
    print(f"  {len(elements)} raw elements")

    records = [r for r in (to_record(e) for e in elements) if r]

    # de-dupe by id (a hut occasionally appears as both a node and a way)
    seen, deduped = set(), []
    for r in records:
        if r["id"] not in seen:
            seen.add(r["id"])
            deduped.append(r)
    print(f"  {len(deduped)} named huts with coordinates")

    deduped = assign_region(deduped)
    deduped.sort(key=lambda r: r["name"].lower())

    by_type = {}
    for r in deduped:
        by_type[r["type"]] = by_type.get(r["type"], 0) + 1
    print("  by type:", by_type)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUT_PATH.write_text(
        json.dumps(deduped, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"Wrote {len(deduped)} huts -> {OUT_PATH}")


if __name__ == "__main__":
    main()
