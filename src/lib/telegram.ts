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

// ── Messages and buttons ─────────────────────────────────────────────────────
// The bot stays minimal: a persistent menu with three buttons, and during a report
// one extra step (share location, skip or cancel). Every reply is short.

export type Action = "start" | "report" | "check" | "help" | "skip" | "cancel";

const BUTTON = {
  en: {
    report: "🚨 Report an emergency",
    check: "🔎 Check a photo",
    help: "❓ Help",
    location: "📍 Send my location",
    skip: "⏭ Skip location",
    cancel: "✖️ Cancel",
    track: "Track your report",
    open: "Open the fact check",
  },
  hi: {
    report: "🚨 आपातकाल की रिपोर्ट करें",
    check: "🔎 फ़ोटो जाँचें",
    help: "❓ मदद",
    location: "📍 मेरी लोकेशन भेजें",
    skip: "⏭ लोकेशन छोड़ें",
    cancel: "✖️ रद्द करें",
    track: "अपनी रिपोर्ट देखें",
    open: "तथ्य जाँच खोलें",
  },
} as const;

const b = BUTTON.en;
const h = BUTTON.hi;

const MSG = {
  en: {
    welcome:
      "🙏 Welcome to Raahat. Your photos go straight to the disaster control room, ranked by urgency.\n\n" +
      "To report, just send a photo or short video of what is happening.\n\n" +
      "In immediate danger? Call 112 first.",
    help:
      "How to report:\n" +
      "1. Send a photo or short video. Add a caption if you can.\n" +
      `2. Tap “${b.location}”, or “${b.skip}” if you can’t.\n\n` +
      `To check a viral photo, tap “${b.check}” or just forward it here.\n\n` +
      "In immediate danger? Call 112.",
    askPhoto: "Send a photo or short video of what is happening. Add a caption if you can.",
    askLocation: `Photo received ✅\nNow tap “${b.location}” so help can find the place.\n\nCan’t share it? Type the area or a landmark, or tap “${b.skip}”.`,
    askPhotoAfterLocation: "Location received ✅ Now send a photo of what is happening.",
    noteSaved: `Added to your report. Now share your location, or tap “${b.skip}”.`,
    working: "Thank you. Sending your report to the control room…",
    nothingPending: "There’s no report waiting. Send a photo first.",
    cancelled: "Cancelled. Nothing was sent.",
    fallback: `To report, send a photo. To check a viral photo, tap “${b.check}”.`,
    checkAsk: "Send or forward the photo you want to check. A clean screenshot works too.",
    checking: "🔎 Checking the photo…",
    checkVideo: "Only photos can be checked. Send a screenshot of a clear frame instead.",
    unsupported: "Please send a photo or a short video.",
    tooBig: "That file is too large (over 20 MB). Please send a photo or a shorter video.",
    failed: "Sorry, we could not file your report. Please try again, and call 112 if anyone is in danger.",
  },
  hi: {
    welcome:
      "🙏 राहत में आपका स्वागत है। आपकी फ़ोटो सीधे आपदा नियंत्रण कक्ष तक पहुँचती है, ज़रूरत के हिसाब से क्रम में।\n\n" +
      "रिपोर्ट करने के लिए जो हो रहा है उसकी फ़ोटो या छोटा वीडियो भेजें।\n\n" +
      "तुरंत ख़तरा है? पहले 112 पर कॉल करें।",
    help:
      "रिपोर्ट कैसे करें:\n" +
      "1. फ़ोटो या छोटा वीडियो भेजें। हो सके तो कैप्शन लिखें।\n" +
      `2. “${h.location}” दबाएँ, या न भेज सकें तो “${h.skip}”।\n\n` +
      `वायरल फ़ोटो जाँचने के लिए “${h.check}” दबाएँ या उसे यहाँ फ़ॉरवर्ड करें।\n\n` +
      "तुरंत ख़तरा है? 112 पर कॉल करें।",
    askPhoto: "जो हो रहा है उसकी फ़ोटो या छोटा वीडियो भेजें। हो सके तो कैप्शन लिखें।",
    askLocation: `फ़ोटो मिल गई ✅\nअब “${h.location}” दबाएँ ताकि मदद जगह तक पहुँच सके।\n\nलोकेशन नहीं भेज सकते? इलाक़े या किसी पास की जगह का नाम लिखें, या “${h.skip}” दबाएँ।`,
    askPhotoAfterLocation: "लोकेशन मिल गई ✅ अब जो हो रहा है उसकी फ़ोटो भेजें।",
    noteSaved: `आपकी रिपोर्ट में जोड़ दिया गया। अब लोकेशन भेजें, या “${h.skip}” दबाएँ।`,
    working: "धन्यवाद। आपकी रिपोर्ट नियंत्रण कक्ष को भेजी जा रही है…",
    nothingPending: "अभी कोई रिपोर्ट बाकी नहीं है। पहले फ़ोटो भेजें।",
    cancelled: "रद्द कर दिया। कुछ नहीं भेजा गया।",
    fallback: `रिपोर्ट करने के लिए फ़ोटो भेजें। वायरल फ़ोटो जाँचने के लिए “${h.check}” दबाएँ।`,
    checkAsk: "जिस फ़ोटो की जाँच करनी है उसे भेजें या फ़ॉरवर्ड करें। साफ़ स्क्रीनशॉट भी चलेगा।",
    checking: "🔎 फ़ोटो की जाँच हो रही है…",
    checkVideo: "सिर्फ़ फ़ोटो की जाँच हो सकती है। किसी साफ़ फ़्रेम का स्क्रीनशॉट भेजें।",
    unsupported: "कृपया एक फ़ोटो या छोटा वीडियो भेजें।",
    tooBig: "यह फ़ाइल बहुत बड़ी है (20 MB से ज़्यादा)। कृपया फ़ोटो या छोटा वीडियो भेजें।",
    failed: "माफ़ कीजिए, रिपोर्ट दर्ज नहीं हो सकी। फिर से कोशिश करें, और किसी की जान ख़तरे में हो तो 112 पर कॉल करें।",
  },
} as const;

export type MsgKey = keyof (typeof MSG)["en"];
export const msg = (lang: Lang, key: MsgKey) => MSG[lang][key];
export const buttonText = (lang: Lang, key: keyof (typeof BUTTON)["en"]) => BUTTON[lang][key];

const COMMANDS: Record<string, Action> = { start: "start", report: "report", check: "check", help: "help", cancel: "cancel", skip: "skip" };
const PRESSABLE = ["report", "check", "help", "skip", "cancel"] as const;

/** What a command or a menu-button press asks for, and in which language the button was. */
export function actionOf(m: Pick<Incoming, "command" | "text" | "lang">): { action: Action; lang: Lang } | null {
  if (m.command) return { action: COMMANDS[m.command] ?? "help", lang: m.lang };
  for (const lang of ["en", "hi"] as const) {
    const key = PRESSABLE.find((k) => BUTTON[lang][k] === m.text);
    if (key) return { action: key, lang };
  }
  return null;
}

/** Reply keyboards: the main menu, the location step, or just "Cancel". */
export type Keyboard = "main" | "location" | "cancel";

export function replyKeyboard(kind: Keyboard, lang: Lang) {
  const t = BUTTON[lang];
  const rows =
    kind === "main"
      ? [[{ text: t.report }], [{ text: t.check }, { text: t.help }]]
      : kind === "location"
        ? [[{ text: t.location, request_location: true }], [{ text: t.skip }, { text: t.cancel }]]
        : [[{ text: t.cancel }]];
  return { keyboard: rows, resize_keyboard: true, is_persistent: true };
}

/** A tappable link under a message, instead of a raw URL in the text. */
export const linkButton = (text: string, url: string) => ({ inline_keyboard: [[{ text, url }]] });

const SEVERITY = {
  en: { critical: "Critical", high: "High", moderate: "Moderate", low: "Low" },
  hi: { critical: "अति गंभीर", high: "गंभीर", moderate: "मध्यम", low: "कम" },
} as const;

export function filedMessage(
  lang: Lang,
  r: { severity: string; score: number; categoryLabel: string; duplicate: boolean; located: boolean },
): string {
  const sev = SEVERITY[lang][r.severity as keyof (typeof SEVERITY)["en"]] ?? r.severity;
  if (lang === "hi") {
    return [
      "✅ रिपोर्ट नियंत्रण कक्ष तक पहुँच गई।",
      `प्राथमिकता: ${sev} (${r.score}/100) · ${r.categoryLabel}`,
      ...(r.duplicate ? ["यह पहले भी रिपोर्ट हुई है; आपकी रिपोर्ट से इसकी पुष्टि हुई।"] : []),
      ...(r.located ? [] : ["लोकेशन नहीं है, इसलिए नियंत्रण कक्ष इसे नक्शे पर लगाएगा।"]),
      "",
      "तुरंत ख़तरा है? 112 पर कॉल करें।",
    ].join("\n");
  }
  return [
    "✅ Report sent to the control room.",
    `Priority: ${sev} (${r.score}/100) · ${r.categoryLabel}`,
    ...(r.duplicate ? ["Someone already reported this; your report confirms it."] : []),
    ...(r.located ? [] : ["No location, so the control room will place it on the map."]),
    "",
    "In immediate danger? Call 112.",
  ].join("\n");
}

/** Reply to a fact-check: what Raahat knows about the photo. The link goes in a button. */
export function checkMessage(
  lang: Lang,
  m: { knownOld: string | null; match: { verdict: "verified" | "false" | "pending" } | null },
): string {
  const hi = lang === "hi";
  if (m.knownOld) {
    return hi
      ? `⚠️ यह पुरानी फ़ोटो है: ${m.knownOld}। इसे नई घटना बताकर आगे न भेजें।`
      : `⚠️ This is an old photo: ${m.knownOld}. Please don't forward it as a new incident.`;
  }
  if (m.match?.verdict === "verified") {
    return hi ? "✅ यह फ़ोटो नियंत्रण कक्ष द्वारा सत्यापित रिपोर्ट से मिलती है।" : "✅ This photo matches a report verified by the control room.";
  }
  if (m.match?.verdict === "false") {
    return hi ? "❌ नियंत्रण कक्ष ने इस फ़ोटो को झूठा पाया है। इसे आगे न भेजें।" : "❌ The control room marked this photo as false. Please don't forward it.";
  }
  if (m.match) {
    return hi ? "🕒 यह फ़ोटो एक रिपोर्ट से मिलती है जिसकी अभी जाँच हो रही है।" : "🕒 This photo matches a report that is still being checked.";
  }
  return hi
    ? "राहत के पास इस फ़ोटो का कोई रिकॉर्ड नहीं है। इसका मतलब यह नहीं कि यह झूठी है, बस इसकी पुष्टि नहीं हुई है। आधिकारिक जानकारी के लिए NDMA या अपने ज़िला प्रशासन को देखें।"
    : "Raahat has no record of this photo. That doesn't make it false, only unconfirmed. For official updates follow NDMA or your district administration.";
}

// ── Bot profile (set once by scripts/telegram-setup.ts) ─────────────────────

export const PROFILE = {
  en: {
    short: "Report a disaster with one photo, or check if a viral photo is real. In danger? Call 112.",
    description:
      "Raahat sends your disaster photos to the control room, ranked by urgency.\n\n" +
      "📸 Send a photo or short video\n📍 Share your location, or skip\n🔎 Forward a viral photo to check if it’s real\n\n" +
      "Faces are blurred on public pages and your number is never stored.\nIn immediate danger? Call 112.",
    commands: [
      { command: "report", description: "Report an emergency" },
      { command: "check", description: "Check if a viral photo is real" },
      { command: "cancel", description: "Cancel the current report" },
      { command: "help", description: "How it works" },
    ],
  },
  hi: {
    short: "एक फ़ोटो से आपदा की रिपोर्ट करें, या जाँचें कि वायरल फ़ोटो सच है या नहीं। ख़तरा है? 112 पर कॉल करें।",
    description:
      "राहत आपकी आपदा की फ़ोटो नियंत्रण कक्ष तक पहुँचाता है, ज़रूरत के हिसाब से क्रम में।\n\n" +
      "📸 फ़ोटो या छोटा वीडियो भेजें\n📍 अपनी लोकेशन भेजें, या छोड़ें\n🔎 वायरल फ़ोटो फ़ॉरवर्ड करें और जाँचें कि वह सच है या नहीं\n\n" +
      "सार्वजनिक पेजों पर चेहरे धुंधले रहते हैं और आपका नंबर कभी सेव नहीं होता।\nतुरंत ख़तरा है? 112 पर कॉल करें।",
    commands: [
      { command: "report", description: "आपातकाल की रिपोर्ट करें" },
      { command: "check", description: "वायरल फ़ोटो जाँचें" },
      { command: "cancel", description: "मौजूदा रिपोर्ट रद्द करें" },
      { command: "help", description: "यह कैसे काम करता है" },
    ],
  },
} as const;

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

type Markup = ReturnType<typeof replyKeyboard> | ReturnType<typeof linkButton>;

/** Sends a reply. `markup` is a reply keyboard by name, or a link button. Failures are logged, never thrown. */
export async function sendMessage(chatId: number, text: string, lang: Lang = "en", markup?: Keyboard | Markup): Promise<void> {
  const reply_markup = typeof markup === "string" ? replyKeyboard(markup, lang) : markup;
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

/** The bot's profile: description, short description, the command menu (English, plus Hindi for Hindi phones). */
export async function setProfile(): Promise<void> {
  for (const lang of ["en", "hi"] as const) {
    const p = PROFILE[lang];
    const language_code = lang === "hi" ? { language_code: "hi" } : {};
    await call<boolean>("setMyCommands", { commands: p.commands, ...language_code });
    await call<boolean>("setMyDescription", { description: p.description, ...language_code });
    await call<boolean>("setMyShortDescription", { short_description: p.short, ...language_code });
  }
  await call<boolean>("setChatMenuButton", { menu_button: { type: "commands" } });
}
