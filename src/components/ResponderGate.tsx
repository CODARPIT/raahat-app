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
    const res = await fetch("/api/responder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passcode }),
    });
    setBusy(false);
    if (res.ok) router.refresh();
    else setError((await res.json()).error);
  }

  return (
    <main className="gate">
      <h1>Control room</h1>
      <p className="hint">
        Responders see exact locations, reporters' notes and unblurred photos. Enter the passcode your district
        control room shared with you.
      </p>
      <form onSubmit={submit}>
        <div className="field">
          <label htmlFor="pc">Passcode</label>
          <input id="pc" type="password" autoComplete="current-password" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn-primary" disabled={busy || !passcode}>Open the control room</button>
      </form>
    </main>
  );
}
