/* Free beds keep the app's traffic light, and the colours never work alone:
   the gauge's shape (full, half, empty) and the number carry the meaning.
   Shared by the hut pages' calendar and the region pages' filters. */
export const bedColor = (n) => (n <= 0 ? 'var(--burgundy)' : n <= 3 ? 'var(--rust)' : 'var(--pine)')

export const gauge = (n, size = 9) => {
  const c = bedColor(n)
  const ring = `<circle cx="10" cy="10" r="8" fill="none" stroke="${c}" stroke-width="2.8"/>`
  const body = n > 3 ? `<circle cx="10" cy="10" r="8" fill="${c}"/>` : n > 0 ? `${ring}<path d="M10 2a8 8 0 0 1 0 16z" fill="${c}"/>` : ring
  return `<svg class="hp-gauge" width="${size}" height="${size}" viewBox="0 0 20 20" aria-hidden="true" focusable="false" style="flex-shrink:0">${body}</svg>`
}
