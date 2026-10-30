import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Mukta } from "next/font/google";
import Link from "next/link";
import { AccessBar } from "@/components/AccessBar";
import { QuickExit } from "@/components/QuickExit";
import { ShieldMark } from "@/components/ShieldMark";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { LocaleProvider } from "@/components/LocaleProvider";
import { A11Y_KEY, SITE_URL, THEME_KEY } from "@/lib/constants";
import { getI18n } from "@/lib/locale";
import "./globals.css";
import "./shield.css";

// Mukta (Ek Type, Mumbai) carries Latin and Devanagari in one family,
// so Hindi and English text sit on the same baseline.
const mukta = Mukta({
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-mukta",
  display: "swap",
});

const TITLE = "Raahat Shield: prove a morphed photo is fake";
const DESCRIPTION = "Being blackmailed with a morphed photo? Privately prove the face was copied from your real photo, get a police-ready evidence pack, and protect future photos.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: TITLE, template: "%s | Raahat Shield" },
  description: DESCRIPTION,
  applicationName: "Raahat Shield",
  openGraph: { type: "website", siteName: "Raahat Shield", locale: "en_IN", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#3b1f4a" };

// Apply saved display settings (theme, text size, contrast) before first paint.
const PREFS_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")d.dataset.theme=t;var a=JSON.parse(localStorage.getItem("${A11Y_KEY}")||"{}");if(a.text==="sm"||a.text==="lg")d.dataset.text=a.text;if(a.contrast)d.dataset.contrast="high"}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getI18n();
  return (
    <html lang={locale} className={mukta.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body>
        <LocaleProvider locale={locale} t={{ access: t.access, nav: t.nav, report: t.report, check: t.check, severity: t.severity }}>
        <AccessBar />
        <header className="site-header">
          <Link href="/" className="wordmark" aria-label="Raahat Shield: home">
            <ShieldMark size={48} title="" />
            <span className="wordmark-text">
              <span className="wordmark-name">Raahat <span>Shield</span></span>
              <span className="wordmark-sub">Private help against morphed-photo blackmail</span>
            </span>
          </Link>
          <div className="header-actions">
            <a href="tel:1930" className="header-sos">
              <span className="header-sos-label">Cyber crime helpline</span>
              <span className="header-sos-num num">1930</span>
            </a>
            <QuickExit />
          </div>
        </header>
        <SiteNav />
        <div id="main" tabIndex={-1} className="page">
          {children}
        </div>
        <SiteFooter />
        </LocaleProvider>
        <Analytics />
      </body>
    </html>
  );
}
