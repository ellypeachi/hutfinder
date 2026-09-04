#!/usr/bin/env python3
"""
Apply hand-verified corrections to public/huts.json.

The OSM import is automated and sometimes wrong. Rather than editing
huts.json directly — which gets overwritten on the next rebuild — record
corrections in data/overrides.json and run this afterwards.

Usage:
    python3 apply_overrides.py            apply and report
    python3 apply_overrides.py --check    report only, change nothing

Run this as the LAST step of the pipeline, after huts.json is rebuilt.
"""
import json
import os
import sys

HUTS = 'public/huts.json'
OVERRIDES = 'data/overrides.json'

check_only = '--check' in sys.argv

for path in (HUTS, OVERRIDES):
    if not os.path.exists(path):
        sys.exit(f'Cannot find {path}. Run this from the hutfinder folder.')

with open(HUTS, encoding='utf-8') as f:
    data = json.load(f)
with open(OVERRIDES, encoding='utf-8') as f:
    overrides = json.load(f)

# huts.json may be a bare list or wrapped in an object
huts = data if isinstance(data, list) else data.get('huts')
if huts is None:
    sys.exit('Could not find the hut list inside huts.json.')

by_id = {h.get('id'): h for h in huts}

applied = 0
changes = []
missing = []

for hut_id, fields in overrides.items():
    if hut_id.startswith('_'):
        continue
    hut = by_id.get(hut_id)
    if hut is None:
        missing.append(hut_id)
        continue
    name = hut.get('name', hut_id)
    for key, value in fields.items():
        if key.startswith('_'):
            continue
        before = hut.get(key)
        if before == value:
            continue
        changes.append(f'  {name}: {key}  {before!r} -> {value!r}')
        if not check_only:
            hut[key] = value
        applied += 1

if changes:
    print('Changes:' if not check_only else 'Would change:')
    for line in changes:
        print(line)
else:
    print('Nothing to change — huts.json already matches the overrides.')

if missing:
    print('\nIds in overrides.json not found in huts.json:')
    for m in missing:
        print(f'  {m}')
    print('  (the hut may have been renamed or removed upstream)')

if applied and not check_only:
    with open(HUTS, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'\nWrote {HUTS} ({applied} field(s) changed).')
elif check_only:
    print('\n--check: nothing written.')
