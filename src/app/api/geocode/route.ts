// Responders only: turn a report's place hint into a suggested (dashed) pin.
import { NextResponse } from "next/server";
import { isResponder } from "@/lib/auth";
import { geocodeHint } from "@/lib/geocode";
import { clientIp, createLimiter, tooMany } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Nominatim's usage policy asks for restraint; this also keeps one tab from hammering it.
const limit = createLimiter({ max: 30, windowMs: 60_000 });

export async function GET(req: Request) {
  if (!(await isResponder())) {
    return NextResponse.json({ error: "Enter the control-room passcode first." }, { status: 401 });
  }
  const rl = limit(clientIp(req));
  if (!rl.ok) return tooMany(rl.retryAfter);
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const lat = Number(url.searchParams.get("lat"));
  const lng = Number(url.searchParams.get("lng"));
  const near = url.searchParams.has("lat") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  return NextResponse.json({ suggestion: await geocodeHint(q, near) });
}
