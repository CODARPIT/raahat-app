"use client";

// Dispatch board: which centre sends help to which report, and why. "Today's
// reports" runs the rules on the real open reports; "Step-by-step demo" adds sample
// reports one at a time (nothing is saved) so the rules can be watched at work.

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import type { MapPoint } from "@/components/DispatchMap";
import { assignAll, DEMO_CENTRES, RULES, UNIT_LABEL, type Assignment, type DispatchReport, type UnitType } from "@/lib/dispatch";
import type { Severity } from "@/lib/types";

const DispatchMap = dynamic(() => import("@/components/DispatchMap"), {
  ssr: false,
  loading: () => <div className="dispatch-map-loading" role="status">Loading map…</div>,
});

export type DispatchRow = DispatchReport & { title: string; kind: string };

const SEV_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", moderate: "Moderate", low: "Low" };
const place = (id: string | null) => DEMO_CENTRES.find((c) => c.id === id)?.name.replace(" (demo)", "") ?? "";

// Simple line icons for the three unit types.
const UNIT_ICON: Record<UnitType, string> = {
  ambulance: "M3 7h11v9H3zM14 10h4l3 3v3h-7M10 9.5v4M8 11.5h4M7 18.5a1.5 1.5 0 1 0 0-.01M17 18.5a1.5 1.5 0 1 0 0-.01",
  fire: "M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-7.5zM6 21h12",
  rescue: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM5.6 5.6l3.6 3.6M18.4 5.6l-3.6 3.6M5.6 18.4l3.6-3.6M18.4 18.4l-3.6-3.6",
};
function UnitIcon({ unit }: { unit: UnitType }) {
  return (
    <svg className="dispatch-unit-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={UNIT_ICON[unit]} />
    </svg>
  );
}

// ── Step-by-step demo: sample reports around ITO, added one at a time ──────────
let seq = 0;
function sample(title: string, kind: string, severity: Severity, status: DispatchReport["status"], lat: number, lng: number, cats: DispatchReport["categories"]): DispatchRow {
  seq += 1;
  return {
    publicId: `demo-${seq}`,
    title,
    kind,
    severity,
    score: { critical: 85, high: 62, moderate: 38, low: 16 }[severity],
    status,
    createdAt: `2026-10-31T09:${String(seq).padStart(2, "0")}:00Z`,
    lat,
    lng,
    primaryCategory: cats[0],
    categories: cats,
    duplicateOf: null,
  };
}
const S = {
  low: sample("Fallen tree, one person with a cut arm", "Connaught Place", "low", "verified", 28.6315, 77.2167, ["trapped_or_injured", "storm_damage"]),
  m1: sample("Wall collapsed, two people injured", "Rajghat", "moderate", "verified", 28.6406, 77.2495, ["trapped_or_injured", "structural_collapse"]),
  m2: sample("Cyclist injured in waterlogging", "Pragati Maidan", "moderate", "verified", 28.6145, 77.2425, ["trapped_or_injured", "waterlogging"]),
  c1: sample("Person trapped under debris", "Daryaganj", "critical", "new", 28.6468, 77.2405, ["trapped_or_injured", "structural_collapse"]),
  c2: sample("Bus accident, many injured", "Tilak Bridge", "critical", "new", 28.6262, 77.2265, ["trapped_or_injured", "road_blocked"]),
  fire: sample("Shop on fire", "Chandni Chowk", "high", "verified", 28.656, 77.231, ["fire"]),
};
const STEPS: { title: string; text: string; reports: DispatchRow[] }[] = [
  { title: "Five response centres, no reports yet", text: "Each centre has ambulances, fire tenders and rescue teams. Press Next report to send in the first one.", reports: [] },
  { title: "A Low report near ITO", text: "ITO is closest, but a Low report never takes a centre's last two units. Lajpat Nagar has three ambulances, so it sends one.", reports: [S.low] },
  { title: "A Moderate report at ITO", text: "ITO has two ambulances, so it sends one and still keeps one free for an emergency.", reports: [S.low, S.m1] },
  { title: "Another Moderate report nearby", text: "ITO has only one ambulance left and keeps it for emergencies, so Mayur Vihar sends one instead.", reports: [S.low, S.m1, S.m2] },
  { title: "A Critical report: someone trapped", text: "Critical reports get the closest unit at once, even before anyone checks the photo. The ambulance ITO was sending to the wall collapse goes here instead, and Kashmere Gate now covers the wall collapse.", reports: [S.low, S.m1, S.m2, S.c1] },
  { title: "A second Critical report at ITO", text: "It gets ITO's other ambulance at once. The Moderate and Low reports keep their help from centres further away.", reports: [S.low, S.m1, S.m2, S.c1, S.c2] },
  { title: "A shop fire (High)", text: "Kashmere Gate, ITO and Mayur Vihar have one fire tender each and keep it for Critical calls. Lajpat Nagar has two, so it sends one.", reports: [S.low, S.m1, S.m2, S.c1, S.c2, S.fire] },
];

// ── The board ─────────────────────────────────────────────────────────────────
function Board({ rows, previous, fresh, demo }: { rows: DispatchRow[]; previous?: Record<string, string | null>; fresh?: string; demo: boolean }) {
  const [active, setActive] = useState<string | null>(null);
  const { assignments, centres } = useMemo(() => assignAll(rows), [rows]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.publicId, r])), [rows]);

  const moving = assignments.filter((a) => a.state !== "waiting_verification");
  const waiting = assignments.filter((a) => a.state === "waiting_verification");
  const onTheWay = moving.filter((a) => a.state === "assigned").length;
  const queued = moving.length - onTheWay;
  const redirectedFrom = (a: Assignment) => {
    const before = previous?.[a.publicId];
    return before && before !== a.centreId ? before : null;
  };

  const points: MapPoint[] = moving.map((a, i) => {
    const r = byId.get(a.publicId)!;
    return {
      id: a.publicId,
      n: i + 1,
      lat: r.lat!,
      lng: r.lng!,
      severity: a.severity,
      centre: DEMO_CENTRES.find((c) => c.id === a.centreId) ?? null,
      label: `${SEV_LABEL[a.severity]}: ${r.title}`,
      redirected: Boolean(redirectedFrom(a)),
    };
  });
  const centreLoad = centres.map(({ centre, free }) => ({
    centre,
    freeTotal: free.ambulance + free.fire + free.rescue,
    total: centre.units.ambulance + centre.units.fire + centre.units.rescue,
  }));

  return (
    <>
      <dl className="dispatch-counts">
        <div><dt>Help on the way</dt><dd className="num">{onTheWay}</dd></div>
        <div><dt>Waiting for a free unit</dt><dd className="num">{queued}</dd></div>
        <div><dt>Waiting for verification</dt><dd className="num">{waiting.length}</dd></div>
      </dl>

      <div className="dispatch-layout">
        <div className="dispatch-map" role="region" aria-label="Map of response centres and reports">
          <DispatchMap centres={centreLoad} points={points} active={active} onActive={setActive} />
        </div>

        <ol className="dispatch-cards" aria-label="Who sends help">
          {moving.length === 0 && (
            <li className="dispatch-empty">{demo ? "No reports yet. Press Next report." : "No report needs a unit right now."}</li>
          )}
          {moving.map((a, i) => {
            const r = byId.get(a.publicId)!;
            const from = redirectedFrom(a);
            return (
              <li
                key={a.publicId}
                className={`dispatch-card${a.publicId === fresh ? " is-new" : ""}${from ? " is-moved" : ""}${a.publicId === active ? " is-active" : ""}`}
                onMouseEnter={() => setActive(a.publicId)}
                onMouseLeave={() => setActive(null)}
              >
                <span className="dispatch-card-num" data-sev={a.severity} aria-hidden="true">{i + 1}</span>
                <div className="dispatch-card-body">
                  <p className="dispatch-card-tags">
                    <span className="sev sev-text" data-sev={a.severity}>{SEV_LABEL[a.severity]}</span>
                    {a.publicId === fresh && <span className="dispatch-tag tag-new">New</span>}
                    {from && <span className="dispatch-tag tag-moved">Redirected, was {place(from)}</span>}
                    {a.unverified && <span className="dispatch-tag tag-unverified">Sent before verification</span>}
                  </p>
                  <h3>{r.title}</h3>
                  <p className="dispatch-card-where">{r.kind}</p>
                  {a.state === "assigned" ? (
                    <p className="dispatch-card-help">
                      <UnitIcon unit={a.unit} />
                      <span><strong>{UNIT_LABEL[a.unit]} from {place(a.centreId)}</strong><span>{a.km} km away · about {a.etaMin} min</span></span>
                    </p>
                  ) : (
                    <p className="dispatch-card-help is-queued">
                      <UnitIcon unit={a.unit} />
                      <span><strong>Waiting for a free {UNIT_LABEL[a.unit].toLowerCase()}</strong></span>
                    </p>
                  )}
                  <p className="dispatch-card-why"><span>Why:</span> {a.reason}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {waiting.length > 0 && (
        <section className="dispatch-waiting" aria-labelledby="waiting-h">
          <h2 id="waiting-h">Waiting for verification ({waiting.length})</h2>
          <p className="hint">High, Moderate and Low reports get a unit once a responder verifies them in the <a href="/respond">control room</a>.</p>
          <ul>
            {waiting.map((a) => {
              const r = byId.get(a.publicId)!;
              return <li key={a.publicId}><span className="sev sev-text" data-sev={a.severity}>{SEV_LABEL[a.severity]}</span> {r.title}</li>;
            })}
          </ul>
        </section>
      )}

      <section className="dispatch-centres" aria-labelledby="centres-h">
        <h2 id="centres-h">Units at each centre</h2>
        <p className="hint"><span className="pip is-free" aria-hidden="true" /> free <span className="pip" aria-hidden="true" /> out on a call. Centres are demo stations, not real ones.</p>
        <ul>
          {centres.map(({ centre, free }) => (
            <li key={centre.id}>
              <h3>{place(centre.id)}</h3>
              {(["ambulance", "fire", "rescue"] as UnitType[]).map((u) => (
                <p key={u}>
                  <span className="dispatch-centre-unit">{UNIT_LABEL[u]}</span>
                  <span className="pips" aria-label={`${free[u]} of ${centre.units[u]} free`}>
                    {Array.from({ length: centre.units[u] }, (_, k) => <span key={k} className={`pip${k < free[u] ? " is-free" : ""}`} />)}
                  </span>
                </p>
              ))}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function DispatchPanel({ live }: { live: DispatchRow[] }) {
  const [mode, setMode] = useState<"live" | "demo">("live");
  const [step, setStep] = useState(0);
  const previous = useMemo(() => {
    if (step === 0) return undefined;
    return Object.fromEntries(assignAll(STEPS[step - 1].reports).assignments.map((a) => [a.publicId, a.centreId]));
  }, [step]);
  const current = STEPS[step];
  const fresh = step > 0 ? current.reports[current.reports.length - 1]?.publicId : undefined;

  return (
    <>
      <section className="dispatch-rules" aria-labelledby="rules-h">
        <h2 id="rules-h">How help is shared out</h2>
        <ol>
          <li data-sev="critical"><strong>Critical</strong> Closest unit, sent at once, even before anyone checks the photo.</li>
          <li data-sev="high"><strong>High</strong> After verification, from a centre within {RULES.high.maxKm} km that can spare one.</li>
          <li data-sev="moderate"><strong>Moderate</strong> After verification. The nearest centre keeps its last unit for emergencies, so help may come from up to {RULES.moderate.maxKm} km away.</li>
          <li data-sev="low"><strong>Low</strong> After verification, from a centre with plenty to spare, up to {RULES.low.maxKm} km away.</li>
        </ol>
      </section>

      <div className="dispatch-modes" role="tablist" aria-label="What to show">
        <button type="button" role="tab" aria-selected={mode === "live"} onClick={() => setMode("live")}>Today&rsquo;s reports</button>
        <button type="button" role="tab" aria-selected={mode === "demo"} onClick={() => setMode("demo")}>Step-by-step demo</button>
      </div>

      {mode === "live" ? (
        <Board rows={live} demo={false} />
      ) : (
        <>
          <div className="dispatch-step" aria-live="polite">
            <p className="dispatch-step-count">Step {step} of {STEPS.length - 1}</p>
            <h2>{current.title}</h2>
            <p>{current.text}</p>
            <div className="dispatch-step-actions">
              <button type="button" className="btn" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>← Back</button>
              {step < STEPS.length - 1 ? (
                <button type="button" className="btn btn-primary" onClick={() => setStep((s) => s + 1)}>Next report →</button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => setStep(0)}>Start again</button>
              )}
            </div>
          </div>
          <Board rows={current.reports} previous={previous} fresh={fresh} demo />
        </>
      )}
    </>
  );
}
