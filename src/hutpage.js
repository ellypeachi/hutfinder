// Entry for the hut pages (/de/hut/<slug>/, /en/hut/<slug>/) and the region
// pages (/en/tyrol/). The pages are complete without this file; it adds the
// phone calendar's month switch, the region filters and the map, which loads
// only when it comes near the screen.
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/figtree'
import './tokens.css'
import './hut-page.css'
import { bedColor, gauge } from './gauge.js'

// The page's own inline script already set the hp-js class; this is for safety.
document.documentElement.classList.add('hp-js')

/* The phone calendar: one month at a time. Each month has its own arrows, so
   focus moves to the same arrow in the month that comes up. */
for (const cal of document.querySelectorAll('[data-months]')) {
  const months = [...cal.querySelectorAll('.hp-month')]
  let shown = 0
  const show = (n) => {
    shown = n
    months.forEach((m, k) => m.toggleAttribute('data-hidden', k !== n))
  }
  cal.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-step]')
    if (!btn || btn.disabled) return
    const step = Number(btn.dataset.step)
    const n = shown + step
    if (n < 0 || n >= months.length) return
    show(n)
    const same = months[n].querySelector(`[data-step="${step}"]`)
    const other = months[n].querySelector(`[data-step="${-step}"]`)
    ;(same && !same.disabled ? same : other)?.focus()
  })
  show(0)
}

/* Room type pills on the phone calendar. Any mix can be picked, and each day
   shows the free beds of the picked types added up. The last picked type
   can't be unpicked, so the calendar always shows something. */
for (const months of document.querySelectorAll('[data-months]')) {
  const pills = [...months.querySelectorAll('.hp-type')]
  const nf = new Intl.NumberFormat(months.dataset.locale)
  const full = months.dataset.full
  const redraw = () => {
    const picked = pills.filter((p) => p.getAttribute('aria-pressed') === 'true').map((p) => Number(p.dataset.i))
    for (const v of months.querySelectorAll('.hp-v')) {
      const beds = v.dataset.beds.split(',').map(Number)
      const n = picked.reduce((sum, i) => sum + beds[i], 0)
      const b = document.createElement('b')
      b.style.color = bedColor(n)
      b.textContent = n > 0 ? nf.format(n) : full
      v.innerHTML = gauge(n)
      v.append(b)
    }
  }
  for (const pill of pills) {
    pill.addEventListener('click', () => {
      const on = pill.getAttribute('aria-pressed') === 'true'
      if (on && pills.filter((p) => p.getAttribute('aria-pressed') === 'true').length === 1) return
      pill.setAttribute('aria-pressed', String(!on))
      redraw()
    })
  }
}

/* "View more information": the hut's own text opens above the button. */
for (const info of document.querySelectorAll('.hp-info')) {
  const btn = info.querySelector('.hp-info-btn')
  btn.addEventListener('click', () => {
    const open = !info.classList.contains('is-open')
    info.classList.toggle('is-open', open)
    btn.setAttribute('aria-expanded', String(open))
  })
}

/* The region pages' filters, only on a page that has them. */
const filters = document.querySelector('[data-filters]')
if (filters) import('./regionfilters.js').then((m) => m.init(filters))

/* The map. Leaflet and the tiles load only once the map is near the screen,
   so a visitor who reads the top of the page and books loads neither. */
const box = document.querySelector('[data-map]')
if (box) {
  let loading = null
  const load = () => (loading ||= import('./hutmap.js').then((m) => m.init(box)))
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect()
          load()
        }
      },
      { rootMargin: '400px' }
    )
    io.observe(box)
  } else {
    load()
  }
  const expand = document.querySelector('[data-expand]')
  if (expand) {
    expand.hidden = false
    expand.addEventListener('click', () => load().then((api) => api.open(expand)))
  }
}
