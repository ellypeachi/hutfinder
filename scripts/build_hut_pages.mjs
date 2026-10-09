#!/usr/bin/env node
/* ==========================================================================
   build_hut_pages.mjs: one static page per hut, in German and English

     /de/hut/<slug>/index.html
     /en/hut/<slug>/index.html

   Runs after `npm run build`, in deploy.yml, so every deploy (about five a
   day, after each availability refresh) writes pages with the latest free
   beds. Everything a search engine needs is in the HTML: title, description,
   hreflang, structured data, the bed calendar, the hut's own text. The
   page's CSS and JS come from the Vite entry hut-template/index.html.

   Also writes dist/sitemap.xml: the pages in public/sitemap.xml plus every
   hut page, with its other language as an alternate.

   Which huts get a page: those with a photo or a description of their own
   (446 of 1,524). data/hut_pages.json, when it exists, narrows that to the
   ids it lists; it holds the ten-hut test batch for now.

   Text comes from src/strings/<code>.js (the "page." keys plus the app's own
   tag, availability and booking strings), so a word changed there changes
   here too. The collage layout comes from data/collages.json, written once
   by scripts/make_collages.py.

     node scripts/build_hut_pages.mjs            write into dist/
     node scripts/build_hut_pages.mjs --check    say what it would write
     node scripts/build_hut_pages.mjs --all      ignore data/hut_pages.json
   ========================================================================== */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { en } from '../src/strings/en.js'
import { de } from '../src/strings/de.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const CHECK = args.includes('--check')
const ALL = args.includes('--all')
const DIST = path.join(ROOT, 'dist')

const SITE = 'https://www.hutfinder.at'
const CONTACT_EMAIL = 'hutfinder.at@gmail.com'
const PAGE_LANGS = ['de', 'en']
const DEFAULT_LANG = 'en'
const DICTS = { en, de }
// As in src/i18n.js: dates in de-AT (Jänner), numbers in de-DE (1.524).
const LOCALES = { en: 'en-GB', de: 'de-AT' }
const NUMBER_LOCALES = { de: 'de-DE' }
const OG_LOCALES = { en: 'en_GB', de: 'de_AT' }
const TZ = 'Europe/Vienna'
// As in src/App.jsx.
const CLUB_LABEL = { OEAV: 'ÖAV', DAV: 'DAV', AVS: 'AVS', alpGesPreintaler: 'Alpengesellschaft Preintaler' }
const TYPE_KEYS = ['schutzhuette', 'alm', 'jausenstation']
const HUT_TEXT_LANGS = ['de', 'en', 'fr', 'it']
const BUCKETS = ['dorm', 'shared', 'priv']
const TITLE_MAX = 60
const DESC_MAX = 155

const readJSON = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'))
const exists = (p) => fs.existsSync(path.join(ROOT, p))

// ---------------------------------------------------------------- data

const huts = readJSON('public/huts.json')
const avail = readJSON('public/availability.json')
const photos = readJSON('public/photos.json').photos
const texts = readJSON('public/hut_texts.json').texts
const collages = exists('data/collages.json') ? readJSON('data/collages.json') : {}
const only = !ALL && exists('data/hut_pages.json') ? new Set(readJSON('data/hut_pages.json').ids) : null

const textOf = (h) => (h.hr_hut_id != null ? texts[String(h.hr_hut_id)] : null)
const hasOwnText = (h) => {
  const e = textOf(h)
  return !!e && HUT_TEXT_LANGS.some((c) => e[c])
}
const isBookable = (h) => h.hr_hut_id != null && !!h.hr_booking_url
const recOf = (h) => (h.hr_hut_id != null && avail.huts ? avail.huts[String(h.hr_hut_id)] || null : null)
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v)

// Every hut that could have a page, and the ones built this time.
const eligible = huts.filter((h) => (photos[h.id] && photos[h.id].full) || hasOwnText(h))
const built = eligible.filter((h) => !only || only.has(h.id))
if (only) {
  for (const id of only) {
    if (!eligible.some((h) => h.id === id)) console.warn(`  ${id} is in data/hut_pages.json but has no photo or text`)
  }
}

/* Slugs: the name in ASCII, lower case. German letters are spelled out
   (ä → ae, ß → ss), everything else loses its accent. */
function slugify(name) {
  return name
    .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
const slugs = new Map()
{
  const seen = new Map()
  for (const h of eligible) {
    const s = slugify(h.name)
    if (seen.has(s)) throw new Error(`Two huts share the slug "${s}": ${seen.get(s)} and ${h.id}. Give one a suffix here.`)
    seen.set(s, h.id)
    slugs.set(h.id, s)
  }
}
const builtIds = new Set(built.map((h) => h.id))
const pagePath = (lang, h) => `/${lang}/hut/${slugs.get(h.id)}/`
const pageUrl = (lang, h) => SITE + pagePath(lang, h)

// ---------------------------------------------------------------- dates

const isoInTZ = (d) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const TODAY = isoInTZ(new Date())
const utc = (iso) => new Date(iso + 'T12:00:00Z')
const addDays = (iso, n) => new Date(utc(iso).getTime() + n * 86400000).toISOString().slice(0, 10)
const mondayOf = (iso) => addDays(iso, -((utc(iso).getUTCDay() + 6) % 7))
const WINDOW_END = addDays((avail.generated || TODAY).slice(0, 10), avail.window_days || 120)

// ---------------------------------------------------------------- strings

function i18n(lang) {
  const locale = LOCALES[lang]
  const dict = DICTS[lang]
  const plural = new Intl.PluralRules(locale)
  const t = (key, vars) => {
    let s = dict[key] ?? en[key]
    if (s == null) throw new Error(`No string "${key}" in src/strings/en.js`)
    if (typeof s === 'object') s = s[plural.select(Number(vars?.count ?? 0))] ?? s.other ?? ''
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s
  }
  const nf = (n, opts) => Number(n).toLocaleString(NUMBER_LOCALES[lang] || locale, opts)
  const date = (iso, opts) => utc(iso).toLocaleDateString(locale, { timeZone: 'UTC', ...opts })
  const dows = (() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' })
    return Array.from({ length: 7 }, (_, i) => f.format(utc(addDays('2021-02-01', i))).replace(/\./g, '').slice(0, 2))
  })()
  const langName = (code) => new Intl.DisplayNames([locale], { type: 'language' }).of(code)
  return { lang, locale, t, nf, date, dows, langName }
}

// ---------------------------------------------------------------- html

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const pct = (v) => `${+v.toFixed(2)}%`

const ICON = {
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  prev: '<path d="M15 6l-6 6 6 6"/>',
  expand: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
}
const icon = (name, size = 15, sw = 1.9) =>
  `<svg class="hp-icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON[name]}</svg>`

// Room-type icons in the phone calendar: bunk, two people, a door.
const ROOM_ICON = {
  dorm: '<path d="M2.5 1.8v12.7M13.5 1.8v12.7M2.5 6.6h11M2.5 12h11M4.3 4.6h2.6M4.3 10h2.6"/>',
  shared: '<circle cx="5.4" cy="5.2" r="2.1"/><circle cx="11" cy="5.2" r="2.1"/><path d="M1.6 14c0-2.5 1.7-4.1 3.8-4.1s3.8 1.6 3.8 4.1M9.4 10.2c.5-.2 1-.3 1.6-.3 2.1 0 3.8 1.6 3.8 4.1"/>',
  priv: '<path d="M3.8 14.5V2.6a1 1 0 0 1 1-1h6.4a1 1 0 0 1 1 1v11.9M2.2 14.5h11.6"/><circle cx="10" cy="8.4" r="0.6"/>',
}
const roomIcon = (k, color, size, sw) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="flex-shrink:0">${ROOM_ICON[k]}</svg>`

/* Free beds keep the app's traffic light, and the colours never work alone:
   the gauge's shape (full, half, empty) and the number carry the meaning. */
const bedColor = (n) => (n <= 0 ? 'var(--burgundy)' : n <= 3 ? 'var(--rust)' : 'var(--pine)')
const gauge = (n, size = 9) => {
  const c = bedColor(n)
  const body =
    n > 3
      ? `<circle cx="10" cy="10" r="8" fill="${c}"/>`
      : n > 0
        ? `<circle cx="10" cy="10" r="8" fill="none" stroke="${c}" stroke-width="2.8"/><path d="M10 2a8 8 0 0 1 0 16z" fill="${c}"/>`
        : `<circle cx="10" cy="10" r="8" fill="none" stroke="${c}" stroke-width="2.8"/>`
  return `<svg class="hp-gauge" width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true" focusable="false" style="flex-shrink:0">${body}</svg>`
}

// ---------------------------------------------------------------- washi tape

const SVG_TAPES = {
  'blue-wave': (w, h) => {
    const n = Math.floor(w / 12)
    const wave = (y) => `M4 ${y} ` + Array.from({ length: n }, () => 'q 3 -4 6 0 t 6 0').join(' ')
    return `<path d="${wave(Math.round(h * 0.38))}" stroke="#FFFDF8" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="${wave(Math.round(h * 0.75))}" stroke="#FFFDF8" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
  },
  'red-floral': (w, h) => {
    let out = ''
    let row = 0
    for (let y = 5; y < h; y += 10, row++) {
      for (let x = 4 + (row % 2 ? 5 : 0); x < w - 2; x += 10) {
        for (let k = 0; k < 6; k++) {
          const a = ((30 + 60 * k) * Math.PI) / 180
          out += `<path d="M${x} ${y} l${(3 * Math.cos(a)).toFixed(1)} ${(3 * Math.sin(a)).toFixed(1)}"/>`
        }
      }
    }
    return `<g stroke="#FFF6F0" stroke-width="1.1" stroke-linecap="round">${out}</g>`
  },
}
const SVG_TAPE_BASE = { 'blue-wave': '#6A86B0', 'red-floral': '#B23A48' }

function tape(tp, frameH) {
  const style = `left:${pct(tp.x / 10)};top:${pct((tp.y / frameH) * 100)};width:${pct(tp.w / 10)};transform:rotate(${tp.rot}deg)`
  if (SVG_TAPES[tp.kind]) {
    // Drawn at the tape's size in a 576px-wide frame, then scaled with it.
    const w = Math.round(tp.w * 0.576)
    const h = Math.round(tp.h * 0.576)
    const strip = `0,2 4,0 ${w - 4},1 ${w},4 ${w - 3},${Math.round(h * 0.35)} ${w},${Math.round(h * 0.6)} ${w - 3},${h} 3,${h - 1} 0,${Math.round(h * 0.7)} 3,${Math.round(h * 0.4)}`
    const id = `tp-${tp.kind}-${Math.round(tp.x)}`
    return `<svg class="hp-tape" aria-hidden="true" focusable="false" viewBox="0 0 ${w} ${h}" style="${style};height:auto"><clipPath id="${id}"><polygon points="${strip}"/></clipPath><g clip-path="url(#${id})"><polygon points="${strip}" fill="${SVG_TAPE_BASE[tp.kind]}"/>${SVG_TAPES[tp.kind](w, h)}</g></svg>`
  }
  return `<span class="hp-tape tape-${tp.kind}" aria-hidden="true" style="${style};height:${+(tp.h / 10).toFixed(2)}cqw"></span>`
}

// The traced sparkles: a cluster of two asterisks and dots, and a single one.
const SPARK_LINES = (cx, cy) => {
  const arms = [[0, 17.7], [51, 18.7], [90, 28.2], [129, 16.2]]
  return arms
    .map(([deg, r]) => {
      const a = (deg * Math.PI) / 180
      const dx = (r * Math.cos(a)).toFixed(1)
      const dy = (r * Math.sin(a)).toFixed(1)
      return `<line x1="${(cx - dx).toFixed(1)}" y1="${(cy - dy).toFixed(1)}" x2="${(cx + +dx).toFixed(1)}" y2="${(cy + +dy).toFixed(1)}"/>`
    })
    .join('')
}
const SPARK_CLUSTER =
  `<g fill="none" stroke="#FFFFFF" stroke-width="4.6" stroke-linecap="round">${SPARK_LINES(53.5, 31.5)}${SPARK_LINES(116.0, 75.8)}</g>` +
  '<g fill="#FFFFFF"><circle cx="91.7" cy="33.0" r="3.3"/><circle cx="72.5" cy="84.5" r="2.8"/><circle cx="147.2" cy="58.0" r="2.7"/><circle cx="23.0" cy="65.2" r="2.7"/><circle cx="114.8" cy="26.3" r="1.95"/></g>'
const SPARK_SINGLE =
  `<g fill="none" stroke="#FFFFFF" stroke-width="4.6" stroke-linecap="round">${SPARK_LINES(116.0, 75.8)}</g>` +
  '<g fill="#FFFFFF"><circle cx="147.2" cy="58.0" r="2.7"/><circle cx="114.8" cy="26.3" r="1.95"/></g>'

// ---------------------------------------------------------------- hut facts

function typeLabel(L, h) {
  return TYPE_KEYS.includes(h.type) ? L.t(`type.${h.type}`) : h.type || ''
}
const regionOf = (h) => (h.region && h.region !== 'Other/Unknown' ? h.region : null)
const bedsOf = (h) => (isNum(h.hr_capacity) ? h.hr_capacity : isNum(h.sleeping) ? h.sleeping : null)
const elevText = (L, h) =>
  isNum(h.elevation) ? L.t(h.elevation_estimated ? 'page.elevApprox' : 'page.elev', { n: L.nf(Math.round(h.elevation)) }) : null

// Same order and wording as hutTags() in src/App.jsx.
function hutTags(L, h) {
  const { t } = L
  const tags = []
  if (h.club) tags.push({ label: CLUB_LABEL[h.club] || h.club, club: true })
  else if (h.association) tags.push({ label: ['alpine_club', 'naturfreunde', 'private'].includes(h.association) ? t(`assoc.${h.association}`) : h.association })
  const beds = bedsOf(h)
  if (beds > 0) tags.push({ label: t('tag.beds', { count: beds, n: L.nf(beds) }) })
  else if (beds === 0) tags.push({ label: t('tag.noOvernight') })
  if (h.warden === 'bewirtschaftet') tags.push({ label: h.warden_source === 'inferred' ? t('tag.usuallyServiced') : t('warden.bewirtschaftet') })
  else if (h.warden === 'bewartet') tags.push({ label: t('warden.bewartet') })
  else if (h.warden === 'selbstversorger') tags.push({ label: t('warden.selbstversorger') })
  if (h.shower === true) tags.push({ label: t('tag.shower') })
  if (h.winterraum === true) tags.push({ label: t('tag.winterRoom') })
  if (h.hr_dogs === true) tags.push({ label: t('tag.dogsWelcome') })
  else if (h.hr_dogs === false) tags.push({ label: t('tag.noDogs') })
  return tags
}
const tagList = (tags) =>
  `<ul class="hf-tags">${tags.map((g) => `<li class="${g.club ? 'hf-tag hf-tag-club' : 'hf-tag'}">${esc(g.label)}</li>`).join('')}</ul>`

const webHref = (u) => (/^https?:\/\//i.test(u) ? u : `https://${u}`)
const webLabel = (u) => {
  try {
    return new URL(webHref(u)).hostname.replace(/^www\./, '')
  } catch {
    return u
  }
}
const phoneLabel = (p) => p.replace(/\s*\/\s*/g, ' ').trim()
const telHref = (p) => 'tel:' + p.replace(/[^\d+]/g, '')

/* "ÖAV hut", "Naturfreunde hut", or the hut type. In English the article
   depends on the sound: an ÖAV hut, a DAV hut. */
function who(L, h) {
  if (h.club) return L.t('page.who.club', { club: CLUB_LABEL[h.club] || h.club })
  if (h.association === 'naturfreunde') return L.t('page.who.naturfreunde')
  if (h.association === 'alpine_club') return L.t('page.who.alpine_club')
  return TYPE_KEYS.includes(h.type) ? L.t(`type.${h.type}`) : L.t('page.who.hut')
}
const article = (L, w) => L.t(/^[AEIOUÄÖÜ]/i.test(w) ? 'page.article.vowel' : 'page.article.consonant')

function roomsPhrase(L, h) {
  const rec = recOf(h)
  if (!rec || !rec.caps) return ''
  const [d, s, p] = rec.caps.map((c) => c > 0)
  if (d && p) return L.t('page.rooms.range')
  if (d && s) return L.t('page.rooms.dormShared')
  if (s && p) return L.t('page.rooms.sharedPriv')
  if (d) return L.t('page.rooms.dorm')
  if (s) return L.t('page.rooms.shared')
  if (p) return L.t('page.rooms.priv')
  return ''
}

/* The opening sentence ("An ÖAV hut at 1,736 m in Salzburg with 113 beds,
   from dorms to private rooms.") and, without the elevation, the start of
   the search description. Pieces the data doesn't have are left out. */
function opening(L, h, { meta = false, rooms = true, beds = true } = {}) {
  const w = who(L, h)
  let s = L.t(meta ? 'page.m.lead' : 'page.s.lead', { a: article(L, w), who: w }).trim()
  const el = elevText(L, h)
  if (!meta && el) s += L.t('page.s.at', { elev: el })
  if (regionOf(h)) s += L.t('page.s.in', { region: regionOf(h) })
  const n = bedsOf(h)
  if (beds && n > 0) {
    s += L.t('page.s.with', { beds: L.t('tag.beds', { count: n, n: L.nf(n) }) })
    if (rooms) s += roomsPhrase(L, h)
  }
  return s + '.'
}

/* How to ask a hut that can't be booked online, most direct first: phone,
   then email, then its website. */
function contactKind(h) {
  if (h.phone && h.email) return 'callOrEmail'
  if (h.phone) return 'call'
  if (h.email) return 'email'
  if (h.website) return 'web'
  return 'none'
}

function summary(L, h) {
  let second
  if (isBookable(h)) second = L.t(h.hr_dogs === true ? 'page.sum.bookDogs' : h.hr_dogs === false ? 'page.sum.bookNoDogs' : 'page.sum.book')
  else second = L.t(`page.sum.${contactKind(h)}`)
  return `${opening(L, h)} ${second}`
}

function titleOf(L, h) {
  const kind = isBookable(h) ? 'book' : contactKind(h) === 'none' ? 'nearby' : 'contact'
  const el = elevText(L, h)
  const tries = [
    el ? L.t(`page.title.${kind}`, { name: h.name, elev: el }) : null,
    L.t(`page.title.${kind}Short`, { name: h.name }),
    h.name,
  ].filter(Boolean)
  return tries.find((s) => s.length <= TITLE_MAX) || h.name
}

function descriptionOf(L, h) {
  const kind = isBookable(h) ? 'book' : contactKind(h) === 'none' ? 'none' : h.phone ? 'call' : 'contact'
  const end = L.t(`page.meta.${kind}`)
  const tries = [
    `${opening(L, h, { meta: true })} ${end}`,
    `${opening(L, h, { meta: true, rooms: false })} ${end}`,
    `${opening(L, h, { meta: true, beds: false })} ${end}`,
  ]
  return tries.find((s) => s.length <= DESC_MAX) || tries[tries.length - 1]
}

// ---------------------------------------------------------------- distance

function km(a, b) {
  const R = 6371
  const r = (d) => (d * Math.PI) / 180
  const x = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
/* The three nearest huts that have (or will have) a page. A hut that can't
   be booked online points to bookable ones instead, since free beds are what
   its visitor came for. */
function nearby(h) {
  const pool = eligible.filter((o) => o.id !== h.id && (isBookable(h) || isBookable(o)))
  return pool
    .map((o) => ({ hut: o, d: km(h, o) }))
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
}

// ---------------------------------------------------------------- availability

function nextFree(h) {
  const rec = recOf(h)
  if (!rec || !rec.days) return null
  for (const d of Object.keys(rec.days).sort()) {
    const a = rec.days[d]
    const total = (a[0] || 0) + (a[1] || 0) + (a[2] || 0)
    if (d >= TODAY && total > 0) return { date: d, free: total }
  }
  return null
}
const fmtISO = (s) => s.split('-').reverse().join('.')

function generatedLabel(L) {
  try {
    return new Date(avail.generated).toLocaleString(L.locale, {
      timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    })
  } catch {
    return avail.generated
  }
}

function openDays(rec) {
  return rec && rec.days ? Object.keys(rec.days).filter((d) => d >= TODAY && d < WINDOW_END).sort() : []
}

function cellRows(L, rec, iso, phone) {
  const a = rec.days[iso]
  return BUCKETS.map((k, j) => {
    if (!(rec.caps && rec.caps[j] > 0)) return ''
    const n = a[j] || 0
    const text = n > 0 ? L.nf(n) : L.t('avail.full')
    const color = bedColor(n)
    if (phone) {
      return `<span class="hp-row">${roomIcon(k, color, 11, 1.25)}<span class="hf-vh">${esc(L.t(`bucket.${k}`))}: </span><b style="color:${color}">${esc(text)}</b></span>`
    }
    return `<span class="hp-row">${gauge(n)}<span class="hp-lbl">${esc(L.t(`page.short.${k}`))}</span><b style="color:${color}">${esc(text)}</b></span>`
  }).join('')
}

function dayCell(L, rec, iso, { phone = false, inMonth = true } = {}) {
  if (!inMonth) return '<div class="hp-day" aria-hidden="true"></div>'
  const dnum = Number(iso.slice(8))
  const num = !phone && dnum === 1 ? L.date(iso, { day: 'numeric', month: 'short' }) : String(dnum)
  if (iso < TODAY) return `<div class="hp-day hp-day-past"><span class="hp-num">${esc(num)}</span></div>`
  if (iso >= WINDOW_END) return `<div class="hp-day hp-day-past"><span class="hp-num">${esc(num)}</span></div>`
  if (rec.days[iso]) return `<div class="hp-day hp-day-open"><span class="hp-num">${esc(num)}</span>${cellRows(L, rec, iso, phone)}</div>`
  return `<div class="hp-day hp-day-closed"><span class="hp-num">${esc(num)}</span>${phone ? `<span class="hf-vh">${esc(L.t('page.closed'))}</span>` : `<span>${esc(L.t('page.closed'))}</span>`}</div>`
}

const dowRow = (L) => `<div class="hp-dow" aria-hidden="true">${L.dows.map((d) => `<span>${esc(d)}</span>`).join('')}</div>`

function legend(L, filled, cls) {
  const dot = (n) =>
    filled ? `<svg width="9" height="9" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><circle cx="10" cy="10" r="9" fill="${bedColor(n)}"/></svg>` : gauge(n, 10)
  return `<span class="hp-legend ${cls}"><span>${dot(9)}${esc(L.t('page.legend.many'))}</span><span>${dot(2)}${esc(L.t('page.legend.few'))}</span><span>${dot(0)}${esc(L.t('avail.full'))}</span></span>`
}

function bookButton(L, h, cls = 'hp-btn') {
  return `<a class="${cls}" href="${esc(h.hr_booking_url)}" target="_blank" rel="noopener" aria-label="${esc(L.t('book.aria', { hut: h.name }))}">${esc(L.t('book.online'))}</a>`
}

function bedsSection(L, h) {
  if (!isBookable(h)) return ''
  const rec = recOf(h)
  const days = openDays(rec)
  const head = `<div class="hp-section-head"><h2 class="hp-h2" id="beds-h">${esc(L.t('page.beds'))}</h2>${avail.generated ? `<p class="hp-note">${esc(L.t('avail.asOf', { time: generatedLabel(L) }))}</p>` : ''}</div>`
  if (!days.length) {
    return `<section class="hp-section" aria-labelledby="beds-h">${head}<div class="hp-cal"><p class="hp-summary">${esc(L.t('avail.none'))}</p><div>${bookButton(L, h)}</div></div></section>`
  }

  // Wide screens: five weeks from this week's Monday.
  const start = mondayOf(TODAY)
  const end = addDays(start, 34)
  const range = new Intl.DateTimeFormat(L.locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatRange(utc(start), utc(end))
  let weeks = ''
  for (let w = 0; w < 5; w++) {
    let row = ''
    for (let i = 0; i < 7; i++) row += dayCell(L, rec, addDays(start, w * 7 + i))
    weeks += `<div class="hp-week">${row}</div>`
  }
  const wide = `<div class="hp-weeks-view"><div class="hp-cal-top"><p class="hp-cal-range">${esc(range)}</p><p class="hp-note">${esc(L.t('page.perNight'))}</p></div><div style="margin-top:12px">${dowRow(L)}<div class="hp-weeks">${weeks}</div></div></div>`

  // Phones: one month at a time, from this month to the last with an open night.
  const first = TODAY.slice(0, 7)
  const last = days[days.length - 1].slice(0, 7)
  const monthKeys = []
  for (let m = first; m <= last; ) {
    monthKeys.push(m)
    const [y, mo] = m.split('-').map(Number)
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
  }
  const monthName = (m) => L.date(`${m}-01`, { month: 'long', year: 'numeric' })
  const keys = `<div class="hp-keys">${BUCKETS.map((k, j) => (rec.caps && rec.caps[j] > 0 ? `<span>${roomIcon(k, '#6E5A4B', 14, 1.7)}${esc(L.t(`bucket.${k}`))}</span>` : '')).join('')}</div>`
  const months = monthKeys
    .map((m, idx) => {
      const first1 = `${m}-01`
      const gridStart = mondayOf(first1)
      const [y, mo] = m.split('-').map(Number)
      const lastDay = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10)
      let rows = ''
      for (let d = gridStart; d <= lastDay; ) {
        let row = ''
        for (let i = 0; i < 7; i++, d = addDays(d, 1)) row += dayCell(L, rec, d, { phone: true, inMonth: d.slice(0, 7) === m })
        rows += `<div class="hp-week">${row}</div>`
      }
      const prev = idx > 0 ? monthName(monthKeys[idx - 1]) : null
      const next = idx < monthKeys.length - 1 ? monthName(monthKeys[idx + 1]) : null
      const step = (dir, label, ic) =>
        `<button type="button" class="hp-step" data-step="${dir}"${label ? ` aria-label="${esc(L.t(dir < 0 ? 'page.prevMonth' : 'page.nextMonth', { month: label }))}"` : ' disabled aria-hidden="true"'}>${icon(ic, 18, 2)}</button>`
      return `<div class="hp-month"><div class="hp-month-head">${step(-1, prev, 'prev')}<p class="hp-month-name">${esc(monthName(m))}</p>${step(1, next, 'chevron')}</div>${dowRow(L)}<div class="hp-weeks">${rows}</div></div>`
    })
    .join('')
  const phone = `<div class="hp-months" data-months>${keys}${months}</div>`

  return `<section class="hp-section" aria-labelledby="beds-h">${head}<div class="hp-cal">${wide}${phone}<div class="hp-cal-foot">${legend(L, false, 'hp-legend-wide')}${legend(L, true, 'hp-legend-phone')}${bookButton(L, h)}</div></div></section>`
}

// ---------------------------------------------------------------- description

function plainParas(html) {
  const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" }
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) =>
      e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ent[e.toLowerCase()] ?? m
    )
    .split(/\n\s*\n/)
    .map((p) => p.replace(/[ \t\r\n]+/g, ' ').trim())
    .filter(Boolean)
}

/* The hut's own text in this language, or else in the first language the hut
   wrote one in, labelled as such. Our own translations (nl, cs) are not used. */
function descSection(L, h) {
  const e = textOf(h)
  if (!e) return ''
  const ours = e.translated || []
  const code = e[L.lang] && !ours.includes(L.lang) ? L.lang : HUT_TEXT_LANGS.find((c) => e[c] && !ours.includes(c))
  if (!code) return ''
  const paras = plainParas(e[code])
  if (!paras.length) return ''
  const note = code === L.lang ? L.t('page.descSource') : L.t('page.descSourceIn', { language: L.langName(code) })
  const langAttr = code === L.lang ? '' : ` lang="${code}"`
  return `<section class="hp-desc" aria-labelledby="desc-h"><h2 class="hp-h2" id="desc-h">${esc(L.t('detail.description'))}</h2><div${langAttr}>${paras.map((p) => `<p>${esc(p)}</p>`).join('')}</div><p class="hp-note">${esc(note)}</p></section>`
}

// ---------------------------------------------------------------- top

function contactLinks(L, h, skip) {
  const out = []
  if (h.phone && skip !== 'phone')
    out.push(`<a class="hf-tap-min" href="${esc(telHref(h.phone))}" aria-label="${esc(L.t('call.aria', { hut: h.name, phone: phoneLabel(h.phone) }))}">${icon('phone')}<span class="hp-u">${esc(phoneLabel(h.phone))}</span></a>`)
  if (h.website && skip !== 'website')
    out.push(`<a class="hf-tap-min" href="${esc(webHref(h.website))}" target="_blank" rel="noopener" aria-label="${esc(L.t('contact.websiteAria', { hut: h.name, host: webLabel(h.website) }))}">${icon('globe')}<span class="hp-u">${esc(webLabel(h.website))}</span></a>`)
  if (h.email && skip !== 'email')
    out.push(`<a class="hf-tap-min" href="mailto:${esc(h.email)}" aria-label="${esc(L.t('contact.emailAria', { hut: h.name, email: h.email }))}">${icon('mail')}<span class="hp-u">${esc(h.email)}</span></a>`)
  return out.length ? `<div class="hp-contact">${out.join('')}</div>` : ''
}

/* The booking row under the facts. Bookable: Book, where it is booked, the
   price list. Not bookable: the hut's phone (or email, or website) as the
   button, since that is how to ask. */
function band(L, h) {
  if (isBookable(h)) {
    const price = h.hr_price_pdf
      ? `<a class="hf-tap-min" href="${esc(h.hr_price_pdf)}" target="_blank" rel="noopener" aria-label="${esc(L.t('detail.priceListAria', { hut: h.name }))}"><span class="hp-u">${esc(L.t('page.priceList'))}</span></a>`
      : ''
    return { html: `<div class="hp-band">${bookButton(L, h)}<span class="hp-long">${esc(L.t('page.bookedThrough'))}</span>${price}</div>`, skip: null }
  }
  if (h.phone)
    return {
      html: `<div class="hp-band"><a class="hp-btn-line" href="${esc(telHref(h.phone))}" aria-label="${esc(L.t('call.aria', { hut: h.name, phone: phoneLabel(h.phone) }))}">${icon('phone')}${esc(L.t('call.label', { phone: phoneLabel(h.phone) }))}</a><span>${esc(L.t('page.notBookable'))}</span></div>`,
      skip: 'phone',
    }
  if (h.email)
    return {
      html: `<div class="hp-band"><a class="hp-btn-line" href="mailto:${esc(h.email)}" aria-label="${esc(L.t('contact.emailAria', { hut: h.name, email: h.email }))}">${icon('mail')}${esc(L.t('contact.email'))}</a><span>${esc(L.t('page.notBookable'))}</span></div>`,
      skip: 'email',
    }
  if (h.website)
    return {
      html: `<div class="hp-band"><a class="hp-btn-line" href="${esc(webHref(h.website))}" target="_blank" rel="noopener" aria-label="${esc(L.t('contact.websiteAria', { hut: h.name, host: webLabel(h.website) }))}">${icon('globe')}${esc(L.t('contact.website'))}</a><span>${esc(L.t('page.notBookable'))}</span></div>`,
      skip: 'website',
    }
  return { html: `<div class="hp-band"><span>${esc(L.t('page.notBookableNoContact'))}</span></div>`, skip: null }
}

/* The photo credit. A collage is an adaptation, so it says so; a CC BY-SA
   photo's collage is shared under CC BY-SA too, as the licence requires. */
function credit(L, ph, isCollage) {
  const who = ph.page ? `<a href="${esc(ph.page)}">${esc(ph.credit || '')}</a>` : esc(ph.credit || '')
  const lic = ph.license_url ? `<a href="${esc(ph.license_url)}">${esc(ph.license)}</a>` : esc(ph.license || '')
  let s = `${esc(L.t('detail.photoCredit'))} ${who} · ${lic}`
  if (isCollage) {
    s += ` · ${esc(L.t('page.collageBy'))}`
    if (/^CC BY-SA/i.test(ph.license || ''))
      s += `, ${esc(L.t('page.sharedUnder', { license: '' }).trim())} <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>`
  }
  return `<figcaption class="hp-credit">${s}</figcaption>`
}

function figure(L, h) {
  const ph = photos[h.id]
  if (!ph || !ph.full) return ''
  const c = collages[h.id]
  if (!c) {
    return `<figure class="hp-figure"><img class="hp-photo" src="/${esc(ph.full)}" alt="${esc(h.name)}" fetchpriority="high"/>${credit(L, ph, false)}</figure>`
  }
  const fh = c.frame_h
  const sp = c.sparkles
  const sparkHTML = sp
    ? `<svg class="hp-spark" aria-hidden="true" focusable="false" viewBox="18 -3 134 114" style="left:${pct(sp.cluster[0] / 10)};top:${pct((sp.cluster[1] / c.main_h) * 100)};width:11.6%">${SPARK_CLUSTER}</svg>` +
      `<svg class="hp-spark" aria-hidden="true" focusable="false" viewBox="92 23 59 87" style="left:${pct(sp.single[0] / 10)};top:${pct((sp.single[1] / c.main_h) * 100)};width:4.8%">${SPARK_SINGLE}</svg>`
    : ''
  const el = isNum(h.elevation) ? elevText(L, h) : null
  const labels = [el, regionOf(h)].filter(Boolean)
  const s = c.second
  return (
    `<figure class="hp-figure"><div class="hp-collage" style="aspect-ratio:1000/${fh}">` +
    `<div class="hp-piece"><img src="/${esc(c.main.src)}" width="${c.main.w}" height="${c.main.h}" alt="${esc(h.name)}" fetchpriority="high"/>${sparkHTML}</div>` +
    `<img class="hp-second" src="/${esc(s.src)}" width="${s.w}" height="${s.h}" alt="" style="left:${pct(s.x / 10)};top:${pct((s.y / fh) * 100)};width:${pct(s.width / 10)}"/>` +
    c.tapes.map((tp) => tape(tp, fh)).join('') +
    (labels.length ? `<div class="hp-labels" aria-hidden="true" style="top:${pct((c.label_top / fh) * 100)}">${labels.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : '') +
    `</div>${credit(L, ph, true)}</figure>`
  )
}

// ---------------------------------------------------------------- nearby

function card(L, o, d) {
  const ph = photos[o.id]
  const linked = builtIds.has(o.id)
  const meta = [typeLabel(L, o), elevText(L, o)].filter(Boolean).join(' · ')
  const name = linked ? `<a class="hp-card-link" href="${pagePath(L.lang, o)}">${esc(o.name)}</a>` : esc(o.name)
  let bandHTML
  if (isBookable(o)) {
    const nf = nextFree(o)
    const line = nf
      ? `<span>${gauge(nf.free, 11)} ${esc(L.t('avail.nextFree', { date: fmtISO(nf.date), n: L.nf(nf.free) }))}</span>`
      : recOf(o)
        ? `<span>${esc(L.t('avail.none'))}</span>`
        : ''
    bandHTML = `<div class="hf-card-band">${line}<div>${bookButton(L, o)}</div></div>`
  } else if (o.phone) {
    bandHTML = `<div class="hf-card-band hf-card-band-row"><a class="hf-call hf-tap" href="${esc(telHref(o.phone))}" aria-label="${esc(L.t('call.aria', { hut: o.name, phone: phoneLabel(o.phone) }))}">${icon('phone', 14, 1.8)}${esc(L.t('call.label', { phone: phoneLabel(o.phone) }))}</a><span>${esc(L.t('page.notBookable'))}</span></div>`
  } else if (o.website) {
    bandHTML = `<div class="hf-card-band hf-card-band-row"><a class="hf-call hf-tap" href="${esc(webHref(o.website))}" target="_blank" rel="noopener" aria-label="${esc(L.t('contact.websiteAria', { hut: o.name, host: webLabel(o.website) }))}">${icon('globe', 14, 1.8)}${esc(L.t('contact.website'))}</a><span>${esc(L.t('page.notBookable'))}</span></div>`
  } else {
    bandHTML = `<div class="hf-card-band"><span>${esc(L.t('page.notBookableNoContact'))}</span></div>`
  }
  return (
    `<div class="hp-card"><div class="hf-card-head">` +
    (ph && ph.card ? `<img class="hf-thumb" src="/${esc(ph.card)}" width="96" height="72" alt="" loading="lazy" decoding="async"/>` : '') +
    `<div class="hf-card-title"><div class="hp-card-name">${name}</div>` +
    (meta ? `<div class="hf-card-meta">${esc(meta)}</div>` : '') +
    `<div class="hf-card-meta">${esc(L.t('page.away', { km: L.nf(d, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }))}</div></div>` +
    (linked ? `<svg class="hf-chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICON.chevron}</svg>` : '') +
    `</div>${tagList(hutTags(L, o).slice(0, 3))}${bandHTML}</div>`
  )
}

function nearbySection(L, h) {
  const near = nearby(h)
  if (!near.length) return ''
  const heading = isBookable(h) ? L.t('page.nearby') : L.t('page.nearbyBookable')
  const mapData = {
    self: { name: h.name, lat: h.lat, lng: h.lng, bookable: isBookable(h) },
    near: near.map(({ hut: o }) => ({ name: o.name, lat: o.lat, lng: o.lng, bookable: isBookable(o), url: builtIds.has(o.id) ? pagePath(L.lang, o) : null })),
  }
  const coords = L.t('page.coords', { lat: L.nf(h.lat, { minimumFractionDigits: 4, maximumFractionDigits: 4 }), lng: L.nf(h.lng, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) })
  const map =
    `<div class="hp-mapcol"><div class="hp-mapbox" id="hut-map" data-map role="region" aria-label="${esc(L.t('page.mapAria', { hut: h.name }))}">` +
    `<div class="hp-map"></div>` +
    `<div class="hp-map-legend" aria-hidden="true"><span><span class="hp-pin"></span>${esc(L.t('legend.bookable'))}</span><span><span class="hp-pin hp-pin-muted"></span>${esc(L.t('legend.contact'))}</span></div>` +
    `<button type="button" class="hp-map-close" hidden>${icon('close', 16, 2)}${esc(L.t('page.closeMap'))}</button>` +
    `<script type="application/json">${JSON.stringify(mapData).replace(/</g, '\\u003c')}</script></div>` +
    `<div class="hp-map-foot"><span>${esc(coords)}</span><button type="button" class="hf-tap-min" data-expand aria-controls="hut-map" hidden>${icon('expand', 14, 2)}<span class="hp-u">${esc(L.t('page.expandMap'))}</span></button></div></div>`
  const more = isBookable(h) ? '' : `<a class="hp-more hf-tap-min" href="/"><span class="hp-u">${esc(L.t('page.pickDates'))}</span></a>`
  return `<section class="hp-section" aria-labelledby="near-h"><h2 class="hp-h2" id="near-h">${esc(heading)}</h2><div class="hp-near"><div class="hp-cards">${near.map(({ hut, d }) => card(L, hut, d)).join('')}</div>${map}</div>${more}</section>`
}

// ---------------------------------------------------------------- the page

function jsonLd(L, h, desc) {
  const url = pageUrl(L.lang, h)
  const ph = photos[h.id]
  const lodging = isBookable(h) || bedsOf(h) > 0
  const place = {
    '@type': lodging ? 'LodgingBusiness' : 'Place',
    '@id': `${url}#hut`,
    name: h.name,
    url,
    description: desc,
    geo: { '@type': 'GeoCoordinates', latitude: h.lat, longitude: h.lng, ...(isNum(h.elevation) && !h.elevation_estimated ? { elevation: Math.round(h.elevation) } : {}) },
    address: { '@type': 'PostalAddress', addressCountry: 'AT', ...(regionOf(h) ? { addressRegion: regionOf(h) } : {}) },
  }
  if (ph && ph.full) place.image = `${SITE}/${ph.full}`
  if (h.phone) place.telephone = phoneLabel(h.phone)
  if (h.email) place.email = h.email
  if (h.website) place.sameAs = [webHref(h.website)]
  if (lodging && h.hr_dogs != null) place.petsAllowed = h.hr_dogs === true
  const crumbs = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Hüttenfinder', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: h.name },
    ],
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [place, crumbs] }).replace(/</g, '\\u003c')
}

function page(L, h, assets) {
  const other = PAGE_LANGS.find((c) => c !== L.lang)
  const O = i18n(other)
  const title = titleOf(L, h)
  const desc = descriptionOf(L, h)
  const url = pageUrl(L.lang, h)
  const ph = photos[h.id]
  const fig = figure(L, h)
  const b = band(L, h)
  const meta = [typeLabel(L, h), regionOf(h), elevText(L, h)].filter(Boolean).join(' · ')

  const head = [
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    '<meta name="theme-color" content="#3A2A20">',
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    `<link rel="canonical" href="${url}">`,
    ...PAGE_LANGS.map((c) => `<link rel="alternate" hreflang="${c}" href="${pageUrl(c, h)}">`),
    `<link rel="alternate" hreflang="x-default" href="${pageUrl(DEFAULT_LANG, h)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Hüttenfinder">',
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:locale" content="${OG_LOCALES[L.lang]}">`,
    `<meta property="og:locale:alternate" content="${OG_LOCALES[other]}">`,
    ph && ph.full ? `<meta property="og:image" content="${SITE}/${esc(ph.full)}">` : `<meta property="og:image" content="${SITE}/og-image.png">`,
    '<meta name="twitter:card" content="summary_large_image">',
    `<script type="application/ld+json">${jsonLd(L, h, desc)}</script>`,
    ...assets,
  ].join('\n')

  const header =
    `<header class="hp-head"><div class="hp-wrap">` +
    `<a class="hp-mark" href="/" aria-label="${esc(L.t('page.home'))}"><img src="/h-line-600-light.svg" alt="Hüttenfinder" width="172" height="26"></a>` +
    `<div class="hp-head-links"><a class="hf-tap-min" href="/"><span class="hp-u hp-long">${esc(L.t('page.allHuts'))}</span><span class="hp-u hp-short">${esc(L.t('page.map'))}</span></a>` +
    `<a class="hp-lang hf-tap-min" href="${pagePath(other, h)}" hreflang="${other}" lang="${other}" aria-label="${esc(O.t('page.thisPageIn'))}">${icon('globe', 16, 1.8)}${other.toUpperCase()}</a></div>` +
    `</div></header>`

  const crumbs =
    `<nav class="hp-crumbs" aria-label="${esc(L.t('page.crumbs'))}"><ol>` +
    `<li><a href="/">${esc(L.t('page.huts'))}</a></li>` +
    (regionOf(h) ? `<li>${esc(regionOf(h))}</li>` : '') +
    `<li aria-current="page">${esc(h.name)}</li></ol></nav>`

  const facts =
    `<div class="hp-facts"><div><h1 class="hp-name">${esc(h.name)}</h1>${meta ? `<p class="hp-meta">${esc(meta)}</p>` : ''}</div>` +
    `<p class="hp-summary">${esc(summary(L, h))}</p>` +
    tagList(hutTags(L, h)) +
    contactLinks(L, h, b.skip) +
    b.html +
    `</div>`

  const footer =
    `<footer class="hp-foot"><div class="hp-wrap"><div class="hp-foot-text">` +
    `<span>${esc(L.t('page.footer.data', { osm: '\u0000' })).replace('\u0000', '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')} ${esc(L.t('page.footer.check'))}</span>` +
    `<span>${esc(L.t('page.footer.wrong', { email: '\u0000' })).replace('\u0000', `<a href="mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(h.name)}">${CONTACT_EMAIL}</a>`)}</span>` +
    `</div><div class="hp-foot-links"><a href="/faq/">${esc(L.t('footer.faq'))}</a><a href="/imprint/">${esc(L.t('footer.imprint'))}</a><a href="/privacy/">${esc(L.t('footer.privacy'))}</a></div></div></footer>`

  return (
    `<!doctype html>\n<html lang="${L.lang}">\n<head>\n${head}\n</head>\n<body>\n<div class="hp">` +
    header +
    `<main class="hp-wrap hp-main"><div>${crumbs}<div class="hp-top${fig ? '' : ' hp-top-solo'}">${facts}${fig}</div></div>` +
    bedsSection(L, h) +
    descSection(L, h) +
    nearbySection(L, h) +
    `</main>` +
    footer +
    `</div>\n</body>\n</html>\n`
  )
}

// ---------------------------------------------------------------- sitemap

function sitemap() {
  const base = fs.readFileSync(path.join(ROOT, 'public/sitemap.xml'), 'utf8')
  const locs = [...base.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
  const urls = locs.map((l) => `  <url>\n    <loc>${l}</loc>\n  </url>`)
  for (const h of built) {
    const alts = [...PAGE_LANGS.map((c) => [c, pageUrl(c, h)]), ['x-default', pageUrl(DEFAULT_LANG, h)]]
      .map(([c, u]) => `    <xhtml:link rel="alternate" hreflang="${c}" href="${u}"/>`)
      .join('\n')
    for (const c of PAGE_LANGS) urls.push(`  <url>\n    <loc>${pageUrl(c, h)}</loc>\n${alts}\n  </url>`)
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`
}

// ---------------------------------------------------------------- run

function templateAssets() {
  const p = path.join(DIST, 'hut-template', 'index.html')
  if (!fs.existsSync(p)) throw new Error('dist/hut-template/index.html is missing: run `npm run build` first.')
  const html = fs.readFileSync(p, 'utf8')
  const tags = html.match(/<script\b[^>]*type="module"[^>]*><\/script>|<link\b[^>]*rel="(?:stylesheet|modulepreload)"[^>]*>/g) || []
  if (!tags.some((s) => s.startsWith('<script'))) throw new Error('No script in dist/hut-template/index.html')
  return tags
}

const pages = built.length * PAGE_LANGS.length
if (CHECK) {
  console.log(`${eligible.length} huts could have a page, ${built.length} would be built (${pages} pages)${only ? ' from data/hut_pages.json' : ''}.`)
  for (const h of built) {
    for (const c of PAGE_LANGS) {
      const L = i18n(c)
      const tt = titleOf(L, h)
      const dd = descriptionOf(L, h)
      console.log(`  ${pagePath(c, h)}\n    ${tt.length}  ${tt}\n    ${dd.length}  ${dd}`)
    }
  }
} else {
  const assets = templateAssets()
  for (const h of built) {
    for (const c of PAGE_LANGS) {
      const dir = path.join(DIST, c, 'hut', slugs.get(h.id))
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'index.html'), page(i18n(c), h, assets))
    }
  }
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap())
  fs.rmSync(path.join(DIST, 'hut-template'), { recursive: true, force: true })
  console.log(`Wrote ${pages} hut pages (${built.length} huts × ${PAGE_LANGS.length} languages) and sitemap.xml.`)
}
