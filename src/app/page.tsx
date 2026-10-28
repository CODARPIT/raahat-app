import Link from "next/link";
import { fmt, LOCALES } from "@/lib/i18n";
import { getI18n } from "@/lib/locale";
import { listReports } from "@/lib/reports";
import { telegram } from "@/lib/telegram";
import type { Severity } from "@/lib/types";
import { DICTS } from "@/locales";

export const revalidate = 30;

const BANDS: { sev: Severity; key: "bandCritical" | "bandHigh" | "bandModerate" | "bandLow"; color: string }[] = [
  { sev: "critical", key: "bandCritical", color: "var(--sev-critical)" },
  { sev: "high", key: "bandHigh", color: "var(--sev-high)" },
  { sev: "moderate", key: "bandModerate", color: "var(--sev-moderate)" },
  { sev: "low", key: "bandLow", color: "var(--sev-low)" },
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
  const { locale, t: { home: t } } = await getI18n();
  // English readers also see the Hindi heading, as on bilingual government portals.
  const hi = locale === "en" ? DICTS.hi.home : null;
  const Alt = ({ text }: { text: string }) => (hi ? <span lang="hi"> · {text}</span> : null);
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
    { icon: ICON.camera, title: t.sReportT, alt: hi?.sReportT, text: t.sReport, href: "/report", cta: t.sReportC },
    { icon: ICON.chat, title: t.sTelegramT, alt: hi?.sTelegramT, text: t.sTelegram, href: bot ? "#telegram" : "/report", cta: bot ? t.sTelegramC : t.sTelegramSoon },
    { icon: ICON.check, title: t.sCheckT, alt: hi?.sCheckT, text: t.sCheck, href: "/check", cta: t.sCheckC },
    { icon: ICON.map, title: t.sMapT, alt: hi?.sMapT, text: t.sMap, href: "/map", cta: t.sMapC },
    { icon: ICON.book, title: t.sSafetyT, alt: hi?.sSafetyT, text: t.sSafety, href: "/safety", cta: t.sSafetyC },
    { icon: ICON.shield, title: t.sControlT, alt: hi?.sControlT, text: t.sControl, href: "/respond", cta: t.sControlC },
  ];

  return (
    <main className="home">
      {/* ── Banner ─────────────────────────────────────────── */}
      <section className="banner">
        <div className="banner-inner">
          <div className="banner-copy">
            <p className="eyebrow">{t.eyebrow}<Alt text={hi?.eyebrow ?? ""} /></p>
            <h1>{t.title}</h1>
            {hi && <p className="banner-hi" lang="hi">{hi.title}</p>}
            <p className="lead">{t.lead}</p>
            <div className="actions">
              <Link className="btn btn-primary btn-lg" href="/report">{t.ctaReport}</Link>
              <Link className="btn btn-lg btn-on-dark" href="/map">{t.ctaMap}</Link>
            </div>
          </div>

          <aside className="situation" aria-labelledby="sit-h">
            <div className="situation-head">
              <h2 id="sit-h">{t.live}</h2>
              <span className={`live-dot${live ? "" : " off"}`}>{live ? fmt(t.updated, { time: updated }) : t.liveOff}</span>
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
                    <span>{t[b.key]}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="situation-foot">
              <strong className="num">{total}</strong> {t.openReports} <Link href="/map">{t.openMap} →</Link>
            </p>
          </aside>
        </div>
      </section>

      {/* ── Notice ─────────────────────────────────────────── */}
      <div className="notice" role="note">
        <div className="notice-inner">
          <span className="notice-tag">{t.noticeTag}</span>
          <p>
            {t.notice}
            {hi && <> <span lang="hi">{hi.notice.split("।")[0]}।</span></>}
          </p>
        </div>
      </div>

      {/* ── Services ───────────────────────────────────────── */}
      <section className="section" aria-labelledby="svc-h">
        <div className="section-inner">
          <h2 id="svc-h" className="section-title">{t.services}<Alt text={hi?.services ?? ""} /></h2>
          <ul className="services">
            {services.map((s) => (
              <li key={s.href + s.title}>
                <Link href={s.href} className="service">
                  <span className="service-icon"><Icon d={s.icon} /></span>
                  <span className="service-title">{s.title}</span>
                  {s.alt && <span className="service-hi" lang="hi">{s.alt}</span>}
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
          <div><strong className="num">14</strong><span>{t.stat1}</span></div>
          <div><strong className="num">&lt; 1 min</strong><span>{t.stat2}</span></div>
          <div><strong className="num">98%</strong><span>{t.stat3}</span></div>
          <div><strong className="num">{LOCALES.length}</strong><span>{t.stat4}</span></div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────── */}
      <section className="section" id="how" aria-labelledby="how-h">
        <div className="section-inner">
          <h2 id="how-h" className="section-title">{t.how}<Alt text={hi?.how ?? ""} /></h2>
          <ol className="steps">
            <li>
              <span className="step-icon"><Icon d={ICON.send} /></span>
              <h3>{t.how1T}</h3>
              <p>{t.how1}</p>
            </li>
            <li>
              <span className="step-icon"><Icon d={ICON.ai} /></span>
              <h3>{t.how2T}</h3>
              <p>{t.how2}</p>
            </li>
            <li>
              <span className="step-icon"><Icon d={ICON.merge} /></span>
              <h3>{t.how3T}</h3>
              <p>{t.how3}</p>
            </li>
            <li>
              <span className="step-icon"><Icon d={ICON.pin} /></span>
              <h3>{t.how4T}</h3>
              <p>{t.how4}</p>
            </li>
          </ol>
        </div>
      </section>

      {/* ── Fact check ─────────────────────────────────────── */}
      <section className="section section-alt" id="fact-check" aria-labelledby="fc-h">
        <div className="section-inner two-col">
          <div>
            <h2 id="fc-h" className="section-title">{t.fcTitle}<Alt text={hi?.fcTitle ?? ""} /></h2>
            <p className="section-lead">{t.fcLead}</p>
            <ul className="checks">
              <li><Icon d={ICON.check} /><span><strong>{t.fc1T}</strong> {t.fc1}</span></li>
              <li><Icon d={ICON.cross} /><span><strong>{t.fc2T}</strong> {t.fc2}</span></li>
              <li><Icon d={ICON.shield} /><span><strong>{t.fc3T}</strong> {t.fc3}</span></li>
            </ul>
            <div className="actions">
              <Link className="btn btn-primary btn-lg" href="/check">{t.fcCheck}</Link>
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
            <figcaption>{t.fcCaption}</figcaption>
          </figure>
        </div>
      </section>

      {/* ── Telegram ───────────────────────────────────────── */}
      {bot && (
        <section className="section" id="telegram" aria-labelledby="tg-h">
          <div className="section-inner">
            <h2 id="tg-h" className="section-title">{t.tgTitle}<Alt text={hi?.tgTitle ?? ""} /></h2>
            <p className="section-lead">{t.tgLead}</p>
            <ol className="steps steps-numbered">
              <li>
                <h3>{t.tg1T}</h3>
                <p><a href={bot}>t.me/{telegram.username}</a>, {t.tg1}</p>
              </li>
              <li>
                <h3>{t.tg2T}</h3>
                <p>{t.tg2}</p>
              </li>
              <li>
                <h3>{t.tg3T}</h3>
                <p>{t.tg3}</p>
              </li>
              <li>
                <h3>{t.tg4T}</h3>
                <p>{t.tg4}</p>
              </li>
            </ol>
            <p className="hint">{t.tgForward}</p>
            <a className="btn btn-primary btn-lg" href={bot}>{t.tgOpen} @{telegram.username}</a>
          </div>
        </section>
      )}

      {/* ── Privacy and trust ──────────────────────────────── */}
      <section className="section" id="privacy" aria-labelledby="priv-h">
        <div className="section-inner two-col">
          <div>
            <h2 id="priv-h" className="section-title">{t.privTitle}</h2>
            <p className="section-lead">{t.privLead}</p>
          </div>
          <ul className="checks">
            <li><Icon d={ICON.blur} /><span><strong>{t.priv1T}</strong> {t.priv1}</span></li>
            <li><Icon d={ICON.pin} /><span><strong>{t.priv2T}</strong> {t.priv2}</span></li>
            <li><Icon d={ICON.shield} /><span><strong>{t.priv3T}</strong> {t.priv3}</span></li>
            <li><Icon d={ICON.signal} /><span><strong>{t.priv4T}</strong> {t.priv4}</span></li>
          </ul>
        </div>
      </section>

      {/* ── Safety advisories ──────────────────────────────── */}
      <section className="section" aria-labelledby="adv-h">
        <div className="section-inner">
          <h2 id="adv-h" className="section-title">{t.advTitle}<Alt text={hi?.advTitle ?? ""} /></h2>
          <p className="section-lead">{t.advLead}</p>
          <ul className="advisories">
            {[
              { id: "flood", title: t.advFlood, alt: hi?.advFlood, tip: t.advFloodTip },
              { id: "earthquake", title: t.advQuake, alt: hi?.advQuake, tip: t.advQuakeTip },
              { id: "cyclone", title: t.advCyclone, alt: hi?.advCyclone, tip: t.advCycloneTip },
              { id: "fire", title: t.advFire, alt: hi?.advFire, tip: t.advFireTip },
            ].map((a) => (
              <li key={a.id}>
                <Link href={`/safety#${a.id}`} className="advisory">
                  <span className="advisory-title">{a.title}{a.alt && <span lang="hi"> · {a.alt}</span>}</span>
                  <span className="advisory-tip">{a.tip}</span>
                  <span className="service-cta">{t.advRead} <span aria-hidden>→</span></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Related official links ─────────────────────────── */}
      <section className="related" aria-labelledby="rel-h">
        <div className="section-inner">
          <h2 id="rel-h">{t.relTitle}</h2>
          <ul lang="en">
            <li><a href="https://ndma.gov.in" target="_blank" rel="noreferrer">National Disaster Management Authority<span>ndma.gov.in</span></a></li>
            <li><a href="https://mausam.imd.gov.in" target="_blank" rel="noreferrer">India Meteorological Department<span>mausam.imd.gov.in</span></a></li>
            <li><a href="https://sachet.ndma.gov.in" target="_blank" rel="noreferrer">Sachet: official disaster alerts<span>sachet.ndma.gov.in</span></a></li>
            <li><a href="https://ndrf.gov.in" target="_blank" rel="noreferrer">National Disaster Response Force<span>ndrf.gov.in</span></a></li>
          </ul>
          <p className="hint">{t.relNote}</p>
        </div>
      </section>

      {/* ── Who it's for ───────────────────────────────────── */}
      <section className="section section-alt" aria-labelledby="who-h">
        <div className="section-inner">
          <h2 id="who-h" className="section-title">{t.whoTitle}</h2>
          <div className="audience">
            <div>
              <h3>{t.who1T}</h3>
              <p>{t.who1}</p>
              <Link href="/report">{t.who1L} →</Link>
            </div>
            <div>
              <h3>{t.who2T}</h3>
              <p>{t.who2}</p>
              <Link href="/respond">{t.who2L} →</Link>
            </div>
            <div>
              <h3>{t.who3T}</h3>
              <p>{t.who3}</p>
              <Link href="/map">{t.who3L} →</Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
