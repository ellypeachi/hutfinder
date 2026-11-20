/* Free beds per night, the same for the app (src/App.jsx), the hut and list
   pages (scripts/build_hut_pages.mjs) and their script (src/regionpage.js).

   availability.json keeps a hut's serviced nights in `days`, as
   [dorm, shared, private] free beds. Some huts also take online bookings on
   nights without a host: hut-reservation.org calls them "unserviced", and in
   practice it is the winter room. Those nights are in `wr` as one number, the
   free beds, and `wrcap` is how many beds that room has.

   Here both become one array per night, [dorm, shared, private, winter room]:
   a serviced night has 0 in the winter room, a winter-room night 0 in the
   rest. A night in neither is closed (null). A room-type filter only ever
   looks at its own index, so the winter room never counts as a dormitory or a
   private room. */

export const WINTER = 3

export function bedsOn(rec, d) {
  if (!rec) return null
  const a = rec.days && rec.days[d]
  if (a) return [a[0] || 0, a[1] || 0, a[2] || 0, 0]
  if (rec.wr && d in rec.wr) return [0, 0, 0, rec.wr[d] || 0]
  return null
}

export const isWinterNight = (rec, d) => !!rec && !(rec.days && rec.days[d]) && !!rec.wr && d in rec.wr

export const totalOf = (a) => (a ? a[0] + a[1] + a[2] + a[3] : 0)

// The beds of each kind the hut has, in the same order.
export const capsOf = (rec) => {
  const c = (rec && rec.caps) || []
  return [c[0] || 0, c[1] || 0, c[2] || 0, (rec && rec.wrcap) || 0]
}

// Every night the hut is open, serviced or winter room, in date order.
export function openNights(rec) {
  if (!rec) return []
  return [...new Set([...Object.keys(rec.days || {}), ...Object.keys(rec.wr || {})])].sort()
}

// At least one free bed of any kind on each of the nights.
export const freeEvery = (rec, nights) => nights.every((d) => totalOf(bedsOn(rec, d)) > 0)

/* For picked nights: the fewest free beds of each kind the hut offers on
   them. A room type counts on the serviced nights, the winter room on its own
   nights, so a stay that starts in the winter room and moves into the hut
   isn't shown as full. Null if any night is closed. `winter` says whether
   none, some or all of the nights are winter-room nights. */
export function fewestOn(rec, nights) {
  if (!rec || !nights.length) return null
  const caps = capsOf(rec)
  const mins = [Infinity, Infinity, Infinity, Infinity]
  let winter = 0
  for (const d of nights) {
    const a = bedsOn(rec, d)
    if (!a) return null
    const w = isWinterNight(rec, d)
    if (w) winter++
    for (let i = 0; i < 4; i++) if ((i === WINTER) === w) mins[i] = Math.min(mins[i], a[i])
  }
  const rows = []
  for (let i = 0; i < 4; i++) if (mins[i] !== Infinity && caps[i] > 0) rows.push({ i, n: mins[i] })
  return { rows, winter: winter === 0 ? 'none' : winter === nights.length ? 'all' : 'some' }
}

/* The first night from `from` on with a free bed: of any kind, or of room
   type `i` (0 dorm, 1 shared, 2 private) for a page about that type. */
export function nextFreeOf(rec, from, i) {
  for (const d of openNights(rec)) {
    if (d < from) continue
    const a = bedsOn(rec, d)
    const n = i == null ? totalOf(a) : a[i]
    if (n > 0) return { date: d, free: n, winter: isWinterNight(rec, d) }
  }
  return null
}

/* The hut's own message in the booking form ("note", read by
   fetch_availability.py), in the visitor's language where the hut wrote one,
   else English, else German. One or two words ("Geschlossen", "Winter") say
   no more than "no open dates" already does, so those don't show.
   Returns { text, lang } or null. */
export function noteOf(rec, lang) {
  const n = rec && rec.note
  if (!n) return null
  const pick = [lang, 'en', 'de', 'fr', 'it'].find((l) => n[l])
  if (!pick || n[pick].split(/\s+/).filter(Boolean).length < 3) return null
  return { text: n[pick], lang: pick }
}
