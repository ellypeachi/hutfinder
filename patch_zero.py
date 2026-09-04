"""
Hüttenfinder — keep empty filter options visible.

Options with no matches stay in place, dimmed, instead of disappearing.
They remain clickable, so you can still swap one selection for another.

Run from the project folder:   python3 patch_zero.py
Backs up to src/App.jsx.prezero and refuses to run twice.
"""
import io, re, shutil, sys

P = 'src/App.jsx'

try:
    s = io.open(P, encoding='utf-8').read()
except FileNotFoundError:
    sys.exit('Cannot find src/App.jsx — run this from the hutfinder folder.')

if 'ZERO_STATE_PILLS' in s:
    sys.exit('Already patched. Nothing to do.')

# 1. Pill gets a dimmed empty state
OLD_PILL = '''        border: active ? "1px solid var(--ink)" : "1px solid var(--hair)",
        background: active ? "var(--blue)" : "var(--card)",
        color: active ? "#fff" : "var(--ink)",'''
NEW_PILL = '''        border: active ? "1px solid var(--ink)" : "1px solid var(--hair)",
        background: active ? "var(--blue)" : empty ? "transparent" : "var(--card)",
        color: active ? "#fff" : empty ? "var(--ink-soft)" : "var(--ink)",'''
if OLD_PILL not in s:
    sys.exit('Could not find the Pill styles. Nothing changed.')
s = s.replace(OLD_PILL, NEW_PILL, 1)

OLD_SIG = '''function Pill({ active, onClick, label, count }) {
  return ('''
NEW_SIG = '''function Pill({ active, onClick, label, count }) {
  const empty = count === 0 && !active; // ZERO_STATE_PILLS
  return ('''
if OLD_SIG not in s:
    sys.exit('Could not find the Pill signature. Nothing changed.')
s = s.replace(OLD_SIG, NEW_SIG, 1)

# 2. every region stays listed, not just those with matches
OLD_REGIONS = '''  const presentRegions = REGION_ORDER.filter((r) => regionCounts[r] > 0).concat(
    Object.keys(regionCounts)
      .filter((r) => !REGION_ORDER.includes(r) && regionCounts[r] > 0)
      .sort()
  );'''
NEW_REGIONS = '''  const allRegionKeys = Array.from(new Set(huts.map(regionOf)));
  const presentRegions = REGION_ORDER.filter((r) => allRegionKeys.includes(r)).concat(
    allRegionKeys.filter((r) => !REGION_ORDER.includes(r)).sort()
  );'''
if OLD_REGIONS not in s:
    sys.exit('Could not find presentRegions. Nothing changed.')
s = s.replace(OLD_REGIONS, NEW_REGIONS, 1)

# 3. drop the inline "hide when zero" guards
pat = re.compile(r'\{\w+Counts\[[^\]]+\] > 0 \|\| [^?\n]+\? \(')
found = pat.findall(s)
s = pat.sub('{true ? (', s)

# 4. counts default to 0 so the dimmed state triggers
s = re.sub(r'count=\{(\w+Counts)\[([^\]]+)\]\}', r'count={\1[\2] || 0}', s)

shutil.copy(P, P + '.prezero')
io.open(P, 'w', encoding='utf-8').write(s)
print('Patched src/App.jsx')
print(f'  removed {len(found)} hide-when-empty guards')
print('  every region now always listed')
print('  empty options render dimmed but stay clickable')
print('  backup: src/App.jsx.prezero')
