"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge } from "@/components/Gauge";
import {
  alertCardUrl,
  enhancedUrl,
  originalUrl,
  thumbUrl,
  videoPreviewUrl,
  type Bandwidth,
} from "@/lib/cld-url";
import { CATEGORY_LABEL, DEPTH_LABEL, LOCATION_SOURCE_LABEL } from "@/lib/labels";
import { isLocated, type Report, type Severity, type Status } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const SEV_RANK: Record<Severity, number> = { critical: 4, high: 3, moderate: 2, low: 1 };
const NEXT_STATUS: { status: Status; label: string }[] = [
  { status: "verified", label: "Mark verified" },
  { status: "dispatched", label: "Team dispatched" },
  { status: "resolved", label: "Resolved" },
  { status: "rejected", label: "Reject as false" },
];
const LOW_QUOTA = 50;

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

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reports", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load reports.");
      setReports(data.reports as Report[]);
      setStale(Boolean(data.stale));
      setAi((data.ai as AiInfo | undefined) ?? null);
      setError(null);
    } catch (e) {
      setError(`${(e as Error).message} Retrying every 20 seconds.`);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  const open = useMemo(
    () => reports.filter((r) => !r.duplicateOf).filter((r) => !hideClosed || (r.status !== "resolved" && r.status !== "rejected")),
    [reports, hideClosed],
  );
  const unlocatedCount = open.filter((r) => !isLocated(r)).length;

  const queue = useMemo(
    () =>
      open
        .filter((r) => SEV_RANK[r.severity] >= SEV_RANK[minSev])
        .filter((r) => !needsLocation || !isLocated(r))
        .sort((a, b) => Number(a.needsReview) - Number(b.needsReview) || b.score - a.score || Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [open, minSev, needsLocation],
  );

  const selected = reports.find((r) => r.publicId === selectedId) ?? null;
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
  }, [selectedId]);

  useEffect(() => {
    if (!pinning) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPinning(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pinning]);

  const savings = useMemo(() => {
    const measured = reports.filter((r) => r.thumbBytes > 0 && r.originalBytes > 0);
    const orig = measured.reduce((s, r) => s + r.originalBytes, 0);
    const thumb = measured.reduce((s, r) => s + r.thumbBytes, 0);
    return measured.length ? { orig, thumb, pct: Math.round((1 - thumb / orig) * 100) } : null;
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
      load(); // nearby reports may have gained a corroboration
    }
  }

  const blur = mode === "public" || !reveal;
  const quotaLow = ai?.quota && ai.quota.remaining < LOW_QUOTA;

  return (
    <main className="ops">
      <section className="ops-queue" aria-label="Reports, highest priority first">
        <div className="ops-bar">
          <strong className="num">{queue.length} open</strong>
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
          <label><input type="checkbox" checked={bw === "saver"} onChange={(e) => setBw(e.target.checked ? "saver" : "normal")} /> 2G mode</label>
        </div>
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
            <li key={r.publicId}>
              <button aria-current={r.publicId === selectedId} onClick={() => setSelectedId(r.publicId)}>
                <Gauge severity={r.severity} />
                <img src={thumbUrl(r, bw, true)} alt="" loading="lazy" width={96} height={72} />
                <span className="meta">
                  <span className="title">
                    {CATEGORY_LABEL[r.primaryCategory]}
                    <span className="num sev sev-text" data-sev={r.severity}>{r.score}</span>
                  </span>
                  <span className="sub">{r.summary}</span>
                  <span className="sub">
                    {!isLocated(r) && <span className="pill pill-warn">No location</span>}{" "}
                    {r.channel === "whatsapp" && <span className="pill">WhatsApp</span>}{" "}
                    {ago(r.createdAt)}
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
        <div className="map-wrap">
          {pinning && selected && (
            <p className="pin-banner" role="status">
              Click the map where this report is{suggestion ? ", or click the dashed suggestion" : ""}.{" "}
              <button className="linklike" onClick={() => setPinning(false)}>Cancel (Esc)</button>
            </p>
          )}
          <MapView
            reports={queue}
            selectedId={selectedId}
            onSelect={(r) => setSelectedId(r.publicId)}
            onPick={pinning ? pinAt : undefined}
            picking={pinning}
            suggested={mode === "responder" && selected && !isLocated(selected) ? suggestion : null}
          />
        </div>

        {selected && (
          <article className="detail" aria-label="Selected report">
            <div>
              <p className="hint">
                <span className="sev sev-text" data-sev={selected.severity}>{selected.severity}, score {selected.score}</span>{" "}
                {ago(selected.createdAt)}
                {selected.channel === "whatsapp" && ", via WhatsApp"}
              </p>
              <h2>{CATEGORY_LABEL[selected.primaryCategory]}</h2>
              <p>{selected.summary}</p>
              <p className="hi" lang="hi">{selected.summaryHi}</p>
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
                <a className="btn" href={alertCardUrl(selected)} target="_blank" rel="noreferrer">Open WhatsApp alert card</a>
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
    </main>
  );
}
