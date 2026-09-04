"""
Hüttenfinder — filter restructure.

Leaves search, dates, region and room type visible.
Moves booking, type, elevation, warden, association and amenities
behind a "More filters" button with a count badge.

Run from the project folder:   python3 patch_filters.py
It backs up to src/App.jsx.prefilters and refuses to run twice.
"""
import io, shutil, sys

P = 'src/App.jsx'

try:
    src = io.open(P, encoding='utf-8').read()
except FileNotFoundError:
    sys.exit('Cannot find src/App.jsx — run this from the hutfinder folder.')

if 'MORE_FILTERS_PANEL' in src:
    sys.exit('Already patched. Nothing to do.')
if 'showMore' not in src:
    sys.exit('Missing showMore state — run the earlier state command first.')

L = src.split('\n')


def find(sub, start=0):
    for i in range(start, len(L)):
        if sub in L[i]:
            return i
    return -1


i_rt_group = find('<FilterGroup label="Room type">')
i_bk_open = find('<FilterGroup label="Booking">')
i_rg_open = find('<FilterGroup label="Region">')
i_ty_open = find('<FilterGroup label="Type">')
i_any = find('{anyFilter && (')

for name, idx in [('Room type', i_rt_group), ('Booking', i_bk_open),
                  ('Region', i_rg_open), ('Type', i_ty_open), ('anyFilter', i_any)]:
    if idx < 0:
        sys.exit(f'Could not locate the {name} block. Nothing changed.')

i_rt_open = i_rt_group - 1
if '{avail && (' not in L[i_rt_open]:
    sys.exit('Room type is not wrapped in {avail && ( as expected. Nothing changed.')

i_rt_end = find('</FilterGroup>', i_rt_group) + 1
i_bk_close = find('</FilterGroup>', i_bk_open)
i_rg_close = find('</FilterGroup>', i_rg_open)
i_rest_close = max(i for i in range(i_ty_open, i_any) if '</FilterGroup>' in L[i])

if not (i_rt_open < i_bk_open < i_rg_open < i_ty_open < i_any):
    sys.exit('Blocks are not in the expected order. Nothing changed.')

head = L[:i_rt_open]
roomtype = L[i_rt_open:i_rt_end + 1]
booking = L[i_bk_open:i_bk_close + 1]
region = L[i_rg_open:i_rg_close + 1]
rest = L[i_ty_open:i_rest_close + 1]
tail = L[i_any:]

BUTTON = '''            <button
              onClick={() => setShowMore(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                background: "transparent",
                border: "1px solid var(--line-control)",
                borderRadius: 100,
                color: "var(--ink)",
                padding: "0.45rem 0.95rem",
                fontSize: "0.85rem",
                fontWeight: 500,
                cursor: "pointer",
                marginBottom: "1rem",
              }}
            >
              More filters
              {moreCount > 0 ? (
                <span
                  style={{
                    background: "var(--blue)",
                    color: "#fff",
                    borderRadius: 100,
                    fontSize: "0.72rem",
                    fontWeight: 700,
                    padding: "0.08rem 0.42rem",
                  }}
                >
                  {moreCount}
                </span>
              ) : null}
            </button>'''

PANEL_OPEN = '''            {/* MORE_FILTERS_PANEL */}
            {showMore ? (
              <div
                style={
                  isNarrow
                    ? {
                        position: "fixed",
                        inset: 0,
                        zIndex: 1000,
                        background: "var(--cream)",
                        overflowY: "auto",
                        padding: "1rem 1rem 2rem",
                      }
                    : {
                        border: "1px solid var(--hair)",
                        borderRadius: "var(--radius)",
                        background: "var(--card)",
                        padding: "1rem 1rem 0.2rem",
                        marginBottom: "1rem",
                      }
                }
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1rem",
                  }}
                >
                  <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>More filters</span>
                  <button
                    onClick={() => setShowMore(false)}
                    style={{
                      background: "var(--blue)",
                      color: "#fff",
                      border: "none",
                      borderRadius: "var(--radius)",
                      padding: "0.5rem 1.1rem",
                      fontSize: "0.9rem",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Done
                  </button>
                </div>'''

PANEL_CLOSE = '''              </div>
            ) : null}'''

out = (head + [''] + region + [''] + roomtype + [''] +
       BUTTON.split('\n') + [''] +
       PANEL_OPEN.split('\n') + [''] + booking + [''] + rest +
       PANEL_CLOSE.split('\n') + [''] + tail)

shutil.copy(P, P + '.prefilters')
io.open(P, 'w', encoding='utf-8').write('\n'.join(out))

print('Patched src/App.jsx')
print('  visible : dates, region, room type')
print('  hidden  : booking, type, elevation, warden, association, amenities')
print('  backup  : src/App.jsx.prefilters')
