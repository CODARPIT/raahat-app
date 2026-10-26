// Situation report (SITREP) helpers: the queue order, summary counts and a CSV export
// that district officials can open in Excel or attach to an email. Pure, so it is
// unit-tested; safe to import on client and server.

import { CATEGORY_LABEL, DEPTH_LABEL, LOCATION_SOURCE_LABEL } from "./labels";
import { isLocated, type Category, type Report, type Severity } from "./types";

/** Same order as the control-room queue: review last, then score, then newest. */
export function byPriority(a: Report, b: Report) {
  return Number(a.needsReview) - Number(b.needsReview) || b.score - a.score || Date.parse(b.createdAt) - Date.parse(a.createdAt);
}

/** Open primary reports (not merged duplicates, not resolved or rejected), highest priority first. */
export function openReports(reports: Report[]): Report[] {
  return reports.filter((r) => !r.duplicateOf && r.status !== "resolved" && r.status !== "rejected").sort(byPriority);
}

export interface SitrepSummary {
  open: number;
  bySeverity: Record<Severity, number>;
  byCategory: { category: Category; count: number }[];
  noLocation: number;
  needsReview: number;
  dispatched: number;
  peopleInDanger: number;
  duplicatesMerged: number;
  resolved: number;
}

export function summarise(reports: Report[]): SitrepSummary {
  const open = openReports(reports);
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, moderate: 0, low: 0 };
  const cats = new Map<Category, number>();
  for (const r of open) {
    bySeverity[r.severity]++;
    cats.set(r.primaryCategory, (cats.get(r.primaryCategory) ?? 0) + 1);
  }
  return {
    open: open.length,
    bySeverity,
    byCategory: [...cats].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    noLocation: open.filter((r) => !isLocated(r)).length,
    needsReview: open.filter((r) => r.needsReview).length,
    dispatched: open.filter((r) => r.status === "dispatched").length,
    peopleInDanger: open.filter((r) => r.peopleInDanger).length,
    duplicatesMerged: reports.filter((r) => r.duplicateOf).length,
    resolved: reports.filter((r) => !r.duplicateOf && r.status === "resolved").length,
  };
}

export function istTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** Quote a CSV cell, and neutralise cells Excel would run as a formula. */
function cell(value: string | number | boolean): string {
  let s = String(value);
  if (/^[=+@\t\r]/.test(s) || /^-[^\d]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const HEADERS = [
  "Priority", "Score", "Severity", "Category", "Status", "Reported (IST)", "Location", "Location source", "Place hint",
  "People visible", "Anyone in danger", "Water depth", "Vehicle access", "Independent reports", "Needs review",
  "Review reasons", "Summary", "Reporter note", "Channel", "Triage", "Report ID",
];

export function reportsToCsv(reports: Report[]): string {
  const rows = [...reports].sort(byPriority).map((r, i) => [
    i + 1,
    r.score,
    r.severity,
    CATEGORY_LABEL[r.primaryCategory],
    r.status,
    istTime(r.createdAt),
    isLocated(r) ? `${r.lat.toFixed(5)} ${r.lng.toFixed(5)}` : "No location",
    LOCATION_SOURCE_LABEL[r.locationSource],
    r.placeHint,
    r.peopleVisible,
    r.peopleInDanger ? "Yes" : "No",
    DEPTH_LABEL[r.waterDepth],
    r.accessBlocked ? "Blocked" : "Passable",
    r.corroborations + 1,
    r.needsReview ? "Yes" : "No",
    r.reviewReasons.join("; "),
    r.summary,
    r.note,
    r.channel === "whatsapp" ? "WhatsApp" : "Web",
    r.aiMode === "live" ? "Cloudinary AI Vision" : "Rule-based",
    r.publicId,
  ]);
  return [HEADERS, ...rows].map((row) => row.map(cell).join(",")).join("\r\n") + "\r\n";
}
