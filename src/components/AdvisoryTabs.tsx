"use client";

// Safety advisories as tabs (Flood / Earthquake / Cyclone / Fire), as on disaster
// management portals. Left/Right arrow keys move between tabs.

import Link from "next/link";
import { useRef, useState } from "react";

export function AdvisoryTabs({ label, items, readMore }: {
  label: string;
  items: { id: string; title: string; tip: string }[];
  readMore: string;
}) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (n: number) => {
    const next = (n + items.length) % items.length;
    setActive(next);
    tabs.current[next]?.focus();
  };
  return (
    <div className="gov-tabs">
      <div role="tablist" aria-label={label} className="gov-tablist">
        {items.map((it, n) => (
          <button
            key={it.id}
            ref={(el) => { tabs.current[n] = el; }}
            type="button"
            role="tab"
            id={`adv-tab-${it.id}`}
            aria-controls={`adv-panel-${it.id}`}
            aria-selected={active === n}
            tabIndex={active === n ? 0 : -1}
            onClick={() => setActive(n)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") { e.preventDefault(); move(n + 1); }
              if (e.key === "ArrowLeft") { e.preventDefault(); move(n - 1); }
            }}
          >
            {it.title}
          </button>
        ))}
      </div>
      {items.map((it, n) => (
        <div key={it.id} role="tabpanel" id={`adv-panel-${it.id}`} aria-labelledby={`adv-tab-${it.id}`} hidden={active !== n} className="gov-tabpanel">
          <p>{it.tip}</p>
          <Link href={`/safety#${it.id}`}>{readMore} »</Link>
        </div>
      ))}
    </div>
  );
}
