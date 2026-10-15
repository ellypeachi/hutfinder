import L from "leaflet";
import outline from "./austriaOutline.json";

/* --------------------------------------------------------------------------
   Sharp basemap.at tiles for high-DPI screens.

   basemap.at's 512px "HiDPI" tiles are JPEGs, so outside Austria they are
   opaque white and would hide the OpenStreetMap layer underneath. This layer
   cuts them to the border, in one of two ways:

     inside   the tile is wholly inside Austria: the sharp tile is used as it is.
     any other  the sharp tile is drawn on a canvas and cut with the standard
              256px tile, whose transparent PNG follows the real border exactly.

   austriaOutline.json only decides which tiles are safely "inside". It is
   Austria's border from OpenStreetMap, simplified to within 0.01 degrees
   (about 1 km), so a tile counts as inside only if it stays MARGIN clear of the
   outline. The rough outline never decides where the cut is.

   There is no "wholly outside, draw nothing" case on purpose: basemap.at draws
   a little beyond the border (all of Liechtenstein, strips along the edge),
   and the transparent PNG keeps all of it, as the plain layer always did.
   -------------------------------------------------------------------------- */

const MARGIN = 0.012;

const SEGMENTS = [];
for (const ring of outline) {
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    SEGMENTS.push([x1, y1, x2, y2]);
  }
}

/* Liang–Barsky: does the segment touch the rectangle? */
function segmentTouches([x1, y1, x2, y2], w, s, e, n) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  let t0 = 0;
  let t1 = 1;
  const clip = (p, q) => {
    if (p === 0) return q >= 0;
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
    return true;
  };
  return clip(-dx, x1 - w) && clip(dx, e - x1) && clip(-dy, y1 - s) && clip(dy, n - y1);
}

function insideAustria(lng, lat) {
  return outline.some((ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];
      if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  });
}

function isWellInside({ x, y, z }) {
  const n = 2 ** z;
  const lng = (tx) => (tx / n) * 360 - 180;
  const lat = (ty) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI;
  const w = lng(x) - MARGIN;
  const e = lng(x + 1) + MARGIN;
  const nn = lat(y) + MARGIN;
  const s = lat(y + 1) - MARGIN;
  if (SEGMENTS.some((seg) => segmentTouches(seg, w, s, e, nn))) return false;
  return insideAustria((w + e) / 2, (s + nn) / 2);
}

/* sharpUrl: the 512px JPEG tiles. stencilUrl: the standard transparent PNGs.
   Both use the same {z}/{y}/{x}, so the same coordinates fetch both. */
export const AustriaTiles = L.TileLayer.extend({
  initialize(sharpUrl, stencilUrl, options) {
    L.TileLayer.prototype.initialize.call(this, sharpUrl, options);
    this._stencilUrl = stencilUrl;
  },

  createTile(coords, done) {
    if (isWellInside(coords)) return L.TileLayer.prototype.createTile.call(this, coords, done);

    const size = this.getTileSize().x * 2;
    const tile = document.createElement("canvas");
    tile.width = size;
    tile.height = size;
    tile.setAttribute("role", "presentation");

    const sharp = new Image();
    const stencil = new Image();
    let waiting = 2;
    let failed = false;
    const settle = (ok) => () => {
      if (!ok) failed = true;
      if (--waiting) return;
      if (failed) return done(new Error("tile failed"), tile);
      const ctx = tile.getContext("2d");
      ctx.drawImage(sharp, 0, 0, size, size);
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(stencil, 0, 0, size, size);
      done(null, tile);
    };
    sharp.onload = settle(true);
    sharp.onerror = settle(false);
    stencil.onload = settle(true);
    stencil.onerror = settle(false);
    sharp.src = this.getTileUrl(coords);
    stencil.src = L.Util.template(this._stencilUrl, coords);
    return tile;
  },
});
