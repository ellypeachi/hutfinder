"""
Hüttenfinder — targeted empty-state suggestions.

Works out which single filter is blocking the search and offers to drop
just that one, with the number of huts it would bring back.

Run from the project folder:   python3 patch_unblock.py
Backs up to src/App.jsx.preunblock and refuses to run twice.
"""
import io, shutil, sys

P = 'src/App.jsx'

try:
    s = io.open(P, encoding='utf-8').read()
except FileNotFoundError:
    sys.exit('Cannot find src/App.jsx — run this from the hutfinder folder.')

if 'UNBLOCKERS' in s:
    sys.exit('Already patched. Nothing to do.')
if 'const blockers = [];' not in s:
    sys.exit('Run patch_empty.py first. Nothing changed.')

# 1. work out what each active filter is costing
ANCHOR = '  for (const c of activeChips) blockers.push(c.label);\n'
if ANCHOR not in s:
    sys.exit('Could not find the blockers block. Nothing changed.')

LOGIC = ANCHOR + '''
  // UNBLOCKERS
  const elevLabel = (e) => {
    const b = ELEV_BANDS.find((x) => x.key === e);
    return b ? b.label : "Elevation unknown";
  };
  const filterCategories = [
    { skip: "region", on: region.length > 0, label: region.join(" or "), clear: () => setRegion([]) },
    {
      skip: "type",
      on: type.length > 0,
      label: type.map((t) => TYPE_LABEL[t] || t).join(" or "),
      clear: () => setType([]),
    },
    { skip: "elev", on: elev.length > 0, label: elev.map(elevLabel).join(" or "), clear: () => setElev([]) },
    {
      skip: "warden",
      on: !!warden,
      label: WARDEN_LABEL[warden] || warden,
      clear: () => setWarden(null),
    },
    { skip: "assoc", on: !!assoc, label: ASSOC_LABEL[assoc] || assoc, clear: () => setAssoc(null) },
    { skip: "shower", on: showerOnly, label: "Shower", clear: () => setShowerOnly(false) },
    {
      skip: "bookable",
      on: bookableOnly,
      label: "Bookable online",
      clear: () => setBookableOnly(false),
    },
    {
      skip: "roomType",
      on: !!roomType,
      label: BUCKET_LABEL[roomType] || roomType,
      clear: () => setRoomType(null),
    },
    { skip: "query", on: !!query, label: "\\u201c" + query + "\\u201d", clear: () => setQuery("") },
  ];
  const unblockers =
    filtered.length === 0
      ? filterCategories
          .filter((c) => c.on)
          .map((c) => ({ ...c, n: huts.filter((h) => passes(h, c.skip)).length }))
          .filter((c) => c.n > 0)
          .sort((a, b) => b.n - a.n)
          .slice(0, 2)
      : [];
'''
s = s.replace(ANCHOR, LOGIC, 1)

# 2. the buttons, above the blunt Clear filters
BTN = ('background: "transparent", color: "var(--ink)", '
       'border: "1px solid var(--line-control)", borderRadius: "var(--radius)", '
       'padding: "0.55rem 1rem", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer"')

TARGET = '''                    {anyNonDate ? (
                      <button onClick={clearAll} style={{ ''' + BTN + ''' }}>
                        Clear filters
                      </button>
                    ) : null}'''
if TARGET not in s:
    sys.exit('Could not find the Clear filters button in the empty state. Nothing changed.')

NEW = '''                    {unblockers.map((u) => (
                      <button key={u.skip} onClick={u.clear} style={{ ''' + BTN + ''' }}>
                        {`Drop ${u.label} · ${u.n} ${u.n === 1 ? "hut" : "huts"}`}
                      </button>
                    ))}
''' + TARGET
s = s.replace(TARGET, NEW, 1)

shutil.copy(P, P + '.preunblock')
io.open(P, 'w', encoding='utf-8').write(s)
print('Patched src/App.jsx')
print('  empty state now names which filter to drop, and what it unlocks')
print('  shows the two most productive, ordered by how many huts they return')
print('  backup: src/App.jsx.preunblock')
