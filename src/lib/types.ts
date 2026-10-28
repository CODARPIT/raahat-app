// Shared types. A "report" is one Cloudinary asset; its fields live in the
// asset's contextual metadata and tags, so Cloudinary is the only datastore.

import type { HistoryEntry } from "./history";
export type { HistoryEntry };

export const CATEGORIES = [
  "trapped_or_injured",
  "crowd_crush",
  "medical_emergency",
  "fire",
  "gas_or_chemical_leak",
  "structural_collapse",
  "storm_damage",
  "landslide",
  "electrical_hazard",
  "flood",
  "road_blocked",
  "relief_needed",
  "waterlogging",
  "no_emergency",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Severity = "critical" | "high" | "moderate" | "low";
export type Status = "new" | "verified" | "dispatched" | "resolved" | "rejected";
export type WaterDepth = "none" | "ankle" | "knee" | "waist" | "chest_or_more" | "unknown";
export type LocationSource = "gps" | "map_pin" | "whatsapp_pin" | "telegram_pin" | "exif" | "coordinator" | "missing";
export type Channel = "web" | "whatsapp" | "telegram";

/** One line of "Why this score". `add` lines sum to the raw score; `adjust` lines are the multiplier and caps. */
export interface ScoreLine {
  label: string;
  points: number;
  kind: "add" | "adjust";
}

/** What the AI (or the demo fallback) concluded about one photo. */
export interface VisionFindings {
  categories: Category[];
  isRealPhoto: boolean;
  isDisasterRelated: boolean;
  peopleVisible: number;
  peopleInDanger: boolean;
  waterDepth: WaterDepth;
  accessBlocked: boolean;
  summary: string; // one sentence, English
  summaryHi: string; // one sentence, Hindi
  placeNames: string[]; // signs, shop names, landmarks the AI could read in the photo
  mode: "live" | "demo";
}

export interface Report {
  publicId: string;
  resourceType: "image" | "video";
  createdAt: string; // ISO
  updatedAt: string; // ISO, last write; between the cache and Search, the newer copy wins
  channel: Channel;
  lat: number | null; // null until the reporter or a coordinator pins it
  lng: number | null;
  locationSource: LocationSource;
  placeHint: string; // place names from the note, the "describe the place" field and the photo
  note: string;
  lang: "en" | "hi";
  categories: Category[];
  primaryCategory: Category;
  severity: Severity;
  score: number; // 0–100
  breakdown: ScoreLine[]; // recomputed from the stored fields, so it always matches the score
  peopleVisible: number;
  peopleInDanger: boolean;
  waterDepth: WaterDepth;
  accessBlocked: boolean;
  summary: string;
  summaryHi: string;
  status: Status;
  needsReview: boolean; // true when there is any review reason
  reviewReasons: string[]; // e.g. "looks like a screenshot", "photo taken on 12 Jul 2024"
  duplicateOf: string | null; // publicId of the primary report
  corroborations: number; // independent reports of the same incident
  originalBytes: number;
  thumbBytes: number;
  aiMode: "live" | "demo";
  phash: string | null;
  reporterHash: string | null; // salted hash of a WhatsApp number or Telegram chat, never the number itself
  history: HistoryEntry[]; // audit trail: filed, status changes, pins (newest last)
}

/** A report that has a location. Only these can corroborate or be drawn on the map. */
export type LocatedReport = Report & { lat: number; lng: number };

export function isLocated<T extends { lat: number | null; lng: number | null }>(r: T): r is T & { lat: number; lng: number } {
  return r.lat !== null && r.lng !== null;
}
