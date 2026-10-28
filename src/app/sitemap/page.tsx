import Link from "next/link";
import { InfoPage } from "@/components/InfoPage";

export const metadata = { title: "Sitemap" };

const SECTIONS: { heading: string; links: { href: string; label: string; note: string }[] }[] = [
  {
    heading: "For citizens",
    links: [
      { href: "/report", label: "Report an incident", note: "Send a photo and your location, in Hindi or English" },
      { href: "/map", label: "Live situation map", note: "Public map with faces pixelated and locations rounded" },
      { href: "/safety", label: "Safety advisories", note: "Do's and don'ts for floods, earthquakes, cyclones and fire" },
      { href: "/help", label: "Help & FAQs", note: "How reporting works and what happens next" },
    ],
  },
  {
    heading: "For control rooms",
    links: [
      { href: "/respond", label: "Control room", note: "Ranked queue, map and report details (passcode)" },
      { href: "/respond/sitrep", label: "Situation report", note: "Printable summary of open reports (passcode)" },
    ],
  },
  {
    heading: "About this site",
    links: [
      { href: "/", label: "Home", note: "What Raahat is and how it works" },
      { href: "/accessibility", label: "Accessibility statement", note: "Screen readers, text size, contrast" },
      { href: "/privacy", label: "Privacy policy", note: "What we collect and who can see it" },
      { href: "/disclaimer", label: "Disclaimer", note: "Not an official government service" },
    ],
  },
];

export default function SitemapPage() {
  return (
    <InfoPage title="Sitemap" titleHi="साइट मानचित्र">
      <div className="sitemap">
        {SECTIONS.map((s) => (
          <section key={s.heading}>
            <h2>{s.heading}</h2>
            <ul>
              {s.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href}>{l.label}</Link>
                  <span>{l.note}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </InfoPage>
  );
}
