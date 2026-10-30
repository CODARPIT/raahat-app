// Incident membership is derived from current report metadata; original evidence
// stays on its own Cloudinary asset. Anchors never move because a new member joins.
import { haversineMeters, incidentRadiusForScore, INCIDENT_WINDOW_H, sameIncidentKind, severityFor } from "./triage";
import { imageConcern, reviewPending } from "./image-review";
import type { Report, Severity } from "./types";

export interface Incident {
  id: string;
  anchorId: string;
  lat: number;
  lng: number;
  radiusM: number;
  severity: Severity;
  score: number;
  reportIds: string[];
  createdAt: string;
  latestAt: string;
  /** A member is still waiting for its image check, so the circle may change. */
  provisional: boolean;
}

function eligible(r: Report): r is Report & { lat: number; lng: number } {
  // A suspected AI image joins no circle until a responder accepts it as evidence.
  return !r.duplicateOf && !r.needsReview && !imageConcern(r) && r.status !== "rejected" && r.status !== "resolved"
    && r.primaryCategory !== "no_emergency" && r.lat !== null && r.lng !== null
    && Number.isFinite(r.lat) && Number.isFinite(r.lng) && Math.abs(r.lat) <= 90 && Math.abs(r.lng) <= 180
    && Number.isFinite(Date.parse(r.createdAt));
}

function severeWithoutCorroboration(r: Report) {
  // Corroboration alone must not turn a minor report into a new incident anchor.
  const baseSeverity = severityFor(r.score - Math.min(r.corroborations, 5) * 4);
  return baseSeverity === "high" || baseSeverity === "critical";
}

export function buildIncidents(reports: Report[]): Incident[] {
  const located = reports.filter(eligible).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.publicId.localeCompare(b.publicId));
  const seeds: typeof located = [];
  const memberships = new Map<string, string>();
  const scores = new Map<string, number>();
  function nearest(report: typeof located[number]) {
    return seeds
      .filter((anchor) => sameIncidentKind(report, anchor)
        && Math.abs(Date.parse(report.createdAt) - Date.parse(anchor.createdAt)) <= INCIDENT_WINDOW_H * 3_600_000)
      .map((anchor) => ({ anchor, distance: haversineMeters(report.lat, report.lng, anchor.lat, anchor.lng) }))
      .filter((match) => match.distance <= incidentRadiusForScore(scores.get(match.anchor.publicId) ?? match.anchor.score))
      .sort((a, b) => a.distance - b.distance || a.anchor.createdAt.localeCompare(b.anchor.createdAt) || a.anchor.publicId.localeCompare(b.anchor.publicId))[0]?.anchor;
  }

  // Establish severe anchors before attaching lower-priority evidence. Never
  // match against a member's position or expand an anchor's categories. Only
  // stronger evidence admitted inside the current circle can widen that circle.
  for (const report of located.filter(severeWithoutCorroboration)) {
    const anchor = nearest(report);
    if (anchor) {
      memberships.set(report.publicId, anchor.publicId);
      scores.set(anchor.publicId, Math.max(scores.get(anchor.publicId) ?? anchor.score, report.score));
    } else { seeds.push(report); memberships.set(report.publicId, report.publicId); scores.set(report.publicId, report.score); }
  }
  let added = true;
  while (added) {
    added = false;
    for (const report of located) {
      if (memberships.has(report.publicId)) continue;
      const anchor = nearest(report);
      if (anchor) {
        memberships.set(report.publicId, anchor.publicId);
        scores.set(anchor.publicId, Math.max(scores.get(anchor.publicId) ?? anchor.score, report.score));
        added = true;
      }
    }
  }
  return seeds.map((anchor) => {
    const members = located.filter((report) => memberships.get(report.publicId) === anchor.publicId);
    const strongest = members.reduce((best, report) => report.score > best.score ? report : best, anchor);
    return {
      id: anchor.publicId, anchorId: anchor.publicId, lat: anchor.lat, lng: anchor.lng,
      radiusM: incidentRadiusForScore(strongest.score), severity: strongest.severity, score: strongest.score,
      reportIds: members.map((report) => report.publicId), createdAt: anchor.createdAt,
      provisional: members.some(reviewPending),
      latestAt: members.reduce((latest, report) => Date.parse(report.createdAt) > Date.parse(latest) ? report.createdAt : latest, anchor.createdAt),
    };
  });
}

export function annotateIncidents(reports: Report[], incidents: Incident[]): Report[] {
  const byReport = new Map(incidents.flatMap((incident) => incident.reportIds.map((id) => [id, incident] as const)));
  return reports.map((report) => {
    const incident = byReport.get(report.publicId);
    return { ...report, incidentId: incident?.id ?? null, incidentRadiusM: incident?.radiusM ?? null, incidentReportCount: incident?.reportIds.length ?? 0 };
  });
}
