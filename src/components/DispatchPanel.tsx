"use client";

// Dispatch board: which centre sends help to which report, and why, as it happens.
// "Live" polls the real open reports every 15 s and shows each unit driving to its
// report (an estimate from distance); "Demo" plays a scripted incident with sample
// reports (nothing is saved), with driving sped up so it fits on a stage.

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapPoint } from "@/components/DispatchMap";
import { assignAll, DEMO_CENTRES, RULES, UNIT_LABEL, type Assignment, type DispatchReport, type UnitType } from "@/lib/dispatch";
import { rowFromReport, UNIT_ICON, type DispatchRow } from "@/lib/dispatch-rows";
import type { Report, Severity } from "@/lib/types";

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

function UnitIcon({ unit }: { unit: UnitType }) {
  return (
    <svg className="dispatch-unit-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={UNIT_ICON[unit]} />
    </svg>
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
      <dl className="dispatch-counts">
        <div><dt>On the way</dt><dd className="num">{onTheWay}</dd></div>
        <div><dt>On scene</dt><dd className="num">{onScene}</dd></div>
        <div><dt>Waiting for a free unit</dt><dd className="num">{queued}</dd></div>
        <div><dt>Waiting for verification</dt><dd className="num">{waiting.length}</dd></div>
      </dl>

      <div className="dispatch-layout">
        <div className="dispatch-map" role="region" aria-label="Map of response centres, reports and units on the way">
          <DispatchMap centres={centreLoad} points={points} active={active} onActive={setActive} />
        </div>

        <div className="dispatch-side">
          <section className="dispatch-feed" aria-labelledby="feed-h">
            <h2 id="feed-h"><span className="live-pulse" aria-hidden="true" /> Activity</h2>
            <ol aria-live="polite">
              {feed.length === 0 && <li className="hint">Nothing yet. New reports and units appear here as they happen.</li>}
              {feed.map((f) => (
                <li key={f.key}>
                  <time className="num">{clock(f.at)}</time>
                  <span className="feed-dot" data-sev={f.sev ?? "none"} aria-hidden="true" />
                  <span>{f.text}</span>
                </li>
              ))}
            </ol>
          </section>

          <ol className="dispatch-cards" aria-label="Who sends help">
            {moving.length === 0 && <li className="dispatch-empty">No report needs a unit right now.</li>}
            {moving.map((a, i) => {
              const r = byId.get(a.publicId)!;
              const isNew = a.publicId === fresh || now - (recent.get(a.publicId) ?? -Infinity) < NEW_FOR_MS;
              const tr = a.state === "assigned" ? trip(a) : null;
              const there = tr !== null && tr.p >= 1;
              return (
                <li
                  key={a.publicId}
                  className={`dispatch-card${isNew ? " is-new" : ""}${a.publicId === active ? " is-active" : ""}`}
                  onMouseEnter={() => setActive(a.publicId)}
                  onMouseLeave={() => setActive(null)}
                >
                  <span className="dispatch-card-num" data-sev={a.severity} aria-hidden="true">{i + 1}</span>
                  <div className="dispatch-card-body">
                    <p className="dispatch-card-tags">
                      <span className="sev sev-text" data-sev={a.severity}>{SEV_LABEL[a.severity]}</span>
                      {isNew && <span className="dispatch-tag tag-new">New</span>}
                      {there && <span className="dispatch-tag tag-onscene">On scene</span>}
                      {a.unverified && <span className="dispatch-tag tag-unverified">Sent before verification</span>}
                    </p>
                    <h3>{r.title}</h3>
                    <p className="dispatch-card-where">{r.kind}</p>
                    {tr ? (
                      <div className={`dispatch-card-help${there ? " is-there" : ""}`}>
                        <UnitIcon unit={a.unit} />
                        <span>
                          <strong>{UNIT_LABEL[a.unit]} from {place(a.centreId)}</strong>
                          <span>
                            {there
                              ? `Reached the scene${estimate ? " (estimated)" : ""} · ${a.km} km`
                              : `${a.km} km · about ${tr.minsLeft} min to go${estimate ? " (estimated)" : ""}`}
                          </span>
                          <span className="dispatch-progress" aria-hidden="true"><span style={{ width: `${Math.round(tr.p * 100)}%` }} /></span>
                        </span>
                      </div>
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
      </div>

      {waiting.length > 0 && (
        <section className="dispatch-waiting" aria-labelledby="waiting-h">
          <h2 id="waiting-h">Waiting for verification ({waiting.length})</h2>
          <p className="hint">High, Moderate and Low reports get a unit once a responder verifies them in the <a href="/respond">control room</a>.</p>
          <ul>
            {waiting.map((a) => (
              <li key={a.publicId}><span className="sev sev-text" data-sev={a.severity}>{SEV_LABEL[a.severity]}</span> {byId.get(a.publicId)?.title}</li>
            ))}
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

export function DispatchPanel({ live: initial }: { live: DispatchRow[] }) {
  const [mode, setMode] = useState<"live" | "demo">("live");
  const tick = useNow(1000);

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
  const secs = Math.max(0, Math.round((tick - checkedAt) / 1000));

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
        <button type="button" role="tab" aria-selected={mode === "live"} onClick={() => { setPlaying(false); setMode("live"); }}>
          <span className="live-pulse" aria-hidden="true" /> Live
        </button>
        <button type="button" role="tab" aria-selected={mode === "demo"} onClick={() => { if (mode !== "demo") { setMode("demo"); restart(true); } }}>
          ▶ Play a demo incident
        </button>
      </div>

      {mode === "live" ? (
        <>
          <p className={`dispatch-livebar${offline ? " is-off" : ""}`} role="status">
            <span className="live-pulse" aria-hidden="true" />
            {offline ? "Can't reach the server. Retrying every 15 seconds." : `Live · checked ${secs} s ago · new reports appear here on their own`}
          </p>
          <Board rows={live} startOf={liveStart} msPerMin={LIVE_MS_PER_MIN} estimate seedFeed />
        </>
      ) : (
        <>
          <div className="dispatch-step" aria-live="polite">
            <p className="dispatch-step-count">Report {step} of {STEPS.length - 1} · sample data, driving shown 85× faster</p>
            <h2>{current.title}</h2>
            <p>{current.text}</p>
            <div className="dispatch-step-actions">
              {playing ? (
                <button type="button" className="btn" onClick={() => setPlaying(false)}>❚❚ Pause</button>
              ) : step < STEPS.length - 1 ? (
                <button type="button" className="btn btn-primary" onClick={() => setPlaying(true)}>▶ Play</button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={() => restart(true)}>↻ Play again</button>
              )}
              <button type="button" className="btn" onClick={() => { setPlaying(false); setStep((s) => Math.min(STEPS.length - 1, s + 1)); }} disabled={step === STEPS.length - 1}>Next report →</button>
              <button type="button" className="btn" onClick={() => restart(false)}>Start over</button>
            </div>
            <div className="dispatch-step-bar" aria-hidden="true"><span style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }} /></div>
          </div>
          <Board key={`demo-${run}`} rows={current.reports} startOf={demoStart} msPerMin={DEMO_MS_PER_MIN} estimate={false} fresh={fresh} seedFeed={false} />
        </>
      )}
    </>
  );
}
