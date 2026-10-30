// Safe for browser and server. No credentials or Google client code here.
import type { ImageReview } from "./types";

export const IMAGE_REVIEW_DELAY_MS = 10_000;
export const IMAGE_REVIEW_STALE_MS = 120_000;

export function decodeImageReview(raw?: string): ImageReview | undefined {
  if (!raw) return undefined;
  try {
    const value = JSON.parse(raw) as ImageReview;
    if (!["pending", "no_clear_signs", "suspected_synthetic", "inconclusive", "unavailable", "not_checked"].includes(value.status)
      || !Number.isFinite(Date.parse(value.requestedAt)) || typeof value.model !== "string" || typeof value.reason !== "string"
      || (value.dueAt !== null && !Number.isFinite(Date.parse(value.dueAt)))
      || (value.checkedAt !== null && !Number.isFinite(Date.parse(value.checkedAt)))) return undefined;
    return { status: value.status, requestedAt: value.requestedAt, dueAt: value.dueAt, checkedAt: value.checkedAt,
      model: value.model.slice(0, 100), reason: value.reason.slice(0, 240),
      ...(value.acceptedAt && Number.isFinite(Date.parse(value.acceptedAt)) ? { acceptedAt: value.acceptedAt } : {}) };
  } catch { return undefined; }
}

export function imageNeedsReview(review?: ImageReview): boolean {
  return review?.status === "suspected_synthetic" && !review.acceptedAt;
}

/** Interrupted background work must not leave a permanent "checking" spinner. */
export function currentImageReview(review?: ImageReview, now = Date.now()): ImageReview | undefined {
  if (review?.status === "pending" && review.dueAt && now > Date.parse(review.dueAt) + IMAGE_REVIEW_STALE_MS) {
    return { ...review, status: "unavailable", reason: "The image assessment did not complete. Responder verification is still needed." };
  }
  return review;
}
