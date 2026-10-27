// Signs Upload Widget requests so the API secret never reaches the browser,
// and refuses to sign anything that isn't a Raahat report upload.

import { NextResponse } from "next/server";
import { cloudinary, creds } from "@/lib/cloudinary";
import { REPORT_FOLDER, REPORT_TAG } from "@/lib/constants";
import { clientIp, createLimiter, tooMany } from "@/lib/rate-limit";

const limit = createLimiter({ max: 20, windowMs: 60_000 }); // generous for a citizen, not for a bot

export async function POST(req: Request) {
  const rl = limit(clientIp(req));
  if (!rl.ok) return tooMany(rl.retryAfter);
  const { paramsToSign } = (await req.json()) as { paramsToSign: Record<string, string | number> };
  if (paramsToSign.folder !== REPORT_FOLDER || !String(paramsToSign.tags ?? "").includes(REPORT_TAG)) {
    return NextResponse.json({ error: "Only Raahat report uploads can be signed." }, { status: 400 });
  }
  const signature = cloudinary.utils.api_sign_request(paramsToSign, creds.apiSecret);
  return NextResponse.json({ signature });
}
