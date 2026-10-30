import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import { AccessBar } from "@/components/AccessBar";
import { Seal } from "@/components/Seal";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteNav } from "@/components/SiteNav";
import { EmergencyActions } from "@/components/EmergencyActions";
import { LocaleProvider } from "@/components/LocaleProvider";
import { A11Y_KEY, SITE_URL, THEME_KEY } from "@/lib/constants";
import { getI18n } from "@/lib/locale";
import { DICTS } from "@/locales";
import "./globals.css";
import "./portal.css";
import "./gov.css";

const DESCRIPTION = "Citizen disaster reports, triaged by Cloudinary AI and delivered to responders on any network.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "Raahat: disaster report triage", template: "%s | Raahat" },
  description: DESCRIPTION,
  applicationName: "Raahat",
  openGraph: { type: "website", siteName: "Raahat", locale: "en_IN", title: "Raahat: disaster report triage", description: DESCRIPTION },
  twitter: { card: "summary_large_image", title: "Raahat: disaster report triage", description: DESCRIPTION },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0f2f4f" };

// Apply saved display settings before first paint. Light unless someone chose dark,
// like government portals; the Dark button in the top bar still switches.
const PREFS_SCRIPT = `try{var d=document.documentElement,t=localStorage.getItem("${THEME_KEY}");d.dataset.theme=t==="dark"?"dark":"light";var a=JSON.parse(localStorage.getItem("${A11Y_KEY}")||"{}");if(a.text==="sm"||a.text==="lg")d.dataset.text=a.text;if(a.contrast)d.dataset.contrast="high"}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const { locale, t } = await getI18n();
  // The second line under the name: Hindi for English readers, English for everyone else.
  const portalAlt = locale === "en" ? DICTS.hi.header.portal : locale === "hi" ? null : DICTS.en.header.portal;
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: PREFS_SCRIPT }} />
      </head>
      <body>
        <LocaleProvider locale={locale} t={{ access: t.access, nav: t.nav, report: t.report, check: t.check, severity: t.severity }}>
        <AccessBar />
        <div className="tricolour" aria-hidden />
        <header className="site-header">
          <Link href="/" className="wordmark" aria-label={`Raahat, ${t.header.portal}: ${t.nav.home}`}>
            <Seal size={72} title="" id="seal-header" />
            <span className="wordmark-text">
              <span className="wordmark-title"><span className="wordmark-hi" lang="hi">राहत</span><span className="wordmark-divider" aria-hidden /><span className="wordmark-name">RAAHAT</span></span>
              <span className="wordmark-sub">{t.header.portal}</span>
              {portalAlt && <span className="wordmark-sub-hi" lang={locale === "en" ? "hi" : "en"}>{portalAlt}</span>}
            </span>
          </Link>
          <div className="header-contact">
          <span className="header-identity" lang={locale === "hi" ? "hi" : "en"}>{locale === "hi" ? "नागरिक पहल · आपदा सहायता" : "A citizen initiative for disaster assistance"}</span>
          <div className="header-helplines">
          <a href="tel:112" className="header-sos">
            <span className="header-sos-label">{t.header.inDanger}</span>
            <span className="header-sos-num num">112</span>
          </a>
          <a href="tel:1078" className="header-disaster"><span>{t.access.disasterHelpline}</span><strong className="num">1078</strong></a>
          </div>
          </div>
        </header>
        <SiteNav />
        <div id="main" tabIndex={-1} className="page">
          {children}
        </div>
        <SiteFooter t={t} />
        <EmergencyActions />
        </LocaleProvider>
        <Analytics />
      </body>
    </html>
  );
}
