// Audit trail for a report: who-did-what-when, kept on the Cloudinary asset itself.
// Stored compactly in one context value ("action@unixSeconds,…", newest last) so it
// stays well under Cloudinary's context size limit. Pure, so it is unit-tested.

export type HistoryAction =
  | "filed"
  | "verified"
  | "dispatched"
  | "resolved"
  | "rejected"
  | "new"
  | "pinned" // a coordinator placed or moved the pin
  | "wa_pin" // the reporter sent a WhatsApp location pin
  | "image_reviewed" // written by the earlier image-check version; kept so old audit trails still read
  | "image_accepted"; // a responder accepted the image as evidence despite the AI image check

export interface HistoryEntry {
  action: HistoryAction;
  at: string; // ISO
}

export const HISTORY_MAX = 12;

const ACTIONS: HistoryAction[] = ["filed", "verified", "dispatched", "resolved", "rejected", "new", "pinned", "wa_pin", "image_reviewed", "image_accepted"];

export const HISTORY_LABEL: Record<HistoryAction, string> = {
  filed: "Report received and triaged",
  verified: "Marked verified",
  dispatched: "Team dispatched",
  resolved: "Marked resolved",
  rejected: "Rejected as false",
  new: "Reopened",
  pinned: "Location pinned by the control room",
  wa_pin: "Location sent by the reporter on WhatsApp",
  image_reviewed: "Gemini visual assessment completed (not a verification)",
  image_accepted: "Image evidence accepted after review",
};

export function encodeHistory(entries: HistoryEntry[]): string {
  return entries
    .slice(-HISTORY_MAX)
    .map((e) => `${e.action}@${Math.round(Date.parse(e.at) / 1000)}`)
    .join(",");
}

export function decodeHistory(raw: string | undefined): HistoryEntry[] {
  if (!raw) return [];
  const out: HistoryEntry[] = [];
  for (const part of raw.split(",")) {
    const [action, secs] = part.split("@");
    const t = Number(secs);
    if (ACTIONS.includes(action as HistoryAction) && Number.isFinite(t) && t > 0) {
      out.push({ action: action as HistoryAction, at: new Date(t * 1000).toISOString() });
    }
  }
  return out;
}

export function addHistory(entries: HistoryEntry[], action: HistoryAction, at = new Date()): HistoryEntry[] {
  return [...entries, { action, at: at.toISOString() }].slice(-HISTORY_MAX);
}
