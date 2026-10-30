import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { assessImage, newImageReview, parseImageAssessment, waitForImageReview } from "../src/lib/image-review";
import { currentImageReview, decodeImageReview, imageNeedsReview } from "../src/lib/image-review-state";
import { createReportReceipt, verifyReportReceipt } from "../src/lib/report-receipt";
import { factCheck } from "../src/lib/verify";
import { buildIncidents } from "../src/lib/incidents";
import { cloudinary } from "../src/lib/cloudinary";
import { acceptImageEvidence, completeImageReview, getReport, setStatus, triage } from "../src/lib/reports";
import { REPORT_TAG } from "../src/lib/constants";
import type { ImageReview } from "../src/lib/types";

const review: ImageReview = {
  status: "pending", requestedAt: "2026-10-30T10:00:00.000Z", dueAt: "2026-10-30T10:00:10.000Z",
  checkedAt: null, model: "gemini-2.5-flash", reason: "",
};
const image = { publicId: "raahat/reports/image-review-test", resourceType: "image" as const };

function setEnv(name: string, value?: string) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
  return () => { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; };
}
const modelResponse = (assessment: string) => Response.json({ candidates: [{ finishReason: "STOP", content: {
  parts: [{ text: JSON.stringify({ assessment, reason: "Some repeated structures appear visually inconsistent." }) }],
} }] });

test("review starts ten seconds after rating and never pretends a missing key or video was checked", () => {
  const restore = setEnv("GEMINI_API_KEY", "test-only-not-a-real-key");
  try {
    const pending = newImageReview("image", true, 1000);
    assert.equal(pending.status, "pending");
    assert.equal(Date.parse(pending.dueAt!) - Date.parse(pending.requestedAt), 10_000);
    assert.equal(newImageReview("video", true).status, "not_checked");
    assert.equal(newImageReview("image", false).status, "not_checked");
    delete process.env.GEMINI_API_KEY;
    assert.equal(newImageReview("image", true).status, "unavailable");
  } finally { restore(); }
});

test("visual assessment parser has no genuine/fake or watermark verdict", () => {
  assert.equal(parseImageAssessment({ assessment: "genuine", reason: "real" }).status, "inconclusive");
  assert.equal(parseImageAssessment({ assessment: "fake", reason: "fake" }).status, "inconclusive");
  assert.equal(parseImageAssessment({ assessment: "no_clear_signs" }).status, "inconclusive");
  assert.equal(parseImageAssessment({ assessment: "suspected_synthetic", reason: "Repeated distorted objects" }).status, "suspected_synthetic");
  assert.equal(parseImageAssessment(null).status, "inconclusive");
});

test("server delay waits until due time and doesn't restart ten seconds for a late task", async () => {
  const delays: number[] = [];
  await waitForImageReview(review, { now: () => Date.parse(review.requestedAt) + 2500, sleep: async (ms) => { delays.push(ms); } });
  await waitForImageReview(review, { now: () => Date.parse(review.dueAt!) + 1, sleep: async (ms) => { delays.push(ms); } });
  assert.deepEqual(delays, [7500]);
});

test("Gemini receives the unenhanced upload, strict schema and server header, never an API key in a URL", async () => {
  const restore = setEnv("GEMINI_API_KEY", "test-only-not-a-real-key");
  const calls: { url: string; options?: RequestInit }[] = [];
  try {
    const result = await assessImage(image, review, { fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      if (calls.length === 1) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
      return modelResponse("no_clear_signs");
    } });
    assert.equal(result.status, "no_clear_signs");
    assert.ok(result.checkedAt);
    assert.ok(!calls[0].url.includes("e_improve"));
    assert.ok(!calls[1].url.includes("test-only"));
    assert.equal(new Headers(calls[1].options?.headers).get("x-goog-api-key"), "test-only-not-a-real-key");
    const request = JSON.parse(String(calls[1].options?.body));
    assert.equal(request.contents[0].parts[1].inlineData.data, "AQID");
    assert.equal(request.generationConfig.responseMimeType, "application/json");
    assert.match(request.contents[0].parts[0].text, /NOT SynthID/);
  } finally { restore(); }
});

test("API errors, oversized images, unexpected formats and missing keys stay unavailable", async () => {
  const restore = setEnv("GEMINI_API_KEY", "test-only-not-a-real-key");
  try {
    const fixtures = [
      async () => { throw new Error("provider error containing a credential must not be shown"); },
      async () => new Response("x", { status: 429 }),
      async () => new Response("x", { headers: { "content-type": "text/html" } }),
      async () => new Response("x", { headers: { "content-type": "image/jpeg", "content-length": "9000000" } }),
    ];
    for (const fetchImpl of fixtures) {
      const result = await assessImage(image, review, { fetchImpl });
      assert.equal(result.status, "unavailable");
      assert.ok(!result.reason.includes("credential"));
      assert.equal(imageNeedsReview(result), false);
    }
    delete process.env.GEMINI_API_KEY;
    assert.equal((await assessImage(image, review, { fetchImpl: async () => { assert.fail("must not call Google without a key"); } })).status, "unavailable");
  } finally { restore(); }
});

test("a blocked or truncated Gemini response is inconclusive rather than a negative judgment", async () => {
  const restore = setEnv("GEMINI_API_KEY", "test-only-not-a-real-key");
  try {
    let calls = 0;
    const result = await assessImage(image, review, { fetchImpl: async () => ++calls === 1
      ? new Response("x", { headers: { "content-type": "image/png" } })
      : Response.json({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: '{"assessment":"suspected_synthetic"}' }] } }] }) });
    assert.equal(result.status, "inconclusive");
  } finally { restore(); }
});

test("a stalled provider request times out without a synthetic-image accusation", async () => {
  const restore = setEnv("GEMINI_API_KEY", "test-only-not-a-real-key");
  try {
    let calls = 0;
    const result = await assessImage(image, review, { timeoutMs: 5, fetchImpl: async (_url, options) => {
      if (++calls === 1) return new Response("x", { headers: { "content-type": "image/jpeg" } });
      return new Promise<Response>((_resolve, reject) => {
        options?.signal?.addEventListener("abort", () => reject(new Error("Timed out")), { once: true });
      });
    } });
    assert.equal(result.status, "unavailable");
    assert.equal(imageNeedsReview(result), false);
  } finally { restore(); }
});

test("stored assessment round-trips, interrupted jobs stop spinning and an override lifts only the model flag", () => {
  assert.deepEqual(decodeImageReview(JSON.stringify(review)), review);
  assert.equal(decodeImageReview('{"status":"genuine"}'), undefined);
  assert.equal(currentImageReview(review, Date.parse(review.dueAt!) + 120_001)?.status, "unavailable");
  assert.equal(imageNeedsReview({ ...review, status: "suspected_synthetic" }), true);
  assert.equal(imageNeedsReview({ ...review, status: "suspected_synthetic", acceptedAt: review.requestedAt }), false);
});

test("filing receipts reject tampering, wrong secrets and expiry", () => {
  const restore = setEnv("CLOUDINARY_API_SECRET", "test-only-receipt-secret");
  try {
    const token = createReportReceipt(image, 1000)!;
    assert.deepEqual(verifyReportReceipt(token, 2000), image);
    assert.equal(verifyReportReceipt(token, 3_601_000), null);
    assert.equal(verifyReportReceipt(token + "x", 2000), null);
    const parts = token.split(".");
    assert.equal(verifyReportReceipt(Buffer.from('{"id":"another-report","type":"image","exp":9999999}').toString("base64url") + "." + parts[1], 2000), null);
    process.env.CLOUDINARY_API_SECRET = "different-test-secret";
    assert.equal(verifyReportReceipt(token, 2000), null);
    delete process.env.CLOUDINARY_API_SECRET;
    assert.equal(createReportReceipt(image), null);
  } finally { restore(); }
});

test("a model assessment never creates a public verified/false badge and can request renewed human review", () => {
  const report = { status: "new" as const, history: [{ action: "filed" as const, at: review.requestedAt }], reviewReasons: [], corroborations: 0 };
  assert.equal(factCheck({ ...report, imageReview: { ...review, status: "no_clear_signs" } }).verdict, "pending");
  const suspected = { ...review, status: "suspected_synthetic" as const };
  assert.equal(factCheck({ ...report, imageReview: suspected }).verdict, "pending");
  const humanVerified = { ...report, status: "verified" as const, history: [...report.history, { action: "verified" as const, at: review.requestedAt }] };
  assert.equal(factCheck({ ...humanVerified, imageReview: suspected }).verdict, "pending");
  assert.equal(factCheck({ ...humanVerified, imageReview: { ...suspected, acceptedAt: review.requestedAt } }).verdict, "verified");
});

test("delayed repository review preserves emergency rating and intervening responder actions; acceptance restores circles", async () => {
  const restoreKey = setEnv("GEMINI_API_KEY", "test-only-not-a-real-key");
  const restoreMode = setEnv("RAAHAT_AI_MODE", "demo");
  const id = "raahat/reports/delayed-review-pipeline";
  const asset = { public_id: id, resource_type: "image" as const, created_at: new Date(Date.now() - 60_000).toISOString(),
    bytes: 3, tags: [REPORT_TAG], context: { score: "80", primary: "flood", cats: "flood", lat: "28.6", lng: "77.2",
      danger: "1", people: "8", depth: "chest_or_more", corrob: "0", status: "new", summary: "People in flood", ai: "demo", img_review: JSON.stringify(review) } as Record<string, string> };
  let modelCalls = 0;
  mock.method(cloudinary.api, "resource", async () => structuredClone(asset));
  mock.method(cloudinary.api, "update", async (_id: string, options: { context: Record<string, string> }) => { asset.context = options.context; return {}; });
  mock.method(cloudinary.search, "expression", () => {
    const chain = { with_field: () => chain, sort_by: () => chain, max_results: () => chain, execute: async () => ({ resources: [structuredClone(asset)] }) };
    return chain;
  });
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    if (String(url).startsWith("https://generativelanguage.googleapis.com/")) {
      modelCalls++;
      // Simulate a responder dispatching a team while the model is running.
      await setStatus(id, "image", "dispatched");
      return modelResponse("suspected_synthetic");
    }
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
  });
  try {
    const before = await getReport(id, "image");
    const initialRadius = buildIncidents([before])[0].radiusM;
    await completeImageReview(id, "image", review.requestedAt);
    const assessed = await getReport(id, "image");
    assert.equal(assessed.status, "dispatched");
    assert.equal(assessed.score, before.score, "a Gemini suspicion must not lower the emergency rating");
    assert.equal(assessed.severity, before.severity);
    assert.equal(assessed.imageReview?.status, "suspected_synthetic");
    assert.equal(assessed.needsReview, true);
    assert.deepEqual(buildIncidents([assessed]), []);
    await completeImageReview(id, "image", review.requestedAt);
    assert.equal(modelCalls, 1, "a completed assessment must not be charged again");
    const accepted = await acceptImageEvidence(id, "image");
    assert.equal(accepted.needsReview, false);
    assert.equal(accepted.status, "dispatched");
    assert.equal(buildIncidents([accepted])[0].radiusM, initialRadius);
    assert.equal(accepted.history.at(-1)?.action, "image_accepted");
    const historyCount = accepted.history.length;
    assert.equal((await acceptImageEvidence(id, "image")).history.length, historyCount);

    // Other review flags survive a responder accepting this particular assessment.
    asset.context.reasons = "Matches an older photo: a previous flood";
    asset.context.img_review = JSON.stringify({ ...review, status: "suspected_synthetic" });
    asset.context.upd = new Date(Date.now() + 1000).toISOString();
    assert.equal((await acceptImageEvidence(id, "image")).needsReview, true);
  } finally { mock.restoreAll(); restoreKey(); restoreMode(); }
});

test("filing schedules one background task and pending evidence cannot boost an existing report", async () => {
  const restoreKey = setEnv("GEMINI_API_KEY", "test-only-not-a-real-key");
  const restoreMode = setEnv("RAAHAT_AI_MODE", "demo");
  const id = "raahat/reports/pending-review-filing";
  let stored: Record<string, string> | undefined;
  const asset = { public_id: id, resource_type: "image", created_at: new Date().toISOString(), bytes: 3, tags: [REPORT_TAG] };
  const anchor = { ...asset, public_id: "raahat/reports/pending-test-anchor", context: {
    score: "50", primary: "trapped_or_injured", cats: "trapped_or_injured,flood", lat: "28.6", lng: "77.2", danger: "1", depth: "none", status: "new", ai: "demo",
  } };
  const testNow = Date.now() + 11_000;
  mock.method(Date, "now", () => testNow); // expire the shared Search cache
  mock.method(cloudinary.api, "resource", async () => asset);
  mock.method(cloudinary.api, "update", async (publicId: string, options: { context: Record<string, string> }) => {
    assert.equal(publicId, id, "pending evidence must not update another report's corroborations"); stored = options.context; return {};
  });
  mock.method(cloudinary.search, "expression", (query: string) => {
    const chain = { with_field: () => chain, sort_by: () => chain, max_results: () => chain, execute: async () => ({ resources: query.includes("known_old") ? [] : [anchor] }) }; return chain;
  });
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => {
    assert.ok(!String(url).startsWith("https://generativelanguage.googleapis.com/"), "filing must not wait for Gemini");
    return new Response(new Uint8Array([1]));
  });
  try {
    const tasks: (() => Promise<void>)[] = [];
    const report = await triage({ publicId: id, resourceType: "image", lat: 28.6, lng: 77.2, locationSource: "gps",
      note: "8 people trapped in chest deep flood", lang: "en", deferImageReview: (task) => tasks.push(task) });
    assert.equal(report.imageReview?.status, "pending");
    assert.equal(report.corroborations, 0);
    assert.equal(tasks.length, 1);
    assert.equal(JSON.parse(stored!.img_review).status, "pending");
  } finally { mock.restoreAll(); restoreKey(); restoreMode(); }
});

test("no-clear-signs completion adds compatible independent corroboration once", async () => {
  const restore = setEnv("GEMINI_API_KEY", "test-only-not-a-real-key");
  const now = Date.now();
  mock.method(Date, "now", () => now + 22_000);
  const anchorId = "raahat/reports/gemini-corroboration-anchor";
  const witnessId = "raahat/reports/gemini-corroboration-witness";
  const asset = (id: string, pending: boolean) => ({ public_id: id, resource_type: "image", tags: [REPORT_TAG], bytes: 3,
    created_at: new Date(now - (pending ? 0 : 60_000)).toISOString(), context: {
      score: "50", primary: "flood", cats: "flood", lat: "28.6", lng: "77.2", danger: "1", people: "0", depth: "none", status: "new", corrob: "0", ai: "demo",
      ...(pending ? { img_review: JSON.stringify(review) } : {}),
    } as Record<string, string> });
  const assets = new Map([[anchorId, asset(anchorId, false)], [witnessId, asset(witnessId, true)]]);
  let anchorWrites = 0;
  mock.method(cloudinary.api, "resource", async (id: string) => structuredClone(assets.get(id)));
  mock.method(cloudinary.api, "update", async (id: string, options: { context: Record<string, string> }) => {
    const original = assets.get(id)!; assets.set(id, { ...original, context: options.context });
    if (id === anchorId) anchorWrites++;
    return {};
  });
  mock.method(cloudinary.search, "expression", () => {
    const chain = { with_field: () => chain, sort_by: () => chain, max_results: () => chain, execute: async () => ({ resources: [...assets.values()] }) }; return chain;
  });
  mock.method(globalThis, "fetch", async (url: string | URL | Request) => String(url).startsWith("https://generativelanguage.googleapis.com/")
    ? modelResponse("no_clear_signs") : new Response("x", { headers: { "content-type": "image/jpeg" } }));
  try {
    await completeImageReview(witnessId, "image", review.requestedAt);
    assert.equal((await getReport(witnessId, "image")).corroborations, 1);
    assert.equal((await getReport(anchorId, "image")).corroborations, 1);
    await completeImageReview(witnessId, "image", review.requestedAt);
    assert.equal(anchorWrites, 1);
  } finally { mock.restoreAll(); restore(); }
});
