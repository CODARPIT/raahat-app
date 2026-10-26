// Shared types. A "report" is one Cloudinary asset; its fields live in the
// asset's contextual metadata and tags, so Cloudinary is the only datastore.

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
  mode: "live" | "demo";
}

export interface Report {
  publicId: string;
  resourceType: "image" | "video";
  createdAt: string; // ISO
  lat: number;
  lng: number;
  note: string;
  lang: "en" | "hi";
  categories: Category[];
  primaryCategory: Category;
  severity: Severity;
  score: number; // 0–100
  peopleVisible: number;
  peopleInDanger: boolean;
  waterDepth: WaterDepth;
  accessBlocked: boolean;
  summary: string;
  summaryHi: string;
  status: Status;
  needsReview: boolean; // AI thinks it may be fake / unrelated
  duplicateOf: string | null; // publicId of the primary report
  corroborations: number; // independent reports of the same incident
  originalBytes: number;
  thumbBytes: number;
  aiMode: "live" | "demo";
  phash: string | null;
}
