"""
Hüttenfinder — stop claiming "no overnight" when the data is simply missing.

import_osm.py wrote 0 whenever OSM had no beds tag, so 1,387 huts —
including 842 Schutzhütten — are labelled as having no overnight places.
This makes missing data null, migrates the existing file, and teaches the
card to say "beds unknown" instead of asserting something false.

Run from the project folder:   python3 patch_sleeping.py
Backs up every file it touches and refuses to run twice.
"""
import io, json, os, shutil, sys

check_only = '--check' in sys.argv
notes = []

# ---------------------------------------------------------------- 1. import
IMP = 'scripts/import_osm.py'
OLD_IMP = '"sleeping": int(beds) if beds else 0,'
NEW_IMP = '"sleeping": int(beds) if beds else None,   # None = OSM said nothing'

if not os.path.exists(IMP):
    sys.exit(f'Cannot find {IMP}. Run this from the hutfinder folder.')

imp = io.open(IMP, encoding='utf-8').read()
if OLD_IMP in imp:
    notes.append(f'{IMP}: missing beds tag now writes null instead of 0')
    if not check_only:
        shutil.copy(IMP, IMP + '.bak')
        io.open(IMP, 'w', encoding='utf-8').write(imp.replace(OLD_IMP, NEW_IMP, 1))
elif 'None = OSM said nothing' in imp:
    notes.append(f'{IMP}: already done')
else:
    sys.exit(f'Could not find the sleeping line in {IMP}. Nothing changed.')

# ------------------------------------------------------------------ 2. data
HUTS = 'public/huts.json'
if not os.path.exists(HUTS):
    sys.exit(f'Cannot find {HUTS}.')

data = json.load(io.open(HUTS, encoding='utf-8'))
huts = data if isinstance(data, list) else data.get('huts')
if huts is None:
    sys.exit('Could not find the hut list inside huts.json.')

# A tagged beds=0 is vanishingly rare in OSM, so an existing 0 almost
# always means "not tagged". Jausenstationen are the exception: they are
# day-only by definition, so a 0 there is genuinely 0.
converted = kept = 0
for h in huts:
    if h.get('sleeping') == 0:
        if h.get('type') == 'jausenstation':
            kept += 1
        else:
            if not check_only:
                h['sleeping'] = None
            converted += 1

notes.append(f'{HUTS}: {converted} huts 0 -> null, {kept} Jausenstationen left at 0')
if converted and not check_only:
    shutil.copy(HUTS, HUTS + '.bak')
    json.dump(data, io.open(HUTS, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

# ------------------------------------------------------------------ 3. card
APP = 'src/App.jsx'
app = io.open(APP, encoding='utf-8').read()
OLD_CARD = '''            : hut.sleeping > 0
            ? `${hut.sleeping} beds`
            : "no overnight"}'''
NEW_CARD = '''            : hut.sleeping > 0
            ? `${hut.sleeping} beds`
            : hut.sleeping === 0
            ? "no overnight"
            : "beds unknown"}'''

if OLD_CARD in app:
    notes.append(f'{APP}: card now says "beds unknown" when the count is missing')
    if not check_only:
        shutil.copy(APP, APP + '.bak')
        io.open(APP, 'w', encoding='utf-8').write(app.replace(OLD_CARD, NEW_CARD, 1))
elif '"beds unknown"' in app:
    notes.append(f'{APP}: already done')
else:
    notes.append(f'!! {APP}: could not find the beds label — check it by hand')

print('Would change:' if check_only else 'Changed:')
for n in notes:
    print('  ' + n)
if check_only:
    print('\n--check: nothing written.')
else:
    print('\nBackups written alongside each file as .bak')
