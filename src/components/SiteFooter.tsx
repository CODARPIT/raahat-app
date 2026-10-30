import Link from "next/link";
import type { Dict } from "@/locales/en";
import { LAST_REVIEWED } from "./InfoPage";
import { Seal } from "./Seal";

// Public emergency numbers in India. 112 is the single emergency number;
// 1078 is the NDMA disaster helpline; 1070 reaches the state emergency operations centre.
const HELPLINES = [
  { number: "112", key: "h112" },
  { number: "1078", key: "h1078" },
  { number: "1070", key: "h1070" },
  { number: "108", key: "h108" },
] as const;

export function SiteFooter({ t }: { t: Pick<Dict, "footer" | "nav" | "access"> }) {
  const f = t.footer;
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <section aria-labelledby="f-about">
          <h2 id="f-about">{f.about}</h2>
          <p>{f.aboutText}</p>
        </section>
        <section aria-labelledby="f-links">
          <h2 id="f-links">{f.quickLinks}</h2>
          <ul>
            <li><Link href="/report">{t.nav.report}</Link></li>
            <li><Link href="/map">{t.nav.map}</Link></li>
            <li><Link href="/check">{f.checkPhoto}</Link></li>
            <li><Link href="/respond">{f.controlRoom}</Link></li>
            <li><Link href="/#how">{f.howItWorks}</Link></li>
            <li><Link href="/#privacy">{f.privacySafety}</Link></li>
          </ul>
        </section>
        <section aria-labelledby="f-help">
          <h2 id="f-help">{f.helplines}</h2>
          <ul className="helplines">
            {HELPLINES.map((h) => (
              <li key={h.number}>
                <a href={`tel:${h.number}`} className="num">{h.number}</a>
                <span>{f[h.key]}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="f-policies">
          <h2 id="f-policies">{f.policies}</h2>
          <ul>
            <li><Link href="/accessibility">{f.accessibility}</Link></li>
            <li><Link href="/privacy">{f.privacy}</Link></li>
            <li><Link href="/disclaimer">{f.disclaimer}</Link></li>
            <li><Link href="/help">{t.nav.help}</Link></li>
            <li><Link href="/sitemap">{t.access.sitemap}</Link></li>
          </ul>
        </section>
      </div>
      <nav className="footer-policies" aria-label={f.policies}>
        <Link href="/disclaimer">{f.policies}</Link>
        <Link href="/privacy">{f.privacy}</Link>
        <Link href="/accessibility">{f.accessibility}</Link>
        <Link href="/disclaimer">{f.disclaimer}</Link>
        <Link href="/help">{t.nav.help}</Link>
        <Link href="/sitemap">{t.access.sitemap}</Link>
      </nav>
      <div className="footer-base">
        <div className="footer-brand">
          <Seal size={44} title="" id="seal-footer" />
          <p>{f.owner}</p>
        </div>
        <p className="footer-meta">
          {f.lastReviewed}: {LAST_REVIEWED}
          <br />
          {f.credits}
        </p>
      </div>
    </footer>
  );
}
