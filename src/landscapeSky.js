/* Which landscape scene a visitor gets. It comes from their own clock and
   calendar: nothing is looked up and nothing leaves the browser. It is
   decoration, not a forecast.

   Time of day sets the scene: sunrise 05:00 to 08:59, day 09:00 to 16:59,
   sunset 17:00 to 20:59, night after that. Weather only ever replaces the
   day scene (and, for a summer storm, the evening one):

   - December to March: snow.
   - Any other month, on a "wet day": rain, and from June to August a storm
     from 14:00 until 21:00. A wet day is about one day in five, picked from
     the date alone, so everyone sees the same on the same day. */

export const SNOW_MONTHS = [11, 0, 1, 2]; // December to March (months count from 0)
export const SUMMER_MONTHS = [5, 6, 7]; // June to August
export const WET_ONE_IN = 5;

/* A whole-number hash of the date (a standard 32-bit integer mix), so that
   neighbouring days don't fall into a pattern. */
function mix(n) {
  let x = n | 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  x = Math.imul(x, 0x45d9f3b);
  x ^= x >>> 16;
  return x >>> 0;
}

export function isWetDay(d) {
  const day = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  return mix(day) % WET_ONE_IN === 0;
}

export function presetFromClock(d = new Date()) {
  const h = d.getHours();
  const m = d.getMonth();
  if (SNOW_MONTHS.includes(m)) {
    if (h >= 9 && h < 17) return "snow";
  } else if (isWetDay(d)) {
    if (SUMMER_MONTHS.includes(m) && h >= 14 && h < 21) return "storm";
    if (h >= 9 && h < 17) return "rain";
  }
  if (h >= 5 && h < 9) return "sunrise";
  if (h >= 9 && h < 17) return "noon";
  if (h >= 17 && h < 21) return "sunset";
  return "night";
}
