// Twilio WhatsApp Sandbox webhook. A citizen sends a photo (with an optional caption),
// then a location pin; each arrives as its own POST. Configure the sandbox's
// "When a message comes in" URL as  <PUBLIC_BASE_URL>/api/whatsapp  (HTTP POST).

import { after } from "next/server";
import { awaitingReport, expectLocation, forgetAwaiting, setLocation, triage, uploadBuffer } from "@/lib/reports";
import type { Report } from "@/lib/types";
import {
  isReportMedia,
  looksHindi,
  parseInbound,
  REPLIES,
  reporterHash,
  twiml,
  validTwilioSignature,
  type Lang,
  type TwilioParams,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Twilio gives up after 15 s. Media download + upload take a few seconds, so if
// triage isn't done by this point we reply "analysing" and finish it after responding.
const REPLY_DEADLINE_MS = 8000;
const MAX_MEDIA_BYTES = 16_000_000;

// Per-instance state for the photo → location handshake (see README: one warm instance for demos).
const inFlight = new Map<string, Promise<Report | null>>();
const pendingPin = new Map<string, { lat: number; lng: number }>();
const langOf = new Map<string, Lang>();

const TIMEOUT = Symbol("timeout");
function within<T>(p: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return Promise.race([p, new Promise<typeof TIMEOUT>((r) => setTimeout(() => r(TIMEOUT), ms))]);
}

function reply(message: string) {
  return new Response(twiml(message), { headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

function webhookUrl(req: Request) {
  const base = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (base) return `${base}/api/whatsapp`;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}/api/whatsapp`;
}

async function fetchTwilioMedia(url: string): Promise<Buffer> {
  const auth = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Twilio media download failed (${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.byteLength > MAX_MEDIA_BYTES) throw new Error("Media too large.");
  return bytes;
}

export async function POST(req: Request) {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token || !process.env.TWILIO_ACCOUNT_SID) {
    return new Response("WhatsApp intake is not configured.", { status: 503 });
  }
  const params = Object.fromEntries(new URLSearchParams(await req.text())) as TwilioParams;
  if (!validTwilioSignature(token, req.headers.get("x-twilio-signature"), webhookUrl(req), params)) {
    return new Response("Invalid signature.", { status: 403 });
  }

  const msg = parseInbound(params);
  const reporter = reporterHash(msg.from); // the raw number is never stored
  const lang: Lang =
    msg.kind === "photo" && msg.caption ? (looksHindi(msg.caption) ? "hi" : "en")
    : msg.kind === "text" && msg.body ? (looksHindi(msg.body) ? "hi" : "en")
    : langOf.get(reporter) ?? "en";
  langOf.set(reporter, lang);

  if (msg.kind === "text") return reply(REPLIES.howTo(lang));

  if (msg.kind === "location") {
    const job = inFlight.get(reporter);
    if (job && (await within(job, REPLY_DEADLINE_MS)) === TIMEOUT) {
      // The photo is still being analysed; the pin is applied as soon as it's done.
      pendingPin.set(reporter, { lat: msg.lat, lng: msg.lng });
      return reply(REPLIES.locationAdded(lang));
    }
    try {
      const target = await awaitingReport(reporter);
      if (!target) return reply(REPLIES.locationWithoutPhoto(lang));
      await setLocation(target.publicId, target.resourceType, msg.lat, msg.lng, "whatsapp_pin");
      forgetAwaiting(reporter);
      return reply(REPLIES.locationAdded(lang));
    } catch (err) {
      console.error("[raahat] WhatsApp location failed:", (err as Error).message);
      return reply(REPLIES.failed(lang));
    }
  }

  // Photo or video.
  if (!isReportMedia(msg.contentType)) return reply(REPLIES.unsupported(lang));
  let upload: { publicId: string; resourceType: "image" | "video" };
  try {
    upload = await uploadBuffer(await fetchTwilioMedia(msg.mediaUrl), msg.contentType.startsWith("video/") ? "video" : "image");
  } catch (err) {
    console.error("[raahat] WhatsApp upload failed:", (err as Error).message);
    return reply(REPLIES.failed(lang));
  }
  expectLocation(reporter, upload.publicId, upload.resourceType);

  const job: Promise<Report | null> = (async () => {
    const report = await triage({
      ...upload,
      lat: null,
      lng: null,
      locationSource: "missing",
      note: msg.caption.slice(0, 500),
      lang,
      channel: "whatsapp",
      reporterHash: reporter,
    });
    const pin = pendingPin.get(reporter);
    if (!pin) return report;
    pendingPin.delete(reporter);
    forgetAwaiting(reporter);
    return setLocation(report.publicId, report.resourceType, pin.lat, pin.lng, "whatsapp_pin");
  })()
    .catch((err) => {
      console.error("[raahat] WhatsApp triage failed:", (err as Error).message);
      return null;
    })
    .finally(() => {
      if (inFlight.get(reporter) === job) inFlight.delete(reporter);
    });
  inFlight.set(reporter, job);

  const done = await within(job, REPLY_DEADLINE_MS);
  if (done === TIMEOUT) {
    after(() => job); // keep the function alive until triage finishes
    return reply(REPLIES.analysing(lang));
  }
  if (!done) return reply(REPLIES.failed(lang));
  return reply(REPLIES.received(lang, done.severity, done.lat === null));
}
