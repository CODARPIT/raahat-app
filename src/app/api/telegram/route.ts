// Telegram bot webhook. Answers Telegram at once, then does the slow work (download,
// upload, AI triage) in after() and replies through the Bot API. A photo and a
// location sent within an hour, in either order, become one report. Forwarded
// photos, and photos sent after /check, are fact-checked instead of filed.

import { after, NextResponse } from "next/server";
import { checkPhoto } from "@/lib/check";
import { cloudinary, creds } from "@/lib/cloudinary";
import { CATEGORY_LABEL } from "@/lib/cld-url";
import { REPORT_FOLDER, REPORT_TAG, SITE_URL } from "@/lib/constants";
import { triage } from "@/lib/reports";
import {
  checkMessage,
  downloadFile,
  filedMessage,
  MAX_MEDIA_BYTES,
  mediaSize,
  msg,
  parseUpdate,
  sendMessage,
  telegram,
  telegramReady,
  validSecret,
  type Incoming,
  type Lang,
  type TgUpdate,
} from "@/lib/telegram";
import { shortId } from "@/lib/verify";
import { senderKey } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PENDING_FOLDER = "raahat/telegram";
const PENDING_MS = 60 * 60_000; // a photo and a location sent within an hour belong together
const CHECK_MODE_MS = 10 * 60_000; // after /check, the next photo within 10 minutes is checked

type Ctx = Record<string, string>;
type Media = NonNullable<Incoming["media"]>;

const ctxOf = (r: { context?: { custom?: Ctx } }): Ctx => r.context?.custom ?? {};
const within = (c: Ctx, ms: number) => Date.now() - Number(c.at ?? 0) < ms;

async function pendingPhoto(key: string) {
  for (const resourceType of ["image", "video"] as const) {
    try {
      const r = await cloudinary.api.resource(`${PENDING_FOLDER}/${key}`, { resource_type: resourceType });
      const c = ctxOf(r);
      if (within(c, PENDING_MS)) return { publicId: r.public_id as string, resourceType, note: c.note ?? "", lang: c.lang as Lang };
    } catch {
      // not found: try the next type
    }
  }
  return null;
}

/** Small raw marker assets hold a pending location ("_loc") or check mode ("_check"). */
async function marker(key: string, kind: "loc" | "check"): Promise<Ctx | null> {
  try {
    const r = await cloudinary.api.resource(`${PENDING_FOLDER}/${key}_${kind}`, { resource_type: "raw" });
    const c = ctxOf(r);
    return within(c, kind === "loc" ? PENDING_MS : CHECK_MODE_MS) ? c : null;
  } catch {
    return null;
  }
}

async function setMarker(key: string, kind: "loc" | "check", context: Ctx) {
  await cloudinary.uploader.upload(`data:text/plain;base64,${Buffer.from("raahat").toString("base64")}`, {
    public_id: `${PENDING_FOLDER}/${key}_${kind}`,
    resource_type: "raw",
    overwrite: true,
    context: { ...context, at: String(Date.now()) },
  });
}

const clearMarker = (key: string, kind: "loc" | "check") =>
  cloudinary.api
    .update(`${PENDING_FOLDER}/${key}_${kind}`, { resource_type: "raw", context: { at: "0" } } as Record<string, unknown>)
    .catch(() => undefined);

async function fileReport(
  chatId: number,
  key: string,
  photo: { publicId: string; resourceType: "image" | "video"; note: string },
  loc: { lat: number; lng: number },
  lang: Lang,
) {
  await sendMessage(chatId, msg(lang, "working"), lang, "remove");
  // Move the photo out of the per-sender slot so the next photo starts a new report.
  const renamed = await cloudinary.uploader.rename(photo.publicId, `${REPORT_FOLDER}/tg_${key}_${Date.now()}`, {
    resource_type: photo.resourceType,
    invalidate: true,
  });
  await clearMarker(key, "loc");
  const report = await triage({
    publicId: renamed.public_id,
    resourceType: photo.resourceType,
    lat: loc.lat,
    lng: loc.lng,
    locationSource: "telegram_pin",
    note: photo.note.slice(0, 500),
    lang,
    channel: "telegram",
    deferImageReview: (task) => after(task),
    reporterHash: key, // salted hash of the chat ID, never the ID itself
  });
  await sendMessage(
    chatId,
    filedMessage(lang, {
      severity: report.severity,
      score: report.score,
      categoryLabel: CATEGORY_LABEL[report.primaryCategory] ?? report.primaryCategory,
      duplicate: Boolean(report.duplicateOf),
      trackUrl: `${SITE_URL}/v/${shortId(report.publicId)}`,
    }),
    lang,
  );
}

async function factCheckMedia(chatId: number, key: string, media: Media, lang: Lang) {
  await clearMarker(key, "check");
  if (media.resourceType !== "image") return sendMessage(chatId, msg(lang, "unsupported"), lang);
  const file = await downloadFile(media.fileId);
  const result = await checkPhoto(`data:${media.mime};base64,${file.toString("base64")}`);
  const top = result.matches[0];
  await sendMessage(chatId, checkMessage(lang, { knownOld: result.knownOld, match: top ? { verdict: top.verdict, url: top.url } : null }), lang);
}

async function handle(update: TgUpdate, m: Incoming) {
  const { chatId, text, media, location } = m;
  const key = senderKey(`tg:${chatId}`, creds.apiSecret);
  let lang = m.lang;

  if (m.command === "check") {
    await setMarker(key, "check", { lang });
    return sendMessage(chatId, msg(lang, "checkAsk"), lang);
  }
  if (m.command) return sendMessage(chatId, msg(lang, "help"), lang, "location");

  if (media) {
    if (mediaSize(update) > MAX_MEDIA_BYTES) return sendMessage(chatId, msg(lang, "tooBig"), lang);
    if (m.forwarded || /^\/check\b/i.test(text) || (await marker(key, "check"))) {
      return factCheckMedia(chatId, key, media, lang);
    }
    const file = await downloadFile(media.fileId);
    const up = await cloudinary.uploader.upload(`data:${media.mime};base64,${file.toString("base64")}`, {
      public_id: `${PENDING_FOLDER}/${key}`,
      resource_type: media.resourceType,
      overwrite: true,
      invalidate: true,
      tags: [REPORT_TAG, "telegram_pending"],
      context: { note: text.slice(0, 300), lang, at: String(Date.now()) },
    });
    const photo = { publicId: up.public_id, resourceType: media.resourceType, note: text };
    const savedLoc = await marker(key, "loc");
    if (savedLoc) return fileReport(chatId, key, photo, { lat: Number(savedLoc.lat), lng: Number(savedLoc.lng) }, lang);
    return sendMessage(chatId, msg(lang, "askLocation"), lang, "location");
  }

  if (location) {
    const photo = await pendingPhoto(key);
    if (photo) {
      lang = photo.lang === "hi" ? "hi" : lang;
      return fileReport(chatId, key, photo, location, lang);
    }
    await setMarker(key, "loc", { lat: location.lat.toFixed(6), lng: location.lng.toFixed(6) });
    return sendMessage(chatId, msg(lang, "askPhoto"), lang, "remove");
  }

  // Plain text: attach it to a waiting photo as the note, otherwise explain how to report.
  const photo = text ? await pendingPhoto(key) : null;
  if (photo) {
    const note = [photo.note, text].filter(Boolean).join(" ").slice(0, 300);
    await cloudinary.api.update(photo.publicId, {
      resource_type: photo.resourceType,
      context: { note, lang: photo.lang ?? lang, at: String(Date.now()) },
    } as Record<string, unknown>);
    return sendMessage(chatId, msg(photo.lang === "hi" ? "hi" : lang, "noteSaved"), lang, "location");
  }
  return sendMessage(chatId, msg(lang, "help"), lang, "location");
}

export async function POST(req: Request) {
  if (!telegramReady()) {
    return NextResponse.json({ error: "Telegram intake is not configured." }, { status: 503 });
  }
  if (!validSecret(telegram.secret, req.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "Invalid secret token." }, { status: 403 });
  }
  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  const m = update ? parseUpdate(update) : null;
  if (!update || !m) return NextResponse.json({ ok: true }); // ignored update; 200 so Telegram doesn't retry

  after(async () => {
    try {
      await handle(update, m);
    } catch (err) {
      console.error("[raahat] Telegram report failed:", (err as Error).message);
      await sendMessage(m.chatId, msg(m.lang, "failed"), m.lang);
    }
  });
  return NextResponse.json({ ok: true });
}
