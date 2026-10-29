"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/components/LocaleProvider";
import { downscale } from "@/lib/downscale";
import { fmt } from "@/lib/i18n";
import { CATEGORY_LABEL } from "@/lib/labels";
import type { Category } from "@/lib/types";
import type { Verdict } from "@/lib/verify";

interface Result {
  knownOld: string | null;
  matches: { id: string; url: string; verdict: Verdict; category: Category; createdAt: string }[];
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

/** Pick a photo or screenshot, see whether Raahat knows it. */
export function CheckForm() {
  const { t: { check: t } } = useI18n();
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const blob = await downscale(file, 1024);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(blob);
      });
      const form = new FormData();
      form.append("file", blob, "check.jpg");
      const res = await fetch("/api/check", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? t.failed);
      setResult(data as Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : t.failed);
    } finally {
      setBusy(false);
    }
  }

  const top = result?.matches[0];
  return (
    <div className="check">
      <div className="check-pick">
        {preview && <img src={preview} alt="The photo you chose" />}
        <label className="btn btn-primary btn-lg" aria-disabled={busy}>
          {busy ? t.checking : preview ? t.another : t.choose}
          <input type="file" accept="image/*" onChange={pick} disabled={busy} />
        </label>
        <p className="hint">{t.hint}</p>
      </div>

      <div aria-live="polite">
        {error && <p className="error" role="alert">{error}</p>}
        {result && result.knownOld && (
          <section className="verdict verdict-false">
            <span className="verdict-icon" aria-hidden>!</span>
            <div>
              <h2>{t.oldTitle}</h2>
              <p>{fmt(t.old, { caption: result.knownOld })}</p>
            </div>
          </section>
        )}
        {result && !result.knownOld && top && (
          <section className={`verdict verdict-${top.verdict}`}>
            <span className="verdict-icon" aria-hidden>{top.verdict === "verified" ? "✓" : top.verdict === "false" ? "✕" : "…"}</span>
            <div>
              <h2>{t[top.verdict]}</h2>
              <p>
                {fmt(t.matches, { what: CATEGORY_LABEL[top.category], date: day(top.createdAt) })}{" "}
                <Link href={`/v/${top.id}`}>{t.seeFull}</Link>
              </p>
            </div>
          </section>
        )}
        {result && !result.knownOld && !top && (
          <section className="verdict verdict-pending">
            <span className="verdict-icon" aria-hidden>?</span>
            <div>
              <h2>{t.noneTitle}</h2>
              <p>{t.none}</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
