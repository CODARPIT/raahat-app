import Link from "next/link";
import { listReports } from "@/lib/reports";
import type { Severity } from "@/lib/types";

export const revalidate = 30;

const BANDS: { sev: Severity; label: string; color: string }[] = [
  { sev: "critical", label: "critical: life at risk", color: "var(--sev-critical)" },
  { sev: "high", label: "high: urgent help needed", color: "var(--sev-high)" },
  { sev: "moderate", label: "moderate: damage, no one in danger", color: "var(--sev-moderate)" },
  { sev: "low", label: "low: monitor", color: "var(--sev-low)" },
];

export default async function Home() {
  const whatsapp =
    process.env.TWILIO_WHATSAPP_NUMBER && process.env.TWILIO_SANDBOX_JOIN
      ? { number: process.env.TWILIO_WHATSAPP_NUMBER, join: process.env.TWILIO_SANDBOX_JOIN }
      : null;
  let counts: Record<Severity, number> = { critical: 0, high: 0, moderate: 0, low: 0 };
  try {
    const open = (await listReports()).filter((r) => !r.duplicateOf && r.status !== "resolved" && r.status !== "rejected");
    for (const r of open) counts[r.severity]++;
  } catch {
    counts = { critical: 0, high: 0, moderate: 0, low: 0 };
  }

  return (
    <main>
      <section className="hero">
        <div>
          <h1>When the water rises, every photo is a call for help.</h1>
          <p className="lead">
            In a flood, control rooms receive thousands of forwarded photos and no way to tell which one is a
            family on a roof. Raahat reads each photo with Cloudinary AI, merges the duplicates, blurs every face,
            and hands responders a ranked queue that loads on 2G.
          </p>
          <div className="actions">
            <Link className="btn btn-primary" href="/report">Report what you see</Link>
            <Link className="btn" href="/respond">Open the control room</Link>
          </div>
        </div>
        <div aria-label="Open reports by severity">
          <div className="staff">
            <div className="staff-pole" aria-hidden>
              {BANDS.map((b) => (
                <div key={b.sev} style={{ "--c": b.color } as React.CSSProperties} />
              ))}
            </div>
            <div className="staff-marks">
              {BANDS.map((b) => (
                <div key={b.sev}>
                  <strong className="num" style={{ color: b.color }}>{counts[b.sev]}</strong>
                  <span>{b.label}</span>
                </div>
              ))}
            </div>
          </div>
          <p className="hero-caption">Open reports right now, read off the same gauge staff painted on river bridges.</p>
        </div>
      </section>

      <section className="flow" aria-labelledby="flow-h">
        <h2 id="flow-h">What happens to one photo</h2>
        <ol>
          <li>
            <h3>A citizen sends it</h3>
            <p>Camera or gallery, in Hindi or English. The Upload Widget shrinks it on the phone first, so it gets through on a weak signal.</p>
          </li>
          <li>
            <h3>Cloudinary AI reads it</h3>
            <p>AI Vision tags the hazard, counts people, judges water depth against doors and cars, and flags screenshots or unrelated images.</p>
          </li>
          <li>
            <h3>Duplicates merge, faces blur</h3>
            <p>A perceptual hash catches the same photo forwarded fifty times. <code>e_pixelate_faces</code> protects everyone in frame.</p>
          </li>
          <li>
            <h3>Responders act</h3>
            <p>A ranked queue and map, thumbnails of a few kilobytes, and one-tap alert cards ready to forward to field teams on WhatsApp.</p>
          </li>
        </ol>
      </section>

      {whatsapp && (
        <section className="flow wa" aria-labelledby="wa-h">
          <h2 id="wa-h">Report on WhatsApp</h2>
          <p className="lead">No app, no website. Send a photo the way you already do.</p>
          <ol>
            <li>
              <h3>Join once</h3>
              <p>
                Message <strong className="num">{whatsapp.join}</strong> to{" "}
                <a href={`https://wa.me/${whatsapp.number.replace(/\D/g, "")}?text=${encodeURIComponent(whatsapp.join)}`}>
                  <strong className="num">{whatsapp.number}</strong>
                </a>.
              </p>
            </li>
            <li>
              <h3>Send a photo</h3>
              <p>Add a caption if you can: what is happening, how many people. Hindi or English.</p>
            </li>
            <li>
              <h3>Share your location</h3>
              <p>📎 → Location. No pin? Your report still reaches the control room, who will place it.</p>
            </li>
            <li>
              <h3>Get a reply</h3>
              <p>Raahat answers with the priority it assigned. If life is in danger, also call 112.</p>
            </li>
          </ol>
        </section>
      )}
    </main>
  );
}
