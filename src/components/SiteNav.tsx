"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/report", label: "Report an incident" },
  { href: "/map", label: "Live situation map" },
  { href: "/respond", label: "Control room" },
];

/** Main navigation bar; the current page is marked for screen readers and styled. */
export function SiteNav() {
  const path = usePathname();
  return (
    <nav className="main-nav" aria-label="Main">
      <ul>
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} aria-current={(l.href === "/" ? path === "/" : path?.startsWith(l.href)) ? "page" : undefined}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
