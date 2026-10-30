// Whole Telegram conversations against a fake Bot API and a fake Cloudinary.
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { cloudinary } from "../src/lib/cloudinary";
import { buttonText, msg, parseUpdate, type TgUpdate } from "../src/lib/telegram";
import { handle } from "../src/lib/telegram-flow";

interface Asset {
  public_id: string;
  resource_type: string;
  created_at: string;
  bytes: number;
  tags: string[];
  phash?: string;
  context: Record<string, string>;
}

interface Sent {
  text: string;
  keyboard: string[];
  link: string | null;
}

function harness() {
  const assets = new Map<string, Asset>();
  const sent: Sent[] = [];
  const merge = (id: string, ctx: Record<string, string> | undefined, tags?: string) => {
    const a = assets.get(id);
    if (!a) throw new Error(`Not found: ${id}`);
    assets.set(id, { ...a, context: { ...a.context, ...(ctx ?? {}) }, ...(tags ? { tags: tags.split(",") } : {}) });
  };
  mock.method(cloudinary.uploader, "upload", async (_file: string, o: { public_id?: string; folder?: string; resource_type?: string; tags?: string[]; context?: Record<string, string>; phash?: boolean }) => {
    const id = o.public_id ?? `${o.folder}/${assets.size}`;
    assets.set(id, {
      public_id: id, resource_type: o.resource_type ?? "image", created_at: new Date().toISOString(), bytes: 1000,
      tags: o.tags ?? [], context: o.context ?? {}, phash: "1234567812345678",
    });
    return { public_id: id, phash: o.phash ? "1234567812345678" : undefined };
  });
  mock.method(cloudinary.uploader, "rename", async (from: string, to: string) => {
    const a = assets.get(from);
    assert.ok(a, `rename of missing ${from}`);
    assets.delete(from);
    assets.set(to, { ...a, public_id: to });
    return { public_id: to };
  });
  mock.method(cloudinary.uploader, "destroy", async (id: string) => {
    assets.delete(id);
    return { result: "ok" };
  });
  mock.method(cloudinary.api, "resource", async (id: string) => {
    const a = assets.get(id);
    if (!a) throw new Error("Not found");
    return { ...structuredClone(a), context: { custom: { ...a.context } } };
  });
  mock.method(cloudinary.api, "update", async (id: string, o: { context?: Record<string, string>; tags?: string }) => {
    merge(id, o.context, o.tags);
    return {};
  });
  mock.method(cloudinary.search, "expression", (q: string) => {
    const chain = {
      with_field: () => chain, sort_by: () => chain, max_results: () => chain,
      execute: async () => ({
        resources: q.includes("known_old") ? [] : [...assets.values()].filter((a) => a.context.score !== undefined).map((a) => structuredClone(a)),
      }),
    };
    return chain;
  });
  mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/sendMessage")) {
      const body = JSON.parse(String(init!.body));
      const markup = body.reply_markup ?? {};
      sent.push({
        text: body.text,
        keyboard: (markup.keyboard ?? []).flat().map((k: { text: string }) => k.text),
        link: markup.inline_keyboard?.[0]?.[0]?.url ?? null,
      });
      return Response.json({ ok: true, result: {} });
    }
    if (url.includes("/getFile")) return Response.json({ ok: true, result: { file_path: "photos/p.jpg" } });
    return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3])); // the file itself, or a thumbnail
  });
  return { assets, sent };
}

const chat = { id: 777, type: "private" };
let n = 0;
async function say(message: Omit<NonNullable<TgUpdate["message"]>, "chat">) {
  const update: TgUpdate = { update_id: ++n, message: { chat, ...message } };
  await handle(update, parseUpdate(update)!);
}
const photo = (caption?: string, extra: object = {}) => say({ photo: [{ file_id: "f", width: 800, height: 600 }], ...(caption ? { caption } : {}), ...extra });
const reports = (assets: Map<string, Asset>) => [...assets.values()].filter((a) => a.public_id.startsWith("raahat/reports/"));
const pending = (assets: Map<string, Asset>) => [...assets.values()].filter((a) => /^raahat\/telegram\/[0-9a-f]+$/.test(a.public_id));

const main = [buttonText("en", "report"), buttonText("en", "check"), buttonText("en", "help")];
const locationStep = [buttonText("en", "location"), buttonText("en", "skip"), buttonText("en", "cancel")];

test("a full Telegram conversation: menu, photo, landmark, skip, cancel, location-first, check", async () => {
  const saved = { mode: process.env.RAAHAT_AI_MODE, key: process.env.GEMINI_API_KEY };
  process.env.RAAHAT_AI_MODE = "demo";
  delete process.env.GEMINI_API_KEY;
  const { assets, sent } = harness();
  const last = () => sent[sent.length - 1];
  try {
    // Start: a short welcome and the three-button menu.
    await say({ text: "/start" });
    assert.equal(last().text, msg("en", "welcome"));
    assert.deepEqual(last().keyboard, main);

    // Photo → asked for location, with Skip and Cancel.
    await photo("8 people on a roof, water rising");
    assert.equal(last().text, msg("en", "askLocation"));
    assert.deepEqual(last().keyboard, locationStep);
    assert.equal(pending(assets).length, 1);

    // Typing a landmark adds it to the report and keeps the location step.
    await say({ text: "near Gandhi School" });
    assert.equal(last().text, msg("en", "noteSaved"));
    assert.deepEqual(last().keyboard, locationStep);

    // Skip files it without a location: menu comes back, then the result with a Track button.
    sent.length = 0;
    await say({ text: buttonText("en", "skip") });
    assert.equal(sent[0].text, msg("en", "working"));
    assert.deepEqual(sent[0].keyboard, main);
    assert.match(sent[1].text, /Report sent to the control room/);
    assert.match(sent[1].text, /No location/);
    assert.match(sent[1].link ?? "", /\/v\/tg_/);
    const [first] = reports(assets);
    assert.equal(first.context.lat, "");
    assert.match(first.context.note, /8 people on a roof.*near Gandhi School/);
    assert.equal(first.context.ch, "telegram");
    assert.equal(pending(assets).length, 0);

    // Skip with nothing waiting is explained, not an error.
    await say({ text: buttonText("en", "skip") });
    assert.equal(last().text, msg("en", "nothingPending"));

    // Photo, then Cancel: the photo is withdrawn.
    await photo();
    await say({ text: buttonText("en", "cancel") });
    assert.equal(last().text, msg("en", "cancelled"));
    assert.deepEqual(last().keyboard, main);
    assert.equal(pending(assets).length, 0);
    assert.equal(reports(assets).length, 1);

    // Location first, then the photo: filed with the location.
    await say({ location: { latitude: 25.61, longitude: 85.14 } });
    assert.equal(last().text, msg("en", "askPhotoAfterLocation"));
    await photo("road blocked by a fallen tree");
    assert.equal(reports(assets).length, 2);
    const located = reports(assets).find((a) => a.context.lat !== "")!;
    assert.equal(Number(located.context.lat), 25.61);
    assert.doesNotMatch(last().text, /No location/);

    // Check a photo: Cancel-only keyboard, then a verdict, and nothing is filed.
    await say({ text: buttonText("en", "check") });
    assert.equal(last().text, msg("en", "checkAsk"));
    assert.deepEqual(last().keyboard, [buttonText("en", "cancel")]);
    sent.length = 0;
    await photo();
    assert.equal(sent[0].text, msg("en", "checking"));
    assert.deepEqual(sent[0].keyboard, main);
    assert.equal(sent.length, 2);
    assert.equal(reports(assets).length, 2, "a checked photo is not filed");

    // A forwarded photo is fact-checked without pressing anything.
    sent.length = 0;
    await photo(undefined, { forward_date: 1_700_000_000 });
    assert.equal(sent[0].text, msg("en", "checking"));
    assert.equal(reports(assets).length, 2);

    // Ordinary text with nothing waiting gets one short line, not the whole help.
    await say({ text: "hello" });
    assert.equal(last().text, msg("en", "fallback"));

    // A Hindi button press answers in Hindi with the Hindi menu.
    await say({ text: buttonText("hi", "report") });
    assert.equal(last().text, msg("hi", "askPhoto"));
    assert.deepEqual(last().keyboard, [buttonText("hi", "report"), buttonText("hi", "check"), buttonText("hi", "help")]);
  } finally {
    mock.restoreAll();
    if (saved.mode === undefined) delete process.env.RAAHAT_AI_MODE;
    else process.env.RAAHAT_AI_MODE = saved.mode;
    if (saved.key !== undefined) process.env.GEMINI_API_KEY = saved.key;
  }
});
