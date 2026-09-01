#!/usr/bin/env python3
"""
build_hrs_catalog.py — turn the bare hutsList (id + name + country) into a rich
static catalog by fetching each Austrian hut's detail record.

Endpoints (all public, no auth):
  hutInfo/{id}                                  -> coords, altitude, association
                                                   (tenantCode), capacity, bed
                                                   categories, warden, contact,
                                                   payment mode, booking notes
  hutAccommodationData?hutId={id}&isServiced=true -> half-board price, price PDF,
                                                   cancellation PDF, dog policy

Run from the project root (needs network + requests):
    python3 scripts/build_hrs_catalog.py

Reads  data/hrs_catalog.json  (the saved hutsList response)
Writes data/hrs_huts.json     (one rich record per Austrian hut)

Gentle by design: ~0.4s between huts, a real User-Agent, and it caches — a
re-run skips huts already in hrs_huts.json unless you pass --refresh.
"""

import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / "data" / "hrs_catalog.json"
OUT = ROOT / "data" / "hrs_huts.json"

BASE = "https://www.hut-reservation.org/api/v1/reservation"
HEADERS = {"User-Agent": "hutfinder/0.1 (personal mountain-hut finder)", "Accept": "application/json"}
PAUSE = 0.4
FETCH_ACCOMMODATION = True   # set False to fetch only hutInfo (half the requests)


def get(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def en(items, key="description"):
    """Pick the English string from a list of {language, ...} dicts."""
    for it in items or []:
        if it.get("language") in ("EN", "en"):
            return it.get(key) or it.get("label")
    return (items[0].get(key) if items else None)


def parse_hut_info(d):
    lat = lng = None
    if d.get("coordinates"):
        try:
            lat, lng = (float(x) for x in d["coordinates"].split(","))
        except ValueError:
            pass
    alt = re.search(r"\d+", d.get("altitude") or "")
    cap = re.search(r"\d+", d.get("totalBedsInfo") or "")
    cats = []
    for c in d.get("hutBedCategories") or []:
        cats.append({
            "id": c.get("categoryID"),                      # matches availability freeBedsPerCategory keys
            "label": en(c.get("hutBedCategoryLanguageData"), "label"),
            "places": c.get("totalSleepingPlaces"),
        })
    return {
        "hr_hut_id": d.get("hutId"),
        "name": d.get("hutName"),
        "lat": lat, "lng": lng,
        "altitude": int(alt.group()) if alt else None,
        "association": d.get("tenantCode"),                 # OEAV / DAV / SAC / ...
        "country": d.get("tenantCountry"),
        "capacity": int(cap.group()) if cap else None,
        "warden": d.get("hutWarden"),
        "phone": d.get("phone"),
        "website": d.get("hutWebsite"),
        "photo": (d.get("picture") or {}).get("blobPath"),
        "payment": d.get("providerName"),                   # NO_EPAYMENT = cash on site
        "max_nights": d.get("maxNumberOfNights"),
        "bed_categories": cats,
        "notes": en(d.get("hutGeneralDescriptions")),
        "booking_url": f"https://www.hut-reservation.org/reservation/book-hut/{d.get('hutId')}/wizard",
    }


def parse_accommodation(d, rec):
    # half-board price (free text, e.g. "... € 39,- ...")
    hb = en((d.get("halfBoardFieldDTO") or {}).get("descriptions"))
    m = re.search(r"€\s?(\d+)", hb or "")
    rec["half_board_eur"] = int(m.group(1)) if m else None
    # price + cancellation PDFs (English)
    pl = en(d.get("hutPricesLists"), "filesData")
    rec["price_pdf"] = pl[0]["blobPath"] if pl else None
    gtc = en(d.get("hutGTCFiles"), "filesData")
    rec["cancellation_pdf"] = gtc[0]["blobPath"] if gtc else None
    # dog policy from the "Dogs" free field
    rec["dogs"] = None
    for f in d.get("freeFieldsDTOs") or []:
        labels = " ".join((c.get("label") or "") for c in f.get("configDataPerLanguage") or [])
        if "dog" in labels.lower() or "hund" in labels.lower():
            txt = (en(f.get("configDataPerLanguage")) or "").lower()
            if any(w in txt for w in ("not possible", "nicht möglich", "no dogs", "non possibile")):
                rec["dogs"] = False
            elif txt:
                rec["dogs"] = True
    return rec


def main():
    refresh = "--refresh" in sys.argv
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    at_ids = [(h["hutId"], h["hutName"]) for h in catalog if h.get("hutCountry") == "AT"]

    done = {}
    if OUT.exists() and not refresh:
        done = {r["hr_hut_id"]: r for r in json.loads(OUT.read_text(encoding="utf-8"))}

    print(f"{len(at_ids)} Austrian huts | {len(done)} already cached")
    out = dict(done)
    ok = fail = 0
    for hid, name in at_ids:
        if hid in out:
            continue
        try:
            rec = parse_hut_info(get(f"{BASE}/hutInfo/{hid}"))
            if FETCH_ACCOMMODATION:
                try:
                    rec = parse_accommodation(get(f"{BASE}/hutAccommodationData?hutId={hid}&isServiced=true"), rec)
                except Exception:
                    pass  # accommodation is a bonus; don't fail the record over it
            out[hid] = rec
            ok += 1
            print(f"  ✓ {hid:4} {name}  ({rec['lat']},{rec['lng']}) {rec['association']}")
        except Exception as e:
            fail += 1
            print(f"  ✗ {hid:4} {name}  — {e}", file=sys.stderr)
        time.sleep(PAUSE)

    records = list(out.values())
    OUT.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    with_coords = sum(1 for r in records if r.get("lat"))
    print(f"\nfetched {ok}, failed {fail} | {with_coords}/{len(records)} have coordinates")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
