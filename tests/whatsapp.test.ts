import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { detectLang, parseLocation, senderKey, twilioSignature, validSignature } from "../src/lib/whatsapp";

const url = "https://raahat.example/api/whatsapp";
const params = { From: "whatsapp:+919800000000", Body: "Flood", NumMedia: "0" };

test("Twilio signature: url plus params sorted by name, HMAC-SHA1, base64", () => {
  const expected = createHmac("sha1", "token").update(url + "BodyFloodFromwhatsapp:+919800000000NumMedia0").digest("base64");
  assert.equal(twilioSignature("token", url, params), expected);
  assert.ok(validSignature("token", url, params, expected));
  assert.ok(!validSignature("token", url, { ...params, Body: "Fire" }, expected));
  assert.ok(!validSignature("other", url, params, expected));
  assert.ok(!validSignature("token", url, params, ""));
});

test("sender key is stable, salted and hides the phone number", () => {
  const k = senderKey("whatsapp:+919800000000", "salt");
  assert.equal(k, senderKey("whatsapp:+919800000000", "salt"));
  assert.notEqual(k, senderKey("whatsapp:+919800000000", "pepper"));
  assert.match(k, /^[0-9a-f]{16}$/);
});

test("location and language parsing", () => {
  assert.deepEqual(parseLocation({ Latitude: "28.61", Longitude: "77.20" }), { lat: 28.61, lng: 77.2 });
  assert.equal(parseLocation({ Latitude: "200", Longitude: "77" }), null);
  assert.equal(parseLocation({}), null);
  assert.equal(detectLang("छत पर फंसे हैं"), "hi");
  assert.equal(detectLang("stuck on roof"), "en");
});
