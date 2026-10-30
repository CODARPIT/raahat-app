// Public fact-check of a report: what anyone holding a /v/<id> link (or an
// Instagram card pointing at one) is allowed to learn. Pure, so it is unit-tested.
//
// "Verified" is a human decision. Triage sets status "verified" on its own when a
// photo duplicates an earlier report, but only a control-room action recorded in
// the audit trail (verified, dispatched or resolved) earns the public badge.

import { REPORT_FOLDER } from "./constants";
import { REASON_NOT_REAL, REASON_UNRELATED } from "./triage";
import { imageConcern } from "./image-review";
import type { Report } from "./types";

export type Verdict = "verified" | "false" | "pending";

/** One line of "What Raahat checked": passed, failed (a red flag), or not known yet. */
export interface Check {
  label: string;
  result: "pass" | "fail" | "open";
}

export interface FactCheck {
  verdict: Verdict;
  checks: Check[];
  verifiedAt: string | null; // ISO, the control room's first confirming action
}

const CONFIRMING = new Set(["verified", "dispatched", "resolved"]);

export function factCheck(r: Pick<Report, "status" | "history" | "reviewReasons" | "corroborations"> & Partial<Pick<Report, "imageReview">>): FactCheck {
  const confirmed = r.history.find((h) => CONFIRMING.has(h.action));
  // An unresolved AI-image concern suspends the public badge; the responder's status stays as it is.
  const verdict: Verdict =
    r.status === "rejected" ? "false" : confirmed && CONFIRMING.has(r.status) && !imageConcern(r) ? "verified" : "pending";

  const has = (prefix: string) => r.reviewReasons.some((x) => x.startsWith(prefix));
  const flag = (failed: boolean, pass: string, fail: string): Check => (failed ? { label: fail, result: "fail" } : { label: pass, result: "pass" });
  const others = r.corroborations;
  const checks: Check[] = [
    flag(has("Matches an older photo"), "Not a known old or recycled disaster photo", "Matches a known old disaster photo"),
    flag(has("Photo taken on"), "Photo date matches the report (when the camera recorded one)", "The camera recorded an older date than the report"),
    flag(has(REASON_NOT_REAL), "Looks like a real camera photo, not a screenshot or edit", "Looks like a screenshot, edit or photo of a screen"),
    flag(has(REASON_UNRELATED), "Shows an emergency or disaster scene", "Doesn't show an emergency or disaster scene"),
    // The model's explanation is never public; only that a check is open.
    ...(imageConcern(r) ? [{ label: "An automated image check raised questions; a responder is reviewing the photo", result: "open" as const }] : []),
    others > 0
      ? { label: `${others} other ${others === 1 ? "person" : "people"} reported the same incident nearby`, result: "pass" }
      : { label: "No other reports of this incident yet", result: "open" },
    verdict !== "pending" ? { label: "Checked by a control-room responder", result: "pass" } : { label: "Not checked by a control-room responder yet", result: "open" },
  ];
  return { verdict, checks, verifiedAt: verdict === "verified" ? confirmed!.at : null };
}

/** Short, URL-safe id for a report: its public ID without the reports folder. */
export function shortId(publicId: string): string {
  return publicId.startsWith(`${REPORT_FOLDER}/`) ? publicId.slice(REPORT_FOLDER.length + 1) : publicId;
}

/**
 * Public IDs a short id may stand for, most likely first; empty for anything that isn't
 * one of ours. Accounts with Cloudinary's dynamic folders don't prefix web uploads with
 * the folder, so the bare id is tried too.
 */
export function publicIdsFrom(id: string): string[] {
  return /^[A-Za-z0-9_-]{1,120}$/.test(id) ? [`${REPORT_FOLDER}/${id}`, id] : [];
}

export const VERDICT_LABEL: Record<Verdict, { en: string; hi: string }> = {
  verified: { en: "Verified by the control room", hi: "नियंत्रण कक्ष द्वारा सत्यापित" },
  false: { en: "False or misleading", hi: "झूठा या भ्रामक" },
  pending: { en: "Not verified yet", hi: "अभी सत्यापित नहीं" },
};
