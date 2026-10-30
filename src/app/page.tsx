import Link from "next/link";
import { AdvisoryTabs } from "@/components/AdvisoryTabs";
import { HomeCarousel } from "@/components/HomeCarousel";
import { LatestUpdates } from "@/components/LatestUpdates";
import { fmt, LOCALES } from "@/lib/i18n";
import { getI18n } from "@/lib/locale";
import { listReports } from "@/lib/reports";
import { telegram } from "@/lib/telegram";
import type { Severity } from "@/lib/types";
import { DICTS } from "@/locales";
import { gov } from "@/locales/gov";

export const revalidate = 30;

const ICON = {
  camera: "M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  chat: "M21 4 3 11l6 2 2 6 3-4 5 4z",
  map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5",
  book: "M4 5h7v15H4z M13 5h7v15h-7z",
  screen: "M3 4h18v12H3z M8 20h8 M12 16v4",
  hazard: "M12 3 2 20h20z M12 10v4 M12 17v.5",
  clock: "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16z M12 8v4l3 2",
  lang: "M4 5h16 M9 3v2 M7 9c1 3 4 6 8 8 M15 9c-1 3-4 6-8 8",
  signal: "M2 8.5a15 15 0 0 1 20 0 M5 12a10 10 0 0 1 14 0 M8.5 15.5a5 5 0 0 1 7 0",
};

function Icon({ d, size = 26 }: { d: string; size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

const OFFICIAL = [
  { name: "NDMA", full: "National Disaster Management Authority", href: "https://ndma.gov.in/" },
  { name: "IMD", full: "India Meteorological Department", href: "https://mausam.imd.gov.in/" },
  { name: "SACHET", full: "National Disaster Alert Portal", href: "https://sachet.ndma.gov.in/" },
  { name: "NDEM", full: "National Database for Emergency Management", href: "https://ndem.nrsc.gov.in/#/" },
  { name: "NIDM", full: "National Institute of Disaster Management", href: "https://nidm.gov.in/" },
  { name: "india.gov.in", full: "National Portal of India", href: "https://www.india.gov.in/" },
];

const HELPLINES = [
  { number: "112", key: "h112" },
  { number: "1078", key: "h1078" },
  { number: "1070", key: "h1070" },
  { number: "108", key: "h108" },
] as const;

const SEVERITIES: Severity[] = ["critical", "high", "moderate", "low"];

export default async function Home() {
  const { locale, t: dict } = await getI18n();
  const t = dict.home;
  const g = gov(locale);
  const hi = locale === "en" ? DICTS.hi.home : null;
  const bot = telegram.username ? `https://t.me/${telegram.username}` : null;

  const counts: Record<Severity, number> = { critical: 0, high: 0, moderate: 0, low: 0 };
  let live = true;
  try {
    const open = (await listReports()).filter((r) => !r.duplicateOf && r.status !== "resolved" && r.status !== "rejected");
    for (const r of open) counts[r.severity]++;
  } catch {
    live = false;
  }
  const updated = new Date().toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });

  const news = [
    { text: g.news1, date: "31 Oct 2026", href: "/respond/dispatch", fresh: true },
    { text: g.news2, date: "30 Oct 2026", href: "/check", fresh: true },
    { text: g.news3, date: "30 Oct 2026", href: "/map" },
    { text: g.news4, date: "29 Oct 2026", href: "/" },
    { text: g.news5, date: "28 Oct 2026", href: bot ? "#telegram" : "/report" },
  ];
  const services = [
    { icon: ICON.camera, title: t.sReportT, href: "/report", primary: true },
    { icon: ICON.map, title: t.sMapT, href: "/map" },
    { icon: ICON.shield, title: t.sCheckT, href: "/check" },
    { icon: ICON.book, title: t.sSafetyT, href: "/safety" },
    { icon: ICON.chat, title: t.sTelegramT, href: bot ? "#telegram" : "/report" },
    { icon: ICON.screen, title: t.sControlT, href: "/respond" },
  ];
  const steps = [
    { title: t.how1T, text: t.how1 },
    { title: t.how2T, text: t.how2 },
    { title: t.how3T, text: t.how3 },
    { title: g.howCheckT, text: g.howCheck },
    { title: g.howDispatchT, text: g.howDispatch },
  ];

  return (
    <main className="home gov-home">
      <LatestUpdates label={g.latest} isNew={g.isNew} pause={g.pause} play={g.play} items={news.slice(0, 4)} />

      <HomeCarousel
        labels={{ region: t.services, previous: g.previous, next: g.next, pause: g.pause, play: g.play, slide: g.slide }}
        slides={[
          { kicker: t.eyebrow, title: t.title, alt: hi?.title, text: t.lead, cta: { label: t.ctaReport, href: "/report" }, cta2: { label: t.ctaMap, href: "/map" }, art: "flood" },
          { kicker: dict.nav.check, title: t.fcTitle, alt: hi?.fcTitle, text: t.fcLead, cta: { label: t.fcCheck, href: "/check" }, art: "card" },
          { kicker: t.tgTitle, title: t.sTelegramT, alt: hi?.sTelegramT, text: t.sTelegram, cta: { label: bot ? t.sTelegramC : t.sTelegramSoon, href: bot ?? "/report" }, art: "chat" },
        ]}
      />

      {/* What's New · Citizen Services · Helplines and live situation */}
      <section className="gov-zone">
        <div className="gov-wrap gov-zone-grid">
          <section className="gov-box" aria-labelledby="news-h">
            <h2 className="gov-boxh" id="news-h">{g.whatsNew}<Link href="/sitemap">{g.viewAll} »</Link></h2>
            <ul className="gov-list">
              {news.map((n) => (
                <li key={n.text}>
                  <span><Link href={n.href}>{n.text}</Link>{n.fresh && <span className="gov-new">{g.isNew}</span>}<small>{n.date}</small></span>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="svc-h">
            <h2 className="gov-sh" id="svc-h">{g.citizenServices}</h2>
            <ul className="gov-services">
              {services.map((s) => (
                <li key={s.href + s.title}>
                  <Link href={s.href} className={s.primary ? "is-primary" : undefined}>
                    <span className="gov-ico"><Icon d={s.icon} /></span>
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <div className="gov-side">
            <section className="gov-box" aria-labelledby="help-h">
              <h2 className="gov-boxh gov-boxh-red" id="help-h">{dict.footer.helplines}</h2>
              <table className="gov-table">
                <tbody>
                  {HELPLINES.map((h) => (
                    <tr key={h.number}><td>{dict.footer[h.key]}</td><td className="num"><a href={`tel:${h.number}`}><strong>{h.number}</strong></a></td></tr>
                  ))}
                </tbody>
              </table>
            </section>
            <section className="gov-box" aria-labelledby="live-h">
              <h2 className="gov-boxh" id="live-h">{t.live}<Link href="/map">{t.openMap} »</Link></h2>
              <table className="gov-table">
                <thead><tr><th scope="col">{dict.report.priority}</th><th scope="col" className="num">{t.openReportsLabel}</th></tr></thead>
                <tbody>
                  {SEVERITIES.map((sev) => (
                    <tr key={sev}><td><span className="gov-sev" data-sev={sev} aria-hidden />{dict.severity[sev]}</td><td className="num"><strong>{live ? counts[sev] : "—"}</strong></td></tr>
                  ))}
                </tbody>
              </table>
              <p className="gov-box-foot">{live ? fmt(g.asOn, { time: updated }) : t.liveOff}</p>
            </section>
          </div>
        </div>
      </section>

      {/* At a glance */}
      <section className="gov-stats" aria-label={t.how}>
        <div className="gov-wrap gov-stats-grid">
          <div><span className="gov-ico"><Icon d={ICON.hazard} size={24} /></span><span><strong className="num">14</strong>{t.stat1}</span></div>
          <div><span className="gov-ico"><Icon d={ICON.clock} size={24} /></span><span><strong className="num">&lt; 1 min</strong>{t.stat2}</span></div>
          <div><span className="gov-ico"><Icon d={ICON.lang} size={24} /></span><span><strong className="num">{LOCALES.length}</strong>{t.stat4}</span></div>
          <div><span className="gov-ico"><Icon d={ICON.signal} size={24} /></span><span><strong className="num">2G</strong>{t.stat3}</span></div>
        </div>
      </section>

      {/* How it works */}
      <section className="gov-section" id="how" aria-labelledby="how-h">
        <div className="gov-wrap">
          <h2 className="gov-sh" id="how-h">{t.how}</h2>
          <ol className="gov-steps">
            {steps.map((s, n) => (
              <li key={s.title}><span className="gov-step-n num">{n + 1}</span><strong>{s.title}</strong><span>{s.text}</span></li>
            ))}
          </ol>
        </div>
      </section>

      {/* Advisories and fact check */}
      <section className="gov-section gov-section-tight">
        <div className="gov-wrap gov-two">
          <div>
            <h2 className="gov-sh">{t.advTitle}</h2>
            <AdvisoryTabs
              label={t.advTitle}
              readMore={t.advRead}
              items={[
                { id: "flood", title: t.advFlood, tip: t.advFloodTip },
                { id: "earthquake", title: t.advQuake, tip: t.advQuakeTip },
                { id: "cyclone", title: t.advCyclone, tip: t.advCycloneTip },
                { id: "fire", title: t.advFire, tip: t.advFireTip },
              ]}
            />
          </div>
          <section className="gov-box" aria-labelledby="fc-h">
            <h2 className="gov-boxh" id="fc-h">{t.fcTitle}<Link href="/check">{t.fcCheck} »</Link></h2>
            <div className="gov-fc">
              <div className="gov-fc-photo" aria-hidden />
              <div>
                <span className="gov-false" lang="en">FALSE · DO NOT SHARE</span>
                <p><strong>{g.sampleClaim}</strong></p>
                <p>{g.sampleFact}</p>
              </div>
            </div>
            <ul className="gov-list gov-list-pad">
              <li><span><strong>{t.fc1T}</strong> {t.fc1}</span></li>
              <li><span><strong>{t.fc2T}</strong> {t.fc2}</span></li>
              <li><span><strong>{t.fc3T}</strong> {t.fc3}</span></li>
            </ul>
          </section>
        </div>
      </section>

      {/* Privacy and Telegram */}
      <section className="gov-section gov-section-tight">
        <div className={`gov-wrap${bot ? " gov-two" : ""}`}>
          <section className="gov-box" id="privacy" aria-labelledby="privacy-h">
            <h2 className="gov-boxh gov-boxh-green" id="privacy-h">{t.privTitle}</h2>
            <ul className="gov-list gov-list-pad">
              <li><span><strong>{t.priv1T}</strong> {t.priv1}</span></li>
              <li><span><strong>{t.priv2T}</strong> {t.priv2}</span></li>
              <li><span><strong>{t.priv3T}</strong> {t.priv3}</span></li>
            </ul>
          </section>
          {bot && (
            <section className="gov-box" id="telegram" aria-labelledby="telegram-h">
              <h2 className="gov-boxh" id="telegram-h">{t.tgTitle}</h2>
              <ol className="gov-tg">
                <li><strong>{t.tg1T}</strong> {t.tg1}</li>
                <li><strong>{t.tg2T}.</strong> {t.tg2}</li>
                <li><strong>{t.tg3T}.</strong> {t.tg3}</li>
                <li><strong>{t.tg4T}.</strong> {t.tg4}</li>
              </ol>
              <p className="gov-box-pad"><a className="gov-btn gov-btn-blue" href={bot}>{t.tgOpen} @{telegram.username} ↗</a></p>
              <p className="gov-box-foot">{t.tgForward}</p>
            </section>
          )}
        </div>
      </section>

      {/* Important links */}
      <section className="gov-links" aria-labelledby="links-h">
        <div className="gov-wrap">
          <h2 className="gov-sh" id="links-h">{t.relTitle}</h2>
          <ul lang="en">
            {OFFICIAL.map((o) => (
              <li key={o.name}><a href={o.href} target="_blank" rel="noreferrer"><strong>{o.name} ↗</strong><small>{o.full}</small></a></li>
            ))}
          </ul>
          <p className="gov-links-note">{t.relNote}</p>
        </div>
      </section>
    </main>
  );
}
