import Link from "next/link";
import { LAST_REVIEWED } from "./InfoPage";
import { ShieldMark } from "./ShieldMark";

// Helplines for women facing online abuse in India. 1930 is the national cyber crime
// helpline; 181 the women helpline; 7827170170 the National Commission for Women.
const HELPLINES = [
  { number: "1930", label: "Cyber crime helpline (fraud and blackmail)" },
  { number: "181", label: "Women helpline" },
  { number: "7827170170", label: "National Commission for Women (WhatsApp)" },
  { number: "112", label: "Emergency: if you are in danger" },
];

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <section aria-labelledby="f-about">
          <h2 id="f-about">About Raahat Shield</h2>
          <p>
            Raahat Shield helps women being blackmailed with morphed photos prove the image is fake, put together
            evidence police can use, and post future photos more safely. Everything stays private and can be deleted at any time.
          </p>
        </section>
        <section aria-labelledby="f-links">
          <h2 id="f-links">Use Raahat Shield</h2>
          <ul>
            <li><Link href="/case">Prove a photo is fake</Link></li>
            <li><Link href="/case#pack">Build an evidence pack</Link></li>
            <li><Link href="/protect">Protect my photos</Link></li>
            <li><Link href="/#how">How it works</Link></li>
            <li><Link href="/#privacy">Our privacy promise</Link></li>
          </ul>
        </section>
        <section aria-labelledby="f-help">
          <h2 id="f-help">Helplines</h2>
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
          <h2 id="f-policies">Report and remove</h2>
          <ul>
            <li><a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer">cybercrime.gov.in</a></li>
            <li><a href="https://stopncii.org" target="_blank" rel="noreferrer">StopNCII.org</a></li>
            <li><Link href="/help">What to do right now</Link></li>
            <li><Link href="/privacy">Privacy policy</Link></li>
            <li><Link href="/accessibility">Accessibility</Link></li>
          </ul>
        </section>
      </div>
      <div className="footer-base">
        <div className="footer-brand">
          <ShieldMark size={40} title="" />
          <p>
            Raahat Shield is a project for Hacktober HackDays 2026 (SheBuilds Delhi, Tech for Social Good). It is not a
            government or police service and does not give legal advice.
          </p>
        </div>
        <p className="footer-meta">
          Last reviewed: {LAST_REVIEWED}
          <br />
          Private image storage and processing by Cloudinary
        </p>
      </div>
    </footer>
  );
}
