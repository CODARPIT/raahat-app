"use client";

// Frame for the responder pages: a slim officer strip and a blue sidebar menu, as on
// district dashboards. The dashboard passes its image-review count and filter.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Page = "dashboard" | "dispatch" | "sitrep";

const ICON = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  queue: "M4 6h16M4 12h16M4 18h10",
  dispatch: "M3 7h11v9H3zM14 10h4l3 3v3h-7",
  map: "M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14",
  shield: "M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z",
  sitrep: "M6 3h9l4 4v14H6zM9 12h7M9 16h7",
  csv: "M12 4v11M7 10l5 5 5-5M5 20h14",
  map2: "M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
};

function Ico({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function ControlShell({ active, reviewCount, onImageReview, imageReviewOn, side, children }: {
  active: Page;
  /** Suspected AI images waiting for a responder. */
  reviewCount?: number;
  /** On the dashboard the menu item filters the queue instead of navigating. */
  onImageReview?: () => void;
  imageReviewOn?: boolean;
  /** Extra controls under the menu (the 2G switch). */
  side?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const signOut = async () => {
    setLeaving(true);
    await fetch("/api/responder", { method: "DELETE" }).catch(() => undefined);
    router.refresh();
  };
  const reviewLabel = <>Image Review{reviewCount ? <span className="cr-count num">{reviewCount}</span> : null}</>;

  return (
    <div className="cr">
      <div className="cr-strip">
        <span><strong>Control Room</strong> · District Disaster Response Dashboard · Delhi (demo)</span>
        <span className="cr-strip-user">
          Signed in as <strong>Duty Officer</strong>
          <button type="button" className="cr-btn cr-btn-line" onClick={signOut} disabled={leaving}>{leaving ? "Signing out…" : "Sign out"}</button>
        </span>
      </div>
      <div className="cr-body">
        <nav className="cr-side" aria-label="Control room menu">
          <Link href="/respond" aria-current={active === "dashboard" && !imageReviewOn ? "page" : undefined}><Ico d={ICON.dashboard} />Dashboard</Link>
          <a href={active === "dashboard" ? "#queue" : "/respond#queue"}><Ico d={ICON.queue} />Incident Queue</a>
          <Link href="/respond/dispatch" aria-current={active === "dispatch" ? "page" : undefined}><Ico d={ICON.dispatch} />Dispatch Register</Link>
          <a href={active === "dashboard" ? "#map" : "/respond#map"}><Ico d={ICON.map} />Situation Map</a>
          {onImageReview ? (
            <button type="button" onClick={onImageReview} aria-pressed={imageReviewOn} className={imageReviewOn ? "is-on" : undefined}><Ico d={ICON.shield} />{reviewLabel}</button>
          ) : (
            <Link href="/respond?view=image-review"><Ico d={ICON.shield} />{reviewLabel}</Link>
          )}
          <Link href="/respond/sitrep" aria-current={active === "sitrep" ? "page" : undefined}><Ico d={ICON.sitrep} />Situation Report</Link>
          <a href="/api/reports/export"><Ico d={ICON.csv} />Download Data (CSV)</a>
          <Link href="/map"><Ico d={ICON.map2} />Public Map</Link>
          {side && <div className="cr-side-extra">{side}</div>}
        </nav>
        <main className="cr-main">{children}</main>
      </div>
    </div>
  );
}

/** One counter tile: coloured icon block, big number, label. */
export function Tile({ n, label, color, icon }: { n: number; label: string; color: string; icon: keyof typeof ICON | "alert" | "clock" | "check" | "ring" }) {
  const d =
    icon === "alert" ? "M12 3 2 20h20zM12 10v4M12 17v.5"
      : icon === "clock" ? "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8v4l3 2"
        : icon === "check" ? "m5 12 4 4 10-10"
          : icon === "ring" ? "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z"
            : ICON[icon];
  return (
    <div className="cr-tile">
      <b style={{ background: color }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray={icon === "ring" ? "4 3" : undefined} aria-hidden="true"><path d={d} /></svg></b>
      <span><strong className="num">{n}</strong>{label}</span>
    </div>
  );
}
