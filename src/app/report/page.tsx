"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import { CldUploadWidget, type CloudinaryUploadWidgetInfo } from "next-cloudinary";
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

type Loc = { lat: number; lng: number; accuracy?: number } | null;

export default function ReportPage() {
  const [lang, setLang] = useState<Lang>("en");
  const t = T[lang];
  const [upload, setUpload] = useState<Upload | null>(null);
  const [loc, setLoc] = useState<Loc>(null);
  const [locState, setLocState] = useState<"idle" | "locating" | "found" | "failed">("idle");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Report | null>(null);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) return setLocState("failed");
    setLocState("locating");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy });
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

  async function send() {
    setError(null);
    if (!upload) return setError(t.needPhoto);
    if (!loc) return setError(t.needLocation);
    setSending(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...upload, lat: loc.lat, lng: loc.lng, note, lang }),
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
            <CldUploadWidget
              signatureEndpoint="/api/sign"
              options={{
                folder: REPORT_FOLDER,
                tags: [REPORT_TAG],
                sources: ["camera", "local"],
                multiple: false,
                maxFiles: 1,
                resourceType: "auto",
                clientAllowedFormats: ["jpg", "jpeg", "png", "webp", "heic", "mp4", "mov", "3gp"],
                maxFileSize: 40_000_000,
                // Downscale on the phone before upload: a 12 MP photo becomes a few hundred KB.
                maxImageWidth: 1600,
                maxImageHeight: 1600,
                showPoweredBy: false,
              }}
              onSuccess={(res) => {
                const info = res.info as CloudinaryUploadWidgetInfo;
                if (info?.public_id) {
                  setUpload({ publicId: info.public_id, resourceType: info.resource_type === "video" ? "video" : "image" });
                  setError(null);
                }
              }}
            >
              {({ open, isLoading }) => (
                <button type="button" className="btn btn-capture" onClick={() => open()} disabled={isLoading}>
                  {upload ? t.retake : t.takePhoto}
                </button>
              )}
            </CldUploadWidget>
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
              </span>
              {locState !== "locating" && (
                <button type="button" className="btn" style={{ minHeight: 38 }} onClick={locate}>{t.useLocation}</button>
              )}
            </div>
            {locState === "failed" && (
              <div style={{ height: 240, marginTop: 10, borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)" }}>
                <MapView pin={loc} onPick={(lat, lng) => setLoc({ lat, lng })} />
              </div>
            )}
            {locState === "failed" && <p className="hint">{lang === "hi" ? "नक़्शे पर अपनी जगह पर टैप करें।" : "Or tap your spot on the map."}</p>}
          </div>

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
