// Reading the EXIF that Cloudinary returns with `image_metadata: true`.
// WhatsApp strips EXIF, but photos uploaded straight from a phone camera often keep
// GPS and the capture date, which gives a free location and an old-photo check.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const OLD_PHOTO_DAYS = 7;

/** "28 deg 36' 50.04\" N", "28.6139", "28,36,50.04" → signed decimal degrees. */
export function parseCoordinate(value: unknown, ref?: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  const nums = value.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
  if (!nums.length) return null;
  const [d, m = 0, s = 0] = nums;
  let deg = Math.abs(d) + m / 60 + s / 3600;
  const hemi = `${value} ${typeof ref === "string" ? ref : ""}`.match(/\b([NSEW])\b/i)?.[1]?.toUpperCase();
  if (d < 0 || hemi === "S" || hemi === "W") deg = -deg;
  return deg;
}

export function exifLocation(meta: Record<string, unknown> | undefined): { lat: number; lng: number } | null {
  if (!meta) return null;
  const lat = parseCoordinate(meta.GPSLatitude, meta.GPSLatitudeRef);
  const lng = parseCoordinate(meta.GPSLongitude, meta.GPSLongitudeRef);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (lat === 0 && lng === 0) return null; // cameras write 0,0 when they have no fix
  return { lat, lng };
}

/** EXIF dates look like "2024:07:12 10:20:33" (camera local time; treated as UTC, a day either way is fine). */
export function exifDate(meta: Record<string, unknown> | undefined): Date | null {
  const raw = meta?.DateTimeOriginal ?? meta?.CreateDate ?? meta?.DateTime;
  if (typeof raw !== "string") return null;
  const m = raw.match(/^(\d{4})[:-](\d{2})[:-](\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  const date = new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s));
  return Number.isNaN(date.getTime()) || +y < 1990 ? null : date;
}

export function formatDay(date: Date): string {
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** A review reason if the photo was taken more than a week before it was reported. */
export function oldPhotoReason(taken: Date | null, reportedAt: Date): string | null {
  if (!taken) return null;
  const days = (reportedAt.getTime() - taken.getTime()) / 86_400_000;
  return days > OLD_PHOTO_DAYS ? `Photo taken on ${formatDay(taken)}` : null;
}
