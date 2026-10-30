"use client";

// The private case: add the fake and the original, see them side by side with their
// fingerprints, then fill in a few details to get the complaint and takedown texts.
// For now everything stays in this tab's memory (object URLs); nothing is uploaded.
// The face-match engine (Cloudinary face crops + in-browser matcher) plugs into the
// "Face match" panel.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  complaintText,
  EMPTY_DETAILS,
  istTime,
  PLATFORMS,
  sha256File,
  takedownText,
  type CaseDetails,
  type EvidenceFile,
} from "@/lib/evidence";

interface Picked extends EvidenceFile {
  url: string;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn btn-small"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          setDone(false);
        }
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}

function Dropzone({
  id,
  label,
  hint,
  multiple,
  onFiles,
}: {
  id: string;
  label: string;
  hint: string;
  multiple?: boolean;
  onFiles: (files: File[]) => void;
}) {
  return (
    <label htmlFor={id} className="dropzone">
      <input id={id} type="file" accept="image/*" multiple={multiple} onChange={(e) => { onFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }} />
      <span className="dropzone-icon" aria-hidden>＋</span>
      <span className="dropzone-label">{label}</span>
      <span className="dropzone-hint">{hint}</span>
    </label>
  );
}

export function CaseFlow() {
  const [files, setFiles] = useState<Picked[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [details, setDetails] = useState<CaseDetails>(EMPTY_DETAILS);
  const [busy, setBusy] = useState(false);
  const urls = useRef<string[]>([]);

  // Free the in-memory images when the page closes.
  useEffect(() => () => urls.current.forEach((u) => URL.revokeObjectURL(u)), []);

  async function add(role: Picked["role"], picked: File[]) {
    if (!picked.length) return;
    setBusy(true);
    const added = await Promise.all(
      picked.map(async (f) => {
        const url = URL.createObjectURL(f);
        urls.current.push(url);
        return { role, name: f.name, bytes: f.size, type: f.type, sha256: await sha256File(f), addedAt: new Date().toISOString(), url };
      }),
    );
    setFiles((prev) => (role === "chat" ? [...prev, ...added] : [...prev.filter((p) => p.role !== role), added[0]]));
    setBusy(false);
  }

  function deleteAll() {
    if (!confirm("Delete everything in this case? This cannot be undone.")) return;
    urls.current.forEach((u) => URL.revokeObjectURL(u));
    urls.current = [];
    setFiles([]);
    setDetails(EMPTY_DETAILS);
    setRevealed(false);
  }

  const fake = files.find((f) => f.role === "fake");
  const original = files.find((f) => f.role === "original");
  const chats = files.filter((f) => f.role === "chat");
  const step = !fake ? 1 : !original ? 2 : 3;

  const complaint = useMemo(() => complaintText(details, files), [details, files]);
  const takedown = useMemo(() => takedownText(details), [details]);

  function downloadSummary() {
    const blob = new Blob([`RAAHAT SHIELD EVIDENCE SUMMARY\nCreated ${istTime(new Date().toISOString())}\n\n${complaint}\n\n---\nTAKEDOWN REQUEST\n\n${takedown}\n`], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "raahat-shield-evidence-summary.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const set = (k: keyof CaseDetails) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setDetails((d) => ({ ...d, [k]: e.target.value }));

  return (
    <main className="case">
      <div className="case-head">
        <div>
          <p className="kicker">Private case</p>
          <h1>Prove it&rsquo;s fake</h1>
          <p className="lead">Nothing here is published. Images stay on this device until you choose to save the case.</p>
        </div>
        <button type="button" className="btn btn-danger" onClick={deleteAll} disabled={!files.length}>Delete my case</button>
      </div>

      <ol className="stepper" aria-label="Progress">
        {["Add the fake image", "Add your real photo", "See the proof", "Get your evidence pack"].map((label, i) => (
          <li key={label} data-state={i + 1 < step ? "done" : i + 1 === step ? "current" : "todo"} aria-current={i + 1 === step ? "step" : undefined}>
            <span className="stepper-n num">{i + 1}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      <section className="panel" aria-labelledby="add-h">
        <h2 id="add-h">1 &amp; 2. Add the two images</h2>
        <div className="pair">
          <div>
            <h3>The fake image</h3>
            {fake ? (
              <figure className="evidence-img">
                <img src={fake.url} alt="The morphed image" className={revealed ? "" : "blurred"} />
                <figcaption>
                  <button
                    type="button"
                    className="linklike"
                    onClick={() => {
                      if (revealed) setRevealed(false);
                      else if (confirm("This will show the image unblurred. Continue?")) setRevealed(true);
                    }}
                  >
                    {revealed ? "Blur again" : "Show unblurred"}
                  </button>
                  <label className="linklike replace">Replace<input type="file" accept="image/*" onChange={(e) => add("fake", Array.from(e.target.files ?? []))} /></label>
                </figcaption>
              </figure>
            ) : (
              <Dropzone id="fake" label="Add the fake image" hint="A screenshot or saved file. It stays blurred." onFiles={(f) => add("fake", f)} />
            )}
          </div>
          <div>
            <h3>Your real photo</h3>
            {original ? (
              <figure className="evidence-img">
                <img src={original.url} alt="Your original photo" />
                <figcaption>
                  <label className="linklike replace">Replace<input type="file" accept="image/*" onChange={(e) => add("original", Array.from(e.target.files ?? []))} /></label>
                </figcaption>
              </figure>
            ) : (
              <Dropzone id="original" label="Add your real photo" hint="The photo the face was taken from, e.g. saved from your Instagram." onFiles={(f) => add("original", f)} />
            )}
            <div className="field-row">
              <label>
                Link to your original post <span className="optional">(optional)</span>
                <input type="url" value={details.originalPostUrl} onChange={set("originalPostUrl")} placeholder="https://instagram.com/p/…" />
              </label>
              <label>
                Posted on
                <input type="date" value={details.originalPostDate} onChange={set("originalPostDate")} />
              </label>
            </div>
          </div>
        </div>
        {busy && <p className="hint" role="status">Fingerprinting your files…</p>}
      </section>

      <section className="panel" aria-labelledby="proof-h">
        <h2 id="proof-h">3. The proof</h2>
        {fake && original ? (
          <>
            <div className="proof-pair">
              <figure>
                <img src={original.url} alt="Your original photo" />
                <figcaption>Your photo</figcaption>
              </figure>
              <figure>
                <img src={fake.url} alt="The morphed image" className={revealed ? "" : "blurred"} />
                <figcaption>The fake</figcaption>
              </figure>
            </div>
            <div className="engine-slot" role="note">
              <strong>Face match</strong>
              <p>
                Coming next: Cloudinary finds and crops the face in both images, then your browser compares them and marks the
                matching points here, with a downloadable proof card.
              </p>
              <button type="button" className="btn btn-primary" disabled>Find the face match</button>
            </div>
          </>
        ) : (
          <p className="empty-state">Add both images and they will appear here side by side.</p>
        )}
        {files.length > 0 && (
          <table className="fingerprints">
            <caption>Fingerprints (SHA-256), taken on this device when each file was added</caption>
            <thead><tr><th scope="col">File</th><th scope="col">Added</th><th scope="col">SHA-256</th></tr></thead>
            <tbody>
              {files.map((f) => (
                <tr key={f.url}>
                  <td>{f.role === "fake" ? "Fake image" : f.role === "original" ? "Your photo" : "Chat screenshot"}<span>{f.name}</span></td>
                  <td className="num">{istTime(f.addedAt)}</td>
                  <td><code>{f.sha256.slice(0, 16)}…</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section id="pack" className="panel" aria-labelledby="pack-h">
        <h2 id="pack-h">4. Your evidence pack</h2>
        <p className="hint">Fill in what you know. Leave anything blank if you are not sure; you can add it later.</p>
        <div className="form-grid">
          <label>
            Where did it happen?
            <select value={details.platform} onChange={set("platform")}>
              {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label>
            Link to the post, profile or chat
            <input type="url" value={details.whereUrl} onChange={set("whereUrl")} placeholder="https://…" />
          </label>
          <label>
            Their username, number or UPI ID
            <input type="text" value={details.suspect} onChange={set("suspect")} placeholder="@username, +91…, name@upi" />
          </label>
          <label>
            First contacted you on
            <input type="date" value={details.firstContact} onChange={set("firstContact")} />
          </label>
          <label>
            What are they demanding?
            <input type="text" value={details.demand} onChange={set("demand")} placeholder="e.g. ₹20,000 by Friday" />
          </label>
          <label className="span-2">
            What happened, in your words <span className="optional">(optional)</span>
            <textarea value={details.story} onChange={set("story")} rows={3} />
          </label>
        </div>

        <div className="chat-shots">
          <h3>Screenshots of their messages</h3>
          <p className="hint">Usernames, phone numbers, payment requests and threats are the most useful.</p>
          {chats.length > 0 && (
            <ul className="thumbs">
              {chats.map((c) => <li key={c.url}><img src={c.url} alt={c.name} /></li>)}
            </ul>
          )}
          <Dropzone id="chat" label="Add screenshots" hint="You can add several at once." multiple onFiles={(f) => add("chat", f)} />
        </div>

        <div className="outputs">
          <article className="output">
            <header>
              <h3>Complaint for cybercrime.gov.in</h3>
              <div className="output-actions">
                <CopyButton text={complaint} label="Copy" />
                <a className="btn btn-small" href="https://cybercrime.gov.in" target="_blank" rel="noreferrer">Open portal</a>
              </div>
            </header>
            <pre>{complaint}</pre>
          </article>
          <article className="output">
            <header>
              <h3>Takedown request for {details.platform}</h3>
              <div className="output-actions"><CopyButton text={takedown} label="Copy" /></div>
            </header>
            <pre>{takedown}</pre>
          </article>
        </div>

        <div className="pack-actions">
          <button type="button" className="btn btn-primary" onClick={downloadSummary}>Download evidence summary</button>
          <a className="btn btn-ghost" href="https://stopncii.org" target="_blank" rel="noreferrer">Block re-uploads with StopNCII</a>
        </div>
        <p className="hint">
          On the portal, choose &ldquo;Report women/child related crime&rdquo;. You can also call <a href="tel:1930">1930</a>. The
          sections listed are suggestions; the police decide which apply.
        </p>
      </section>
    </main>
  );
}
