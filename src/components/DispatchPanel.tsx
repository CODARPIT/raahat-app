"use client";

// Dispatch board: which centre sends help to which report, and why. "Live" runs
// the rules on the real open reports; "Drill" steps through a scripted scenario
// with sample reports (nothing is saved) to show the rules at work.

import { useMemo, useState } from "react";
import { assignAll, DEMO_CENTRES, UNIT_LABEL, type Assignment, type DispatchReport } from "@/lib/dispatch";
import type { Severity } from "@/lib/types";

export type DispatchRow = DispatchReport & { title: string };

const SEV_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", moderate: "Moderate", low: "Low" };
const SEV_COLOR: Record<Severity, string> = { critical: "#b3122e", high: "#d98e04", moderate: "#2c6e6a", low: "#6e7f7a" };

// Delhi, roughly: the map is drawn to scale inside this box.
const BOX = { minLat: 28.53, maxLat: 28.7, minLng: 77.02, maxLng: 77.33 };
const W = 800;
const H = Math.round((W * (BOX.maxLat - BOX.minLat)) / ((BOX.maxLng - BOX.minLng) * Math.cos((28.6 * Math.PI) / 180)));
const px = (lat: number, lng: number) => ({
  x: ((lng - BOX.minLng) / (BOX.maxLng - BOX.minLng)) * W,
  y: ((BOX.maxLat - lat) / (BOX.maxLat - BOX.minLat)) * H,
});

function at(lat: number, lng: number) {
  return { lat, lng };
}
let seq = 0;
function sample(title: string, severity: Severity, status: DispatchReport["status"], where: { lat: number; lng: number }, cats: DispatchReport["categories"]): DispatchRow {
  seq += 1;
  return {
    publicId: `drill-${seq}`,
    title,
    severity,
    score: { critical: 85, high: 62, moderate: 38, low: 16 }[severity],
    status,
    createdAt: `2026-10-31T09:${String(seq).padStart(2, "0")}:00Z`,
    lat: where.lat,
    lng: where.lng,
    primaryCategory: cats[0],
    categories: cats,
    duplicateOf: null,
  };
}

const R = {
  low: sample("Fallen tree, one person hurt (Mandi House)", "low", "verified", at(28.626, 77.234), ["trapped_or_injured", "storm_damage"]),
  m1: sample("Wall collapse, two injured (ITO)", "moderate", "verified", at(28.631, 77.245), ["trapped_or_injured", "structural_collapse"]),
  m2: sample("Injured cyclist in waterlogging (Pragati Maidan)", "moderate", "verified", at(28.618, 77.243), ["trapped_or_injured", "waterlogging"]),
  c1: sample("Person trapped under debris (Daryaganj)", "critical", "new", at(28.642, 77.239), ["trapped_or_injured", "structural_collapse"]),
  c2: sample("Bus accident, many injured (ITO crossing)", "critical", "new", at(28.628, 77.248), ["trapped_or_injured", "road_blocked"]),
  fire: sample("Shop fire (Chandni Chowk)", "high", "verified", at(28.656, 77.231), ["fire"]),
};

const DRILL: { text: string; reports: DispatchRow[] }[] = [
  { text: "Five demo centres across Delhi, each with ambulances, fire tenders and rescue teams. No reports yet.", reports: [] },
  { text: "A Low report near ITO. ITO keeps its ambulances for urgent calls, so help comes from Lajpat Nagar, which has more to spare.", reports: [R.low] },
  { text: "A Moderate report at ITO. ITO has 2 ambulances, so it can send one and still keep one free.", reports: [R.low, R.m1] },
  { text: "A second Moderate report nearby. ITO's last ambulance is kept for Critical calls, so Kashmere Gate sends one.", reports: [R.low, R.m1, R.m2] },
  { text: "A Critical report: someone trapped. It gets ITO's last ambulance at once, before the control room has even verified it.", reports: [R.low, R.m1, R.m2, R.c1] },
  { text: "A second Critical report at ITO. ITO's ambulance that was going to the Moderate report is redirected; that report now gets help from Kashmere Gate instead.", reports: [R.low, R.m1, R.m2, R.c1, R.c2] },
  { text: "A High report: a shop fire. Kashmere Gate's only fire tender is kept for Critical calls, so Lajpat Nagar sends one.", reports: [R.low, R.m1, R.m2, R.c1, R.c2, R.fire] },
];

function Board({ rows, previous }: { rows: DispatchRow[]; previous?: Record<string, string | null> }) {
  const { assignments, centres } = useMemo(() => assignAll(rows), [rows]);
  const byId = new Map(rows.map((r) => [r.publicId, r]));
  const centreName = (id: string | null) => DEMO_CENTRES.find((c) => c.id === id)?.name.replace(" (demo)", "") ?? "—";
  const moved = (a: Assignment) => previous && a.publicId in previous && previous[a.publicId] !== a.centreId && previous[a.publicId] !== null;

  return (
    <div className="dispatch-board">
      <figure className="dispatch-map">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Map of ${centres.length} centres and ${assignments.length} reports. The table below lists every assignment.`}>
          <rect width={W} height={H} rx="8" className="dispatch-map-bg" />
          {assignments.filter((a) => a.centreId).map((a) => {
            const r = byId.get(a.publicId)!;
            const c = DEMO_CENTRES.find((x) => x.id === a.centreId)!;
            const p = px(r.lat!, r.lng!);
            const q = px(c.lat, c.lng);
            return <line key={`l-${a.publicId}`} x1={q.x} y1={q.y} x2={p.x} y2={p.y} stroke={SEV_COLOR[a.severity]} strokeWidth={a.severity === "critical" ? 3 : 2} strokeDasharray={moved(a) ? "6 5" : undefined} />;
          })}
          {centres.map(({ centre, free }) => {
            const q = px(centre.lat, centre.lng);
            const total = centre.units.ambulance + centre.units.fire + centre.units.rescue;
            const left = free.ambulance + free.fire + free.rescue;
            return (
              <g key={centre.id}>
                <rect x={q.x - 9} y={q.y - 9} width="18" height="18" rx="3" className="dispatch-centre" />
                <text x={q.x + 14} y={q.y - 4} className="dispatch-label">{centre.name.replace(" (demo)", "")}</text>
                <text x={q.x + 14} y={q.y + 12} className="dispatch-sub">{left}/{total} units free</text>
              </g>
            );
          })}
          {rows.map((r) => {
            const p = px(r.lat!, r.lng!);
            return <circle key={r.publicId} cx={p.x} cy={p.y} r={r.severity === "critical" ? 9 : 7} fill={SEV_COLOR[r.severity]} stroke="#fff" strokeWidth="2.5" />;
          })}
        </svg>
        <figcaption>Squares are response centres, dots are reports coloured by severity, lines show who sends help. Dashed: redirected.</figcaption>
      </figure>

      <div className="dispatch-tables">
        <table className="dispatch-table">
          <caption>Who sends help</caption>
          <thead><tr><th scope="col">Report</th><th scope="col">Sends</th><th scope="col">From</th><th scope="col">Why</th></tr></thead>
          <tbody>
            {assignments.length === 0 && <tr><td colSpan={4} className="hint">No open reports with a location.</td></tr>}
            {assignments.map((a) => (
              <tr key={a.publicId} className={moved(a) ? "dispatch-moved" : undefined}>
                <td>
                  <span className="sev sev-text" data-sev={a.severity}>{SEV_LABEL[a.severity]}</span> {byId.get(a.publicId)?.title}
                  {a.unverified && a.state === "assigned" && <span className="dispatch-tag">Not yet verified</span>}
                </td>
                <td>{UNIT_LABEL[a.unit]}</td>
                <td>{a.state === "assigned" ? <><strong>{centreName(a.centreId)}</strong><br /><span className="hint">{a.km} km · ~{a.etaMin} min</span></> : <span className="hint">{a.state === "queued" ? "Queued" : "Waiting"}</span>}</td>
                <td>{moved(a) && <strong>Redirected. </strong>}{a.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <table className="dispatch-table">
          <caption>Units free at each centre</caption>
          <thead><tr><th scope="col">Centre</th><th scope="col">{UNIT_LABEL.ambulance}</th><th scope="col">{UNIT_LABEL.fire}</th><th scope="col">{UNIT_LABEL.rescue}</th></tr></thead>
          <tbody>
            {centres.map(({ centre, free }) => (
              <tr key={centre.id}>
                <th scope="row">{centre.name}</th>
                <td className="num">{free.ambulance}/{centre.units.ambulance}</td>
                <td className="num">{free.fire}/{centre.units.fire}</td>
                <td className="num">{free.rescue}/{centre.units.rescue}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DispatchPanel({ live }: { live: DispatchRow[] }) {
  const [mode, setMode] = useState<"live" | "drill">("live");
  const [step, setStep] = useState(0);
  const previous = useMemo(() => {
    if (step === 0) return undefined;
    const prev = assignAll(DRILL[step - 1].reports).assignments;
    return Object.fromEntries(prev.map((a) => [a.publicId, a.centreId]));
  }, [step]);

  return (
    <>
      <div className="dispatch-modes" role="group" aria-label="What to show">
        <button type="button" className="btn" aria-pressed={mode === "live"} onClick={() => setMode("live")}>Live reports</button>
        <button type="button" className="btn" aria-pressed={mode === "drill"} onClick={() => setMode("drill")}>Drill (sample data)</button>
      </div>
      {mode === "live" ? (
        <Board rows={live} />
      ) : (
        <>
          <div className="dispatch-step" aria-live="polite">
            <p><strong>Step {step} of {DRILL.length - 1}.</strong> {DRILL[step].text}</p>
            <div className="dispatch-step-actions">
              <button type="button" className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>← Back</button>
              <button type="button" className="btn btn-primary" onClick={() => setStep((s) => Math.min(DRILL.length - 1, s + 1))} disabled={step === DRILL.length - 1}>Next report →</button>
              <button type="button" className="btn" onClick={() => setStep(0)}>Restart</button>
            </div>
          </div>
          <Board rows={DRILL[step].reports} previous={previous} />
        </>
      )}
    </>
  );
}
