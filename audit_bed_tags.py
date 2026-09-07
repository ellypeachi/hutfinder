#!/usr/bin/env python3
"""
Which bed-ish OSM tags actually exist on Austrian huts?

import_osm.py reads `beds` and `capacity`. This checks whether the data
holds counts under other keys that are being thrown away.

Usage:  python3 audit_bed_tags.py
"""
import json
import re
import sys
import urllib.request
from collections import Counter

QUERY = """
[out:json][timeout:240];
area["ISO3166-1"="AT"][admin_level=2]->.at;
(
  node["tourism"="alpine_hut"](area.at);
  way["tourism"="alpine_hut"](area.at);
  node["tourism"="wilderness_hut"](area.at);
  way["tourism"="wilderness_hut"](area.at);
  node["tourism"="chalet"](area.at);
  way["tourism"="chalet"](area.at);
);
out tags;
"""

INTERESTING = re.compile(r'bed|capacity|room|sleep|dorm|matratz|lager|person|guest', re.I)

print('Querying Overpass (this takes up to a minute)...')
try:
    req = urllib.request.Request(
        'https://overpass-api.de/api/interpreter',
        data=QUERY.encode('utf-8'),
        headers={'User-Agent': 'huettenfinder-tag-audit'})
    raw = urllib.request.urlopen(req, timeout=300).read()
except Exception as e:
    sys.exit(f'Overpass request failed: {e}')

elements = json.loads(raw).get('elements', [])
print(f'{len(elements)} elements\n')

keys = Counter()
values = {}
for el in elements:
    for k, v in (el.get('tags') or {}).items():
        if INTERESTING.search(k):
            keys[k] += 1
            values.setdefault(k, Counter())[str(v)] += 1

if not keys:
    print('No bed-related tags found at all.')
    sys.exit()

print(f'{"tag":<28}{"count":>7}   sample values')
print('-' * 78)
for k, n in keys.most_common():
    sample = ', '.join(v for v, _ in values[k].most_common(4))
    print(f'{k:<28}{n:>7}   {sample[:40]}')

numeric = {k: n for k, n in keys.items()
           if sum(c for v, c in values[k].items() if v.strip().isdigit()) > 0}
print('\nTags holding plain numbers (usable as a bed count):')
for k in sorted(numeric, key=lambda x: -keys[x]):
    n_num = sum(c for v, c in values[k].items() if v.strip().isdigit())
    print(f'  {k:<26}{n_num:>6} numeric of {keys[k]}')

print('\nimport_osm.py currently reads: beds, capacity')
extra = [k for k in numeric if k not in ('beds', 'capacity')]
if extra:
    print('Not being read:', ', '.join(sorted(extra)))
else:
    print('Nothing usable is being missed.')
