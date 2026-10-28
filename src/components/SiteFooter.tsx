import Link from "next/link";
import { LAST_REVIEWED } from "./InfoPage";
import { Seal } from "./Seal";

// Public emergency numbers in India. 112 is the single emergency number;
// 1078 is the NDMA disaster helpline; 1070 reaches the state emergency operations centre.
const HELPLINES = [
  { number: "112", label: "National emergency (police, fire, ambulance)" },
  { number: "1078", label: "Disaster management helpline (NDMA)" },
  { number: "1070", label: "State emergency operations centre" },
  { number: "108", label: "Ambulance" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <section aria-labelledby="f-about">
          <h2 id="f-about">About Raahat</h2>
          <p>
            Raahat (<span lang="hi">राहत</span>, &ldquo;relief&rdquo;) turns citizen disaster photos into a ranked, de-duplicated,
            privacy-safe queue for district control rooms, so responders reach the most urgent calls first.
          </p>
        </section>
        <section aria-labelledby="f-links">
          <h2 id="f-links">Quick links</h2>
          <ul>
            <li><Link href="/report">Report an incident</Link></li>
            <li><Link href="/map">Live situation map</Link></li>
            <li><Link href="/check">Check a viral photo</Link></li>
            <li><Link href="/respond">Control room (responders)</Link></li>
            <li><Link href="/#how">How Raahat works</Link></li>
            <li><Link href="/#privacy">Privacy and safety</Link></li>
          </ul>
        </section>
        <section aria-labelledby="f-help">
          <h2 id="f-help">Emergency helplines</h2>
          <ul className="helplines">
            {HELPLINES.map((h) => (
              <li key={h.number}>
                <a href={`tel:${h.number}`} className="num">{h.number}</a>
                <span>{h.label}</span>
              </li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="f-policies">
          <h2 id="f-policies">Website policies</h2>
          <ul>
            <li><Link href="/accessibility">Accessibility statement</Link></li>
            <li><Link href="/privacy">Privacy policy</Link></li>
            <li><Link href="/disclaimer">Disclaimer</Link></li>
            <li><Link href="/help">Help &amp; FAQs</Link></li>
            <li><Link href="/sitemap">Sitemap</Link></li>
          </ul>
        </section>
      </div>
      <div className="footer-base">
        <div className="footer-brand">
          <Seal size={44} title="" id="seal-footer" />
          <p>
            Content owned and maintained by the Raahat project team. Raahat is a project built for Hacktober HackDays 2026
            (Tech for Social Good) and is <strong>not an official government service</strong>. If anyone&rsquo;s life is in
            danger, call <a href="tel:112">112</a>.
          </p>
        </div>
        <p className="footer-meta">
          Last reviewed: {LAST_REVIEWED}
          <br />
          Images and AI by Cloudinary · Maps © OpenStreetMap contributors
        </p>
      </div>
    </footer>
  );
}
