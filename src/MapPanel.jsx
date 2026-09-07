import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

/* --------------------------------------------------------------------------
   Palette

   Pin colours live in map.css as custom properties so they stay inside the
   token system. Leaflet needs real values rather than var() references, so we
   resolve them once at mount. The second argument is the fallback used if
   map.css hasn't loaded.
   -------------------------------------------------------------------------- */

function token(name, fallback) {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return v || fallback;
}

/* basemap.at covers Austria only. Bounds stop Leaflet requesting tiles that
   will come back empty over Bavaria and South Tyrol. */
const AT_BOUNDS = [
  [46.35877, 8.782379],
  [49.037872, 17.189532],
];

/* --------------------------------------------------------------------------
   Tiles

   Two layers. basemap.at publishes Austria only, so on its own the map stops
   dead at the border. WORLD sits underneath and covers everything; AUSTRIA is
   drawn on top of it and clipped to AT_BOUNDS, so you get the detailed
   Austrian cartography where it exists and ordinary geography everywhere else.

   To swap the world layer, change WORLD_URL and WORLD_ATTR together — the
   attribution is a licence condition, not decoration.

   Currently OpenStreetMap standard: open licence, no API key, no expiry date.
   Note that OSM's tile usage policy is aimed at modest traffic — worth a read
   if Hüttenfinder grows, since heavy use is expected to move to a paid host.

   Two alternatives:

   CARTO Positron (muted grey, lets Austria carry all the colour):
     https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png
     '&copy; OpenStreetMap contributors &copy; CARTO'

   Esri World Topo (closest match to basemap.at, softest seam — but it is a
   deprecated layer, unmaintained, with retirement scheduled for 2028/2029,
   and its terms run through Esri's master agreement rather than an open one):
     https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}
     'Tiles &copy; Esri — Esri, HERE, Garmin, USGS, OpenStreetMap contributors'
   -------------------------------------------------------------------------- */

const WORLD_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const WORLD_ATTR =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';

const AUSTRIA_URL =
  "https://mapsneu.wien.gv.at/basemap/geolandbasemap/normal/google3857/{z}/{y}/{x}.png";

/* Required by basemap.at's CC-BY licence. */
const AUSTRIA_ATTR =
  'Datenquelle: <a href="https://basemap.at" target="_blank" rel="noopener">basemap.at</a>';

function FitToHuts({ huts }) {
  const map = useMap();
  useEffect(() => {
    if (!huts.length) return;
    const lats = huts.map((h) => h.lat);
    const lngs = huts.map((h) => h.lng);
    map.fitBounds(
      [
        [Math.min(...lats), Math.min(...lngs)],
        [Math.max(...lats), Math.max(...lngs)],
      ],
      { padding: [48, 48], maxZoom: 9 }
    );
  }, [map, huts.length, huts[0]?.id]);
  return null;
}

/* Brings a hovered hut into view, but only when it is off-screen — hovering a
   pin you can already see must never move the map under your cursor. The delay
   stops a fast scan down the list firing a pan per card. */
function PanToHovered({ huts, hoveredId }) {
  const map = useMap();
  useEffect(() => {
    if (hoveredId == null) return;
    const hut = huts.find((h) => h.id === hoveredId);
    if (!hut) return;

    const point = [hut.lat, hut.lng];
    /* pad(-0.08) shrinks the test area, so a pin hugging the edge still pans
       to somewhere comfortable rather than staying half under the frame. */
    if (map.getBounds().pad(-0.08).contains(point)) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const t = setTimeout(() => {
      map.panTo(point, { animate: !reduce, duration: 0.4 });
    }, 180);
    return () => clearTimeout(t);
  }, [map, huts, hoveredId]);
  return null;
}

export default function MapPanel({
  huts,
  onSelect,
  height = "100%",
  /* Optional. Until App passes these the map behaves exactly as before, so
     this file can go in and be checked on its own. */
  selectedId = null,
  hoveredId = null,
  onHover = null,
}) {
  const pins = useMemo(
    () =>
      huts.filter(
        (h) => typeof h.lat === "number" && typeof h.lng === "number"
      ),
    [huts]
  );

  const palette = useMemo(
    () => ({
      pin: token("--map-pin", "#35648F"),
      muted: token("--map-pin-muted", "#9C8B7D"),
      ring: token("--map-ring", "#FFFFFF"),
      ink: token("--ink", "#3A2A20"),
      weight: Number(token("--map-ring-w", "1")) || 1,
      weightSel: Number(token("--map-ring-w-sel", "2")) || 2,
    }),
    []
  );

  /* Draw order is deliberately stable. Sorting the array to put the hovered
     pin last makes React recreate that marker underneath the cursor, which
     fires mouseout, which clears the hover, which sorts it back — a flicker
     loop. bringToFront() raises it without changing React's order. */

  return (
    <MapContainer
      center={[47.6, 13.5]}
      zoom={7}
      preferCanvas={true}
      scrollWheelZoom={true}
      style={{ height, width: "100%" }}
    >
      <TileLayer url={WORLD_URL} attribution={WORLD_ATTR} maxZoom={19} />

      <TileLayer
        url={AUSTRIA_URL}
        attribution={AUSTRIA_ATTR}
        maxZoom={19}
        bounds={AT_BOUNDS}
      />
      <FitToHuts huts={pins} />
      <PanToHovered huts={pins} hoveredId={hoveredId} />

      {pins.map((hut) => {
        const bookable = Boolean(hut.hr_hut_id);
        const isSelected = selectedId != null && hut.id === selectedId;
        const isHovered = hoveredId != null && hut.id === hoveredId;

        const radius = isSelected ? 8 : isHovered ? 7 : bookable ? 5.5 : 4.5;

        return (
          <CircleMarker
            key={hut.id}
            center={[hut.lat, hut.lng]}
            radius={radius}
            pathOptions={{
              color: isSelected ? palette.ink : palette.ring,
              weight: isSelected ? palette.weightSel : palette.weight,
              opacity: 1,
              fillColor: bookable ? palette.pin : palette.muted,
              fillOpacity: 1,
            }}
            eventHandlers={{
              click: () => onSelect(hut),
              mouseover: (e) => {
                e.target.bringToFront();
                if (onHover) onHover(hut.id);
              },
              mouseout: () => onHover && onHover(null),
            }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {hut.name}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
