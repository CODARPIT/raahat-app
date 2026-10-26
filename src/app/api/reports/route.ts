import { NextResponse } from "next/server";
import { isResponder } from "@/lib/auth";
import { coarsen } from "@/lib/triage";
import { listReports, setStatus, triage } from "@/lib/reports";
import type { Report, Status } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // AI Vision + dedupe can take a few seconds

/** Public view drops the reporter's note and coarsens location to ~110 m. */
function publicView(r: Report) {
  return {
    ...r,
    note: "",
    lat: coarsen(r.lat),
    lng: coarsen(r.lng),
    phash: null,
  };
}

export async function GET() {
  try {
    const reports = await listReports();
    const responder = await isResponder();
    return NextResponse.json({
      responder,
      reports: responder ? reports : reports.filter((r) => !r.needsReview && r.status !== "rejected").map(publicView),
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message, reports: [] }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json()) as Partial<{
    publicId: string;
    resourceType: "image" | "video";
    lat: number;
    lng: number;
    note: string;
    lang: "en" | "hi";
  }>;
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!body.publicId || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return NextResponse.json({ error: "A photo and a location are both needed to file a report." }, { status: 400 });
  }
  try {
    const report = await triage({
      publicId: body.publicId,
      resourceType: body.resourceType === "video" ? "video" : "image",
      lat,
      lng,
      note: String(body.note ?? "").slice(0, 500),
      lang: body.lang === "hi" ? "hi" : "en",
    });
    return NextResponse.json({ report: publicView(report) });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

const STATUSES: Status[] = ["new", "verified", "dispatched", "resolved", "rejected"];

export async function PATCH(req: Request) {
  if (!(await isResponder())) {
    return NextResponse.json({ error: "Enter the control-room passcode to change a report." }, { status: 401 });
  }
  const { publicId, resourceType, status } = (await req.json()) as {
    publicId?: string;
    resourceType?: "image" | "video";
    status?: Status;
  };
  if (!publicId || !status || !STATUSES.includes(status)) {
    return NextResponse.json({ error: "Report and a valid status are required." }, { status: 400 });
  }
  try {
    const report = await setStatus(publicId, resourceType === "video" ? "video" : "image", status);
    return NextResponse.json({ report });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
