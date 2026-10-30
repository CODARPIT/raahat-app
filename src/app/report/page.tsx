"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Gauge } from "@/components/Gauge";
import { CATEGORY_LABEL, thumbUrl } from "@/lib/cld-url";
import { REPORT_FOLDER, REPORT_TAG } from "@/lib/constants";
import { downscale } from "@/lib/downscale";
import { useI18n } from "@/components/LocaleProvider";
import { fmt, storageLang } from "@/lib/i18n";
import { listItems, online, OfflineError, putItem, removeItem, type OutboxMeta } from "@/lib/outbox";
import type { Report } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

interface Upload {
  publicId: string;
  resourceType: "image" | "video";
}

type Loc = { lat: number; lng: number; accuracy?: number; source: "gps" | "map_pin" } | null;

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
const MAX_BYTES = 40_000_000;

/** Signed direct upload, so the camera opens in one tap instead of inside a widget. */
async function uploadPhoto(body: Blob): Promise<Upload> {
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = { folder: REPORT_FOLDER, tags: REPORT_TAG, timestamp };
  const signRes = await fetch("/api/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paramsToSign }),
  });
  const signed = await signRes.json();
  if (!signRes.ok) throw new Error(signed.error ?? "Couldn't prepare the upload.");

  const form = new FormData();
  form.append("file", body);
  form.append("api_key", API_KEY ?? "");
  form.append("timestamp", String(timestamp));
  form.append("folder", REPORT_FOLDER);
  form.append("tags", REPORT_TAG);
  form.append("signature", signed.signature);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/auto/upload`, { method: "POST", body: form });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message ?? "The photo didn't upload. Check your connection and try again.");
  return { publicId: data.public_id, resourceType: data.resource_type === "video" ? "video" : "image" };
}

async function postReport(upload: Upload, meta: OutboxMeta): Promise<Report> {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...upload, ...meta }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "The report didn't go through. Check your connection and send again.");
  return data.report as Report;
}

export default function ReportPage() {
  const { locale, t: { report: t, severity, nav } } = useI18n();
  const lang = storageLang(locale); // what the report is stored in; the AI summarises in English and Hindi
  const [upload, setUpload] = useState<Upload | null>(null);
  const [loc, setLoc] = useState<Loc>(null);
  const [locState, setLocState] = useState<"idle" | "locating" | "found" | "failed" | "unknown">("idle");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Report | null>(null);
  // Offline support: a photo that couldn't upload yet, and reports saved on the phone.
  const [local, setLocal] = useState<{ blob: Blob; url: string } | null>(null);
  const [offlineNote, setOfflineNote] = useState(false);
  const [queuedId, setQueuedId] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const queuedRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  queuedRef.current = queuedId;

  useEffect(() => {
    if (!local) return;
    return () => URL.revokeObjectURL(local.url);
  }, [local]);

  /** Send everything saved on the phone, oldest first. Stops at the first sign of no signal. */
  const flush = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const items = await listItems();
      setWaiting(items.length);
      if (!items.length) return;
      setFlushing(true);
      for (const item of items) {
        try {
          let up = item.upload;
          if (!up) {
            up = await online(() => uploadPhoto(item.blob!));
            await putItem({ ...item, upload: up, blob: null }); // never upload the same photo twice
          }
          const report = await online(() => postReport(up!, item.meta));
          await removeItem(item.id);
          if (item.id === queuedRef.current) {
            setResult(report);
            setQueuedId(null);
          }
        } catch (err) {
          if (err instanceof OfflineError) break;
          // Sent earlier but the reply was lost on a weak connection: it's already in the queue.
          if (/already triaged/i.test((err as Error).message)) {
            await removeItem(item.id);
            continue;
          }
          // A server error: keep it and try again on the next round.
          console.warn("[raahat] saved report not sent yet:", (err as Error).message);
        }
      }
      setWaiting((await listItems()).length);
    } finally {
      setFlushing(false);
      busyRef.current = false;
    }
  }, []);

  useEffect(() => {
    flush();
    window.addEventListener("online", flush);
    const id = setInterval(flush, 20000);
    return () => {
      window.removeEventListener("online", flush);
      clearInterval(id);
    };
  }, [flush]);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) return setLocState("failed");
    setLocState("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, source: "gps" });
        setLocState("found");
      },
      () => setLocState("failed"),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  }, []);

  useEffect(() => {
    locate();
  }, [locate]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file again still fires
    if (!file) return;
    if (file.size > MAX_BYTES) {
      return setError(t.tooBig);
    }
    setError(null);
    setOfflineNote(false);
    setUpload(null);
    setUploading(true);
    try {
      const blob = await downscale(file);
      setLocal({ blob, url: URL.createObjectURL(blob) });
      setUpload(await online(() => uploadPhoto(blob)));
    } catch (err) {
      // No signal: keep the photo on the phone; it goes with the report when the connection returns.
      if (err instanceof OfflineError) setOfflineNote(true);
      else setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function queue(meta: OutboxMeta) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await putItem({ id, createdAt: Date.now(), blob: upload ? null : local!.blob, upload, meta });
    setQueuedId(id);
    setWaiting((n) => n + 1);
  }

  async function send() {
    setError(null);
    if (!upload && !local) return setError(t.needPhoto);
    // No location is fine: the report is never dropped, a coordinator pins it.
    const where = locState === "unknown" ? null : loc;
    const meta: OutboxMeta = { lat: where?.lat ?? null, lng: where?.lng ?? null, locationSource: where?.source, place, note, lang };
    setSending(true);
    try {
      if (!upload) await queue(meta); // the photo itself is still waiting for signal
      else setResult(await online(() => postReport(upload, meta)));
    } catch (e) {
      if (e instanceof OfflineError) await queue(meta);
      else setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setUpload(null);
    setLocal(null);
    setOfflineNote(false);
    setNote("");
    setPlace("");
    setResult(null);
    setQueuedId(null);
    setError(null);
  }

  return (
    <main className="report-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          <li><a href="/">{nav.home}</a></li>
          <li aria-current="page">{nav.report}</li>
        </ol>
      </nav>

      {waiting > 0 && !queuedId && (
        <p className="outbox-banner" role="status">
          {flushing ? t.sendingSaved : fmt(t.waiting, { n: waiting })}
        </p>
      )}

      {queuedId && !result ? (
        <section aria-live="polite" className="saved">
          <div className="result">
            <span className="saved-icon" aria-hidden>⇡</span>
            <div>
              <p className="hint">{flushing ? t.sendingSaved : t.waitingSignal}</p>
              <h2>{t.savedTitle}</h2>
              <p>{t.savedBody}</p>
            </div>
          </div>
          {local && (
            <div className="preview" style={{ marginTop: 16 }}>
              <img src={local.url} alt="" />
            </div>
          )}
          <div className="row-actions">
            <button className="btn btn-primary" onClick={flush} disabled={flushing}>{t.tryNow}</button>
            <button className="btn" onClick={reset}>{t.another}</button>
          </div>
          <p className="safety">{t.safety}</p>
        </section>
      ) : result ? (
        <section aria-live="polite">
          <div className="result">
            <Gauge severity={result.severity} />
            <div>
              <p className="hint">{t.sent}</p>
              {/* Repeat and matching reports lead with that, not only the priority. */}
              {result.duplicateOf ? (
                <p className="result-note">{t.duplicate}</p>
              ) : result.corroborations > 0 ? (
                <p className="result-note">{fmt(t.corroborated, { n: result.corroborations })}</p>
              ) : null}
              <h2>
                {t.priority}: <span className="sev sev-text" data-sev={result.severity}>{severity[result.severity]}</span>
              </h2>
              <p lang={lang}>{lang === "hi" ? result.summaryHi : result.summary}</p>
              <p className="hint">
                {CATEGORY_LABEL[result.primaryCategory]}
              </p>
              {result.lat === null && <p className="hint">{t.pendingLocation}</p>}
              {result.incidentId && <p className="result-note">
                {fmt(t.incidentAreaLabel, { radius: result.incidentRadiusM ?? 300 })}{" "}
                {(result.incidentReportCount ?? 0) > 1 && fmt(t.incidentLinked, { n: result.incidentReportCount ?? 0 })}
              </p>}
            </div>
          </div>
          <div className="preview" style={{ marginTop: 16 }}>
            <img src={thumbUrl(result, "normal", true)} alt="Your photo, with faces pixelated as responders and the public see it" />
          </div>
          <button className="btn" onClick={reset} style={{ marginTop: 8 }}>{t.another}</button>
        </section>
      ) : (
        <>
          <h1>{t.title}</h1>
          <p className="lead">{t.lead}</p>

          <div className="field">
            {upload ? (
              <div className="preview">
                <img src={thumbUrl(upload, "normal", true)} alt="Selected photo, faces pixelated" />
              </div>
            ) : local && !uploading ? (
              <div className="preview">
                <img src={local.url} alt="Selected photo, saved on this phone" />
              </div>
            ) : null}
            {offlineNote && <p className="hint offline-note" role="status">{t.photoSavedOffline}</p>}
            <div className="capture" aria-busy={uploading}>
              {/* capture="environment" opens the rear camera directly on phones */}
              <label className="btn btn-primary btn-capture" aria-disabled={uploading}>
                {uploading ? t.uploading : upload || local ? t.retake : t.takePhoto}
                <input type="file" accept="image/*" capture="environment" onChange={pick} disabled={uploading} />
              </label>
              <label className="btn" aria-disabled={uploading}>
                {t.gallery}
                <input type="file" accept="image/*,video/*" onChange={pick} disabled={uploading} />
              </label>
            </div>
          </div>

          <div className="field">
            <span className="label">{t.location}</span>
            <div className="loc-line">
              <span>
                {locState === "locating" && t.locating}
                {locState === "found" && loc && (
                  <>
                    {t.locationFound}{" "}
                    <span className="num">({loc.lat.toFixed(4)}, {loc.lng.toFixed(4)})</span>
                  </>
                )}
                {locState === "failed" && !loc && t.locationFailed}
                {locState === "failed" && loc && <span className="num">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</span>}
                {locState === "unknown" && t.noLocationNote}
              </span>
              <span className="loc-actions">
                {locState !== "locating" && (
                  <button type="button" className="btn" onClick={locate}>{t.useLocation}</button>
                )}
                {locState !== "unknown" && locState !== "found" && (
                  <button type="button" className="btn" onClick={() => setLocState("unknown")}>{t.dontKnow}</button>
                )}
              </span>
            </div>
            {locState === "failed" && (
              <div style={{ height: 240, marginTop: 10, borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" }}>
                <MapView pin={loc} onPick={(lat, lng) => setLoc({ lat, lng, source: "map_pin" })} />
              </div>
            )}
            {locState === "failed" && <p className="hint">{t.tapMap}</p>}
          </div>

          {(locState === "unknown" || (locState === "failed" && !loc)) && (
            <div className="field">
              <label htmlFor="place">{t.describePlace}</label>
              <input id="place" type="text" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t.describePlaceholder} maxLength={200} />
              <p className="hint">{t.describePlaceHint}</p>
            </div>
          )}

          <div className="field">
            <label htmlFor="note">{t.noteLabel}</label>
            <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePlaceholder} maxLength={500} />
          </div>

          {error && <p className="error" role="alert">{error}</p>}
          <button type="button" className="btn btn-primary" style={{ width: "100%", minHeight: 56, fontSize: 19 }} onClick={send} disabled={sending}>
            {sending ? t.sending : t.send}
          </button>
          <p className="safety">{t.safety}</p>
        </>
      )}
    </main>
  );
}
