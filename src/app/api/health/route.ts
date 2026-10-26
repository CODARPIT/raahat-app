// Pre-flight check before going on stage: is Cloudinary reachable, which AI mode is
// active, how much AI Vision quota is left, and how warm is this instance's cache.

import { NextResponse } from "next/server";
import { cloudinary } from "@/lib/cloudinary";
import { cacheSize } from "@/lib/reports";
import { aiMode, getAiQuota } from "@/lib/vision";

export const dynamic = "force-dynamic";

export async function GET() {
  let cloudinaryOk = false;
  let cloudinaryError: string | null = null;
  try {
    await cloudinary.api.ping();
    cloudinaryOk = true;
  } catch (err) {
    const e = err as { message?: string; error?: { message?: string } };
    cloudinaryError = e.error?.message ?? e.message ?? "unreachable";
  }
  const quota = getAiQuota();
  return NextResponse.json(
    {
      ok: cloudinaryOk,
      cloudinary: cloudinaryOk ? "reachable" : `error: ${cloudinaryError}`,
      aiMode: aiMode(),
      aiTimeoutMs: Number(process.env.RAAHAT_AI_TIMEOUT_MS) || 15000,
      aiQuota: quota ?? "unknown until the first live AI call",
      responderPasscodeSet: Boolean(process.env.RESPONDER_PASSCODE),
      cacheSize: cacheSize(),
      time: new Date().toISOString(),
    },
    { status: cloudinaryOk ? 200 : 503 },
  );
}
