// Turns stored reports into dispatch-board rows. Safe to import on client and server.

import type { DispatchReport, UnitType } from "./dispatch";
import { CATEGORY_LABEL } from "./labels";
import type { Report } from "./types";

export type DispatchRow = DispatchReport & { title: string; kind: string; sentAt: string };

/** When help was sent: at once for Critical, otherwise when a responder verified it. */
export function sentAt(r: Pick<Report, "severity" | "createdAt" | "updatedAt" | "history">): string {
  if (r.severity === "critical") return r.createdAt;
  const verified = [...(r.history ?? [])].reverse().find((h) => h.action === "verified" || h.action === "dispatched");
  return verified?.at ?? r.updatedAt ?? r.createdAt;
}

export function rowFromReport(r: Report): DispatchRow {
  const label = CATEGORY_LABEL[r.primaryCategory] ?? r.primaryCategory;
  return {
    publicId: r.publicId,
    severity: r.severity,
    score: r.score,
    status: r.status,
    createdAt: r.createdAt,
    lat: r.lat,
    lng: r.lng,
    primaryCategory: r.primaryCategory,
    categories: r.categories,
    duplicateOf: r.duplicateOf,
    title: r.summary || label,
    kind: [label, r.placeHint].filter(Boolean).join(" · "),
    sentAt: sentAt(r),
  };
}

// Line icons for the three unit types (24×24 viewBox, stroked).
export const UNIT_ICON: Record<UnitType, string> = {
  ambulance: "M3 7h11v9H3zM14 10h4l3 3v3h-7M10 9.5v4M8 11.5h4M7 18.5a1.5 1.5 0 1 0 0-.01M17 18.5a1.5 1.5 0 1 0 0-.01",
  fire: "M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7.5zM6 21h12",
  rescue: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5.6 5.6l3.6 3.6M18.4 5.6l-3.6 3.6M5.6 18.4l3.6-3.6M18.4 18.4l-3.6-3.6",
};
