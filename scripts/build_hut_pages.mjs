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

   Which huts get a page: all of them. Search engines get the ones with a
   photo, a description of their own or contact details; the others are
   noindex and left out of the sitemap until they have one of those (see
   indexable below). data/hut_pages.json, when it exists, narrows the build
   to the ids it lists. Each page's address is kept in
   public/hut_slugs.json, which the app reads too.

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
const seconds = exists('data/second_photos.json') ? readJSON('data/second_photos.json') : {}
const only = !ALL && exists('data/hut_pages.json') ? new Set(readJSON('data/hut_pages.json').ids) : null

const textOf = (h) => (h.hr_hut_id != null ? texts[String(h.hr_hut_id)] : null)
const hasOwnText = (h) => {
  const e = textOf(h)
  return !!e && HUT_TEXT_LANGS.some((c) => e[c])
}
const isBookable = (h) => h.hr_hut_id != null && !!h.hr_booking_url
const recOf = (h) => (h.hr_hut_id != null && avail.huts ? avail.huts[String(h.hr_hut_id)] || null : null)
const isNum = (v) => typeof v === 'number' && !Number.isNaN(v)

/* Every hut gets a page. A page goes to search engines (indexed, in the
   sitemap) once the hut has something of its own to show: a photo, its own
   description, or a way to contact it. The rest are noindex until they do,
   so hundreds of near-empty pages don't count against the site. The nearby
   huts on a page come only from huts with a photo or description, as before. */
const hasPhoto = (h) => !!(photos[h.id] && photos[h.id].full)
const hasContact = (h) => !!(h.phone || h.website || h.email)
const indexable = (h) => hasPhoto(h) || hasOwnText(h) || hasContact(h)
const eligible = huts
const featured = huts.filter((h) => hasPhoto(h) || hasOwnText(h))
const built = eligible.filter((h) => !only || only.has(h.id))

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
/* A page's address never changes once it is out, so every hut's slug is
   kept in public/hut_slugs.json. A hut not in it yet gets its name, or, when
   another hut already has that, its name and region, then its elevation too
   (enzianhuette-salzburg-1313). --write-slugs saves the new ones. */
const SLUGS_FILE = 'public/hut_slugs.json'
const slugs = new Map(Object.entries(exists(SLUGS_FILE) ? readJSON(SLUGS_FILE).slugs : {}))
{
  const taken = new Map([...slugs].map(([id, s]) => [s, id]))
  const fresh = []
  // How many huts share a name within one region: those all get their elevation.
  const sameInRegion = new Map()
  for (const h of huts) {
    const k = `${slugify(h.name)}|${h.region}`
    sameInRegion.set(k, (sameInRegion.get(k) || 0) + 1)
  }
  // Huts with a page already first, so the addresses that are live keep their plain name.
  for (const h of [...featured, ...huts.filter((x) => !featured.includes(x))]) {
    if (slugs.has(h.id)) continue
    const base = slugify(h.name)
    const region = `${base}-${slugify(h.region || '')}`
    const tries = [base, sameInRegion.get(`${base}|${h.region}`) > 1 ? null : region, `${region}-${Math.round(h.elevation || 0)}`]
      .filter(Boolean)
    let s = tries.find((t) => !taken.has(t))
    for (let n = 2; !s; n++) if (!taken.has(`${tries.at(-1)}-${n}`)) s = `${tries.at(-1)}-${n}`
    taken.set(s, h.id)
    slugs.set(h.id, s)
    fresh.push(h)
  }
  if (args.includes('--write-slugs')) {
    const out = Object.fromEntries([...slugs].sort(([a], [b]) => (a < b ? -1 : 1)))
    fs.writeFileSync(path.join(ROOT, SLUGS_FILE), JSON.stringify({ _note: 'Each hut page\'s address, kept so it never changes. Written by build_hut_pages.mjs --write-slugs.', slugs: out }, null, 1) + '\n')
    console.log(`${SLUGS_FILE}: ${fresh.length} new, ${slugs.size} in all.`)
  } else if (fresh.length) {
    console.warn(`  ${fresh.length} huts have no saved slug yet (${fresh.slice(0, 3).map((h) => slugs.get(h.id)).join(', ')}…): run with --write-slugs and commit ${SLUGS_FILE}.`)
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
// Each language's own name for a region (region.* in src/strings/, as in the
// app). The data keeps the German names.
const REGION_KEYS = {
  Tirol: 'tirol', Salzburg: 'salzburg', Steiermark: 'steiermark', Kärnten: 'kaernten', Niederösterreich: 'niederoesterreich',
  Oberösterreich: 'oberoesterreich', Vorarlberg: 'vorarlberg', Burgenland: 'burgenland', Wien: 'wien',
}
const regionName = (L, r) => (r && REGION_KEYS[r] ? L.t(`region.${REGION_KEYS[r]}`) : r)
const bedsOf = (h) => (isNum(h.hr_capacity) ? h.hr_capacity : isNum(h.sleeping) ? h.sleeping : null)
const elevText = (L, h) =>
  isNum(h.elevation) ? L.t(h.elevation_estimated ? 'page.elevApprox' : 'page.elev', { n: L.nf(Math.round(h.elevation)) }) : null

// The app's filter values (ELEV_BANDS, wardenOf, assocOf in src/App.jsx).
const ELEV_BANDS = [
  { key: 'e1', lo: -Infinity, hi: 1000 },
  { key: 'e2', lo: 1000, hi: 1500 },
  { key: 'e3', lo: 1500, hi: 2000 },
  { key: 'e4', lo: 2000, hi: 2500 },
  { key: 'e5', lo: 2500, hi: Infinity },
]
const bandOf = (h) => (isNum(h.elevation) && ELEV_BANDS.find((b) => h.elevation >= b.lo && h.elevation < b.hi)?.key) || 'unknown'
const bandLabel = (L, b) => L.t(`elev.${b.key}`, { n: L.nf(b.key === 'e1' ? b.hi : b.lo), a: L.nf(b.lo), b: L.nf(b.hi) })
// "Attended" huts filter with Serviced: someone is there.
const wardenOf = (h) => (h.warden === 'bewartet' ? 'bewirtschaftet' : h.warden || '')
const assocOf = (h) => h.association || 'unknown'

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
  // Private rooms, from the hut's booking page; it opens the huts with private rooms.
  if (isBookable(h) && recOf(h)?.caps?.[PRIV] > 0) tags.push({ label: t('tag.privateRooms'), href: privPath(L.lang) })
  if (h.hr_dogs === true) tags.push({ label: t('tag.dogsWelcome'), href: dogsPath(L.lang) })
  else if (h.hr_dogs === false) tags.push({ label: t('tag.noDogs') })
  return tags
}
// A tag with an address opens that list page (Dogs welcome: the huts with dogs).
const tagList = (tags) =>
  `<ul class="hf-tags">${tags
    .map((g) =>
      g.href
        ? `<li class="hf-tag hf-tag-link"><a href="${g.href}">${esc(g.label)}</a></li>`
        : `<li class="${g.club ? 'hf-tag hf-tag-club' : 'hf-tag'}">${esc(g.label)}</li>`)
    .join('')}</ul>`

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
  if (regionOf(h)) s += L.t('page.s.in', { region: regionName(L, regionOf(h)) })
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
  const kind = isBookable(h) ? 'book' : 'info'
  const el = elevText(L, h)
  const tries = [
    el ? L.t(`page.title.${kind}`, { name: h.name, elev: el }) : null,
    L.t(`page.title.${kind}Short`, { name: h.name }),
    h.name,
  ].filter(Boolean)
  return tries.find((s) => s.length <= TITLE_MAX) || h.name
}

function descriptionOf(L, h) {
  const end = L.t(isBookable(h) ? 'page.meta.book' : 'page.meta.info')
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
  const pool = featured.filter((o) => o.id !== h.id && (isBookable(h) || isBookable(o)))
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
// The same for one room type (0 dorm, 1 shared, 2 private), for a page about it.
function nextFreeIn(h, i) {
  const rec = recOf(h)
  if (!rec || !rec.days) return null
  for (const d of Object.keys(rec.days).sort()) {
    if (d >= TODAY && rec.days[d][i] > 0) return { date: d, free: rec.days[d][i] }
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

// The room types a hut has, as [key, index into the availability arrays].
const typesOf = (rec) => BUCKETS.map((k, j) => [k, j]).filter(([, j]) => rec.caps && rec.caps[j] > 0)

function cellRows(L, rec, iso, phone) {
  const a = rec.days[iso]
  if (phone) {
    /* On a phone a day shows one number: the free beds of the room types
       picked above the calendar, added up. The page is written with all of
       them picked; data-beds holds each type's count, so src/hutpage.js can
       redo the sum when the pick changes. */
    const n = typesOf(rec).reduce((sum, [, j]) => sum + (a[j] || 0), 0)
    return `<span class="hp-v" data-beds="${BUCKETS.map((_, j) => a[j] || 0).join(',')}">${gauge(n, 9)}<b style="color:${bedColor(n)}">${esc(n > 0 ? L.nf(n) : L.t('avail.full'))}</b></span>`
  }
  return BUCKETS.map((k, j) => {
    if (!(rec.caps && rec.caps[j] > 0)) return ''
    const n = a[j] || 0
    const text = n > 0 ? L.nf(n) : L.t('avail.full')
    const color = bedColor(n)
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

function legend(L) {
  return `<span class="hp-legend"><span>${gauge(9, 10)}${esc(L.t('page.legend.many'))}</span><span>${gauge(2, 10)}${esc(L.t('page.legend.few'))}</span><span>${gauge(0, 10)}${esc(L.t('avail.full'))}</span></span>`
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
  // Room type pills, all picked to start with; any mix can be picked.
  const types = typesOf(rec)
  const pill = (k, j) =>
    `<button type="button" class="hf-chip hf-pill hp-type" data-i="${j}" aria-pressed="true">${esc(L.t(`page.short.${k}`))}</button>`
  const keys =
    types.length > 1
      ? `<div class="hp-types" role="group" aria-label="${esc(L.t('page.roomType'))}">${types.map(([k, j]) => pill(k, j)).join('')}</div>`
      : `<p class="hp-types-one">${esc(L.t(`bucket.${types[0][0]}`))}</p>`
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
  const phone = `<div class="hp-months" data-months data-full="${esc(L.t('avail.full'))}" data-locale="${NUMBER_LOCALES[L.lang] || L.locale}">${keys}${months}</div>`

  return `<section class="hp-section" aria-labelledby="beds-h">${head}<div class="hp-cal">${wide}${phone}<div class="hp-cal-foot">${legend(L)}${bookButton(L, h)}</div></div></section>`
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
/* The hut's own text, folded into the intro behind "View more information".
   It opens above the button, so "Show less" ends up under the text. It is in
   the HTML either way, so search engines read it; without JavaScript it is
   simply shown. */
function moreInfo(L, h) {
  const e = textOf(h)
  if (!e) return ''
  const ours = e.translated || []
  const code = e[L.lang] && !ours.includes(L.lang) ? L.lang : HUT_TEXT_LANGS.find((c) => e[c] && !ours.includes(c))
  if (!code) return ''
  const paras = plainParas(e[code])
  if (!paras.length) return ''
  const note = code === L.lang ? L.t('page.descSource') : L.t('page.descSourceIn', { language: L.langName(code) })
  const langAttr = code === L.lang ? '' : ` lang="${code}"`
  return (
    `<div class="hp-info"><div class="hp-info-body" id="hut-info"><div${langAttr}>${paras.map((p) => `<p>${esc(p)}</p>`).join('')}</div><p class="hp-source">${esc(note)}</p></div>` +
    `<button type="button" class="hp-info-btn hf-tap-min" aria-expanded="false" aria-controls="hut-info"><span class="hp-u hp-info-open">${esc(L.t('page.moreInfo'))}</span><span class="hp-u hp-info-close">${esc(L.t('page.lessInfo'))}</span>${icon('chevron', 15, 2)}</button></div>`
  )
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

/* The photo credit, for the main photo and the second one when the collage
   has it. A collage is an adaptation, so it says so; if either photo is
   CC BY-SA, the collage is shared under CC BY-SA too, as the licence requires. */
function credit(L, ph, isCollage, two) {
  // Looks like plain text, as in the app's pop-up, but the photographer links
  // to the photo on Commons and the licence to its terms, which the licences
  // ask for. A licence name stays on one line ("CC BY-SA" never breaks at its
  // hyphen).
  const link = (href, text) => (href ? `<a href="${esc(href)}">${text}</a>` : text)
  const lic = (name, href) => link(href, `<span class="hp-nowrap">${esc(name || '')}</span>`)
  const one = (p) => `${link(p.page, esc(p.credit || ''))} · ${lic(p.license, p.license_url)}`
  // Both photos by the same person ("Simon Legner (simon04)", or a longer form
  // of the same name): the name once, the licences once each. The name links
  // to the main photo and the word "Photos" to the second, so each photo still
  // links to its page.
  const who = (c) => (c || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
  const [a, b] = two ? [who(ph.credit), who(two.credit)] : []
  const same = two && a && b && (a === b || a.includes(b) || b.includes(a))
  let s
  if (same) {
    const name = b.length > a.length ? two.credit : ph.credit
    const lics = ph.license === two.license
      ? lic(ph.license, ph.license_url)
      : `${lic(ph.license, ph.license_url)} ${esc(L.t('page.and'))} ${lic(two.license, two.license_url)}`
    s = `${link(two.page, esc(L.t('page.photos')))} ${link(ph.page, esc(name))} · ${lics}`
  } else {
    s = two
      ? `${esc(L.t('page.photos'))} ${one(ph)} ${esc(L.t('page.and'))} ${one(two)}`
      : `${esc(L.t('detail.photoCredit'))} ${one(ph)}`
  }
  if (isCollage) {
    s += ` · ${esc(L.t('page.collageBy'))}`
    if ([ph, two].some((p) => p && /^CC BY-SA/i.test(p.license || '')))
      s += `, ${esc(L.t('page.sharedUnder', { license: '' }).trim())} ${lic('CC BY-SA 4.0', 'https://creativecommons.org/licenses/by-sa/4.0/')}`
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
  const labels = [el, regionName(L, regionOf(h))].filter(Boolean)
  const s = c.second
  return (
    `<figure class="hp-figure"><div class="hp-collage" style="aspect-ratio:1000/${fh}">` +
    `<div class="hp-piece"><img src="/${esc(c.main.src)}" width="${c.main.w}" height="${c.main.h}" alt="${esc(h.name)}" fetchpriority="high"/>${sparkHTML}</div>` +
    `<img class="hp-second" src="/${esc(s.src)}" width="${s.w}" height="${s.h}" alt="" style="left:${pct(s.x / 10)};top:${pct((s.y / fh) * 100)};width:${pct(s.width / 10)}"/>` +
    c.tapes.map((tp) => tape(tp, fh)).join('') +
    (labels.length ? `<div class="hp-labels" aria-hidden="true" style="top:${pct((c.label_top / fh) * 100)}">${labels.map((x) => `<span>${esc(x)}</span>`).join('')}</div>` : '') +
    `</div>${credit(L, ph, true, s.kind === 'photo' && seconds[h.id] && seconds[h.id].file ? seconds[h.id] : null)}</figure>`
  )
}

// ---------------------------------------------------------------- nearby

// What the region page filters read off a card (src/regionpage.js).
const filterData = (o) =>
  ` data-hut data-id="${esc(o.id)}" data-region="${esc(o.region || '')}" data-type="${esc(o.type || '')}" data-band="${bandOf(o)}" data-warden="${esc(wardenOf(o))}" data-assoc="${esc(assocOf(o))}"` +
  (o.shower === true ? ' data-shower' : '') +
  (bedsOf(o) != null ? ` data-beds="${bedsOf(o)}"` : '') +
  (o.hr_hut_id != null ? ` data-hr="${esc(o.hr_hut_id)}"` : '')

// `lineOf`: a list page's own availability line for a bookable hut (the next
// free private room, the beds free this weekend) instead of the next free bed.
function card(L, o, d, filterable = false, lineOf = null) {
  const ph = photos[o.id]
  const linked = builtIds.has(o.id)
  const meta = [typeLabel(L, o), elevText(L, o)].filter(Boolean).join(' · ')
  const name = linked ? `<a class="hp-card-link" href="${pagePath(L.lang, o)}">${esc(o.name)}</a>` : esc(o.name)
  let bandHTML
  if (isBookable(o)) {
    const nf = nextFree(o)
    let line = lineOf
      ? lineOf(o)
      : nf
      ? `<span>${gauge(nf.free, 11)} ${esc(L.t('avail.nextFree', { date: fmtISO(nf.date), n: L.nf(nf.free) }))}</span>`
      : recOf(o)
        ? `<span>${esc(L.t('avail.none'))}</span>`
        : ''
    // With dates picked, the filters put the free beds of those nights here.
    if (filterable) line = `<div class="hp-avail">${line}</div>`
    bandHTML = `<div class="hf-card-band">${line}<div>${bookButton(L, o)}</div></div>`
  } else if (o.phone) {
    bandHTML = `<div class="hf-card-band hf-card-band-row"><a class="hf-call hf-tap" href="${esc(telHref(o.phone))}" aria-label="${esc(L.t('call.aria', { hut: o.name, phone: phoneLabel(o.phone) }))}">${icon('phone', 14, 1.8)}${esc(L.t('call.label', { phone: phoneLabel(o.phone) }))}</a><span>${esc(L.t('page.notBookable'))}</span></div>`
  } else if (o.website) {
    bandHTML = `<div class="hf-card-band hf-card-band-row"><a class="hf-call hf-tap" href="${esc(webHref(o.website))}" target="_blank" rel="noopener" aria-label="${esc(L.t('contact.websiteAria', { hut: o.name, host: webLabel(o.website) }))}">${icon('globe', 14, 1.8)}${esc(L.t('contact.website'))}</a><span>${esc(L.t('page.notBookable'))}</span></div>`
  } else {
    bandHTML = `<div class="hf-card-band"><span>${esc(L.t('page.notBookableNoContact'))}</span></div>`
  }
  return (
    `<div class="hp-card"${filterable ? filterData(o) : ''}><div class="hf-card-head">` +
    (ph && ph.card ? `<img class="hf-thumb" src="/${esc(ph.card)}" width="96" height="72" alt="" loading="lazy" decoding="async"/>` : '') +
    `<div class="hf-card-title"><div class="hp-card-name">${name}</div>` +
    (meta ? `<div class="hf-card-meta">${esc(meta)}</div>` : '') +
    (d != null ? `<div class="hf-card-meta">${esc(L.t('page.away', { km: L.nf(d, { maximumFractionDigits: 1, minimumFractionDigits: 1 }) }))}</div>` : '') + '</div>' +
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

// ---------------------------------------------------------------- region pages

/* One page per region (/de/tyrol/, /en/tyrol/): its huts with something of
   their own to show, the bookable ones first (soonest free beds first), then
   the ones you contact directly. Every name links to its hut page, so these
   are the plain links a search engine can follow to the huts. A region with
   fewer than REGION_MIN huts gets no page. */
const REGION_MIN = 10
// Addresses are English in every language: /de/styria/ and /en/styria/.
const regionSlug = (r) => slugify(regionName(i18n('en'), r))
const regionPath = (lang, r) => `/${lang}/${regionSlug(r)}/`
const regionUrl = (lang, r) => SITE + regionPath(lang, r)
const countIn = (r) => huts.filter((h) => h.region === r).length
const REGIONS = [...new Set(huts.map(regionOf).filter(Boolean))]
  .filter((r) => countIn(r) >= REGION_MIN)
  .sort((a, b) => countIn(b) - countIn(a))
const hasRegionPage = (r) => REGIONS.includes(r)

// Soonest free beds first (of one room type, given `i`); ISO dates compare as
// plain text, nothing free last.
const bySoonest = (list, i = null) =>
  list
    .map((h) => ({ h, nf: i == null ? nextFree(h) : nextFreeIn(h, i) }))
    .sort((a, b) => {
      const x = a.nf ? a.nf.date : '9999'
      const y = b.nf ? b.nf.date : '9999'
      return x < y ? -1 : x > y ? 1 : a.h.name.localeCompare(b.h.name, 'de')
    })
    .map((x) => x.h)

function regionData(r) {
  const all = huts.filter((h) => h.region === r)
  const listed = all.filter((h) => builtIds.has(h.id) && (isBookable(h) || indexable(h)))
  const book = bySoonest(listed.filter(isBookable))
  const contact = listed.filter((h) => !isBookable(h)).sort((a, b) => a.name.localeCompare(b.name, 'de'))
  // Only measured elevations: an estimate shouldn't set the range.
  const known = all.filter((h) => isNum(h.elevation) && !h.elevation_estimated)
  const pick = (cmp) => known.reduce((m, h) => (cmp(h.elevation, m.elevation) ? h : m), known[0])
  return {
    all, book, contact,
    low: pick((x, y) => x < y),
    high: pick((x, y) => x > y),
    free: book.filter((h) => nextFree(h)).length,
    hidden: all.length - listed.length,
  }
}

/* The app's filters, above the cards: dates and room type, then More filters
   (type, elevation, warden, association, shower). Rendered here so the page
   doesn't jump; src/regionpage.js makes them work and fills in the
   counts. Without JavaScript they are hidden, and every card shows. */
const CLIENT_STRINGS = [
  'date.checkIn', 'date.checkOut', 'date.add', 'date.prevMonth', 'date.nextMonth', 'date.pickCheckIn', 'date.pickCheckOut',
  'date.dayAria', 'date.nights', 'date.checkInPending', 'date.noDates',
  'avail.free', 'avail.fewest', 'avail.full', 'avail.beds', 'avail.asOf',
  'bucket.dorm', 'bucket.shared', 'bucket.priv', 'bucketPlural.dorm', 'bucketPlural.shared', 'bucketPlural.priv',
  'unlisted.noteDatesRoom', 'unlisted.noteDates', 'unlisted.noteRoom',
  'empty.nothingFreeNights', 'empty.nothingFreeNight', 'empty.noMatch',
  'more.applied', 'more.show', 'chip.removeAria',
  // the hut pop-up
  'avail.nextFree', 'avail.none', 'book.online', 'book.aria', 'call.label', 'call.aria', 'band.notBookable',
  'contact.website', 'contact.websiteAria', 'contact.email', 'contact.emailAria',
  'detail.closeAria', 'detail.hutPageAria', 'detail.description', 'detail.readMore', 'detail.showLess',
  'detail.priceList', 'detail.priceListAria', 'page.nextFree.priv',
]
/* What the hut pop-up on a region page shows, as in the app's pop-up: the
   photo, the name (linking to the hut page), how to reach the hut, every tag
   and the booking row. The hut's own text loads with /hut_texts.json when the
   first pop-up opens, as in the app. */
function popData(L, h) {
  const ph = photos[h.id]
  const o = { n: h.name, m: [typeLabel(L, h), regionName(L, regionOf(h)), elevText(L, h)].filter(Boolean).join(' · ') }
  if (builtIds.has(h.id)) o.u = pagePath(L.lang, h)
  // The credit as on the hut page: plain to look at, but the photographer links
  // to the photo on Commons and the licence to its terms. HTML, made here.
  if (ph && ph.full) {
    const link = (href, text) => (href ? `<a href="${esc(href)}">${text}</a>` : text)
    o.p = `/${ph.full}`
    o.c = `${esc(L.t('detail.photoCredit'))} ${link(ph.page, esc(ph.credit || ''))} · ${link(ph.license_url, `<span class="hp-nowrap">${esc(ph.license || '')}</span>`)}`
  }
  if (h.phone) o.tel = [telHref(h.phone), phoneLabel(h.phone)]
  if (h.website) o.web = [webHref(h.website), webLabel(h.website)]
  if (h.email) o.mail = h.email
  o.tags = hutTags(L, h).map((g) => (g.href ? [g.label, 0, g.href] : g.club ? [g.label, 1] : [g.label]))
  if (isBookable(h)) {
    o.book = h.hr_booking_url
    const x = (h.club ? CLUB_LABEL[h.club] || h.club : '') +
      (isNum(h.hr_half_board_eur) ? L.t('detail.halfBoard', { n: h.hr_half_board_eur }) : '') +
      (h.hr_dogs === true ? L.t('detail.dogsWelcome') : h.hr_dogs === false ? L.t('detail.noDogs') : '')
    if (x) o.x = x.replace(/^ · /, '')
    if (h.hr_price_pdf) o.pdf = h.hr_price_pdf
  }
  if (h.hr_hut_id != null) o.hr = String(h.hr_hut_id)
  if (textOf(h)) o.txt = 1
  return o
}

function listFilters(L, listed, regions = null, room = null, dates = null) {
  const pill = (g, v, label, chip = label) =>
    `<button type="button" class="hf-tap hf-pill hp-pill" data-g="${g}" data-v="${esc(v)}" data-chip="${esc(chip)}" aria-pressed="false">${esc(label)}<span class="hp-pill-n"></span></button>`
  const all = (g, label) => `<button type="button" class="hf-tap hf-pill hp-pill" data-g="${g}" data-v="" aria-pressed="true">${esc(label)}</button>`
  const group = (id, label, pills, note = '') =>
    `<div class="hp-fgroup"><div class="hp-flabel" id="${id}">${esc(label)}</div><div class="hp-pills" role="group" aria-labelledby="${id}">${pills}</div>` +
    (note ? `<p class="hp-fnote">${esc(note)}</p>` : '') + '</div>'
  const field = (which, caption) =>
    `<button type="button" class="hp-dfield hf-tap-min" data-field="${which}" aria-expanded="false" aria-haspopup="dialog"><span class="hp-dcap">${esc(caption)}</span><span class="hp-dval">${esc(L.t('date.add'))}</span></button>`
  const bands = ELEV_BANDS.map((b) => pill('band', b.key, bandLabel(L, b)))
  if (listed.some((h) => bandOf(h) === 'unknown')) bands.push(pill('band', 'unknown', L.t('elev.unknown')))
  const more =
    group('f-type', L.t('filter.type'), all('type', L.t('pill.all')) + TYPE_KEYS.map((k) => pill('type', k, L.t(`type.${k}`))).join('')) +
    group('f-band', L.t('filter.elevation'), all('band', L.t('pill.all')) + bands.join('')) +
    group('f-warden', L.t('filter.warden'), all('warden', L.t('pill.all')) + ['bewirtschaftet', 'selbstversorger'].map((w) => pill('warden', w, L.t(`warden.${w}`))).join('')) +
    group('f-assoc', L.t('filter.association'), all('assoc', L.t('pill.all')) +
      ['alpine_club', 'naturfreunde', 'private'].map((a) => pill('assoc', a, L.t(`assoc.${a}`))).join('') +
      pill('assoc', 'unknown', L.t('pill.unlisted'), L.t('label.assocUnlisted'))) +
    group('f-shower', L.t('filter.amenities'), pill('shower', '1', L.t('pill.hasShower'), L.t('tag.shower')))
  const config = {
    locale: L.locale,
    numLocale: NUMBER_LOCALES[L.lang] || L.locale,
    maxNights: 31,
    strings: Object.fromEntries(CLIENT_STRINGS.map((k) => [k, DICTS[L.lang][k] ?? en[k]])),
  }
  return (
    `<div class="hp-filters" role="search" aria-label="${esc(L.t('page.region.filters'))}" data-filters data-avail="/availability.json" data-texts="/hut_texts.json"${room ? ` data-room="${room}"` : ''}${dates ? ` data-from="${dates.from}" data-to="${dates.to}"` : ''}>` +
    `<div class="hp-frow">` +
    `<div class="hp-fgroup hp-fdates"><div class="hp-flabel" id="f-dates">${esc(L.t('filter.available'))}</div>` +
    `<div class="hp-dfields" role="group" aria-labelledby="f-dates">${field('start', L.t('date.checkIn'))}${field('end', L.t('date.checkOut'))}` +
    `<button type="button" class="hp-dclear" data-dclear hidden>${esc(L.t('date.clear'))}</button></div>` +
    `<p class="hp-dstatus" data-dstatus>${esc(L.t('date.noDates'))}</p><p class="hp-asof" data-asof></p></div>` +
    // The calendar opens under the dates on a phone, under the whole row where there is room.
    `<div class="hp-pick" role="dialog" aria-label="${esc(L.t('date.dialogAria'))}" data-cal hidden></div>` +
    // A page across regions (huts with dogs) gets the app's region pills too.
    (regions ? group('f-region', L.t('filter.region'), all('region', L.t('pill.all')) + regions.map((r) => pill('region', r, regionName(L, r))).join('')) : '') +
    (room ? '' : group('f-room', L.t('filter.roomType'), all('room', L.t('pill.any')) + BUCKETS.map((k) => pill('room', k, L.t(`bucket.${k}`))).join(''), L.t('filter.roomTypeNote'))) +
    `</div>` +
    `<div class="hp-fbar"><button type="button" class="hp-morebtn hf-tap" aria-expanded="false" aria-controls="more-filters">${esc(L.t('more.button'))}` +
    `<span class="hp-badge" aria-hidden="true" hidden></span><span class="hf-vh" data-applied></span></button>` +
    `<div class="hp-chips" data-chips></div>` +
    `<button type="button" class="hp-linkbtn hf-tap" data-clearall hidden>${esc(L.t('clear.filters'))}</button></div>` +
    `<div class="hp-morepanel" id="more-filters" aria-label="${esc(L.t('more.button'))}" tabindex="-1" hidden>` +
    `<div class="hp-morehead"><span class="hp-moretitle">${esc(L.t('more.button'))}</span>` +
    `<button type="button" class="hp-done hf-tap" data-close>${esc(L.t('more.done'))}</button>` +
    `<button type="button" class="hp-x hf-tap" data-close aria-label="${esc(L.t('more.closeAria'))}">${icon('close', 20, 2)}</button></div>` +
    `<div class="hp-moregroups">${more}</div>` +
    `<div class="hp-morefoot"><button type="button" class="hp-linkbtn hf-tap" data-clearmore>${esc(L.t('more.clear'))}</button>` +
    `<button type="button" class="hp-show hf-tap" data-close data-show></button></div></div>` +
    `<script type="application/json">${JSON.stringify(config).replace(/</g, '\\u003c')}</script>` +
    `</div>`
  )
}

/* A section of cards. The note says what the filters can't know about
   these huts, and the empty line is for when they leave none; the filters
   fill both in. A section that `collapses` goes instead, when it is one of
   several of the same kind (the regions on the dogs page). */
function listSection(L, { id, kind, heading, list, aside = '', collapse = false, lineOf = null }) {
  if (!list.length) return ''
  const h2 = `<h2 class="hp-h2" id="${id}">${esc(heading)} <span class="hp-count" data-count>${esc(L.nf(list.length))}</span></h2>`
  return (
    `<section class="hp-section" aria-labelledby="${id}" data-section="${kind}"${collapse ? ' data-collapse' : ''}>` +
    (aside ? `<div class="hp-section-head">${h2}${aside}</div>` : h2) +
    `<p class="hp-note" data-note hidden></p><p class="hp-fempty" data-empty hidden></p>` +
    `<div class="hp-grid">${list.map((h) => card(L, h, null, true, lineOf)).join('')}</div></section>`
  )
}

/* The frame of a list page (a region, huts with dogs): the head with its
   structured data, the crumbs, H1 and intro, the filters, the sections, and
   the data the hut pop-up shows. */
function listPage(L, p, assets) {
  const other = PAGE_LANGS.find((c) => c !== L.lang)
  const url = SITE + p.path(L.lang)
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'CollectionPage', '@id': `${url}#page`, name: p.h1, url, description: p.desc, inLanguage: L.lang, isPartOf: { '@id': `${SITE}/#website` } },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Hüttenfinder', item: `${SITE}/` },
          { '@type': 'ListItem', position: 2, name: p.crumb },
        ],
      },
    ],
  }
  const head = [
    '<meta charset="utf-8">',
    "<script>document.documentElement.classList.add('hp-js')</script>",
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(p.title)}</title>`,
    `<meta name="description" content="${esc(p.desc)}">`,
    '<meta name="theme-color" content="#3A2A20">',
    '<link rel="icon" type="image/svg+xml" href="/favicon.svg">',
    `<link rel="canonical" href="${url}">`,
    ...PAGE_LANGS.map((c) => `<link rel="alternate" hreflang="${c}" href="${SITE + p.path(c)}">`),
    `<link rel="alternate" hreflang="x-default" href="${SITE + p.path(DEFAULT_LANG)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Hüttenfinder">',
    `<meta property="og:title" content="${esc(p.title)}">`,
    `<meta property="og:description" content="${esc(p.desc)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:locale" content="${OG_LOCALES[L.lang]}">`,
    `<meta property="og:image" content="${SITE}/og-image.png">`,
    `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
    ...assets,
  ].join('\n')
  const crumbs =
    `<nav class="hp-crumbs" aria-label="${esc(L.t('page.crumbs'))}"><ol>` +
    `<li><a href="/">${esc(L.t('page.huts'))}</a></li><li aria-current="page">${esc(p.crumb)}</li></ol></nav>`
  const pop = Object.fromEntries(p.listed.map((h) => [h.id, popData(L, h)]))
  return (
    `<!doctype html>\n<html lang="${L.lang}">\n<head>\n${head}\n</head>\n<body>\n<div class="hp">` +
    siteHeader(L, other, p.path(other)) +
    `<main class="hp-wrap hp-main"><div>${crumbs}<div class="hp-region-top"><h1 class="hp-name">${esc(p.h1)}</h1>` +
    `<p class="hp-summary">${esc(p.intro)}</p></div>${listFilters(L, p.listed, p.regions, p.room, p.dates)}</div>` +
    p.sections +
    // When the filters leave no hut in any section that collapses.
    (p.sections.includes('data-collapse') ? `<p class="hp-fempty" data-none hidden></p>` : '') +
    (p.more || '') +
    `<script type="application/json" data-pop>${JSON.stringify(pop).replace(/</g, '\\u003c')}</script>` +
    `</main>` +
    siteFooter(L, p.crumb, 'page.footer.wrongPage', p.path(L.lang)) +
    `</div>\n</body>\n</html>\n`
  )
}

function regionPage(L, r, assets) {
  const d = regionData(r)
  const name = regionName(L, r)
  // a non-breaking space, so "3,272 m" never splits over two lines
  const m = (h) => L.t('page.elev', { n: L.nf(Math.round(h.elevation)) }).replace(' ', '\u00a0')
  const intro = [
    L.t('page.region.intro', { n: L.nf(d.all.length), region: name, low: m(d.low), high: m(d.high) }),
    d.book.length ? L.t('page.region.introBook', { count: d.book.length, b: L.nf(d.book.length) }) : '',
    d.book.length ? (d.free ? L.t('page.region.introFree', { count: d.free, f: L.nf(d.free) }) : L.t('page.region.introNoFree')) : '',
    L.t('page.region.introHigh', { hut: d.high.name, elev: m(d.high) }),
  ].filter(Boolean).join(' ')
  const more = d.hidden
    // Not filtered, so the filters hide it while any is on. The app opens on the region.
    ? `<p class="hp-region-more" data-unfiltered><a class="hp-more hf-tap-min" href="/?region=${REGION_KEYS[r]}"><span class="hp-u">${esc(L.t('page.region.more', { count: d.hidden, n: L.nf(d.hidden), region: name }))}</span>&nbsp;→</a></p>`
    : ''
  return listPage(L, {
    path: (c) => regionPath(c, r),
    title: L.t('page.region.title', { region: name }),
    desc: L.t('page.region.meta', { n: L.nf(d.all.length), region: name, b: L.nf(d.book.length) }),
    h1: L.t('page.region.h1', { region: name }),
    crumb: name,
    intro,
    listed: [...d.book, ...d.contact],
    sections:
      listSection(L, { id: 'book-h', kind: 'book', heading: L.t('page.region.book'), list: d.book }) +
      listSection(L, { id: 'contact-h', kind: 'contact', heading: L.t('page.region.contact'), list: d.contact }),
    more,
  }, assets)
}

/* Huts with dogs (/en/huts-with-dogs/): the huts that say on hut-reservation.org
   that dogs are welcome, all bookable online, by region. Most huts don't say
   either way; they aren't on the list, and the intro says so. */
const dogsPath = (lang) => `/${lang}/huts-with-dogs/`
const DOG_HUTS = huts.filter((h) => h.hr_dogs === true && isBookable(h) && builtIds.has(h.id))

function dogsPage(L, assets) {
  const groups = new Map()
  for (const h of DOG_HUTS) groups.set(regionOf(h), [...(groups.get(regionOf(h)) || []), h])
  const regions = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length)
  const n = DOG_HUTS.length
  const free = DOG_HUTS.filter((h) => nextFree(h)).length
  const intro = [
    L.t('page.dogs.intro', { count: n, n: L.nf(n) }),
    free ? L.t('page.dogs.introFree', { count: free, f: L.nf(free) }) : L.t('page.dogs.introNoFree'),
    L.t('page.dogs.introUnknown'),
  ].join(' ')
  const sections = regions
    .map((r) => {
      const name = r ? regionName(L, r) : L.t('region.other')
      const aside = hasRegionPage(r)
        ? `<a class="hp-more hf-tap-min" href="${regionPath(L.lang, r)}"><span class="hp-u">${esc(L.t('page.list.allIn', { region: name }))}</span>&nbsp;→</a>`
        : ''
      return listSection(L, { id: `dogs-${REGION_KEYS[r] || 'other'}`, kind: 'book', heading: name, list: bySoonest(groups.get(r)), aside, collapse: true })
    })
    .join('')
  return listPage(L, {
    path: dogsPath,
    title: L.t('page.dogs.title'),
    desc: L.t('page.dogs.meta', { count: n, n: L.nf(n) }),
    h1: L.t('page.dogs.h1'),
    crumb: L.t('page.dogs.crumb'),
    intro,
    listed: regions.flatMap((r) => bySoonest(groups.get(r))),
    regions: regions.filter(Boolean),
    sections,
  }, assets)
}

/* Huts with private rooms (/en/huts-with-private-rooms/): the huts whose
   booking page lists private rooms, all bookable online, by region. Room
   type is fixed to private rooms, so dates mean a private room free every
   night, and each card gives the next free private room. */
const privPath = (lang) => `/${lang}/huts-with-private-rooms/`
const PRIV = 2 // private rooms in the availability arrays
const PRIV_HUTS = huts.filter((h) => isBookable(h) && builtIds.has(h.id) && recOf(h)?.caps?.[PRIV] > 0)
function privPage(L, assets) {
  const groups = new Map()
  for (const h of PRIV_HUTS) groups.set(regionOf(h), [...(groups.get(regionOf(h)) || []), h])
  const regions = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length)
  const n = PRIV_HUTS.length
  const free = PRIV_HUTS.filter((h) => nextFreeIn(h, PRIV)).length
  const intro = [
    L.t('page.priv.intro', { count: n, n: L.nf(n) }),
    free ? L.t('page.priv.introFree', { count: free, f: L.nf(free) }) : L.t('page.priv.introNoFree'),
    L.t('page.priv.introUnknown'),
  ].join(' ')
  // Each card: the next free private room.
  const lineOf = (o) => {
    const nf = nextFreeIn(o, PRIV)
    return nf
      ? `<span>${gauge(nf.free, 11)} ${esc(L.t('page.nextFree.priv', { date: fmtISO(nf.date), n: L.nf(nf.free) }))}</span>`
      : recOf(o) ? `<span>${esc(L.t('avail.none'))}</span>` : ''
  }
  const sections = regions
    .map((r) => {
      const name = r ? regionName(L, r) : L.t('region.other')
      const aside = hasRegionPage(r)
        ? `<a class="hp-more hf-tap-min" href="${regionPath(L.lang, r)}"><span class="hp-u">${esc(L.t('page.list.allIn', { region: name }))}</span>&nbsp;→</a>`
        : ''
      return listSection(L, { id: `priv-${REGION_KEYS[r] || 'other'}`, kind: 'book', heading: name, list: bySoonest(groups.get(r), PRIV), aside, collapse: true, lineOf })
    })
    .join('')
  return listPage(L, {
    path: privPath,
    title: L.t('page.priv.title'),
    desc: L.t('page.priv.meta', { count: n, n: L.nf(n) }),
    h1: L.t('page.priv.h1'),
    crumb: L.t('page.priv.h1'),
    intro,
    listed: regions.flatMap((r) => bySoonest(groups.get(r), PRIV)),
    regions: regions.filter(Boolean),
    room: 'priv',
    sections,
  }, assets)
}

/* Free beds this weekend (/en/free-beds-this-weekend/): the bookable huts
   with a free bed every night of the coming weekend, Friday and Saturday
   night (on a Saturday, that night only). Built with every deploy, which
   the free beds' refresh runs about five times a day, so the weekend moves
   on by itself. The page starts with those dates picked in the filters. */
const weekendPath = (lang) => `/${lang}/free-beds-this-weekend/`
const WEEKEND = (() => {
  const dow = utc(TODAY).getUTCDay() // 0 Sunday … 6 Saturday
  const from = dow === 6 ? TODAY : addDays(TODAY, (5 - dow + 7) % 7)
  const nights = dow === 6 ? [from] : [from, addDays(from, 1)]
  return { from, to: addDays(from, nights.length), nights }
})()
// The fewest free beds across the weekend's nights; 0 if any night is full or closed.
const weekendFree = (h) => {
  const rec = recOf(h)
  if (!rec || !rec.days) return 0
  return Math.min(...WEEKEND.nights.map((d) => (rec.days[d] ? rec.days[d].reduce((a, b) => a + (b || 0), 0) : 0)))
}
const WEEKEND_HUTS = huts.filter((h) => isBookable(h) && builtIds.has(h.id) && weekendFree(h) > 0)

function weekendPage(L, assets) {
  const groups = new Map()
  for (const h of WEEKEND_HUTS) groups.set(regionOf(h), [...(groups.get(regionOf(h)) || []), h])
  const regions = [...groups.keys()].sort((a, b) => groups.get(b).length - groups.get(a).length)
  // Most free beds first.
  const ordered = (r) => [...groups.get(r)].sort((a, b) => weekendFree(b) - weekendFree(a) || a.name.localeCompare(b.name, 'de'))
  const n = WEEKEND_HUTS.length
  const day = (iso) => L.date(iso, { weekday: 'short', day: 'numeric', month: 'short' })
  const range = `${day(WEEKEND.from)} – ${day(WEEKEND.to)}`
  const intro = [
    n ? L.t('page.weekend.intro', { count: n, n: L.nf(n), range }) : L.t('page.weekend.introNone', { range }),
    L.t('page.weekend.introFresh'),
    L.t('page.weekend.introUnknown'),
  ].join(' ')
  // Each card: the beds free every night of the weekend (the filters then show them per room type).
  const lineOf = (o) => {
    const f = weekendFree(o)
    return `<span>${gauge(f, 11)} ${esc(L.t('page.weekend.cardFree', { count: f, n: L.nf(f) }))}</span>`
  }
  const sections = regions
    .map((r) => {
      const name = r ? regionName(L, r) : L.t('region.other')
      const aside = hasRegionPage(r)
        ? `<a class="hp-more hf-tap-min" href="${regionPath(L.lang, r)}"><span class="hp-u">${esc(L.t('page.list.allIn', { region: name }))}</span>&nbsp;→</a>`
        : ''
      return listSection(L, { id: `weekend-${REGION_KEYS[r] || 'other'}`, kind: 'book', heading: name, list: ordered(r), aside, collapse: true, lineOf })
    })
    .join('')
  return listPage(L, {
    path: weekendPath,
    title: L.t('page.weekend.title'),
    desc: L.t('page.weekend.meta', { count: n, n: L.nf(n) }),
    h1: L.t('page.weekend.h1'),
    crumb: L.t('page.weekend.h1'),
    intro,
    listed: regions.flatMap(ordered),
    regions: regions.filter(Boolean),
    dates: { from: WEEKEND.from, to: WEEKEND.to },
    sections,
  }, assets)
}

// ---------------------------------------------------------------- page frame

// The header and footer every page shares: hut pages and region pages.
function siteHeader(L, other, otherPath) {
  const O = i18n(other)
  return (
    `<header class="hp-head"><div class="hp-wrap">` +
    `<a class="hp-mark" href="/" aria-label="${esc(L.t('page.home'))}"><img src="/h-line-600-light.svg" alt="Hüttenfinder" width="172" height="26"></a>` +
    `<div class="hp-head-links"><a class="hf-tap-min" href="/"><span class="hp-u hp-long">${esc(L.t('page.allHuts'))}</span><span class="hp-u hp-short">${esc(L.t('page.allHutsShort'))}</span></a>` +
    `<a class="hp-lang hf-tap-min" href="${otherPath}" hreflang="${other}" lang="${other}" aria-label="${esc(O.t('page.thisPageIn'))}">${icon('globe', 16, 1.8)}${other.toUpperCase()}</a></div>` +
    `</div></header>`
  )
}
// The footer's links to every region and list page, so each has links to it.
// `here`: the page's own address, marked as the current one.
function explore(L, here) {
  const item = (href, text) => `<li><a href="${href}"${href === here ? ' aria-current="page"' : ''}><span>${esc(text)}</span></a></li>`
  const group = (id, caption, items) =>
    `<div class="hf-explore-group"><span class="hf-explore-h" id="${id}">${esc(caption)}</span><ul aria-labelledby="${id}">${items.join('')}</ul></div>`
  return (
    `<nav class="hf-explore" aria-label="${esc(L.t('footer.exploreAria'))}">` +
    group('explore-regions', L.t('footer.regions'), REGIONS.map((r) => item(regionPath(L.lang, r), regionName(L, r)))) +
    group('explore-lists', L.t('footer.lists'), [
      item(dogsPath(L.lang), L.t('footer.dogs')),
      item(privPath(L.lang), L.t('footer.priv')),
      item(weekendPath(L.lang), L.t('footer.weekend')),
    ]) +
    `</nav>`
  )
}

function siteFooter(L, subject, wrongKey = 'page.footer.wrong', here = '') {
  return (
    `<footer class="hp-foot"><div class="hp-wrap hp-foot-explore">${explore(L, here)}</div><div class="hp-wrap"><div class="hp-foot-text">` +
    `<span>${esc(L.t('page.footer.data', { osm: '\u0000' })).replace('\u0000', '<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>')} ${esc(L.t('page.footer.check'))}</span>` +
    `<span>${esc(L.t(wrongKey, { email: '\u0000' })).replace('\u0000', `<a href="mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}">${CONTACT_EMAIL}</a>`)}</span>` +
    `</div><div class="hp-foot-links"><a href="/faq/">${esc(L.t('footer.faq'))}</a><a href="/imprint/">${esc(L.t('footer.imprint'))}</a><a href="/privacy/">${esc(L.t('footer.privacy'))}</a></div></div></footer>`
  )
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
      ...(hasRegionPage(regionOf(h)) ? [{ '@type': 'ListItem', position: 2, name: regionName(L, regionOf(h)), item: regionUrl(L.lang, regionOf(h)) }] : []),
      { '@type': 'ListItem', position: hasRegionPage(regionOf(h)) ? 3 : 2, name: h.name },
    ],
  }
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': [place, crumbs] }).replace(/</g, '\\u003c')
}

function page(L, h, assets) {
  const other = PAGE_LANGS.find((c) => c !== L.lang)
  const title = titleOf(L, h)
  const desc = descriptionOf(L, h)
  const url = pageUrl(L.lang, h)
  const ph = photos[h.id]
  const fig = figure(L, h)
  const b = band(L, h)
  const meta = [typeLabel(L, h), regionName(L, regionOf(h)), elevText(L, h)].filter(Boolean).join(' · ')

  const head = [
    '<meta charset="utf-8">',
    // Before anything renders, so parts that only work with JavaScript (the
    // folded text, the calendar pills) don't show for a moment first.
    "<script>document.documentElement.classList.add('hp-js')</script>",
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    ...(indexable(h) ? [] : ['<meta name="robots" content="noindex, follow">']),
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

  const header = siteHeader(L, other, pagePath(other, h))

  const crumbs =
    `<nav class="hp-crumbs" aria-label="${esc(L.t('page.crumbs'))}"><ol>` +
    `<li><a href="/">${esc(L.t('page.huts'))}</a></li>` +
    (regionOf(h) ? `<li>${hasRegionPage(regionOf(h)) ? `<a href="${regionPath(L.lang, regionOf(h))}">${esc(regionName(L, regionOf(h)))}</a>` : esc(regionName(L, regionOf(h)))}</li>` : '') +
    `<li aria-current="page">${esc(h.name)}</li></ol></nav>`

  const facts =
    `<div class="hp-facts"><div><h1 class="hp-name">${esc(h.name)}</h1>${meta ? `<p class="hp-meta">${esc(meta)}</p>` : ''}</div>` +
    `<div><p class="hp-summary">${esc(summary(L, h))}</p>${moreInfo(L, h)}</div>` +
    tagList(hutTags(L, h)) +
    contactLinks(L, h, b.skip) +
    b.html +
    `</div>`

  const footer = siteFooter(L, h.name)

  return (
    `<!doctype html>\n<html lang="${L.lang}">\n<head>\n${head}\n</head>\n<body>\n<div class="hp">` +
    header +
    `<main class="hp-wrap hp-main"><div>${crumbs}<div class="hp-top${fig ? '' : ' hp-top-solo'}">${facts}${fig}</div></div>` +
    bedsSection(L, h) +
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
  for (const h of built.filter(indexable)) {
    const alts = [...PAGE_LANGS.map((c) => [c, pageUrl(c, h)]), ['x-default', pageUrl(DEFAULT_LANG, h)]]
      .map(([c, u]) => `    <xhtml:link rel="alternate" hreflang="${c}" href="${u}"/>`)
      .join('\n')
    for (const c of PAGE_LANGS) urls.push(`  <url>\n    <loc>${pageUrl(c, h)}</loc>\n${alts}\n  </url>`)
  }
  for (const where of [...REGIONS.map((r) => (c) => regionPath(c, r)), dogsPath, privPath, weekendPath]) {
    const alts = [...PAGE_LANGS.map((c) => [c, SITE + where(c)]), ['x-default', SITE + where(DEFAULT_LANG)]]
      .map(([c, u]) => `    <xhtml:link rel="alternate" hreflang="${c}" href="${u}"/>`)
      .join('\n')
    for (const c of PAGE_LANGS) urls.push(`  <url>\n    <loc>${SITE + where(c)}</loc>\n${alts}\n  </url>`)
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
  const lists = [...REGIONS.map((r) => [(c) => regionPath(c, r), (L) => regionPage(L, r, assets)]), [dogsPath, (L) => dogsPage(L, assets)], [privPath, (L) => privPage(L, assets)], [weekendPath, (L) => weekendPage(L, assets)]]
  for (const [where, make] of lists) {
    for (const c of PAGE_LANGS) {
      const dir = path.join(DIST, where(c))
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'index.html'), make(i18n(c)))
    }
  }
  fs.writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap())
  fs.rmSync(path.join(DIST, 'hut-template'), { recursive: true, force: true })
  console.log(`Wrote ${pages} hut pages (${built.length} huts × ${PAGE_LANGS.length} languages), ${REGIONS.length * PAGE_LANGS.length} region pages, 3 list pages (dogs, private rooms, this weekend) in ${PAGE_LANGS.length} languages and sitemap.xml.`)
}
