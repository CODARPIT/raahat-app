// Report repository. Cloudinary is the database: each report is an asset tagged
// `raahat_report`, its fields are contextual metadata, and the dashboard query
// is a Cloudinary Search API call. No separate DB to provision, sync or secure.

import { cloudinary } from "./cloudinary";
import { analysisUrl, thumbUrl } from "./cld-url";
import { matchReport, scoreReport, type Candidate } from "./triage";
import { getFindings } from "./vision";
import {
  CATEGORIES,
  type Category,
  type Report,
  type Status,
  type VisionFindings,
  type WaterDepth,
} from "./types";

import { REPORT_TAG } from "./constants";
export { REPORT_TAG };

type Ctx = Record<string, string>;

interface CldResource {
  public_id: string;
  resource_type: "image" | "video";
  created_at: string;
  bytes: number;
  phash?: string;
  tags?: string[];
  context?: Ctx | { custom?: Ctx };
}

function ctxOf(r: CldResource): Ctx {
  const c = r.context as { custom?: Ctx } | Ctx | undefined;
  if (!c) return {};
  if ("custom" in c && typeof c.custom === "object") return c.custom as Ctx;
  return c as Ctx;
}

const num = (v: string | undefined, d = 0) => (v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);

export function toReport(r: CldResource): Report | null {
  const c = ctxOf(r);
  if (c.score === undefined) return null; // uploaded but not triaged yet
  const cats = (c.cats ?? "").split(",").filter((x): x is Category => (CATEGORIES as readonly string[]).includes(x));
  return {
    publicId: r.public_id,
    resourceType: r.resource_type,
    createdAt: r.created_at,
    lat: num(c.lat),
    lng: num(c.lng),
    note: c.note ?? "",
    lang: c.lang === "hi" ? "hi" : "en",
    categories: cats.length ? cats : ["no_emergency"],
    primaryCategory: (c.primary as Category) ?? "no_emergency",
    severity: (c.severity as Report["severity"]) ?? "low",
    score: num(c.score),
    peopleVisible: num(c.people),
    peopleInDanger: c.danger === "1",
    waterDepth: (c.depth as WaterDepth) ?? "unknown",
    accessBlocked: c.blocked === "1",
    summary: c.summary ?? "",
    summaryHi: c.summary_hi ?? "",
    status: (c.status as Status) ?? "new",
    needsReview: c.review === "1",
    duplicateOf: c.dup_of || null,
    corroborations: num(c.corrob),
    originalBytes: num(c.orig_bytes, r.bytes),
    thumbBytes: num(c.thumb_bytes),
    aiMode: c.ai === "live" ? "live" : "demo",
    phash: c.phash || null,
  };
}

function toContext(r: Report): Ctx {
  return {
    lat: r.lat.toFixed(6),
    lng: r.lng.toFixed(6),
    note: r.note.slice(0, 300),
    lang: r.lang,
    cats: r.categories.join(","),
    primary: r.primaryCategory,
    severity: r.severity,
    score: String(r.score),
    people: String(r.peopleVisible),
    danger: r.peopleInDanger ? "1" : "0",
    depth: r.waterDepth,
    blocked: r.accessBlocked ? "1" : "0",
    summary: r.summary.slice(0, 300),
    summary_hi: r.summaryHi.slice(0, 300),
    status: r.status,
    review: r.needsReview ? "1" : "0",
    dup_of: r.duplicateOf ?? "",
    corrob: String(r.corroborations),
    orig_bytes: String(r.originalBytes),
    thumb_bytes: String(r.thumbBytes),
    ai: r.aiMode,
    phash: r.phash ?? "",
  };
}

/** Tags mirror the key fields so the Media Library itself becomes a usable triage view. */
function toTags(r: Report): string[] {
  return [
    REPORT_TAG,
    `sev_${r.severity}`,
    `status_${r.status}`,
    ...r.categories.map((c) => `cat_${c}`),
    ...(r.needsReview ? ["needs_review"] : []),
    ...(r.duplicateOf ? ["duplicate"] : []),
  ];
}

// Search is eventually consistent and rate-limited, so each server instance
// remembers what it just wrote: fresh writes override a lagging index, and if
// Search fails outright the queue is served from here instead of going blank.
const recent = new Map<string, { report: Report; at: number }>();
const FRESH_MS = 2 * 60_000;
const RECENT_MAX = 500;

function remember(r: Report) {
  recent.delete(r.publicId);
  recent.set(r.publicId, { report: r, at: Date.now() });
  if (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value!);
}

async function save(r: Report) {
  await cloudinary.api.update(r.publicId, {
    resource_type: r.resourceType,
    context: toContext(r),
    tags: toTags(r).join(","),
  } as Record<string, unknown>);
  remember(r);
}

export async function listReports(limit = 200): Promise<Report[]> {
  let found: Report[];
  let searchOk = true;
  try {
    const res = (await cloudinary.search
      .expression(`tags=${REPORT_TAG}`)
      .with_field("context")
      .with_field("tags")
      .sort_by("created_at", "desc")
      .max_results(Math.min(limit, 500))
      .execute()) as { resources: CldResource[] };
    found = res.resources.map(toReport).filter((r): r is Report => r !== null);
  } catch (err) {
    if (recent.size === 0) throw err;
    console.warn("[raahat] Search unavailable, serving recently saved reports:", (err as Error).message);
    found = [];
    searchOk = false;
  }
  const byId = new Map(found.map((r) => [r.publicId, r]));
  const now = Date.now();
  for (const { report, at } of recent.values()) {
    if (!searchOk || now - at < FRESH_MS) byId.set(report.publicId, report);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
}

function findingsOf(r: Report): VisionFindings {
  return {
    categories: r.categories,
    isRealPhoto: !r.needsReview,
    isDisasterRelated: !r.needsReview,
    peopleVisible: r.peopleVisible,
    peopleInDanger: r.peopleInDanger,
    waterDepth: r.waterDepth,
    accessBlocked: r.accessBlocked,
    summary: r.summary,
    summaryHi: r.summaryHi,
    mode: r.aiMode,
  };
}

async function measureBytes(url: string): Promise<number> {
  try {
    const res = await fetch(url); // also warms the CDN for the first responder who opens it
    return (await res.arrayBuffer()).byteLength;
  } catch {
    return 0;
  }
}

export interface TriageInput {
  publicId: string;
  resourceType: "image" | "video";
  lat: number;
  lng: number;
  note: string;
  lang: "en" | "hi";
}

/** The whole pipeline for one fresh upload. */
export async function triage(input: TriageInput): Promise<Report> {
  const asset = (await cloudinary.api.resource(input.publicId, {
    resource_type: input.resourceType,
    phash: input.resourceType === "image",
  })) as CldResource;

  if (!asset.tags?.includes(REPORT_TAG)) throw new Error("Not a Raahat upload.");
  if (ctxOf(asset).score !== undefined) throw new Error("This report was already triaged.");

  const [findings, existing, thumbBytes] = await Promise.all([
    getFindings(analysisUrl(input.publicId, input.resourceType), input.note),
    listReports(),
    measureBytes(thumbUrl({ publicId: input.publicId, resourceType: input.resourceType })),
  ]);

  const createdAt = asset.created_at;
  const firstPass = scoreReport({ findings, corroborations: 0 });
  // Closed reports are hidden from the board, so never merge new ones into them.
  const open = existing.filter((r) => r.status !== "rejected" && r.status !== "resolved");
  const candidates: Candidate[] = open.map((r) => ({
    publicId: r.publicId,
    lat: r.lat,
    lng: r.lng,
    phash: r.phash,
    primaryCategory: r.primaryCategory,
    createdAt: r.createdAt,
    duplicateOf: r.duplicateOf,
  }));
  const match = matchReport(
    { lat: input.lat, lng: input.lng, phash: asset.phash ?? null, primaryCategory: firstPass.primaryCategory, createdAt },
    candidates,
  );

  // A new report that agrees with N earlier reports starts with their corroboration too.
  const corroborations = match.corroborates.length;
  const scored = scoreReport({ findings, corroborations });

  const report: Report = {
    publicId: input.publicId,
    resourceType: input.resourceType,
    createdAt,
    lat: input.lat,
    lng: input.lng,
    note: input.note,
    lang: input.lang,
    categories: findings.categories,
    primaryCategory: scored.primaryCategory,
    severity: scored.severity,
    score: scored.score,
    peopleVisible: findings.peopleVisible,
    peopleInDanger: findings.peopleInDanger,
    waterDepth: findings.waterDepth,
    accessBlocked: findings.accessBlocked,
    summary: findings.summary,
    summaryHi: findings.summaryHi,
    status: match.duplicateOf ? "verified" : "new",
    needsReview: scored.needsReview,
    duplicateOf: match.duplicateOf,
    corroborations,
    originalBytes: asset.bytes,
    thumbBytes,
    aiMode: findings.mode,
    phash: asset.phash ?? null,
  };
  await save(report);

  // Bump the reports this one corroborates (or duplicates) and re-score them.
  const bumpIds = match.duplicateOf ? [match.duplicateOf] : match.corroborates;
  await Promise.all(
    bumpIds.map(async (id) => {
      const target = existing.find((r) => r.publicId === id);
      if (!target) return;
      const corrob = target.corroborations + 1;
      const s = scoreReport({ findings: findingsOf(target), corroborations: corrob });
      await save({ ...target, corroborations: corrob, score: s.score, severity: s.severity });
    }),
  );

  return report;
}

export async function setStatus(
  publicId: string,
  resourceType: "image" | "video",
  status: Status,
): Promise<Report> {
  // Read the asset directly (Search indexes with a short delay).
  const asset = (await cloudinary.api.resource(publicId, { resource_type: resourceType })) as CldResource;
  const target = asset.tags?.includes(REPORT_TAG) ? toReport(asset) : null;
  if (!target) throw new Error("Report not found.");
  const updated = { ...target, status };
  await save(updated);
  return updated;
}
