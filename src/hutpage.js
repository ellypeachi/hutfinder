// Entry for the hut pages (/de/hut/<slug>/, /en/hut/<slug>/). The pages are
// complete without this file; it adds the phone calendar's month switch and
// the map, which loads only when it comes near the screen.
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/figtree'
import './tokens.css'
import './hut-page.css'

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
