import Link from "next/link";

// Shared frame for the policy and help pages: breadcrumbs, a title band and a
// "last reviewed" line, as on government portals.
export const LAST_REVIEWED = "28 October 2026";

export function InfoPage({ title, titleHi, children }: { title: string; titleHi?: string; children: React.ReactNode }) {
  return (
    <main className="info-page">
      <div className="info-band">
        <div className="info-band-inner">
          <nav className="crumbs" aria-label="Breadcrumb">
            <ol>
              <li><Link href="/">Home</Link></li>
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
        {children}
        <p className="info-reviewed">Last reviewed: {LAST_REVIEWED}</p>
      </div>
    </main>
  );
}
