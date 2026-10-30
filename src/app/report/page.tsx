"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { Gauge } from "@/components/Gauge";
import { ImageReviewPanel } from "@/components/ImageReviewPanel";
import { EmergencyIcon } from "@/components/EmergencyActions";
import { CATEGORY_LABEL, thumbUrl } from "@/lib/cld-url";
import { REPORT_FOLDER, REPORT_TAG, REPORT_REFRESH_MS } from "@/lib/constants";
import { currentImageReview } from "@/lib/image-review-state";
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
type FiledReport = Report & { reviewReceipt?: string };

type Loc = { lat: number; lng: number; accuracy?: number; source: "gps" | "map_pin" } | null;

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
const MAX_BYTES = 40_000_000;
const QUICK_HAZARDS = [
  { id: "flood", label: "quickFlood", note: "Flooding" },
  { id: "fire", label: "quickFire", note: "Fire or smoke" },
  { id: "injured", label: "quickInjured", note: "Someone is trapped or injured" },
  { id: "road", label: "quickRoad", note: "Road blocked" },
] as const;

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

async function postReport(upload: Upload, meta: OutboxMeta): Promise<FiledReport> {
  const res = await fetch("/api/reports", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...upload, ...meta }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "The report didn't go through. Check your connection and send again.");
  return { ...data.report, reviewReceipt: data.reviewReceipt } as FiledReport;
}

export default function ReportPage() {
  const { locale, t: { report: t, severity, nav } } = useI18n();
  const lang = storageLang(locale); // what the report is stored in; the AI summarises in English and Hindi
  const [upload, setUpload] = useState<Upload | null>(null);
  const [loc, setLoc] = useState<Loc>(null);
  const [locState, setLocState] = useState<"idle" | "locating" | "found" | "failed" | "unknown">("idle");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [hazards, setHazards] = useState<string[]>([]);
  const [showMap, setShowMap] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FiledReport | null>(null);
  // Offline support: a photo that couldn't upload yet, and reports saved on the phone.
  const [local, setLocal] = useState<{ blob: Blob; url: string } | null>(null);
  const [offlineNote, setOfflineNote] = useState(false);
  const [queuedId, setQueuedId] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(0);
  const [flushing, setFlushing] = useState(false);
  const queuedRef = useRef<string | null>(null);
  const busyRef = useRef(false);
  const sendingRef = useRef(false);
  const locationRequest = useRef(0);
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

  // The server owns the ten-second delay. This only watches the saved outcome.
  const resultId = result?.publicId;
  const reviewReceipt = result?.reviewReceipt;
  const reviewStatus = result?.imageReview?.status;
  useEffect(() => {
    if (!resultId || !reviewReceipt || reviewStatus !== "pending") return;
    const controller = new AbortController();
    let checking = false;
    async function refreshAssessment() {
      if (checking) return;
      checking = true;
      try {
        const response = await fetch("/api/reports/review", { cache: "no-store", signal: controller.signal,
          headers: { Authorization: `Bearer ${reviewReceipt}` } });
        if (!response.ok) throw new Error("Review unavailable");
        const update = await response.json();
        if (update.publicId === resultId) setResult((previous) => previous && previous.publicId === resultId ? { ...previous, ...update } : previous);
      } catch {
        if (!controller.signal.aborted) setResult((previous) => previous && previous.publicId === resultId
          ? { ...previous, imageReview: currentImageReview(previous.imageReview) } : previous);
      } finally { checking = false; }
    }
    const interval = setInterval(refreshAssessment, REPORT_REFRESH_MS);
    return () => { clearInterval(interval); controller.abort(); };
  }, [resultId, reviewReceipt, reviewStatus]);

  const locate = useCallback(() => {
    const request = ++locationRequest.current;
    if (!("geolocation" in navigator)) return setLocState("failed");
    setLocState("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        if (request !== locationRequest.current) return;
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy, source: "gps" });
        setLocState("found");
      },
      () => { if (request === locationRequest.current) setLocState("failed"); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 },
    );
  }, []);

  useEffect(() => {
    locate();
    return () => { locationRequest.current++; };
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

  async function queue(meta: OutboxMeta, uploaded = upload) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await putItem({ id, createdAt: Date.now(), blob: uploaded ? null : local!.blob, upload: uploaded, meta });
    setQueuedId(id);
    setWaiting((n) => n + 1);
  }

  async function send() {
    if (sendingRef.current || uploading) return;
    setError(null);
    if (!upload && !local) return setError(t.needPhoto);
    // No location is fine: the report is never dropped, a coordinator pins it.
    const where = locState === "unknown" ? null : loc;
    const description = [...QUICK_HAZARDS.filter((hazard) => hazards.includes(hazard.id)).map((hazard) => hazard.note), note.trim()].filter(Boolean).join(". ").slice(0, 500);
    const meta: OutboxMeta = { lat: where?.lat ?? null, lng: where?.lng ?? null, locationSource: where?.source, place, note: description, lang };
    sendingRef.current = true;
    setSending(true);
    let uploaded = upload;
    try {
      // A server-side upload error is retried explicitly, never labelled "no signal".
      if (!uploaded) {
        uploaded = await online(() => uploadPhoto(local!.blob));
        setUpload(uploaded);
      }
      setResult(await online(() => postReport(uploaded!, meta)));
    } catch (e) {
      if (e instanceof OfflineError) await queue(meta, uploaded);
      else setError((e as Error).message);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function reset() {
    setUpload(null);
    setLocal(null);
    setOfflineNote(false);
    setNote("");
    setHazards([]);
    setShowMap(false);
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
      {(result || queuedId) && <p className="urgent-contact"><span>{t.urgentCallHint}</span><a href="tel:112"><EmergencyIcon kind="phone" size={20} />{t.urgentCall}</a></p>}

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
          <ImageReviewPanel review={result.imageReview} showReason />
          <div className="preview" style={{ marginTop: 16 }}>
            <img src={thumbUrl(result, "normal", true)} alt="Your photo, with faces pixelated as responders and the public see it" />
          </div>
          <button className="btn" onClick={reset} style={{ marginTop: 8 }}>{t.another}</button>
        </section>
      ) : (
        <form className="urgent-report-form" onSubmit={(event) => { event.preventDefault(); void send(); }}>
          <header className="urgent-heading">
            <h1>{t.urgentTitle}</h1>
            <p>{t.urgentLead}</p>
          </header>

          <section className="urgent-photo" aria-labelledby="photo-step">
            <h2 id="photo-step"><span className="urgent-step" aria-hidden>1</span>{t.urgentPhotoStep}</h2>
            {local ? <div className="preview urgent-photo-preview"><img src={local.url} alt="" />
              <span className="urgent-photo-status" role="status"><EmergencyIcon kind="check" size={18} />{uploading ? t.uploading : t.urgentPhotoReady}</span>
            </div> : upload ? <div className="preview urgent-photo-preview"><img src={thumbUrl(upload, "normal", true)} alt="" /></div> : null}
            <div className="capture urgent-capture" aria-busy={uploading}>
              <label className="btn emergency-report-button btn-capture" aria-disabled={uploading || sending}>
                <EmergencyIcon kind="camera" size={28} />{uploading ? t.uploading : upload || local ? t.retake : t.takePhoto}
                <input type="file" accept="image/*" capture="environment" onChange={pick} disabled={uploading || sending} />
              </label>
              <label className="btn" aria-disabled={uploading || sending}>
                {t.gallery}
                <input type="file" accept="image/*,video/*" onChange={pick} disabled={uploading || sending} />
              </label>
            </div>
            {offlineNote && <p className="hint offline-note" role="status">{t.urgentOfflineHint}</p>}
          </section>

          <section className="urgent-location" aria-label={t.location}>
            <EmergencyIcon kind="location" />
            <div aria-live="polite"><strong>{locState === "locating" ? t.locating : locState === "found" ? t.locationFound : t.urgentLocationOptional}</strong>
              <p>{t.urgentNoTyping}</p>
            </div>
          </section>

          <fieldset className="urgent-hazards">
            <legend>{t.urgentQuickTitle}</legend>
            <div>{QUICK_HAZARDS.map((hazard) => <button type="button" key={hazard.id} aria-pressed={hazards.includes(hazard.id)}
              onClick={() => setHazards((previous) => previous.includes(hazard.id) ? previous.filter((id) => id !== hazard.id) : [...previous, hazard.id])}>
              <span className="hazard-check" aria-hidden>{hazards.includes(hazard.id) && <EmergencyIcon kind="check" size={16} />}</span>{t[hazard.label]}
            </button>)}</div>
          </fieldset>

          <details className="urgent-details">
            <summary>{t.urgentDetails}</summary>
            <div className="urgent-details-body">
              <div className="field">
                <span className="label">{t.location}</span>
                {loc && locState !== "unknown" && <p className="hint num">{loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}</p>}
                <div className="loc-actions">
                  <button type="button" className="btn" onClick={locate} disabled={locState === "locating"}>{t.useLocation}</button>
                  <button type="button" className="btn" aria-expanded={showMap} onClick={() => setShowMap((previous) => !previous)}>{t.urgentChooseMap}</button>
                  <button type="button" className="btn" onClick={() => { locationRequest.current++; setLocState("unknown"); setShowMap(false); }}>{t.urgentSkipLocation}</button>
                </div>
                {showMap && <><div className="urgent-picker">
                  <MapView pin={locState === "unknown" ? null : loc} regionalOverview onPick={(lat, lng) => {
                    locationRequest.current++;
                    setLoc({ lat, lng, source: "map_pin" }); setLocState("found");
                  }} />
                </div><p className="hint">{t.tapMap}</p></>}
              </div>
              <div className="field">
                <label htmlFor="place">{t.describePlace}</label>
                <input id="place" type="text" value={place} onChange={(e) => setPlace(e.target.value)} placeholder={t.describePlaceholder} maxLength={200} />
                <p className="hint">{t.describePlaceHint}</p>
              </div>
              <div className="field">
                <label htmlFor="note">{t.noteLabel}</label>
                <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t.notePlaceholder} maxLength={500} />
              </div>
            </div>
          </details>

          {error && <p className="error" role="alert">{error}</p>}
          <div className="urgent-send-space" aria-hidden />
          <div className="urgent-send-bar">
            <p>{!upload && !local ? t.needPhoto : t.urgentSendStep}</p>
            <div>
              <a className="btn emergency-call-button" href="tel:112"><EmergencyIcon kind="phone" size={22} />{t.urgentCall}</a>
              <button type="submit" className="btn emergency-report-button" disabled={sending || uploading || (!upload && !local)}>
                {sending ? t.sending : uploading ? t.uploading : offlineNote ? t.urgentSave : t.send}<span aria-hidden>→</span>
              </button>
            </div>
          </div>
        </form>
      )}
    </main>
  );
}
