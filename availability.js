// netlify/functions/availability.js
//
// Production proxy for hut availability. The browser calls /api/availability?hutId=NNN
// (see the netlify.toml redirect); this function fetches the public hut-reservation.org
// feed server-side, trims it to the next ~180 days, and caches so repeat views and
// multiple visitors don't each hit the upstream server.
//
// You only need this once you deploy. Local `npm run dev` uses the Vite proxy instead.

const cache = new Map(); // per-instance in-memory cache
const TTL_MS = 30 * 60 * 1000; // 30 minutes
const WINDOW_DAYS = 180;

export async function handler(event) {
  const hutId = event.queryStringParameters && event.queryStringParameters.hutId;
  if (!hutId || !/^\d+$/.test(hutId)) {
    return { statusCode: 400, body: "hutId must be a number" };
  }

  const now = Date.now();
  const cached = cache.get(hutId);
  if (cached && now - cached.t < TTL_MS) return ok(cached.data);

  try {
    const upstream = `https://www.hut-reservation.org/api/v1/reservation/getHutAvailability?hutId=${hutId}&step=WIZARD`;
    const r = await fetch(upstream, {
      headers: { "User-Agent": "hutfinder/0.1 (mountain-hut finder)", Accept: "application/json" },
    });
    if (!r.ok) return { statusCode: 502, body: `upstream ${r.status}` };

    const all = await r.json();
    const cutoff = now + WINDOW_DAYS * 24 * 60 * 60 * 1000;
    const days = (Array.isArray(all) ? all : [])
      .filter((d) => {
        const t = Date.parse(d.date);
        return !isNaN(t) && t <= cutoff;
      })
      .map((d) => ({
        date: d.date,
        freeBeds: d.freeBeds,
        totalSleepingPlaces: d.totalSleepingPlaces,
        hutStatus: d.hutStatus,
        percentage: d.percentage,
      }));

    cache.set(hutId, { t: now, data: days });
    return ok(days);
  } catch (e) {
    return { statusCode: 502, body: "availability fetch failed" };
  }
}

function ok(data) {
  return {
    statusCode: 200,
    headers: {
      "content-type": "application/json",
      "cache-control": "public, max-age=1800", // let the CDN cache it too
    },
    body: JSON.stringify(data),
  };
}
