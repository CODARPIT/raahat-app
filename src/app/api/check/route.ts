// "Is this viral photo real?" for the /check page. The photo is shrunk on the phone,
// hashed by Cloudinary, compared with every report and the known-old library, and
// deleted straight away.

import { NextResponse } from "next/server";
import { checkPhoto } from "@/lib/check";
import { errorMessage } from "@/lib/errors";
import { clientIp, createLimiter, tooMany } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const limit = createLimiter({ max: 10, windowMs: 60_000 });
const MAX_BYTES = 4_000_000; // under Vercel's 4.5 MB request limit; the page shrinks photos first

export async function POST(req: Request) {
  const rl = limit(clientIp(req));
  if (!rl.ok) return tooMany(rl.retryAfter, "Too many checks from this connection. Please wait a minute.");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof Blob) || !file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Choose a photo or screenshot to check." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "That image is too large. Try a screenshot instead." }, { status: 413 });
  }
  try {
    const data = Buffer.from(await file.arrayBuffer()).toString("base64");
    return NextResponse.json(await checkPhoto(`data:${file.type};base64,${data}`));
  } catch (err) {
    return NextResponse.json({ error: `The check didn't go through: ${errorMessage(err)}` }, { status: 503 });
  }
}
