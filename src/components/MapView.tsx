"use client";

// Leaflet map. Loaded with next/dynamic (ssr: false) because Leaflet needs `window`.
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { divIcon } from "leaflet";
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Report } from "@/lib/types";

const COLOR = { critical: "#b3122e", high: "#c98200", moderate: "#3f7690", low: "#7c8b87" } as const;
const RADIUS = { critical: 13, high: 10, moderate: 8, low: 6 } as const;

/** Drop pin drawn inline (no image assets), tip anchored on the exact coordinates. */
function pinIcon(fill: string) {
  return divIcon({
    className: "",
    html: `<svg width="30" height="42" viewBox="0 0 30 42" aria-hidden="true"><path d="M15 41C15 41 2 24.5 2 15a13 13 0 0 1 26 0c0 9.5-13 26-13 26z" fill="${fill}" stroke="#13272c" stroke-width="2"/><circle cx="15" cy="15" r="5" fill="#fff"/></svg>`,
    iconSize: [30, 42],
    iconAnchor: [15, 41],
    tooltipAnchor: [0, -36],
  });
}

function FlyTo({ lat, lng, zoom = 14 }: { lat: number; lng: number; zoom?: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], Math.max(map.getZoom(), zoom), { duration: 0.6 });
  }, [lat, lng, zoom, map]);
  return null;
}

function Picker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onPick(e.latlng.lat, e.latlng.lng) });
  return null;
}

export interface MapViewProps {
  reports?: Report[];
  selectedId?: string | null;
  onSelect?: (r: Report) => void;
  onPick?: (lat: number, lng: number) => void;
  pin?: { lat: number; lng: number } | null;
  center?: [number, number];
}

export default function MapView({ reports = [], selectedId, onSelect, onPick, pin, center }: MapViewProps) {
  const selected = reports.find((r) => r.publicId === selectedId);
  const start: [number, number] =
    center ?? (reports[0] ? [reports[0].lat, reports[0].lng] : [28.6139, 77.209]); // New Delhi

  return (
    <MapContainer center={start} zoom={12} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {reports
        .filter((r) => !r.duplicateOf)
        .map((r) => (
          <CircleMarker
            key={r.publicId}
            center={[r.lat, r.lng]}
            radius={RADIUS[r.severity] + Math.min(r.corroborations, 5)}
            pathOptions={{
              color: r.publicId === selectedId ? "#13272c" : "#ffffff",
              weight: r.publicId === selectedId ? 3 : 1.5,
              fillColor: COLOR[r.severity],
              fillOpacity: r.status === "resolved" ? 0.25 : 0.9,
            }}
            eventHandlers={{ click: () => onSelect?.(r) }}
          >
            <Tooltip>
              {r.severity} · score {r.score}
              {r.corroborations ? ` · ${r.corroborations + 1} reports` : ""}
            </Tooltip>
          </CircleMarker>
        ))}
      {pin && (
        <CircleMarker center={[pin.lat, pin.lng]} radius={10} pathOptions={{ color: "#13272c", fillColor: "#1f6f6b", fillOpacity: 1 }} />
      )}
      {selected && (
        <Marker position={[selected.lat, selected.lng]} icon={pinIcon(COLOR[selected.severity])} zIndexOffset={1000}>
          <Tooltip>
            {selected.lat.toFixed(5)}, {selected.lng.toFixed(5)}
          </Tooltip>
        </Marker>
      )}
      {selected && <FlyTo lat={selected.lat} lng={selected.lng} zoom={17} />}
      {pin && <FlyTo lat={pin.lat} lng={pin.lng} />}
      {onPick && <Picker onPick={onPick} />}
    </MapContainer>
  );
}
