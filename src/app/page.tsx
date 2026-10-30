import Link from "next/link";

// Landing page: says in ten seconds who this is for, that it is safe, and what to do next.
// The proof card on the right is an illustration (drawn shapes, no real photo).

const STEPS = [
  {
    n: "1",
    title: "Prove it's fake",
    text: "Add the fake image and your real photo. We find the face in both and show, side by side, that it was copied from your picture.",
    href: "/case",
    cta: "Start a private case",
  },
  {
    n: "2",
    title: "Get your evidence pack",
    text: "Fingerprints of every file, timestamps, a timeline and a complaint ready for cybercrime.gov.in, plus takedown requests for each platform.",
    href: "/case#pack",
    cta: "See what's in the pack",
  },
  {
    n: "3",
    title: "Protect future photos",
    text: "Download watermarked, lower-resolution versions of photos you want to post, with location and camera details removed.",
    href: "/protect",
    cta: "Protect my photos",
  },
];

const PROMISES = [
  { title: "Never published", text: "Images are stored privately and shown only through signed, unguessable links. Nothing is ever public." },
  { title: "No sign-up", text: "No name, phone number or email. Your case is a random code and a PIN only you know." },
  { title: "Blurred by default", text: "The fake image is always blurred on screen. You choose if and when to look." },
  { title: "Face data stays on your phone", text: "Face matching runs in your browser; only the scores are saved." },
  { title: "Delete any time", text: "One button deletes everything. Cases you forget are deleted after 72 hours." },
  { title: "Quick exit", text: "Tap Quick exit or press Esc twice to leave instantly for a neutral page." },
];

const STATS = [
  { value: "86,420", label: "cyber crime cases in India in 2023 (NCRB)" },
  { value: "+31.2%", label: "rise in one year, from 65,893 in 2022" },
  { value: "24 hours", label: "for platforms to remove morphed intimate images after your complaint (IT Rules 2021)" },
];

export default function Home() {
  return (
    <main className="home">
      <section className="hero">
        <div className="hero-inner">
          <div className="hero-copy">
            <p className="kicker">For anyone being blackmailed with a morphed photo</p>
            <h1>A fake photo of you is not your fault. You can prove it, and report it today.</h1>
            <p className="lead">
              Raahat Shield privately shows that the face in a morphed image was copied from your real photo, then builds the
              evidence police and platforms need. It takes about five minutes.
            </p>
            <div className="hero-actions">
              <Link href="/case" className="btn btn-primary btn-lg">Start a private case</Link>
              <Link href="/protect" className="btn btn-ghost btn-lg">Protect my photos</Link>
            </div>
            <ul className="hero-trust" aria-label="Your privacy">
              <li>No sign-up</li>
              <li>Nothing is published</li>
              <li>Delete everything any time</li>
            </ul>
          </div>

          <figure className="proof-demo" aria-label="Example proof card: the face in the fake image matches the face in the original photo">
            <div className="proof-demo-head">
              <span className="proof-demo-tag">Example proof card</span>
              <span className="proof-demo-id num">Case 7F3K-29QA</span>
            </div>
            <div className="proof-demo-pair">
              <div className="proof-frame">
                <svg viewBox="0 0 120 150" aria-hidden>
                  <rect width="120" height="150" fill="var(--frame-a)" />
                  <circle cx="60" cy="56" r="22" fill="var(--skin)" />
                  <path d="M20 150 C24 108 42 92 60 92 C78 92 96 108 100 150 Z" fill="var(--cloth-a)" />
                  <rect x="34" y="30" width="52" height="54" rx="6" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="5 4" />
                </svg>
                <figcaption>Your photo<span>Instagram, 12 Aug 2026</span></figcaption>
              </div>
              <div className="proof-link" aria-hidden>
                <span>same face</span>
                <svg viewBox="0 0 60 16"><path d="M2 8 H54 M48 3 L56 8 L48 13" fill="none" stroke="currentColor" strokeWidth="2" /></svg>
              </div>
              <div className="proof-frame">
                <svg viewBox="0 0 120 150" aria-hidden>
                  <rect width="120" height="150" fill="var(--frame-b)" />
                  <circle cx="60" cy="56" r="22" fill="var(--skin)" />
                  <path d="M16 150 C22 104 40 90 60 90 C80 90 98 104 104 150 Z" fill="var(--cloth-b)" />
                  <rect x="0" y="0" width="120" height="150" fill="var(--blur)" />
                  <rect x="34" y="30" width="52" height="54" rx="6" fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeDasharray="5 4" />
                </svg>
                <figcaption>The fake<span>blurred for you</span></figcaption>
              </div>
            </div>
            <dl className="proof-demo-scores">
              <div><dt>Face copied from your photo</dt><dd className="num">Yes · 3/64</dd></div>
              <div><dt>Same person</dt><dd className="num">96%</dd></div>
              <div><dt>Matching points</dt><dd className="num">142</dd></div>
            </dl>
            <p className="proof-demo-foot">SHA-256 fingerprints and timestamps are in the evidence pack.</p>
          </figure>
        </div>
      </section>

      <section className="right-now" aria-labelledby="now-h">
        <div className="section-inner">
          <h2 id="now-h">If it is happening right now</h2>
          <ol className="now-list">
            <li><strong>Do not pay.</strong> Paying almost always leads to more demands.</li>
            <li><strong>Do not delete the chats</strong> or the account yet. Take screenshots of messages, usernames, numbers and UPI IDs.</li>
            <li><strong>Tell one person you trust.</strong> You have done nothing wrong.</li>
            <li><strong>Call <a href="tel:1930">1930</a></strong> or report at <a href="https://cybercrime.gov.in" target="_blank" rel="noreferrer">cybercrime.gov.in</a>. If you are in danger, call <a href="tel:112">112</a>.</li>
          </ol>
        </div>
      </section>

      <section id="how" className="how" aria-labelledby="how-h">
        <div className="section-inner">
          <p className="kicker">How it works</p>
          <h2 id="how-h">Three steps, about five minutes</h2>
          <ol className="step-cards">
            {STEPS.map((s) => (
              <li key={s.n} className="step-card">
                <span className="step-n" aria-hidden>{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <Link href={s.href} className="step-link">{s.cta} <span aria-hidden>→</span></Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="privacy" className="promises" aria-labelledby="privacy-h">
        <div className="section-inner">
          <p className="kicker">Our privacy promise</p>
          <h2 id="privacy-h">Built for the most private images a person can have</h2>
          <ul className="promise-grid">
            {PROMISES.map((p) => (
              <li key={p.title}>
                <h3>{p.title}</h3>
                <p>{p.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="impact" aria-labelledby="stats-h">
        <div className="section-inner">
          <h2 id="stats-h" className="sr-only">Why this matters</h2>
          <ul className="stat-row">
            {STATS.map((s) => (
              <li key={s.value}>
                <strong className="num">{s.value}</strong>
                <span>{s.label}</span>
              </li>
            ))}
          </ul>
          <p className="stats-note">
            The National Commission for Women has asked for &ldquo;deepfake abuse&rdquo; to be made a specific crime. Until then,
            the IT Act and the Bharatiya Nyaya Sanhita already cover morphing, sharing and extortion; your evidence pack lists the sections.
          </p>
        </div>
      </section>

      <section className="cloudinary" aria-labelledby="cld-h">
        <div className="section-inner">
          <p className="kicker">Under the hood</p>
          <h2 id="cld-h">Cloudinary is our vault, face finder, fingerprint lab and shredder</h2>
          <ul className="chip-row">
            <li>Private authenticated storage</li>
            <li>Face detection</li>
            <li>Perceptual hashes</li>
            <li>Face crops</li>
            <li>Proof card by URL</li>
            <li>Auto-blur</li>
            <li>Watermarks</li>
            <li>Evidence ZIP</li>
            <li>Delete + CDN purge</li>
          </ul>
        </div>
      </section>

      <section className="final-cta">
        <div className="section-inner">
          <h2>You do not have to deal with this alone.</h2>
          <div className="hero-actions">
            <Link href="/case" className="btn btn-primary btn-lg">Start a private case</Link>
            <Link href="/help" className="btn btn-ghost btn-lg">Talk to someone now</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
