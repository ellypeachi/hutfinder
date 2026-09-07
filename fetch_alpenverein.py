#!/usr/bin/env python3
"""
Stage 1 of 2 — pull the ÖAV hut register from their public feature service.

The Hüttenfinder map at alpenverein.at is an ArcGIS app backed by a public
FeatureServer. That is the operator's own register: bed counts maintained
by the sections that own the huts, not crowd-sourced and not a media
aggregator. One request replaces scraping ~1000 pages.

Writes data/av_huts.json. Merging into huts.json happens in stage 2.

Usage:
    python3 fetch_alpenverein.py
"""
import json
import sys
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

BASE = ('https://services-eu1.arcgis.com/rCZoRdhnpuir5w5n/arcgis/rest/services/'
        'Alpenvereinsh%C3%BCtten_H%C3%BCttenfinder_VIEW_/FeatureServer/1/query')
OUT = Path('data/av_huts.json')
PAGE = 2000   # the layer's max record count

# Coded value lookups worth resolving now rather than storing as integers.
KATEGORIE = {20: 'biwak'}
MODUS = {1: 'bewirtschaftet', 3: 'bewartet', 4: 'selbstversorger'}


def query(offset):
    params = {
        'where': '1=1',
        'outFields': '*',
        'returnGeometry': 'true',
        'outSR': '4326',
        'f': 'json',
        'resultOffset': str(offset),
        'resultRecordCount': str(PAGE),
    }
    url = BASE + '?' + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={
        'User-Agent': 'huettenfinder/1.0 (+https://www.hutfinder.at)'})
    return json.loads(urllib.request.urlopen(req, timeout=120).read())


print('Querying the ÖAV feature service ...')
features = []
offset = 0
while True:
    try:
        data = query(offset)
    except Exception as e:
        sys.exit(f'Request failed: {e}')
    if 'error' in data:
        sys.exit(f"Service returned an error: {data['error']}")
    batch = data.get('features', [])
    features += batch
    print(f'  {len(features)} records')
    if len(batch) < PAGE or not data.get('exceededTransferLimit'):
        break
    offset += PAGE

if not features:
    sys.exit('No records returned.')


def n(v):
    """Treat missing and negative as unknown, but keep a real 0."""
    if v is None or (isinstance(v, (int, float)) and v < 0):
        return None
    return int(v) if isinstance(v, (int, float)) else None


out = []
for f in features:
    a = f.get('attributes', {})
    g = f.get('geometry') or {}

    zimmer = n(a.get('b1_zimmerlager_anzahl'))
    lager = n(a.get('b1_matratzenlager_anzahl'))
    sleeping = None
    if zimmer is not None or lager is not None:
        sleeping = (zimmer or 0) + (lager or 0)

    out.append({
        'av_nr': a.get('b1_nr'),
        'name': (a.get('b1_name') or '').strip(),
        'lat': g.get('y'),
        'lng': g.get('x'),
        'elevation': n(a.get('b1_meereshoehe')),
        'hr_hut_id': a.get('b1_ohrs_hut_id'),
        'avaktiv_id': a.get('avaktiv_id'),
        # beds
        'zimmerbetten': zimmer,
        'matratzenlager': lager,
        'notlager': n(a.get('b1_notlager_anzahl')),
        'sleeping': sleeping,
        # winter room — emergency shelter, deliberately separate
        'winterraum_beds': n(a.get('b1_winterraum_anzahl')),
        'winterraum_heated': a.get('winterraum_beheizbar'),
        'winterraum_key': a.get('b1_winterraum_schluessel'),
        # who runs it
        'verein_nr': a.get('b1_verein_nr'),
        'owner': (a.get('huette_eigentuemer') or '').strip() or None,
        'modus': MODUS.get(a.get('huette_modus')),
        'selbstversorger': a.get('sv_huette_c') == 1,
        'kategorie': KATEGORIE.get(a.get('b1_kategorie_nr'), a.get('b1_kategorie_nr')),
        # amenities and contact
        'shower': None if a.get('dusche_c') is None else a.get('dusche_c') == 1,
        'phone': (a.get('b1_telefon') or '').strip() or None,
        'email': (a.get('b1_email') or '').strip() or None,
        'website': (a.get('homepage') or a.get('homepage_GIS') or '').strip() or None,
        # season
        'open_all_year': a.get('ganzjaehrig_geoeffnet_c') == 1,
        'months_open': (a.get('monate_geoffnet') or '').strip() or None,
        'summer_from': a.get('sommer_von_GIS'),
        'summer_to': a.get('sommer_bis_GIS'),
        'datenstand': a.get('datenstand'),
    })

OUT.parent.mkdir(exist_ok=True)
OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')

with_beds = sum(1 for r in out if r['sleeping'])
with_coords = sum(1 for r in out if r['lat'])
with_hrs = sum(1 for r in out if r['hr_hut_id'])
with_winter = sum(1 for r in out if r['winterraum_beds'])
in_at = sum(1 for r in out if r['lat'] and 46.3 < r['lat'] < 49.1 and 9.4 < r['lng'] < 17.2)

print(f'\n{len(out)} huts in the register')
print(f'  with bed counts:      {with_beds}')
print(f'  with coordinates:     {with_coords}')
print(f'  with an OHRS id:      {with_hrs}   <- exact join to your hr_hut_id')
print(f'  with a winter room:   {with_winter}')
print(f'  roughly inside AT:    {in_at}   (the layer also covers DE and IT huts)')
print('\n  operating mode:', dict(Counter(r['modus'] for r in out)))
print(f'\nWrote {OUT}')
print('Nothing else has changed yet — stage 2 does the merge.')
