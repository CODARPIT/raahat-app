"use client";

import Link from "next/link";
import { useRef, useState } from "react";

type Slide = { tab: string; title: string; text: string; action: string; href: string };

/** Manual tabs avoid moving text and keep the portal usable on slow connections. */
export function PortalBanner({ slides, label }: { slides: Slide[]; label: string }) {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <section className="portal-banner" aria-label={label}>
      <div className="portal-banner-tabs" role="tablist" aria-label={label}>
        {slides.map((slide, i) => (
          <button key={slide.href} ref={(el) => { tabs.current[i] = el; }} type="button"
            role="tab" id={`portal-tab-${i}`} aria-controls={`portal-panel-${i}`}
            aria-selected={active === i} tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)} onKeyDown={(event) => {
              let next = i;
              if (event.key === "ArrowRight") next = (i + 1) % slides.length;
              else if (event.key === "ArrowLeft") next = (i + slides.length - 1) % slides.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = slides.length - 1;
              else return;
              event.preventDefault();
              setActive(next);
              tabs.current[next]?.focus();
            }}>
            <span className="portal-tab-number" aria-hidden>{String(i + 1).padStart(2, "0")}</span>
            {slide.tab}
          </button>
        ))}
      </div>
      {slides.map((slide, i) => (
        <div className="portal-banner-panel" key={slide.href} id={`portal-panel-${i}`}
          role="tabpanel" aria-labelledby={`portal-tab-${i}`} hidden={active !== i}>
          <div className="portal-banner-copy">
            {i === 0 ? <h1>{slide.title}</h1> : <h2>{slide.title}</h2>}
            <p>{slide.text}</p>
            <Link className="btn btn-primary" href={slide.href}>{slide.action}<span aria-hidden> →</span></Link>
          </div>
        </div>
      ))}
    </section>
  );
}
