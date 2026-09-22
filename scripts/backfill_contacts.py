#!/usr/bin/env python3
"""
backfill_contacts.py — fill missing phone / website / email in public/huts.json
from OpenStreetMap tags the import doesn't read, and from Wikidata.

Why: huts that can't be booked online now sit in the "Unlisted" section, which
tells people to call or check the hut's website. Hundreds of them have neither,
so their cards are a dead end. import_osm.py only reads phone, contact:phone,
website and contact:website. Mappers also use contact:mobile, mobile, url,
contact:facebook, email and so on, and some huts link to Wikidata, which can
hold an official website and phone number.

What it does, and doesn't:
- Only FILLS gaps. A field that already has a value is never touched.
- Never touches a field set in data/overrides.json (hand-verified).
- Records where each new value came from: phone_source / website_source /
  email_source = "osm" or "wikidata". Existing values keep no source field.
- Leaves everything else in huts.json exactly as it is.

Run from the project root (needs network to Overpass and Wikidata):
    python3 scripts/backfill_contacts.py --check   # dry run: report only, writes nothing
    python3 scripts/backfill_contacts.py           # write public/huts.json

Undo: git restore public/huts.json
"""

import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent.parent
HUTS_PATH = ROOT / "public" / "huts.json"
OVERRIDES_PATH = ROOT / "data" / "overrides.json"

OVERPASS_ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    # overpass.osm.ch is left out on purpose: it only holds Swiss data and
    # answers "nothing" for Austrian huts.
    "https://overpass.kumi.systems/api/interpreter",
]
WIKIDATA_API = "https://www.wikidata.org/w/api.php"
HEADERS = {
    # Wikimedia asks for a contact in the User-Agent and throttles requests without one.
    "User-Agent": "hutfinder/0.1 (https://www.hutfinder.at; personal mountain-hut finder project)",
    "Accept": "application/json",
}

# Most specific first. The first tag with a usable value wins.
PHONE_TAGS = ("phone", "contact:phone", "contact:mobile", "mobile", "phone:mobile")
WEBSITE_TAGS = (
    "website", "contact:website", "url", "contact:url", "contact:homepage",
    "contact:facebook", "facebook",
    # The operator's site (an Alpenverein section, say) is still the right
    # place to ask, so it comes last rather than not at all.
    "operator:website",
)
EMAIL_TAGS = ("email", "contact:email")

FIELDS = ("phone", "website", "email")
CHUNK = 100  # OSM ids per Overpass request (small = quick, less likely to be dropped)


# --- fetching -------------------------------------------------------------

def overpass(query, expected=0, attempts_per_endpoint=2):
    """POST to Overpass, trying mirrors in order and retrying on 'busy'.
    `expected` is how many elements the query should return; an answer well
    short of it is treated as a failure rather than silently accepted."""
    last_err = None
    for url in OVERPASS_ENDPOINTS:
        for attempt in range(attempts_per_endpoint):
            try:
                r = requests.post(url, data={"data": query}, headers=HEADERS, timeout=90)
                if r.status_code == 429:  # busy
                    wait = 10 * (attempt + 1)
                    print(f"  {url} busy (429), waiting {wait}s…", file=sys.stderr)
                    time.sleep(wait)
                    continue
                r.raise_for_status()
                data = r.json()
                elements = data.get("elements", [])
                # A busy server that runs out of time still answers 200, with
                # whatever it found so far and a "remark" saying so.
                if data.get("remark"):
                    raise ValueError(f"partial answer: {data['remark'][:120]}")
                # Some mirrors hold only part of the world (overpass.osm.ch is
                # Switzerland only) and answer "nothing" for Austrian ids.
                # A few ids can be gone from OSM, but not most of them.
                if len(elements) < 0.9 * expected:
                    raise ValueError(f"only {len(elements)} of {expected} elements returned")
                return elements
            except Exception as e:  # noqa: BLE001 — fall through to next mirror
                last_err = e
                print(f"  endpoint failed ({url}): {e}", file=sys.stderr)
                time.sleep(3)
    raise RuntimeError(f"all Overpass endpoints failed: {last_err}")


def osm_tags_for(ids):
    """{'w123': {tags}, 'n456': {tags}} for the given hut ids (n…/w…/r…)."""
    kinds = {"n": "node", "w": "way", "r": "relation"}
    out = {}
    ids = [i for i in ids if i[:1] in kinds and i[1:].isdigit()]
    for start in range(0, len(ids), CHUNK):
        chunk = ids[start:start + CHUNK]
        parts = []
        for k, kind in kinds.items():
            nums = [i[1:] for i in chunk if i[0] == k]
            if nums:
                parts.append(f"{kind}(id:{','.join(nums)});")
        query = f"[out:json][timeout:60];({''.join(parts)});out tags;"
        # Public Overpass servers get overloaded at busy times. If every server
        # fails on a batch, wait and try that batch again before giving up.
        for round_ in range(3):
            try:
                elements = overpass(query, expected=len(chunk))
                break
            except RuntimeError:
                if round_ == 2:
                    raise
                print("  every server failed on this batch; trying it again in 60s…", file=sys.stderr)
                time.sleep(60)
        for el in elements:
            out[f'{el["type"][0]}{el["id"]}'] = el.get("tags", {})
        print(f"  OSM: {min(start + CHUNK, len(ids))}/{len(ids)} ids looked up")
        time.sleep(1)
    return out


def wikidata_contacts(qids):
    """{'Q123': {'website': …, 'phone': …, 'email': …}} from Wikidata claims:
    P856 official website, P1329 phone number, P968 email address."""
    props = {"P856": "website", "P1329": "phone", "P968": "email"}
    out = {}
    qids = sorted({q for q in qids if re.fullmatch(r"Q\d+", q or "")})
    for start in range(0, len(qids), 25):
        batch = qids[start:start + 25]
        entities = None
        for attempt in range(4):
            try:
                r = requests.get(
                    WIKIDATA_API,
                    params={"action": "wbgetentities", "ids": "|".join(batch),
                            "props": "claims", "format": "json", "maxlag": 5},
                    headers=HEADERS, timeout=60,
                )
                if r.status_code == 429:  # rate limited: wait as asked, then retry
                    wait = int(r.headers.get("Retry-After", "0") or 0) or 10 * (attempt + 1)
                    print(f"  Wikidata busy (429), waiting {wait}s…", file=sys.stderr)
                    time.sleep(wait)
                    continue
                r.raise_for_status()
                entities = r.json().get("entities", {})
                break
            except Exception as e:  # noqa: BLE001 — Wikidata is a bonus, not required
                print(f"  Wikidata batch error: {e}", file=sys.stderr)
                time.sleep(5)
        if entities is None:
            print("  Wikidata batch skipped after retries", file=sys.stderr)
            continue
        for qid, ent in entities.items():
            found = {}
            for pid, field in props.items():
                for claim in ent.get("claims", {}).get(pid, []):
                    v = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
                    if isinstance(v, str) and v.strip():
                        found[field] = v.strip()
                        break
            if found:
                out[qid] = found
        time.sleep(2)
    return out


# --- cleaning -------------------------------------------------------------

def first_value(v):
    """OSM packs several values into one tag with ';'. Take the first."""
    return (v or "").split(";")[0].strip()


def clean_phone(v):
    v = first_value(v)
    return v if len(re.sub(r"\D", "", v)) >= 6 else None


def clean_email(v):
    v = first_value(v)
    if v.lower().startswith("mailto:"):
        v = v[7:]
    return v if re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", v) else None


def clean_website(v, tag=""):
    v = first_value(v)
    if not v or " " in v:
        return None
    if tag in ("contact:facebook", "facebook") and not re.match(r"(https?://|www\.|[\w.-]*facebook\.com)", v, re.I):
        v = "https://www.facebook.com/" + v.lstrip("@/")  # a bare page name
    if re.match(r"https?://", v, re.I) or re.match(r"[\w-]+(\.[\w-]+)+(/|$)", v):
        return v
    return None


CLEANERS = {"phone": clean_phone, "website": clean_website, "email": clean_email}
TAGS = {"phone": PHONE_TAGS, "website": WEBSITE_TAGS, "email": EMAIL_TAGS}


def from_osm(field, tags):
    """(value, tag) from the first usable tag, or (None, None)."""
    for tag in TAGS[field]:
        if tags.get(tag):
            val = clean_website(tags[tag], tag) if field == "website" else CLEANERS[field](tags[tag])
            if val:
                return val, tag
    return None, None


# --- main -----------------------------------------------------------------

def main():
    check = "--check" in sys.argv
    huts = json.loads(HUTS_PATH.read_text(encoding="utf-8"))
    overrides = {}
    if OVERRIDES_PATH.exists():
        overrides = {k: v for k, v in json.loads(OVERRIDES_PATH.read_text(encoding="utf-8")).items()
                     if not k.startswith("_") and isinstance(v, dict)}

    def locked(h, field):
        return field in overrides.get(h["id"], {}) or h.get(f"{field}_source") == "verified"

    # Huts missing a phone or a website. An email is filled for them too when
    # one turns up, but a missing email alone doesn't make a hut a target.
    targets = [h for h in huts if any(not h.get(f) and not locked(h, f) for f in ("phone", "website"))]
    unlisted = [h for h in huts if not h.get("hr_hut_id")]
    no_contact_before = sum(1 for h in unlisted if not (h.get("phone") or h.get("website") or h.get("email")))
    print(f"{len(huts)} huts loaded; {len(targets)} are missing a phone or website")
    print(f"Unlisted huts with no phone, website or email: {no_contact_before}\n")

    print("Fetching OSM tags from Overpass…")
    tags_by_id = osm_tags_for([h["id"] for h in targets])
    print(f"  matched {len(tags_by_id)}/{len(targets)} to an OSM element\n")

    qids = [t.get("wikidata") for t in tags_by_id.values() if t.get("wikidata")]
    print(f"Fetching {len(set(qids))} linked Wikidata items…")
    wd = wikidata_contacts(qids)
    print(f"  {len(wd)} have a website, phone or email\n")

    filled = Counter()   # (field, source) -> n
    via_tag = Counter()  # (field, tag) -> n
    samples = []
    for h in targets:
        tags = tags_by_id.get(h["id"], {})
        wd_item = wd.get(tags.get("wikidata"), {})
        for field in FIELDS:
            if h.get(field) or locked(h, field):
                continue
            val, tag = from_osm(field, tags)
            source = "osm"
            if not val and wd_item.get(field):
                raw = wd_item[field]
                val = clean_website(raw) if field == "website" else CLEANERS[field](raw)
                tag, source = "wikidata", "wikidata"
            if not val:
                continue
            h[field] = val
            h[f"{field}_source"] = source
            filled[(field, source)] += 1
            via_tag[(field, tag)] += 1
            if len(samples) < 25:
                samples.append(f"  {h['name']}: {field} ← {tag}  {val}")

    no_contact_after = sum(1 for h in unlisted if not (h.get("phone") or h.get("website") or h.get("email")))
    print("Would fill:" if check else "Filled:")
    for field in FIELDS:
        n = sum(v for (f, _), v in filled.items() if f == field)
        tags_used = ", ".join(f"{t} {v}" for (f, t), v in via_tag.most_common() if f == field)
        print(f"  {field:8} {n:4}   {tags_used}")
    print(f"\nUnlisted huts with no phone, website or email: {no_contact_before} → {no_contact_after}")
    if samples:
        print("\nExamples:")
        print("\n".join(samples))

    if check:
        print("\n--check: nothing written. Run without --check to update public/huts.json.")
        return
    HUTS_PATH.write_text(json.dumps(huts, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {HUTS_PATH}. Undo with: git restore public/huts.json")


if __name__ == "__main__":
    main()
