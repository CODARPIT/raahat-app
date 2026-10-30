// A short-lived filing receipt permits the uploader to poll only their report.
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Report } from "./types";

export function createReportReceipt(report: Pick<Report, "publicId" | "resourceType">, now = Date.now()): string | null {
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!secret) return null;
  const payload = Buffer.from(JSON.stringify({ id: report.publicId, type: report.resourceType, exp: now + 3_600_000 })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`image-review:${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyReportReceipt(token: string, now = Date.now()): Pick<Report, "publicId" | "resourceType"> | null {
  const secret = process.env.CLOUDINARY_API_SECRET;
  if (!secret || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const expected = createHmac("sha256", secret).update(`image-review:${parts[0]}`).digest();
  const actual = Buffer.from(parts[1], "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const body = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    if (typeof body.id !== "string" || !body.id || !["image", "video"].includes(body.type) || !Number.isFinite(body.exp) || body.exp <= now) return null;
    return { publicId: body.id, resourceType: body.type };
  } catch { return null; }
}
