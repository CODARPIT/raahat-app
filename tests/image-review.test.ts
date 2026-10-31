import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { cloudinary } from "../src/lib/cloudinary";
import { REPORT_TAG } from "../src/lib/constants";
import {
  assessImage,
  effectiveReview,
  initialReview,
  MAX_REVIEW_BYTES,
  parseAssessment,
  REVIEW_DELAY_MS,
  REVIEW_GRACE_MS,
} from "../src/lib/image-review";
import { buildIncidents } from "../src/lib/incidents";
import { issueReceipt, readReceipt } from "../src/lib/receipt";
import { acceptImageEvidence, listReports, runImageReview, setStatus, triage } from "../src/lib/reports";
import { factCheck } from "../src/lib/verify";

const KEY = "test-gemini-key-must-not-leak";
process.env.RAAHAT_RECEIPT_SECRET = "receipt-test-secret";

function withKey<T>(fn: () => T): T {
  const saved = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = KEY;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = saved;
  }
}

const answer = (verdict: string, concerns: string[] = [], finishReason = "STOP") => ({
  candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify({ verdict, concerns }) }] } }],
});

// ── Scheduling and states ────────────────────────────────────────────────────

test("images are scheduled 10 s after filing; videos, seeds and keyless setups are not", () => {
  const now = new Date("2026-10-31T10:00:00Z");
  withKey(() => {
    const r = initialReview("image", true, now);
    assert.equal(r.state, "pending");
    assert.equal(Date.parse(r.dueAt!) - now.getTime(), REVIEW_DELAY_MS);
    assert.equal(r.votesAdded, false, "a pending image can't vote yet");
    assert.equal(initialReview("video", true, now).state, "not_assessed");
    assert.equal(initialReview("image", false, now).state, "not_assessed", "seed scripts don't opt in");
  });
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  assert.equal(initialReview("image", true, now).state, "unavailable");
  if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
});

test("an overdue pending check reads as unavailable, never as success", () => {
  const r = withKey(() => initialReview("image", true, new Date("2026-10-31T10:00:00Z")));
  const due = Date.parse(r.dueAt!);
  assert.equal(effectiveReview(r, new Date(due + REVIEW_GRACE_MS)).state, "pending");
  assert.equal(effectiveReview(r, new Date(due + REVIEW_GRACE_MS + 1)).state, "unavailable");
});

// ── Conservative parsing ─────────────────────────────────────────────────────

test("parsing is conservative: only a well-formed suspicion with concrete concerns is 'suspected'", () => {
  assert.deepEqual(parseAssessment(answer("no_clear_signs", ["ignored"])), { state: "clear", concerns: [] });
  assert.deepEqual(parseAssessment(answer("suspected_synthetic", ["  Melted text on the shop sign, top left "])), {
    state: "suspected",
    concerns: ["Melted text on the shop sign, top left"],
  });
  assert.equal(parseAssessment(answer("suspected_synthetic", [])).state, "inconclusive", "no concrete concern, no suspicion");
  assert.equal(parseAssessment(answer("suspected_synthetic", ["", 3 as unknown as string])).state, "inconclusive");
  assert.equal(parseAssessment(answer("inconclusive")).state, "inconclusive");
  assert.equal(parseAssessment(answer("definitely_fake", ["x"])).state, "unavailable");
  assert.equal(parseAssessment(answer("suspected_synthetic", ["x"], "MAX_TOKENS")).state, "unavailable", "truncated");
  assert.equal(parseAssessment(answer("suspected_synthetic", ["x"], "SAFETY")).state, "unavailable", "blocked answer");
  assert.equal(parseAssessment({ promptFeedback: { blockReason: "SAFETY" } }).state, "unavailable", "blocked prompt");
  assert.equal(parseAssessment({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "{not json" }] } }] }).state, "unavailable");
  assert.equal(parseAssessment(null).state, "unavailable");
  const withThoughts = {
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: "thinking…", thought: true }, { text: '{"verdict":"no_clear_signs","concerns":[]}' }] } }],
  };
  assert.equal(parseAssessment(withThoughts).state, "clear", "thought parts are skipped");
  const many = parseAssessment(answer("suspected_synthetic", Array.from({ length: 9 }, (_, i) => `concern ${i} ${"x".repeat(300)}`)));
  assert.equal(many.concerns.length, 5);
  assert.ok(many.concerns.every((c) => c.length <= 200));
});

// ── Provider call ────────────────────────────────────────────────────────────

type Call = { url: string; init?: RequestInit };

function provider(image: Response | (() => Response), reply: () => Promise<Response> | Response) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init });
    if (url.startsWith("https://generativelanguage.googleapis.com/")) return reply();
    return typeof image === "function" ? image() : image.clone();
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const jpeg = () => new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), { headers: { "content-type": "image/jpeg" } });

test("the stored image goes to Gemini inline, with the key in a header and never in the URL", async () => {
  const { calls, fetchImpl } = provider(jpeg, () => Response.json(answer("no_clear_signs")));
  const out = await assessImage("https://res.cloudinary.com/demo/image/upload/raahat/reports/x", { apiKey: KEY, model: "gemini-test", fetchImpl });
  assert.deepEqual(out, { state: "clear", concerns: [], model: "gemini-test" });
  assert.equal(calls[0].url, "https://res.cloudinary.com/demo/image/upload/raahat/reports/x");
  const g = calls[1];
  assert.ok(!g.url.includes(KEY), "key is not in the URL");
  assert.equal((g.init!.headers as Record<string, string>)["x-goog-api-key"], KEY);
  const body = JSON.parse(String(g.init!.body));
  const inline = body.contents[0].parts[1].inline_data;
  assert.equal(inline.mime_type, "image/jpeg");
  assert.equal(Buffer.from(inline.data, "base64").length, 6);
});

test("unsupported, oversized, failed, slow or keyless requests are 'unavailable', with no paid retry", async () => {
  const gif = provider(new Response(new Uint8Array([1]), { headers: { "content-type": "image/gif" } }), () => Response.json(answer("no_clear_signs")));
  assert.equal((await assessImage("https://img/x", { apiKey: KEY, fetchImpl: gif.fetchImpl })).state, "unavailable");
  assert.equal(gif.calls.length, 1, "Gemini is not called for an unsupported format");

  const big = provider(
    new Response(new Uint8Array([1]), { headers: { "content-type": "image/png", "content-length": String(MAX_REVIEW_BYTES + 1) } }),
    () => Response.json(answer("no_clear_signs")),
  );
  assert.equal((await assessImage("https://img/x", { apiKey: KEY, fetchImpl: big.fetchImpl })).state, "unavailable");
  assert.equal(big.calls.length, 1, "Gemini is not called for an image over 8 MiB");

  const failing = provider(jpeg, () => new Response("busy", { status: 503 }));
  assert.equal((await assessImage("https://img/x", { apiKey: KEY, fetchImpl: failing.fetchImpl })).state, "unavailable");
  assert.equal(failing.calls.length, 2, "one attempt, no retry");

  const hanging = provider(jpeg, () => new Promise<Response>(() => undefined));
  const slow = (async (input: string | URL | Request, init?: RequestInit) => {
    if (String(input).includes("generativelanguage")) {
      return new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))));
    }
    return hanging.fetchImpl(input, init);
  }) as typeof fetch;
  assert.equal((await assessImage("https://img/x", { apiKey: KEY, fetchImpl: slow, timeoutMs: 30 })).state, "unavailable");

  const keyless = provider(jpeg, () => Response.json(answer("no_clear_signs")));
  const saved = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  assert.equal((await assessImage("https://img/x", { fetchImpl: keyless.fetchImpl })).state, "unavailable");
  if (saved !== undefined) process.env.GEMINI_API_KEY = saved;
  assert.equal(keyless.calls.length, 0);
});

// ── Receipts ─────────────────────────────────────────────────────────────────

test("Gemini 3+ is asked to think briefly; a 400 for that setting gets one plain retry; failures say why", async () => {
  const ok = provider(jpeg, () => Response.json(answer("no_clear_signs")));
  await assessImage("https://img/x", { apiKey: KEY, model: "gemini-3.5-flash", fetchImpl: ok.fetchImpl });
  assert.deepEqual(JSON.parse(String(ok.calls[1].init!.body)).generationConfig.thinkingConfig, { thinkingLevel: "low" });
  const old = provider(jpeg, () => Response.json(answer("no_clear_signs")));
  await assessImage("https://img/x", { apiKey: KEY, model: "gemini-test", fetchImpl: old.fetchImpl });
  assert.equal(JSON.parse(String(old.calls[1].init!.body)).generationConfig.thinkingConfig, undefined);

  let n = 0;
  const picky = provider(jpeg, () => (++n === 1 ? new Response("bad field", { status: 400 }) : Response.json(answer("no_clear_signs"))));
  assert.equal((await assessImage("https://img/x", { apiKey: KEY, model: "gemini-3.5-flash", fetchImpl: picky.fetchImpl })).state, "clear");
  assert.equal(picky.calls.length, 3);
  assert.equal(JSON.parse(String(picky.calls[2].init!.body)).generationConfig.thinkingConfig, undefined);

  const quota = provider(jpeg, () => Response.json({ error: { status: "RESOURCE_EXHAUSTED" } }, { status: 429 }));
  const q = await assessImage("https://img/x", { apiKey: KEY, fetchImpl: quota.fetchImpl });
  assert.equal(q.state, "unavailable");
  assert.match(q.reason!, /429 RESOURCE_EXHAUSTED/);
  assert.equal(quota.calls.length, 2, "a quota error is not retried");
  assert.match(parseAssessment(answer("no_clear_signs", [], "MAX_TOKENS")).reason!, /cut off \(MAX_TOKENS\)/);
  assert.ok(!JSON.stringify(q).includes(KEY));
});

test("filing receipts are signed, bound to one report and expire after an hour", () => {
  const now = Date.parse("2026-10-31T10:00:00Z");
  const r = issueReceipt("raahat/reports/abc", "image", now)!;
  assert.deepEqual(readReceipt(r, now + 59 * 60_000), { publicId: "raahat/reports/abc", resourceType: "image" });
  assert.equal(readReceipt(r, now + 61 * 60_000), null, "expired");
  const [body, mac] = r.split(".");
  const forged = Buffer.from(JSON.stringify({ p: "raahat/reports/other", t: "image", e: 9e9 })).toString("base64url");
  assert.equal(readReceipt(`${forged}.${mac}`, now), null, "can't point a receipt at another report");
  assert.equal(readReceipt(`${body}.${mac}x`, now), null);
  assert.equal(readReceipt("", now), null);
});

// ── The pipeline, with Cloudinary and Gemini mocked ─────────────────────────

interface Asset {
  public_id: string;
  resource_type: "image" | "video";
  created_at: string;
  bytes: number;
  tags: string[];
  phash?: string;
  context?: Record<string, string>;
}
const north = (m: number) => 28.6 + (m / 6_371_000) * (180 / Math.PI);

test("the image check never changes the hazard rating, respects responders and gates incidents until accepted", async () => {
  const saved = { mode: process.env.RAAHAT_AI_MODE, key: process.env.GEMINI_API_KEY };
  process.env.RAAHAT_AI_MODE = "demo";
  process.env.GEMINI_API_KEY = KEY;
  const assets = new Map<string, Asset>();
  const written: string[] = [];
  const start = Date.now() - 3_600_000;
  const anchor: Asset = {
    public_id: "raahat/reports/ir-anchor", resource_type: "image", created_at: new Date(start).toISOString(), bytes: 1000,
    tags: [REPORT_TAG], phash: "aaaaaaaaaaaaaaaa", context: {
      score: "50", phash: "aaaaaaaaaaaaaaaa", primary: "flood", cats: "flood", lat: "28.6", lng: "77.2", locsrc: "gps",
      danger: "1", people: "0", depth: "none", corrob: "0", status: "new", summary: "Flood with people in danger", ai: "demo",
    },
  };
  // Filed long ago with a job that never ran: it must read as unavailable.
  const stale: Asset = {
    public_id: "raahat/reports/ir-stale", resource_type: "image", created_at: new Date(start).toISOString(), bytes: 1000,
    tags: [REPORT_TAG], phash: "0f0f0f0f0f0f0f0f", context: {
      score: "20", phash: "0f0f0f0f0f0f0f0f", primary: "waterlogging", cats: "waterlogging", status: "new", ai: "demo",
      ir: "pending", ir_due: new Date(Date.now() - REVIEW_GRACE_MS - 60_000).toISOString(), ir_votes: "0",
    },
  };
  assets.set(anchor.public_id, anchor);
  assets.set(stale.public_id, stale);
  mock.method(cloudinary.api, "resource", async (id: string) => {
    const a = assets.get(id);
    if (!a) throw new Error("Not found");
    return structuredClone(a);
  });
  mock.method(cloudinary.api, "update", async (id: string, o: { context: Record<string, string>; tags: string }) => {
    const a = assets.get(id);
    assert.ok(a);
    written.push(JSON.stringify(o));
    assets.set(id, { ...a, context: o.context, tags: o.tags.split(",") });
    return {};
  });
  mock.method(cloudinary.search, "expression", (q: string) => {
    const chain = {
      with_field: () => chain, sort_by: () => chain, max_results: () => chain,
      execute: async () => ({ resources: q.includes("known_old") ? [] : [...assets.values()].filter((a) => a.context?.score).map((a) => structuredClone(a)) }),
    };
    return chain;
  });
  mock.method(globalThis, "fetch", async () => new Response(new Uint8Array([1])));

  const upload = async (id: string, metres: number, phash: string, resourceType: "image" | "video" = "image") => {
    assets.set(id, { public_id: id, resource_type: resourceType, created_at: new Date(start + 120_000).toISOString(), bytes: 500, tags: [REPORT_TAG], phash });
    return triage({
      publicId: id, resourceType, lat: north(metres), lng: 77.2, locationSource: "gps",
      note: "8 people trapped on a roof in chest deep flood", lang: "en", assessImage: true,
    });
  };
  const get = async (id: string) => (await listReports()).find((r) => r.publicId === id)!;
  const noSleep = async () => undefined;
  try {
    // Filed first, assessed later: pending, provisional circle, no votes yet.
    const a = await upload("raahat/reports/ir-a", 150, "5555555555555555");
    assert.equal(a.imageReview.state, "pending");
    assert.equal((await get(anchor.public_id)).corroborations, 0, "a pending image can't add corroboration");
    const provisional = buildIncidents(await listReports());
    assert.equal(provisional.length, 1);
    assert.ok(provisional[0].reportIds.includes(a.publicId));
    assert.equal(provisional[0].provisional, true);

    // Clear: the stored original goes to the model, then the deferred vote is cast once.
    const clear = provider(jpeg, () => Response.json(answer("no_clear_signs")));
    const doneA = await runImageReview(a, { fetchImpl: clear.fetchImpl, sleep: noSleep });
    assert.match(clear.calls[0].url, /\/image\/upload\/raahat\/reports\/ir-a$/, "the stored upload, with no transformations");
    assert.equal(doneA?.imageReview.state, "clear");
    assert.equal(doneA?.score, a.score, "the hazard rating is unchanged");
    assert.equal((await get(anchor.public_id)).corroborations, 1);
    assert.equal(buildIncidents(await listReports())[0].provisional, false);
    // The same job again is stale: no model call, no second vote.
    await runImageReview(a, { fetchImpl: clear.fetchImpl, sleep: noSleep });
    assert.equal(clear.calls.length, 2);
    assert.equal((await get(anchor.public_id)).corroborations, 1);

    // Suspected, while a responder verifies the report mid-assessment.
    const b = await upload("raahat/reports/ir-b", 200, "f0f0f0f0f0f0f0f0");
    const suspicious = provider(jpeg, async () => {
      await setStatus(b.publicId, "image", "verified");
      return Response.json(answer("suspected_synthetic", ["Hands on the left merge into the railing"]));
    });
    const doneB = (await runImageReview(b, { fetchImpl: suspicious.fetchImpl, sleep: noSleep }))!;
    assert.equal(doneB.imageReview.state, "suspected");
    assert.equal(doneB.status, "verified", "the responder's action during assessment is kept");
    assert.equal(doneB.score, b.score);
    assert.equal(doneB.severity, b.severity);
    assert.deepEqual(doneB.reviewReasons, b.reviewReasons, "no review reason added, so the score isn't cut");
    assert.equal((await get(anchor.public_id)).corroborations, 1, "a suspected image doesn't vote");
    assert.ok(!buildIncidents(await listReports()).some((i) => i.reportIds.includes(b.publicId)), "kept out of incident circles");
    const fcB = factCheck(doneB);
    assert.equal(fcB.verdict, "pending", "a later concern suspends the public verified badge");
    assert.ok(!JSON.stringify(fcB).includes("railing"), "the model's explanation is not public");

    // A human accepts the image as evidence: eligibility and votes come back, once.
    const accepted = await acceptImageEvidence(b.publicId, "image");
    assert.ok(accepted.imageReview.acceptedAt);
    assert.equal(accepted.imageReview.state, "suspected", "the model's assessment is kept");
    assert.deepEqual(accepted.imageReview.concerns, ["Hands on the left merge into the railing"]);
    assert.equal(accepted.status, "verified", "accepting doesn't change the status");
    assert.equal(accepted.history.filter((h) => h.action === "image_accepted").length, 1);
    assert.ok(buildIncidents(await listReports()).some((i) => i.reportIds.includes(b.publicId)));
    assert.equal((await get(anchor.public_id)).corroborations, 2);
    assert.equal(factCheck(accepted).verdict, "verified");
    const again = await acceptImageEvidence(b.publicId, "image");
    assert.equal(again.history.filter((h) => h.action === "image_accepted").length, 1);
    assert.equal((await get(anchor.public_id)).corroborations, 2, "repeated acceptance adds no votes");

    // A job that never ran is unavailable on read and is not picked up late.
    const overdue = await get(stale.public_id);
    assert.equal(overdue.imageReview.state, "unavailable");
    const late = provider(jpeg, () => Response.json(answer("no_clear_signs")));
    await runImageReview({ ...overdue, imageReview: { ...overdue.imageReview, state: "pending" } }, { fetchImpl: late.fetchImpl, sleep: noSleep });
    assert.equal(late.calls.length, 0);

    // Videos are not assessed.
    const video = await upload("raahat/reports/ir-video", 5000, "1234123412341234", "video");
    assert.equal(video.imageReview.state, "not_assessed");

    assert.ok(written.every((w) => !w.includes(KEY)), "the Gemini key never reaches Cloudinary metadata");
  } finally {
    mock.restoreAll();
    for (const [name, value] of [["RAAHAT_AI_MODE", saved.mode], ["GEMINI_API_KEY", saved.key]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
