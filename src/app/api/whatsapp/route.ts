// Twilio WhatsApp webhook. Answers Twilio at once with an empty reply, then does
// the slow work (media download, upload, AI triage) in after() and replies to the
// citizen through the REST API, so Twilio's 15 s webhook timeout never bites.

import { after, NextResponse } from "next/server";
import { cloudinary, creds } from "@/lib/cloudinary";
import { CATEGORY_LABEL } from "@/lib/cld-url";
import { REPORT_FOLDER, REPORT_TAG } from "@/lib/constants";
import { triage } from "@/lib/reports";
import {
  detectLang,
  downloadMedia,
  filedMessage,
  msg,
  parseLocation,
  sendWhatsApp,
  senderKey,
  twilio,
  validSignature,
} from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PENDING_FOLDER = "raahat/whatsapp";
const PENDING_MS = 60 * 60_000; // a photo and a location sent within an hour belong together

type Ctx = Record<string, string>;
type Lang = "en" | "hi";

const ctxOf = (r: { context?: { custom?: Ctx } }): Ctx => r.context?.custom ?? {};
const fresh = (c: Ctx) => Date.now() - Number(c.at ?? 0) < PENDING_MS;

async function pendingPhoto(key: string) {
  for (const resourceType of ["image", "video"] as const) {
    try {
      const r = await cloudinary.api.resource(`${PENDING_FOLDER}/${key}`, { resource_type: resourceType });
      const c = ctxOf(r);
      if (fresh(c)) return { publicId: r.public_id as string, resourceType, note: c.note ?? "", lang: c.lang as Lang };
    } catch {
      // not found: try the next type
    }
  }
  return null;
}

async function pendingLocation(key: string) {
  try {
    const r = await cloudinary.api.resource(`${PENDING_FOLDER}/${key}_loc`, { resource_type: "raw" });
    const c = ctxOf(r);
    return fresh(c) ? { lat: Number(c.lat), lng: Number(c.lng) } : null;
  } catch {
    return null;
  }
}

async function fileReport(
  to: string,
  key: string,
  photo: { publicId: string; resourceType: "image" | "video"; note: string },
  loc: { lat: number; lng: number },
  lang: Lang,
) {
  await sendWhatsApp(to, msg(lang, "working"));
  // Move the photo out of the per-sender slot so the next photo starts a new report.
  const renamed = await cloudinary.uploader.rename(photo.publicId, `${REPORT_FOLDER}/wa_${key}_${Date.now()}`, {
    resource_type: photo.resourceType,
    invalidate: true,
  });
  await cloudinary.api
    .update(`${PENDING_FOLDER}/${key}_loc`, { resource_type: "raw", context: { at: "0" } } as Record<string, unknown>)
    .catch(() => undefined);
  const report = await triage({
    publicId: renamed.public_id,
    resourceType: photo.resourceType,
    lat: loc.lat,
    lng: loc.lng,
    locationSource: "whatsapp_pin",
    note: photo.note.slice(0, 500),
    lang,
    channel: "whatsapp",
    reporterHash: key, // salted hash of the number, never the number itself
  });
  await sendWhatsApp(
    to,
    filedMessage(lang, {
      severity: report.severity,
      score: report.score,
      categoryLabel: CATEGORY_LABEL[report.primaryCategory] ?? report.primaryCategory,
      duplicate: Boolean(report.duplicateOf),
    }),
  );
}

async function handle(p: Record<string, string>) {
  const to = p.From;
  const key = senderKey(to, creds.apiSecret);
  const text = (p.Body ?? "").trim();
  let lang = detectLang(text);
  const loc = parseLocation(p);

  if (Number(p.NumMedia ?? 0) > 0) {
    const type = p.MediaContentType0 ?? "";
    const resourceType = type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : null;
    if (!resourceType) return sendWhatsApp(to, msg(lang, "unsupported"));
    const media = await downloadMedia(p.MediaUrl0);
    const up = await cloudinary.uploader.upload(`data:${type};base64,${media.toString("base64")}`, {
      public_id: `${PENDING_FOLDER}/${key}`,
      resource_type: resourceType,
      overwrite: true,
      invalidate: true,
      tags: [REPORT_TAG, "whatsapp_pending"],
      context: { note: text.slice(0, 300), lang, at: String(Date.now()) },
    });
    const photo = { publicId: up.public_id, resourceType, note: text } as const;
    const savedLoc = await pendingLocation(key);
    if (savedLoc) return fileReport(to, key, photo, savedLoc, lang);
    return sendWhatsApp(to, msg(lang, "askLocation"));
  }

  if (loc) {
    const photo = await pendingPhoto(key);
    if (photo) {
      lang = photo.lang === "hi" ? "hi" : lang;
      return fileReport(to, key, photo, loc, lang);
    }
    await cloudinary.uploader.upload(`data:text/plain;base64,${Buffer.from("raahat").toString("base64")}`, {
      public_id: `${PENDING_FOLDER}/${key}_loc`,
      resource_type: "raw",
      overwrite: true,
      context: { lat: loc.lat.toFixed(6), lng: loc.lng.toFixed(6), at: String(Date.now()) },
    });
    return sendWhatsApp(to, msg(lang, "askPhoto"));
  }

  // Plain text: attach it to a waiting photo as the note, otherwise explain how to report.
  const photo = text ? await pendingPhoto(key) : null;
  if (photo) {
    const note = [photo.note, text].filter(Boolean).join(" ").slice(0, 300);
    await cloudinary.api.update(photo.publicId, {
      resource_type: photo.resourceType,
      context: { note, lang: photo.lang ?? lang, at: String(Date.now()) },
    } as Record<string, unknown>);
    return sendWhatsApp(to, msg(photo.lang === "hi" ? "hi" : lang, "noteSaved"));
  }
  return sendWhatsApp(to, msg(lang, "help"));
}

export async function POST(req: Request) {
  if (!twilio.accountSid || !twilio.authToken || !twilio.from) {
    return NextResponse.json({ error: "WhatsApp intake is not configured." }, { status: 503 });
  }
  const form = await req.formData();
  const params: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === "string") params[k] = v;
  });
  // Twilio signs the exact webhook URL it was given; TWILIO_WEBHOOK_URL pins it if a proxy rewrites req.url.
  const url = process.env.TWILIO_WEBHOOK_URL || req.url;
  if (!validSignature(twilio.authToken, url, params, req.headers.get("x-twilio-signature") ?? "")) {
    return NextResponse.json({ error: "Invalid Twilio signature." }, { status: 403 });
  }
  if (!params.From) return NextResponse.json({ error: "Missing sender." }, { status: 400 });

  after(async () => {
    try {
      await handle(params);
    } catch (err) {
      console.error("[raahat] WhatsApp report failed:", (err as Error).message);
      await sendWhatsApp(params.From, msg(detectLang(params.Body ?? ""), "failed")).catch(() => undefined);
    }
  });
  return new NextResponse("<Response></Response>", { headers: { "Content-Type": "text/xml" } });
}
