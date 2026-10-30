"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ResponderGate() {
  const router = useRouter();
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/responder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      if (res.ok) return router.refresh();
      setError((await res.json()).error ?? "That passcode didn't work.");
    } catch {
      setError("No connection. Check your network and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="gate">
      <div className="gate-card">
        <div className="gate-head">
          <span className="gate-lock" aria-hidden>
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
          </span>
          <div>
            <p className="gate-kicker">Authorised control-room staff only</p>
            <h1>Responder sign-in</h1>
          </div>
        </div>
        <p className="hint">
          The control room shows exact locations, reporters&rsquo; notes and unblurred photos. Enter the passcode your district
          control room shared with you.
        </p>
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="pc">Control-room passcode</label>
            <input id="pc" type="password" autoComplete="current-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn-primary gate-submit" disabled={busy || !passcode}>
            {busy ? "Checking…" : "Open the control room"}
          </button>
        </form>
        <ul className="gate-help">
          <li>No passcode? Ask your control-room lead. It is never sent by SMS or email.</li>
          <li>Sign-in lasts one shift (12 hours) on this device.</li>
          <li>Citizens don&rsquo;t need to sign in: <a href="/report">report an incident</a> or see the <a href="/map">public map</a>.</li>
        </ul>
      </div>
    </main>
  );
}
