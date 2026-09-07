"""
Hüttenfinder — backfill bed counts from the OSM tags already being fetched.

import_osm.py only reads `beds` and `capacity`. The Overpass data also
carries capacity:beds, capacity:overnight, capacity:dormitory and
capacity:persons. This reads those too, and captures winter-room capacity
as its own field rather than folding it into the bookable bed count.

Only fills huts where `sleeping` is currently null — it never overwrites
a number that is already there, including hand-verified overrides.

Run from the project folder:   python3 patch_beds.py
Backs up to scripts/enrich_osm_attrs.py.prebeds and refuses to run twice.
"""
import io, shutil, sys

P = 'scripts/enrich_osm_attrs.py'

try:
    s = io.open(P, encoding='utf-8').read()
except FileNotFoundError:
    sys.exit(f'Cannot find {P}. Run this from the hutfinder folder.')

if 'BED_TAGS' in s:
    sys.exit('Already patched. Nothing to do.')

HELPERS = '''def _num(v):
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


def main():'''

if 'def main():' not in s:
    sys.exit('Could not find main(). Nothing changed.')
s = s.replace('def main():', HELPERS, 1)

OLD_UNMATCHED = '''            h["pets"] = h.get("pets")
            continue'''
NEW_UNMATCHED = '''            h["pets"] = h.get("pets")
            h["winterraum_beds"] = h.get("winterraum_beds")
            continue'''
if OLD_UNMATCHED not in s:
    sys.exit('Could not find the unmatched branch. Nothing changed.')
s = s.replace(OLD_UNMATCHED, NEW_UNMATCHED, 1)

OLD_ASSIGN = '''        h["pets"] = pets_of(tags)'''
NEW_ASSIGN = '''        h["pets"] = pets_of(tags)
        h["winterraum_beds"] = winter_beds_of(tags)
        if h.get("sleeping") is None:
            b = beds_of(tags)
            if b is not None:
                h["sleeping"] = b
                filled += 1'''
if OLD_ASSIGN not in s:
    sys.exit('Could not find the tag assignments. Nothing changed.')
s = s.replace(OLD_ASSIGN, NEW_ASSIGN, 1)

if '    matched = 0' not in s:
    sys.exit('Could not find the matched counter. Nothing changed.')
s = s.replace('    matched = 0', '    matched = 0\n    filled = 0', 1)

MARK = 'huts to an OSM element")'
i = s.find(MARK)
if i < 0:
    sys.exit('Could not find the summary line. Nothing changed.')
j = s.index('\n', i) + 1
REPORT = ('    print(f"  beds backfilled from OSM: {filled}")\n'
          '    print("  beds known now:", sum(1 for h in huts if h.get("sleeping")))\n'
          '    print("  winter-room capacity known:",\n'
          '          sum(1 for h in huts if h.get("winterraum_beds")))\n')
s = s[:j] + REPORT + s[j:]

shutil.copy(P, P + '.prebeds')
io.open(P, 'w', encoding='utf-8').write(s)
print(f'Patched {P}')
print('  reads capacity:beds, capacity:overnight, capacity:dormitory, capacity:persons')
print('  winter-room capacity stored separately as winterraum_beds')
print('  rooms deliberately ignored — rooms are not beds')
print(f'  backup: {P}.prebeds')
