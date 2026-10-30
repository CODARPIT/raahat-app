import Link from "next/link";
import { PortalBanner } from "@/components/PortalBanner";
import { ExternalArrow } from "@/components/ExternalArrow";
import { fmt, LOCALES } from "@/lib/i18n";
import { getI18n } from "@/lib/locale";
import { listReports } from "@/lib/reports";
import { telegram } from "@/lib/telegram";
import type { Severity } from "@/lib/types";
import { DICTS } from "@/locales";

export const revalidate = 30;

const ICON = {
  camera: "M4 8h3l2-3h6l2 3h3v11H4z M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  chat: "M4 5h16v11H9l-5 4z M8 9h8 M8 12h5",
  map: "M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2z M9 4v14 M15 6v14",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z M8.5 12l2.5 2.5 4.5-5",
  check: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4 M8 11l2 2 4-4",
  book: "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z M4 19V5 M9 7h6",
  flood: "M3 8q3-4 6 0t6 0 6 0M3 14q3-4 6 0t6 0 6 0M3 20q3-4 6 0t6 0 6 0",
  earthquake: "M3 17h7l-3-5h5l-2-5h4l-1-4M14 17h7M3 21h18",
  cyclone: "M9 4c9-3 15 9 7 13M15 20C6 23 0 11 8 7M16 9c4 6-5 11-8 5M8 12a4 4 0 1 0 8 0 4 4 0 0 0-8 0",
  fire: "M13 3c1 5-3 6-3 9-2-1-2-3-2-4-3 3-4 6-3 9a7.5 7.5 0 0 0 14-1c1-4-2-7-6-13z M12 14c-4 4-1 8 2 6 2-2-1-3-2-6z",
};

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

const OFFICIAL = [
  { name: "NDEM", full: "National Database for Emergency Management", domain: "ndem.nrsc.gov.in", href: "https://ndem.nrsc.gov.in/#/" },
  { name: "NDMA", full: "National Disaster Management Authority", domain: "ndma.gov.in", href: "https://ndma.gov.in/" },
  { name: "SACHET", full: "National Disaster Alert Portal", domain: "sachet.ndma.gov.in", href: "https://sachet.ndma.gov.in/" },
  { name: "IMD", full: "India Meteorological Department", domain: "mausam.imd.gov.in", href: "https://mausam.imd.gov.in/" },
];

export default async function Home() {
  const { locale, t: dict } = await getI18n();
  const t = dict.home;
  const hi = locale === "en" ? DICTS.hi.home : null;
  const bot = telegram.username ? `https://t.me/${telegram.username}` : null;
  const counts: Record<Severity, number> = { critical: 0, high: 0, moderate: 0, low: 0 };
  let live = true;
  try {
    const open = (await listReports()).filter((r) => !r.duplicateOf && r.status !== "resolved" && r.status !== "rejected");
    for (const r of open) counts[r.severity]++;
  } catch { live = false; }
  const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
  const updated = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" });
  const services = [
    { icon: ICON.camera, title: t.sReportT, text: t.sReport, href: "/report", cta: t.sReportC },
    { icon: ICON.map, title: t.sMapT, text: t.sMap, href: "/map", cta: t.sMapC },
    { icon: ICON.check, title: t.sCheckT, text: t.sCheck, href: "/check", cta: t.sCheckC },
    { icon: ICON.shield, title: t.sControlT, text: t.sControl, href: "/respond", cta: t.sControlC },
    { icon: ICON.book, title: t.sSafetyT, text: t.sSafety, href: "/safety", cta: t.sSafetyC },
    { icon: ICON.chat, title: t.sTelegramT, text: t.sTelegram, href: bot ? "#telegram" : "/report", cta: bot ? t.sTelegramC : t.sTelegramSoon },
  ];
  const bands = [
    { sev: "critical", key: "bandCritical" }, { sev: "high", key: "bandHigh" },
    { sev: "moderate", key: "bandModerate" }, { sev: "low", key: "bandLow" },
  ] as const;

  return (
    <main className="home portal-home">
      <div className="portal-container">
        <div className="portal-context">
          <p><Link href="/">{dict.nav.home}</Link><span aria-hidden> / </span>{t.eyebrow}</p>
          <span className={`live-dot${live ? "" : " off"}`}>{live ? fmt(t.updated, { time: updated }) : t.liveOff}</span>
        </div>
        <section className="portal-urgent" aria-labelledby="urgent-report-title">
          <div><h2 id="urgent-report-title">{dict.report.urgentTitle}</h2><p>{dict.report.urgentNoTyping}</p></div>
          <div className="portal-urgent-actions">
            <Link href="/report" className="btn emergency-report-button"><Icon d={ICON.camera} />{t.ctaReport}<span aria-hidden>→</span></Link>
            <a href="tel:112" className="btn emergency-call-button">{dict.report.urgentCall}</a>
          </div>
        </section>

        <div className="portal-workspace">
          <PortalBanner label={t.services} mapUnavailableLabel={t.liveOff} reportCountLabel={t.openReportsLabel} slides={[
            { tab: dict.nav.map, title: t.sMapT, text: t.sMap, action: t.sMapC, href: "/map" },
            { tab: dict.nav.home, title: t.title, text: t.lead, action: t.ctaReport, href: "/report" },
            { tab: dict.nav.check, title: t.fcTitle, text: t.sCheck, action: t.fcCheck, href: "/check" },
          ]} />
          <aside className="portal-panel portal-situation" aria-labelledby="situation-h">
            <h2 className="portal-panel-title" id="situation-h">{t.live}<Link href="/map" aria-label={t.openMap}><ExternalArrow /></Link></h2>
            <div className="portal-total"><strong className="num">{live ? total : "—"}</strong><span>{t.openReportsLabel}</span></div>
            <dl className="portal-counts">{bands.map((b) => <div key={b.sev} data-severity={b.sev}>
              <dt><span className="portal-severity-dot" aria-hidden />{dict.severity[b.sev]}</dt>
              <dd className="num">{live ? counts[b.sev] : "—"}</dd>
            </div>)}</dl>
            <p className="portal-status"><span className={`live-dot${live ? "" : " off"}`}>{live ? fmt(t.updated, { time: updated }) : t.liveOff}</span></p>
            <a className="portal-emergency" href="tel:112"><span><strong>{dict.access.emergency}</strong><span>{dict.header.inDanger}</span></span><strong className="num">112 <ExternalArrow /></strong></a>
          </aside>
        </div>

        <div className="portal-notice" role="note">
          <span className="portal-notice-tag">{t.noticeTag}</span>
          <p>{t.notice}</p>
          <a href="tel:112" aria-label={`${dict.access.emergency}: 112`}>112 <ExternalArrow /></a>
        </div>
        <section className="portal-quick-services" aria-labelledby="services-h">
          <div className="portal-section-heading"><h2 id="services-h">{t.services}</h2><Link className="portal-text-link" href="/help">{dict.nav.help} <span aria-hidden>→</span></Link></div>
          <ul>{services.map((s, i) => <li key={s.title}><Link href={s.href} className={i === 0 ? "primary-service" : undefined}><span className="quick-service-icon"><Icon d={s.icon} /></span><span className="quick-service-title">{s.title}</span><span className="quick-service-action">{s.cta}<span aria-hidden>→</span></span></Link></li>)}</ul>
        </section>

        <div className="portal-information">
          <section className="portal-panel portal-about" aria-labelledby="about-h">
            <h2 className="portal-panel-title" id="about-h">{dict.footer.about}{hi && <span lang="hi">राहत के बारे में</span>}</h2>
            <div className="portal-panel-body"><p>{dict.footer.aboutText}</p><p className="portal-about-note">{t.privLead}</p><Link className="portal-text-link" href="#how">{t.how} <span aria-hidden>→</span></Link></div>
          </section>
          <section className="portal-panel portal-advisories" aria-labelledby="advisories-h">
            <h2 className="portal-panel-title" id="advisories-h">{t.advTitle}<Link href="/safety" aria-label={t.sSafetyC}><ExternalArrow /></Link></h2>
            <ul>{[
              { id: "flood", title: t.advFlood, tip: t.advFloodTip },
              { id: "earthquake", title: t.advQuake, tip: t.advQuakeTip },
              { id: "cyclone", title: t.advCyclone, tip: t.advCycloneTip },
              { id: "fire", title: t.advFire, tip: t.advFireTip },
            ].map((a) => <li key={a.id}><Link href={`/safety#${a.id}`}><span className={`hazard-symbol hazard-${a.id}`} aria-hidden><Icon d={ICON[a.id as "flood" | "earthquake" | "cyclone" | "fire"]} /></span><span><strong>{a.title}</strong><span>{a.tip}</span></span><span aria-hidden>›</span></Link></li>)}</ul>
          </section>
          <section className="portal-panel portal-official" aria-labelledby="official-h">
            <h2 className="portal-panel-title" id="official-h">{t.relTitle}</h2>
            <ul lang="en">{OFFICIAL.map((site) => <li key={site.name}><a href={site.href} target="_blank" rel="noreferrer"><span className="agency-initial" aria-hidden>{site.name.slice(0, 1)}</span><span><strong>{site.name}</strong><span>{site.full}</span><small>{site.domain}</small></span><ExternalArrow /></a></li>)}</ul>
            <p className="portal-official-note">{t.relNote}</p>
          </section>
        </div>
      </div>

      <section className="portal-process" id="how" aria-labelledby="how-h">
        <div className="portal-container">
          <div className="portal-section-heading"><div><p className="eyebrow">RAAHAT / राहत</p><h2 id="how-h">{t.how}</h2></div><Link href="/report" className="portal-text-link">{t.ctaReport} →</Link></div>
          <ol>{[
            { title: t.how1T, text: t.how1 }, { title: t.how2T, text: t.how2 },
            { title: t.how3T, text: t.how3 }, { title: t.how4T, text: t.how4 },
          ].map((step, i) => <li key={step.title}><span className="portal-step-number" aria-hidden>{String(i + 1).padStart(2, "0")}</span><h3>{step.title}</h3><p>{step.text}</p></li>)}</ol>
        </div>
      </section>
      <div className="portal-container">
        <div className="portal-capabilities">
          {[{ n: "14", label: t.stat1 }, { n: "2G", label: t.priv4T.replace(/[:：]$/u, "") }, { n: String(LOCALES.length), label: t.stat4 }, { n: "112", label: dict.access.emergency }].map((item) => <div key={item.n}><strong className="num">{item.n}</strong><span>{item.label}</span></div>)}
        </div>
      </div>
      <div className="portal-container portal-bottom">
        <section className="portal-panel" id="privacy" aria-labelledby="privacy-h">
          <h2 className="portal-panel-title" id="privacy-h">{t.privTitle}</h2>
          <ul className="portal-privacy">{[{ title: t.priv1T, text: t.priv1 }, { title: t.priv2T, text: t.priv2 }, { title: t.priv3T, text: t.priv3 }].map((item) => <li key={item.title}><Icon d={ICON.shield} /><span><strong>{item.title}</strong><span>{item.text}</span></span></li>)}</ul>
        </section>
        {bot && <section className="portal-panel" id="telegram" aria-labelledby="telegram-h"><h2 className="portal-panel-title" id="telegram-h">{t.tgTitle}</h2><div className="portal-panel-body"><p>{t.tgLead}</p><p>{t.tg2T}. {t.tg3T}. {t.tg4T}.</p><a className="btn btn-primary" href={bot}>{t.tgOpen} @{telegram.username} ↗</a><p className="hint">{t.tgForward}</p></div></section>}
      </div>
    </main>
  );
}
