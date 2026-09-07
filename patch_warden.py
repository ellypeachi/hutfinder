"""
Hüttenfinder — keep the warden inference, drop the false certainty.

import_osm.py returns "bewirtschaftet" for every tourism=alpine_hut. On
the 268 huts where the OAV register lets us check, that guess is right
about 78% of the time — useful, but wrong one time in five, and the wrong
cases are the harmful ones.

So rather than deleting it or trusting it, this labels it:

  operator data (OAV huette_modus)  -> "serviced" / "attended" / "self-service"
  wilderness_hut                    -> "self-service"   (definitional)
  inferred from alpine_hut          -> "usually serviced"

The filter keeps working on all of them. The card stops claiming more
than it knows.

Usage:
    python3 patch_warden.py --check    numbers only
    python3 patch_warden.py            apply
"""
import json, math, shutil, sys
from difflib import SequenceMatcher
from pathlib import Path

check = '--check' in sys.argv
HUTS, AV, APP, IMP = (Path('public/huts.json'), Path('data/av_huts.json'),
                      Path('src/App.jsx'), Path('scripts/import_osm.py'))
for p in (HUTS, AV, APP, IMP):
    if not p.exists():
        sys.exit(f'Cannot find {p}. Run this from the hutfinder folder.')

data = json.loads(HUTS.read_text(encoding='utf-8'))
huts = data if isinstance(data, list) else data.get('huts')
av = json.loads(AV.read_text(encoding='utf-8'))


def dist(a, b, c, d):
    return math.hypot((a - c) * 111320,
                      (b - d) * 111320 * math.cos(math.radians((a + c) / 2)))


def norm(s):
    s = (s or '').lower()
    for x, y in (('ü', 'u'), ('ö', 'o'), ('ä', 'a'), ('ß', 'ss'), ('-', ' ')):
        s = s.replace(x, y)
    return ' '.join(s.split())


by_hrs = {r['hr_hut_id']: r for r in av if r.get('hr_hut_id')}
geo = [r for r in av if r.get('lat')]
used, pairs = set(), []
for h in huts:
    r = by_hrs.get(h.get('hr_hut_id')) if h.get('hr_hut_id') else None
    if r:
        pairs.append((h, r)); used.add(id(r)); continue
    if not h.get('lat'):
        continue
    best, bd = None, 151
    for c in geo:
        if id(c) in used:
            continue
        d = dist(h['lat'], h['lng'], c['lat'], c['lng'])
        if d < bd:
            best, bd = c, d
    if best and SequenceMatcher(None, norm(h.get('name')), norm(best.get('name'))).ratio() >= .55:
        pairs.append((h, best)); used.add(id(best))

confirmed, corrected, modes = 0, 0, {}
for h, r in pairs:
    m = r.get('modus')
    if not m:
        continue
    modes[m] = modes.get(m, 0) + 1
    if h.get('warden') != m:
        corrected += 1
    confirmed += 1
    if not check:
        h['warden'] = m
        h['warden_source'] = 'alpenverein'

inferred = definitional = 0
for h in huts:
    if h.get('warden_source'):
        continue
    src = 'osm_type' if h.get('warden') == 'selbstversorger' else 'inferred'
    if src == 'inferred':
        inferred += 1
    else:
        definitional += 1
    if not check:
        h['warden_source'] = src

print(f'matched to the register: {len(pairs)}')
print(f'  confirmed by operator: {confirmed}  {modes}')
print(f'  of those, corrected:   {corrected}  (the inference was wrong)')
print(f'  definitional (wilderness_hut): {definitional}')
print(f'  left as inference, now labelled "usually": {inferred}')

if check:
    print('\n--check: nothing written.')
    raise SystemExit

imp = IMP.read_text(encoding='utf-8')
OLD_IMP = '        "warden": warden_of(tags),'
NEW_IMP = ('        "warden": warden_of(tags),\n'
           '        # "inferred" means alpine_hut implied it, nobody confirmed it.\n'
           '        # The card shows those as "usually serviced".\n'
           '        "warden_source": ("osm_type" if tags.get("tourism") == "wilderness_hut"\n'
           '                          else "inferred"),')
if 'warden_source' in imp:
    print('\nimport_osm.py: already done')
elif OLD_IMP in imp:
    shutil.copy(IMP, str(IMP) + '.bak')
    IMP.write_text(imp.replace(OLD_IMP, NEW_IMP, 1), encoding='utf-8')
    print('\nimport_osm.py: now stamps warden_source')
else:
    print('\n!! import_osm.py: could not find the warden line — check by hand')

app = APP.read_text(encoding='utf-8')
subs = [
    ('const WARDEN_LABEL = { bewirtschaftet: "Serviced", selbstversorger: "Self-service" };',
     'const WARDEN_LABEL = { bewirtschaftet: "Serviced", bewartet: "Attended", selbstversorger: "Self-service" };'),
    ('''{hut.warden === "bewirtschaftet"
            ? "serviced"
            : hut.warden === "selbstversorger"
            ? "self-service"
            : "warden unknown"}''',
     '''{hut.warden === "bewirtschaftet"
            ? hut.warden_source === "inferred"
              ? "usually serviced"
              : "serviced"
            : hut.warden === "bewartet"
            ? "attended"
            : hut.warden === "selbstversorger"
            ? "self-service"
            : "warden unknown"}'''),
]
done = 0
for o, n in subs:
    if o in app:
        app = app.replace(o, n, 1); done += 1
    else:
        print(f'!! App.jsx: could not find -> {o.splitlines()[0][:60]}')
if done:
    shutil.copy(APP, str(APP) + '.bak')
    APP.write_text(app, encoding='utf-8')
print(f'App.jsx: {done} of {len(subs)} changes applied')

HUTS.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'\nWrote {HUTS}. Run apply_overrides.py next.')
