"use client";

// Leaflet map. Loaded with next/dynamic (ssr: false) because Leaflet needs `window`.
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Report } from "@/lib/types";

const COLOR = { critical: "#b3122e", high: "#c98200", moderate: "#3f7690", low: "#7c8b87" } as const;
const RADIUS = { critical: 13, high: 10, moderate: 8, low: 6 } as const;

function FlyTo({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 0.6 });
  }, [lat, lng, map]);
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
      {selected && <FlyTo lat={selected.lat} lng={selected.lng} />}
      {pin && <FlyTo lat={pin.lat} lng={pin.lng} />}
      {onPick && <Picker onPick={onPick} />}
    </MapContainer>
  );
}
