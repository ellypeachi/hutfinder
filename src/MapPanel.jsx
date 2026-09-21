import { useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Tooltip,
  ZoomControl,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
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
      { padding: [24, 24], maxZoom: 9 }
    );
  }, [map, huts.length, huts[0]?.id]);
  return null;
}

/* Brings a hut into view, but only when it is off-screen — focusing a pin you
   can already see must never move the map under your cursor. The delay stops a
   fast scan down the list firing a pan per card.

   Rendered twice: once for hover, once for selection. Hover does not exist on
   touch, so without the selection instance tapping a card on a phone would
   never bring its pin into view. */
function PanToFocus({ huts, focusId }) {
  const map = useMap();
  useEffect(() => {
    if (focusId == null) return;
    const hut = huts.find((h) => h.id === focusId);
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
  }, [map, huts, focusId]);
  return null;
}

/* Leaflet caches the container's size and only re-reads it on a window resize.
   The map box now changes height on its own — switching between Split and Map
   on a phone, and crossing the desktop breakpoint — which resizes the element
   without resizing the window. Without this the canvas keeps the old size and
   pins land in the wrong place. */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === "undefined") return undefined;
    const el = map.getContainer();
    let frame = 0;
    const ro = new ResizeObserver(() => {
      /* Coalesce: a height change can fire this several times in one frame. */
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => map.invalidateSize({ animate: false }));
    });
    ro.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [map]);
  return null;
}

/* Zooms to the selected hut. Closing the card leaves the map where it is —
   you stay looking at the hut you just opened rather than being thrown back
   to the overview.

   Math.max keeps it from zooming *out*: if you are already closer than 13,
   selecting a hut leaves your zoom alone. */
function ZoomToSelected({ huts, selectedId }) {
  const map = useMap();

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (selectedId == null) return;

    const hut = huts.find((h) => h.id === selectedId);
    if (!hut) return;

    const target = [hut.lat, hut.lng];
    const zoom = Math.max(map.getZoom(), 13);
    if (reduce) map.setView(target, zoom);
    else map.flyTo(target, zoom, { duration: 0.6 });
  }, [map, huts, selectedId]);

  return null;
}

/* --------------------------------------------------------------------------
   Hover card

   On a desktop, resting on a pin shows that hut's list card next to it, so
   you can compare huts on the map without opening each one. It waits a
   moment before opening, so sweeping the mouse across the map doesn't flash
   cards; once one is open, moving to the next pin swaps it at once. It stays
   open while the pointer is on the card itself, so Book and Call can be
   clicked, and it closes as soon as the map moves.

   Only where the device really hovers (a mouse or trackpad). On a touch
   screen a tap opens the hut as before.
   -------------------------------------------------------------------------- */

const CARD_W = 300;
const CARD_GAP = 14; // between the pin and the card
const OPEN_MS = 150;
const CLOSE_MS = 200;

function CloseOnMove({ onMove }) {
  useMapEvents({ movestart: onMove, zoomstart: onMove });
  return null;
}

function HoverCard({ hut, render, onEnter, onLeave, onOpen }) {
  const map = useMap();
  const pt = map.latLngToContainerPoint([hut.lat, hut.lng]);
  const size = map.getSize();
  /* Centred over the pin, but kept inside the map. Above the pin unless the
     pin is near the top, where it goes below. The card's height isn't
     known before it renders, so the flip uses the room there is rather
     than measuring. */
  const left = Math.min(Math.max(pt.x - CARD_W / 2, 8), Math.max(size.x - CARD_W - 8, 8));
  const above = pt.y >= 320 || pt.y > size.y - pt.y;
  /* Leaflet listens on the whole map container, so without this a click on
     the card would also be a click on the map, and scrolling over it would
     zoom the map. */
  const isolate = (el) => {
    if (!el) return;
    L.DomEvent.disableClickPropagation(el);
    L.DomEvent.disableScrollPropagation(el);
  };
  return (
    <div
      ref={isolate}
      className="hf-hovercard"
      style={{
        left,
        top: above ? pt.y - CARD_GAP : pt.y + CARD_GAP,
        transform: above ? "translateY(-100%)" : undefined,
        width: CARD_W,
      }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onOpen}
    >
      {render(hut, onOpen)}
    </div>
  );
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
  /* Optional: (hut, open) => the card to show when a pin is hovered. */
  renderHoverCard = null,
}) {
  const canHover = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(hover: hover) and (pointer: fine)").matches,
    []
  );
  const cards = Boolean(renderHoverCard) && canHover;
  const [cardId, setCardId] = useState(null);
  /* The pin under the mouse right now, if any. A hover that starts on the
     map must not pan the map: the pin is already in view, and moving it
     would slide it out from under the cursor (and close its card). Panning
     is for a hover that starts in the list. */
  const [pinHoverId, setPinHoverId] = useState(null);
  const cardOpen = useRef(false);
  const openTimer = useRef(0);
  const closeTimer = useRef(0);
  const showCard = (id) => {
    clearTimeout(closeTimer.current);
    clearTimeout(openTimer.current);
    if (cardOpen.current) {
      setCardId(id);
      return;
    }
    openTimer.current = setTimeout(() => {
      cardOpen.current = true;
      setCardId(id);
    }, OPEN_MS);
  };
  const hideCard = (now = false) => {
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    const close = () => {
      cardOpen.current = false;
      setCardId(null);
    };
    if (now) close();
    else closeTimer.current = setTimeout(close, CLOSE_MS);
  };
  useEffect(
    () => () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    },
    []
  );
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
      muted: token("--map-pin-muted", "#C6BAAC"),
      ring: token("--map-ring", "#FFFFFF"),
      ink: token("--ink", "#3A2A20"),
      weight: Number(token("--map-ring-w", "1")) || 1,
      weightSel: Number(token("--map-ring-w-sel", "2")) || 2,
    }),
    []
  );

  const selectedHut = useMemo(
    () => (selectedId == null ? null : pins.find((h) => h.id === selectedId)),
    [pins, selectedId]
  );
  /* Not while a hut is open in the pop-up, and gone if a filter removes it. */
  const cardHut =
    cards && cardId != null && selectedId == null ? pins.find((h) => h.id === cardId) : null;

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
      /* Austria is about 2:1, so at whole-number zoom levels it only ever
         fills one dimension of the panel — in the wide desktop map it sat in
         the middle at a third of the width. Quarter steps let fitBounds pick a
         zoom that actually fills the box. zoomDelta keeps the +/- buttons and
         the keyboard on whole levels. */
      zoomSnap={0.25}
      zoomDelta={1}
      /* Moved out of the top-left corner, which the legend now owns, and into
         the bottom right — on a phone that is also where a thumb reaches. */
      zoomControl={false}
      style={{ height, width: "100%" }}
    >
      <TileLayer url={WORLD_URL} attribution={WORLD_ATTR} maxZoom={19} />

      <TileLayer
        url={AUSTRIA_URL}
        attribution={AUSTRIA_ATTR}
        maxZoom={19}
        bounds={AT_BOUNDS}
      />
      <ZoomControl position="bottomright" />
      <AutoResize />
      <FitToHuts huts={pins} />
      <PanToFocus
        huts={pins}
        focusId={hoveredId != null && hoveredId === pinHoverId ? null : hoveredId}
      />
      <ZoomToSelected huts={pins} selectedId={selectedId} />

      {/* Halo under the selected pin. Drawn before the pins so it sits beneath
          them, and non-interactive so it never steals the click. */}
      {selectedHut && (
        <CircleMarker
          center={[selectedHut.lat, selectedHut.lng]}
          radius={24}
          interactive={false}
          pathOptions={{
            stroke: false,
            fillColor: palette.pin,
            fillOpacity: 0.32,
          }}
        />
      )}

      {pins.map((hut) => {
        const bookable = Boolean(hut.hr_hut_id);
        const isSelected = selectedId != null && hut.id === selectedId;
        const isHovered = hoveredId != null && hut.id === hoveredId;

        const radius = isSelected ? 9 : isHovered ? 7 : bookable ? 5.5 : 4.5;

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
              click: () => {
                if (cards) hideCard(true);
                onSelect(hut);
              },
              mouseover: (e) => {
                e.target.bringToFront();
                setPinHoverId(hut.id);
                if (onHover) onHover(hut.id);
                if (cards) showCard(hut.id);
              },
              mouseout: () => {
                setPinHoverId(null);
                if (onHover) onHover(null);
                if (cards) hideCard();
              },
            }}
          >
            {/* Where there is a hover card, it names the hut; the label would
                only sit on top of it. */}
            {cards ? null : (
              <Tooltip direction="top" offset={[0, -6]}>
                {hut.name}
              </Tooltip>
            )}
          </CircleMarker>
        );
      })}

      {cards ? <CloseOnMove onMove={() => hideCard(true)} /> : null}
      {cardHut ? (
        <HoverCard
          key={cardHut.id}
          hut={cardHut}
          render={renderHoverCard}
          onEnter={() => clearTimeout(closeTimer.current)}
          onLeave={() => hideCard()}
          onOpen={() => {
            hideCard(true);
            onSelect(cardHut);
          }}
        />
      ) : null}
    </MapContainer>
  );
}
