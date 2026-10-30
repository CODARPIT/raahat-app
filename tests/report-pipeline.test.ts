import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { cloudinary } from "../src/lib/cloudinary";
import { REPORT_TAG } from "../src/lib/constants";
import { buildIncidents } from "../src/lib/incidents";
import { listReports, setLocation, setStatus, triage } from "../src/lib/reports";
import { REASON_REUSED_PHOTO } from "../src/lib/triage";

interface Asset {
  public_id: string; resource_type: "image"; created_at: string; bytes: number;
  tags: string[]; phash?: string; context?: Record<string, string>;
}
const north = (m: number) => 28.6 + m / 6_371_000 * 180 / Math.PI;

test("Cloudinary pipeline preserves evidence, avoids duplicate votes and resizes active incidents", async () => {
  const previousMode = process.env.RAAHAT_AI_MODE;
  process.env.RAAHAT_AI_MODE = "demo";
  const assets = new Map<string, Asset>();
  const anchor: Asset = {
    public_id: "raahat/reports/test-anchor", resource_type: "image", created_at: new Date(Date.now() - 3_600_000).toISOString(), bytes: 1000,
    tags: [REPORT_TAG], phash: "aaaaaaaaaaaaaaaa", context: {
      score: "50", phash: "aaaaaaaaaaaaaaaa", primary: "flood", cats: "flood", lat: "28.6", lng: "77.2", locsrc: "gps",
      danger: "1", people: "0", depth: "none", corrob: "0", status: "new", summary: "Flood with people in danger", ai: "demo",
    },
  };
  assets.set(anchor.public_id, anchor);
  const updates: string[] = [];
  mock.method(cloudinary.api, "resource", async (id: string) => {
    const asset = assets.get(id); if (!asset) throw new Error("Not found"); return structuredClone(asset);
  });
  mock.method(cloudinary.api, "update", async (id: string, options: { context: Record<string, string>; tags: string }) => {
    const asset = assets.get(id); assert.ok(asset); updates.push(id);
    assets.set(id, { ...asset, context: options.context, tags: options.tags.split(",") });
    return {};
  });
  // Search deliberately lags behind writes; real repository caching must reconcile it.
  mock.method(cloudinary.search, "expression", (query: string) => {
    const chain = {
      with_field: () => chain, sort_by: () => chain, max_results: () => chain,
      execute: async () => ({ resources: query.includes("known_old") ? [] : [structuredClone(anchor)] }),
    };
    return chain;
  });
  mock.method(globalThis, "fetch", async () => new Response(new Uint8Array([1])));
  const upload = async (id: string, metres: number, phash: string, note = "8 people trapped on a roof in chest deep flood") => {
    assets.set(id, { public_id: id, resource_type: "image", created_at: new Date(Date.parse(anchor.created_at) + 120_000).toISOString(), bytes: 500, tags: [REPORT_TAG], phash });
    return triage({ publicId: id, resourceType: "image", lat: north(metres), lng: 77.2, locationSource: "gps", note, lang: "en" });
  };
  try {
    const copy = await upload("raahat/reports/test-copy", 40, "aaaaaaaaaaaaaaab");
    assert.equal(copy.duplicateOf, anchor.public_id);
    assert.equal(updates.filter((id) => id === anchor.public_id).length, 0, "forwarded photos must not increase the anchor score");
    assert.equal((await listReports()).find((r) => r.publicId === anchor.public_id)?.corroborations, 0);

    const witness = await upload("raahat/reports/test-witness", 150, "5555555555555555");
    assert.equal(witness.duplicateOf, null);
    assert.equal(witness.needsReview, false);
    const grouped = buildIncidents(await listReports());
    assert.equal(grouped.length, 1);
    assert.equal(grouped[0].radiusM, 800);
    assert.equal(grouped[0].reportIds.length, 2);
    assert.ok(grouped[0].reportIds.includes(anchor.public_id));
    assert.equal((await listReports()).find((r) => r.publicId === anchor.public_id)?.corroborations, 1);

    // Outside the current expanded 800m circle: known photo goes to human review.
    const outside = await upload("raahat/reports/test-outside", 900, "aaaaaaaaaaaaaaab");
    assert.equal(outside.duplicateOf, null);
    assert.equal(outside.needsReview, true);
    assert.ok(outside.reviewReasons.includes(REASON_REUSED_PHOTO));
    assert.equal((await listReports()).find((r) => r.publicId === anchor.public_id)?.corroborations, 1);

    // A secondary hazard on one member must not become a bridge into the group.
    const unrelated = await upload("raahat/reports/test-rescue-only", 150, "f0f0f0f0f0f0f0f0", "8 people trapped on a roof, chest deep water");
    assert.equal(unrelated.corroborations, 0);
    assert.equal((await listReports()).find((r) => r.publicId === witness.publicId)?.corroborations, 1);

    await setStatus(witness.publicId, "image", "resolved");
    const shrunk = buildIncidents(await listReports());
    assert.equal(shrunk[0].id, anchor.public_id);
    assert.ok(shrunk[0].radiusM < grouped[0].radiusM);
    assert.ok(shrunk[0].radiusM >= 200 && shrunk[0].radiusM <= 300);
    assert.equal(shrunk[0].reportIds.length, 1);

    // Moving a duplicate out of the current circle removes its duplicate link.
    const moved = await setLocation(copy.publicId, "image", north(900), 77.2);
    assert.equal(moved.duplicateOf, null);
    assert.equal(moved.needsReview, true);
    assert.ok(moved.reviewReasons.includes(REASON_REUSED_PHOTO));
    assert.equal((await listReports()).length, 5, "all original assets remain available");
  } finally {
    mock.restoreAll();
    if (previousMode === undefined) delete process.env.RAAHAT_AI_MODE;
    else process.env.RAAHAT_AI_MODE = previousMode;
  }
});
