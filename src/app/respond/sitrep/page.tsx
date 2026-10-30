// Printable situation report for district officials: summary counts and every open
// report in priority order. "Print or save as PDF" gives a clean A4 document.
import { errorMessage } from "@/lib/errors";
import Link from "next/link";
import { PrintButton } from "@/components/PrintButton";
import ResponderGate from "@/components/ResponderGate";
import { isResponder } from "@/lib/auth";
import { CATEGORY_LABEL } from "@/lib/labels";
import { listReports } from "@/lib/reports";
import { istTime, openReports, summarise } from "@/lib/sitrep";
import { isLocated, type Severity } from "@/lib/types";

export const metadata = { title: "Situation report" };
export const dynamic = "force-dynamic";

const SEVERITIES: Severity[] = ["critical", "high", "moderate", "low"];

export default async function SitrepPage() {
  if (!(await isResponder())) return <ResponderGate />;
  let reports;
  try {
    reports = await listReports(500);
  } catch (err) {
    return (
      <main className="sitrep">
        <h1>Situation report</h1>
        <p className="error" role="alert">Couldn&rsquo;t load reports: {errorMessage(err)}. Try again in a minute.</p>
      </main>
    );
  }
  const s = summarise(reports);
  const open = openReports(reports);
  const generated = istTime(new Date().toISOString());

  return (
    <main className="sitrep">
      <nav className="crumbs no-print" aria-label="Breadcrumb">
        <ol>
          <li><Link href="/">Home</Link></li>
          <li><Link href="/respond">Control room</Link></li>
          <li aria-current="page">Situation report</li>
        </ol>
      </nav>

      <header className="sitrep-head">
        <div>
          <p className="sitrep-kicker">Raahat · Situation report (SITREP)</p>
          <h1>Open disaster reports</h1>
          <p className="hint">Generated {generated} IST. Locations are exact: share only with response teams.</p>
        </div>
        <div className="sitrep-actions no-print">
          <PrintButton />
          <a className="btn" href="/api/reports/export">Download CSV</a>
        </div>
      </header>

      <section className="sitrep-summary" aria-label="Summary">
        <div className="sitrep-big"><strong className="num">{s.open}</strong><span>open reports</span></div>
        {SEVERITIES.map((sev) => (
          <div key={sev} className="sev" data-sev={sev}>
            <strong className="num sev-text">{s.bySeverity[sev]}</strong>
            <span>{sev}</span>
          </div>
        ))}
        <div><strong className="num">{s.peopleInDanger}</strong><span>with people in danger</span></div>
        <div><strong className="num">{s.dispatched}</strong><span>teams dispatched</span></div>
        <div><strong className="num">{s.noLocation}</strong><span>need a location</span></div>
        <div><strong className="num">{s.needsReview}</strong><span>need human review</span></div>
        <div><strong className="num">{s.duplicatesMerged}</strong><span>forwarded copies merged</span></div>
        <div><strong className="num">{s.resolved}</strong><span>resolved</span></div>
      </section>

      {s.byCategory.length > 0 && (
        <p className="sitrep-cats">
          <strong>By hazard:</strong>{" "}
          {s.byCategory.map((c) => `${CATEGORY_LABEL[c.category]} ${c.count}`).join(" · ")}
        </p>
      )}

      {open.length === 0 ? (
        <p className="empty">No open reports right now.</p>
      ) : (
        <table className="sitrep-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Priority</th>
              <th scope="col">Hazard and summary</th>
              <th scope="col">Location</th>
              <th scope="col">Reported</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {open.map((r, i) => (
              <tr key={r.publicId}>
                <td className="num">{i + 1}</td>
                <td>
                  <span className="sev sev-text" data-sev={r.severity}>{r.severity}</span>
                  <span className="num"> {r.score}</span>
                </td>
                <td>
                  <strong>{CATEGORY_LABEL[r.primaryCategory]}</strong>
                  {r.peopleInDanger && <span className="pill pill-warn">people in danger</span>}
                  {r.needsReview && <span className="pill">needs review</span>}
                  <div className="hint">{r.summary}</div>
                  {r.note && <div className="hint">Reporter: {r.note}</div>}
                </td>
                <td className="num">
                  {isLocated(r) ? `${r.lat.toFixed(4)}, ${r.lng.toFixed(4)}` : <span className="pill pill-warn">No location</span>}
                  {r.placeHint && <div className="hint">{r.placeHint}</div>}
                </td>
                <td>{istTime(r.createdAt)}{r.corroborations > 0 && <div className="hint">{r.corroborations + 1} reports</div>}</td>
                <td>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="sitrep-foot">
        Scores rank reports for attention; they are not a verdict. Every report stays visible to a human. In an emergency, call 112.
      </p>
    </main>
  );
}
