"""
Hüttenfinder — multi-select filters.

Region, type, warden, elevation and association become multi-select (OR
within a category, AND across categories). Room type stays single-select
because it drives the bed counts rather than just hiding rows.

Run from the project folder:   python3 patch_multi.py
Backs up to src/App.jsx.premulti and refuses to run twice.
"""
import io, re, shutil, sys

P = 'src/App.jsx'
FIELDS = [('region', 'Region'), ('type', 'Type'), ('warden', 'Warden'),
          ('elev', 'Elev'), ('assoc', 'Assoc')]

try:
    s = io.open(P, encoding='utf-8').read()
except FileNotFoundError:
    sys.exit('Cannot find src/App.jsx — run this from the hutfinder folder.')

if 'MULTI_SELECT' in s:
    sys.exit('Already patched. Nothing to do.')
if 'activeChips' not in s:
    sys.exit('Run patch_chips.py first. Nothing changed.')

problems = []


def swap(old, new, why):
    global s
    if old not in s:
        problems.append(why)
        return
    s = s.replace(old, new, 1)


# 1. state becomes arrays
for lo, Hi in FIELDS:
    swap(f'const [{lo}, set{Hi}] = useState(null);',
         f'const [{lo}, set{Hi}] = useState([]); // MULTI_SELECT',
         f'state for {lo}')

# 2. a toggle helper, next to clearAll
swap('  const clearAll = () => {',
     '  const toggle = (arr, setArr, v) =>\n'
     '    setArr(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);\n'
     '  const clearAll = () => {',
     'clearAll anchor')

# 3. filtering logic
for lo, _ in FIELDS:
    pat = re.compile(r'if \(skip !== "' + lo + r'" && ' + lo + r' && (.+?) !== ' + lo + r'\) return false;')
    m = pat.search(s)
    if not m:
        problems.append(f'passes() line for {lo}')
        continue
    s = pat.sub(f'if (skip !== "{lo}" && {lo}.length && !{lo}.includes({m.group(1)})) return false;', s, count=1)

# 4. clearAll resets to empty arrays
for lo, Hi in FIELDS:
    swap(f'set{Hi}(null);', f'set{Hi}([]);', f'clearAll reset for {lo}')

# 5. truthiness checks
for block in ('anyFilter', 'anyNonDate'):
    m = re.search(r'const ' + block + r' =\n(.*?);\n', s, re.S)
    if not m:
        problems.append(block)
        continue
    line = m.group(1)
    for lo, _ in FIELDS:
        line = re.sub(r'\b' + lo + r'\b(?! \|\|=)', lo + '.length', line)
    s = s.replace(m.group(0), f'const {block} =\n{line};\n', 1)

# 6. the badge count
m = re.search(r'const moreCount = \[[^\]]*\]\.filter\(Boolean\)\.length;', s)
if m:
    s = s.replace(m.group(0),
                  'const moreCount =\n'
                  '    [bookableOnly, showerOnly].filter(Boolean).length +\n'
                  '    [type, elev, warden, assoc].filter((a) => a.length).length;', 1)
else:
    problems.append('moreCount')

# 7. chips — one per selected value
CHIP_OLD = {
    'region': ('if (region) activeChips.push({ k: "region", label: region, clear: () => setRegion(null) });',
               'for (const r of region)\n'
               '    activeChips.push({ k: "region:" + r, label: r, clear: () => toggle(region, setRegion, r) });'),
}
swap(*CHIP_OLD['region'], 'region chip')

s = re.sub(r'  if \(type\) activeChips\.push\(\{ k: "type", label: TYPE_LABEL\[type\] \|\| type, clear: \(\) => setType\(null\) \}\);',
           '  for (const t of type)\n'
           '    activeChips.push({ k: "type:" + t, label: TYPE_LABEL[t] || t, clear: () => toggle(type, setType, t) });', s)

s = re.sub(r'  if \(warden\)\n    activeChips\.push\(\{ k: "warden", label: WARDEN_LABEL\[warden\] \|\| warden, clear: \(\) => setWarden\(null\) \}\);',
           '  for (const w of warden)\n'
           '    activeChips.push({ k: "warden:" + w, label: WARDEN_LABEL[w] || w, clear: () => toggle(warden, setWarden, w) });', s)

s = re.sub(r'  if \(elev\) \{\n.*?\n  \}\n',
           '  for (const e of elev) {\n'
           '    const band = ELEV_BANDS.find((b) => b.key === e);\n'
           '    activeChips.push({\n'
           '      k: "elev:" + e,\n'
           '      label: band ? band.label : "Elevation unknown",\n'
           '      clear: () => toggle(elev, setElev, e),\n'
           '    });\n'
           '  }\n', s, count=1, flags=re.S)

s = re.sub(r'  if \(assoc\) activeChips\.push\(\{ k: "assoc", label: ASSOC_LABEL\[assoc\] \|\| assoc, clear: \(\) => setAssoc\(null\) \}\);',
           '  for (const a of assoc)\n'
           '    activeChips.push({ k: "assoc:" + a, label: ASSOC_LABEL[a] || a, clear: () => toggle(assoc, setAssoc, a) });', s)

# 8. the pills
names = '|'.join(lo for lo, _ in FIELDS)
setters = '|'.join(Hi for _, Hi in FIELDS)

s = re.sub(r'onClick=\{\(\) => set(' + setters + r')\((' + names + r') === ([A-Za-z0-9_.\[\]]+) \? null : \3\)\}',
           r'onClick={() => toggle(\2, set\1, \3)}', s)
s = re.sub(r'active=\{!(' + names + r')\}', r'active={!\1.length}', s)
s = re.sub(r'onClick=\{\(\) => set(' + setters + r')\(null\)\}', r'onClick={() => set\1([])}', s)
s = re.sub(r'\b(' + names + r') === ([A-Za-z0-9_.\[\]]+)', r'\1.includes(\2)', s)

if problems:
    sys.exit('Could not find: ' + '; '.join(problems) + '\nNothing changed.')

shutil.copy(P, P + '.premulti')
io.open(P, 'w', encoding='utf-8').write(s)
print('Patched src/App.jsx')
print('  multi-select: region, type, warden, elevation, association')
print('  single-select: room type (drives the bed counts)')
print('  backup: src/App.jsx.premulti')
