"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { HomeMap } from "@/components/HomeMap";
import { ExternalArrow } from "@/components/ExternalArrow";

type Slide = { tab: string; title: string; text: string; action: string; href: string };

/** Manual tabs avoid moving text and keep the portal usable on slow connections. */
export function PortalBanner({ slides, label, mapUnavailableLabel, reportCountLabel }: {
  slides: Slide[];
  label: string;
  mapUnavailableLabel: string;
  reportCountLabel: string;
}) {
  const mapIndex = slides.findIndex((slide) => slide.href === "/map");
  const [active, setActive] = useState(Math.max(0, mapIndex));
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={slide.href === "/map" ? "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14" : slide.href === "/report" ? "M3 11l9-8 9 8M5 10v11h5v-7h4v7h5V10" : "M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M15 15l6 6 M7 10l2 2 4-4"} /></svg>
            {slide.tab}
          </button>
        ))}
      </div>
      {slides.map((slide, i) => (
        <div className={`portal-banner-panel${i === mapIndex ? " portal-banner-map-panel" : ""}`} key={slide.href} id={`portal-panel-${i}`}
          role="tabpanel" aria-labelledby={`portal-tab-${i}`} hidden={active !== i}>
          {i === mapIndex ? <>
            <div className="portal-map-heading">
              <h1>{slide.title}</h1>
              <Link href={slide.href}>{slide.action} <ExternalArrow /></Link>
            </div>
            {active === i && <HomeMap unavailableLabel={mapUnavailableLabel} reportCountLabel={reportCountLabel} privacyNote={slide.text} />}
          </> :
          <div className="portal-banner-copy">
            {i === 0 ? <h1>{slide.title}</h1> : <h2>{slide.title}</h2>}
            <p>{slide.text}</p>
            <Link className="btn btn-primary" href={slide.href}>{slide.action}<span aria-hidden> →</span></Link>
          </div>
          }
        </div>
      ))}
    </section>
  );
}
