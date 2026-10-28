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

  return (
    <InfoPage title="Fact check" titleHi="तथ्य जाँच">
      <section className={`verdict verdict-${fc.verdict}`} aria-labelledby="verdict-h">
        <span className="verdict-icon" aria-hidden>{fc.verdict === "verified" ? "✓" : fc.verdict === "false" ? "✕" : "…"}</span>
        <div>
          <h2 id="verdict-h">{label.en}</h2>
          <p lang="hi">{label.hi}</p>
          <p className="verdict-id">Raahat report <span className="num">{id}</span></p>
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

      <div className={showPhoto ? "fact-grid" : undefined}>
        {showPhoto && (
          <figure className={`fact-photo${fc.verdict === "false" ? " is-false" : ""}`}>
            <img src={enhancedUrl(r, true)} alt={`Photo from the report, faces pixelated: ${r.summary}`} />
            <figcaption>Faces pixelated by Raahat.</figcaption>
          </figure>
        )}
        <dl className="fact-details">
          <dt>What</dt>
          <dd>{CATEGORY_LABEL[r.primaryCategory]}{showPhoto && r.summary ? `. ${r.summary}` : ""}</dd>
          <dt>Reported</dt>
          <dd>{istDate(r.createdAt)} IST, via {CHANNEL_LABEL[r.channel]}</dd>
          {fc.verifiedAt && (
            <>
              <dt>Verified</dt>
              <dd>{istDate(fc.verifiedAt)} IST</dd>
            </>
          )}
          <dt>Where</dt>
          <dd>
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
          </dd>
          <dt>Reports of this incident</dt>
          <dd className="num">{r.corroborations + 1}</dd>
        </dl>
      </div>

      <h2>What Raahat checked</h2>
      <ul className="fact-checks">
        {fc.checks.map((c) => (
          <li key={c.label} className={c.result}>
            <span aria-hidden>{c.result === "pass" ? "✓" : c.result === "fail" ? "✕" : "–"}</span> {c.label}
            <span className="sr-only">{c.result === "pass" ? " (passed)" : c.result === "fail" ? " (failed)" : " (not yet)"}</span>
          </li>
        ))}
      </ul>

      <h2>Share this check</h2>
      <ShareBar url={url} text={`${label.en}: ${CATEGORY_LABEL[r.primaryCategory]} (Raahat fact check)`} cardUrl={download ?? undefined} />

      <section className="fact-howto" aria-labelledby="howto-h">
        <h2 id="howto-h">How to tell a Raahat post is genuine</h2>
        <ul>
          <li>Every Raahat card carries a link to <strong>{SITE_URL.replace(/^https?:\/\//, "")}/v/…</strong>. Open it: if it doesn&rsquo;t show a page like this one with the same verdict, the card is fake.</li>
          <li>Raahat never asks for money, OTPs or personal details.</li>
          <li>Raahat is a citizen project, not an official government service. For official updates follow NDMA, IMD and your district administration.</li>
          <li>Seen a viral photo? <Link href="/check">Check it here</Link>.</li>
        </ul>
      </section>
    </InfoPage>
  );
}
