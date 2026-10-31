"use client";

// "Latest Updates" ticker, as on government portals. Moving text can be paused
// (GIGW requires it), and it stands still for people who prefer reduced motion.

import { useState } from "react";

export function LatestUpdates({ label, items, isNew, pause, play }: {
  label: string;
  items: { text: string; href: string; fresh?: boolean }[];
  isNew: string;
  pause: string;
  play: string;
}) {
  const [paused, setPaused] = useState(false);
  const list = items.map((item, i) => (
    <a key={i} href={item.href} className="gov-ticker-item">
      {item.text}{item.fresh && <span className="gov-new">{isNew}</span>}
    </a>
  ));
  return (
    <div className="gov-ticker" role="region" aria-label={label}>
      <div className="gov-wrap gov-ticker-inner">
        <strong className="gov-ticker-label">{label}</strong>
        <div className="gov-ticker-window">
          <div className={`gov-ticker-track${paused ? " is-paused" : ""}`}>
            <span className="gov-ticker-run">{list}</span>
            <span className="gov-ticker-run" aria-hidden>{list}</span>
          </div>
        </div>
        <button type="button" className="gov-ticker-toggle" aria-pressed={paused} aria-label={paused ? play : pause} onClick={() => setPaused((p) => !p)}>
          {paused ? (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M2 1l7 4-7 4z" fill="currentColor" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden><path d="M1 1h3v8H1zM6 1h3v8H6z" fill="currentColor" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}
