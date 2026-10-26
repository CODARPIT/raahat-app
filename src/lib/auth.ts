// Minimal responder gate: one shared control-room passcode, stored as a hashed cookie.
// Good enough for a pilot; see the roadmap for per-responder accounts.

import { createHash } from "node:crypto";
import { cookies } from "next/headers";

export const RESPONDER_COOKIE = "raahat_responder";

export function passcodeToken(passcode: string) {
  return createHash("sha256").update(`raahat:${passcode}`).digest("hex");
}

// Open for judging: everyone gets the control room without a passcode.
// Set RAAHAT_CONTROL_ROOM_LOCKED=1 to bring the passcode back.
export const controlRoomOpen = () => process.env.RAAHAT_CONTROL_ROOM_LOCKED !== "1";

export async function isResponder(): Promise<boolean> {
  if (controlRoomOpen()) return true;
  const expected = process.env.RESPONDER_PASSCODE;
  if (!expected) return false;
  const jar = await cookies();
  return jar.get(RESPONDER_COOKIE)?.value === passcodeToken(expected);
}
