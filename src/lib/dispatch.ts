// Severity-based dispatch. Help is shared out by urgency: a Critical report gets the
// nearest free unit, even one already sent to a less urgent report; High, Moderate
// and Low leave units free for Critical and accept a centre further away.
//
// Assignments are recomputed from the open reports every time (pure function, no
// extra datastore), so a resolved report frees its unit at once and a new Critical
// report takes over a nearby unit from a Low one.

import { haversineMeters } from "./triage";
import type { Category, Report, Severity } from "./types";

export type UnitType = "ambulance" | "fire" | "rescue";

export const UNIT_LABEL: Record<UnitType, string> = {
  ambulance: "Ambulance",
  fire: "Fire tender",
  rescue: "Rescue team",
};
const ONE: Record<UnitType, string> = { ambulance: "ambulance", fire: "fire tender", rescue: "rescue team" };
const MANY: Record<UnitType, string> = { ambulance: "ambulances", fire: "fire tenders", rescue: "rescue teams" };
const A_ONE: Record<UnitType, string> = { ambulance: "an ambulance", fire: "a fire tender", rescue: "a rescue team" };

export interface Centre {
  id: string;
  name: string;
  lat: number;
  lng: number;
  units: Record<UnitType, number>;
}

// Demo response centres across Delhi. Labelled "demo" in the UI: they show how
// dispatch works and are not real stations.
export const DEMO_CENTRES: Centre[] = [
  { id: "ito", name: "ITO (demo)", lat: 28.6289, lng: 77.241, units: { ambulance: 2, fire: 1, rescue: 1 } },
  { id: "lajpat", name: "Lajpat Nagar (demo)", lat: 28.5677, lng: 77.2433, units: { ambulance: 3, fire: 2, rescue: 1 } },
  { id: "kashmere", name: "Kashmere Gate (demo)", lat: 28.6676, lng: 77.228, units: { ambulance: 2, fire: 1, rescue: 2 } },
  { id: "mayur", name: "Mayur Vihar (demo)", lat: 28.6075, lng: 77.295, units: { ambulance: 2, fire: 1, rescue: 2 } },
  { id: "dwarka", name: "Dwarka (demo)", lat: 28.5921, lng: 77.046, units: { ambulance: 3, fire: 2, rescue: 2 } },
];

/** Per severity: units a centre keeps free for more urgent calls, and the furthest it sends one. */
export const RULES: Record<Severity, { keepFree: number; maxKm: number }> = {
  critical: { keepFree: 0, maxKm: Infinity },
  high: { keepFree: 1, maxKm: 15 },
  moderate: { keepFree: 1, maxKm: 30 },
  low: { keepFree: 2, maxKm: 45 },
};

const RANK: Record<Severity, number> = { critical: 0, high: 1, moderate: 2, low: 3 };
const CITY_KMH = 25; // rough Delhi road speed for an ETA

/** The kind of unit a report needs, from what the AI saw. */
export function unitFor(r: Pick<Report, "primaryCategory" | "categories">): UnitType {
  const has = (c: Category) => r.primaryCategory === c || r.categories.includes(c);
  if (r.primaryCategory === "fire" || r.primaryCategory === "gas_or_chemical_leak") return "fire";
  if (r.primaryCategory === "trapped_or_injured" || r.primaryCategory === "medical_emergency" || r.primaryCategory === "crowd_crush") {
    // People trapped in flood water need a boat more than an ambulance.
    return has("flood") ? "rescue" : "ambulance";
  }
  return "rescue";
}

export type DispatchReport = Pick<
  Report,
  "publicId" | "severity" | "score" | "status" | "createdAt" | "lat" | "lng" | "primaryCategory" | "categories" | "duplicateOf"
>;

export interface Assignment {
  publicId: string;
  severity: Severity;
  unit: UnitType;
  state: "assigned" | "waiting_verification" | "queued";
  centreId: string | null;
  km: number | null;
  etaMin: number | null;
  /** Critical reports go out before a person has checked them. */
  unverified: boolean;
  reason: string;
}

export interface CentreLoad {
  centre: Centre;
  free: Record<UnitType, number>;
}

/** Reports that can hold a unit: open, located, not a duplicate. */
function needsHelp(r: DispatchReport): boolean {
  return !r.duplicateOf && r.lat !== null && r.lng !== null && r.status !== "resolved" && r.status !== "rejected";
}

/** Critical goes out at once; the rest wait until the control room verifies them. */
function cleared(r: DispatchReport): boolean {
  return r.severity === "critical" || r.status === "verified" || r.status === "dispatched";
}

const place = (c: Centre) => c.name.replace(" (demo)", "");

function whyNearest(severity: Severity, c: Centre, unit: UnitType): string {
  return severity === "critical"
    ? `Most urgent, so the closest free ${ONE[unit]} is sent at once.`
    : `${place(c)} is the closest centre and has ${A_ONE[unit]} to spare.`;
}

/** Why the closer centres were passed over, in one sentence. */
function whySkipped(closer: Centre[], unit: UnitType, free: Map<string, Record<UnitType, number>>): string {
  if (closer.length > 1) return `Closer centres (${closer.map(place).join(", ")}) have no ${ONE[unit]} to spare.`;
  const c = closer[0];
  const left = free.get(c.id)![unit];
  if (c.units[unit] === 0) return `${place(c)} is closer but has no ${MANY[unit]}.`;
  if (left === 0) return `${place(c)} is closer, but its ${c.units[unit] === 1 ? ONE[unit] + " is" : MANY[unit] + " are all"} out on other calls.`;
  return `${place(c)} is closer, but keeps its last ${left === 1 ? ONE[unit] : `${left} ${MANY[unit]}`} free for more urgent calls.`;
}

const km = (r: DispatchReport, c: Centre) => haversineMeters(r.lat!, r.lng!, c.lat, c.lng) / 1000;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function assignAll(reports: DispatchReport[], centres: Centre[] = DEMO_CENTRES): { assignments: Assignment[]; centres: CentreLoad[] } {
  const free = new Map(centres.map((c) => [c.id, { ...c.units }]));
  const open = reports
    .filter(needsHelp)
    .sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.score - a.score || a.createdAt.localeCompare(b.createdAt));

  const assignments = open.map((r): Assignment => {
    const unit = unitFor(r);
    const base = { publicId: r.publicId, severity: r.severity, unit, unverified: r.status === "new" };
    if (!cleared(r)) {
      return { ...base, state: "waiting_verification", centreId: null, km: null, etaMin: null, reason: "Verify it in the control room and help is assigned automatically." };
    }
    const rule = RULES[r.severity];
    const byDistance = centres.map((c) => ({ c, d: km(r, c) })).sort((a, b) => a.d - b.d);
    const at = byDistance.findIndex(({ c, d }) => d <= rule.maxKm && free.get(c.id)![unit] > rule.keepFree);
    if (at === -1) {
      const reason =
        r.severity === "critical"
          ? `Every ${ONE[unit]} is already out on another Critical call. It goes to the first one that frees up.`
          : `No centre within ${rule.maxKm} km can spare ${A_ONE[unit]} right now. It goes to the first one that frees up.`;
      return { ...base, state: "queued", centreId: null, km: null, etaMin: null, reason };
    }
    const pick = byDistance[at];
    const reason = at === 0 ? whyNearest(r.severity, pick.c, unit) : whySkipped(byDistance.slice(0, at).map(({ c }) => c), unit, free);
    free.get(pick.c.id)![unit] -= 1;
    return { ...base, state: "assigned", centreId: pick.c.id, km: round1(pick.d), etaMin: Math.max(2, Math.round((pick.d / CITY_KMH) * 60)), reason };
  });

  return { assignments, centres: centres.map((c) => ({ centre: c, free: free.get(c.id)! })) };
}
