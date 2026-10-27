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
import { alertCardUrl, encodeOverlayText } from "../src/lib/cld-url";
import { exifDate, exifLocation, oldPhotoReason, parseCoordinate } from "../src/lib/exif";
import { mergeReports } from "../src/lib/merge";
import { placeHint, placesFromNote } from "../src/lib/place";
import { demoFindings, findingsFromLive, getFindings, parseJsonReply } from "../src/lib/vision";
import type { Report, VisionFindings } from "../src/lib/types";

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
  placeNames: [],
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

test("demo triage recognises storm, crowd, medical and gas reports", () => {
  assert.ok(demoFindings("Cyclone tore the roofs off, trees uprooted").categories.includes("storm_damage"));
  const crowd = demoFindings("भगदड़ मच गई, बहुत भीड़ है");
  assert.ok(crowd.categories.includes("crowd_crush"));
  assert.equal(crowd.peopleInDanger, true);
  assert.ok(demoFindings("Old man unconscious, need ambulance").categories.includes("medical_emergency"));
  assert.ok(demoFindings("गैस सिलेंडर से रिसाव, smell everywhere").categories.includes("gas_or_chemical_leak"));
});

test("new life-safety types outrank property damage", () => {
  const storm = scoreReport({ findings: { ...base, categories: ["storm_damage"], waterDepth: "none" }, corroborations: 0 });
  for (const c of ["crowd_crush", "gas_or_chemical_leak", "medical_emergency"] as const) {
    const r = scoreReport({ findings: { ...base, categories: [c], waterDepth: "none" }, corroborations: 0 });
    assert.equal(r.primaryCategory, c);
    assert.ok(r.score > storm.score);
  }
});

test("overlay text escapes commas and slashes for Cloudinary", () => {
  assert.equal(encodeOverlayText("Flood, 2/3 lanes"), "Flood%252C%202%252F3%20lanes");
});

// ── v2: explainable score ────────────────────────────────────────────────────

test("breakdown lines add up to the score", () => {
  const findings: VisionFindings = { ...base, categories: ["trapped_or_injured", "flood"], peopleInDanger: true, peopleVisible: 3, waterDepth: "waist", accessBlocked: true };
  const r = scoreReport({ findings, corroborations: 2 });
  const adds = r.breakdown.filter((l) => l.kind === "add");
  const raw = adds.reduce((s, l) => s + l.points, 0);
  // 40 trapped + 5 flood + 30 danger + 4.5 people + 15 waist + 5 access + 8 corroboration
  assert.equal(raw, 107.5);
  assert.equal(r.score, 100);
  assert.deepEqual(adds.map((l) => l.label), [
    "People trapped or injured", "Also flooding", "Someone in danger", "3 people visible",
    "Waist-deep water", "Vehicles can't reach", "2 other reports of this incident",
  ]);
  assert.equal(r.breakdown.at(-1)?.label, "Capped at 100");
  assert.equal(Math.round(r.breakdown.reduce((s, l) => s + l.points, 0)), r.score);
});

test("review reasons multiply the score by 0.3 and say why", () => {
  const r = scoreReport({ findings: { ...base, categories: ["fire"], waterDepth: "none" }, corroborations: 0, reviewReasons: ["Photo taken on 3 Jul 2017"] });
  assert.equal(r.needsReview, true);
  assert.equal(r.score, Math.round(35 * 0.3));
  const adjust = r.breakdown.find((l) => l.kind === "adjust");
  assert.match(adjust!.label, /Photo taken on 3 Jul 2017 ×0.3/);
  assert.equal(Math.round(r.breakdown.reduce((s, l) => s + l.points, 0)), r.score);
});

// ── v2: missing locations ────────────────────────────────────────────────────

test("a report without location can still be a duplicate via phash", () => {
  const m = matchReport({ lat: null, lng: null, phash: "a1b2c3d4e5f60719", primaryCategory: "trapped_or_injured", createdAt: now }, existing);
  assert.equal(m.duplicateOf, "a");
});

test("a report without location never corroborates, and is never corroborated", () => {
  const m = matchReport({ lat: null, lng: null, phash: "ffff0000ffff0000", primaryCategory: "flood", createdAt: now }, existing);
  assert.deepEqual(m, { duplicateOf: null, corroborates: [] });
  const unlocated: Candidate[] = [{ publicId: "u", lat: null, lng: null, phash: null, primaryCategory: "flood", createdAt: now, duplicateOf: null }];
  assert.deepEqual(matchReport({ lat: 26.145, lng: 91.7366, phash: null, primaryCategory: "flood", createdAt: now }, unlocated).corroborates, []);
});

function report(over: Partial<Report> = {}): Report {
  return {
    publicId: "r1", resourceType: "image", createdAt: "2026-10-24T10:00:00Z", updatedAt: "2026-10-24T10:00:00Z",
    channel: "web", lat: 26.14, lng: 91.73, locationSource: "gps", placeHint: "", note: "", lang: "en",
    categories: ["flood"], primaryCategory: "flood", severity: "low", score: 20, breakdown: [],
    peopleVisible: 0, peopleInDanger: false, waterDepth: "unknown", accessBlocked: false, summary: "flood", summaryHi: "",
    status: "new", needsReview: false, reviewReasons: [], duplicateOf: null, corroborations: 0,
    originalBytes: 0, thumbBytes: 0, aiMode: "demo", phash: null, reporterHash: null, history: [], ...over,
  };
}

test("alert card says the location is pending", () => {
  assert.match(alertCardUrl(report({ lat: null, lng: null })), /Location%20pending/);
});

// ── v2: consistency cache ────────────────────────────────────────────────────

test("merged list prefers the newer cached copy over a stale Search copy", () => {
  const searched = [report({ status: "new", updatedAt: "2026-10-24T10:00:00Z" }), report({ publicId: "r2" })];
  const cached = [report({ status: "dispatched", updatedAt: "2026-10-24T10:05:00Z" }), report({ publicId: "r3", createdAt: "2026-10-24T11:00:00Z" })];
  const merged = mergeReports(searched, cached);
  assert.equal(merged.find((r) => r.publicId === "r1")?.status, "dispatched");
  // Newest first; the just-triaged r3 shows up before Search has indexed it.
  assert.deepEqual(merged.map((r) => r.publicId), ["r3", "r1", "r2"]);
});

test("a newer Search copy (written by another instance) beats an older cached one", () => {
  const merged = mergeReports(
    [report({ status: "resolved", updatedAt: "2026-10-24T12:00:00Z" })],
    [report({ status: "new", updatedAt: "2026-10-24T10:00:00Z" })],
  );
  assert.equal(merged[0].status, "resolved");
});

// ── v2: EXIF ─────────────────────────────────────────────────────────────────

test("EXIF date older than 7 days adds a review reason", () => {
  const reported = new Date("2026-10-24T10:00:00Z");
  assert.equal(oldPhotoReason(exifDate({ DateTimeOriginal: "2017:07:03 09:12:00" }), reported), "Photo taken on 3 Jul 2017");
  assert.equal(oldPhotoReason(exifDate({ DateTimeOriginal: "2026:10:22 18:00:00" }), reported), null);
  assert.equal(oldPhotoReason(exifDate({}), reported), null);
  assert.equal(exifDate({ DateTimeOriginal: "0000:00:00 00:00:00" }), null);
});

test("EXIF GPS is read from degrees-minutes-seconds", () => {
  assert.ok(Math.abs(parseCoordinate(`26 deg 8' 40.20" N`)! - 26.1445) < 1e-4);
  assert.ok(Math.abs(parseCoordinate(`77 deg 12' 32.40" W`)! + 77.209) < 1e-4);
  assert.equal(parseCoordinate("28.5", "S"), -28.5);
  assert.equal(exifLocation({ GPSLatitude: "0", GPSLongitude: "0" }), null);
  const loc = exifLocation({ GPSLatitude: `26 deg 8' 40.20" N`, GPSLongitude: `91 deg 44' 10.32" E` });
  assert.ok(loc && Math.abs(loc.lng - 91.7362) < 1e-4);
});

// ── v2: place hints ──────────────────────────────────────────────────────────

test("place hints come from English and Hindi notes", () => {
  assert.deepEqual(placesFromNote("Water up to the waist near Gandhi School, 2 families on the roof"), ["Gandhi School"]);
  assert.ok(placesFromNote("कमर तक पानी, मंदिर के पास 2 परिवार फँसे हैं").includes("मंदिर"));
  assert.ok(placesFromNote("Stuck opposite the bus stand where water is rising").includes("bus stand"));
  assert.deepEqual(placesFromNote("water everywhere, please help"), []);
});

test("place hint merges note, description and photo without repeats", () => {
  assert.equal(placeHint("near Gandhi School", "Gandhi School, Rampur", ["GANDHI SCHOOL", "Shiv Mandir"]), "Gandhi School, Rampur, Shiv Mandir");
});

// ── v2: AI timeout ───────────────────────────────────────────────────────────

test("AI timeout falls back to rule-based mode", async () => {
  // Fake credentials only: the fetch below never leaves the process.
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = "test_cloud";
  process.env.NEXT_PUBLIC_CLOUDINARY_API_KEY = "test_key";
  process.env.CLOUDINARY_API_SECRET = "test_secret";
  const hang = ((_url: string, init?: RequestInit) =>
    new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
  const started = Date.now();
  const f = await getFindings("https://example.invalid/x.jpg", "Two families stuck on the roof", { mode: "auto", timeoutMs: 30, fetchImpl: hang });
  assert.equal(f.mode, "demo");
  assert.ok(f.categories.includes("trapped_or_injured"));
  assert.ok(Date.now() - started < 1000);
  await assert.rejects(getFindings("https://example.invalid/x.jpg", "", { mode: "live", timeoutMs: 30, fetchImpl: hang }), /timed out/);
});

test("place names from the AI are sanitised", () => {
  const f = findingsFromLive(["flood"], { place_names: ["Gandhi School", 7, " ", "x".repeat(99)] });
  assert.deepEqual(f.placeNames, ["Gandhi School", "x".repeat(60)]);
});
