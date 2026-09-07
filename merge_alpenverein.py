#!/usr/bin/env python3
"""
Stage 2 of 2 — merge the ÖAV register into public/huts.json.

Matching, in order:
  1. exact OHRS id  (their b1_ohrs_hut_id == your hr_hut_id)
  2. coordinates within 150 m, with a name-similarity check to stop two
     neighbouring huts swapping places

Precedence for bed counts:
  hrs  >  alpenverein  >  osm  >  wikipedia,  with your overrides on top.

So an operator number replaces an OSM one, but never replaces an HRS
capacity or something you verified by hand. Every figure ends up stamped
with sleeping_source, so you can always tell where it came from.

Usage:
    python3 merge_alpenverein.py --dry-run    report only
    python3 merge_alpenverein.py              apply
"""
import json
import math
import sys
from difflib import SequenceMatcher
from pathlib import Path

HUTS = Path('public/huts.json')
AV = Path('data/av_huts.json')
MAX_METRES = 150
MIN_NAME = 0.55

dry = '--dry-run' in sys.argv

for p in (HUTS, AV):
    if not p.exists():
        sys.exit(f'Cannot find {p}. Run fetch_alpenverein.py first.')

data = json.loads(HUTS.read_text(encoding='utf-8'))
huts = data if isinstance(data, list) else data.get('huts')
av = json.loads(AV.read_text(encoding='utf-8'))


def dist(a_lat, a_lng, b_lat, b_lng):
    dlat = (a_lat - b_lat) * 111320
    dlng = (a_lng - b_lng) * 111320 * math.cos(math.radians((a_lat + b_lat) / 2))
    return math.hypot(dlat, dlng)


def norm(s):
    s = (s or '').lower()
    for a, b in (('ü', 'u'), ('ö', 'o'), ('ä', 'a'), ('ß', 'ss'), ('-', ' ')):
        s = s.replace(a, b)
    return ' '.join(s.split())


def similar(a, b):
    return SequenceMatcher(None, norm(a), norm(b)).ratio()


# ---------------------------------------------------------------- matching
by_hrs = {r['hr_hut_id']: r for r in av if r.get('hr_hut_id')}
av_geo = [r for r in av if r.get('lat') and r.get('lng')]

pairs = []          # (hut, av_record, how)
used = set()

for h in huts:
    rec = by_hrs.get(h.get('hr_hut_id')) if h.get('hr_hut_id') else None
    if rec:
        pairs.append((h, rec, 'ohrs'))
        used.add(id(rec))
        continue
    if not (h.get('lat') and h.get('lng')):
        continue
    best, best_d = None, MAX_METRES + 1
    for r in av_geo:
        if id(r) in used:
            continue
        d = dist(h['lat'], h['lng'], r['lat'], r['lng'])
        if d < best_d:
            best, best_d = r, d
    if best and similar(h.get('name'), best.get('name')) >= MIN_NAME:
        pairs.append((h, best, f'{best_d:.0f} m'))
        used.add(id(best))

print(f'{len(pairs)} of {len(huts)} huts matched to the ÖAV register')
print(f"  by OHRS id:      {sum(1 for _, _, k in pairs if k == 'ohrs')}")
print(f"  by coordinates:  {sum(1 for _, _, k in pairs if k != 'ohrs')}")

# ------------------------------------------------------------------ merge
RANK = {None: 0, 'osm': 1, 'wikipedia': 1, 'alpenverein': 2, 'hrs': 3, 'verified': 4}

filled = replaced = disagreed = 0
winter = showers = clubs = contacts = 0
examples = []

for h, r in ((a, b) for a, b, _ in pairs):
    h.setdefault('av_nr', r.get('av_nr'))

    # bed count
    new = r.get('sleeping')
    if new:
        cur = h.get('sleeping')
        cur_src = h.get('sleeping_source') or ('osm' if cur is not None else None)
        if RANK['alpenverein'] > RANK.get(cur_src, 0):
            if cur is None:
                filled += 1
            else:
                replaced += 1
                if cur != new:
                    disagreed += 1
                    if len(examples) < 12:
                        examples.append(f'  {h.get("name")[:34]:<34} {cur} -> {new}')
            if not dry:
                h['sleeping'] = new
                h['sleeping_source'] = 'alpenverein'
                h['beds_rooms'] = r.get('zimmerbetten')
                h['beds_dorm'] = r.get('matratzenlager')
                h['beds_emergency'] = r.get('notlager')

    # winter room
    if r.get('winterraum_beds') is not None and h.get('winterraum_beds') is None:
        winter += 1
        if not dry:
            h['winterraum_beds'] = r['winterraum_beds']
            h['winterraum_heated'] = r.get('winterraum_heated') == 1

    # shower — OSM left 1367 of these unknown
    if r.get('shower') is not None and h.get('shower') is None:
        showers += 1
        if not dry:
            h['shower'] = r['shower']

    # association: everything in this register is an alpine-club hut,
    # but never overwrite a Naturfreunde or hand-verified value
    if h.get('association') in (None, 'private'):
        clubs += 1
        if not dry:
            h['association'] = 'alpine_club'

    for src, dst in (('phone', 'phone'), ('website', 'website')):
        if r.get(src) and not h.get(dst):
            contacts += 1
            if not dry:
                h[dst] = r[src]

print(f'\nbed counts filled (were unknown):  {filled}')
print(f'bed counts replaced (OSM -> ÖAV):  {replaced}, of which {disagreed} differed')
if examples:
    print('\nwhere OSM and the operator disagreed:')
    for e in examples:
        print(e)
print(f'\nwinter-room capacity added:  {winter}')
print(f'shower status added:         {showers}')
print(f'association corrected:       {clubs}')
print(f'phone / website added:       {contacts}')

known = sum(1 for h in huts if h.get('sleeping') or h.get('hr_capacity'))
print(f'\nhuts with a bed count now: {known} of {len(huts)}')

if dry:
    print('\n--dry-run: nothing written.')
else:
    for h in huts:
        if h.get('sleeping') is not None and not h.get('sleeping_source'):
            h['sleeping_source'] = 'osm'
    HUTS.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'\nWrote {HUTS}. Run apply_overrides.py next.')
