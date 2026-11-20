#!/usr/bin/env python3
"""
fetch_availability.py — build public/availability.json, a compact daily snapshot
of bed availability for every bookable hut, split by room type.

Room types across huts are messy (Matratzenlager, Mehrbettzimmer, Zweierzimmer,
Dormitory, Double room, …), so we normalise every category into three buckets:
  index 0 = dormitory   (Matratzenlager / mass sleeping)
  index 1 = shared room (Mehrbettzimmer / multi-bed rooms)
  index 2 = private     (double / single / family rooms)

The classification happens here, once, from each hut's hr_bed_categories in
huts.json — the app just reads the numbers.

Run from the project root:  python3 scripts/fetch_availability.py

Format:
  { "generated": "...Z", "window_days": 120,
    "huts": { "491": { "cap": 89, "caps": [50,16,6],
                       "days": { "2026-09-01": [15,4,2], ... } } } }
  days value is [dorm, shared, private] free beds on that (open) night.
  caps is the same three buckets' total capacity. A date absent = closed.

Some huts also take online bookings on nights without a host, when only the
winter room is open (hut-reservation.org: hutStatus "UNSERVICED"). Those
nights go in "wr": { "2026-11-21": 28, ... }, the free beds that night, and
"wrcap" is the most beds the winter room has shown. A hut whose winter room
never has a bed free gets neither: it can't be booked that way. Nor does a hut
set to "winter_room_online": false in data/overrides.json, checked by hand
because what the booking system sells on those nights isn't a place to sleep
(Freschenhaus: an emergency shelter with cots, its winter room is booked by
email).
src/avail.js reads both for the app and the pages.

The booking form's own word on each hut, read for its next open night (or
tomorrow when nothing is open) from hutStatus, the call the form makes once
you pick dates:
  - "note": the hut's message there, per language ({"de": ..., "en": ...}),
    e.g. "Winterpause 2026/27" or what its winter room has. The pop-ups and
    hut pages show it as "Note from the hut".
  - A hut the booking system says is "not open to reservations" (locked) gets
    no free nights at all, whatever the calendar feed says.

Nights inside a closure checked by hand are dropped too: a hut's "closed"
ranges in data/overrides.json and the "closed" gaps in its seasons, each
[from, to] with both nights included, and a hut's "closed_days": weekdays
("mon".."sun") it takes no overnight guests, whatever the calendar says.
"""

import http.cookiejar
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import date, datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
HUTS = ROOT / "public" / "huts.json"
OUT = ROOT / "public" / "availability.json"
BASE = "https://www.hut-reservation.org/api/v1/reservation/getHutAvailability"
API = "https://www.hut-reservation.org/api/v1"
HEADERS = {"User-Agent": "hutfinder/0.1 (mountain-hut finder)", "Accept": "application/json"}
WINDOW_DAYS = 120
PAUSE = 0.4
# If more than this share of huts fail, the run is broken (hut-reservation.org
# down, its certificate expired, the API changed): keep the last good file and
# fail the job so GitHub sends an email. A few single failures are normal and
# those huts just show no availability until the next run.
MAX_FAIL_SHARE = 0.10

DORM, SHARED, PRIV = 0, 1, 2


def bucket_of(label):
    """Map a room-category label to a bucket index."""
    s = (label or "").lower()
    if any(k in s for k in ("dorm", "matratzen", "lager", "mattress", "camp")):
        return DORM
    if any(
        k in s
        for k in (
            "doppel", "double", "zweier", "zweibett", "2er", "2-bett", "twin",
            "einzel", "single", "family", "familien", "privat", "private",
        )
    ):
        return PRIV
    return SHARED  # Mehrbettzimmer / generic Zimmer / room / unknown


def fetch(hid):
    req = urllib.request.Request(f"{BASE}?hutId={hid}&step=WIZARD", headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


class BookingForm:
    """hutStatus, as the booking form calls it: a POST with a CSRF token
    from /csrf and the session cookie that comes with it."""

    def __init__(self):
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        with self.opener.open(urllib.request.Request(f"{API}/csrf", headers=HEADERS), timeout=30) as r:
            self.token = json.load(r)["token"]

    def status(self, hid, night):
        """(answer, error id): the answer's JSON whether it was accepted or
        refused, and the refusal's messageId (113 = not open to reservations)."""
        d = date.fromisoformat(night)
        dmy = lambda x: x.strftime("%d.%m.%Y")
        body = json.dumps({"arrivalDate": dmy(d), "departureDate": dmy(date.fromordinal(d.toordinal() + 1))}).encode()
        req = urllib.request.Request(
            f"{API}/reservation/hutStatus/{hid}", data=body, method="POST",
            headers={**HEADERS, "Content-Type": "application/json", "X-XSRF-TOKEN": self.token},
        )
        try:
            with self.opener.open(req, timeout=30) as r:
                return json.load(r), None
        except urllib.error.HTTPError as e:
            if e.code != 400:
                raise
            j = json.load(e)
            return j, j.get("messageId")


LANG = {"DE_DE": "de", "EN": "en", "FR": "fr", "IT": "it"}


def note_of(answer):
    """The hut's message in the booking form, per language, as plain text."""
    out = {}
    for k, v in ((answer or {}).get("messages") or {}).items():
        text = re.sub(r"<[^>]+>", " ", v or "")
        text = re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", text)).strip()
        if text and k in LANG:
            out[LANG[k]] = text
    return out


def closures_of(h):
    """A hut's closures checked by hand: its own and its seasons' gaps."""
    ranges = list(h.get("closed") or [])
    for s in h.get("seasons") or []:
        ranges += s.get("closed") or []
    return [(a, b) for a, b in ranges]


WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def no_nights_on(h):
    """Weekdays a hut takes no overnight guests (hut-level "closed_days")."""
    return {WEEKDAYS.index(d) for d in h.get("closed_days") or [] if d in WEEKDAYS}


def main():
    huts = json.loads(HUTS.read_text(encoding="utf-8"))

    # per-hut: category-id -> bucket index, and bucket capacities
    catmap, capmap = {}, {}
    for h in huts:
        hid = h.get("hr_hut_id")
        if not hid:
            continue
        cm, cp = {}, [0, 0, 0]
        for c in h.get("hr_bed_categories") or []:
            idx = bucket_of(c.get("label"))
            cm[str(c.get("id"))] = idx
            cp[idx] += c.get("places") or 0
        catmap[hid] = cm
        capmap[hid] = cp

    ids = sorted(catmap)
    print(f"{len(ids)} bookable huts")
    no_wr = {h["hr_hut_id"] for h in huts if h.get("hr_hut_id") and h.get("winter_room_online") is False}
    closures = {h["hr_hut_id"]: closures_of(h) for h in huts if h.get("hr_hut_id") and closures_of(h)}
    rest_days = {h["hr_hut_id"]: no_nights_on(h) for h in huts if h.get("hr_hut_id") and no_nights_on(h)}
    try:
        form = BookingForm()
    except Exception as e:  # the notes are a bonus: free beds still go out without them
        print(f"  ! booking form not reachable, no notes this run: {e}", file=sys.stderr)
        form = None
    notes = locked = 0

    today = date.today()
    cutoff = today.toordinal() + WINDOW_DAYS
    out = {}
    ok = fail = 0

    for hid in ids:
        try:
            data = fetch(hid)
        except Exception as e:
            print(f"  x {hid}: {e}", file=sys.stderr)
            fail += 1
            time.sleep(PAUSE)
            continue

        cm = catmap.get(hid, {})
        days, cap, wr, wrcap = {}, None, {}, 0
        for d in data if isinstance(data, list) else []:
            status = d.get("hutStatus")
            if status not in ("SERVICED", "UNSERVICED"):
                continue
            ds = (d.get("date") or "")[:10]
            try:
                dd = date.fromisoformat(ds)
            except ValueError:
                continue
            if status == "UNSERVICED":
                # The winter room: one number, whatever category the hut files it under.
                free = sum(v or 0 for v in (d.get("freeBedsPerCategory") or {}).values())
                wrcap = max(wrcap, free)
                if today <= dd and dd.toordinal() <= cutoff:
                    wr[ds] = free
                continue
            if dd < today or dd.toordinal() > cutoff:
                continue
            buckets = [0, 0, 0]
            for cid, free in (d.get("freeBedsPerCategory") or {}).items():
                idx = cm.get(str(cid), SHARED)  # unknown category -> shared
                buckets[idx] += free or 0
            days[ds] = buckets
            cap = cap or d.get("totalSleepingPlaces")

        if not (wrcap > 0 and hid not in no_wr):
            wr = {}
        # Closures checked by hand win over the calendar.
        shut, rest = closures.get(hid, []), rest_days.get(hid, set())
        inside = lambda d: any(a <= d <= b for a, b in shut) or date.fromisoformat(d).weekday() in rest
        days = {d: v for d, v in days.items() if not inside(d)}
        wr = {d: v for d, v in wr.items() if not inside(d)}

        # The booking form's word for the next open night, or tomorrow.
        note = {}
        if form:
            nights = sorted(set(days) | set(wr))
            try:
                answer, refused = form.status(hid, nights[0] if nights else date.fromordinal(today.toordinal() + 1).isoformat())
                note = note_of(answer)
                if refused == 113:  # "The hut is not open to reservations"
                    days, wr = {}, {}
                    locked += 1
                    print(f"  - {hid}: not open to reservations")
            except Exception as e:
                print(f"  ! {hid}: booking form: {e}", file=sys.stderr)
            time.sleep(PAUSE)

        out[str(hid)] = {"cap": cap, "caps": capmap.get(hid, [0, 0, 0]), "days": days}
        if wr:
            out[str(hid)].update(wr=wr, wrcap=wrcap)
        if note:
            out[str(hid)]["note"] = note
            notes += 1
        ok += 1
        print(f"  ✓ {hid}: {len(days)} open days" + (f", {len(wr)} winter-room nights" if wr else "") + (" + note" if note else ""))
        time.sleep(PAUSE)

    if fail > len(ids) * MAX_FAIL_SHARE:
        sys.exit(
            f"\n{fail} of {len(ids)} huts failed. Keeping the existing {OUT.name} "
            "and stopping, so the site keeps its last good data."
        )

    snap = {
        "generated": datetime.now(timezone.utc).isoformat(timespec="minutes"),
        "window_days": WINDOW_DAYS,
        "huts": out,
    }
    OUT.write_text(json.dumps(snap, ensure_ascii=False), encoding="utf-8")
    print(f"\nfetched {ok}, failed {fail}; {notes} notes from the huts, {locked} not open to reservations. Wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
