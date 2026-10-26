// Pure triage logic: scoring, severity bands, duplicate detection.
// No I/O here, so it is unit-tested in tests/triage.test.ts.

import type { Category, Severity, VisionFindings, WaterDepth } from "./types";

/** How dangerous each category is on its own (0–40). Life safety first. */
export const CATEGORY_WEIGHT: Record<Category, number> = {
  trapped_or_injured: 40,
  crowd_crush: 35,
  medical_emergency: 30,
  fire: 35,
  gas_or_chemical_leak: 35,
  structural_collapse: 30,
  storm_damage: 25,
  landslide: 30,
  electrical_hazard: 25,
  flood: 20,
  road_blocked: 15,
  relief_needed: 15,
  waterlogging: 10,
  no_emergency: 0,
};

const WATER_WEIGHT: Record<WaterDepth, number> = {
  none: 0,
  ankle: 2,
  knee: 8,
  waist: 15,
  chest_or_more: 22,
  unknown: 0,
};

export interface ScoreInput {
  findings: VisionFindings;
  corroborations: number;
}

export interface ScoreResult {
  score: number;
  severity: Severity;
  primaryCategory: Category;
  needsReview: boolean;
}

export function primaryCategory(categories: Category[]): Category {
  const real = categories.filter((c) => c !== "no_emergency");
  if (real.length === 0) return "no_emergency";
  return real.reduce((best, c) => (CATEGORY_WEIGHT[c] > CATEGORY_WEIGHT[best] ? c : best));
}

export function severityFor(score: number): Severity {
  if (score >= 70) return "critical";
  if (score >= 45) return "high";
  if (score >= 25) return "moderate";
  return "low";
}

export function scoreReport({ findings, corroborations }: ScoreInput): ScoreResult {
  const primary = primaryCategory(findings.categories);
  // Secondary hazards add a little: a flood with a live wire is worse than either alone.
  const secondary = findings.categories
    .filter((c) => c !== primary && c !== "no_emergency")
    .reduce((sum, c) => sum + CATEGORY_WEIGHT[c] * 0.25, 0);

  let score =
    CATEGORY_WEIGHT[primary] +
    secondary +
    (findings.peopleInDanger ? 30 : 0) +
    Math.min(findings.peopleVisible, 10) * 1.5 +
    WATER_WEIGHT[findings.waterDepth] +
    (findings.accessBlocked ? 5 : 0) +
    Math.min(corroborations, 5) * 4; // each independent report adds confidence

  const needsReview = !findings.isRealPhoto || !findings.isDisasterRelated;
  if (needsReview) score *= 0.3; // keep it visible to a human, but out of the top of the queue
  if (primary === "no_emergency") score = Math.min(score, 15);

  score = Math.round(Math.max(0, Math.min(100, score)));
  return { score, severity: severityFor(score), primaryCategory: primary, needsReview };
}

// ── Geography ────────────────────────────────────────────────────────────────

/** Great-circle distance in metres. */
export function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Round to ~110 m so the public map never reveals a family's exact doorstep. */
export function coarsen(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// ── Duplicate detection ──────────────────────────────────────────────────────

/** Hamming distance between two hex perceptual hashes (Cloudinary returns 16 hex chars). */
export function phashDistance(a: string, b: string): number {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let dist = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      dist += x & 1;
      x >>= 1;
    }
  }
  return dist;
}

export interface Candidate {
  publicId: string;
  lat: number;
  lng: number;
  phash: string | null;
  primaryCategory: Category;
  createdAt: string;
  duplicateOf: string | null;
}

export interface MatchResult {
  /** Same photo (forwarded on WhatsApp, re-uploaded): merge into this primary. */
  duplicateOf: string | null;
  /** Different photo, same incident: these primaries gain a corroboration. */
  corroborates: string[];
}

export const DUPLICATE_PHASH_MAX = 10; // of 64 bits
export const DUPLICATE_RADIUS_M = 2000; // forwarded photos often carry a different GPS fix
export const INCIDENT_RADIUS_M = 300;
export const INCIDENT_WINDOW_H = 12;

export function matchReport(
  incoming: { lat: number; lng: number; phash: string | null; primaryCategory: Category; createdAt: string },
  existing: Candidate[],
): MatchResult {
  const primaries = existing.filter((c) => !c.duplicateOf);
  const t = Date.parse(incoming.createdAt);

  // 1. Near-identical image nearby → duplicate of the oldest match.
  if (incoming.phash) {
    const dupes = primaries
      .filter(
        (c) =>
          c.phash &&
          phashDistance(incoming.phash!, c.phash) <= DUPLICATE_PHASH_MAX &&
          haversineMeters(incoming.lat, incoming.lng, c.lat, c.lng) <= DUPLICATE_RADIUS_M,
      )
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    if (dupes.length) return { duplicateOf: dupes[0].publicId, corroborates: [] };
  }

  // 2. Same kind of incident, close by, recent → independent corroboration.
  if (incoming.primaryCategory === "no_emergency") return { duplicateOf: null, corroborates: [] };
  const corroborates = primaries
    .filter(
      (c) =>
        c.primaryCategory === incoming.primaryCategory &&
        haversineMeters(incoming.lat, incoming.lng, c.lat, c.lng) <= INCIDENT_RADIUS_M &&
        Math.abs(t - Date.parse(c.createdAt)) <= INCIDENT_WINDOW_H * 3600_000,
    )
    .map((c) => c.publicId);
  return { duplicateOf: null, corroborates };
}
