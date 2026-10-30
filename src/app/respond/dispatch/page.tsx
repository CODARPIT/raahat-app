// Dispatch board for the control room: help is shared out by severity, nearest
// centre for Critical, centres further away for less urgent reports.
import Link from "next/link";
import { DispatchPanel, type DispatchRow } from "@/components/DispatchPanel";
import ResponderGate from "@/components/ResponderGate";
import { isResponder } from "@/lib/auth";
import { errorMessage } from "@/lib/errors";
import { CATEGORY_LABEL } from "@/lib/labels";
import { listReports } from "@/lib/reports";

export const metadata = { title: "Dispatch board" };
export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  if (!(await isResponder())) return <ResponderGate />;
  let live: DispatchRow[] = [];
  let error: string | null = null;
  try {
    live = (await listReports(500)).map((r) => ({
      publicId: r.publicId,
      severity: r.severity,
      score: r.score,
      status: r.status,
      createdAt: r.createdAt,
      lat: r.lat,
      lng: r.lng,
      primaryCategory: r.primaryCategory,
      categories: r.categories,
      duplicateOf: r.duplicateOf,
      title: r.summary || (CATEGORY_LABEL[r.primaryCategory] ?? r.primaryCategory),
      kind: [CATEGORY_LABEL[r.primaryCategory] ?? r.primaryCategory, r.placeHint].filter(Boolean).join(" · "),
    }));
  } catch (err) {
    error = errorMessage(err);
  }

  return (
    <main className="dispatch">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/respond">Control room</Link></li>
          <li aria-current="page">Dispatch board</li>
        </ol>
      </nav>
      <header className="dispatch-head">
        <p className="sitrep-kicker">Raahat · Dispatch board</p>
        <h1>Who sends help, and why</h1>
        <p className="hint">The most urgent reports get the closest units. Less urgent ones get help from a centre that can spare it, so nearby units stay free for emergencies.</p>
      </header>
      {error && <p className="error" role="alert">Couldn&rsquo;t load reports: {error}. The step-by-step demo still works.</p>}
      <DispatchPanel live={live} />
    </main>
  );
}
