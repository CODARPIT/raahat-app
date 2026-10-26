import { errorMessage } from "@/lib/errors";
import { NextResponse } from "next/server";
import { isResponder } from "@/lib/auth";
import { coarsen } from "@/lib/triage";
import { listReportsDetailed, setLocation, setStatus, triage } from "@/lib/reports";
import { clientIp, createLimiter, tooMany } from "@/lib/rate-limit";
import { aiMode, getAiQuota } from "@/lib/vision";
import { isLocated, type LocationSource, type Report, type Status } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // AI Vision + dedupe can take a few seconds

// Each filed report costs AI Vision quota, so one address can file at most 10 a minute.
const fileLimit = createLimiter({ max: 10, windowMs: 60_000 });

/**
 * Public view: no note, place hint, hashes or review reasons, location rounded to
 * ~110 m. Only located, unflagged, unrejected reports are public at all.
 */
function publicView(r: Report): Report {
  return {
    ...r,
    note: "",
    placeHint: "",
    reviewReasons: [],
    lat: r.lat === null ? null : coarsen(r.lat),
    lng: r.lng === null ? null : coarsen(r.lng),
    phash: null,
    reporterHash: null,
    history: [],
  };
}

function isPublic(r: Report) {
  return isLocated(r) && !r.needsReview && r.status !== "rejected";
}

export async function GET() {
  try {
    const [{ reports, stale }, responder] = await Promise.all([listReportsDetailed(), isResponder()]);
    return NextResponse.json({
      responder,
      stale,
      ...(responder ? { ai: { mode: aiMode(), quota: getAiQuota() } } : {}),
      reports: responder ? reports : reports.filter(isPublic).map(publicView),
    });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err), reports: [] }, { status: 500 });
  }
}

const validLatLng = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

export async function POST(req: Request) {
  const rl = fileLimit(clientIp(req));
  if (!rl.ok) return tooMany(rl.retryAfter, "Too many reports from this connection. Please wait a minute and send again.");
  const body = (await req.json()) as Partial<{
    publicId: string;
    resourceType: "image" | "video";
    lat: number | null;
    lng: number | null;
    locationSource: LocationSource;
    place: string;
    note: string;
    lang: "en" | "hi";
  }>;
  if (!body.publicId) {
    return NextResponse.json({ error: "Add a photo to file a report." }, { status: 400 });
  }
  // Location is optional: a report without one is never dropped; the control room pins it.
  const hasLoc = body.lat !== null && body.lat !== undefined && body.lng !== null && body.lng !== undefined;
  const lat = hasLoc ? Number(body.lat) : null;
  const lng = hasLoc ? Number(body.lng) : null;
  if (hasLoc && !validLatLng(lat!, lng!)) {
    return NextResponse.json({ error: "That location doesn't look right. Tap the map again, or choose \"I don't know\"." }, { status: 400 });
  }
  try {
    const report = await triage({
      publicId: body.publicId,
      resourceType: body.resourceType === "video" ? "video" : "image",
      lat,
      lng,
      locationSource: hasLoc ? (body.locationSource === "map_pin" ? "map_pin" : "gps") : "missing",
      placeText: String(body.place ?? "").slice(0, 200),
      note: String(body.note ?? "").slice(0, 500),
      lang: body.lang === "hi" ? "hi" : "en",
      channel: "web",
    });
    return NextResponse.json({ report: publicView(report) });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}

const STATUSES: Status[] = ["new", "verified", "dispatched", "resolved", "rejected"];

/** Responders only: `{ publicId, status }` or `{ publicId, lat, lng }` (coordinator pin). */
export async function PATCH(req: Request) {
  if (!(await isResponder())) {
    return NextResponse.json({ error: "Enter the control-room passcode to change a report." }, { status: 401 });
  }
  const body = (await req.json()) as {
    publicId?: string;
    resourceType?: "image" | "video";
    status?: Status;
    lat?: number;
    lng?: number;
  };
  const resourceType = body.resourceType === "video" ? "video" : "image";
  if (!body.publicId) return NextResponse.json({ error: "Which report? publicId is missing." }, { status: 400 });
  try {
    if (body.lat !== undefined || body.lng !== undefined) {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!validLatLng(lat, lng)) return NextResponse.json({ error: "Click a point on the map to pin this report." }, { status: 400 });
      return NextResponse.json({ report: await setLocation(body.publicId, resourceType, lat, lng) });
    }
    if (!body.status || !STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "Choose a valid status." }, { status: 400 });
    }
    return NextResponse.json({ report: await setStatus(body.publicId, resourceType, body.status) });
  } catch (err) {
    return NextResponse.json({ error: errorMessage(err) }, { status: 500 });
  }
}
