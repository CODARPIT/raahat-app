// The uploader's view of their own report, for the result screen to poll while the
// image check runs. Needs the one-hour filing receipt (Authorization: Bearer <receipt>),
// so it works even when a flagged report is no longer public. It returns no location,
// note, contact hash, image URL or model explanation.

import { NextResponse } from "next/server";
import { clientIp, createLimiter, tooMany } from "@/lib/rate-limit";
import { bearer, readReceipt } from "@/lib/receipt";
import { findReport } from "@/lib/reports";

export const dynamic = "force-dynamic";

const limit = createLimiter({ max: 60, windowMs: 60_000 });

export async function GET(req: Request) {
  const rl = limit(clientIp(req));
  if (!rl.ok) return tooMany(rl.retryAfter);
  const receipt = readReceipt(bearer(req));
  if (!receipt) return NextResponse.json({ error: "This receipt is missing or has expired." }, { status: 401 });
  const r = await findReport(receipt.publicId);
  if (!r) return NextResponse.json({ error: "Report not found." }, { status: 404 });
  return NextResponse.json(
    {
      severity: r.severity,
      score: r.score,
      primaryCategory: r.primaryCategory,
      status: r.status,
      duplicate: Boolean(r.duplicateOf),
      corroborations: r.corroborations,
      imageReview: { state: r.imageReview.state, at: r.imageReview.at },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
