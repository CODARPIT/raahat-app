// Read-your-writes on top of Cloudinary Search. Search is eventually consistent, so
// the reports this server just wrote are merged over the indexed copies: whichever
// copy was written last wins. Pure, so it is unit-tested.

import type { Report } from "./types";

export function mergeReports(searched: Report[], cached: Iterable<Report>): Report[] {
  const byId = new Map(searched.map((r) => [r.publicId, r]));
  for (const c of cached) {
    const s = byId.get(c.publicId);
    if (!s || Date.parse(c.updatedAt) >= Date.parse(s.updatedAt)) byId.set(c.publicId, c);
  }
  return [...byId.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
