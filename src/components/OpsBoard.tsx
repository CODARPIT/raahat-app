"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gauge } from "@/components/Gauge";
import {
  alertCardUrl,
  CATEGORY_LABEL,
  enhancedUrl,
  originalUrl,
  thumbUrl,
  videoPreviewUrl,
  type Bandwidth,
} from "@/lib/cld-url";
import type { Report, Severity, Status } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const SEV_RANK: Record<Severity, number> = { critical: 4, high: 3, moderate: 2, low: 1 };
const DEPTH_LABEL: Record<string, string> = {
  none: "None", ankle: "Ankle", knee: "Knee", waist: "Waist", chest_or_more: "Chest or deeper", unknown: "Can't tell",
};
const NEXT_STATUS: { status: Status; label: string }[] = [
  { status: "verified", label: "Mark verified" },
  { status: "dispatched", label: "Team dispatched" },
  { status: "resolved", label: "Resolved" },
  { status: "rejected", label: "Reject as false" },
];

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

export default function OpsBoard({ mode }: { mode: "public" | "responder" }) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [minSev, setMinSev] = useState<Severity>("low");
  const [hideClosed, setHideClosed] = useState(true);
  const [bw, setBw] = useState<Bandwidth>("normal");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/reports", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't load reports.");
      setReports(data.reports as Report[]);
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

  const queue = useMemo(
    () =>
      reports
        .filter((r) => !r.duplicateOf)
        .filter((r) => SEV_RANK[r.severity] >= SEV_RANK[minSev])
        .filter((r) => !hideClosed || (r.status !== "resolved" && r.status !== "rejected"))
        .sort((a, b) => Number(a.needsReview) - Number(b.needsReview) || b.score - a.score || Date.parse(b.createdAt) - Date.parse(a.createdAt)),
    [reports, minSev, hideClosed],
  );

  const selected = reports.find((r) => r.publicId === selectedId) ?? null;
  const duplicates = selected ? reports.filter((r) => r.duplicateOf === selected.publicId) : [];

  const savings = useMemo(() => {
    const measured = reports.filter((r) => r.thumbBytes > 0 && r.originalBytes > 0);
    const orig = measured.reduce((s, r) => s + r.originalBytes, 0);
    const thumb = measured.reduce((s, r) => s + r.thumbBytes, 0);
    return measured.length ? { orig, thumb, pct: Math.round((1 - thumb / orig) * 100) } : null;
  }, [reports]);

  async function changeStatus(status: Status) {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch("/api/reports", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ publicId: selected.publicId, resourceType: selected.resourceType, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setReports((rs) => rs.map((r) => (r.publicId === selected.publicId ? (data.report as Report) : r)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const blur = mode === "public" || !reveal;

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
          <label><input type="checkbox" checked={hideClosed} onChange={(e) => setHideClosed(e.target.checked)} /> Hide closed</label>
          <label><input type="checkbox" checked={bw === "saver"} onChange={(e) => setBw(e.target.checked ? "saver" : "normal")} /> 2G mode</label>
        </div>
        {savings && (
          <p className="saving">
            Queue images: <strong className="num">{kb(savings.thumb)}</strong> instead of{" "}
            <strong className="num">{kb(savings.orig)}</strong> of originals, {savings.pct}% less data.
          </p>
        )}
        {error && <p className="saving error" role="alert">{error}</p>}
        {loaded && queue.length === 0 && !error && (
          <p className="empty">
            No open reports match these filters. When a citizen files one from the Report page it appears here within a minute.
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
          <MapView reports={queue} selectedId={selectedId} onSelect={(r) => setSelectedId(r.publicId)} />
        </div>

        {selected && (
          <article className="detail" aria-label="Selected report">
            <div>
              <p className="hint">
                <span className="sev sev-text" data-sev={selected.severity}>{selected.severity}, score {selected.score}</span>{" "}
                {ago(selected.createdAt)}
              </p>
              <h2>{CATEGORY_LABEL[selected.primaryCategory]}</h2>
              <p>{selected.summary}</p>
              <p className="hi" lang="hi">{selected.summaryHi}</p>
              {mode === "responder" && selected.note && <p><strong>Reporter wrote:</strong> {selected.note}</p>}
              <dl>
                <dt>People visible</dt><dd className="num">{selected.peopleVisible}</dd>
                <dt>Anyone in danger</dt><dd>{selected.peopleInDanger ? "Yes" : "No sign"}</dd>
                <dt>Water depth</dt><dd>{DEPTH_LABEL[selected.waterDepth]}</dd>
                <dt>Vehicle access</dt><dd>{selected.accessBlocked ? "Blocked" : "Looks passable"}</dd>
                <dt>Also seen</dt><dd>{selected.categories.filter((c) => c !== selected.primaryCategory).map((c) => CATEGORY_LABEL[c]).join(", ") || "Nothing else"}</dd>
                <dt>Independent reports</dt><dd className="num">{selected.corroborations + 1}{duplicates.length > 0 && `, plus ${duplicates.length} forwarded copies merged`}</dd>
                <dt>Location</dt>
                <dd className="num">
                  <a href={`https://www.google.com/maps?q=${selected.lat},${selected.lng}`} target="_blank" rel="noreferrer">
                    {selected.lat.toFixed(4)}, {selected.lng.toFixed(4)}
                  </a>
                  {mode === "public" && " (approximate)"}
                </dd>
                <dt>Triage</dt><dd>{selected.aiMode === "live" ? "Cloudinary AI Vision" : "Rule-based from reporter's note"}{selected.needsReview && ", flagged for human review"}</dd>
                {mode === "responder" && <><dt>Status</dt><dd>{selected.status}</dd></>}
              </dl>
              {mode === "responder" && (
                <div className="row">
                  {NEXT_STATUS.filter((s) => s.status !== selected.status).map((s) => (
                    <button key={s.status} className={s.status === "dispatched" ? "btn btn-primary" : "btn"} disabled={busy} onClick={() => changeStatus(s.status)}>
                      {s.label}
                    </button>
                  ))}
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
