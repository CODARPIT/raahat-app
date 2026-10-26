// WhatsApp intake through the Twilio WhatsApp Sandbox: pure helpers (no I/O), unit-tested.
// Citizens already share disaster photos on WhatsApp; this meets them there instead of
// asking them to open a website mid-flood.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Severity } from "./types";

export type TwilioParams = Record<string, string>;

export type Inbound =
  | { kind: "photo"; from: string; mediaUrl: string; contentType: string; caption: string }
  | { kind: "location"; from: string; lat: number; lng: number; label: string }
  | { kind: "text"; from: string; body: string };

/**
 * Twilio signs each webhook: base64(HMAC-SHA1(authToken, url + each POST key and value,
 * keys sorted)). Same algorithm as twilio.validateRequest, without the 10 MB dependency.
 */
export function twilioSignature(authToken: string, url: string, params: TwilioParams): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");
}

export function validTwilioSignature(authToken: string, signature: string | null, url: string, params: TwilioParams): boolean {
  if (!signature) return false;
  const expected = Buffer.from(twilioSignature(authToken, url, params));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function parseInbound(p: TwilioParams): Inbound {
  const from = p.From ?? "";
  if (Number(p.NumMedia ?? 0) >= 1 && p.MediaUrl0) {
    return { kind: "photo", from, mediaUrl: p.MediaUrl0, contentType: p.MediaContentType0 ?? "", caption: (p.Body ?? "").trim() };
  }
  const lat = Number(p.Latitude);
  const lng = Number(p.Longitude);
  if (p.Latitude && p.Longitude && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
    return { kind: "location", from, lat, lng, label: (p.Label || p.Address || "").trim() };
  }
  return { kind: "text", from, body: (p.Body ?? "").trim() };
}

/** Only images and short videos become reports; voice notes, PDFs and stickers don't. */
export function isReportMedia(contentType: string) {
  return /^image\/(jpeg|png|webp|heic|heif)$/i.test(contentType) || /^video\/(mp4|3gpp|quicktime)$/i.test(contentType);
}

/** We store sha256 of the number, never the number: enough to link a photo to its location pin. */
export function reporterHash(from: string): string {
  return createHash("sha256").update(`raahat:${from.replace(/^whatsapp:/, "")}`).digest("hex");
}

export const looksHindi = (text: string) => /[ऀ-ॿ]/.test(text);

function xmlEscape(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function twiml(message: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${xmlEscape(message)}</Message></Response>`;
}

const SEV = {
  en: { critical: "CRITICAL", high: "HIGH", moderate: "MODERATE", low: "LOW" },
  hi: { critical: "अति गंभीर", high: "गंभीर", moderate: "मध्यम", low: "कम" },
} as const;

export type Lang = "en" | "hi";

export const REPLIES = {
  received: (lang: Lang, severity: Severity, needsLocation: boolean) =>
    lang === "hi"
      ? `रिपोर्ट मिल गई। प्राथमिकता: ${SEV.hi[severity]}।${needsLocation ? " कृपया अपनी लोकेशन भेजें (📎 → Location) ताकि राहत दल आप तक पहुँच सके।" : ""} अगर किसी की जान ख़तरे में है, तो 112 पर कॉल करें।`
      : `Report received. Priority: ${SEV.en[severity]}.${needsLocation ? " Please share your location pin (📎 → Location) so responders can find you." : ""} If life is in danger, call 112.`,
  analysing: (lang: Lang) =>
    lang === "hi"
      ? "रिपोर्ट मिल गई, जाँच हो रही है। कृपया अपनी लोकेशन भेजें (📎 → Location)। अगर किसी की जान ख़तरे में है, तो 112 पर कॉल करें।"
      : "Received, analysing your photo. Please share your location pin (📎 → Location). If life is in danger, call 112.",
  locationAdded: (lang: Lang) =>
    lang === "hi" ? "लोकेशन जुड़ गई। राहत दल आपकी रिपोर्ट देख सकता है।" : "Location added. Responders can see your report.",
  locationWithoutPhoto: (lang: Lang) =>
    lang === "hi"
      ? "लोकेशन मिली, पर पहले फ़ोटो भेजें, फिर लोकेशन।"
      : "Got a location, but no recent photo from you. Send a photo of what you see first, then your location.",
  howTo: (lang: Lang) =>
    lang === "hi"
      ? "राहत: आपदा की रिपोर्ट करने के लिए 1) जो दिख रहा है उसकी फ़ोटो भेजें (चाहें तो साथ में लिखें क्या हो रहा है), 2) फिर अपनी लोकेशन भेजें (📎 → Location)। आपात स्थिति में 112 पर कॉल करें।"
      : "Raahat: to report an emergency, 1) send a photo of what you see (add a caption if you can), 2) then send your location pin (📎 → Location). In an emergency, also call 112.",
  unsupported: (lang: Lang) =>
    lang === "hi" ? "यह फ़ाइल नहीं खुल सकी। कृपया फ़ोटो या छोटा वीडियो भेजें।" : "We can't read that file. Please send a photo or a short video.",
  failed: (lang: Lang) =>
    lang === "hi"
      ? "माफ़ कीजिए, रिपोर्ट दर्ज नहीं हो पाई। कृपया फिर से भेजें। आपात स्थिति में 112 पर कॉल करें।"
      : "Sorry, we couldn't file that report. Please send it again. In an emergency, call 112.",
};
