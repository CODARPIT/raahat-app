"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Home" },
  { href: "/case", label: "Prove it's fake" },
  { href: "/case#pack", label: "Evidence pack" },
  { href: "/protect", label: "Protect my photos" },
  { href: "/help", label: "Get help now" },
];

/** Main navigation bar; the current page is marked for screen readers and styled. */
export function SiteNav() {
  const path = usePathname();
  return (
    <nav className="main-nav" aria-label="Main">
      <ul>
        {LINKS.map((l) => {
          const base = l.href.split("#")[0];
          const current = !l.href.includes("#") && (base === "/" ? path === "/" : path?.startsWith(base));
          return (
            <li key={l.href}>
              <Link href={l.href} aria-current={current ? "page" : undefined}>{l.label}</Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
