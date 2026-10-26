// Minimal responder gate: one shared control-room passcode, stored as a hashed cookie.
// Good enough for a pilot; see the roadmap for per-responder accounts.

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

export const RESPONDER_COOKIE = "raahat_responder";

export function passcodeToken(passcode: string) {
  return createHash("sha256").update(`raahat:${passcode}`).digest("hex");
}

export async function isResponder(): Promise<boolean> {
  const expected = process.env.RESPONDER_PASSCODE;
  if (!expected) return false;
  const jar = await cookies();
  return jar.get(RESPONDER_COOKIE)?.value === passcodeToken(expected);
}
