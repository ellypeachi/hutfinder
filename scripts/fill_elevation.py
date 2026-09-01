#!/usr/bin/env python3
"""
Fill missing hut elevations from coordinates using the Open-Meteo elevation API
(free, no API key, Copernicus DEM ~90 m — accurate enough for range-band filtering).

Run from the project root:  python3 fill_elevation.py
Reads and rewrites  public/huts.json  (a .bak backup is written first).

Behaviour:
  - Known elevations (1,073 huts) are left untouched.
  - Only the ~451 huts with elevation == None are filled.
  - Every hut gets an  "elevation_estimated"  flag (True only for filled ones),
    so a DEM estimate is never mistaken for a surveyed value downstream.
"""

import json
import time
import shutil
import urllib.parse
import urllib.request
from pathlib import Path

HUTS = Path("public/huts.json")
API = "https://api.open-meteo.com/v1/elevation"
BATCH = 100          # Open-Meteo accepts up to 100 coordinates per request
PAUSE = 0.5          # seconds between batches, to be polite


def needs_fill(h):
    return not isinstance(h.get("elevation"), (int, float))


def fetch_elevations(coords):
    """coords: list of (lat, lng) -> list of elevations (float | None), same order."""
    lats = ",".join(f"{lat:.6f}" for lat, _ in coords)
    lngs = ",".join(f"{lng:.6f}" for _, lng in coords)
    url = f"{API}?{urllib.parse.urlencode({'latitude': lats, 'longitude': lngs})}"
    with urllib.request.urlopen(url, timeout=30) as r:
        data = json.load(r)
    return data.get("elevation", [None] * len(coords))


def main():
    huts = json.loads(HUTS.read_text(encoding="utf-8"))

    # normalise the flag on every record (False for known values)
    for h in huts:
        h.setdefault("elevation_estimated", False)

    todo = [h for h in huts if needs_fill(h)]
    print(f"{len(huts)} huts total | {len(todo)} missing elevation")
    if not todo:
        print("Nothing to fill.")
        return

    shutil.copy(HUTS, HUTS.with_suffix(".json.bak"))
    print(f"Backup written to {HUTS.with_suffix('.json.bak')}")

    filled = failed = 0
    for i in range(0, len(todo), BATCH):
        chunk = todo[i : i + BATCH]
        coords = [(h["lat"], h["lng"]) for h in chunk]
        try:
            elevations = fetch_elevations(coords)
        except Exception as e:
            print(f"  batch {i // BATCH + 1}: request failed ({e}) — skipping")
            failed += len(chunk)
            continue

        for h, ele in zip(chunk, elevations):
            if isinstance(ele, (int, float)):
                h["elevation"] = round(ele)
                h["elevation_estimated"] = True
                filled += 1
            else:
                failed += 1
        print(f"  batch {i // BATCH + 1}: filled {len(chunk)} (running total {filled})")
        time.sleep(PAUSE)

    HUTS.write_text(json.dumps(huts, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nDone. Filled {filled}, still missing {failed}. Wrote {HUTS}")


if __name__ == "__main__":
    main()
