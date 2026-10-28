import { test } from "node:test";
import assert from "node:assert/strict";
import { checkMessage, filedMessage, mediaSize, parseUpdate, validSecret, type TgUpdate } from "../src/lib/telegram";

const chat = { id: 4242, type: "private" };
const update = (message: TgUpdate["message"]): TgUpdate => ({ update_id: 1, message });

test("webhook secret: exact match only", () => {
  assert.ok(validSecret("fake-secret-123", "fake-secret-123"));
  assert.ok(!validSecret("fake-secret-123", "fake-secret-124"));
  assert.ok(!validSecret("fake-secret-123", null));
  assert.ok(!validSecret("", ""));
});

test("photo: largest size is used, caption becomes the note", () => {
  const m = parseUpdate(
    update({
      chat,
      caption: "Water up to the knees near the school",
      photo: [
        { file_id: "small", width: 90, height: 90 },
        { file_id: "large", width: 1280, height: 960, file_size: 200_000 },
      ],
    }),
  )!;
  assert.deepEqual(m.media, { fileId: "large", resourceType: "image", mime: "image/jpeg" });
  assert.equal(m.text, "Water up to the knees near the school");
  assert.equal(m.forwarded, false);
  assert.equal(m.lang, "en");
});

test("location, Hindi, commands and forwards", () => {
  const loc = parseUpdate(update({ chat, location: { latitude: 25.6, longitude: 85.1 } }))!;
  assert.deepEqual(loc.location, { lat: 25.6, lng: 85.1 });
  assert.equal(parseUpdate(update({ chat, location: { latitude: 120, longitude: 85 } }))!.location, null);

  assert.equal(parseUpdate(update({ chat, text: "छत पर फंसे हैं" }))!.lang, "hi");
  assert.equal(parseUpdate(update({ chat, text: "hello", from: { language_code: "hi" } }))!.lang, "hi");

  const cmd = parseUpdate(update({ chat, text: "/start" }))!;
  assert.equal(cmd.command, "start");
  assert.equal(cmd.text, "");

  const fwd = parseUpdate(update({ chat, photo: [{ file_id: "x", width: 1, height: 1 }], forward_date: 1700000000 }))!;
  assert.equal(fwd.forwarded, true);
});

test("ignores groups, edits and non-media documents; videos and image documents count", () => {
  assert.equal(parseUpdate(update({ chat: { id: 1, type: "group" }, text: "hi" })), null);
  assert.equal(parseUpdate({ update_id: 2 }), null);
  assert.equal(parseUpdate(update({ chat, document: { file_id: "d", mime_type: "application/pdf" } }))!.media, null);
  assert.equal(parseUpdate(update({ chat, document: { file_id: "d", mime_type: "image/png" } }))!.media?.resourceType, "image");
  assert.equal(parseUpdate(update({ chat, video: { file_id: "v", file_size: 30_000_000 } }))!.media?.resourceType, "video");
  assert.equal(mediaSize(update({ chat, video: { file_id: "v", file_size: 30_000_000 } })), 30_000_000);
});

test("replies carry the tracking link and the right fact-check verdict", () => {
  const filed = filedMessage("en", { severity: "high", score: 72, categoryLabel: "Flood", duplicate: false, trackUrl: "https://example.test/v/abc" });
  assert.match(filed, /HIGH \(72\/100\), Flood/);
  assert.match(filed, /https:\/\/example\.test\/v\/abc/);
  assert.match(checkMessage("en", { knownOld: "Bihar floods, 2017", match: null }), /old photo: Bihar floods, 2017/);
  assert.match(checkMessage("en", { knownOld: null, match: { verdict: "verified", url: "u" } }), /verified/);
  assert.match(checkMessage("en", { knownOld: null, match: { verdict: "false", url: "u" } }), /false/);
  assert.match(checkMessage("en", { knownOld: null, match: null }), /no record/);
  assert.match(checkMessage("hi", { knownOld: null, match: null }), /रिकॉर्ड/);
});
