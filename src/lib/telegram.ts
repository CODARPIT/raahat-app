// Telegram intake. Free, no card, works on 2G, and Telegram has a native
// "share my location" button, so a citizen sends a photo and taps one button.
// The chat ID is never stored: pending uploads are keyed by a salted hash of it.
// Parsing and messages are pure, so they are unit-tested; the Bot API calls are
// thin wrappers at the bottom.

import { timingSafeEqual } from "node:crypto";

export const telegram = {
  token: process.env.TELEGRAM_BOT_TOKEN ?? "",
  secret: process.env.TELEGRAM_WEBHOOK_SECRET ?? "",
  username: (process.env.TELEGRAM_BOT_USERNAME ?? "").replace(/^@/, ""),
};

export const telegramReady = () => Boolean(telegram.token && telegram.secret);

/** Telegram echoes the secret given to setWebhook in this header on every update. */
export function validSecret(expected: string, given: string | null): boolean {
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ── Updates ──────────────────────────────────────────────────────────────────

interface TgFile {
  file_id: string;
  file_size?: number;
  mime_type?: string;
}

/** The parts of a Telegram Update that Raahat reads. */
export interface TgUpdate {
  update_id: number;
  message?: {
    chat: { id: number; type: string };
    from?: { language_code?: string };
    text?: string;
    caption?: string;
    photo?: (TgFile & { width: number; height: number })[];
    video?: TgFile;
    document?: TgFile;
    location?: { latitude: number; longitude: number };
    venue?: { location: { latitude: number; longitude: number } };
    forward_origin?: unknown;
    forward_date?: number;
  };
}

export type Lang = "en" | "hi";

export interface Incoming {
  chatId: number;
  lang: Lang;
  text: string;
  command: string | null; // "start", "help", ...
  media: { fileId: string; resourceType: "image" | "video"; mime: string } | null;
  location: { lat: number; lng: number } | null;
  /** Forwarded from someone else: a photo to fact-check, not the sender's own report. */
  forwarded: boolean;
}

export const MAX_MEDIA_BYTES = 20_000_000; // getFile's limit for bots

/** Normalises an update; null for anything Raahat ignores (edits, groups, channel posts). */
export function parseUpdate(u: TgUpdate): Incoming | null {
  const m = u.message;
  if (!m || m.chat.type !== "private") return null;
  const text = (m.text ?? m.caption ?? "").trim();
  const command = m.text?.match(/^\/([a-z]+)/i)?.[1].toLowerCase() ?? null;
  const lang: Lang = /[ऀ-ॿ]/.test(text) || m.from?.language_code === "hi" ? "hi" : "en";

  let media: Incoming["media"] = null;
  if (m.photo?.length) {
    const largest = m.photo[m.photo.length - 1];
    media = { fileId: largest.file_id, resourceType: "image", mime: "image/jpeg" };
  } else if (m.video) {
    media = { fileId: m.video.file_id, resourceType: "video", mime: m.video.mime_type ?? "video/mp4" };
  } else if (m.document?.mime_type?.startsWith("image/") || m.document?.mime_type?.startsWith("video/")) {
    const mime = m.document.mime_type;
    media = { fileId: m.document.file_id, resourceType: mime.startsWith("video/") ? "video" : "image", mime };
  }

  const raw = m.location ?? m.venue?.location;
  const location =
    raw && Number.isFinite(raw.latitude) && Number.isFinite(raw.longitude) && Math.abs(raw.latitude) <= 90 && Math.abs(raw.longitude) <= 180
      ? { lat: raw.latitude, lng: raw.longitude }
      : null;

  const forwarded = Boolean(m.forward_origin ?? m.forward_date);
  return { chatId: m.chat.id, lang, text: command ? "" : text, command, media, location, forwarded };
}

/** Size of the media in an update, when Telegram says; used to refuse files the Bot API can't fetch. */
export function mediaSize(u: TgUpdate): number {
  const m = u.message;
  return (m?.photo?.[m.photo.length - 1] ?? m?.video ?? m?.document)?.file_size ?? 0;
}

// ── Messages ─────────────────────────────────────────────────────────────────

const MSG = {
  en: {
    help:
      "Raahat emergency reports. In immediate danger? Call 112 first.\n\n" +
      "1. Send a photo or short video of what is happening (add a caption if you can).\n" +
      "2. Tap the button below to send your location.\n\n" +
      "Saw a viral disaster photo? Forward it here with /check to see if Raahat has verified it.",
    askLocation: "Photo received. Now tap \"Send my location\" below so help can find the place.",
    askPhoto: "Location received. Now send a photo of what is happening.",
    noteSaved: "Note added to your photo. Now tap \"Send my location\" to send the report.",
    working: "Thank you. Your report is being checked now.",
    unsupported: "Please send a photo or a short video.",
    tooBig: "That file is too large (over 20 MB). Please send a photo or a shorter video.",
    failed: "Sorry, we could not file your report. Please try again, and call 112 if anyone is in danger.",
    checkAsk: "Send the photo you want to check (a clean screenshot works too). Raahat will tell you if it matches a verified report or a known old photo.",
    locationButton: "📍 Send my location",
  },
  hi: {
    help:
      "राहत आपातकालीन रिपोर्ट। तुरंत ख़तरा है? पहले 112 पर कॉल करें।\n\n" +
      "1. जो हो रहा है उसकी फ़ोटो या छोटा वीडियो भेजें (हो सके तो कैप्शन लिखें)।\n" +
      "2. नीचे दिए बटन से अपनी लोकेशन भेजें।\n\n" +
      "कोई वायरल फ़ोटो देखी? /check लिखकर उसे यहाँ भेजें, राहत बताएगा कि वह सत्यापित है या नहीं।",
    askLocation: "फ़ोटो मिल गई। अब नीचे \"मेरी लोकेशन भेजें\" दबाएँ ताकि मदद जगह तक पहुँच सके।",
    askPhoto: "लोकेशन मिल गई। अब जो हो रहा है उसकी फ़ोटो भेजें।",
    noteSaved: "आपका संदेश फ़ोटो के साथ जोड़ दिया गया। रिपोर्ट भेजने के लिए \"मेरी लोकेशन भेजें\" दबाएँ।",
    working: "धन्यवाद। आपकी रिपोर्ट की जाँच हो रही है।",
    unsupported: "कृपया एक फ़ोटो या छोटा वीडियो भेजें।",
    tooBig: "यह फ़ाइल बहुत बड़ी है (20 MB से ज़्यादा)। कृपया फ़ोटो या छोटा वीडियो भेजें।",
    failed: "माफ़ कीजिए, रिपोर्ट दर्ज नहीं हो सकी। फिर से कोशिश करें, और किसी की जान ख़तरे में हो तो 112 पर कॉल करें।",
    checkAsk: "जिस फ़ोटो की जाँच करनी है वह भेजें (साफ़ स्क्रीनशॉट भी चलेगा)। राहत बताएगा कि वह किसी सत्यापित रिपोर्ट या पुरानी फ़ोटो से मिलती है या नहीं।",
    locationButton: "📍 मेरी लोकेशन भेजें",
  },
} as const;

export type MsgKey = keyof (typeof MSG)["en"];
export const msg = (lang: Lang, key: MsgKey) => MSG[lang][key];

export function filedMessage(
  lang: Lang,
  r: { severity: string; score: number; categoryLabel: string; duplicate: boolean; trackUrl: string },
): string {
  if (lang === "hi") {
    return (
      `रिपोर्ट दर्ज हो गई। प्राथमिकता: ${r.severity.toUpperCase()} (${r.score}/100), ${r.categoryLabel}।\n` +
      (r.duplicate ? "इस जगह से पहले भी रिपोर्ट आई है; आपकी रिपोर्ट से उसकी पुष्टि हुई। " : "") +
      `कंट्रोल रूम अब इसे देख सकता है। स्थिति यहाँ देखें: ${r.trackUrl}\nतुरंत ख़तरा है तो 112 पर कॉल करें।`
    );
  }
  return (
    `Report filed. Priority: ${r.severity.toUpperCase()} (${r.score}/100), ${r.categoryLabel}.\n` +
    (r.duplicate ? "Someone already reported this spot; your report confirms it. " : "") +
    `The control room can see it now. Track it here: ${r.trackUrl}\nIn immediate danger? Call 112.`
  );
}

/** Reply to /check: what Raahat knows about a forwarded photo. */
export function checkMessage(
  lang: Lang,
  m: { knownOld: string | null; match: { verdict: "verified" | "false" | "pending"; url: string } | null },
): string {
  const hi = lang === "hi";
  if (m.knownOld) {
    return hi
      ? `⚠️ यह पुरानी फ़ोटो है: ${m.knownOld}। इसे नई घटना बताकर आगे न भेजें।`
      : `⚠️ This is an old photo: ${m.knownOld}. Please don't forward it as a new incident.`;
  }
  if (m.match?.verdict === "verified") {
    return hi ? `✅ यह फ़ोटो नियंत्रण कक्ष द्वारा सत्यापित रिपोर्ट से मिलती है: ${m.match.url}` : `✅ This photo matches a report verified by the control room: ${m.match.url}`;
  }
  if (m.match?.verdict === "false") {
    return hi ? `❌ नियंत्रण कक्ष ने इस फ़ोटो को झूठा पाया है। इसे आगे न भेजें: ${m.match.url}` : `❌ The control room marked this photo as false. Please don't forward it: ${m.match.url}`;
  }
  if (m.match) {
    return hi ? `🕒 यह फ़ोटो एक रिपोर्ट से मिलती है जिसकी अभी जाँच हो रही है: ${m.match.url}` : `🕒 This photo matches a report that is still being checked: ${m.match.url}`;
  }
  return hi
    ? "राहत के पास इस फ़ोटो का कोई रिकॉर्ड नहीं है। इसका मतलब यह नहीं कि यह झूठी है, बस इसकी पुष्टि नहीं हुई है। आधिकारिक जानकारी के लिए NDMA या अपने ज़िला प्रशासन को देखें।"
    : "Raahat has no record of this photo. That doesn't make it false, only unconfirmed. For official updates follow NDMA or your district administration.";
}

// ── Bot API ──────────────────────────────────────────────────────────────────

async function call<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${telegram.token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
  if (!data.ok) throw new Error(`Telegram ${method} failed: ${data.description ?? res.status}`);
  return data.result as T;
}

export type Keyboard = "location" | "remove" | undefined;

export async function sendMessage(chatId: number, text: string, lang: Lang = "en", keyboard?: Keyboard): Promise<void> {
  const reply_markup =
    keyboard === "location"
      ? { keyboard: [[{ text: msg(lang, "locationButton"), request_location: true }]], resize_keyboard: true, one_time_keyboard: true }
      : keyboard === "remove"
        ? { remove_keyboard: true }
        : undefined;
  await call("sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true }, ...(reply_markup ? { reply_markup } : {}) }).catch((err) =>
    console.warn("[raahat] Telegram reply failed:", (err as Error).message),
  );
}

/** Downloads a file a citizen sent (two steps: getFile for the path, then the file itself). */
export async function downloadFile(fileId: string): Promise<Buffer> {
  const { file_path } = await call<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!file_path) throw new Error("Telegram did not return a file path.");
  const res = await fetch(`https://api.telegram.org/file/bot${telegram.token}/${file_path}`);
  if (!res.ok) throw new Error(`Could not download Telegram media (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}

export const setWebhook = (url: string, secret: string) =>
  call<boolean>("setWebhook", { url, secret_token: secret, allowed_updates: ["message"], drop_pending_updates: true });

export const setCommands = () =>
  call<boolean>("setMyCommands", {
    commands: [
      { command: "start", description: "How to report an emergency" },
      { command: "check", description: "Check if a viral photo is real" },
      { command: "help", description: "How to report an emergency" },
    ],
  });
