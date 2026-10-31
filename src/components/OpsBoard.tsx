"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Gauge } from "@/components/Gauge";
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
import { isLocated, type Category, type Report, type Severity, type Status } from "@/lib/types";
import { shortId } from "@/lib/verify";
import type { Incident } from "@/lib/incidents";
import { REPORT_REFRESH_MS } from "@/lib/constants";
import { imageConcern, type ImageReviewState } from "@/lib/image-review";
import { assignAll, DEMO_CENTRES, UNIT_LABEL, type Assignment } from "@/lib/dispatch";
import { rowFromReport } from "@/lib/dispatch-rows";
import { ControlShell, Tile } from "@/components/ControlShell";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const SEV_RANK: Record<Severity, number> = { critical: 4, high: 3, moderate: 2, low: 1 };
const SEV_LABEL: Record<Severity, string> = { critical: "Critical", high: "High", moderate: "Moderate", low: "Low" };
const STATUS_LABEL: Record<Status, string> = { new: "New", verified: "Verified", dispatched: "Dispatched", resolved: "Resolved", rejected: "Rejected as false" };
const CLOSED: Status[] = ["resolved", "rejected"];
type StatusFilter = "open" | "all" | "closed" | "new" | "verified" | "dispatched";
function matchesStatus(s: Status, f: StatusFilter) {
  if (f === "all") return true;
  if (f === "open") return !CLOSED.includes(s);
  if (f === "closed") return CLOSED.includes(s);
  return s === f;
}
/** The image check in a queue cell. */
function imageShort(r: Report): string {
  const ir = r.imageReview;
  if (!ir) return "Not assessed";
  if (ir.state === "suspected") return ir.acceptedAt ? "Accepted after review" : "Suspected · review";
  return { pending: "Pending", clear: "No clear signs", inconclusive: "Inconclusive", unavailable: "Unavailable", not_assessed: "Not assessed" }[ir.state];
}
const hhmm = (iso: string | number) => new Date(iso).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
const centreName = (id: string | null) => DEMO_CENTRES.find((c) => c.id === id)?.name.replace(" (demo)", "") ?? "";
function unitText(r: Report, a: Assignment | undefined): string {
  if (CLOSED.includes(r.status)) return "None: report closed";
  if (r.duplicateOf) return "None: a copy of another report";
  if (!isLocated(r)) return "Pin the location to assign a unit";
  if (!a) return "None";
  if (a.state === "waiting_verification") return `${UNIT_LABEL[a.unit]}, assigned as soon as you verify it`;
  if (a.state === "queued") return `Waiting for a free ${UNIT_LABEL[a.unit].toLowerCase()}`;
  return `${UNIT_LABEL[a.unit]}, ${centreName(a.centreId)} centre · ${a.km} km · ETA ${a.etaMin} min${a.unverified ? " · sent before verification" : ""}`;
}
const NEXT_STATUS: { status: Status; label: string }[] = [
  { status: "verified", label: "Mark verified" },
  { status: "dispatched", label: "Team dispatched" },
  { status: "resolved", label: "Resolved" },
  { status: "rejected", label: "Reject as false" },
];
const LOW_QUOTA = 50;

/** The delayed AI-image check, kept apart from the hazard score. */
const IMAGE_CHECK: Record<Exclude<ImageReviewState, "not_assessed">, string> = {
  pending: "Pending. A second check starts about 10 seconds after filing. Until it finishes, this report's circle is provisional and it can't add corroboration.",
  clear: "No clear signs of AI generation. This doesn't prove the photo is genuine or that the event happened.",
  suspected: "Suspected synthetic. Score and status are unchanged, but the report stays out of incident circles and the public map until you accept the image evidence. It has not been rejected.",
  inconclusive: "Inconclusive. The model couldn't tell; this is not evidence either way.",
  unavailable: "Unavailable. No assessment was obtained (no key, an error, a timeout or an overdue job); this is not evidence either way.",
};

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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [hazard, setHazard] = useState<Category | "all">("all");
  const [query, setQuery] = useState("");
  const [imageOnly, setImageOnly] = useState(false);
  const [loadedAt, setLoadedAt] = useState<number | null>(null);
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
      setLoadedAt(Date.now());
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

  // The sidebar's "Image Review" link from other responder pages.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("view") === "image-review") setImageOnly(true);
  }, []);

  const open = useMemo(
    () => reports.filter((r) => !r.duplicateOf).filter((r) => matchesStatus(r.status, statusFilter)),
    [reports, statusFilter],
  );
  const unlocatedCount = open.filter((r) => !isLocated(r)).length;
  const hazards = useMemo(() => [...new Set(reports.filter((r) => !r.duplicateOf).map((r) => r.primaryCategory))].sort(), [reports]);

  const filteredReports = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^rht-/, "");
    return open
      .filter((r) => SEV_RANK[r.severity] >= SEV_RANK[minSev])
      .filter((r) => !needsLocation || !isLocated(r))
      .filter((r) => hazard === "all" || r.primaryCategory === hazard || r.categories.includes(hazard))
      .filter((r) => !imageOnly || imageConcern(r))
      .filter((r) => !q || [shortId(r.publicId), r.placeHint, r.summary, CATEGORY_LABEL[r.primaryCategory]].some((s) => s.toLowerCase().includes(q)))
      // Gemini uncertainty does not push a possibly urgent report below low-priority cases.
      .sort((a, b) => Number(a.reviewReasons.length > 0) - Number(b.reviewReasons.length > 0) || b.score - a.score || Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }, [open, minSev, needsLocation, hazard, imageOnly, query]);

  // Which unit the dispatch rules give each open report (the same rules as the dispatch register).
  const dispatch = useMemo(() => assignAll(reports.map(rowFromReport)), [reports]);
  const assignmentOf = useMemo(() => new Map(dispatch.assignments.map((a) => [a.publicId, a])), [dispatch]);
  const openAll = reports.filter((r) => !r.duplicateOf && !CLOSED.includes(r.status));
  const reviewCount = openAll.filter(imageConcern).length;

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
      else if (key === "p" && !selected.duplicateOf) {
        setPinning((v) => !v);
        if (mode === "responder") document.getElementById("map")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      else if (key === "f" && selected.resourceType === "image") setReveal((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const blur = mode === "public" || !reveal;
  const quotaLow = ai?.quota && ai.quota.remaining < LOW_QUOTA;

  const mapEl = (
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
  );

  const shortcutsEl = (
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
  );

  if (mode === "responder") {
    const sel = selected;
    const unit = sel ? assignmentOf.get(sel.publicId) : undefined;
    const startPinning = () => {
      setPinning((p) => !p);
      document.getElementById("map")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };
    return (
      <ControlShell
        active="dashboard"
        reviewCount={reviewCount}
        imageReviewOn={imageOnly}
        onImageReview={() => {
          setImageOnly((v) => !v);
          document.getElementById("queue")?.scrollIntoView({ block: "start" });
        }}
        side={
          <label className="cr-side-check">
            <input type="checkbox" checked={bw === "saver"} onChange={(e) => setBw(e.target.checked ? "saver" : "normal")} /> Low-bandwidth (2G) mode
          </label>
        }
      >
        <div className="cr-head">
          <div>
            <p className="cr-crumbs"><a href="/">Home</a> » Responders » Dashboard</p>
            <h1>Dashboard <span>· As on {loadedAt ? hhmm(loadedAt) : "…"} IST · refreshes every {REPORT_REFRESH_MS / 1000} s</span></h1>
          </div>
          <div className="cr-actions">
            <button type="button" className="cr-btn cr-btn-line" onClick={() => window.print()}>Print</button>
            <a className="cr-btn cr-btn-line" href="/api/reports/export">Export CSV</a>
            <a className="cr-btn" href="/respond/sitrep">Situation Report</a>
          </div>
        </div>

        <div className="cr-tiles">
          <Tile n={openAll.length} label="Open reports" color="#123D73" icon="queue" />
          <Tile n={openAll.filter((r) => r.severity === "critical").length} label="Critical" color="#B3122E" icon="alert" />
          <Tile n={openAll.filter((r) => r.status === "new").length} label="Awaiting verification" color="#B86E00" icon="clock" />
          <Tile n={reviewCount} label="Image review needed" color="#5B4BB4" icon="shield" />
          <Tile n={incidents.length} label="Active incidents" color="#0B57A4" icon="ring" />
          <Tile n={dispatch.assignments.filter((x) => x.state === "assigned").length} label="Units deployed" color="#138808" icon="dispatch" />
        </div>

        {(ai || savings || stale || error) && (
          <div className="cr-notes">
            {ai && (
              <p className={quotaLow || ai.mode === "demo" ? "warn" : undefined}>
                {ai.mode === "demo"
                  ? "AI Vision is off: reports are triaged rule-based from the reporter's note."
                  : ai.quota
                    ? <>AI Vision quota: <strong className="num">{ai.quota.remaining}</strong> left{quotaLow && ". Running low; new reports fall back to rule-based triage when it runs out."}</>
                    : "AI Vision quota: shown after the first live analysis."}
              </p>
            )}
            {savings && (
              <p>Queue images: <strong className="num">{kb(savings.thumb)}</strong> instead of <strong className="num">{kb(savings.orig)}</strong> of originals, {savings.pct}% less data.</p>
            )}
            {stale && <p className="warn">Data may be a few seconds old: Cloudinary Search is busy, showing the last good list.</p>}
            {error && <p className="error" role="alert">{error}</p>}
          </div>
        )}

        <div className="cr-grid">
          <section className="cr-box" id="queue" aria-labelledby="queue-h">
            <h2 id="queue-h" className="cr-boxh">
              <span>Incident Queue <small>(sorted by priority score)</small></span>
              {fresh.size > 0 && <span className="pill pill-new num" role="status">{fresh.size} new</span>}
            </h2>
            <form className="cr-filters" onSubmit={(e) => e.preventDefault()}>
              <label>Priority{" "}
                <select value={minSev} onChange={(e) => setMinSev(e.target.value as Severity)}>
                  <option value="low">All</option>
                  <option value="moderate">Moderate and up</option>
                  <option value="high">High and up</option>
                  <option value="critical">Critical only</option>
                </select>
              </label>
              <label>Status{" "}
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
                  <option value="open">Open</option>
                  <option value="new">New</option>
                  <option value="verified">Verified</option>
                  <option value="dispatched">Dispatched</option>
                  <option value="closed">Closed</option>
                  <option value="all">All</option>
                </select>
              </label>
              <label>Hazard{" "}
                <select value={hazard} onChange={(e) => setHazard(e.target.value as Category | "all")}>
                  <option value="all">All</option>
                  {hazards.map((h) => <option key={h} value={h}>{CATEGORY_LABEL[h]}</option>)}
                </select>
              </label>
              <input type="search" placeholder="Ref. No. / place" aria-label="Search by reference number or place" value={query} onChange={(e) => setQuery(e.target.value)} />
              <label className="cr-check">
                <input type="checkbox" checked={needsLocation} onChange={(e) => setNeedsLocation(e.target.checked)} /> Needs location
                {unlocatedCount > 0 && <span className="pill pill-warn num">{unlocatedCount}</span>}
              </label>
              <label className="cr-check"><input type="checkbox" checked={groupIncidents} onChange={(e) => setGroupIncidents(e.target.checked)} /> Group incidents</label>
              {imageOnly && <button type="button" className="cr-chip" onClick={() => setImageOnly(false)} aria-label="Show all reports, not just image review">Image review only ✕</button>}
            </form>
            <div className="cr-scroll">
              <table className="cr-table">
                <thead>
                  <tr><th>S.No.</th><th>Ref. No.</th><th>Hazard / Location</th><th>Priority</th><th>Score</th><th>Image check</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {queue.map((r, i) => {
                    const inc = incidentByReport.get(r.publicId);
                    const isNew = fresh.has(r.publicId);
                    return (
                      <tr key={r.publicId} data-report={r.publicId} className={[r.publicId === selectedId ? "sel" : "", isNew ? "is-new" : ""].join(" ").trim() || undefined} onClick={() => setSelectedId(r.publicId)}>
                        <td className="num">{i + 1}</td>
                        <td className="cr-ref">RHT-{shortId(r.publicId)}</td>
                        <td>
                          <div className="cr-hz">
                            <img src={thumbUrl(r, bw, true)} alt="" loading="lazy" width={56} height={42} />
                            <span>
                              <strong>{CATEGORY_LABEL[r.primaryCategory]}</strong>
                              <small>
                                {r.placeHint || (isLocated(r) ? `${r.lat.toFixed(3)}, ${r.lng.toFixed(3)}` : "")}
                                {!isLocated(r) && <span className="pill pill-warn">No location</span>} · {CHANNEL_LABEL[r.channel]} · {hhmm(r.createdAt)}
                              </small>
                              {(isNew || inc || r.corroborations > 0) && (
                                <small>
                                  {isNew && <span className="pill pill-new">New</span>}
                                  {inc && <span className="pill incident-pill">{inc.reportIds.length} in incident</span>}
                                  {r.corroborations > 0 && ` ${r.corroborations + 1} reports`}
                                </small>
                              )}
                            </span>
                          </div>
                        </td>
                        <td><span className="cr-pr" data-sev={r.severity}>{SEV_LABEL[r.severity].toUpperCase()}</span></td>
                        <td className="num">{r.score}</td>
                        <td className={imageConcern(r) ? "cr-suspect" : undefined}>{imageShort(r)}</td>
                        <td>
                          {STATUS_LABEL[r.status]}
                          {r.needsReview && <small className="cr-flag">Flagged: {r.reviewReasons[0]}</small>}
                          {r.aiMode === "demo" && <small>Rule-based triage</small>}
                        </td>
                        <td><button type="button" className="cr-link" onClick={(e) => { e.stopPropagation(); setSelectedId(r.publicId); }}>View</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {loaded && queue.length === 0 && !error && (
                <p className="cr-empty">
                  {imageOnly
                    ? "No image is waiting for review."
                    : needsLocation
                      ? "Every open report has a location. Nothing to pin right now."
                      : "No reports match these filters. When a citizen files one it appears here within a minute."}
                </p>
              )}
            </div>
            <p className="cr-foot">
              <span>Showing {queue.length} {queue.length === 1 ? "row" : "rows"}{groupIncidents && queue.length !== filteredReports.length ? ` (incidents grouped, ${filteredReports.length} reports)` : ""}</span>
              <button type="button" className="cr-link" onClick={() => helpRef.current?.showModal()} aria-keyshortcuts="?">Keyboard shortcuts <kbd>?</kbd></button>
            </p>
          </section>

          <div className="cr-col">
            {sel && (
              <section className="cr-box cr-detail" aria-labelledby="detail-h">
                <h2 id="detail-h" className="cr-boxh">
                  <span>Incident Details · <span className="cr-ref-h">RHT-{shortId(sel.publicId)}</span></span>
                  <button type="button" className="cr-close" onClick={() => setSelectedId(null)} aria-label="Close report" title="Close (Esc)">✕</button>
                </h2>
                <div className="cr-detail-body">
                  <div className="cr-detail-top">
                    <div className="cr-photo">
                      {sel.resourceType === "video" ? (
                        <video src={videoPreviewUrl(sel.publicId)} controls muted playsInline poster={enhancedUrl(sel, true)} />
                      ) : (
                        <img src={enhancedUrl(sel, blur)} alt={`Report photo${blur ? ", faces pixelated" : ""}, auto-enhanced`} />
                      )}
                    </div>
                    <div>
                      <p className="cr-detail-title"><strong>{CATEGORY_LABEL[sel.primaryCategory]}</strong> · {ago(sel.createdAt)}</p>
                      {sel.note && <p className="cr-quote">&ldquo;{sel.note}&rdquo;</p>}
                      <p className="cr-muted">AI summary: {sel.summary}</p>
                      {sel.summaryHi && <p className="cr-muted" lang="hi">{sel.summaryHi}</p>}
                      <div className="cr-mini">
                        {sel.resourceType === "image" && <button type="button" className="cr-btn cr-btn-line" onClick={() => setReveal((v) => !v)}>{reveal ? "Pixelate faces" : "Show faces"}</button>}
                        <a className="cr-btn cr-btn-line" href={originalUrl(sel)} target="_blank" rel="noreferrer">Original file</a>
                        <a className="cr-btn cr-btn-line" href={alertCardUrl(sel)} target="_blank" rel="noreferrer">Alert card</a>
                        <a className="cr-btn cr-btn-line" href={`/v/${shortId(sel.publicId)}`} target="_blank" rel="noreferrer" title="Public page and Instagram card for this report">Fact-check page</a>
                      </div>
                    </div>
                  </div>

                  {sel.reviewReasons.length > 0 && (
                    <div className="review" role="note">
                      <strong>Check before acting:</strong>
                      <ul>{sel.reviewReasons.map((x) => <li key={x}>{x}</li>)}</ul>
                    </div>
                  )}
                  {sel.imageReview?.state === "suspected" && (
                    <div className={imageConcern(sel) ? "review" : "image-check"} role="note">
                      <strong>AI image check raised concerns:</strong>
                      {sel.imageReview.concerns.length > 0 && <ul>{sel.imageReview.concerns.map((c) => <li key={c}>{c}</li>)}</ul>}
                      {sel.imageReview.acceptedAt ? (
                        <p className="hint">
                          A responder accepted this image as evidence on{" "}
                          {new Date(sel.imageReview.acceptedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.
                          The model&apos;s concerns are kept for the record.
                        </p>
                      ) : (
                        <button className="cr-btn" disabled={busy} onClick={() => patch({ acceptImage: true })}>Accept image evidence after review</button>
                      )}
                    </div>
                  )}

                  <table className="gov-kv cr-kv">
                    <tbody>
                      <tr><th scope="row">Priority</th><td><span className="cr-pr" data-sev={sel.severity}>{SEV_LABEL[sel.severity].toUpperCase()}</span> Score <strong className="num">{sel.score}</strong> / 100</td></tr>
                      <tr>
                        <th scope="row">Why this score</th>
                        <td>
                          <ul className="cr-why">
                            {sel.breakdown.map((l, i) => <li key={i} className={l.kind}>{l.label} <b className="num">{signed(l.points)}</b></li>)}
                          </ul>
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">Incident</th>
                        <td>
                          {selectedIncident
                            ? incidentEvidence.length > 1
                              ? `${incidentEvidence.length} reports grouped within ${selectedIncident.radiusM} m (same hazard, last 12 h)`
                              : `Only this report so far; others of the same hazard within ${selectedIncident.radiusM} m in 12 h will join it`
                            : "Not grouped with other reports yet"}
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">Independent reports</th>
                        <td className="num">{sel.corroborations + 1}{duplicates.length > 0 && `, plus ${duplicates.length} forwarded ${duplicates.length === 1 ? "copy" : "copies"} merged into this one`}</td>
                      </tr>
                      {sel.imageReview && (
                        <tr>
                          <th scope="row">AI image check</th>
                          <td>
                            {sel.imageReview.state === "not_assessed" ? "Not assessed (videos and reports filed before the check existed)." : IMAGE_CHECK[sel.imageReview.state]}
                            {sel.imageReview.state === "unavailable" && sel.imageReview.error && <strong className="cr-reason"> Reason: {sel.imageReview.error}.</strong>}
                            {sel.imageReview.model && <small className="cr-muted"> Checked with {sel.imageReview.model}{sel.imageReview.at ? ` at ${hhmm(sel.imageReview.at)}` : ""}. Separate from the score.</small>}
                          </td>
                        </tr>
                      )}
                      <tr><th scope="row">Dispatched unit</th><td>{unitText(sel, unit)} <a href="/respond/dispatch">Register »</a></td></tr>
                      <tr>
                        <th scope="row">Location</th>
                        <td className="num">
                          {isLocated(sel) ? (
                            <>
                              <a href={`https://www.google.com/maps?q=${sel.lat},${sel.lng}`} target="_blank" rel="noreferrer">{sel.lat.toFixed(4)} N, {sel.lng.toFixed(4)} E</a>
                              <small className="cr-muted"> · {LOCATION_SOURCE_LABEL[sel.locationSource]}</small>
                            </>
                          ) : (
                            <span className="pill pill-warn">No location yet</span>
                          )}
                        </td>
                      </tr>
                      {sel.placeHint && <tr><th scope="row">Place hint</th><td>{sel.placeHint}</td></tr>}
                      <tr>
                        <th scope="row">What the AI saw</th>
                        <td>
                          {sel.peopleVisible} {sel.peopleVisible === 1 ? "person" : "people"} visible · {sel.peopleInDanger ? "someone in danger" : "no one seen in danger"} · water: {DEPTH_LABEL[sel.waterDepth]} · vehicles: {sel.accessBlocked ? "blocked" : "look able to pass"}
                          {sel.categories.length > 1 && <> · also {sel.categories.filter((c) => c !== sel.primaryCategory).map((c) => CATEGORY_LABEL[c]).join(", ")}</>}
                        </td>
                      </tr>
                      <tr>
                        <th scope="row">Source</th>
                        <td>{CHANNEL_LABEL[sel.channel]} · {sel.reporterHash ? "reporter ID hashed" : "no reporter ID kept"} · {sel.lang === "hi" ? "Hindi" : "English"} · {sel.aiMode === "live" ? "Cloudinary AI Vision" : "rule-based triage (AI Vision unavailable)"}</td>
                      </tr>
                    </tbody>
                  </table>

                  {selectedIncident && (
                    <div className="incident-evidence cr-evidence">
                      <p className="cr-label">Reports in this incident (the circle is a grouping area, not the disaster&apos;s extent)</p>
                      <ul>
                        {incidentEvidence.map((report) => (
                          <li key={report.publicId}>
                            <button type="button" aria-pressed={selectedId === report.publicId} onClick={() => setSelectedId(report.publicId)}>
                              <span className="cr-pr" data-sev={report.severity}>{SEV_LABEL[report.severity].toUpperCase()}</span> {report.summary || CATEGORY_LABEL[report.primaryCategory]}
                              {report.publicId === selectedIncident.anchorId && <span className="pill">Anchor report</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div>
                    <p className="cr-label">Update status <small>(now: {STATUS_LABEL[sel.status]})</small></p>
                    <div className="cr-mini">
                      {!sel.duplicateOf && (
                        <button className="cr-btn cr-btn-line" disabled={busy} aria-pressed={pinning} onClick={startPinning}>
                          {pinning ? "Cancel pinning" : isLocated(sel) ? "Move pin" : "Pin location"}
                        </button>
                      )}
                      {NEXT_STATUS.map((s) => {
                        const current = s.status === sel.status;
                        return (
                          <button
                            key={s.status}
                            className={`cr-btn${current ? "" : " cr-btn-line"}${s.status === "rejected" ? " cr-btn-red" : ""}`}
                            aria-pressed={current}
                            disabled={busy}
                            onClick={() => !current && patch({ status: s.status })}
                          >
                            {s.label}{current && " ✓"}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {sel.history.length > 0 && (
                    <table className="cr-table cr-audit" aria-label="Audit trail">
                      <thead><tr><th>Time</th><th>Action (audit trail)</th></tr></thead>
                      <tbody>
                        {sel.history.map((h, i) => (
                          <tr key={i}>
                            <td className="num"><time dateTime={h.at}>{new Date(h.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}</time></td>
                            <td>{HISTORY_LABEL[h.action]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </section>
            )}
            <section className="cr-box cr-map" id="map" aria-labelledby="map-h">
              <h2 id="map-h" className="cr-boxh"><span>Situation Map</span> <a href="/map">Public view »</a></h2>
              {mapEl}
            </section>
          </div>
        </div>
        {shortcutsEl}
      </ControlShell>
    );
  }

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
          <label><input type="checkbox" checked={statusFilter === "open"} onChange={(e) => setStatusFilter(e.target.checked ? "open" : "all")} /> Hide closed</label>
          <label><input type="checkbox" checked={groupIncidents} onChange={(e) => setGroupIncidents(e.target.checked)} /> Group incidents</label>
          <label><input type="checkbox" checked={bw === "saver"} onChange={(e) => setBw(e.target.checked ? "saver" : "normal")} /> 2G mode</label>
          <button type="button" className="linklike kbd-hint" onClick={() => helpRef.current?.showModal()} aria-keyshortcuts="?">
            Shortcuts <kbd>?</kbd>
          </button>
        </div>
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
                    {r.aiMode === "demo" && ", rule-based"}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="ops-main">
        {mapEl}

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
              {selectedIncident && <section className="incident-evidence" aria-label="Incident evidence">
                <h3>Same incident · {selectedIncident.radiusM} m grouping radius</h3>
                <p>{incidentEvidence.length} original reports. A matching hazard and time are required; this circle is not the disaster's impact boundary. Public locations are approximate.</p>
                <ul>{incidentEvidence.map((report) => <li key={report.publicId}><button type="button" aria-pressed={selectedId === report.publicId} onClick={() => setSelectedId(report.publicId)}>
                  <span className="sev sev-text" data-sev={report.severity}>{report.severity}</span> {report.summary || CATEGORY_LABEL[report.primaryCategory]}
                  {report.publicId === selectedIncident.anchorId && <span className="pill">Anchor report</span>}
                </button></li>)}</ul>
              </section>}
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
                      " (approximate)"
                    </>
                  ) : (
                    <span className="pill pill-warn">No location yet</span>
                  )}
                </dd>
                <dt>People visible</dt><dd className="num">{selected.peopleVisible}</dd>
                <dt>Anyone in danger</dt><dd>{selected.peopleInDanger ? "Yes" : "No sign"}</dd>
                <dt>Water depth</dt><dd>{DEPTH_LABEL[selected.waterDepth]}</dd>
                <dt>Vehicle access</dt><dd>{selected.accessBlocked ? "Blocked" : "Looks passable"}</dd>
                <dt>Also seen</dt><dd>{selected.categories.filter((c) => c !== selected.primaryCategory).map((c) => CATEGORY_LABEL[c]).join(", ") || "Nothing else"}</dd>
                <dt>Independent reports</dt><dd className="num">{selected.corroborations + 1}{duplicates.length > 0 && `, plus ${duplicates.length} forwarded copies merged`}</dd>
                <dt>Triage</dt><dd>{selected.aiMode === "live" ? "Cloudinary AI Vision" : "Rule-based from reporter's note"}</dd>
              </dl>

              <details className="why">
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
              </div>
            </div>
          </article>
        )}
      </section>

      {shortcutsEl}
    </main>
  );
}
