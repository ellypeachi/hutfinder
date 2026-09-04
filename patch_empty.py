"""
Hüttenfinder — a useful empty state.

Names the constraint that actually blocked the search and offers the
specific fix, rather than only "clear everything".

Run from the project folder:   python3 patch_empty.py
Backs up to src/App.jsx.preempty and refuses to run twice.
"""
import io, shutil, sys

P = 'src/App.jsx'

try:
    s = io.open(P, encoding='utf-8').read()
except FileNotFoundError:
    sys.exit('Cannot find src/App.jsx — run this from the hutfinder folder.')

if 'EMPTY_STATE' in s:
    sys.exit('Already patched. Nothing to do.')
if 'activeChips' not in s:
    sys.exit('Run patch_chips.py first. Nothing changed.')

# 1. helpers, just above `const visible = ...`
ANCHOR = '  const visible = filtered.slice('
if ANCHOR not in s:
    sys.exit('Could not find the visible/slice line. Nothing changed.')

HELPERS = '''  // EMPTY_STATE
  const shortenStay = () => {
    if (!to) return;
    const d = new Date(to + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() - 1);
    const iso = d.toISOString().slice(0, 10);
    if (iso > from) setTo(iso);
    else {
      setFrom("");
      setTo("");
    }
  };
  const blockers = [];
  if (nights.length)
    blockers.push(nights.length === 1 ? "1 night" : nights.length + " consecutive nights");
  for (const c of activeChips) blockers.push(c.label);

'''
s = s.replace(ANCHOR, HELPERS + ANCHOR, 1)

# 2. swap the message block
START = '{filtered.length === 0 ? ('
i = s.find(START)
if i < 0:
    sys.exit('Could not find the empty-state branch. Nothing changed.')
j = s.find('\n            ) : (', i)
if j < 0:
    sys.exit('Could not find the end of the empty-state branch. Nothing changed.')

BTN_PRIMARY = ('background: "var(--blue)", color: "#fff", border: "none", '
               'borderRadius: "var(--radius)", padding: "0.55rem 1rem", '
               'fontSize: "0.875rem", fontWeight: 600, cursor: "pointer"')
BTN_QUIET = ('background: "transparent", color: "var(--ink)", '
             'border: "1px solid var(--line-control)", borderRadius: "var(--radius)", '
             'padding: "0.55rem 1rem", fontSize: "0.875rem", fontWeight: 500, cursor: "pointer"')

NEW = START + '''
              <div
                style={{
                  marginTop: "1.5rem",
                  padding: "1.5rem 1.35rem",
                  border: "1px solid var(--hair)",
                  borderRadius: "var(--radius)",
                  background: "var(--card)",
                }}
              >
                <p style={{ margin: 0, fontWeight: 700, fontSize: "1.05rem" }}>
                  {from && !avail
                    ? "Availability data didn't load"
                    : nights.length > 1
                    ? `Nothing free for all ${nights.length} nights`
                    : nights.length === 1
                    ? "Nothing free that night"
                    : "No huts match"}
                </p>
                <p style={{ margin: "0.5rem 0 0", color: "var(--ink-soft)", fontSize: "0.9rem" }}>
                  {from && !avail
                    ? "The bed counts are missing, so nothing can be shown as available. This is a data problem, not an empty search."
                    : blockers.length
                    ? `Searching for: ${blockers.join(" · ")}`
                    : "There is nothing to show."}
                </p>
                {from && !avail ? null : (
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "1.15rem" }}>
                    {nights.length > 1 ? (
                      <button onClick={shortenStay} style={{ ''' + BTN_PRIMARY + ''' }}>
                        {nights.length === 2 ? "Try 1 night" : `Try ${nights.length - 1} nights`}
                      </button>
                    ) : null}
                    {anyNonDate ? (
                      <button onClick={clearAll} style={{ ''' + BTN_QUIET + ''' }}>
                        Clear filters
                      </button>
                    ) : null}
                    {from ? (
                      <button
                        onClick={() => {
                          setFrom("");
                          setTo("");
                        }}
                        style={{ ''' + BTN_QUIET + ''' }}
                      >
                        Clear dates
                      </button>
                    ) : null}
                  </div>
                )}
              </div>'''

s = s[:i] + NEW + s[j:]

shutil.copy(P, P + '.preempty')
io.open(P, 'w', encoding='utf-8').write(s)
print('Patched src/App.jsx')
print('  empty state names the constraint and offers targeted fixes')
print('  missing availability data now reads differently from an empty search')
print('  backup: src/App.jsx.preempty')
