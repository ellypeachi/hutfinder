#!/usr/bin/env python3
"""
enrich_osm_attrs.py — add association / shower / pets to public/huts.json from
OpenStreetMap, WITHOUT rebuilding the file.

Why standalone (not a flag on import_osm.py): the live public/huts.json already
carries region assignments and the coordinate-filled elevations (including the
`elevation_estimated` flag). A full re-import would overwrite those. This script
re-reads the OSM tags, matches them to existing huts by OSM id, and merges in
ONLY the three new fields — everything else is left exactly as it is.

Run from the project root (needs network to overpass-api.de):
    pip3 install requests
    python3 scripts/enrich_osm_attrs.py

Coverage note: OSM tagging of operator/shower/dog is partial, so many huts will
come back null. null means "not tagged" — never "no". The three fields are
tri-state on purpose so an untagged hut is never mistaken for one without a
shower / that bans dogs / that is privately run.
"""

import json
import re
import shutil
import sys
import time
from collections import Counter
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
HUTS_PATH = ROOT / "public" / "huts.json"

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    # overpass.osm.ch is left out on purpose: it only holds Swiss data and
    # answers "nothing" for Austrian huts.
    "https://overpass.kumi.systems/api/interpreter",
]
MIN_ELEMENTS = 1000
HEADERS = {
    "User-Agent": "hutfinder/0.1 (personal mountain-hut finder project)",
    "Accept": "application/json",
}

# Union of the two queries import_osm.py uses, so every hut type already in
# huts.json (alpine huts AND the food-stop Almen/Jausenstationen) can be matched.
QUERY = """
[out:json][timeout:180];
area["ISO3166-1"="AT"][admin_level=2]->.at;
(
  node["tourism"="alpine_hut"](area.at);
  way["tourism"="alpine_hut"](area.at);
  node["tourism"="wilderness_hut"](area.at);
  way["tourism"="wilderness_hut"](area.at);
  node["amenity"~"^(restaurant|cafe|bar)$"]["name"~"Alm|Alpe|Jausenstation|Hütte",i](area.at);
  way["amenity"~"^(restaurant|cafe|bar)$"]["name"~"Alm|Alpe|Jausenstation|Hütte",i](area.at);
);
out center tags;
"""


def fetch(query, attempts_per_endpoint=2):
    """POST to Overpass, trying mirrors in order and retrying on 'busy'."""
    last_err = None
    for url in OVERPASS_ENDPOINTS:
        for attempt in range(attempts_per_endpoint):
            try:
                r = requests.post(url, data={"data": query}, headers=HEADERS, timeout=200)
                if r.status_code == 429:  # busy
                    wait = 10 * (attempt + 1)
                    print(f"  {url} busy (429), waiting {wait}s…", file=sys.stderr)
                    time.sleep(wait)
                    continue
                r.raise_for_status()
                data = r.json()
                # A busy server that runs out of time still answers 200, with
                # whatever it found so far and a "remark" saying so.
                if data.get("remark"):
                    raise ValueError(f"partial answer: {data['remark'][:120]}")
                elements = data.get("elements", [])
                # The whole-of-Austria query returns well over a thousand huts;
                # far fewer means a broken answer, not a change in OSM.
                if len(elements) < MIN_ELEMENTS:
                    raise ValueError(f"only {len(elements)} elements returned")
                return elements
            except Exception as e:  # noqa: BLE001 — fall through to next mirror
                last_err = e
                print(f"  endpoint failed ({url}): {e}", file=sys.stderr)
                time.sleep(3)
    raise RuntimeError(f"all Overpass endpoints failed: {last_err}")


# --- normalisation --------------------------------------------------------
# Operator strings that signal an alpine club (reciprocal member rates).
NATURFREUNDE_RE = re.compile(r"naturfreund", re.I)
ALPINE_CLUB_RE = re.compile(
    r"alpenverein|naturfreunde|touristenklub|touristenclub|alpine[\s-]*club"
    r"|\bDAV\b|\bÖAV\b|\bOEAV\b|\bAVS\b|\bÖTK\b|\bOETK\b|\bSAC\b|\bCAI\b|\bsektion\b",
    re.IGNORECASE,
)


def association_of(tags):
    """alpine_club | private | None. 'private' means 'not an alpine-club hut'
    (no reciprocal member rate) — it lumps genuinely private, municipal and
    commercial operators together, which is what the member-pricing split needs."""
    op = (tags.get("operator") or "").strip()
    optype = (tags.get("operator:type") or "").strip().lower()
    if op:
        if NATURFREUNDE_RE.search(op):
            return "naturfreunde"
        if ALPINE_CLUB_RE.search(op) or optype == "club":
            return "alpine_club"
        return "private"           # a named operator that isn't a club
    if optype == "club":
        return "alpine_club"
    if optype == "private":
        return "private"
    return None                    # untagged — unknown, NOT private


def shower_of(tags):
    v = tags.get("shower")
    if v is None:
        return None
    v = str(v).strip().lower()
    if v in ("no", "false", "0", "none"):
        return False
    if v in ("yes", "true", "1", "hot", "cold"):
        return True
    return None


def pets_of(tags):
    """yes | leashed | no | None (dogs)."""
    v = tags.get("dog")
    if v is None:
        return None
    v = str(v).strip().lower()
    if v in ("no", "false", "0"):
        return "no"
    if v in ("leashed", "on_leash"):
        return "leashed"
    if v in ("yes", "true", "1", "unleashed", "outside"):
        return "yes"
    return None


def _num(v):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


# Most specific first. Bare `capacity` is last because on a hut that also
# serves food it sometimes means restaurant seats rather than beds.
BED_TAGS = (
    "capacity:beds",
    "capacity:overnight",
    "capacity:dormitory",
    "beds",
    "capacity:persons",
    "capacity",
)

# Deliberately NOT merged into `sleeping`. A winter room is an unstaffed
# emergency shelter, usually locked and needing an AV key — not a bed you
# can turn up and sleep in.
WINTER_TAGS = ("capacity:winter_room", "winter_room:capacity", "capacity:bivac")

# `rooms` is deliberately absent. It counts rooms, not beds; a hut with
# four rooms might sleep eight or forty.


def beds_of(tags):
    for key in BED_TAGS:
        n = _num(tags.get(key))
        if n is not None:
            return n
    return None


def winter_beds_of(tags):
    for key in WINTER_TAGS:
        n = _num(tags.get(key))
        if n is not None:
            return n
    return None


def main():
    huts = json.loads(HUTS_PATH.read_text(encoding="utf-8"))
    print(f"{len(huts)} huts loaded from {HUTS_PATH}")

    print("Fetching OSM tags from Overpass…")
    elements = fetch(QUERY)
    print(f"  {len(elements)} OSM elements")

    tags_by_id = {f'{el["type"][0]}{el["id"]}': el.get("tags", {}) for el in elements}

    matched = 0
    filled = 0
    for h in huts:
        tags = tags_by_id.get(h["id"])
        if tags is None:
            # keep the field present and honest even when unmatched
            h["association"] = h.get("association")
            h["shower"] = h.get("shower")
            h["pets"] = h.get("pets")
            h["winterraum_beds"] = h.get("winterraum_beds")
            continue
        matched += 1
        h["association"] = association_of(tags)
        h["shower"] = shower_of(tags)
        h["pets"] = pets_of(tags)
        h["winterraum_beds"] = winter_beds_of(tags)
        if h.get("sleeping") is None:
            b = beds_of(tags)
            if b is not None:
                h["sleeping"] = b
                filled += 1

    print(f"\nMatched {matched}/{len(huts)} huts to an OSM element")
    print(f"  beds backfilled from OSM: {filled}")
    print("  beds known now:", sum(1 for h in huts if h.get("sleeping")))
    print("  winter-room capacity known:",
          sum(1 for h in huts if h.get("winterraum_beds")))
    print("  association:", dict(Counter(h.get("association") for h in huts)))
    print("  shower:     ", dict(Counter(h.get("shower") for h in huts)))
    print("  pets:       ", dict(Counter(h.get("pets") for h in huts)))

    backup = HUTS_PATH.with_suffix(".json.osmbak")
    shutil.copy(HUTS_PATH, backup)
    HUTS_PATH.write_text(json.dumps(huts, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {HUTS_PATH}  (backup: {backup})")


if __name__ == "__main__":
    main()
