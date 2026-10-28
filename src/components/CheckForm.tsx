"use client";

import Link from "next/link";
import { useState } from "react";
import { downscale } from "@/lib/downscale";
import { CATEGORY_LABEL } from "@/lib/labels";
import type { Category } from "@/lib/types";
import { VERDICT_LABEL, type Verdict } from "@/lib/verify";

interface Result {
  knownOld: string | null;
  matches: { id: string; url: string; verdict: Verdict; category: Category; createdAt: string }[];
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

/** Pick a photo or screenshot, see whether Raahat knows it. */
export function CheckForm() {
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
      if (!res.ok) throw new Error(data.error ?? "The check didn't go through.");
      setResult(data as Result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The check didn't go through. Try again.");
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
          {busy ? "Checking…" : preview ? "Check another photo" : "Choose a photo or screenshot"}
          <input type="file" accept="image/*" onChange={pick} disabled={busy} />
        </label>
        <p className="hint">Works best with the photo itself or a clean screenshot, cropped to the picture. The photo is deleted as soon as it&rsquo;s checked.</p>
      </div>

      <div aria-live="polite">
        {error && <p className="error" role="alert">{error}</p>}
        {result && result.knownOld && (
          <section className="verdict verdict-false">
            <span className="verdict-icon" aria-hidden>!</span>
            <div>
              <h2>This is an old photo</h2>
              <p>It matches a photo from <strong>{result.knownOld}</strong>. Please don&rsquo;t forward it as a new incident.</p>
            </div>
          </section>
        )}
        {result && !result.knownOld && top && (
          <section className={`verdict verdict-${top.verdict}`}>
            <span className="verdict-icon" aria-hidden>{top.verdict === "verified" ? "✓" : top.verdict === "false" ? "✕" : "…"}</span>
            <div>
              <h2>{VERDICT_LABEL[top.verdict].en}</h2>
              <p lang="hi">{VERDICT_LABEL[top.verdict].hi}</p>
              <p>
                Matches a Raahat report: {CATEGORY_LABEL[top.category]}, reported {day(top.createdAt)}.{" "}
                <Link href={`/v/${top.id}`}>See the full fact check</Link>
              </p>
            </div>
          </section>
        )}
        {result && !result.knownOld && !top && (
          <section className="verdict verdict-pending">
            <span className="verdict-icon" aria-hidden>?</span>
            <div>
              <h2>No record of this photo</h2>
              <p>
                Raahat hasn&rsquo;t received this photo. That doesn&rsquo;t make it false, only unconfirmed. Check the date and
                place before sharing, and follow NDMA, IMD or your district administration for official updates.
              </p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
