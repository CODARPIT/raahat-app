"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useI18n, type ClientDict } from "@/components/LocaleProvider";

const LINKS: { href: string; key: keyof ClientDict["nav"] }[] = [
  { href: "/", key: "home" },
  { href: "/report", key: "report" },
  { href: "/map", key: "map" },
  { href: "/check", key: "check" },
  { href: "/respond", key: "control" },
  { href: "/safety", key: "safety" },
  { href: "/help", key: "help" },
];

/** Main navigation bar; the current page is marked for screen readers and styled. */
export function SiteNav() {
  const path = usePathname();
  const { t } = useI18n();
  return (
    <nav className="main-nav" aria-label="Main">
      <ul>
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={(l.href === "/" ? path === "/" : path?.startsWith(l.href)) ? "page" : undefined}>
              {l.href === "/" && (
                <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="nav-home">
                  <path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
                </svg>
              )}
              {t.nav[l.key]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
