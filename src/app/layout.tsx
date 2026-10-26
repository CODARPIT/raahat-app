import type { Metadata, Viewport } from "next";
import { Mukta } from "next/font/google";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { THEME_KEY } from "@/lib/constants";
import "./globals.css";

// Mukta (Ek Type, Mumbai) carries Latin and Devanagari in one family,
// so Hindi and English reports sit on the same baseline.
const mukta = Mukta({
  subsets: ["latin", "devanagari"],
  weight: ["400", "500", "700", "800"],
  variable: "--font-mukta",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Raahat",
  description: "Citizen disaster reports, triaged by Cloudinary AI and delivered to responders on any network.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#13272c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={mukta.variable} suppressHydrationWarning>
      <head>
        {/* Apply a saved light/dark choice before first paint. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`,
          }}
        />
      </head>
      <body>
        <header className="site-header">
          <Link href="/" className="wordmark">
            <span className="gauge sev" data-sev="critical" data-level="3" style={{ height: 26 }} aria-hidden>
              <span /><span /><span /><span />
            </span>
            Raahat <small lang="hi">राहत</small>
          </Link>
          <nav className="site-nav" aria-label="Main">
            <Link href="/report">Report</Link>
            <Link href="/map">Live map</Link>
            <Link href="/respond">Control room</Link>
            <ThemeToggle />
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
