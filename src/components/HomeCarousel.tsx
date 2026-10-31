"use client";

// Home page banner carousel. Slides advance every 8 s; the pause button stops it
// (GIGW), and it never moves on its own for people who prefer reduced motion.

import Link from "next/link";
import { useEffect, useState } from "react";

export interface Slide {
  kicker: string;
  title: string;
  alt?: string; // a second line in Hindi for English readers
  text: string;
  cta: { label: string; href: string };
  cta2?: { label: string; href: string };
  art: "flood" | "card" | "chat";
}

function Art({ kind }: { kind: Slide["art"] }) {
  if (kind === "card") {
    return (
      <svg viewBox="0 0 520 260" className="gov-slide-art" aria-hidden>
        <rect width="520" height="260" fill="#163F75" />
        <g transform="translate(170 18)">
          <rect width="180" height="224" fill="#fff" />
          <rect width="180" height="34" fill="#C1121F" />
          <text x="90" y="22" textAnchor="middle" fill="#fff" fontFamily="Arial" fontWeight="700" fontSize="13">FALSE · DO NOT SHARE</text>
          <g fill="#7B828C">{Array.from({ length: 30 }, (_, i) => <rect key={i} x={(i % 6) * 30} y={34 + Math.floor(i / 6) * 28} width="15" height="14" opacity={(i + Math.floor(i / 6)) % 2 ? 0.55 : 0.9} />)}</g>
          <rect y="174" width="180" height="50" fill="#fff" />
          <rect x="10" y="184" width="130" height="8" fill="#1A2B42" />
          <rect x="10" y="200" width="150" height="6" fill="#9AA4B2" />
          <rect x="10" y="212" width="110" height="6" fill="#9AA4B2" />
        </g>
        <circle cx="430" cy="70" r="34" fill="none" stroke="#F2B05E" strokeWidth="6" />
        <path d="M455 95l28 28" stroke="#F2B05E" strokeWidth="8" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "chat") {
    return (
      <svg viewBox="0 0 520 260" className="gov-slide-art" aria-hidden>
        <rect width="520" height="260" fill="#163F75" />
        <g transform="translate(190 14)">
          <rect width="140" height="232" rx="14" fill="#0B2445" />
          <rect x="8" y="20" width="124" height="196" fill="#E9EEF5" />
          <rect x="16" y="32" width="70" height="44" fill="#7B828C" />
          <rect x="44" y="86" width="80" height="22" rx="4" fill="#fff" />
          <rect x="16" y="116" width="96" height="34" rx="4" fill="#DDF3E5" />
          <rect x="22" y="124" width="70" height="6" fill="#2F5A3C" />
          <rect x="22" y="136" width="50" height="6" fill="#2F5A3C" />
          <rect x="16" y="186" width="108" height="22" rx="4" fill="#F28C28" />
        </g>
        <path d="M80 80l60 30-60 30 12-30z" fill="#9CC8F2" />
        <path d="M400 150l50-20M400 170h56M400 190l50 20" stroke="#F2B05E" strokeWidth="5" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 520 260" className="gov-slide-art" aria-hidden>
      <rect width="520" height="260" fill="#163F75" />
      <g fill="#2A5A96"><rect x="40" y="70" width="90" height="120" /><rect x="150" y="40" width="70" height="150" /><rect x="240" y="90" width="110" height="100" /><rect x="370" y="55" width="80" height="135" /></g>
      <g fill="#F2B05E" opacity=".85"><rect x="58" y="90" width="14" height="14" /><rect x="96" y="90" width="14" height="14" /><rect x="165" y="60" width="12" height="12" /><rect x="192" y="60" width="12" height="12" /><rect x="260" y="110" width="16" height="12" /><rect x="300" y="110" width="16" height="12" /><rect x="388" y="75" width="12" height="12" /><rect x="420" y="75" width="12" height="12" /></g>
      <rect y="170" width="520" height="90" fill="#3D7CC4" />
      <path d="M0 176q20-8 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0" fill="none" stroke="#9CC8F2" strokeWidth="3" />
      <path d="M0 206q20-8 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0 40 0" fill="none" stroke="#9CC8F2" strokeWidth="2" opacity=".7" />
      <path d="M270 196h120l-18 22h-86z" fill="#F28C28" />
      <rect x="300" y="178" width="34" height="18" fill="#fff" />
      <circle cx="455" cy="40" r="20" fill="#FFF3D6" opacity=".9" />
    </svg>
  );
}

export function HomeCarousel({ slides, labels }: {
  slides: Slide[];
  labels: { region: string; previous: string; next: string; pause: string; play: string; slide: string };
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const [still, setStill] = useState(false);
  useEffect(() => setStill(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false), []);
  useEffect(() => {
    if (paused || still || slides.length < 2) return;
    const t = setTimeout(() => setI((n) => (n + 1) % slides.length), 8000);
    return () => clearTimeout(t);
  }, [i, paused, still, slides.length]);
  const go = (n: number) => setI((n + slides.length) % slides.length);
  const s = slides[i];

  return (
    <section className="gov-banner" aria-roledescription="carousel" aria-label={labels.region}>
      <div className="gov-wrap gov-banner-inner" aria-live={paused ? "polite" : "off"}>
        <div className="gov-banner-copy">
          <p className="gov-banner-kicker">{s.kicker}</p>
          <h1>{s.title}</h1>
          {s.alt && <p className="gov-banner-alt" lang="hi">{s.alt}</p>}
          <p className="gov-banner-text">{s.text}</p>
          <div className="gov-banner-actions">
            <Link href={s.cta.href} className="gov-btn gov-btn-saffron">{s.cta.label} »</Link>
            {s.cta2 && <Link href={s.cta2.href} className="gov-btn gov-btn-white">{s.cta2.label}</Link>}
          </div>
        </div>
        <Art kind={s.art} />
      </div>
      <div className="gov-banner-controls">
        <button type="button" onClick={() => go(i - 1)} aria-label={labels.previous}>‹</button>
        {slides.map((_, n) => (
          <button key={n} type="button" className="gov-dot" aria-current={n === i} aria-label={labels.slide.replace("{n}", String(n + 1))} onClick={() => go(n)} />
        ))}
        <button type="button" onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? labels.play : labels.pause}>{paused ? "▶" : "❚❚"}</button>
        <button type="button" onClick={() => go(i + 1)} aria-label={labels.next}>›</button>
      </div>
    </section>
  );
}
