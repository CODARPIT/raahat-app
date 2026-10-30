// Dispatch board for the control room: help is shared out by severity, nearest
// centre for Critical, centres further away for less urgent reports.
import Link from "next/link";
import { DispatchPanel } from "@/components/DispatchPanel";
import ResponderGate from "@/components/ResponderGate";
import { isResponder } from "@/lib/auth";
import { rowFromReport, type DispatchRow } from "@/lib/dispatch-rows";
import { errorMessage } from "@/lib/errors";
import { listReports } from "@/lib/reports";

export const metadata = { title: "Dispatch board" };
export const dynamic = "force-dynamic";

export default async function DispatchPage() {
  if (!(await isResponder())) return <ResponderGate />;
  let live: DispatchRow[] = [];
  let error: string | null = null;
  try {
    live = (await listReports(500)).map(rowFromReport);
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
      {error && <p className="error" role="alert">Couldn&rsquo;t load reports: {error}. The demo still works.</p>}
      <DispatchPanel live={live} />
    </main>
  );
}
