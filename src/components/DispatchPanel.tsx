"use client";

// Dispatch board: which centre sends help to which report, and why, as it happens.
// "Live" polls the real open reports every 15 s and shows each unit driving to its
// report (an estimate from distance); "Demo" plays a scripted incident with sample
// reports (nothing is saved), with driving sped up so it fits on a stage.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapPoint } from "@/components/DispatchMap";
import { assignAll, DEMO_CENTRES, RULES, UNIT_LABEL, type Assignment, type DispatchReport, type UnitType } from "@/lib/dispatch";
import { rowFromReport, type DispatchRow } from "@/lib/dispatch-rows";
import type { Report, Severity } from "@/lib/types";
import { shortId } from "@/lib/verify";
import { Tile } from "@/components/ControlShell";

const DispatchMap = dynamic(() => import("@/components/DispatchMap"), {
  ssr: false,
  loading: () => <div className="dispatch-map-loading" role="status">Loading map…</div>,
});

const LIVE_REFRESH_MS = 15_000;
const LIVE_MS_PER_MIN = 60_000;
const DEMO_MS_PER_MIN = 700; // in the demo, a minute of driving takes 0.7 s
const DEMO_STEP_MS = 6_500;
const NEW_FOR_MS = 10_000; // how long a newly arrived report stays highlighted

const SEV_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", moderate: "Moderate", low: "Low" };
const place = (id: string | null) => DEMO_CENTRES.find((c) => c.id === id)?.name.replace(" (demo)", "") ?? "";
const clock = (ms: number) => new Date(ms).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false });
const refNo = (id: string) => (id.startsWith("demo-") ? id.toUpperCase() : `RHT-${shortId(id)}`);
const UNITS: UnitType[] = ["ambulance", "fire", "rescue"];

/** The rules from RULES, as a register table. */
function RulesTable() {
  const rows: { sev: Severity; pick: string }[] = [
    { sev: "critical", pick: "Nearest free unit, sent at once; may take over a unit from a less urgent call" },
    { sev: "high", pick: "Nearest centre that can spare a unit" },
    { sev: "moderate", pick: "Nearest centre that can spare one, often further away" },
    { sev: "low", pick: "Nearest centre with plenty to spare" },
  ];
  return (
    <section className="cr-box" aria-labelledby="rules-h">
      <h2 id="rules-h" className="cr-boxh"><span>Dispatch Rules</span></h2>
      <div className="cr-scroll">
        <table className="cr-table">
          <thead><tr><th>Priority</th><th>Centre selected</th><th>Maximum distance</th><th>Units kept free at the centre</th><th>Sent before verification</th></tr></thead>
          <tbody>
            {rows.map(({ sev, pick }) => (
              <tr key={sev}>
                <td><span className="cr-pr" data-sev={sev}>{SEV_LABEL[sev].toUpperCase()}</span></td>
                <td>{pick}</td>
                <td>{Number.isFinite(RULES[sev].maxKm) ? `${RULES[sev].maxKm} km` : "No limit"}</td>
                <td className="num">{RULES[sev].keepFree}</td>
                <td>{sev === "critical" ? "Yes" : "No, after a responder verifies it"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(t);
  }, [everyMs]);
  return now;
}

// ── Demo: sample reports around ITO, arriving one at a time ───────────────────
let seq = 0;
function sample(title: string, kind: string, severity: Severity, status: DispatchReport["status"], lat: number, lng: number, cats: DispatchReport["categories"]): DispatchRow {
  seq += 1;
  const createdAt = `2026-10-31T09:${String(seq).padStart(2, "0")}:00Z`;
  return {
    publicId: `demo-${seq}`,
    title,
    kind,
    severity,
    score: { critical: 85, high: 62, moderate: 38, low: 16 }[severity],
    status,
    createdAt,
    sentAt: createdAt,
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
  { title: "Five response centres, no reports yet", text: "Each centre has ambulances, fire tenders and rescue teams. Reports start coming in now.", reports: [] },
  { title: "A Low report at Connaught Place", text: "ITO is closest, but a Low report never takes a centre's last two units. Lajpat Nagar has three ambulances, so it sends one.", reports: [S.low] },
  { title: "A Moderate report at Rajghat", text: "ITO has two ambulances, so it sends one and still keeps one free for an emergency.", reports: [S.low, S.m1] },
  { title: "Another Moderate report nearby", text: "ITO has only one ambulance left and keeps it for emergencies, so Mayur Vihar sends one instead.", reports: [S.low, S.m1, S.m2] },
  { title: "A Critical report: someone trapped", text: "Critical reports get the closest unit at once, even before anyone checks the photo. ITO's ambulance goes here, and the wall collapse is covered by Kashmere Gate instead.", reports: [S.low, S.m1, S.m2, S.c1] },
  { title: "A second Critical report at Tilak Bridge", text: "It gets ITO's other ambulance at once. The Moderate and Low reports keep their help from centres further away.", reports: [S.low, S.m1, S.m2, S.c1, S.c2] },
  { title: "A shop fire (High)", text: "Kashmere Gate, ITO and Mayur Vihar have one fire tender each and keep it for Critical calls. Lajpat Nagar has two, so it sends one.", reports: [S.low, S.m1, S.m2, S.c1, S.c2, S.fire] },
];

// ── The board ─────────────────────────────────────────────────────────────────
interface FeedItem {
  key: string;
  at: number;
  sev: Severity | null;
  text: string;
}

function Board({ rows, startOf, msPerMin, estimate, fresh, seedFeed }: {
  rows: DispatchRow[];
  /** When a unit left for this report (ms since epoch). */
  startOf: (a: Assignment, r: DispatchRow) => number;
  msPerMin: number;
  /** Live positions are estimates from distance; say so. */
  estimate: boolean;
  fresh?: string;
  seedFeed: boolean;
}) {
  const now = useNow(250);
  const [active, setActive] = useState<string | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [recent, setRecent] = useState<Map<string, number>>(new Map());
  const [redirected, setRedirected] = useState<Map<string, string>>(new Map());
  const { assignments, centres } = useMemo(() => assignAll(rows), [rows]);
  const byId = useMemo(() => new Map(rows.map((r) => [r.publicId, r])), [rows]);

  const moving = assignments.filter((a) => a.state !== "waiting_verification");
  const waiting = assignments.filter((a) => a.state === "waiting_verification");

  // Each assigned unit's drive: when it left, how long it takes, how far along it is.
  const trip = (a: Assignment) => {
    const start = startOf(a, byId.get(a.publicId)!);
    const dur = (a.etaMin ?? 0) * msPerMin;
    const p = dur > 0 ? Math.min(1, Math.max(0, (now - start) / dur)) : 1;
    return { start, dur, p, minsLeft: Math.max(1, Math.ceil((a.etaMin ?? 0) * (1 - p))) };
  };
  const assigned = moving.filter((a) => a.state === "assigned");
  const arrivedKey = assigned.filter((a) => trip(a).p >= 1).map((a) => `${a.publicId}:${a.centreId}`).join(",");
  const onScene = arrivedKey ? arrivedKey.split(",").length : 0;
  const onTheWay = assigned.length - onScene;
  const queued = moving.length - assigned.length;

  // Activity feed: compare each new set of assignments with the last one.
  const push = useCallback((items: FeedItem[]) => {
    if (items.length) setFeed((f) => [...items, ...f].slice(0, 40));
  }, []);
  const last = useRef<Map<string, { a: Assignment; title: string }> | null>(null);
  useEffect(() => {
    const t = Date.now();
    const items: FeedItem[] = [];
    const born: string[] = [];
    const moved: [string, string][] = [];
    if (last.current === null) {
      if (seedFeed) {
        // Start with what was sent most recently, newest first.
        assignments
          .filter((a) => a.state === "assigned")
          .map((a) => ({ a, r: byId.get(a.publicId)! }))
          .sort((x, y) => Date.parse(y.r.sentAt) - Date.parse(x.r.sentAt))
          .slice(0, 6)
          .forEach(({ a, r }) => items.push({ key: `seed-${a.publicId}`, at: Date.parse(r.sentAt), sev: a.severity, text: `${UNIT_LABEL[a.unit]} sent from ${place(a.centreId)} to: ${r.title}` }));
      }
    } else {
      for (const a of assignments) {
        const before = last.current.get(a.publicId)?.a;
        const r = byId.get(a.publicId)!;
        const help = `${UNIT_LABEL[a.unit]} from ${place(a.centreId)} (${a.km} km)`;
        if (!before) {
          born.push(a.publicId);
          const next = a.state === "assigned" ? `${help} is on its way.` : a.state === "queued" ? `No ${UNIT_LABEL[a.unit].toLowerCase()} free yet; queued.` : "Waiting for verification.";
          items.push({ key: `new-${a.publicId}-${t}`, at: t, sev: a.severity, text: `New ${SEV_LABEL[a.severity]} report: ${r.title}. ${next}` });
        } else if (a.state === "assigned" && before.centreId !== a.centreId) {
          if (before.centreId) moved.push([a.publicId, before.centreId]);
          items.push({
            key: `move-${a.publicId}-${a.centreId}-${t}`,
            at: t,
            sev: a.severity,
            text: before.centreId ? `Redirected: ${r.title} now gets ${help}. ${a.reason}` : `${help} sent to: ${r.title}`,
          });
        }
      }
      for (const [id, { a, title }] of last.current) {
        if (!assignments.some((x) => x.publicId === id) && a.centreId) {
          items.push({ key: `closed-${id}-${t}`, at: t, sev: null, text: `Closed: ${title}. ${UNIT_LABEL[a.unit]} back at ${place(a.centreId)}.` });
        }
      }
    }
    last.current = new Map(assignments.map((a) => [a.publicId, { a, title: byId.get(a.publicId)?.title ?? "" }]));
    push(items);
    if (born.length) setRecent((m) => new Map([...m, ...born.map((id) => [id, t] as [string, number])]));
    if (moved.length) setRedirected((m) => new Map([...m, ...moved]));
  }, [assignments, byId, seedFeed, push]);

  // Arrivals: log each unit the moment its estimated drive ends.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    const keys = arrivedKey ? arrivedKey.split(",") : [];
    if (seen.current === null) {
      seen.current = new Set(keys); // already on scene when the page opened: not news
      return;
    }
    const t = Date.now();
    const items: FeedItem[] = [];
    for (const k of keys) {
      if (seen.current.has(k)) continue;
      seen.current.add(k);
      const [id, centreId] = k.split(":");
      const a = assignments.find((x) => x.publicId === id);
      if (a) items.push({ key: `arrived-${k}-${t}`, at: t, sev: a.severity, text: `${UNIT_LABEL[a.unit]} from ${place(centreId)} reached: ${byId.get(id)?.title ?? "report"}` });
    }
    push(items);
  }, [arrivedKey, assignments, byId, push]);

  const points: MapPoint[] = useMemo(() => {
    const arrived = new Set(arrivedKey ? arrivedKey.split(",") : []);
    return moving.map((a, i) => {
      const r = byId.get(a.publicId)!;
      const assignedNow = a.state === "assigned";
      return {
        id: a.publicId,
        n: i + 1,
        lat: r.lat!,
        lng: r.lng!,
        severity: a.severity,
        centre: DEMO_CENTRES.find((c) => c.id === a.centreId) ?? null,
        label: `${SEV_LABEL[a.severity]}: ${r.title}`,
        unit: a.unit,
        startMs: assignedNow ? startOf(a, r) : null,
        durMs: (a.etaMin ?? 0) * msPerMin,
        arrived: arrived.has(`${a.publicId}:${a.centreId}`),
      };
    });
    // Rebuilt when the assignments change or a unit arrives, not on every clock tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments, byId, arrivedKey, startOf, msPerMin]);
  const centreLoad = useMemo(
    () => centres.map(({ centre, free }) => ({
      centre,
      freeTotal: free.ambulance + free.fire + free.rescue,
      total: centre.units.ambulance + centre.units.fire + centre.units.rescue,
    })),
    [centres],
  );

  return (
    <>
      <div className="cr-tiles cr-tiles-4">
        <Tile n={onTheWay} label="Units on the way" color="#B45309" icon="dispatch" />
        <Tile n={onScene} label="Units on scene" color="#138808" icon="check" />
        <Tile n={queued} label="Waiting for a free unit" color="#B3122E" icon="clock" />
        <Tile n={waiting.length} label="Awaiting verification" color="#123D73" icon="shield" />
      </div>

      <RulesTable />

      <div className="cr-grid cr-grid-dispatch">
        <section className="cr-box" aria-labelledby="map-h">
          <h2 id="map-h" className="cr-boxh"><span>Unit Movement Map</span> <small>{estimate ? "Positions and ETAs estimated from distance" : "Sample data"}</small></h2>
          <div className="dispatch-map cr-dmap" role="region" aria-label="Map of response centres, reports and units on the way">
            <DispatchMap centres={centreLoad} points={points} active={active} onActive={setActive} />
          </div>
        </section>

        <section className="cr-box" aria-labelledby="assign-h">
          <h2 id="assign-h" className="cr-boxh"><span>Assignments</span> <small>numbers match the map</small></h2>
          <div className="cr-scroll">
            <table className="cr-table">
              <thead><tr><th>S.No.</th><th>Ref. No.</th><th>Priority</th><th>Unit / From centre</th><th>Dist.</th><th>ETA</th><th>Status</th><th>Reason for selection</th></tr></thead>
              <tbody>
                {moving.map((a, i) => {
                  const r = byId.get(a.publicId)!;
                  const isNew = a.publicId === fresh || now - (recent.get(a.publicId) ?? -Infinity) < NEW_FOR_MS;
                  const tr = a.state === "assigned" ? trip(a) : null;
                  const there = tr !== null && tr.p >= 1;
                  const was = redirected.get(a.publicId);
                  return (
                    <tr
                      key={a.publicId}
                      className={[isNew ? "is-new" : "", a.publicId === active ? "sel" : ""].join(" ").trim() || undefined}
                      onMouseEnter={() => setActive(a.publicId)}
                      onMouseLeave={() => setActive(null)}
                    >
                      <td className="num"><span className="cr-n" data-sev={a.severity}>{i + 1}</span></td>
                      <td className="cr-ref">{refNo(a.publicId)}<small className="cr-clamp" title={r.title}>{r.title}</small></td>
                      <td><span className="cr-pr" data-sev={a.severity}>{SEV_LABEL[a.severity].toUpperCase()}</span></td>
                      <td><strong>{UNIT_LABEL[a.unit]}</strong><small>{tr ? place(a.centreId) : "No centre free yet"}</small></td>
                      <td className="num">{a.km !== null ? `${a.km} km` : "—"}</td>
                      <td className="num">{tr && !there ? `${tr.minsLeft} min` : "—"}</td>
                      <td>
                        <span className="cr-st" data-st={there ? "scene" : tr ? "way" : "queued"}>{there ? "On scene" : tr ? "On the way" : "Waiting"}</span>
                        {tr && !there && <span className="dispatch-progress" aria-hidden="true"><span style={{ width: `${Math.round(tr.p * 100)}%` }} /></span>}
                        {isNew && <small className="cr-new">New</small>}
                        {a.unverified && <small className="cr-red">Before verification</small>}
                        {was && tr && was !== a.centreId && <small className="cr-amber">Redirected (was {place(was)})</small>}
                      </td>
                      <td>{a.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {moving.length === 0 && <p className="cr-empty">No report needs a unit right now.</p>}
          </div>
        </section>
      </div>

      {waiting.length > 0 && (
        <section className="cr-box" aria-labelledby="waiting-h">
          <h2 id="waiting-h" className="cr-boxh"><span>Awaiting Verification ({waiting.length})</span> <a href="/respond">Open control room »</a></h2>
          <p className="cr-box-note">High, Moderate and Low reports get a unit as soon as a responder verifies them.</p>
          <div className="cr-scroll">
            <table className="cr-table">
              <thead><tr><th>Ref. No.</th><th>Priority</th><th>Report</th><th>Unit needed</th></tr></thead>
              <tbody>
                {waiting.map((a) => (
                  <tr key={a.publicId}>
                    <td className="cr-ref">{refNo(a.publicId)}</td>
                    <td><span className="cr-pr" data-sev={a.severity}>{SEV_LABEL[a.severity].toUpperCase()}</span></td>
                    <td>{byId.get(a.publicId)?.title}<small>{byId.get(a.publicId)?.kind}</small></td>
                    <td>{UNIT_LABEL[a.unit]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <div className="cr-grid cr-grid-even">
        <section className="cr-box" aria-labelledby="centres-h">
          <h2 id="centres-h" className="cr-boxh"><span>Centre-wise Unit Availability</span> <small>free / total · demo centres, not real stations</small></h2>
          <div className="cr-scroll">
            <table className="cr-table">
              <thead><tr><th>Centre</th>{UNITS.map((u) => <th key={u}>{UNIT_LABEL[u]}</th>)}<th>Total free</th></tr></thead>
              <tbody>
                {centres.map(({ centre, free }) => (
                  <tr key={centre.id}>
                    <td><strong>{place(centre.id)}</strong></td>
                    {UNITS.map((u) => (
                      <td key={u} className={`num${free[u] === 0 ? " cr-zero" : ""}`}>{free[u]} / {centre.units[u]}</td>
                    ))}
                    <td className="num">{UNITS.reduce((n, u) => n + free[u], 0)} / {UNITS.reduce((n, u) => n + centre.units[u], 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="cr-box" aria-labelledby="feed-h">
          <h2 id="feed-h" className="cr-boxh"><span><span className="live-pulse" aria-hidden="true" /> Activity Log</span></h2>
          <div className="cr-scroll cr-scroll-short">
            <table className="cr-table">
              <thead><tr><th>Time</th><th>Event</th></tr></thead>
              <tbody aria-live="polite">
                {feed.length === 0 && <tr><td colSpan={2} className="cr-empty-cell">Nothing yet. New reports and units appear here as they happen.</td></tr>}
                {feed.map((f) => (
                  <tr key={f.key}>
                    <td className="num">{clock(f.at)}</td>
                    <td><span className="feed-dot cr-dot" data-sev={f.sev ?? "none"} aria-hidden="true" /> {f.text}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}

export function DispatchPanel({ live: initial }: { live: DispatchRow[] }) {
  const [mode, setMode] = useState<"live" | "demo">("live");

  // Live: poll the open reports; new ones and status changes show up on their own.
  const [live, setLive] = useState(initial);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    if (mode !== "live") return;
    let stopped = false;
    const load = async () => {
      try {
        const res = await fetch("/api/reports", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { reports: Report[] };
        if (stopped) return;
        setLive(data.reports.map(rowFromReport));
        setCheckedAt(Date.now());
        setOffline(false);
      } catch {
        if (!stopped) setOffline(true);
      }
    };
    void load();
    const t = setInterval(load, LIVE_REFRESH_MS);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [mode]);
  const liveStart = useCallback((_a: Assignment, r: DispatchRow) => Date.parse(r.sentAt), []);

  // Demo: plays by itself; each unit leaves its centre the moment it is assigned.
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [run, setRun] = useState(0);
  const starts = useRef(new Map<string, number>());
  const demoStart = useCallback((a: Assignment) => {
    const k = `${a.publicId}:${a.centreId}`;
    if (!starts.current.has(k)) starts.current.set(k, Date.now());
    return starts.current.get(k)!;
  }, []);
  useEffect(() => {
    if (!playing) return;
    if (step >= STEPS.length - 1) return setPlaying(false);
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 1500 : DEMO_STEP_MS);
    return () => clearTimeout(t);
  }, [playing, step]);
  const restart = (autoplay: boolean) => {
    starts.current.clear();
    setStep(0);
    setRun((n) => n + 1);
    setPlaying(autoplay);
  };
  const current = STEPS[step];
  const fresh = step > 0 ? current.reports[current.reports.length - 1]?.publicId : undefined;

  return (
    <>
      <div className="cr-head">
        <div>
          <p className="cr-crumbs"><a href="/">Home</a> » <a href="/respond">Responders</a> » Dispatch Register</p>
          <h1>
            Dispatch Register{" "}
            <span role="status">
              {mode === "demo"
                ? "· Demo incident · sample data, nothing is saved"
                : offline
                  ? "· Can't reach the server. Retrying every 15 seconds."
                  : <>· <span className="live-pulse" aria-hidden="true" /> Live · last checked {clock(checkedAt)} IST</>}
            </span>
          </h1>
        </div>
        <div className="cr-actions">
          <button type="button" className="cr-btn cr-btn-line" onClick={() => window.print()}>Print</button>
          {mode === "live" ? (
            <button type="button" className="cr-btn" onClick={() => { setMode("demo"); restart(true); }}>▶ Run demo incident</button>
          ) : (
            <button type="button" className="cr-btn" onClick={() => { setPlaying(false); setMode("live"); }}>Back to live</button>
          )}
        </div>
      </div>

      {mode === "live" ? (
        <Board rows={live} startOf={liveStart} msPerMin={LIVE_MS_PER_MIN} estimate seedFeed />
      ) : (
        <>
          <section className="cr-box cr-step" aria-live="polite">
            <h2 className="cr-boxh"><span>Demo incident · Report {step} of {STEPS.length - 1}</span> <small>driving shown 85× faster</small></h2>
            <div className="cr-step-body">
              <h3>{current.title}</h3>
              <p>{current.text}</p>
              <div className="cr-mini">
                {playing ? (
                  <button type="button" className="cr-btn cr-btn-line" onClick={() => setPlaying(false)}>❚❚ Pause</button>
                ) : step < STEPS.length - 1 ? (
                  <button type="button" className="cr-btn" onClick={() => setPlaying(true)}>▶ Play</button>
                ) : (
                  <button type="button" className="cr-btn" onClick={() => restart(true)}>↻ Play again</button>
                )}
                <button type="button" className="cr-btn cr-btn-line" onClick={() => { setPlaying(false); setStep((s) => Math.min(STEPS.length - 1, s + 1)); }} disabled={step === STEPS.length - 1}>Next report →</button>
                <button type="button" className="cr-btn cr-btn-line" onClick={() => restart(false)}>Start over</button>
              </div>
              <div className="dispatch-step-bar" aria-hidden="true"><span style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} /></div>
            </div>
          </section>
          <Board key={`demo-${run}`} rows={current.reports} startOf={demoStart} msPerMin={DEMO_MS_PER_MIN} estimate={false} fresh={fresh} seedFeed={false} />
        </>
      )}
    </>
  );
}
