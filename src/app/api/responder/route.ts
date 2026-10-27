import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { passcodeToken, RESPONDER_COOKIE } from "@/lib/auth";
import { clientIp, createLimiter, tooMany } from "@/lib/rate-limit";

// Five wrong guesses per 10 minutes per address, so the passcode can't be brute-forced.
const attempts = createLimiter({ max: 5, windowMs: 10 * 60_000 });

function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function POST(req: Request) {
  const { passcode } = (await req.json().catch(() => ({}))) as { passcode?: string };
  const expected = process.env.RESPONDER_PASSCODE;
  if (!expected || typeof passcode !== "string" || !sameSecret(passcode, expected)) {
    const rl = attempts(clientIp(req));
    if (!rl.ok) return tooMany(rl.retryAfter, `Too many wrong passcodes. Try again in ${Math.ceil(rl.retryAfter / 60)} min.`);
    return NextResponse.json({ error: "That passcode didn't match. Ask your control-room lead." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(RESPONDER_COOKIE, passcodeToken(expected), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12, // one shift
    path: "/",
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(RESPONDER_COOKIE);
  return res;
}
