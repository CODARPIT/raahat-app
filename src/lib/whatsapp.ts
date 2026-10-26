// WhatsApp intake through Twilio. A citizen sends a photo and shares their
// location (in either order); once both are in, the photo goes through the
// same triage pipeline as the web form. The phone number is never stored:
// pending uploads are keyed by a salted hash of it.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const twilio = {
  accountSid: process.env.TWILIO_ACCOUNT_SID ?? "",
  authToken: process.env.TWILIO_AUTH_TOKEN ?? "",
  from: process.env.TWILIO_WHATSAPP_FROM ?? "",
};

/** Twilio's request signature: HMAC-SHA1 of the URL plus every POST param, sorted by name. */
export function twilioSignature(authToken: string, url: string, params: Record<string, string>): string {
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

export function validSignature(authToken: string, url: string, params: Record<string, string>, given: string): boolean {
  if (!authToken || !given) return false;
  const a = Buffer.from(twilioSignature(authToken, url, params));
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Stable, non-reversible key for a sender, safe to use in a Cloudinary public ID. */
export function senderKey(from: string, salt: string): string {
  return createHash("sha256").update(salt + from).digest("hex").slice(0, 16);
}

export function detectLang(text: string): "en" | "hi" {
  return /[ऀ-ॿ]/.test(text) ? "hi" : "en";
}

export function parseLocation(p: Record<string, string>): { lat: number; lng: number } | null {
  if (!p.Latitude || !p.Longitude) return null;
  const lat = Number(p.Latitude);
  const lng = Number(p.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

const MSG = {
  en: {
    help:
      "Raahat emergency reports. In immediate danger? Call 112 first.\n\n" +
      "1. Send a photo of what is happening (add a caption if you can).\n" +
      "2. Share your location: tap the attach icon, then Location, then Send your current location.",
    askLocation:
      "Photo received. Now share your location: tap the attach icon, then Location, then Send your current location.",
    askPhoto: "Location received. Now send a photo of what is happening.",
    noteSaved: "Note added to your photo. Now share your location to send the report.",
    working: "Thank you. Your report is being checked now.",
    unsupported: "Please send a photo or a short video.",
    failed: "Sorry, we could not file your report. Please try again, and call 112 if anyone is in danger.",
  },
  hi: {
    help:
      "राहत आपातकालीन रिपोर्ट। तुरंत ख़तरा है? पहले 112 पर कॉल करें।\n\n" +
      "1. जो हो रहा है उसकी फ़ोटो भेजें (हो सके तो कैप्शन लिखें)।\n" +
      "2. अपनी लोकेशन भेजें: अटैच आइकन, फिर लोकेशन, फिर अपनी मौजूदा लोकेशन भेजें।",
    askLocation: "फ़ोटो मिल गई। अब अपनी लोकेशन भेजें: अटैच आइकन, फिर लोकेशन, फिर अपनी मौजूदा लोकेशन भेजें।",
    askPhoto: "लोकेशन मिल गई। अब जो हो रहा है उसकी फ़ोटो भेजें।",
    noteSaved: "आपका संदेश फ़ोटो के साथ जोड़ दिया गया। रिपोर्ट भेजने के लिए अपनी लोकेशन भेजें।",
    working: "धन्यवाद। आपकी रिपोर्ट की जाँच हो रही है।",
    unsupported: "कृपया एक फ़ोटो या छोटा वीडियो भेजें।",
    failed: "माफ़ कीजिए, रिपोर्ट दर्ज नहीं हो सकी। फिर से कोशिश करें, और किसी की जान ख़तरे में हो तो 112 पर कॉल करें।",
  },
} as const;

export type MsgKey = keyof (typeof MSG)["en"];
export const msg = (lang: "en" | "hi", key: MsgKey) => MSG[lang][key];

export function filedMessage(
  lang: "en" | "hi",
  r: { severity: string; score: number; categoryLabel: string; duplicate: boolean },
): string {
  if (lang === "hi") {
    return (
      `रिपोर्ट दर्ज हो गई। प्राथमिकता: ${r.severity.toUpperCase()} (${r.score}/100), ${r.categoryLabel}।\n` +
      (r.duplicate ? "इस जगह से पहले भी रिपोर्ट आई है; आपकी रिपोर्ट से उसकी पुष्टि हुई। " : "") +
      "कंट्रोल रूम अब इसे देख सकता है। तुरंत ख़तरा है तो 112 पर कॉल करें।"
    );
  }
  return (
    `Report filed. Priority: ${r.severity.toUpperCase()} (${r.score}/100), ${r.categoryLabel}.\n` +
    (r.duplicate ? "Someone already reported this spot; your report confirms it. " : "") +
    "The control room can see it now. In immediate danger? Call 112."
  );
}

/** Sends a WhatsApp message through the Twilio REST API. */
export async function sendWhatsApp(to: string, body: string): Promise<void> {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: "Basic " + Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: twilio.from, To: to, Body: body }),
  });
  if (!res.ok) console.warn("[raahat] WhatsApp reply failed:", res.status, await res.text());
}

/** Downloads a media file Twilio received (media URLs need the account credentials). */
export async function downloadMedia(url: string): Promise<Buffer> {
  const res = await fetch(url, {
    headers: { Authorization: "Basic " + Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64") },
  });
  if (!res.ok) throw new Error(`Could not download WhatsApp media (${res.status}).`);
  return Buffer.from(await res.arrayBuffer());
}
