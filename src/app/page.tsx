import Link from "next/link";
import { listReports } from "@/lib/reports";
import { telegram } from "@/lib/telegram";
import type { Severity } from "@/lib/types";

export const revalidate = 30;

const BANDS: { sev: Severity; label: string; labelHi: string; color: string }[] = [
  { sev: "critical", label: "Critical: life at risk", labelHi: "अति गंभीर", color: "var(--sev-critical)" },
  { sev: "high", label: "High: urgent help needed", labelHi: "गंभीर", color: "var(--sev-high)" },
  { sev: "moderate", label: "Moderate: damage, no one in danger", labelHi: "मध्यम", color: "var(--sev-moderate)" },
  { sev: "low", label: "Low: monitor", labelHi: "कम", color: "var(--sev-low)" },
];

// Simple line icons, drawn inline so the page needs no icon font or image requests on 2G.
const ICON = {
  camera: "M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  chat: "M4 5h16v11H9l-5 4z M8 9h8 M8 12h5",
  map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5",
  ai: "M5 5h14v14H5z M9 9h6v6H9z M9 2v3 M15 2v3 M9 19v3 M15 19v3 M2 9h3 M2 15h3 M19 9h3 M19 15h3",
  merge: "M6 4v6a6 6 0 0 0 6 6h6 M18 16l-3-3 M18 16l-3 3 M6 20v-4",
  send: "M4 12l16-8-6 16-3-7z",
  blur: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M8 10h.01 M16 10h.01 M8 15c2.5 2 5.5 2 8 0",
  pin: "M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z M12 11.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  signal: "M4 20v-3 M9 20v-7 M14 20v-11 M19 20V4",
  check: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4 M8 11l2 2 4-4",
  cross: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9 9l6 6 M15 9l-6 6",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5 M9 7h6",
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export default async function Home() {
  // Shown once the bot is set up (TELEGRAM_BOT_USERNAME, see README).
  const bot = telegram.username ? `https://t.me/${telegram.username}` : null;
  const instagram = (process.env.INSTAGRAM_HANDLE ?? "").replace(/^@/, "");
  let counts: Record<Severity, number> = { critical: 0, high: 0, moderate: 0, low: 0 };
  let live = true;
  try {
    const open = (await listReports()).filter((r) => !r.duplicateOf && r.status !== "resolved" && r.status !== "rejected");
    for (const r of open) counts[r.severity]++;
  } catch {
    counts = { critical: 0, high: 0, moderate: 0, low: 0 };
    live = false;
  }
  const total = counts.critical + counts.high + counts.moderate + counts.low;
  const updated = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

  const services = [
    { icon: ICON.camera, title: "Report an incident", titleHi: "घटना की रिपोर्ट करें", text: "Send one photo with your location, in Hindi or English. Works on a weak signal, and saves on your phone if the network drops.", href: "/report", cta: "Start a report" },
    { icon: ICON.chat, title: "Report on Telegram", titleHi: "टेलीग्राम पर रिपोर्ट", text: "Send a photo to the Raahat bot and tap one button to share your location. It replies with the priority and a link to track it.", href: bot ? "#telegram" : "/report", cta: bot ? "Open the bot" : "Coming soon: use the web form" },
    { icon: ICON.check, title: "Check a viral photo", titleHi: "वायरल फ़ोटो की जाँच", text: "Saw a disaster photo or reel on social media? Find out if the control room verified it, or if it's an old photo.", href: "/check", cta: "Check a photo" },
    { icon: ICON.map, title: "Live situation map", titleHi: "लाइव स्थिति मानचित्र", text: "A public map for volunteers, media and families. Faces pixelated, locations rounded, reporters' notes hidden.", href: "/map", cta: "Open the map" },
    { icon: ICON.book, title: "Safety advisories", titleHi: "सुरक्षा सलाह", text: "What to do before, during and after floods, earthquakes, cyclones and fires, adapted from NDMA guidance.", href: "/safety", cta: "Read the advisories" },
    { icon: ICON.shield, title: "Control room", titleHi: "नियंत्रण कक्ष", text: "For district control rooms and NGOs: a ranked queue, map, \"why this score\", fact-check cards and a 2G mode.", href: "/respond", cta: "Responder sign-in" },
  ];

  return (
    <main className="home">
      {/* ── Banner ─────────────────────────────────────────── */}
      <section className="banner">
        <div className="banner-inner">
          <div className="banner-copy">
            <p className="eyebrow">Citizen disaster reporting · <span lang="hi">नागरिक आपदा रिपोर्टिंग</span></p>
            <h1>When the water rises, every photo is a call for help.</h1>
            <p className="banner-hi" lang="hi">जब पानी बढ़ता है, हर फ़ोटो मदद की पुकार है।</p>
            <p className="lead">
              Raahat reads each citizen photo with Cloudinary AI, merges forwarded duplicates, blurs every face and gives
              control rooms a ranked queue on a live map that loads even on 2G.
            </p>
            <div className="actions">
              <Link className="btn btn-primary btn-lg" href="/report">Report an incident</Link>
              <Link className="btn btn-lg btn-on-dark" href="/map">View live situation</Link>
            </div>
          </div>

          <aside className="situation" aria-labelledby="sit-h">
            <div className="situation-head">
              <h2 id="sit-h">Live situation</h2>
              <span className={`live-dot${live ? "" : " off"}`}>{live ? `Updated ${updated} IST` : "Live data unavailable"}</span>
            </div>
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
                    <span>{b.label} <span lang="hi" className="hi-inline">· {b.labelHi}</span></span>
                  </div>
                ))}
              </div>
            </div>
            <p className="situation-foot">
              <strong className="num">{total}</strong> open {total === 1 ? "report" : "reports"}, read off the flood-gauge staff
              painted on river bridges. <Link href="/map">Open the map →</Link>
            </p>
          </aside>
        </div>
      </section>

      {/* ── Notice ─────────────────────────────────────────── */}
      <div className="notice" role="note">
        <div className="notice-inner">
          <span className="notice-tag">Important</span>
          <p>
            In an emergency, <strong>call 112 first</strong>. Raahat helps control rooms decide who to reach first; it does not
            replace emergency services. <span lang="hi">आपात स्थिति में पहले 112 पर कॉल करें।</span>
          </p>
        </div>
      </div>

      {/* ── Services ───────────────────────────────────────── */}
      <section className="section" aria-labelledby="svc-h">
        <div className="section-inner">
          <h2 id="svc-h" className="section-title">Services <span lang="hi">· सेवाएँ</span></h2>
          <ul className="services">
            {services.map((s) => (
              <li key={s.title}>
                <Link href={s.href} className="service">
                  <span className="service-icon"><Icon d={s.icon} /></span>
                  <span className="service-title">{s.title}</span>
                  <span className="service-hi" lang="hi">{s.titleHi}</span>
                  <span className="service-text">{s.text}</span>
                  <span className="service-cta">{s.cta} <span aria-hidden>→</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Impact numbers ─────────────────────────────────── */}
      <section className="stats" aria-label="Raahat at a glance">
        <div className="section-inner stats-grid">
          <div><strong className="num">14</strong><span>hazard types recognised, from floods to gas leaks</span></div>
          <div><strong className="num">&lt; 1 min</strong><span>from photo to a ranked report on the map</span></div>
          <div><strong className="num">98%</strong><span>less data for queue images, so it works on 2G</span></div>
          <div><strong className="num">2</strong><span>languages, Hindi and English, on the web and Telegram</span></div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────── */}
      <section className="section" id="how" aria-labelledby="how-h">
        <div className="section-inner">
          <h2 id="how-h" className="section-title">How Raahat works <span lang="hi">· यह कैसे काम करता है</span></h2>
          <ol className="steps">
            <li>
              <span className="step-icon"><Icon d={ICON.send} /></span>
              <h3>A citizen sends a photo</h3>
              <p>From the web page or Telegram, in Hindi or English. The photo is shrunk on the phone so it gets through on a weak signal.</p>
            </li>
            <li>
              <span className="step-icon"><Icon d={ICON.ai} /></span>
              <h3>Cloudinary AI reads it</h3>
              <p>AI Vision names the hazard, counts people, judges water depth and flags screenshots or recycled photos.</p>
            </li>
            <li>
              <span className="step-icon"><Icon d={ICON.merge} /></span>
              <h3>Duplicates merge, faces blur</h3>
              <p>A perceptual hash catches the same photo forwarded fifty times. Independent photos of one incident raise its priority.</p>
            </li>
            <li>
              <span className="step-icon"><Icon d={ICON.pin} /></span>
              <h3>Responders act</h3>
              <p>A ranked queue with every point of the score explained, a map, few-KB thumbnails and one-tap fact-check cards for social media.</p>
            </li>
          </ol>
        </div>
      </section>

      {/* ── Fact check ─────────────────────────────────────── */}
      <section className="section section-alt" id="fact-check" aria-labelledby="fc-h">
        <div className="section-inner two-col">
          <div>
            <h2 id="fc-h" className="section-title">Is that reel real? <span lang="hi">· क्या यह सच है?</span></h2>
            <p className="section-lead">
              During a disaster, old photos and fake videos spread faster than help. When the control room confirms a report,
              Raahat makes a fact-check card for social media. Every card links back to a page on this site, so anyone can
              confirm it in one tap.
            </p>
            <ul className="checks">
              <li><Icon d={ICON.check} /><span><strong>Verified by a person:</strong> the green Raahat band appears only after a control-room responder confirms the report.</span></li>
              <li><Icon d={ICON.cross} /><span><strong>False photos called out:</strong> recycled or fake photos get a red &ldquo;do not share&rdquo; card.</span></li>
              <li><Icon d={ICON.shield} /><span><strong>Hard to fake:</strong> if a card&rsquo;s link doesn&rsquo;t open a matching page here, the card is fake.</span></li>
            </ul>
            <div className="actions">
              <Link className="btn btn-primary btn-lg" href="/check">Check a viral photo</Link>
              {instagram && (
                <a className="btn btn-lg" href={`https://www.instagram.com/${instagram}/`} target="_blank" rel="noreferrer" aria-label={`Follow @${instagram} on Instagram`}>@{instagram} on Instagram</a>
              )}
            </div>
          </div>
          <figure className="card-sample">
            <div className="card-sample-img" role="img" aria-label="Example fact-check card: a green Verified by Raahat band above a flood photo, with the date and a check link">
              <span className="card-band">VERIFIED BY RAAHAT</span>
              <span className="card-text">
                <span className="card-what">Flood: road under knee-deep water</span>
                <span className="card-when">Reported 29 Oct 2026, 2:15 pm IST, 4 reports</span>
                <span className="card-link">Check it at raahat-kappa.vercel.app/v/…</span>
              </span>
            </div>
            <figcaption>What a Raahat card looks like on Instagram. The link at the bottom is the proof.</figcaption>
          </figure>
        </div>
      </section>

      {/* ── Telegram ───────────────────────────────────────── */}
      {bot && (
        <section className="section" id="telegram" aria-labelledby="tg-h">
          <div className="section-inner">
            <h2 id="tg-h" className="section-title">Report on Telegram <span lang="hi">· टेलीग्राम पर रिपोर्ट</span></h2>
            <p className="section-lead">Free, works on a weak signal, and nothing to install beyond Telegram.</p>
            <ol className="steps steps-numbered">
              <li>
                <h3>Open the bot</h3>
                <p><a href={bot}>t.me/{telegram.username}</a>, then tap <strong>Start</strong>.</p>
              </li>
              <li>
                <h3>Send a photo</h3>
                <p>Add a caption if you can: what is happening, how many people. Hindi or English.</p>
              </li>
              <li>
                <h3>Tap &ldquo;Send my location&rdquo;</h3>
                <p>One button. No location? Your report still reaches the control room, who will place it.</p>
              </li>
              <li>
                <h3>Get a reply and a link</h3>
                <p>Raahat answers with the priority and a link to follow your report. If life is in danger, also call 112.</p>
              </li>
            </ol>
            <p className="hint">Forward a viral photo to the bot and it fact-checks it instead of filing a report.</p>
            <a className="btn btn-primary btn-lg" href={bot}>Open @{telegram.username}</a>
          </div>
        </section>
      )}

      {/* ── Privacy and trust ──────────────────────────────── */}
      <section className="section" id="privacy" aria-labelledby="priv-h">
        <div className="section-inner two-col">
          <div>
            <h2 id="priv-h" className="section-title">Privacy and safety by default</h2>
            <p className="section-lead">
              Disaster photos show people at their most vulnerable. Raahat protects them on every public pixel, and keeps a
              human in charge of every decision.
            </p>
          </div>
          <ul className="checks">
            <li><Icon d={ICON.blur} /><span><strong>Faces pixelated</strong> on every public image, automatically.</span></li>
            <li><Icon d={ICON.pin} /><span><strong>Locations rounded</strong> to about 110 m on the public map.</span></li>
            <li><Icon d={ICON.shield} /><span><strong>Nothing is deleted by AI.</strong> Doubtful reports go to a person for review.</span></li>
            <li><Icon d={ICON.signal} /><span><strong>Works when networks fail:</strong> 2G mode, offline saving, Telegram intake.</span></li>
          </ul>
        </div>
      </section>

      {/* ── Safety advisories ──────────────────────────────── */}
      <section className="section" aria-labelledby="adv-h">
        <div className="section-inner">
          <h2 id="adv-h" className="section-title">Safety advisories <span lang="hi">· सुरक्षा सलाह</span></h2>
          <p className="section-lead">What to do before, during and after a disaster, in plain words.</p>
          <ul className="advisories">
            {[
              { id: "flood", t: "Floods", hi: "बाढ़", tip: "Move to higher ground. Never walk or drive through moving water." },
              { id: "earthquake", t: "Earthquakes", hi: "भूकंप", tip: "Drop, cover and hold on. Don't use lifts." },
              { id: "cyclone", t: "Cyclones", hi: "चक्रवात", tip: "Stay indoors. A sudden calm may be the eye of the storm." },
              { id: "fire", t: "Fire", hi: "आग", tip: "Stay low under smoke. Call 101 or 112." },
            ].map((a) => (
              <li key={a.id}>
                <Link href={`/safety#${a.id}`} className="advisory">
                  <span className="advisory-title">{a.t} <span lang="hi">· {a.hi}</span></span>
                  <span className="advisory-tip">{a.tip}</span>
                  <span className="service-cta">Read the advisory <span aria-hidden>→</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Related official links ─────────────────────────── */}
      <section className="related" aria-labelledby="rel-h">
        <div className="section-inner">
          <h2 id="rel-h">Related official links</h2>
          <ul>
            <li><a href="https://ndma.gov.in" target="_blank" rel="noreferrer">National Disaster Management Authority<span>ndma.gov.in</span></a></li>
            <li><a href="https://mausam.imd.gov.in" target="_blank" rel="noreferrer">India Meteorological Department<span>mausam.imd.gov.in</span></a></li>
            <li><a href="https://sachet.ndma.gov.in" target="_blank" rel="noreferrer">Sachet: official disaster alerts<span>sachet.ndma.gov.in</span></a></li>
            <li><a href="https://ndrf.gov.in" target="_blank" rel="noreferrer">National Disaster Response Force<span>ndrf.gov.in</span></a></li>
          </ul>
          <p className="hint">External websites open in a new tab. Raahat is not affiliated with these organisations.</p>
        </div>
      </section>

      {/* ── Who it's for ───────────────────────────────────── */}
      <section className="section section-alt" aria-labelledby="who-h">
        <div className="section-inner">
          <h2 id="who-h" className="section-title">Who uses Raahat</h2>
          <div className="audience">
            <div>
              <h3>Citizens</h3>
              <p>Report what you see in one minute, without an app or a login.</p>
              <Link href="/report">Report an incident →</Link>
            </div>
            <div>
              <h3>District control rooms and NGOs</h3>
              <p>See the most urgent calls first, with duplicates merged and every score explained.</p>
              <Link href="/respond">Open the control room →</Link>
            </div>
            <div>
              <h3>Volunteers, media and families</h3>
              <p>Follow the situation on a privacy-safe public map.</p>
              <Link href="/map">View the live map →</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
