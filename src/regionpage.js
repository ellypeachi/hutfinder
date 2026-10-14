/* The region pages (/en/tyrol/…): the app's filters, working on the cards
   already in the page, and the app's hut pop-up when a card is clicked.
   scripts/build_hut_pages.mjs renders the controls and the cards' data;
   this file makes them work.

   The rules are the app's (passes() in src/App.jsx). A hut that doesn't
   publish free beds or room types is unknown, not a no: it stays when dates
   or a room type are picked, and those huts are the "Ask the hut directly"
   section. Only huts known not to match drop out. */
import { bedColor, gauge } from './gauge.js'

const BUCKETS = ['dorm', 'shared', 'priv']
const MULTI = ['region', 'type', 'band'] // any mix can be picked; the other groups take one
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

// Dates are ISO strings ("2026-10-17") everywhere but here, at local midnight.
const pad = (n) => String(n).padStart(2, '0')
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseISO = (s) => (s ? new Date(`${s}T00:00:00`) : null)
const addDays = (d, n) => {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}
const fmt = (s) => s.split('-').reverse().join('.')
const firstOfMonth = (d) => new Date(d.getFullYear(), d.getMonth(), 1)

export function init(root) {
  const cfg = JSON.parse(root.querySelector('script[type="application/json"]').textContent)
  const plural = new Intl.PluralRules(cfg.locale)
  const t = (key, vars) => {
    let s = cfg.strings[key] ?? key
    if (typeof s === 'object') s = s[plural.select(Number(vars?.count ?? 0))] ?? s.other
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s
  }
  const nf = (n) => Number(n).toLocaleString(cfg.numLocale)
  const monthName = (d) => new Intl.DateTimeFormat(cfg.locale, { month: 'long' }).format(d)
  const dows = (() => {
    const f = new Intl.DateTimeFormat(cfg.locale, { weekday: 'short' })
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2021, 1, i + 1)).replace(/\./g, '').slice(0, 2))
  })()

  const st = { from: '', to: '', region: [], room: '', type: [], band: [], warden: '', assoc: '', shower: '' }
  let avail = null

  const huts = [...document.querySelectorAll('[data-hut]')].map((el) => ({
    el,
    region: el.dataset.region,
    type: el.dataset.type,
    band: el.dataset.band,
    warden: el.dataset.warden,
    assoc: el.dataset.assoc,
    shower: 'shower' in el.dataset,
    beds: el.dataset.beds == null ? null : Number(el.dataset.beds),
    hr: el.dataset.hr || null,
    line: el.querySelector('.hp-avail'),
  }))
  for (const h of huts) if (h.line) h.lineHTML = h.line.innerHTML
  const sections = [...document.querySelectorAll('[data-section]')].map((el) => ({
    el,
    kind: el.dataset.section,
    collapse: 'collapse' in el.dataset,
    count: el.querySelector('[data-count]'),
    note: el.querySelector('[data-note]'),
    empty: el.querySelector('[data-empty]'),
    huts: huts.filter((h) => el.contains(h.el)),
  }))

  // ---------------------------------------------------------------- the rules

  // `to` is the check-out day, so not a night; no `to` is a single night.
  const nightsOf = () => {
    if (!st.from) return []
    const end = st.to && st.to > st.from ? parseISO(st.to) : addDays(parseISO(st.from), 1)
    const list = []
    for (let d = parseISO(st.from); d < end && list.length < cfg.maxNights; d = addDays(d, 1)) list.push(toISO(d))
    return list
  }
  const recOf = (h) => (h.hr && avail && avail.huts ? avail.huts[h.hr] || null : null)
  const night = (rec, d) => (rec && rec.days && d in rec.days ? rec.days[d] : null)
  const roomOk = (rec, i, nights) => {
    if (!nights.length) return !!(rec.caps && rec.caps[i] > 0)
    return nights.every((d) => {
      const a = night(rec, d)
      return a && a[i] > 0
    })
  }
  const passes = (h, nights, skip) => {
    if (skip !== 'region' && st.region.length && !st.region.includes(h.region)) return false
    if (skip !== 'type' && st.type.length && !st.type.includes(h.type)) return false
    if (skip !== 'band' && st.band.length && !st.band.includes(h.band)) return false
    if (skip !== 'warden' && st.warden && h.warden !== st.warden) return false
    if (skip !== 'assoc' && st.assoc && h.assoc !== st.assoc) return false
    if (skip !== 'shower' && st.shower && !h.shower) return false
    if (nights.length) {
      const rec = recOf(h)
      if (!rec) {
        // Unknown stays, unless the hut is known to have no beds at all.
        if (!avail || h.beds === 0) return false
      } else if (!nights.every((d) => {
        const a = night(rec, d)
        return a && (a[0] || 0) + (a[1] || 0) + (a[2] || 0) > 0
      })) return false
    }
    if (skip !== 'room' && st.room) {
      const rec = recOf(h)
      if (rec && !roomOk(rec, BUCKETS.indexOf(st.room), nights)) return false
    }
    return true
  }
  const matches = (h, g, v, nights) => {
    if (g === 'room') {
      const rec = recOf(h)
      return !!rec && roomOk(rec, BUCKETS.indexOf(v), nights)
    }
    if (g === 'shower') return h.shower
    return h[g] === v
  }
  const isOn = (g, v) => (MULTI.includes(g) ? (v ? st[g].includes(v) : !st[g].length) : v ? st[g] === v : !st[g])
  const pick = (g, v) => {
    if (MULTI.includes(g)) st[g] = !v ? [] : st[g].includes(v) ? st[g].filter((x) => x !== v) : [...st[g], v]
    else st[g] = !v || st[g] === v ? '' : v
  }
  const moreCount = () => [st.warden, st.assoc, st.shower].filter(Boolean).length + [st.type, st.band].filter((a) => a.length).length

  // ---------------------------------------------------------------- drawing

  /* With dates, the free beds of those nights per room type, the fewest
     across them, as the app's cards and pop-up show them. Null without dates
     or without the hut's free beds. */
  const bedsHTML = (rec, nights) => {
    if (!nights.length || !rec || !rec.caps) return null
    const mins = [Infinity, Infinity, Infinity]
    for (const d of nights) {
      const a = night(rec, d)
      if (!a) return null
      for (let i = 0; i < 3; i++) mins[i] = Math.min(mins[i], a[i] || 0)
    }
    const range = st.to ? `${fmt(st.from)}–${fmt(st.to)}` : fmt(st.from)
    const rows = BUCKETS.map((k, i) => {
      if (!(rec.caps[i] > 0)) return ''
      const n = mins[i]
      return `<span class="hp-free-row"><span>${gauge(n)}${t(`bucket.${k}`)}</span><b style="color:${bedColor(n)}">${n > 0 ? t('avail.beds', { count: n, n: nf(n) }) : t('avail.full')}</b></span>`
    }).join('')
    return `<span class="hp-free"><b>${t('avail.free', { range })}</b>${nights.length > 1 ? `<span>${t('avail.fewest')}</span>` : ''}</span>${rows}`
  }
  // A card keeps the line the page was built with (the next free date) until dates are picked.
  const drawLine = (h, nights) => {
    if (!h.line) return
    const html = bedsHTML(recOf(h), nights) ?? h.lineHTML
    if (h.line.innerHTML !== html) h.line.innerHTML = html
  }

  const pills = [...root.querySelectorAll('.hp-pill')]
  const moreBtn = root.querySelector('.hp-morebtn')
  const badge = moreBtn.querySelector('.hp-badge')
  const applied = moreBtn.querySelector('[data-applied]')
  const chips = root.querySelector('[data-chips]')
  const clearAll = root.querySelector('[data-clearall]')
  const clearMore = root.querySelector('[data-clearmore]')
  const show = root.querySelector('[data-show]')
  const unfiltered = document.querySelectorAll('[data-unfiltered]')
  const none = document.querySelector('[data-none]')

  function update() {
    const nights = nightsOf()
    let total = 0
    for (const s of sections) {
      let n = 0
      for (const h of s.huts) {
        const ok = passes(h, nights)
        h.el.hidden = !ok
        if (ok) n++
        drawLine(h, nights)
      }
      total += n
      s.count.textContent = nf(n)
      // One of several sections of the same kind (the regions of the dogs page) goes when empty.
      if (s.collapse) s.el.hidden = !n
      s.empty.hidden = n > 0 || s.collapse
      if (!n) {
        s.empty.textContent =
          s.kind === 'book' && nights.length
            ? nights.length === 1 ? t('empty.nothingFreeNight') : t('empty.nothingFreeNights', { n: nights.length })
            : t('empty.noMatch')
      }
      // What the filters can't know about the huts that don't publish it.
      const rooms = st.room ? t(`bucketPlural.${st.room}`) : ''
      const note =
        s.kind === 'contact' && n
          ? nights.length
            ? st.room ? t('unlisted.noteDatesRoom', { rooms }) : t('unlisted.noteDates')
            : st.room ? t('unlisted.noteRoom', { rooms }) : ''
          : ''
      s.note.hidden = !note
      s.note.textContent = note
    }

    for (const p of pills) {
      const { g, v } = p.dataset
      const on = isOn(g, v)
      p.setAttribute('aria-pressed', String(on))
      if (!v) continue
      // Room types are counted once the free beds have loaded.
      const n = g === 'room' && !avail ? null : huts.filter((h) => passes(h, nights, g) && matches(h, g, v, nights)).length
      p.querySelector('.hp-pill-n').textContent = n == null ? '' : nf(n)
      p.classList.toggle('is-empty', n === 0 && !on)
    }

    const m = moreCount()
    // Clear in the phone layer only once there is something to clear; it keeps its place.
    clearMore.style.visibility = m ? '' : 'hidden'
    badge.hidden = !m
    badge.textContent = nf(m)
    applied.textContent = m ? t('more.applied', { count: m, n: nf(m) }) : ''

    const on = pills.filter((p) => p.dataset.v && isOn(p.dataset.g, p.dataset.v))
    chips.innerHTML = on
      .map((p) => `<button type="button" class="hp-chip hf-tap" data-g="${p.dataset.g}" data-v="${p.dataset.v}" aria-label="${escAttr(t('chip.removeAria', { label: p.dataset.chip }))}">${escHTML(p.dataset.chip)}<span aria-hidden="true">×</span></button>`)
      .join('')
    clearAll.hidden = !on.length
    // The huts the page doesn't list aren't filtered, so their line goes while anything is.
    for (const el of unfiltered) el.hidden = !!(on.length || st.from)
    if (none) {
      none.hidden = total > 0
      none.textContent = nights.length
        ? nights.length === 1 ? t('empty.nothingFreeNight') : t('empty.nothingFreeNights', { n: nights.length })
        : t('empty.noMatch')
    }
    show.textContent = t('more.show', { count: total, n: nf(total) })
  }

  // ---------------------------------------------------------------- dates

  const dates = root.querySelector('.hp-fdates')
  const fields = { start: root.querySelector('[data-field="start"]'), end: root.querySelector('[data-field="end"]') }
  const dclear = root.querySelector('[data-dclear]')
  const dstatus = root.querySelector('[data-dstatus]')
  const calEl = root.querySelector('[data-cal]')
  const today = (() => {
    const n = new Date()
    return new Date(n.getFullYear(), n.getMonth(), n.getDate())
  })()
  const cal = { open: false, mode: 'start', hover: '', cursor: firstOfMonth(today) }
  const narrow = () => root.clientWidth < 600

  function drawFields() {
    for (const [which, el] of Object.entries(fields)) {
      const v = which === 'start' ? st.from : st.to
      const val = el.querySelector('.hp-dval')
      val.textContent = v ? fmt(v) : t('date.add')
      el.classList.toggle('is-set', !!v)
      const active = cal.open && cal.mode === which
      el.classList.toggle('is-active', active)
      el.setAttribute('aria-expanded', String(active))
    }
    dclear.hidden = !st.from && !st.to
    const n = st.from && st.to ? nightsOf().length : 0
    dstatus.innerHTML = n
      ? `<strong>${escHTML(t('date.nights', { count: n, n }))}</strong> · ${fmt(st.from)}–${fmt(st.to)}`
      : escHTML(st.from ? t('date.checkInPending', { date: fmt(st.from) }) : t('date.noDates'))
  }

  // The month grids, built when the calendar opens or changes month.
  function buildCal() {
    const months = narrow() ? 1 : 2
    const grid = (first) => {
      const lead = (first.getDay() + 6) % 7 // weeks start on Monday
      const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()
      let cells = '<span aria-hidden="true"></span>'.repeat(lead)
      for (let n = 1; n <= last; n++) {
        const d = new Date(first.getFullYear(), first.getMonth(), n)
        cells += `<button type="button" class="hp-pday hf-tap${+d === +today ? ' is-today' : ''}" data-iso="${toISO(d)}">${n}</button>`
      }
      return (
        `<div class="hp-calmonth"><div class="hp-calname">${escHTML(monthName(first))} ${first.getFullYear()}</div>` +
        `<div class="hp-caldow" aria-hidden="true">${dows.map((x) => `<span>${escHTML(x)}</span>`).join('')}</div>` +
        `<div class="hp-caldays">${cells}</div></div>`
      )
    }
    const firsts = Array.from({ length: months }, (_, i) => new Date(cal.cursor.getFullYear(), cal.cursor.getMonth() + i, 1))
    calEl.innerHTML =
      `<div class="hp-calnav"><button type="button" class="hp-calstep hf-tap" data-step="-1" aria-label="${escAttr(t('date.prevMonth'))}">‹</button>` +
      `<button type="button" class="hp-calstep hf-tap" data-step="1" aria-label="${escAttr(t('date.nextMonth'))}">›</button></div>` +
      `<div class="hp-calmonths">${firsts.map(grid).join('')}</div><p class="hp-calhint" role="status"></p>`
    paintCal()
  }

  // Which days are picked, in range or out of reach; the grids stay, so focus does too.
  function paintCal() {
    const start = st.from
    const limit = start ? toISO(addDays(parseISO(start), cfg.maxNights)) : ''
    const tail = st.to || (cal.mode === 'end' && cal.hover && start && cal.hover > start ? cal.hover : '')
    const solo = !start || !tail || start === tail
    const mode = cal.mode === 'end' ? t('date.checkOut') : t('date.checkIn')
    for (const b of calEl.querySelectorAll('.hp-pday')) {
      const iso = b.dataset.iso
      const d = parseISO(iso)
      b.disabled = d < today || (cal.mode === 'end' && !!start && (iso < start || iso > limit))
      const edge = iso === start || iso === tail
      b.classList.toggle('is-edge', edge)
      b.classList.toggle('is-in', !!start && !!tail && iso > start && iso < tail)
      b.classList.toggle('is-first', edge && !solo && iso === start)
      b.classList.toggle('is-last', edge && !solo && iso === tail)
      b.setAttribute('aria-pressed', String(edge))
      b.setAttribute('aria-label', t('date.dayAria', { mode, day: d.getDate(), month: monthName(d), year: d.getFullYear() }))
    }
    calEl.querySelector('[data-step="-1"]').disabled = cal.cursor <= firstOfMonth(today)
    calEl.querySelector('.hp-calhint').textContent =
      cal.mode === 'start' ? t('date.pickCheckIn') : t('date.pickCheckOut', { n: cfg.maxNights })
  }

  function openCal(which) {
    const again = cal.open && cal.mode === which
    cal.mode = which === 'end' && !st.from ? 'start' : which
    cal.open = !again
    calEl.hidden = !cal.open
    if (cal.open) buildCal()
    drawFields()
  }
  function closeCal(focus) {
    if (!cal.open) return
    cal.open = false
    calEl.hidden = true
    if (focus) fields[focus].focus({ preventScroll: true })
    drawFields()
  }
  function pickDay(iso) {
    const start = st.from
    if (cal.mode === 'start' || !start || iso < start) {
      // Check-in set; the calendar stays open for check-out.
      st.from = iso
      st.to = ''
      cal.mode = 'end'
      cal.hover = ''
      paintCal()
    } else {
      st.to = iso === start ? toISO(addDays(parseISO(iso), 1)) : iso
      cal.mode = 'start'
      cal.hover = ''
      closeCal('end')
    }
    drawFields()
    update()
  }

  for (const [which, el] of Object.entries(fields)) el.addEventListener('click', () => openCal(which))
  dclear.addEventListener('click', () => {
    st.from = st.to = ''
    cal.mode = 'start'
    closeCal('start')
    update()
  })
  calEl.addEventListener('click', (e) => {
    const step = e.target.closest('[data-step]')
    if (step && !step.disabled) {
      const n = Number(step.dataset.step)
      cal.cursor = new Date(cal.cursor.getFullYear(), cal.cursor.getMonth() + n, 1)
      buildCal()
      const again = calEl.querySelector(`[data-step="${n}"]`)
      ;(again.disabled ? calEl.querySelector(`[data-step="${-n}"]`) : again).focus()
      return
    }
    const day = e.target.closest('.hp-pday')
    if (day && !day.disabled) pickDay(day.dataset.iso)
  })
  // The range follows the pointer while check-out is being picked.
  calEl.addEventListener('mouseover', (e) => {
    const day = e.target.closest('.hp-pday')
    if (cal.mode !== 'end' || !day || day.dataset.iso === cal.hover) return
    cal.hover = day.dataset.iso
    paintCal()
  })
  calEl.addEventListener('mouseleave', () => {
    if (!cal.hover) return
    cal.hover = ''
    paintCal()
  })
  document.addEventListener('pointerdown', (e) => {
    if (cal.open && !dates.contains(e.target) && !calEl.contains(e.target)) closeCal()
  })

  // ---------------------------------------------------------------- More filters

  /* An inline panel where there is room; on a phone a full-screen layer
     that keeps Tab inside, with the count on the button that closes it. */
  const panel = root.querySelector('#more-filters')
  function openMore() {
    panel.classList.toggle('is-layer', narrow())
    if (narrow()) {
      panel.setAttribute('role', 'dialog')
      panel.setAttribute('aria-modal', 'true')
      document.documentElement.classList.add('hp-locked')
    }
    panel.hidden = false
    moreBtn.setAttribute('aria-expanded', 'true')
    if (narrow()) panel.focus()
  }
  function closeMore() {
    if (panel.hidden) return
    panel.hidden = true
    panel.removeAttribute('role')
    panel.removeAttribute('aria-modal')
    document.documentElement.classList.remove('hp-locked')
    moreBtn.setAttribute('aria-expanded', 'false')
    moreBtn.focus({ preventScroll: true })
  }
  moreBtn.addEventListener('click', () => (panel.hidden ? openMore() : closeMore()))
  panel.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !panel.classList.contains('is-layer')) return
    const stops = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null)
    if (!stops.length) return
    const first = stops[0]
    const last = stops[stops.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  })
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (current) closePop()
    else if (cal.open) closeCal(cal.mode)
    else closeMore()
  })

  root.addEventListener('click', (e) => {
    const p = e.target.closest('.hp-pill, .hp-chip')
    if (p) {
      if (p.classList.contains('hp-chip')) {
        // The chip goes with the click; focus moves on to the next one, or to More filters.
        const next = p.nextElementSibling || p.previousElementSibling
        pick(p.dataset.g, p.dataset.v)
        update()
        const same = next && chips.querySelector(`[data-g="${next.dataset.g}"][data-v="${next.dataset.v}"]`)
        ;(same || moreBtn).focus({ preventScroll: true })
      } else {
        pick(p.dataset.g, p.dataset.v)
        update()
      }
      return
    }
    if (e.target.closest('[data-close]')) closeMore()
    else if (e.target.closest('[data-clearmore]') || e.target.closest('[data-clearall]')) {
      Object.assign(st, { type: [], band: [], warden: '', assoc: '', shower: '' })
      if (e.target.closest('[data-clearall]')) {
        st.room = ''
        st.region = []
        moreBtn.focus({ preventScroll: true })
      }
      update()
    }
  })

  // ---------------------------------------------------------------- the hut pop-up

  /* A plain click on a card opens the app's pop-up, and the name in it opens
     the hut's page. A click for a new tab, or a middle click, is left to the
     browser, so the card is still a link to the page. */
  const popData = document.querySelector('script[data-pop]')
  const pops = popData ? JSON.parse(popData.textContent) : {}
  const ICON = {
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  }
  const svg = (name) =>
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" style="flex-shrink:0">${ICON[name]}</svg>`
  const chevron =
    '<svg class="hf-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7"/></svg>'
  const pageLang = document.documentElement.lang
  const TEXT_LANGS = ['de', 'en', 'fr', 'it'] // the languages huts write their own text in
  let texts = null
  let textsLoading = null
  const loadTexts = () =>
    (textsLoading ||= fetch(root.dataset.texts)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => (texts = (d && d.texts) || {}))
      .catch(() => (texts = {})))
  // The texts arrive as HTML; a parsed document is inert, so reading its text is safe.
  const plain = (html) => (new DOMParser().parseFromString(html, 'text/html').body.textContent || '').replace(/\s+/g, ' ').trim()

  const back = document.createElement('div')
  back.className = 'hp-pop-back'
  back.hidden = true
  back.innerHTML = '<div class="hp-pop" role="dialog" aria-modal="true" tabindex="-1"></div>'
  ;(document.querySelector('.hp') || document.body).append(back)
  const box = back.firstChild
  let current = null // the open hut, and what gets focus back
  let closeTimer = 0
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const nextFreeHTML = (rec) => {
    if (!rec) return ''
    const today = toISO(new Date())
    for (const d of Object.keys(rec.days || {}).sort()) {
      const a = rec.days[d]
      const n = (a[0] || 0) + (a[1] || 0) + (a[2] || 0)
      if (d >= today && n > 0) return `<span>${gauge(n, 11)} ${escHTML(t('avail.nextFree', { date: fmt(d), n: nf(n) }))}</span>`
    }
    return `<span>${escHTML(t('avail.none'))}</span>`
  }
  // Two lines of the hut's own text, then Read more, as in the app.
  const descHTML = (o) => {
    const e = o.txt && texts && texts[o.hr]
    const code = e && [pageLang, 'en', ...TEXT_LANGS].find((c) => e[c])
    const text = code ? plain(e[code]) : ''
    if (!text) return ''
    return (
      `<div><div class="hf-label">${escHTML(t('detail.description'))}</div><div class="hf-desc-wrap">` +
      `<p class="hf-desc"${code !== pageLang ? ` lang="${code}"` : ''}><button type="button" class="hf-more" aria-expanded="false"><span>${escHTML(t('detail.readMore'))}</span></button>${escHTML(text)}</p></div></div>`
    )
  }
  // Not bookable online: the phone number is the next step, so it is the button.
  const callBand = (o) => {
    const a = o.tel
      ? `<a href="${escAttr(o.tel[0])}" class="hf-call hf-tap" aria-label="${escAttr(t('call.aria', { hut: o.n, phone: o.tel[1] }))}">${svg('phone')}${escHTML(t('call.label', { phone: o.tel[1] }))}</a>`
      : o.web
        ? `<a href="${escAttr(o.web[0])}" target="_blank" rel="noopener" class="hf-call hf-tap" aria-label="${escAttr(t('contact.websiteAria', { hut: o.n, host: o.web[1] }))}">${svg('globe')}${escHTML(t('contact.website'))}</a>`
        : o.mail
          ? `<a href="mailto:${escAttr(o.mail)}" class="hf-call hf-tap" aria-label="${escAttr(t('contact.emailAria', { hut: o.n, email: o.mail }))}">${svg('mail')}${escHTML(t('contact.email'))}</a>`
          : ''
    return a ? `<div class="hf-detail-band"><div class="hf-card-band hf-card-band-row">${a}<span>${escHTML(t('band.notBookable'))}</span></div></div>` : ''
  }

  function render(id) {
    const o = pops[id]
    const rec = o.hr && avail && avail.huts ? avail.huts[o.hr] || null : null
    const name = o.u
      ? `<a href="${escAttr(o.u)}" class="hf-detail-namelink" aria-label="${escAttr(t('detail.hutPageAria', { hut: o.n }))}"><span>${escHTML(o.n)}</span>${chevron}</a>`
      : escHTML(o.n)
    const contact = [
      o.tel && `<a href="${escAttr(o.tel[0])}" class="hf-tap-min" aria-label="${escAttr(t('call.aria', { hut: o.n, phone: o.tel[1] }))}">${svg('phone')}<span>${escHTML(o.tel[1])}</span></a>`,
      o.web && `<a href="${escAttr(o.web[0])}" target="_blank" rel="noopener" class="hf-tap-min" aria-label="${escAttr(t('contact.websiteAria', { hut: o.n, host: o.web[1] }))}">${svg('globe')}<span>${escHTML(o.web[1])}</span></a>`,
      o.mail && `<a href="mailto:${escAttr(o.mail)}" class="hf-tap-min" aria-label="${escAttr(t('contact.emailAria', { hut: o.n, email: o.mail }))}">${svg('mail')}<span>${escHTML(o.mail)}</span></a>`,
    ].filter(Boolean)
    let body = `<div><h2 class="hf-detail-name">${name}</h2><div class="hf-card-meta">${escHTML(o.m)}</div></div>`
    if (contact.length) body += `<div class="hf-contact">${contact.join('')}</div>`
    if (o.tags.length) body += `<ul class="hf-tags">${o.tags.map(([l, club]) => `<li class="hf-tag${club ? ' hf-tag-club' : ''}">${escHTML(l)}</li>`).join('')}</ul>`
    body += descHTML(o)
    if (o.book) {
      // The free beds of the picked nights, or else the next free date.
      const beds = bedsHTML(rec, nightsOf()) ?? (avail ? nextFreeHTML(rec) : '')
      body +=
        `<div class="hp-pop-book"><div class="hp-pop-bookrow">` +
        `<a class="hp-btn" href="${escAttr(o.book)}" target="_blank" rel="noopener" aria-label="${escAttr(t('book.aria', { hut: o.n }))}">${escHTML(t('book.online'))}</a>` +
        (o.x ? `<span>${escHTML(o.x)}</span>` : '') +
        (o.pdf ? `<a class="hp-pop-pdf hf-tap" href="${escAttr(o.pdf)}" target="_blank" rel="noopener" aria-label="${escAttr(t('detail.priceListAria', { hut: o.n }))}"><span class="hp-u">${escHTML(t('detail.priceList'))}</span></a>` : '') +
        `</div>${beds ? `<div class="hp-avail hp-pop-avail">${beds}</div>` : ''}</div>`
    } else body += callBand(o)
    box.setAttribute('aria-label', o.n)
    box.innerHTML =
      `<button type="button" class="hf-close hp-pop-x${o.p ? ' on-photo' : ''}" aria-label="${escAttr(t('detail.closeAria', { hut: o.n }))}"><span aria-hidden="true">×</span></button>` +
      // The credit is HTML from build_hut_pages.mjs, escaped there.
      (o.p ? `<img class="hf-detail-photo" src="${escAttr(o.p)}" width="420" height="220" alt="${escAttr(o.n)}"><p class="hf-credit">${o.c}</p>` : '') +
      `<div class="hp-pop-body${o.p ? '' : ' no-photo'}">${body}</div>`
    // Read more only where the two lines actually cut the text off.
    const p = box.querySelector('.hf-desc')
    if (p && p.scrollHeight <= p.clientHeight + 1) p.querySelector('.hf-more').remove()
  }

  function openPop(id, trigger) {
    clearTimeout(closeTimer)
    current = { id, trigger }
    back.hidden = false
    document.documentElement.classList.add('hp-locked')
    render(id)
    box.scrollTop = 0
    requestAnimationFrame(() => back.classList.add('is-open'))
    box.focus({ preventScroll: true })
    if (pops[id].txt && !texts) loadTexts().then(() => current && current.id === id && render(id))
  }
  function closePop() {
    if (!current) return
    const { trigger } = current
    current = null
    back.classList.remove('is-open')
    document.documentElement.classList.remove('hp-locked')
    if (trigger && document.contains(trigger)) trigger.focus({ preventScroll: true })
    closeTimer = setTimeout(() => {
      back.hidden = true
      box.innerHTML = ''
    }, reduced() ? 0 : 150)
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-hut] .hp-card-link')
    if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    const id = a.closest('[data-hut]').dataset.id
    if (!pops[id]) return
    e.preventDefault()
    openPop(id, a)
  })
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('.hp-pop-x')) return closePop()
    const more = e.target.closest('.hf-more')
    if (!more) return
    const p = more.closest('.hf-desc')
    const open = !p.classList.contains('is-open')
    p.classList.toggle('is-open', open)
    more.setAttribute('aria-expanded', String(open))
    more.firstChild.textContent = open ? t('detail.showLess') : t('detail.readMore')
    if (open) p.append(more)
    else p.prepend(more)
  })
  // Tab stays inside the pop-up while it is open.
  box.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return
    const stops = [...box.querySelectorAll(FOCUSABLE)]
    if (!stops.length) return
    const first = stops[0]
    const last = stops[stops.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  })

  // ---------------------------------------------------------------- start

  /* Two months side by side, or one on a phone: rebuilt if the width
     crosses over while the calendar is open. */
  let wasNarrow = narrow()
  new ResizeObserver(() => {
    if (narrow() === wasNarrow) return
    wasNarrow = narrow()
    if (cal.open) buildCal()
    if (!panel.hidden) {
      closeMore()
      openMore()
    }
  }).observe(root)

  root.classList.add('is-ready')
  drawFields()
  update()
  fetch(root.dataset.avail)
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data || !data.huts) throw new Error('no availability')
      avail = data
      const asof = root.querySelector('[data-asof]')
      if (data.generated) {
        const time = new Date(data.generated).toLocaleString(cfg.locale, {
          timeZone: 'Europe/Vienna', day: '2-digit', month: '2-digit', year: 'numeric',
          hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
        })
        asof.textContent = t('avail.asOf', { time })
      }
      update()
    })
    // Without the free beds, dates and room types can't filter anything.
    .catch(() => root.classList.add('no-avail'))
}

const escHTML = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])
const escAttr = (s) => escHTML(s).replace(/"/g, '&quot;')
