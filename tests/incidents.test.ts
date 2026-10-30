import { test } from "node:test";
import assert from "node:assert/strict";
import { annotateIncidents, buildIncidents } from "../src/lib/incidents";
import { incidentRadiusForScore, matchReport, phashDistance, severityFor } from "../src/lib/triage";
import type { Report } from "../src/lib/types";

const time = "2026-10-31T08:00:00.000Z";
// Move due north by an exact great-circle distance, independently of the matcher.
const north = (metres: number) => 28.6 + metres / 6_371_000 * 180 / Math.PI;
function report(id: string, metres = 0, extra: Partial<Report> = {}): Report {
  const score = extra.score ?? 58;
  return {
    publicId: id, resourceType: "image", createdAt: time, updatedAt: time, channel: "web",
    lat: north(metres), lng: 77.2, locationSource: "gps", placeHint: "", note: "", lang: "en",
    categories: ["flood"], primaryCategory: "flood", score, severity: severityFor(score), breakdown: [],
    peopleVisible: 3, peopleInDanger: true, waterDepth: "waist", accessBlocked: false,
    summary: id, summaryHi: "", status: "new", needsReview: false, reviewReasons: [],
    duplicateOf: null, corroborations: 0, originalBytes: 0, thumbBytes: 0, aiMode: "demo",
    phash: null, reporterHash: null, history: [], ...extra,
  };
}

test("a severe report anchors a 300m group; nearby lower-priority evidence stays intact", () => {
  const originals = [report("seed"), report("inside", 299, { score: 30 }), report("outside", 301, { score: 30 })];
  const copy = structuredClone(originals);
  const incidents = buildIncidents(originals);
  assert.equal(incidents.length, 1);
  assert.deepEqual(incidents[0].reportIds, ["inside", "seed"]);
  assert.equal(incidents[0].radiusM, 300);
  assert.equal(incidents[0].lat, originals[0].lat);
  const annotated = annotateIncidents(originals, incidents);
  assert.equal(annotated[1].incidentId, "seed");
  assert.equal(annotated[2].incidentId, null);
  assert.deepEqual(originals, copy, "grouping must not mutate original reports");
});

test("corroboration alone cannot turn a minor report into an incident anchor", () => {
  assert.deepEqual(buildIncidents([report("minor", 0, { score: 60, corroborations: 5 })]), []);
});

test("an incident cannot expand through a chain of nearby members", () => {
  const incidents = buildIncidents([
    report("anchor", 0, { createdAt: "2026-10-31T07:00:00Z" }),
    report("severe-member", 280),
    report("chain-only", 560, { score: 30 }),
  ]);
  assert.equal(incidents.length, 1);
  assert.deepEqual(incidents[0].reportIds, ["anchor", "severe-member"]);
});

test("reports choose one nearest compatible anchor in overlapping circles", () => {
  const input = [report("first", 0), report("second", 500), report("witness", 280, { score: 30 })];
  const incidents = buildIncidents(input);
  assert.equal(incidents.length, 2);
  assert.deepEqual(incidents.find((i) => i.id === "second")?.reportIds, ["second", "witness"]);
  assert.deepEqual(buildIncidents([...input].reverse()), incidents, "arrival/list order must not change grouping");
});

test("shared collateral damage cannot merge a fire with a flood", () => {
  const flood = report("flood", 0, { categories: ["flood", "road_blocked"] });
  const fire = report("fire", 20, { primaryCategory: "fire", categories: ["fire", "road_blocked"] });
  assert.equal(buildIncidents([flood, fire]).length, 2);
  assert.deepEqual(matchReport({ ...fire, phash: null }, [flood]).corroborates, []);
});

test("a shared primary hazard connects a rescue report with flood evidence", () => {
  const seed = report("rescue", 0, { primaryCategory: "trapped_or_injured", categories: ["trapped_or_injured", "flood"] });
  const evidence = report("water", 60, { score: 30 });
  assert.deepEqual(buildIncidents([seed, evidence])[0].reportIds, ["rescue", "water"]);
});

test("old, missing, invalid, closed, duplicate and flagged reports do not enter a group", () => {
  const excluded = [
    report("late", 10, { score: 30, createdAt: "2026-10-31T20:00:01Z" }),
    report("missing", 0, { lat: null }), report("invalid", 0, { lat: Number.NaN }),
    report("bad-time", 0, { createdAt: "invalid" }), report("resolved", 0, { status: "resolved" }),
    report("rejected", 0, { status: "rejected" }), report("copy", 0, { duplicateOf: "seed" }),
    report("review", 0, { needsReview: true }), report("ordinary", 0, { primaryCategory: "no_emergency", categories: ["no_emergency"] }),
  ];
  assert.deepEqual(buildIncidents([report("seed"), ...excluded])[0].reportIds, ["seed"]);
});

test("priority is the strongest original report, not a sum of scores", () => {
  const incidents = buildIncidents([report("seed", 0, { score: 50, createdAt: "2026-10-31T07:00:00Z" }), report("worse", 30, { score: 90 })]);
  assert.equal(incidents[0].id, "seed");
  assert.equal(incidents[0].score, 90);
  assert.equal(incidents[0].severity, "critical");
});

test("pinning or resolving a report recalculates membership without moving the anchor", () => {
  const seed = report("seed");
  const missing = report("evidence", 50, { score: 30, lat: null });
  assert.equal(buildIncidents([seed, missing])[0].reportIds.length, 1);
  const located = { ...missing, lat: north(50) };
  assert.equal(buildIncidents([seed, located])[0].reportIds.length, 2);
  assert.equal(buildIncidents([seed, { ...located, lat: north(600) }])[0].reportIds.length, 1);
  assert.equal(buildIncidents([seed, { ...located, status: "resolved" }])[0].reportIds.length, 1);
});

test("the same photo outside 300m or 12h is not merged with an incident", () => {
  const seed = report("seed", 0, { phash: "aaaaaaaaaaaaaaaa" });
  const outside = report("outside", 301, { phash: seed.phash });
  const old = { ...outside, lat: seed.lat, createdAt: "2026-10-31T20:00:01Z" };
  assert.equal(matchReport(outside, [seed]).duplicateOf, null);
  assert.equal(matchReport(old, [seed]).duplicateOf, null);
  assert.equal(matchReport({ ...outside, lat: north(100) }, [seed]).duplicateOf, "seed");
  assert.equal(matchReport({ ...outside, createdAt: "invalid" }, [seed]).duplicateOf, null);
});

test("invalid image hashes cannot be used to merge unrelated evidence", () => {
  assert.equal(phashDistance("zzzz", "xxxx"), Infinity);
  assert.equal(phashDistance("", ""), Infinity);
});


test("radius grows and shrinks with the strongest active evidence", () => {
  const seed = report("seed", 0, { score: 50, createdAt: "2026-10-31T07:00:00Z" });
  const worse = report("worse", 200, { score: 90 });
  const edge = report("edge", 500, { score: 30 });
  const outside = report("outside", 700, { score: 30 });
  const before = buildIncidents([seed, edge, outside]);
  assert.equal(before[0].radiusM, 250);
  assert.deepEqual(before[0].reportIds, ["seed"]);
  const expanded = buildIncidents([seed, worse, edge, outside]);
  assert.equal(expanded[0].radiusM, 675);
  assert.ok(expanded[0].reportIds.includes("edge"));
  assert.ok(!expanded[0].reportIds.includes("outside"));
  const shrunk = buildIncidents([seed, { ...worse, status: "resolved" }, edge, outside]);
  assert.equal(shrunk[0].radiusM, 250);
  assert.equal(shrunk[0].id, expanded[0].id);
  assert.equal(shrunk[0].lat, expanded[0].lat);
  assert.deepEqual(shrunk[0].reportIds, ["seed"]);
});

test("severity cannot bootstrap an outside report into an existing circle", () => {
  const groups = buildIncidents([
    report("seed", 0, { score: 50, createdAt: "2026-10-31T07:00:00Z" }),
    report("outside-critical", 300, { score: 100 }),
  ]);
  assert.equal(groups.length, 2);
  assert.equal(groups.find((g) => g.id === "seed")?.radiusM, 250);
});

test("radius is bounded and nondecreasing across severity scores", () => {
  const radii = Array.from({ length: 101 }, (_, score) => incidentRadiusForScore(score));
  assert.equal(incidentRadiusForScore(45), 200);
  assert.equal(incidentRadiusForScore(70), 400);
  assert.equal(incidentRadiusForScore(100), 800);
  assert.ok(radii.every((radius, i) => radius >= 75 && radius <= 800 && (!i || radius >= radii[i - 1])));
  assert.equal(incidentRadiusForScore(Number.NaN), 75);
});

test("corroboration uses the current incident boundary rather than a member's radius", () => {
  const member = { ...report("member", 200), incidentLat: north(0), incidentLng: 77.2, incidentRadiusM: 250, incidentCreatedAt: time };
  assert.deepEqual(matchReport(report("outside", 350, { score: 30 }), [member]).corroborates, []);
  assert.deepEqual(matchReport(report("inside", 100, { score: 30 }), [member]).corroborates, ["member"]);
  assert.deepEqual(matchReport(report("expanded", 500, { score: 30 }), [{ ...member, incidentRadiusM: 675 }]).corroborates, ["member"]);
});
