import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Mukta } from "next/font/google";
import Link from "next/link";
import { AccessBar } from "@/components/AccessBar";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { A11Y_KEY, THEME_KEY } from "@/lib/constants";
import "./globals.css";

// Mukta (Ek Type, Mumbai) carries Latin and Devanagari in one family,
// so Hindi and English reports sit on the same baseline.
const mukta = Mukta({
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-mukta",
  display: "swap",
});

const SITE_URL = process.env.PUBLIC_BASE_URL ?? "https://raahat-kappa.vercel.app";
const DESCRIPTION = "Citizen disaster reports, triaged by Cloudinary AI and delivered to responders on any network.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Raahat: disaster report triage", template: "%s | Raahat" },
  description: DESCRIPTION,
  applicationName: "Raahat",
  openGraph: { type: "website", siteName: "Raahat", locale: "en_IN", title: "Raahat: disaster report triage", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Raahat: disaster report triage", description: DESCRIPTION },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#13272c" };

// Apply saved display settings (theme, text size, contrast) before first paint.
const PREFS_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")d.dataset.theme=t;var a=JSON.parse(localStorage.getItem("${A11Y_KEY}")||"{}");if(a.text==="sm"||a.text==="lg")d.dataset.text=a.text;if(a.contrast)d.dataset.contrast="high"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mukta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body>
        <AccessBar />
        <div className="tricolour" aria-hidden />
        <header className="site-header">
          <Link href="/" className="wordmark">
            <span className="gauge sev" data-sev="critical" data-level="3" aria-hidden>
              <span /><span /><span /><span />
            </span>
            <span className="wordmark-text">
              <span className="wordmark-name">Raahat <span lang="hi">राहत</span></span>
              <span className="wordmark-sub">
                Disaster report triage for control rooms · <span lang="hi">आपदा रिपोर्ट सहायता</span>
              </span>
            </span>
          </Link>
          <a href="tel:112" className="header-sos">
            <span className="header-sos-label">In danger? Call</span>
            <span className="header-sos-num num">112</span>
          </a>
        </header>
        <SiteNav />
        <div id="main" tabIndex={-1} className="page">
          {children}
        </div>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
