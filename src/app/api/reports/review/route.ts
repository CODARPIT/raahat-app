import { NextResponse } from "next/server";
import { verifyReportReceipt } from "@/lib/report-receipt";
import { currentImageReview } from "@/lib/image-review-state";
import { getReport, listReports } from "@/lib/reports";
import { annotateIncidents, buildIncidents } from "@/lib/incidents";
import { clientIp, createLimiter, tooMany } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const limit = createLimiter({ max: 60, windowMs: 60_000 });

/** The filing receipt can read a minimal result even if the report needs review. */
export async function GET(req: Request) {
  const rl = limit(clientIp(req));
  if (!rl.ok) return tooMany(rl.retryAfter, "Please wait before checking again.");
  const receipt = verifyReportReceipt(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  if (!receipt) return NextResponse.json({ error: "A valid filing receipt is required." }, { status: 401 });
  try {
    const listed = await listReports();
    const report = listed.find((r) => r.publicId === receipt.publicId && r.resourceType === receipt.resourceType)
      ?? await getReport(receipt.publicId, receipt.resourceType);
    const [annotated] = annotateIncidents([report], buildIncidents(listed));
    return NextResponse.json({
      publicId: report.publicId, imageReview: currentImageReview(report.imageReview),
      score: report.score, severity: report.severity, needsReview: report.needsReview,
      incidentId: annotated.incidentId, incidentRadiusM: annotated.incidentRadiusM, incidentReportCount: annotated.incidentReportCount,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The report assessment could not be loaded. Please try again." }, { status: 503 });
  }
}
