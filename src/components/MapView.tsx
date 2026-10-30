"use client";

// Leaflet map. Loaded with next/dynamic (ssr: false) because Leaflet needs `window`.
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";
import { divIcon } from "leaflet";
import type { GeoJsonObject } from "geojson";
import { CircleMarker, GeoJSON, MapContainer, Marker, Pane, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { isLocated, type Report } from "@/lib/types";
import regionalOverview from "@/lib/regional-overview.json";

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
  /** A place-name guess for an unlocated report: drawn dashed, never auto-confirmed. */
  suggested?: { lat: number; lng: number; label: string } | null;
  /** Crosshair cursor while a coordinator is placing a pin. */
  picking?: boolean;
  center?: [number, number];
  zoom?: number;
  scrollWheelZoom?: boolean;
  /** Local geography underneath raster tiles, so the homepage also works offline. */
  regionalOverview?: boolean;
}

export default function MapView({ reports = [], selectedId, onSelect, onPick, pin, suggested, picking, center, zoom = 12, scrollWheelZoom = true, regionalOverview: showRegionalOverview = false }: MapViewProps) {
  const located = reports.filter(isLocated);
  const selected = located.find((r) => r.publicId === selectedId);
  const start: [number, number] =
    center ?? (located[0] ? [located[0].lat, located[0].lng] : [28.6139, 77.209]); // New Delhi

  return (
    <MapContainer
      center={start}
      zoom={zoom}
      style={{ height: "100%", width: "100%", cursor: picking ? "crosshair" : undefined }}
      className={picking ? "map-picking" : undefined}
      scrollWheelZoom={scrollWheelZoom}
    >
      {showRegionalOverview && <Pane name="regional-overview" style={{ zIndex: 150 }}>
        <GeoJSON data={regionalOverview as GeoJsonObject} interactive={false} style={{ color: "#9fb5ae", weight: 1, fillColor: "#d4e2d6", fillOpacity: 1 }} attribution='Regional overview: <a href="https://www.naturalearthdata.com/">Natural Earth</a>' />
      </Pane>}
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {located
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
      {suggested && (
        <CircleMarker
          center={[suggested.lat, suggested.lng]}
          radius={16}
          pathOptions={{ color: "#13272c", weight: 2, dashArray: "5 5", fillColor: "#e0a100", fillOpacity: 0.25 }}
          eventHandlers={{ click: () => onPick?.(suggested.lat, suggested.lng) }}
        >
          <Tooltip permanent direction="top">Suggested: {suggested.label.split(",").slice(0, 2).join(",")}</Tooltip>
        </CircleMarker>
      )}
      {suggested && !selected && <FlyTo lat={suggested.lat} lng={suggested.lng} zoom={15} />}
      {selected && <FlyTo lat={selected.lat} lng={selected.lng} zoom={17} />}
      {pin && <FlyTo lat={pin.lat} lng={pin.lng} />}
      {onPick && <Picker onPick={onPick} />}
    </MapContainer>
  );
}
