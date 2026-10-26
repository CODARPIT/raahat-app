"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { Gauge } from "@/components/Gauge";
import { CATEGORY_LABEL, thumbUrl } from "@/lib/cld-url";
import { REPORT_FOLDER, REPORT_TAG } from "@/lib/constants";
import { SEVERITY_LABEL, T, type Lang } from "@/lib/i18n";
import type { Report } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

interface Upload {
  publicId: string;
  resourceType: "image" | "video";
}

type Loc = { lat: number; lng: number; accuracy?: number; source: "gps" | "map_pin" } | null;

const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const API_KEY = process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY;
const MAX_SIDE = 1600;
const MAX_BYTES = 40_000_000;

/** Downscale on the phone before upload: a 12 MP photo becomes a few hundred KB. */
async function downscale(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file; // e.g. a HEIC the browser can't decode; Cloudinary converts it instead
  }
}

/** Signed direct upload, so the camera opens in one tap instead of inside a widget. */
async function uploadPhoto(file: File): Promise<Upload> {
  const timestamp = Math.round(Date.now() / 1000);
  const paramsToSign = { folder: REPORT_FOLDER, tags: REPORT_TAG, timestamp };
  const [body, signRes] = await Promise.all([
    downscale(file),
    fetch("/api/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paramsToSign }),
    }),
  ]);
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

export default function ReportPage() {
  const [lang, setLang] = useState<Lang>("en");
  const t = T[lang];
  const [upload, setUpload] = useState<Upload | null>(null);
  const [loc, setLoc] = useState<Loc>(null);
  const [locState, setLocState] = useState<"idle" | "locating" | "found" | "failed" | "unknown">("idle");
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Report | null>(null);

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
    if (navigator.language?.startsWith("hi")) setLang("hi");
  }, [locate]);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same file again still fires
    if (!file) return;
    if (file.size > MAX_BYTES) {
      return setError(lang === "hi" ? "फ़ाइल 40 MB से बड़ी है।" : "That file is over 40 MB. Try a photo or a shorter video.");
    }
    setError(null);
    setUploading(true);
    try {
      setUpload(await uploadPhoto(file));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    setError(null);
    if (!upload) return setError(t.needPhoto);
    // No location is fine: the report is never dropped, a coordinator pins it.
    const where = locState === "unknown" ? null : loc;
    setSending(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...upload,
          lat: where?.lat ?? null,
          lng: where?.lng ?? null,
          locationSource: where?.source,
          place,
          note,
          lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "The report didn't go through. Check your connection and send again.");
      setResult(data.report as Report);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setUpload(null);
    setNote("");
    setPlace("");
    setResult(null);
    setError(null);
  }

  return (
    <main className="report-page" lang={lang}>
      <div className="lang-toggle" role="group" aria-label="Language">
        <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>English</button>
        <button aria-pressed={lang === "hi"} onClick={() => setLang("hi")} lang="hi">हिंदी</button>
      </div>

      {result ? (
        <section aria-live="polite">
          <div className="result">
            <Gauge severity={result.severity} />
            <div>
              <p className="hint">{t.sent}</p>
              <h2>
                {t.priority}: <span className="sev sev-text" data-sev={result.severity}>{SEVERITY_LABEL[lang][result.severity]}</span>
              </h2>
              <p>{lang === "hi" ? result.summaryHi : result.summary}</p>
              <p className="hint">
                {CATEGORY_LABEL[result.primaryCategory]}
                {result.duplicateOf && (lang === "hi" ? ". यह घटना पहले से दर्ज है, आपकी फ़ोटो जोड़ दी गई।" : ". Already reported; your photo was added to it.")}
                {!result.duplicateOf && result.corroborations > 0 &&
                  (lang === "hi" ? `. ${result.corroborations} और लोगों ने यही बताया है।` : `. ${result.corroborations} other people reported this too.`)}
              </p>
              {result.lat === null && <p className="hint">{t.pendingLocation}</p>}
            </div>
          </div>
          <div className="preview" style={{ marginTop: 16 }}>
            <img src={thumbUrl(result, "normal", true)} alt="Your photo, with faces pixelated as responders and the public see it" />
          </div>
          <button className="btn" onClick={reset} style={{ marginTop: 8 }}>{t.another}</button>
        </section>
      ) : (
        <>
          <h1>{t.reportTitle}</h1>
          <p className="lead">{t.reportLead}</p>

          <div className="field">
            {upload && (
              <div className="preview">
                <img src={thumbUrl(upload, "normal", true)} alt="Selected photo, faces pixelated" />
              </div>
            )}
            <div className="capture" aria-busy={uploading}>
              {/* capture="environment" opens the rear camera directly on phones */}
              <label className="btn btn-primary btn-capture" aria-disabled={uploading}>
                {uploading ? t.uploading : upload ? t.retake : t.takePhoto}
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
