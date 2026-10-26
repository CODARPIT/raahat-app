import { NextResponse } from "next/server";
import { passcodeToken, RESPONDER_COOKIE } from "@/lib/auth";

export async function POST(req: Request) {
  const { passcode } = (await req.json()) as { passcode?: string };
  const expected = process.env.RESPONDER_PASSCODE;
  if (!expected || passcode !== expected) {
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
