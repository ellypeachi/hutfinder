/* A hut's opening season as text, the same for the app's cards and pop-up
   (src/App.jsx) and the hut and list pages (scripts/build_hut_pages.mjs).

   The seasons come from data/overrides.json, checked by hand on each hut's
   own page: [{ season: "summer" | "winter", from, to, and only when the hut
   says so: nights_from / nights_to (overnight stays shorter than the
   opening), closed_days (weekly rest days, "mon".."sun"), closed (gaps, as
   [from, to] pairs) }]. Dates are ISO strings.

   Which season shows: the one running today, else the next one, else the
   last one, labelled with its year so nobody reads it as next year's. A past
   season shows for a year from its start, until the next one would have
   begun; after that it is too old to help and nothing shows. */

const DAY_CODES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
const WEEKDAYS = DAY_CODES.slice(0, 5)

const utc = (iso) => new Date(`${iso}T00:00:00Z`)
const addYear = (iso) => `${Number(iso.slice(0, 4)) + 1}${iso.slice(4)}`

function pick(seasons, today) {
  const list = (seasons || []).filter((s) => s && s.from && s.to).sort((a, b) => (a.from < b.from ? -1 : 1))
  const now = list.find((s) => s.from <= today && today <= s.to)
  if (now) return { s: now, when: 'now' }
  const next = list.find((s) => s.from > today)
  if (next) return { s: next, when: 'next' }
  const last = list.filter((s) => s.to < today).pop()
  if (last && today < addYear(last.from)) return { s: last, when: 'past' }
  return null
}

/* A winter season belongs to the winter it starts in: Jan–Mar 2027 is
   "2026/27", as is Dec 2026–Mar 2027. */
function yearLabel(s, shift = 0) {
  const y = Number(s.from.slice(0, 4))
  if (s.season !== 'winter') return String(y + shift)
  const start = (Number(s.from.slice(5, 7)) >= 7 ? y : y - 1) + shift
  return `${start}/${String((start + 1) % 100).padStart(2, '0')}`
}

/* `t` is the language's string lookup, `locale` its date locale (en-GB,
   de-AT, …). Returns null for a hut without a season to show, else:
     card:    one line for the hut card ("Winter season 12 Jan – 29 Mar · closed Mon & Tue")
     title:   the season with its years, for the pop-up and the hut page
     details: the rest as sentences, or '' */
export function seasonText(seasons, { t, locale, today }) {
  const got = pick(seasons, today)
  if (!got) return null
  const { s, when } = got
  const kind = s.season === 'winter' ? 'winter' : 'summer'
  // Czech short months with a year come out as digits (12.01.2027); its month
  // names read naturally in full ("12. ledna").
  const month = String(locale).startsWith('cs') ? 'long' : 'short'
  const short = new Intl.DateTimeFormat(locale, { day: 'numeric', month, timeZone: 'UTC' })
  const long = new Intl.DateTimeFormat(locale, { day: 'numeric', month, year: 'numeric', timeZone: 'UTC' })
  const range = (f, a, b) => (a === b ? f.format(utc(a)) : f.formatRange(utc(a), utc(b)))
  const dayNames = (style) => {
    const f = new Intl.DateTimeFormat(locale, { weekday: style, timeZone: 'UTC' })
    // 1 Feb 2021 was a Monday.
    const names = (s.closed_days || [])
      .map((c) => DAY_CODES.indexOf(c))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b)
      .map((i) => f.format(utc(`2021-02-0${i + 1}`)))
    return new Intl.ListFormat(locale, { type: 'conjunction', style: style === 'long' ? 'long' : 'short' }).format(names)
  }

  if (when === 'past') {
    const title = t(`season.past.${kind}`, { year: yearLabel(s), range: range(short, s.from, s.to) })
    return { card: title, title, details: t(`season.untilNext.${kind}`, { year: yearLabel(s, 1) }) }
  }

  const days = s.closed_days || []
  const weekendsOnly = WEEKDAYS.every((d) => days.includes(d)) && !days.includes('sat') && !days.includes('sun')
  const restDays = weekendsOnly ? 0 : days.length
  const gaps = (s.closed || []).filter(([, b]) => b >= today)

  const card = [when === 'now' ? t('season.openUntil', { date: short.format(utc(s.to)) }) : t(`season.next.${kind}`, { range: range(short, s.from, s.to) })]
  const details = []
  if (weekendsOnly) {
    card.push(t('season.weekends'))
    details.push(t('season.weekendsS'))
  } else if (restDays) {
    card.push(t('season.closedOn', { count: restDays, days: dayNames('short') }))
    details.push(t('season.restDays', { count: restDays, days: dayNames('long') }))
  }
  for (const [a, b] of gaps) {
    card.push(t('season.closedRange', { range: range(short, a, b) }))
    details.push(t('season.closedRangeS', { range: range(short, a, b) }))
  }
  if (s.nights_from || s.nights_to) details.push(t('season.nights', { range: range(short, s.nights_from || s.from, s.nights_to || s.to) }))

  return {
    card: card.join(' · '),
    title: t(`season.title.${kind}`, { range: range(long, s.from, s.to) }),
    // A sentence that ends in an abbreviated month ("Dez.") keeps one full stop.
    details: details.map((x) => x.replace(/\.\.$/, '.')).join(' '),
  }
}
