/* The region pages' filters (/en/tyrol/…): the app's filters, working on the
   cards already in the page. scripts/build_hut_pages.mjs renders the controls
   and the cards' data; this file makes them work.

   The rules are the app's (passes() in src/App.jsx). A hut that doesn't
   publish free beds or room types is unknown, not a no: it stays when dates
   or a room type are picked, and those huts are the "Ask the hut directly"
   section. Only huts known not to match drop out. */
import { bedColor, gauge } from './gauge.js'

const BUCKETS = ['dorm', 'shared', 'priv']
const MULTI = ['type', 'band'] // any mix can be picked; the other groups take one
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

  const st = { from: '', to: '', room: '', type: [], band: [], warden: '', assoc: '', shower: '' }
  let avail = null

  const huts = [...document.querySelectorAll('[data-hut]')].map((el) => ({
    el,
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

  /* With dates, a bookable card shows the free beds of those nights per room
     type, the fewest across them, as the app's cards do. Otherwise the line
     the page was built with: the next free date. */
  const drawLine = (h, nights) => {
    if (!h.line) return
    const rec = recOf(h)
    if (!nights.length || !rec || !rec.caps) {
      if (h.line.innerHTML !== h.lineHTML) h.line.innerHTML = h.lineHTML
      return
    }
    const mins = [Infinity, Infinity, Infinity]
    for (const d of nights) {
      const a = night(rec, d)
      if (!a) return void (h.line.innerHTML = h.lineHTML)
      for (let i = 0; i < 3; i++) mins[i] = Math.min(mins[i], a[i] || 0)
    }
    const range = st.to ? `${fmt(st.from)}–${fmt(st.to)}` : fmt(st.from)
    const rows = BUCKETS.map((k, i) => {
      if (!(rec.caps[i] > 0)) return ''
      const n = mins[i]
      return `<span class="hp-free-row"><span>${gauge(n)}${t(`bucket.${k}`)}</span><b style="color:${bedColor(n)}">${n > 0 ? t('avail.beds', { count: n, n: nf(n) }) : t('avail.full')}</b></span>`
    }).join('')
    h.line.innerHTML =
      `<span class="hp-free"><b>${t('avail.free', { range })}</b>${nights.length > 1 ? `<span>${t('avail.fewest')}</span>` : ''}</span>${rows}`
  }

  const pills = [...root.querySelectorAll('.hp-pill')]
  const moreBtn = root.querySelector('.hp-morebtn')
  const badge = moreBtn.querySelector('.hp-badge')
  const applied = moreBtn.querySelector('[data-applied]')
  const chips = root.querySelector('[data-chips]')
  const clearAll = root.querySelector('[data-clearall]')
  const clearMore = root.querySelector('[data-clearmore]')
  const show = root.querySelector('[data-show]')

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
      s.empty.hidden = n > 0
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
    if (cal.open) closeCal(cal.mode)
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
        moreBtn.focus({ preventScroll: true })
      }
      update()
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
