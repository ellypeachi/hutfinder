import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const GOLD = "#b08536";
const STONE = "#8a8578";

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
      { padding: [30, 30], maxZoom: 12 }
    );
  }, [map, huts.length, huts[0]?.id]);
  return null;
}

export default function MapPanel({ huts, onSelect, height = "100%" }) {
  const pins = huts.filter(
    (h) => typeof h.lat === "number" && typeof h.lng === "number"
  );

  return (
    <MapContainer
      center={[47.6, 13.5]}
      zoom={7}
      preferCanvas={true}
      scrollWheelZoom={true}
      style={{ height, width: "100%", background: "#f4f1ea" }}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; OpenStreetMap &copy; CARTO'
      />
      <FitToHuts huts={pins} />
      {pins.map((hut) => {
        const bookable = Boolean(hut.hr_hut_id);
        return (
          <CircleMarker
            key={hut.id}
            center={[hut.lat, hut.lng]}
            radius={bookable ? 6 : 4}
            pathOptions={{
              color: "#ffffff",
              weight: 1,
              fillColor: bookable ? GOLD : STONE,
              fillOpacity: 1,
            }}
            eventHandlers={{ click: () => onSelect(hut) }}
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
