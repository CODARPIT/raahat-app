"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gauge } from "@/components/Gauge";
import { ImageReviewPanel } from "@/components/ImageReviewPanel";
import { imageNeedsReview } from "@/lib/image-review-state";
import {
  alertCardUrl,
  enhancedUrl,
  originalUrl,
  thumbUrl,
  videoPreviewUrl,
  type Bandwidth,
} from "@/lib/cld-url";
import { HISTORY_LABEL } from "@/lib/history";
import { CATEGORY_LABEL, CHANNEL_LABEL, DEPTH_LABEL, LOCATION_SOURCE_LABEL } from "@/lib/labels";
import { isLocated, type Report, type Severity, type Status } from "@/lib/types";
import { shortId } from "@/lib/verify";
import type { Incident } from "@/lib/incidents";
import { REPORT_REFRESH_MS } from "@/lib/constants";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const SEV_RANK: Record<Severity, number> = { critical: 4, high: 3, moderate: 2, low: 1 };
const NEXT_STATUS: { status: Status; label: string }[] = [
  { status: "verified", label: "Mark verified" },
  { status: "dispatched", label: "Team dispatched" },
  { status: "resolved", label: "Resolved" },
  { status: "rejected", label: "Reject as false" },
];
const LOW_QUOTA = 50;

/** Single-key shortcuts for a coordinator working through a long queue. */
const SHORTCUTS: { keys: string; action: string; responderOnly?: boolean }[] = [
  { keys: "J / K", action: "Next / previous report" },
  { keys: "Esc", action: "Close the report (or cancel pinning)" },
  { keys: "V", action: "Mark verified", responderOnly: true },
  { keys: "D", action: "Team dispatched", responderOnly: true },
  { keys: "R", action: "Resolved", responderOnly: true },
  { keys: "X", action: "Reject as false", responderOnly: true },
  { keys: "P", action: "Pin or move the location", responderOnly: true },
  { keys: "F", action: "Show or pixelate faces", responderOnly: true },
  { keys: "?", action: "Show these shortcuts" },
];
const STATUS_KEYS: Record<string, Status> = { v: "verified", d: "dispatched", r: "resolved", x: "rejected" };

function isTyping(el: EventTarget | null) {
  const t = el as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

interface AiInfo {
  mode: "live" | "demo" | "auto";
  quota: { remaining: number; limit: number | null; at: string } | null;
}

interface Suggestion {
  lat: number;
  lng: number;
  label: string;
}

function ago(iso: string) {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function kb(bytes: number) {
  return bytes >= 1_000_000 ? `${(bytes / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`);

export default function OpsBoard({ mode }: { mode: "public" | "responder" }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [groupIncidents, setGroupIncidents] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [ai, setAi] = useState<AiInfo | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [minSev, setMinSev] = useState<Severity>("low");
  const [hideClosed, setHideClosed] = useState(true);
  const [needsLocation, setNeedsLocation] = useState(false);
  const [bw, setBw] = useState<Bandwidth>("normal");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinning, setPinning] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  // Reports that arrived since the board opened and nobody has looked at yet.
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);
  const helpRef = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reports", { cache: "no-store", credentials: mode === "public" ? "omit" : "same-origin" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load reports.");
      const list = data.reports as Report[];
      setReports(list);
      setIncidents((data.incidents as Incident[] | undefined) ?? []);
      if (seen.current === null) {
        seen.current = new Set(list.map((r) => r.publicId));
      } else {
        const known = seen.current;
        const arrived = list.filter((r) => !r.duplicateOf && !known.has(r.publicId)).map((r) => r.publicId);
        list.forEach((r) => known.add(r.publicId));
        if (arrived.length) setFresh((f) => new Set([...f, ...arrived]));
      }
      setStale(Boolean(data.stale));
      setAi((data.ai as AiInfo | undefined) ?? null);
      setError(null);
    } catch (e) {
      setError(`${(e as Error).message} Retrying every ${REPORT_REFRESH_MS / 1000} seconds.`);
    } finally {
      setLoaded(true);
    }
  }, [mode]);

  useEffect(() => {
    load();
    const id = setInterval(load, REPORT_REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const open = useMemo(
    () => reports.filter((r) => !r.duplicateOf).filter((r) => !hideClosed || (r.status !== "resolved" && r.status !== "rejected")),
    [reports, hideClosed],
  );
  const unlocatedCount = open.filter((r) => !isLocated(r)).length;

  const filteredReports = useMemo(
    () =>
      open
        .filter((r) => SEV_RANK[r.severity] >= SEV_RANK[minSev])
        .filter((r) => !needsLocation || !isLocated(r))
        // Gemini uncertainty does not push a possibly urgent report below low-priority cases.
        .sort((a, b) => Number(a.reviewReasons.length > 0) - Number(b.reviewReasons.length > 0) || b.score - a.score || Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [open, minSev, needsLocation],
  );

  const incidentByReport = useMemo(() => new Map(incidents.flatMap((incident) => incident.reportIds.map((id) => [id, incident] as const))), [incidents]);
  // Highest-priority original represents the group; all evidence remains accessible.
  const queue = useMemo(() => {
    if (!groupIncidents) return filteredReports;
    const seen = new Set<string>();
    return filteredReports.filter((report) => {
      const id = incidentByReport.get(report.publicId)?.id ?? report.publicId;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [filteredReports, incidentByReport, groupIncidents]);

  const selected = reports.find((r) => r.publicId === selectedId) ?? null;
  const selectedIncident = selected ? incidentByReport.get(selected.publicId) : undefined;
  const incidentEvidence = selectedIncident ? reports.filter((report) => selectedIncident.reportIds.includes(report.publicId)) : [];
  const duplicates = selected ? reports.filter((r) => r.duplicateOf === selected.publicId) : [];

  // Centre of the located reports: Nominatim prefers place names near the incident area.
  const centre = useMemo(() => {
    const located = reports.filter(isLocated);
    if (!located.length) return null;
    return {
      lat: located.reduce((s, r) => s + r.lat, 0) / located.length,
      lng: located.reduce((s, r) => s + r.lng, 0) / located.length,
    };
  }, [reports]);

  // Suggested pin for an unlocated report, from its place hint.
  const hint = selected && !isLocated(selected) && mode === "responder" ? selected.placeHint : "";
  useEffect(() => {
    setSuggestion(null);
    if (!hint) return;
    let cancelled = false;
    const params = new URLSearchParams({ q: hint });
    if (centre) {
      params.set("lat", String(centre.lat));
      params.set("lng", String(centre.lng));
    }
    fetch(`/api/geocode?${params}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setSuggestion((d.suggestion as Suggestion | null) ?? null))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // centre is only a search bias; don't refetch every time a report moves it slightly
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint, selectedId]);

  useEffect(() => {
    setPinning(false);
    if (!selectedId) return;
    setFresh((f) => {
      if (!f.has(selectedId)) return f;
      const next = new Set(f);
      next.delete(selectedId);
      return next;
    });
    document.querySelector(`[data-report="${CSS.escape(selectedId)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  // "(2) Control room" in the tab, so a coordinator on another tab sees new reports arrive.
  useEffect(() => {
    if (mode !== "responder") return;
    const base = "Control room | Raahat";
    document.title = fresh.size ? `(${fresh.size}) ${base}` : base;
  }, [fresh, mode]);

  const savings = useMemo(() => {
    const measured = reports.filter((r) => r.thumbBytes > 0 && r.originalBytes > 0);
    const orig = measured.reduce((s, r) => s + r.originalBytes, 0);
    const thumb = measured.reduce((s, r) => s + r.thumbBytes, 0);
    // Capped at 99% so rounding never claims "100% less data".
    return measured.length ? { orig, thumb, pct: Math.min(99, Math.round((1 - thumb / orig) * 100)) } : null;
  }, [reports]);

  async function patch(body: Record<string, unknown>) {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: selected.publicId, resourceType: selected.resourceType, ...body }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReports((rs) => rs.map((r) => (r.publicId === selected.publicId ? (data.report as Report) : r)));
      void load(); // Refresh circles/membership after a status or pin change.
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function pinAt(lat: number, lng: number) {
    if (await patch({ lat, lng })) {
      setPinning(false);
      setSuggestion(null);
    }
  }

  // Re-registered every render so the handler always sees the current queue and selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "?") {
        const d = helpRef.current;
        if (d?.open) d.close();
        else d?.showModal();
        return;
      }
      if (helpRef.current?.open) return; // the dialog handles its own Esc
      if (key === "escape") {
        if (pinning) setPinning(false);
        else setSelectedId(null);
        return;
      }
      if (key === "j" || key === "k") {
        if (!queue.length) return;
        const i = queue.findIndex((r) => r.publicId === selectedId);
        const next = key === "j" ? Math.min(i + 1, queue.length - 1) : Math.max(i - 1, 0);
        setSelectedId(queue[next].publicId);
        return;
      }
      if (mode !== "responder" || !selected || busy) return;
      if (STATUS_KEYS[key] && STATUS_KEYS[key] !== selected.status) patch({ status: STATUS_KEYS[key] });
      else if (key === "p" && !selected.duplicateOf) setPinning((v) => !v);
      else if (key === "f" && selected.resourceType === "image") setReveal((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const blur = mode === "public" || !reveal;
  const quotaLow = ai?.quota && ai.quota.remaining < LOW_QUOTA;

  return (
    <main className="ops">
      <section className="ops-queue" aria-label="Reports, highest priority first">
        {mode === "public" && (
          <p className="public-note">
            <strong>Public view.</strong> Locations are approximate (about 110 m), faces are pixelated and reporters&rsquo; notes
            are hidden. Reports still under review are not shown.
          </p>
        )}
        <div className="ops-bar">
          <strong className="num">{groupIncidents ? `${queue.filter((r) => incidentByReport.has(r.publicId)).length} incidents · ` : ""}{filteredReports.length} reports</strong>
          {fresh.size > 0 && <span className="pill pill-new num" role="status">{fresh.size} new</span>}
          <span className="spacer" />
          <label>
            Show{" "}
            <select value={minSev} onChange={(e) => setMinSev(e.target.value as Severity)}>
              <option value="low">all</option>
              <option value="moderate">moderate and up</option>
              <option value="high">high and up</option>
              <option value="critical">critical only</option>
            </select>
          </label>
          {mode === "responder" && (
            <label>
              <input type="checkbox" checked={needsLocation} onChange={(e) => setNeedsLocation(e.target.checked)} /> Needs location
              {unlocatedCount > 0 && <span className="pill pill-warn num">{unlocatedCount}</span>}
            </label>
          )}
          <label><input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} /> Hide closed</label>
          <label><input type="checkbox" checked={groupIncidents} onChange={(e) => setGroupIncidents(e.target.checked)} /> Group incidents</label>
          <label><input type="checkbox" checked={bw === "saver"} onChange={(e) => setBw(e.target.checked ? "saver" : "normal")} /> 2G mode</label>
          <button type="button" className="linklike kbd-hint" onClick={() => helpRef.current?.showModal()} aria-keyshortcuts="?">
            Shortcuts <kbd>?</kbd>
          </button>
        </div>
        {mode === "responder" && (
          <div className="ops-tools">
            <a href="/respond/sitrep" className="tool-link">Situation report</a>
            <a href="/api/reports/export" className="tool-link">Download CSV</a>
          </div>
        )}
        {mode === "responder" && ai && (
          <p className={`saving${quotaLow || ai.mode === "demo" ? " warn" : ""}`}>
            {ai.mode === "demo"
              ? "AI Vision is off: reports are triaged rule-based from the reporter's note."
              : ai.quota
                ? <>AI Vision quota: <strong className="num">{ai.quota.remaining}</strong> left{quotaLow && ". Running low; new reports fall back to rule-based triage when it runs out."}</>
                : "AI Vision quota: shown after the first live analysis."}
          </p>
        )}
        {savings && (
          <p className="saving">
            Queue images: <strong className="num">{kb(savings.thumb)}</strong> instead of{" "}
            <strong className="num">{kb(savings.orig)}</strong> of originals, {savings.pct}% less data.
          </p>
        )}
        {stale && <p className="saving warn">Data may be a few seconds old: Cloudinary Search is busy, showing the last good list.</p>}
        {error && <p className="saving error" role="alert">{error}</p>}
        {loaded && queue.length === 0 && !error && (
          <p className="empty">
            {needsLocation
              ? "Every open report has a location. Nothing to pin right now."
              : "No open reports match these filters. When a citizen files one from the Report page it appears here within a minute."}
          </p>
        )}
        <ul className="queue">
          {queue.map((r) => (
            <li key={r.publicId} className={fresh.has(r.publicId) ? "is-new" : undefined}>
              <button data-report={r.publicId} aria-current={r.publicId === selectedId} onClick={() => setSelectedId(r.publicId)}>
                <Gauge severity={r.severity} />
                <img src={thumbUrl(r, bw, true)} alt="" loading="lazy" width={96} height={72} />
                <span className="meta">
                  <span className="title">
                    {CATEGORY_LABEL[r.primaryCategory]}
                    <span className="num sev sev-text" data-sev={r.severity}>{r.score}</span>
                  </span>
                  <span className="sub">{r.summary}</span>
                  <span className="sub">
                    {fresh.has(r.publicId) && <span className="pill pill-new">New</span>}{" "}
                    {!isLocated(r) && <span className="pill pill-warn">No location</span>}{" "}
                    {r.channel !== "web" && <span className="pill">{CHANNEL_LABEL[r.channel]}</span>}{" "}
                    {ago(r.createdAt)}
                    {incidentByReport.has(r.publicId) && <span className="pill incident-pill">{incidentByReport.get(r.publicId)!.reportIds.length} in incident</span>}
                    {r.corroborations > 0 && `, ${r.corroborations + 1} reports`}
                    {r.status !== "new" && `, ${r.status}`}
                    {r.needsReview && ", needs review"}
                    {r.imageReview?.status === "pending" && <span className="pill">Image check pending</span>}
                    {imageNeedsReview(r.imageReview) && <span className="pill pill-warn">Image needs review</span>}
                    {r.aiMode === "demo" && ", rule-based"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="ops-main">
        <div className="map-wrap">
          {pinning && selected && (
            <p className="pin-banner" role="status">
              Click the map where this report is{suggestion ? ", or click the dashed suggestion" : ""}.{" "}
              <button className="linklike" onClick={() => setPinning(false)}>Cancel (Esc)</button>
            </p>
          )}
          <div className="map-legend" aria-label="Map legend">
            <span><i className="dot" data-sev="critical" />Critical</span>
            <span><i className="dot" data-sev="high" />High</span>
            <span><i className="dot" data-sev="moderate" />Moderate</span>
            <span><i className="dot" data-sev="low" />Low</span>
            <span className="legend-note">Dashed circles: severity-based grouping areas</span>
          </div>
          <MapView
            reports={filteredReports}
            incidents={incidents}
            selectedId={selectedId}
            onSelect={(r) => setSelectedId(r.publicId)}
            onPick={pinning ? pinAt : undefined}
            picking={pinning}
            suggested={mode === "responder" && selected && !isLocated(selected) ? suggestion : null}
          />
        </div>

        {selected && (
          <article className="detail" aria-label="Selected report">
            <button type="button" className="detail-close" onClick={() => setSelectedId(null)} aria-label="Close report" title="Close (Esc)">×</button>
            <div>
              <p className="hint">
                <span className="sev sev-text" data-sev={selected.severity}>{selected.severity}, score {selected.score}</span>{" "}
                {ago(selected.createdAt)}
                {selected.channel !== "web" && `, via ${CHANNEL_LABEL[selected.channel]}`}
              </p>
              <h2>{CATEGORY_LABEL[selected.primaryCategory]}</h2>
              <p>{selected.summary}</p>
              <p className="hi" lang="hi">{selected.summaryHi}</p>
              <ImageReviewPanel review={selected.imageReview} showReason={mode === "responder"} />
              {mode === "responder" && imageNeedsReview(selected.imageReview) && <p className="row-actions">
                <button className="btn" disabled={busy} onClick={() => patch({ acceptImage: true })}>Accept image evidence after review</button>
                <span className="hint">Keeps the emergency score and status. Other review flags still apply.</span>
              </p>}
              {selectedIncident && <section className="incident-evidence" aria-label="Incident evidence">
                <h3>Same incident · {selectedIncident.radiusM} m grouping radius</h3>
                <p>{incidentEvidence.length} original reports. A matching hazard and time are required; this circle is not the disaster's impact boundary. Public locations are approximate.</p>
                <ul>{incidentEvidence.map((report) => <li key={report.publicId}><button type="button" aria-pressed={selectedId === report.publicId} onClick={() => setSelectedId(report.publicId)}>
                  <span className="sev sev-text" data-sev={report.severity}>{report.severity}</span> {report.summary || CATEGORY_LABEL[report.primaryCategory]}
                  {report.publicId === selectedIncident.anchorId && <span className="pill">Anchor report</span>}
                </button></li>)}</ul>
              </section>}
              {mode === "responder" && selected.note && <p><strong>Reporter wrote:</strong> {selected.note}</p>}
              {selected.reviewReasons.length > 0 && (
                <div className="review" role="note">
                  <strong>Check before acting:</strong>
                  <ul>{selected.reviewReasons.map((r) => <li key={r}>{r}</li>)}</ul>
                </div>
              )}
              <dl>
                <dt>Location</dt>
                <dd className="num">
                  {isLocated(selected) ? (
                    <>
                      <a href={`https://www.google.com/maps?q=${selected.lat},${selected.lng}`} target="_blank" rel="noreferrer">
                        {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                      </a>
                      {mode === "public" ? " (approximate)" : <span className="hint"> · {LOCATION_SOURCE_LABEL[selected.locationSource]}</span>}
                    </>
                  ) : (
                    <span className="pill pill-warn">No location yet</span>
                  )}
                </dd>
                {mode === "responder" && selected.placeHint && <><dt>Place hint</dt><dd>{selected.placeHint}</dd></>}
                <dt>People visible</dt><dd className="num">{selected.peopleVisible}</dd>
                <dt>Anyone in danger</dt><dd>{selected.peopleInDanger ? "Yes" : "No sign"}</dd>
                <dt>Water depth</dt><dd>{DEPTH_LABEL[selected.waterDepth]}</dd>
                <dt>Vehicle access</dt><dd>{selected.accessBlocked ? "Blocked" : "Looks passable"}</dd>
                <dt>Also seen</dt><dd>{selected.categories.filter((c) => c !== selected.primaryCategory).map((c) => CATEGORY_LABEL[c]).join(", ") || "Nothing else"}</dd>
                <dt>Independent reports</dt><dd className="num">{selected.corroborations + 1}{duplicates.length > 0 && `, plus ${duplicates.length} forwarded copies merged`}</dd>
                <dt>Triage</dt><dd>{selected.aiMode === "live" ? "Cloudinary AI Vision" : "Rule-based from reporter's note"}</dd>
                {mode === "responder" && <><dt>Status</dt><dd>{selected.status}</dd></>}
              </dl>

              <details className="why" open={mode === "responder"}>
                <summary>Why this score</summary>
                <table>
                  <tbody>
                    {selected.breakdown.map((l, i) => (
                      <tr key={i} className={l.kind}>
                        <td>{l.label}</td>
                        <td className="num">{signed(l.points)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr><td>Score (0–100)</td><td className="num">{selected.score}</td></tr>
                  </tfoot>
                </table>
              </details>

              {mode === "responder" && selected.history.length > 0 && (
                <details className="why activity">
                  <summary>Activity ({selected.history.length})</summary>
                  <ol>
                    {[...selected.history].reverse().map((h, i) => (
                      <li key={i}>
                        <time dateTime={h.at}>{new Date(h.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time>
                        <span>{HISTORY_LABEL[h.action]}</span>
                      </li>
                    ))}
                  </ol>
                </details>
              )}

              {mode === "responder" && (
                <div className="row">
                  {!selected.duplicateOf && (
                    <button className="btn" disabled={busy} aria-pressed={pinning} onClick={() => setPinning((p) => !p)}>
                      {pinning ? "Cancel pinning" : isLocated(selected) ? "Move pin" : "Pin location"}
                    </button>
                  )}
                  {/* Only the report's current status is highlighted. */}
                  {NEXT_STATUS.map((s) => {
                    const current = s.status === selected.status;
                    return (
                      <button
                        key={s.status}
                        className={current ? "btn btn-primary" : "btn"}
                        aria-pressed={current}
                        disabled={busy}
                        onClick={() => !current && patch({ status: s.status })}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="media">
              {selected.resourceType === "video" ? (
                <video src={videoPreviewUrl(selected.publicId)} controls muted playsInline poster={enhancedUrl(selected, true)} />
              ) : (
                <img src={enhancedUrl(selected, blur)} alt={`Report photo${blur ? ", faces pixelated" : ""}, auto-enhanced`} />
              )}
              <div className="row">
                <a className="btn" href={alertCardUrl(selected)} target="_blank" rel="noreferrer">Alert card</a>
                <a className="btn" href={`/v/${shortId(selected.publicId)}`} target="_blank" rel="noreferrer" title="Public page and Instagram card for this report">Fact-check page</a>
                {mode === "responder" && selected.resourceType === "image" && (
                  <button className="btn" onClick={() => setReveal((v) => !v)}>{reveal ? "Pixelate faces" : "Show faces"}</button>
                )}
                {mode === "responder" && (
                  <a className="btn" href={originalUrl(selected)} target="_blank" rel="noreferrer">Original file</a>
                )}
              </div>
            </div>
          </article>
        )}
      </section>

      <dialog
        ref={helpRef}
        className="shortcuts"
        aria-labelledby="shortcuts-h"
        onClick={(e) => e.target === e.currentTarget && helpRef.current?.close()}
      >
        <h2 id="shortcuts-h">Keyboard shortcuts</h2>
        <dl>
          {SHORTCUTS.filter((s) => mode === "responder" || !s.responderOnly).map((s) => (
            <div key={s.keys}>
              <dt><kbd>{s.keys}</kbd></dt>
              <dd>{s.action}</dd>
            </div>
          ))}
        </dl>
        <form method="dialog"><button className="btn">Close</button></form>
      </dialog>
    </main>
  );
}
