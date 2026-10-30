"use client";

// Street map for the dispatch board: centres as labelled boxes, reports as numbered
// dots matching the cards, and each unit driving from its centre to its report.
// Loaded with next/dynamic (ssr: false) because Leaflet needs `window`.
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo } from "react";
import { divIcon, latLngBounds, marker as leafletMarker } from "leaflet";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";
import type { Centre, UnitType } from "@/lib/dispatch";
import { UNIT_ICON } from "@/lib/dispatch-rows";
import type { Severity } from "@/lib/types";

export const SEV_COLOR: Record<Severity, string> = { critical: "#b3122e", high: "#b86e00", moderate: "#2c6e6a", low: "#5f6f6b" };

export interface MapPoint {
  id: string;
  n: number;
  lat: number;
  lng: number;
  severity: Severity;
  centre: Centre | null;
  label: string;
  unit: UnitType;
  /** When the unit left its centre (ms since epoch) and how long the drive takes. */
  startMs: number | null;
  durMs: number;
  arrived: boolean;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function vehicleIcon(unit: UnitType, color: string, parked: boolean) {
  return divIcon({
    className: "",
    html: `<span class="dmap-vehicle${parked ? " is-parked" : ""}" style="border-color:${color}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${UNIT_ICON[unit]}"/></svg></span>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  });
}

/** A unit driving in a straight line from its centre to the report, then parked there. */
function MovingUnit({ from, to, startMs, durMs, unit, color }: {
  from: [number, number];
  to: [number, number];
  startMs: number;
  durMs: number;
  unit: UnitType;
  color: string;
}) {
  const map = useMap();
  const [fLat, fLng] = from;
  const [tLat, tLng] = to;
  useEffect(() => {
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const m = leafletMarker([fLat, fLng], { icon: vehicleIcon(unit, color, false), interactive: false, keyboard: false, zIndexOffset: 800 }).addTo(map);
    let raf = 0;
    const tick = () => {
      const t = still || durMs <= 0 ? 1 : Math.min(1, Math.max(0, (Date.now() - startMs) / durMs));
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2; // ease in and out
      m.setLatLng([fLat + (tLat - fLat) * e, fLng + (tLng - fLng) * e]);
      if (t >= 1) return void m.setIcon(vehicleIcon(unit, color, true));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      cancelAnimationFrame(raf);
      m.remove();
    };
  }, [map, fLat, fLng, tLat, tLng, startMs, durMs, unit, color]);
  return null;
}

function FitAll({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = points.map((p) => p.join(",")).join(";");
  useEffect(() => {
    if (points.length) map.fitBounds(latLngBounds(points), { padding: [40, 40], maxZoom: 13 });
    // Refit only when the set of points changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, map]);
  return null;
}

export default function DispatchMap({ centres, points, active, onActive }: {
  centres: { centre: Centre; freeTotal: number; total: number }[];
  points: MapPoint[];
  active: string | null;
  onActive: (id: string | null) => void;
}) {
  // Reports at the same spot are fanned out side by side, so every number shows.
  const shift = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const p of points) {
      const k = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
      groups.set(k, [...(groups.get(k) ?? []), p.id]);
    }
    const out = new Map<string, number>();
    for (const ids of groups.values()) ids.forEach((id, i) => out.set(id, (i - (ids.length - 1) / 2) * 32));
    return out;
  }, [points]);
  // Zoom to the reports and the centres serving them; with no reports, show every centre.
  const fit = useMemo<[number, number][]>(() => {
    const used = new Set(points.map((p) => p.centre?.id));
    const shown = points.length ? centres.filter(({ centre }) => used.has(centre.id)) : centres;
    return [...shown.map(({ centre }) => [centre.lat, centre.lng] as [number, number]), ...points.map((p) => [p.lat, p.lng] as [number, number])];
  }, [centres, points]);

  return (
    <MapContainer center={[28.62, 77.2]} zoom={11} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitAll points={fit} />
      {points.filter((p) => p.centre).map((p) => (
        // Remounted when the unit arrives: Leaflet doesn't update a path's class in place.
        <Polyline
          key={`line-${p.id}-${p.centre!.id}-${p.arrived ? "on-scene" : "moving"}`}
          positions={[[p.centre!.lat, p.centre!.lng], [p.lat, p.lng]]}
          pathOptions={{
            color: SEV_COLOR[p.severity],
            weight: p.id === active ? 6 : 4,
            opacity: active && p.id !== active ? 0.3 : p.arrived ? 0.45 : 0.95,
            className: p.arrived ? "dmap-route" : "dmap-route is-moving",
          }}
        />
      ))}
      {points.filter((p) => p.centre && p.startMs !== null).map((p) => (
        <MovingUnit
          key={`unit-${p.id}-${p.centre!.id}`}
          from={[p.centre!.lat, p.centre!.lng]}
          to={[p.lat, p.lng]}
          startMs={p.startMs!}
          durMs={p.durMs}
          unit={p.unit}
          color={SEV_COLOR[p.severity]}
        />
      ))}
      {centres.map(({ centre, freeTotal, total }) => (
        <Marker
          key={`${centre.id}-${freeTotal}`}
          position={[centre.lat, centre.lng]}
          icon={divIcon({
            className: "",
            html: `<span class="dmap-centre"><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V9l9-6 9 6v12h-6v-6H9v6z" fill="#fff"/></svg>${esc(centre.name.replace(" (demo)", ""))}<small>${freeTotal}/${total} free</small></span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          })}
          zIndexOffset={-100}
        />
      ))}
      {points.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={divIcon({
            className: "",
            html: `<span class="dmap-num${p.id === active ? " is-active" : ""}" data-sev="${p.severity}" style="background:${SEV_COLOR[p.severity]};margin-left:${shift.get(p.id) ?? 0}px">${p.n}</span>`,
            iconSize: [0, 0],
            iconAnchor: [0, 0],
          })}
          zIndexOffset={p.id === active ? 1000 : 500}
          eventHandlers={{ mouseover: () => onActive(p.id), mouseout: () => onActive(null), click: () => onActive(p.id) }}
        >
          <Tooltip direction="top" offset={[0, -16]}>{p.n}. {p.label}</Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
