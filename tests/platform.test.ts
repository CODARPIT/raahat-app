import { test } from "node:test";
import assert from "node:assert/strict";
import { addHistory, decodeHistory, encodeHistory, HISTORY_MAX } from "../src/lib/history";
import { createLimiter } from "../src/lib/rate-limit";
import { knownOldReason, scoreReport } from "../src/lib/triage";
import { reportsToCsv } from "../src/lib/sitrep";
import type { Report } from "../src/lib/types";
import { NOT_ASSESSED } from "../src/lib/image-review";

// ── Known old photos ─────────────────────────────────────────────────────────

const LIBRARY = [
  { phash: "a1b2c3d4e5f60718", caption: "Bihar floods, August 2017" },
  { phash: "0f0f0f0f0f0f0f0f", caption: "Chennai floods, December 2015" },
];

test("a forwarded copy of a known old photo is flagged with its real origin", () => {
  assert.equal(knownOldReason("a1b2c3d4e5f60719", LIBRARY), "Matches an older photo: Bihar floods, August 2017");
  assert.equal(knownOldReason("ffff0000ffff0000", LIBRARY), null);
  assert.equal(knownOldReason(null, LIBRARY), null);
  assert.equal(knownOldReason("a1b2c3d4e5f60719", []), null);
});

test("a known old photo sinks to human review instead of the top of the queue", () => {
  const findings = { categories: ["trapped_or_injured" as const], isRealPhoto: true, isDisasterRelated: true, peopleVisible: 8, peopleInDanger: true, waterDepth: "chest_or_more" as const, accessBlocked: true, summary: "", summaryHi: "", placeNames: [], mode: "live" as const };
  const fresh = scoreReport({ findings, corroborations: 0, reviewReasons: [] });
  const recycled = scoreReport({ findings, corroborations: 0, reviewReasons: [knownOldReason("a1b2c3d4e5f60718", LIBRARY)!] });
  assert.equal(fresh.severity, "critical");
  assert.equal(recycled.needsReview, true);
  assert.ok(recycled.score < 45, `got ${recycled.score}`);
});

// ── Audit trail ──────────────────────────────────────────────────────────────

test("audit trail round-trips through its compact stored form", () => {
  let h = addHistory([], "filed", new Date("2025-10-24T10:00:00Z"));
  h = addHistory(h, "pinned", new Date("2025-10-24T10:03:00Z"));
  h = addHistory(h, "dispatched", new Date("2025-10-24T10:05:30Z"));
  const raw = encodeHistory(h);
  assert.equal(raw, "filed@1761300000,pinned@1761300180,dispatched@1761300330");
  assert.deepEqual(decodeHistory(raw), h);
});

test("audit trail ignores junk and keeps only the latest entries", () => {
  assert.deepEqual(decodeHistory("filed@1761300000,hacked@1,verified@abc,,"), [{ action: "filed", at: "2025-10-24T10:00:00.000Z" }]);
  let h = addHistory([], "filed");
  for (let i = 0; i < 30; i++) h = addHistory(h, i % 2 ? "verified" : "dispatched");
  assert.equal(h.length, HISTORY_MAX);
  assert.equal(h[0].action === "filed", false);
});

// ── Rate limiting ────────────────────────────────────────────────────────────

test("rate limiter allows a burst, then blocks until the window resets", () => {
  let t = 0;
  const check = createLimiter({ max: 3, windowMs: 60_000 }, () => t);
  assert.ok(check("ip1").ok && check("ip1").ok && check("ip1").ok);
  const blocked = check("ip1");
  assert.equal(blocked.ok, false);
  assert.equal(blocked.retryAfter, 60);
  assert.ok(check("ip2").ok, "other callers are unaffected");
  t = 60_000;
  assert.ok(check("ip1").ok, "a new window starts fresh");
});

// ── Situation report export ──────────────────────────────────────────────────

function report(over: Partial<Report>): Report {
  return {
    publicId: "raahat/reports/a", resourceType: "image", createdAt: "2026-10-24T10:00:00Z", updatedAt: "2026-10-24T10:00:00Z",
    channel: "web", lat: 26.1445, lng: 91.7362, locationSource: "gps", placeHint: "", note: "", lang: "en",
    categories: ["flood"], primaryCategory: "flood", severity: "moderate", score: 30, breakdown: [],
    peopleVisible: 2, peopleInDanger: false, waterDepth: "knee", accessBlocked: false, summary: "Water in the lane", summaryHi: "",
    status: "new", needsReview: false, reviewReasons: [], duplicateOf: null, corroborations: 0,
    originalBytes: 0, thumbBytes: 0, aiMode: "live", phash: null, reporterHash: null, history: [], imageReview: NOT_ASSESSED, ...over,
  };
}

test("CSV export escapes commas, quotes and formula-looking cells", () => {
  const csv = reportsToCsv([
    report({ summary: 'Wall fell, "big" crack', note: "=HYPERLINK(\"x\")" }),
    report({ publicId: "b", lat: null, lng: null, locationSource: "missing", placeHint: "Shiv Mandir, Rampur" }),
  ]);
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0], /^Priority,Score,Severity,Category,Status/);
  assert.match(lines[1], /"Wall fell, ""big"" crack"/);
  assert.match(lines[1], /"'=HYPERLINK\(""x""\)"/); // neutralised so Excel won't run it
  assert.match(lines[2], /"Shiv Mandir, Rampur"/);
  assert.match(lines[2], /,No location,/);
});
