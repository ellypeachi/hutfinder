"""
Hüttenfinder — active filter summary.

Adds a row of dismissible chips showing which filters are on,
and stops "Clear filters" from wiping the chosen dates.

Run from the project folder:   python3 patch_chips.py
Backs up to src/App.jsx.prechips and refuses to run twice.
"""
import io, shutil, sys

P = 'src/App.jsx'

try:
    s = io.open(P, encoding='utf-8').read()
except FileNotFoundError:
    sys.exit('Cannot find src/App.jsx — run this from the hutfinder folder.')

if 'ACTIVE_FILTER_CHIPS' in s:
    sys.exit('Already patched. Nothing to do.')
if '{/* MORE_FILTERS_PANEL */}' not in s:
    sys.exit('Run patch_filters.py first. Nothing changed.')

orig = s

# 1. stop clearAll touching the dates
for line in ('    setFrom("");\n', '    setTo("");\n'):
    if line in s:
        s = s.replace(line, '', 1)
    else:
        sys.exit(f'Could not find {line.strip()} in clearAll. Nothing changed.')

# 2. a flag for "any filter other than the dates"
ANCHOR = ('  const anyFilter =\n'
          '    region || type || warden || elev || assoc || showerOnly || bookableOnly || from || roomType || query;\n')
if ANCHOR not in s:
    sys.exit('Could not find the anyFilter block. Nothing changed.')
s = s.replace(ANCHOR, ANCHOR +
              '  const anyNonDate =\n'
              '    region || type || warden || elev || assoc || showerOnly || bookableOnly || roomType || query;\n', 1)

# 3. build the chip list, just after clearAll
CLEAR_END = '    setRoomType(null);\n    setQuery("");\n  };\n'
if CLEAR_END not in s:
    sys.exit('Could not find the end of clearAll. Nothing changed.')

CHIPS = CLEAR_END + '''
  const WARDEN_LABEL = { bewirtschaftet: "Serviced", selbstversorger: "Self-service" };
  const activeChips = [];
  if (query) activeChips.push({ k: "q", label: `\u201c${query}\u201d`, clear: () => setQuery("") });
  if (region) activeChips.push({ k: "region", label: region, clear: () => setRegion(null) });
  if (roomType)
    activeChips.push({ k: "roomType", label: BUCKET_LABEL[roomType] || roomType, clear: () => setRoomType(null) });
  if (bookableOnly)
    activeChips.push({ k: "bookable", label: "Bookable online", clear: () => setBookableOnly(false) });
  if (type) activeChips.push({ k: "type", label: TYPE_LABEL[type] || type, clear: () => setType(null) });
  if (warden)
    activeChips.push({ k: "warden", label: WARDEN_LABEL[warden] || warden, clear: () => setWarden(null) });
  if (elev) {
    const band = ELEV_BANDS.find((b) => b.key === elev);
    activeChips.push({ k: "elev", label: band ? band.label : "Elevation unknown", clear: () => setElev(null) });
  }
  if (assoc) activeChips.push({ k: "assoc", label: ASSOC_LABEL[assoc] || assoc, clear: () => setAssoc(null) });
  if (showerOnly) activeChips.push({ k: "shower", label: "Shower", clear: () => setShowerOnly(false) });
'''
s = s.replace(CLEAR_END, CHIPS, 1)

# 4. the chip row, above the More filters panel
PANEL = '            {/* MORE_FILTERS_PANEL */}'
ROW = '''            {/* ACTIVE_FILTER_CHIPS */}
            {anyNonDate ? (
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.4rem",
                  alignItems: "center",
                  marginBottom: "1rem",
                }}
              >
                {activeChips.map((c) => (
                  <button
                    key={c.k}
                    onClick={c.clear}
                    aria-label={`Remove filter ${c.label}`}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      background: "var(--powder-lt)",
                      border: "1px solid var(--powder)",
                      borderRadius: 100,
                      color: "var(--blue-deep)",
                      padding: "0.3rem 0.7rem",
                      fontSize: "0.8rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    {c.label}
                    <span aria-hidden="true" style={{ fontSize: "0.95rem", lineHeight: 1 }}>
                      &times;
                    </span>
                  </button>
                ))}
                <button
                  onClick={clearAll}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--ink-soft)",
                    textDecoration: "underline",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                    padding: "0.3rem 0.2rem",
                  }}
                >
                  Clear filters
                </button>
              </div>
            ) : null}

''' + PANEL
s = s.replace(PANEL, ROW, 1)

# 5. honest wording on the old button
s = s.replace('Clear all filters', 'Clear filters')

if s == orig:
    sys.exit('Nothing was changed.')

shutil.copy(P, P + '.prechips')
io.open(P, 'w', encoding='utf-8').write(s)

print('Patched src/App.jsx')
print('  chips row added above the More filters panel')
print('  Clear filters no longer resets check in / check out')
print('  backup: src/App.jsx.prechips')
