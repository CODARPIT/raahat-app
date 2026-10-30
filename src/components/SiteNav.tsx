"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useI18n, type ClientDict } from "@/components/LocaleProvider";
import { ExternalArrow } from "@/components/ExternalArrow";

const LINKS: { href: string; key: keyof ClientDict["nav"] }[] = [
  { href: "/", key: "home" },
  { href: "/report", key: "report" },
  { href: "/map", key: "map" },
  { href: "/check", key: "check" },
  { href: "/safety", key: "safety" },
  { href: "/help", key: "help" },
];

/** Main navigation bar; the current page is marked for screen readers and styled. */
export function SiteNav() {
  const path = usePathname();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <nav className="main-nav" aria-label="Main">
      <div className="portal-nav-inner">
      <button type="button" className="portal-menu-toggle" aria-expanded={open} aria-controls="portal-navigation" onClick={() => setOpen(!open)} aria-label={t.access.sitemap}>
        <span aria-hidden>{open ? "✕" : "☰"}</span> {t.access.sitemap}
      </button>
      <ul id="portal-navigation" className={open ? "is-open" : undefined}>
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} onClick={() => setOpen(false)} aria-current={(l.href === "/" ? path === "/" : path?.startsWith(l.href)) ? "page" : undefined}>
              {l.href === "/" && (
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="nav-home">
                  <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
                </svg>
              )}
              {t.nav[l.key]}
            </Link>
          </li>
        ))}
        <li className="portal-mobile-control"><Link href="/respond" onClick={() => setOpen(false)}>{t.nav.control} <ExternalArrow /></Link></li>
      </ul>
      <Link href="/report" className="portal-nav-report" onClick={() => setOpen(false)} aria-current={path === "/report" ? "page" : undefined}>{t.nav.report} <span aria-hidden>→</span></Link>
      <Link href="/respond" className="portal-nav-login" onClick={() => setOpen(false)} aria-current={path?.startsWith("/respond") ? "page" : undefined}>{t.nav.control} <ExternalArrow /></Link>
      </div>
    </nav>
  );
}
