// Pure triage logic: scoring, severity bands, duplicate detection.
// No I/O here, so it is unit-tested in tests/triage.test.ts.

import { CATEGORY_LABEL } from "./labels";
import type { Category, ScoreLine, Severity, VisionFindings, WaterDepth } from "./types";

/**
 * How dangerous each category is on its own (0–40). The weights follow one rule:
 * threat to life first, then how fast the hazard spreads or escalates, then how
 * much it blocks access to help. They are a starting point meant to be tuned with
 * a real control room; every point a report gets is shown in "Why this score".
 */
export const CATEGORY_WEIGHT: Record<Category, number> = {
  trapped_or_injured: 40, // life at risk now
  crowd_crush: 35, // life at risk, escalates in seconds
  medical_emergency: 30, // one life at risk, usually not spreading
  fire: 35, // spreads in minutes
  gas_or_chemical_leak: 35, // spreads with the wind, invisible
  structural_collapse: 30, // can trap people, aftershocks may bring more down
  storm_damage: 25, // wide damage, mostly after the fact
  landslide: 30, // can trap people, may recur
  electrical_hazard: 25, // lethal near water
  flood: 20, // rising, wide area
  road_blocked: 15, // blocks help
  relief_needed: 15, // basic needs
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

const WATER_LINE: Record<WaterDepth, string> = {
  none: "No water",
  ankle: "Ankle-deep water",
  knee: "Knee-deep water",
  waist: "Waist-deep water",
  chest_or_more: "Chest-deep water or deeper",
  unknown: "Water depth unclear",
};

export const REVIEW_MULTIPLIER = 0.3;
export const NO_EMERGENCY_CAP = 15;

export const REASON_NOT_REAL = "Looks like a screenshot, meme, drawing or photo of a screen";
export const REASON_UNRELATED = "Doesn't look disaster-related";

/** Reasons the AI itself gives for a human to double-check a photo. */
export function aiReviewReasons(findings: Pick<VisionFindings, "isRealPhoto" | "isDisasterRelated">): string[] {
  return [
    ...(findings.isRealPhoto ? [] : [REASON_NOT_REAL]),
    ...(findings.isDisasterRelated ? [] : [REASON_UNRELATED]),
  ];
}

export interface ScoreInput {
  findings: VisionFindings;
  corroborations: number;
  /** Every reason to send this report to human review. Defaults to what the AI flagged. */
  reviewReasons?: string[];
}

export interface ScoreResult {
  score: number;
  severity: Severity;
  primaryCategory: Category;
  needsReview: boolean;
  reviewReasons: string[];
  breakdown: ScoreLine[];
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

const round1 = (n: number) => Math.round(n * 10) / 10;

export function scoreReport({ findings, corroborations, reviewReasons }: ScoreInput): ScoreResult {
  const primary = primaryCategory(findings.categories);
  const lines: ScoreLine[] = [];
  const add = (label: string, points: number) => {
    if (points) lines.push({ label, points: round1(points), kind: "add" });
  };

  add(CATEGORY_LABEL[primary], CATEGORY_WEIGHT[primary]);
  // Secondary hazards add a little: a flood with a live wire is worse than either alone.
  for (const c of new Set(findings.categories)) {
    if (c !== primary && c !== "no_emergency") add(`Also ${CATEGORY_LABEL[c].toLowerCase()}`, CATEGORY_WEIGHT[c] * 0.25);
  }
  if (findings.peopleInDanger) add("Someone in danger", 30);
  const people = Math.min(findings.peopleVisible, 10);
  add(`${people} ${people === 1 ? "person" : "people"} visible`, people * 1.5);
  add(WATER_LINE[findings.waterDepth], WATER_WEIGHT[findings.waterDepth]);
  if (findings.accessBlocked) add("Vehicles can't reach", 5);
  const corrob = Math.min(corroborations, 5); // each independent report adds confidence
  add(`${corrob} other ${corrob === 1 ? "report" : "reports"} of this incident`, corrob * 4);

  const raw = lines.reduce((s, l) => s + l.points, 0);
  let score = raw;

  const reasons = reviewReasons ?? aiReviewReasons(findings);
  const needsReview = reasons.length > 0;
  if (needsReview) {
    // Keep it visible to a human, but out of the top of the queue.
    const next = score * REVIEW_MULTIPLIER;
    lines.push({ label: `${reasons[0]}${reasons.length > 1 ? ` (+${reasons.length - 1} more)` : ""} ×${REVIEW_MULTIPLIER}`, points: round1(next - score), kind: "adjust" });
    score = next;
  }
  if (primary === "no_emergency" && score > NO_EMERGENCY_CAP) {
    lines.push({ label: `No emergency seen, capped at ${NO_EMERGENCY_CAP}`, points: round1(NO_EMERGENCY_CAP - score), kind: "adjust" });
    score = NO_EMERGENCY_CAP;
  }
  if (score > 100) {
    lines.push({ label: "Capped at 100", points: round1(100 - score), kind: "adjust" });
    score = 100;
  }

  score = Math.round(Math.max(0, score));
  return { score, severity: severityFor(score), primaryCategory: primary, needsReview, reviewReasons: reasons, breakdown: lines };
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

// ── Known old photos ─────────────────────────────────────────────────────────

/** A photo from a past disaster that keeps being re-shared as new. */
export interface KnownOldPhoto {
  phash: string;
  caption: string; // e.g. "Bihar floods, August 2017"
}

/**
 * Review reason if the incoming photo is (a forwarded copy of) a known recycled photo.
 * Uses the same perceptual-hash threshold as duplicate detection.
 */
export function knownOldReason(phash: string | null, library: KnownOldPhoto[]): string | null {
  if (!phash) return null;
  let best: { caption: string; d: number } | null = null;
  for (const k of library) {
    const d = phashDistance(phash, k.phash);
    if (d <= DUPLICATE_PHASH_MAX && (!best || d < best.d)) best = { caption: k.caption, d };
  }
  return best ? `Matches an older photo: ${best.caption}` : null;
}

export interface Candidate {
  publicId: string;
  lat: number | null;
  lng: number | null;
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

type Incoming = Omit<Candidate, "publicId" | "duplicateOf">;

/** Distance in metres, or null if either side has no location yet. */
function distance(a: Pick<Candidate, "lat" | "lng">, b: Pick<Candidate, "lat" | "lng">): number | null {
  if (a.lat === null || a.lng === null || b.lat === null || b.lng === null) return null;
  return haversineMeters(a.lat, a.lng, b.lat, b.lng);
}

export function matchReport(incoming: Incoming, existing: Candidate[]): MatchResult {
  const primaries = existing.filter((c) => !c.duplicateOf);
  const t = Date.parse(incoming.createdAt);

  // 1. Near-identical image nearby → duplicate of the oldest match. Forwarded photos
  //    usually arrive without a location, so a missing location doesn't block a merge.
  if (incoming.phash) {
    const dupes = primaries
      .filter((c) => {
        if (!c.phash || phashDistance(incoming.phash!, c.phash) > DUPLICATE_PHASH_MAX) return false;
        const d = distance(incoming, c);
        return d === null || d <= DUPLICATE_RADIUS_M;
      })
      .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
    if (dupes.length) return { duplicateOf: dupes[0].publicId, corroborates: [] };
  }

  // 2. Same kind of incident, close by, recent → independent corroboration.
  //    Only located reports can say they're "close by".
  if (incoming.primaryCategory === "no_emergency") return { duplicateOf: null, corroborates: [] };
  const corroborates = primaries
    .filter((c) => {
      if (c.primaryCategory !== incoming.primaryCategory) return false;
      const d = distance(incoming, c);
      return d !== null && d <= INCIDENT_RADIUS_M && Math.abs(t - Date.parse(c.createdAt)) <= INCIDENT_WINDOW_H * 3600_000;
    })
    .map((c) => c.publicId);
  return { duplicateOf: null, corroborates };
}
