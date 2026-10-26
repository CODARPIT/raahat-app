// Report repository. Cloudinary is the system of record: each report is an asset
// tagged `raahat_report`, its fields are contextual metadata, and the dashboard query
// is a Cloudinary Search API call. An in-memory cache on top gives read-your-writes
// (Search indexes with a delay) and shields the queue from Search rate limits.
//
// On serverless, instances don't share memory, so the cache only guarantees
// consistency within one instance. A production version would put Redis or Postgres
// here; for a demo, warm the app and keep it on one instance (or run `npm start`).

import { cloudinary } from "./cloudinary";
import { analysisUrl, thumbUrl } from "./cld-url";
import { exifDate, exifLocation, oldPhotoReason } from "./exif";
import { mergeReports } from "./merge";
import { placeHint } from "./place";
import { aiReviewReasons, matchReport, scoreReport, type Candidate } from "./triage";
import { getFindings } from "./vision";
import {
  CATEGORIES,
  type Category,
  type Channel,
  type LocationSource,
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
  image_metadata?: Record<string, unknown>;
}

function ctxOf(r: CldResource): Ctx {
  const c = r.context as { custom?: Ctx } | Ctx | undefined;
  if (!c) return {};
  if ("custom" in c && typeof c.custom === "object") return c.custom as Ctx;
  return c as Ctx;
}

const num = (v: string | undefined, d = 0) => (v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : d);
const numOrNull = (v: string | undefined) => (v !== undefined && v !== "" && !Number.isNaN(Number(v)) ? Number(v) : null);

const LOCATION_SOURCES: LocationSource[] = ["gps", "map_pin", "whatsapp_pin", "exif", "coordinator", "missing"];
const REASON_SEP = " ; ";

/** Reports written before review reasons were stored only kept a flag. */
const LEGACY_REVIEW_REASON = "Flagged by AI for human review";

function findingsOf(r: Pick<Report, "categories" | "peopleVisible" | "peopleInDanger" | "waterDepth" | "accessBlocked" | "summary" | "summaryHi" | "aiMode">): VisionFindings {
  return {
    categories: r.categories,
    isRealPhoto: true,
    isDisasterRelated: true,
    peopleVisible: r.peopleVisible,
    peopleInDanger: r.peopleInDanger,
    waterDepth: r.waterDepth,
    accessBlocked: r.accessBlocked,
    summary: r.summary,
    summaryHi: r.summaryHi,
    placeNames: [],
    mode: r.aiMode,
  };
}

/** Score, severity and "Why this score" always come from the same stored facts. */
function rescore<T extends Report>(r: T): T {
  const s = scoreReport({ findings: findingsOf(r), corroborations: r.corroborations, reviewReasons: r.reviewReasons });
  return { ...r, score: s.score, severity: s.severity, primaryCategory: s.primaryCategory, needsReview: s.needsReview, breakdown: s.breakdown };
}

export function toReport(r: CldResource): Report | null {
  const c = ctxOf(r);
  if (c.score === undefined) return null; // uploaded but not triaged yet
  const cats = (c.cats ?? "").split(",").filter((x): x is Category => (CATEGORIES as readonly string[]).includes(x));
  const lat = numOrNull(c.lat);
  const lng = numOrNull(c.lng);
  const located = lat !== null && lng !== null;
  const reasons = c.reasons ? c.reasons.split(REASON_SEP).filter(Boolean) : c.review === "1" ? [LEGACY_REVIEW_REASON] : [];
  return rescore({
    publicId: r.public_id,
    resourceType: r.resource_type,
    createdAt: r.created_at,
    updatedAt: c.upd || r.created_at,
    channel: c.ch === "whatsapp" ? "whatsapp" : "web",
    lat: located ? lat : null,
    lng: located ? lng : null,
    locationSource: located
      ? LOCATION_SOURCES.includes(c.locsrc as LocationSource) && c.locsrc !== "missing" ? (c.locsrc as LocationSource) : "gps"
      : "missing",
    placeHint: c.place ?? "",
    note: c.note ?? "",
    lang: c.lang === "hi" ? "hi" : "en",
    categories: cats.length ? cats : ["no_emergency"],
    primaryCategory: (c.primary as Category) ?? "no_emergency",
    severity: (c.severity as Report["severity"]) ?? "low",
    score: num(c.score),
    breakdown: [],
    peopleVisible: num(c.people),
    peopleInDanger: c.danger === "1",
    waterDepth: (c.depth as WaterDepth) ?? "unknown",
    accessBlocked: c.blocked === "1",
    summary: c.summary ?? "",
    summaryHi: c.summary_hi ?? "",
    status: (c.status as Status) ?? "new",
    needsReview: reasons.length > 0,
    reviewReasons: reasons,
    duplicateOf: c.dup_of || null,
    corroborations: num(c.corrob),
    originalBytes: num(c.orig_bytes, r.bytes),
    thumbBytes: num(c.thumb_bytes),
    aiMode: c.ai === "live" ? "live" : "demo",
    phash: c.phash || null,
    reporterHash: c.rh || null,
  });
}

function toContext(r: Report): Ctx {
  return {
    upd: r.updatedAt,
    ch: r.channel,
    lat: r.lat === null ? "" : r.lat.toFixed(6),
    lng: r.lng === null ? "" : r.lng.toFixed(6),
    locsrc: r.locationSource,
    place: r.placeHint.slice(0, 200),
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
    reasons: r.reviewReasons.join(REASON_SEP).slice(0, 400),
    dup_of: r.duplicateOf ?? "",
    corrob: String(r.corroborations),
    orig_bytes: String(r.originalBytes),
    thumb_bytes: String(r.thumbBytes),
    ai: r.aiMode,
    phash: r.phash ?? "",
    rh: r.reporterHash ?? "",
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
    ...(r.lat === null ? ["no_location"] : []),
    ...(r.channel === "whatsapp" ? ["ch_whatsapp"] : []),
  ];
}

// ── Cache ────────────────────────────────────────────────────────────────────

const cache = new Map<string, Report>(); // every report this instance wrote or updated
const CACHE_MAX = 1000;
const SEARCH_TTL_MS = 10_000;
let searchCache: { at: number; reports: Report[] } | null = null;

function remember(r: Report) {
  cache.delete(r.publicId);
  cache.set(r.publicId, r);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
}

export const cacheSize = () => cache.size;

async function save(r: Report): Promise<Report> {
  const saved = rescore({ ...r, updatedAt: new Date().toISOString() });
  await cloudinary.api.update(saved.publicId, {
    resource_type: saved.resourceType,
    context: toContext(saved),
    tags: toTags(saved).join(","),
  } as Record<string, unknown>);
  remember(saved);
  return saved;
}

function httpCode(err: unknown): number | undefined {
  const e = err as { http_code?: number; error?: { http_code?: number } };
  return e?.http_code ?? e?.error?.http_code;
}

async function searchReports(limit: number): Promise<Report[]> {
  const run = async () =>
    (await cloudinary.search
      .expression(`tags=${REPORT_TAG}`)
      .with_field("context")
      .with_field("tags")
      .sort_by("created_at", "desc")
      .max_results(Math.min(limit, 500))
      .execute()) as { resources: CldResource[] };
  let res: { resources: CldResource[] };
  try {
    res = await run();
  } catch (err) {
    const code = httpCode(err);
    if (code !== 420 && code !== 429) throw err;
    await new Promise((r) => setTimeout(r, 1200)); // rate-limited: one retry with backoff
    res = await run();
  }
  return res.resources.map(toReport).filter((r): r is Report => r !== null);
}

export interface ReportList {
  reports: Report[];
  /** True when Search failed and the list comes from older or local copies. */
  stale: boolean;
}

export async function listReportsDetailed(limit = 200): Promise<ReportList> {
  let searched: Report[];
  let stale = false;
  if (searchCache && Date.now() - searchCache.at < SEARCH_TTL_MS) {
    searched = searchCache.reports;
  } else {
    try {
      searched = await searchReports(limit);
      searchCache = { at: Date.now(), reports: searched };
    } catch (err) {
      if (!searchCache && cache.size === 0) throw err;
      console.warn("[raahat] Search unavailable, serving cached reports:", (err as Error).message);
      searched = searchCache?.reports ?? [];
      stale = true;
    }
  }
  return { reports: mergeReports(searched, cache.values()).slice(0, limit), stale };
}

export async function listReports(limit = 200): Promise<Report[]> {
  return (await listReportsDetailed(limit)).reports;
}

async function measureBytes(url: string): Promise<number> {
  try {
    const res = await fetch(url); // also warms the CDN for the first responder who opens it
    return (await res.arrayBuffer()).byteLength;
  } catch {
    return 0;
  }
}

/** Open primaries a new or re-located report may merge into. Closed reports are hidden, so never merge into them. */
function candidatesFrom(reports: Report[], exceptId?: string): Candidate[] {
  return reports
    .filter((r) => r.publicId !== exceptId && r.status !== "rejected" && r.status !== "resolved")
    .map((r) => ({
      publicId: r.publicId,
      lat: r.lat,
      lng: r.lng,
      phash: r.phash,
      primaryCategory: r.primaryCategory,
      createdAt: r.createdAt,
      duplicateOf: r.duplicateOf,
    }));
}

/** Add one corroboration to each target and re-score it. */
async function bump(targets: Report[]) {
  await Promise.all(targets.map((t) => save({ ...t, corroborations: t.corroborations + 1 })));
}

export interface TriageInput {
  publicId: string;
  resourceType: "image" | "video";
  lat: number | null;
  lng: number | null;
  locationSource: LocationSource;
  note: string;
  /** The reporter's own words for where they are, when they had no GPS. */
  placeText?: string;
  lang: "en" | "hi";
  channel?: Channel;
  reporterHash?: string | null;
}

/** The whole pipeline for one fresh upload, shared by web and WhatsApp intake. */
export async function triage(input: TriageInput): Promise<Report> {
  const isImage = input.resourceType === "image";
  const asset = (await cloudinary.api.resource(input.publicId, {
    resource_type: input.resourceType,
    phash: isImage,
    image_metadata: isImage,
  })) as CldResource;

  if (!asset.tags?.includes(REPORT_TAG)) throw new Error("Not a Raahat upload.");
  if (ctxOf(asset).score !== undefined) throw new Error("This report was already triaged.");

  // Photos straight from a phone camera often still carry GPS; WhatsApp forwards don't.
  let { lat, lng, locationSource } = input;
  if (lat === null || lng === null) {
    const fromExif = exifLocation(asset.image_metadata);
    lat = fromExif?.lat ?? null;
    lng = fromExif?.lng ?? null;
    locationSource = fromExif ? "exif" : "missing";
  }

  const [findings, existing, thumbBytes] = await Promise.all([
    getFindings(analysisUrl(input.publicId, input.resourceType), input.note),
    listReports(),
    measureBytes(thumbUrl({ publicId: input.publicId, resourceType: input.resourceType })),
  ]);

  const createdAt = asset.created_at;
  const oldPhoto = oldPhotoReason(exifDate(asset.image_metadata), new Date(createdAt));
  const reviewReasons = [...aiReviewReasons(findings), ...(oldPhoto ? [oldPhoto] : [])];
  const firstPass = scoreReport({ findings, corroborations: 0, reviewReasons });
  const match = matchReport(
    { lat, lng, phash: asset.phash ?? null, primaryCategory: firstPass.primaryCategory, createdAt },
    candidatesFrom(existing, input.publicId),
  );

  const draft: Report = {
    publicId: input.publicId,
    resourceType: input.resourceType,
    createdAt,
    updatedAt: createdAt,
    channel: input.channel ?? "web",
    lat,
    lng,
    locationSource,
    placeHint: placeHint(input.note, input.placeText, findings.placeNames),
    note: input.note,
    lang: input.lang,
    categories: findings.categories,
    primaryCategory: firstPass.primaryCategory,
    severity: firstPass.severity,
    score: firstPass.score,
    breakdown: [],
    peopleVisible: findings.peopleVisible,
    peopleInDanger: findings.peopleInDanger,
    waterDepth: findings.waterDepth,
    accessBlocked: findings.accessBlocked,
    summary: findings.summary,
    summaryHi: findings.summaryHi,
    status: match.duplicateOf ? "verified" : "new",
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    duplicateOf: match.duplicateOf,
    // A new report that agrees with N earlier reports starts with their corroboration too.
    corroborations: match.corroborates.length,
    originalBytes: asset.bytes,
    thumbBytes,
    aiMode: findings.mode,
    phash: asset.phash ?? null,
    reporterHash: input.reporterHash ?? null,
  };
  const report = await save(draft);

  // Bump the reports this one corroborates (or duplicates) and re-score them.
  const bumpIds = match.duplicateOf ? [match.duplicateOf] : match.corroborates;
  await bump(existing.filter((r) => bumpIds.includes(r.publicId)));

  return report;
}

/** Read one report straight from the Admin API (strongly consistent, unlike Search). */
async function getReport(publicId: string, resourceType: "image" | "video"): Promise<Report> {
  const asset = (await cloudinary.api.resource(publicId, { resource_type: resourceType })) as CldResource;
  const fromApi = asset.tags?.includes(REPORT_TAG) ? toReport(asset) : null;
  if (!fromApi) throw new Error("Report not found.");
  const cached = cache.get(publicId);
  return cached && Date.parse(cached.updatedAt) > Date.parse(fromApi.updatedAt) ? cached : fromApi;
}

export async function setStatus(publicId: string, resourceType: "image" | "video", status: Status): Promise<Report> {
  const target = await getReport(publicId, resourceType);
  return save({ ...target, status });
}

/**
 * A coordinator places a report on the map. The first time a report gets a location
 * it can also corroborate nearby reports of the same incident (and be corroborated by
 * them); moving the pin later only moves the pin, so nothing is counted twice.
 */
export async function setLocation(publicId: string, resourceType: "image" | "video", lat: number, lng: number): Promise<Report> {
  const target = await getReport(publicId, resourceType);
  const firstLocation = target.lat === null;
  const located: Report = { ...target, lat, lng, locationSource: "coordinator" };
  if (!firstLocation || target.duplicateOf) return save(located);

  const existing = await listReports();
  const match = matchReport(
    { lat, lng, phash: null, primaryCategory: target.primaryCategory, createdAt: target.createdAt },
    candidatesFrom(existing, publicId),
  );
  const saved = await save({ ...located, corroborations: target.corroborations + match.corroborates.length });
  await bump(existing.filter((r) => match.corroborates.includes(r.publicId)));
  return saved;
}
