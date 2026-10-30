import { test } from "node:test";
import assert from "node:assert/strict";
import { actionOf, buttonText, checkMessage, filedMessage, mediaSize, msg, parseUpdate, PROFILE, replyKeyboard, validSecret, type TgUpdate } from "../src/lib/telegram";

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

test("filed replies are short, localised and say when there is no location", () => {
  const filed = filedMessage("en", { severity: "high", score: 72, categoryLabel: "Flood", duplicate: false, located: true });
  assert.match(filed, /Priority: High \(72\/100\) · Flood/);
  assert.doesNotMatch(filed, /https?:/, "the tracking link is a button, not raw text");
  assert.doesNotMatch(filed, /No location/);
  assert.match(filedMessage("en", { severity: "critical", score: 96, categoryLabel: "Flood", duplicate: true, located: false }), /already reported[\s\S]*No location/);
  assert.match(filedMessage("hi", { severity: "critical", score: 96, categoryLabel: "Flood", duplicate: false, located: true }), /अति गंभीर/);
});

test("fact-check replies give the right verdict", () => {
  assert.match(checkMessage("en", { knownOld: "Bihar floods, 2017", match: null }), /old photo: Bihar floods, 2017/);
  assert.match(checkMessage("en", { knownOld: null, match: { verdict: "verified" } }), /verified/);
  assert.match(checkMessage("en", { knownOld: null, match: { verdict: "false" } }), /false/);
  assert.match(checkMessage("en", { knownOld: null, match: null }), /no record/);
  assert.match(checkMessage("hi", { knownOld: null, match: null }), /रिकॉर्ड/);
});

test("menu buttons and commands map to actions, in the button's own language", () => {
  const press = (text: string) => actionOf(parseUpdate(update({ chat, text }))!);
  assert.deepEqual(press(buttonText("en", "report")), { action: "report", lang: "en" });
  assert.deepEqual(press(buttonText("hi", "check")), { action: "check", lang: "hi" });
  assert.deepEqual(press(buttonText("en", "skip")), { action: "skip", lang: "en" });
  assert.deepEqual(press(buttonText("hi", "cancel")), { action: "cancel", lang: "hi" });
  assert.deepEqual(press("/start"), { action: "start", lang: "en" });
  assert.deepEqual(press("/cancel"), { action: "cancel", lang: "en" });
  assert.deepEqual(press("/whatever"), { action: "help", lang: "en" }, "unknown commands get help");
  assert.equal(press("Water near the temple"), null, "ordinary text is a note, not a button");
});

test("keyboards stay minimal: three menu buttons, and a location step with skip and cancel", () => {
  const main = replyKeyboard("main", "en");
  assert.deepEqual(main.keyboard.flat().map((k) => k.text), [buttonText("en", "report"), buttonText("en", "check"), buttonText("en", "help")]);
  assert.equal(main.is_persistent, true);
  const loc = replyKeyboard("location", "hi").keyboard.flat();
  assert.deepEqual(loc.map((k) => k.text), [buttonText("hi", "location"), buttonText("hi", "skip"), buttonText("hi", "cancel")]);
  assert.equal((loc[0] as { request_location?: boolean }).request_location, true);
  // Messages that name a button use its exact label.
  assert.ok(msg("en", "askLocation").includes(buttonText("en", "skip")));
  assert.ok(msg("hi", "help").includes(buttonText("hi", "check")));
});

test("bot profile fits Telegram's limits", () => {
  for (const p of [PROFILE.en, PROFILE.hi]) {
    assert.ok([...p.short].length <= 120, "short description ≤ 120");
    assert.ok([...p.description].length <= 512, "description ≤ 512");
    for (const c of p.commands) assert.match(c.command, /^[a-z]{1,32}$/);
  }
});
