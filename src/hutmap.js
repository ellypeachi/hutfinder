// The map on a hut page: the hut and the huts nearby, on the same tiles as the
// app (basemap.at inside Austria, OpenStreetMap under it; privacy/index.html
// names both). Loaded by src/hutpage.js when the map comes near the screen.
import 'leaflet/dist/leaflet.css'
import './map.css'
import L from 'leaflet'

const AT_BOUNDS = [
  [46.35877, 8.782379],
  [49.037872, 17.189532],
]
const WORLD_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const WORLD_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
const AUSTRIA_URL = 'https://mapsneu.wien.gv.at/basemap/geolandbasemap/normal/google3857/{z}/{y}/{x}.png'
// Required by basemap.at's CC BY licence.
const AUSTRIA_ATTR = 'Datenquelle: <a href="https://basemap.at" target="_blank" rel="noopener">basemap.at</a>'

const token = (name, fallback) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback

export function init(box) {
  const data = JSON.parse(box.querySelector('script[type="application/json"]').textContent)
  const el = box.querySelector('.hp-map')
  const pin = token('--map-pin', '#35648F')
  const muted = token('--map-pin-muted', '#9C8B7D')
  const ink = token('--ink', '#3A2A20')

  /* On the page the map stays still under a scrolling finger or wheel, so it
     never traps the scroll; expanded, it moves like any map. */
  const map = L.map(el, {
    preferCanvas: true,
    zoomControl: false,
    scrollWheelZoom: false,
    dragging: !L.Browser.mobile,
    attributionControl: true,
  })
  L.tileLayer(WORLD_URL, { attribution: WORLD_ATTR, maxZoom: 19 }).addTo(map)
  L.tileLayer(AUSTRIA_URL, { attribution: AUSTRIA_ATTR, maxZoom: 19, bounds: AT_BOUNDS }).addTo(map)
  L.control.zoom({ position: 'bottomright' }).addTo(map)

  const all = [data.self, ...data.near]
  for (const h of data.near) {
    const m = L.circleMarker([h.lat, h.lng], {
      radius: h.bookable ? 6 : 5,
      color: '#fff',
      weight: 1,
      fillColor: h.bookable ? pin : muted,
      fillOpacity: 1,
    })
      .bindTooltip(h.name, { permanent: true, direction: 'right', offset: [6, 0] })
      .addTo(map)
    if (h.url) m.on('click', () => (location.href = h.url))
  }
  L.circleMarker([data.self.lat, data.self.lng], {
    radius: 22,
    stroke: false,
    fillColor: pin,
    fillOpacity: 0.25,
    interactive: false,
  }).addTo(map)
  L.circleMarker([data.self.lat, data.self.lng], {
    radius: 8,
    color: '#fff',
    weight: 2,
    fillColor: pin,
    fillOpacity: 1,
  })
    .bindTooltip(`<b style="color:${ink}">${escapeHtml(data.self.name)}</b>`, {
      permanent: true,
      direction: 'right',
      offset: [10, 0],
    })
    .addTo(map)

  // Room on the right for the names, which sit to the right of their pins.
  const fit = () =>
    map.fitBounds(L.latLngBounds(all.map((h) => [h.lat, h.lng])), { paddingTopLeft: [40, 56], paddingBottomRight: [150, 40], maxZoom: 13 })
  fit()

  /* Expand: the same map, full screen. Everything else on the page goes
     inert while it is open, Escape closes it, and focus returns to the
     button that opened it. */
  const close = box.querySelector('.hp-map-close')
  let opener = null
  let inerted = []
  const setOpen = (open) => {
    box.classList.toggle('is-open', open)
    close.hidden = !open
    if (open) {
      inerted = []
      for (let n = box; n && n !== document.body; n = n.parentElement) {
        for (const sib of n.parentElement.children) {
          if (sib !== n && !sib.inert) {
            sib.inert = true
            inerted.push(sib)
          }
        }
      }
      map.scrollWheelZoom.enable()
      map.dragging.enable()
      document.documentElement.style.overflow = 'hidden'
    } else {
      inerted.forEach((n) => (n.inert = false))
      map.scrollWheelZoom.disable()
      if (L.Browser.mobile) map.dragging.disable()
      document.documentElement.style.overflow = ''
    }
    map.invalidateSize()
    fit()
  }
  close.addEventListener('click', () => {
    setOpen(false)
    opener?.focus()
  })
  const FOCUSABLE = 'a[href], button:not([disabled]):not([hidden]), [tabindex]:not([tabindex="-1"])'
  document.addEventListener('keydown', (e) => {
    if (!box.classList.contains('is-open')) return
    if (e.key === 'Escape') {
      setOpen(false)
      opener?.focus()
    } else if (e.key === 'Tab') {
      // Tab cycles inside the open map instead of leaving for the browser bar.
      const items = [...box.querySelectorAll(FOCUSABLE)]
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
  })

  return {
    open(from) {
      opener = from
      setOpen(true)
      close.focus()
    },
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}
