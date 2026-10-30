"use client";

import { useI18n } from "./LocaleProvider";
import { currentImageReview, imageNeedsReview } from "@/lib/image-review-state";
import type { ImageReview } from "@/lib/types";

export function ImageReviewPanel({ review, showReason = false }: { review?: ImageReview; showReason?: boolean }) {
  const { t: { report: t } } = useI18n();
  const current = currentImageReview(review);
  if (!current) return null;
  const labels = {
    pending: t.imagePending, no_clear_signs: t.imageNoClearSigns, suspected_synthetic: t.imageSuspected,
    inconclusive: t.imageInconclusive, unavailable: t.imageUnavailable, not_checked: t.imageNotChecked,
  };
  return <section className="image-assessment" data-state={imageNeedsReview(current) ? "review" : current.status} aria-label={t.imageReviewTitle}>
    <h3>{t.imageReviewTitle}</h3>
    <p role="status" aria-live="polite"><strong>{current.acceptedAt ? t.imageAccepted : labels[current.status]}</strong></p>
    {showReason && current.reason && <p className="hint">{current.reason}</p>}
    {current.status === "pending" && <p className="hint">{t.imageReviewDelay}</p>}
    <p className="hint">{t.imageReviewNote}</p>
  </section>;
}
