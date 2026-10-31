// Public fact-check page for one report: the link printed on every Raahat Instagram
// card and sent to Telegram reporters. If a card's link doesn't open a page like this
// one, the card is fake.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { InfoPage } from "@/components/InfoPage";
import { ShareBar } from "@/components/ShareBar";
import { enhancedUrl, factCardUrl } from "@/lib/cld-url";
import { SITE_URL } from "@/lib/constants";
import { CATEGORY_LABEL, CHANNEL_LABEL } from "@/lib/labels";
import { findReport } from "@/lib/reports";
import { coarsen } from "@/lib/triage";
import { isLocated, type Report } from "@/lib/types";
import { factCheck, publicIdsFrom, VERDICT_LABEL, type FactCheck } from "@/lib/verify";

export const dynamic = "force-dynamic";

const load = cache(async (id: string) => {
  for (const publicId of publicIdsFrom(id)) {
    const report = await findReport(publicId).catch(() => null);
    if (report) return { report, fc: factCheck(report) };
  }
  return null;
});

const istDate = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/** The card for Instagram and link previews; only for a decided report. Colons are kept out of overlay text. */
function card(r: Report, fc: FactCheck, id: string, download = false) {
  if (fc.verdict === "pending") return null;
  const reports = r.corroborations + 1;
  return factCardUrl(
    r,
    {
      verdict: fc.verdict,
      what: `${CATEGORY_LABEL[r.primaryCategory]}${fc.verdict === "false" ? " (false report)" : ""}`,
      when: `Reported ${istDate(r.createdAt).replace(":", ".")} IST${reports > 1 ? `, ${reports} reports` : ""}`,
      link: `${SITE_URL.replace(/^https?:\/\//, "")}/v/${id}`,
    },
    download,
  );
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await load(id);
  if (!data) return { title: "Fact check" };
  const { report: r, fc } = data;
  const title = `${VERDICT_LABEL[fc.verdict].en}: ${CATEGORY_LABEL[r.primaryCategory]}`;
  const image = card(r, fc, id);
  return {
    title,
    description: "Raahat fact check. Open this page to confirm a Raahat post is genuine.",
    openGraph: { title, ...(image ? { images: [{ url: image, width: 1080, height: 1350 }] } : {}) },
    robots: { index: false }, // individual incidents shouldn't end up in search results
  };
}

export default async function FactCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await load(id);
  if (!data) notFound();
  const { report: r, fc } = data;
  const label = VERDICT_LABEL[fc.verdict];
  const url = `${SITE_URL}/v/${id}`;
  // Undecided reports stay private: no photo until the control room has looked at it.
  const showPhoto = fc.verdict !== "pending";
  const download = card(r, fc, id, true);

  const stamp = fc.verdict === "verified" ? ["VERIFIED", "✔"] : fc.verdict === "false" ? ["FALSE", "✕"] : ["NOT YET", "VERIFIED"];

  return (
    <InfoPage title={`Verification Status · RHT-${id}`} crumb="Fact check">
      <section className={`fc-stamp fc-${fc.verdict}`} aria-labelledby="verdict-h">
        <span className="fc-seal" aria-hidden>{stamp[0]}<br />{stamp[1]}</span>
        <div>
          <h2 id="verdict-h">{label.en}</h2>
          <p lang="hi">{label.hi}</p>
          <p className="fc-when">{fc.verifiedAt ? `Checked ${istDate(fc.verifiedAt)} IST` : `Reported ${istDate(r.createdAt)} IST`}</p>
        </div>
      </section>

      {fc.verdict === "pending" && (
        <p className="notice-inline">
          The control room hasn&rsquo;t checked this report yet. Until it does, treat any post about it as unconfirmed.
          This page updates on its own when it&rsquo;s checked.
        </p>
      )}
      {fc.verdict === "false" && (
        <p className="notice-inline notice-danger">
          The control room found this photo to be false or misleading. Please don&rsquo;t forward it as news.
        </p>
      )}

      <div className="fc-report">
        {showPhoto ? (
          <figure className={`fc-photo${fc.verdict === "false" ? " is-false" : ""}`}>
            <img src={enhancedUrl(r, true)} alt={`Photo from the report, faces pixelated: ${r.summary}`} />
          </figure>
        ) : (
          <div className="fc-photo fc-photo-hidden"><span>The photo is shown once the control room has checked it</span></div>
        )}
        <div className="fc-facts">
          <p className="fc-what"><strong>{CATEGORY_LABEL[r.primaryCategory]}</strong>{showPhoto && r.summary ? `: ${r.summary}` : ""}</p>
          <p>
            {isLocated(r) ? (
              <>
                About{" "}
                <a href={`https://www.openstreetmap.org/?mlat=${coarsen(r.lat)}&mlon=${coarsen(r.lng)}#map=15/${coarsen(r.lat)}/${coarsen(r.lng)}`} target="_blank" rel="noreferrer">
                  {coarsen(r.lat).toFixed(3)}° N, {coarsen(r.lng).toFixed(3)}° E
                </a>{" "}
                <span className="muted">(rounded to about 100 m)</span>
              </>
            ) : (
              "Location not confirmed yet"
            )}
          </p>
          <p className="muted">Reported {istDate(r.createdAt)} IST via {CHANNEL_LABEL[r.channel]} · faces pixelated</p>
        </div>
      </div>

      <table className="fc-table" aria-label="Checks performed">
        <thead><tr><th scope="col">Check performed</th><th scope="col">Result</th></tr></thead>
        <tbody>
          {fc.table.map((row) => (
            <tr key={row.check}>
              <td>{row.check}</td>
              <td className={`fc-${row.tone}`}>{row.result}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fc-foot">* Automated checks look for visible warning signs. They are not proof that a photo is genuine; the final decision is taken by a person.</p>

      <section className="fc-box" aria-labelledby="share-h">
        <h2 id="share-h" className="fc-boxh">Share this fact check</h2>
        <div className="fc-box-pad">
          <ShareBar url={url} text={`${label.en}: ${CATEGORY_LABEL[r.primaryCategory]} (Raahat fact check)`} cardUrl={download ?? undefined} />
        </div>
        <p className="fc-box-foot">Every Raahat card links to a page like this. If a card&rsquo;s link doesn&rsquo;t open a matching page, the card is fake.</p>
      </section>

      <section className="fact-howto" aria-labelledby="howto-h">
        <h2 id="howto-h">How to tell a Raahat post is genuine</h2>
        <ul className="gov-list">
          <li>Every Raahat card carries a link to <strong>{SITE_URL.replace(/^https?:\/\//, "")}/v/…</strong>. Open it: if it doesn&rsquo;t show a page like this one with the same verdict, the card is fake.</li>
          <li>Raahat never asks for money, OTPs or personal details.</li>
          <li>Raahat is a citizen project, not an official government service. For official updates follow NDMA, IMD and your district administration.</li>
        </ul>
      </section>

      <p className="fc-another"><Link href="/check">» Check another viral photo</Link></p>
    </InfoPage>
  );
}
