import Link from "next/link";
import { getI18n } from "@/lib/locale";

// Shared frame for the policy and help pages: breadcrumbs, a title band and a
// "last reviewed" line, as on government portals.
export const LAST_REVIEWED = "31 October 2026";

/**
 * `translated` pages carry their own text in every language; the rest (policies, safety)
 * are written in English with Hindi, and say so to readers of other languages.
 */
export async function InfoPage({
  title,
  titleHi,
  translated = false,
  children,
}: {
  title: string;
  titleHi?: string;
  translated?: boolean;
  children: React.ReactNode;
}) {
  const { locale, t } = await getI18n();
  return (
    <main className="info-page">
      <div className="info-band">
        <div className="info-band-inner">
          <nav className="crumbs" aria-label="Breadcrumb">
            <ol>
              <li><Link href="/">{t.nav.home}</Link></li>
              <li aria-current="page">{title}</li>
            </ol>
          </nav>
          <h1>
            {title}
            {titleHi && <span lang="hi"> · {titleHi}</span>}
          </h1>
        </div>
      </div>
      <div className="info-body">
        {!translated && locale !== "en" && locale !== "hi" && (
          <p className="notice-inline" lang={locale}>{t.page.onlyEnHi}</p>
        )}
        {/* English text stays marked as English inside a page in another language. */}
        {!translated && locale !== "en" ? <div lang="en">{children}</div> : children}
        <p className="info-reviewed">{t.page.lastReviewed}: {LAST_REVIEWED}</p>
      </div>
    </main>
  );
}
