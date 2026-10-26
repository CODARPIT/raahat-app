import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isReportMedia,
  looksHindi,
  parseInbound,
  REPLIES,
  reporterHash,
  twilioSignature,
  twiml,
  validTwilioSignature,
} from "../src/lib/whatsapp";

// Fake values only. Real Twilio credentials never go in tests.
const TOKEN = "test_auth_token_not_real";
const URL = "https://raahat.example/api/whatsapp";
const FROM = "whatsapp:+910000000000";

test("Twilio photo message is parsed", () => {
  const m = parseInbound({ From: FROM, NumMedia: "1", MediaUrl0: "https://api.twilio.com/media/ME1", MediaContentType0: "image/jpeg", Body: " कमर तक पानी " });
  assert.deepEqual(m, { kind: "photo", from: FROM, mediaUrl: "https://api.twilio.com/media/ME1", contentType: "image/jpeg", caption: "कमर तक पानी" });
});

test("Twilio location message is parsed", () => {
  const m = parseInbound({ From: FROM, NumMedia: "0", Latitude: "26.1445", Longitude: "91.7362", Address: "Pan Bazaar, Guwahati" });
  assert.deepEqual(m, { kind: "location", from: FROM, lat: 26.1445, lng: 91.7362, label: "Pan Bazaar, Guwahati" });
  assert.equal(parseInbound({ From: FROM, Latitude: "999", Longitude: "0", Body: "" }).kind, "text");
});

test("Twilio text-only message is parsed", () => {
  assert.deepEqual(parseInbound({ From: FROM, NumMedia: "0", Body: "help" }), { kind: "text", from: FROM, body: "help" });
});

test("Twilio signature check accepts genuine and rejects tampered requests", () => {
  const params = { From: FROM, Body: "hello", NumMedia: "0" };
  const sig = twilioSignature(TOKEN, URL, params);
  assert.equal(validTwilioSignature(TOKEN, sig, URL, params), true);
  assert.equal(validTwilioSignature(TOKEN, sig, URL, { ...params, Body: "hellO" }), false);
  assert.equal(validTwilioSignature(TOKEN, sig, URL + "?x=1", params), false);
  assert.equal(validTwilioSignature("other_token", sig, URL, params), false);
  assert.equal(validTwilioSignature(TOKEN, null, URL, params), false);
  // Key order in the form must not matter: Twilio sorts keys before signing.
  assert.equal(sig, twilioSignature(TOKEN, URL, { NumMedia: "0", Body: "hello", From: FROM }));
});

test("reporter hash never contains the phone number", () => {
  const h = reporterHash(FROM);
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.ok(!h.includes("910000000000"));
  assert.equal(h, reporterHash("+910000000000"));
});

test("only photos and short videos become reports", () => {
  assert.ok(isReportMedia("image/jpeg"));
  assert.ok(isReportMedia("video/mp4"));
  assert.ok(!isReportMedia("audio/ogg"));
  assert.ok(!isReportMedia("application/pdf"));
});

test("replies are TwiML-escaped and follow the reporter's language", () => {
  assert.equal(twiml("A & B <c>"), '<?xml version="1.0" encoding="UTF-8"?><Response><Message>A &amp; B &lt;c&gt;</Message></Response>');
  assert.ok(looksHindi("बाढ़"));
  assert.ok(!looksHindi("flood"));
  assert.match(REPLIES.received("en", "high", true), /Priority: HIGH\. Please share your location pin/);
  assert.match(REPLIES.received("hi", "critical", false), /अति गंभीर/);
  assert.doesNotMatch(REPLIES.received("en", "low", false), /location pin/);
});
