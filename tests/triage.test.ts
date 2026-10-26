import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coarsen,
  haversineMeters,
  matchReport,
  phashDistance,
  primaryCategory,
  scoreReport,
  severityFor,
  type Candidate,
} from "../src/lib/triage";
import { encodeOverlayText } from "../src/lib/cld-url";
import { demoFindings, findingsFromLive, parseJsonReply } from "../src/lib/vision";
import type { VisionFindings } from "../src/lib/types";

const base: VisionFindings = {
  categories: ["flood"],
  isRealPhoto: true,
  isDisasterRelated: true,
  peopleVisible: 0,
  peopleInDanger: false,
  waterDepth: "knee",
  accessBlocked: false,
  summary: "",
  summaryHi: "",
  mode: "live",
};

test("people in danger outrank property damage", () => {
  const trapped = scoreReport({ findings: { ...base, categories: ["trapped_or_injured", "flood"], peopleInDanger: true, peopleVisible: 6, waterDepth: "chest_or_more" }, corroborations: 0 });
  const wall = scoreReport({ findings: { ...base, categories: ["structural_collapse"], waterDepth: "none" }, corroborations: 0 });
  assert.equal(trapped.severity, "critical");
  assert.ok(trapped.score > wall.score);
  assert.equal(trapped.primaryCategory, "trapped_or_injured");
});

test("flood plus live wire scores above flood alone", () => {
  const flood = scoreReport({ findings: base, corroborations: 0 });
  const both = scoreReport({ findings: { ...base, categories: ["flood", "electrical_hazard"] }, corroborations: 0 });
  assert.ok(both.score > flood.score);
  assert.equal(both.primaryCategory, "electrical_hazard");
});

test("corroboration raises the score, capped at five", () => {
  const one = scoreReport({ findings: base, corroborations: 0 }).score;
  const three = scoreReport({ findings: base, corroborations: 3 }).score;
  const fifty = scoreReport({ findings: base, corroborations: 50 }).score;
  assert.equal(three - one, 12);
  assert.equal(fifty, scoreReport({ findings: base, corroborations: 5 }).score);
});

test("screenshots and unrelated images are flagged and sink", () => {
  const fake = scoreReport({ findings: { ...base, categories: ["trapped_or_injured"], peopleInDanger: true, isRealPhoto: false }, corroborations: 0 });
  assert.equal(fake.needsReview, true);
  assert.ok(fake.score < 45);
});

test("no_emergency never goes above low", () => {
  const r = scoreReport({ findings: { ...base, categories: ["no_emergency"], peopleVisible: 10 }, corroborations: 0 });
  assert.equal(r.severity, "low");
  assert.equal(primaryCategory(["no_emergency"]), "no_emergency");
});

test("severity bands", () => {
  assert.equal(severityFor(70), "critical");
  assert.equal(severityFor(69), "high");
  assert.equal(severityFor(45), "high");
  assert.equal(severityFor(25), "moderate");
  assert.equal(severityFor(24), "low");
});

test("score stays within 0–100", () => {
  const max = scoreReport({
    findings: { ...base, categories: ["trapped_or_injured", "fire", "structural_collapse", "electrical_hazard"], peopleInDanger: true, peopleVisible: 99, waterDepth: "chest_or_more", accessBlocked: true },
    corroborations: 99,
  });
  assert.equal(max.score, 100);
});

test("haversine and coarsening", () => {
  const d = haversineMeters(28.6139, 77.209, 28.6139, 77.219); // ~0.01° lng at Delhi ≈ 977 m
  assert.ok(d > 950 && d < 1000, `got ${d}`);
  assert.equal(coarsen(28.613949), 28.614);
});

test("phash distance", () => {
  assert.equal(phashDistance("ffffffffffffffff", "ffffffffffffffff"), 0);
  assert.equal(phashDistance("0000000000000000", "000000000000000f"), 4);
  assert.equal(phashDistance("0000000000000000", "ffffffffffffffff"), 64);
  assert.equal(phashDistance("00", "000"), Number.POSITIVE_INFINITY);
});

const now = "2026-10-24T10:00:00Z";
const existing: Candidate[] = [
  { publicId: "a", lat: 26.1445, lng: 91.7362, phash: "a1b2c3d4e5f60718", primaryCategory: "trapped_or_injured", createdAt: "2026-10-24T08:00:00Z", duplicateOf: null },
  { publicId: "b", lat: 26.1450, lng: 91.7366, phash: "0f0f0f0f0f0f0f0f", primaryCategory: "flood", createdAt: "2026-10-24T09:00:00Z", duplicateOf: null },
  { publicId: "c", lat: 26.1445, lng: 91.7362, phash: "a1b2c3d4e5f60718", primaryCategory: "trapped_or_injured", createdAt: "2026-10-24T09:30:00Z", duplicateOf: "a" },
];

test("a forwarded copy of the same photo is a duplicate of the earliest primary", () => {
  const m = matchReport({ lat: 26.15, lng: 91.74, phash: "a1b2c3d4e5f60719", primaryCategory: "trapped_or_injured", createdAt: now }, existing);
  assert.equal(m.duplicateOf, "a");
  assert.deepEqual(m.corroborates, []);
});

test("a different photo of the same incident corroborates it", () => {
  const m = matchReport({ lat: 26.1451, lng: 91.7367, phash: "ffff0000ffff0000", primaryCategory: "flood", createdAt: now }, existing);
  assert.equal(m.duplicateOf, null);
  assert.deepEqual(m.corroborates, ["b"]);
});

test("same category far away or long ago does not corroborate", () => {
  const far = matchReport({ lat: 28.6, lng: 77.2, phash: null, primaryCategory: "flood", createdAt: now }, existing);
  const old = matchReport({ lat: 26.145, lng: 91.7366, phash: null, primaryCategory: "flood", createdAt: "2026-10-25T09:00:01Z" }, existing);
  assert.deepEqual(far.corroborates, []);
  assert.deepEqual(old.corroborates, []);
});

test("JSON is extracted from a chatty model reply", () => {
  const j = parseJsonReply('Sure! Here it is:\n```json\n{"people_visible": 3, "water_depth": "waist"}\n```');
  assert.deepEqual(j, { people_visible: 3, water_depth: "waist" });
  assert.equal(parseJsonReply("no json here"), null);
});

test("live findings are sanitised", () => {
  const f = findingsFromLive(["flood", "made_up_tag"], { people_visible: "4.6", water_depth: "neck", people_in_danger: true });
  assert.deepEqual(f.categories, ["flood"]);
  assert.equal(f.peopleVisible, 5);
  assert.equal(f.waterDepth, "unknown");
  assert.equal(f.peopleInDanger, true);
  assert.equal(findingsFromLive([], null).categories[0], "no_emergency");
});

test("demo triage understands Hindi and English notes", () => {
  const hi = demoFindings("बिजली का तार पानी में गिरा है, बाढ़ है, कमर तक पानी");
  assert.ok(hi.categories.includes("electrical_hazard"));
  assert.ok(hi.categories.includes("flood"));
  assert.equal(hi.waterDepth, "waist");
  assert.equal(hi.peopleInDanger, true);
  const en = demoFindings("Two families stuck on the roof, 8 people");
  assert.ok(en.categories.includes("trapped_or_injured"));
  assert.equal(en.peopleVisible, 8);
  assert.equal(demoFindings("lol").categories[0], "no_emergency");
});

test("overlay text escapes commas and slashes for Cloudinary", () => {
  assert.equal(encodeOverlayText("Flood, 2/3 lanes"), "Flood%252C%202%252F3%20lanes");
});
