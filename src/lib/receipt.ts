// One-hour filing receipt: lets the person who filed a report follow its image
// assessment even after a flagged report leaves the public feed. It is an HMAC over
// the report id and expiry, so it can't be forged or pointed at another report.

import { createHmac, timingSafeEqual } from "node:crypto";

export const RECEIPT_TTL_MS = 60 * 60_000;

interface Claims {
  p: string; // publicId
  t: "image" | "video";
  e: number; // expiry, unix seconds
}

const secret = () => process.env.RAAHAT_RECEIPT_SECRET || process.env.CLOUDINARY_API_SECRET || "";
const sign = (body: string, key: string) => createHmac("sha256", `raahat-receipt:${key}`).update(body).digest("base64url");

export function issueReceipt(publicId: string, resourceType: "image" | "video", now = Date.now()): string | null {
  const key = secret();
  if (!key) return null;
  const body = Buffer.from(JSON.stringify({ p: publicId, t: resourceType, e: Math.floor((now + RECEIPT_TTL_MS) / 1000) } satisfies Claims)).toString("base64url");
  return `${body}.${sign(body, key)}`;
}

export function readReceipt(token: string | null | undefined, now = Date.now()): { publicId: string; resourceType: "image" | "video" } | null {
  const key = secret();
  if (!key || !token) return null;
  const [body, mac, extra] = token.split(".");
  if (!body || !mac || extra !== undefined) return null;
  const expected = Buffer.from(sign(body, key));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Claims;
    if (typeof c.p !== "string" || (c.t !== "image" && c.t !== "video") || !(c.e * 1000 > now)) return null;
    return { publicId: c.p, resourceType: c.t };
  } catch {
    return null;
  }
}

/** "Authorization: Bearer <receipt>" → the receipt, if present. */
export function bearer(req: Request): string | null {
  return req.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? null;
}
