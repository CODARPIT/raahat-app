import { test } from "node:test";
import assert from "node:assert/strict";
import { assignAll, unitFor, type DispatchReport } from "../src/lib/dispatch";
import type { Severity, Status } from "../src/lib/types";

// Next to the ITO demo centre. Nearest after ITO: Kashmere Gate (~4.5 km),
// Mayur Vihar (~5.9 km), Lajpat Nagar (~6.8 km), Dwarka (~19 km).
let n = 0;
function report(severity: Severity, status: Status = "verified", over: Partial<DispatchReport> = {}): DispatchReport {
  n += 1;
  return {
    publicId: `r${n}`,
    severity,
    score: { critical: 80, high: 60, moderate: 35, low: 15 }[severity],
    status,
    createdAt: `2026-10-31T10:${String(n).padStart(2, "0")}:00Z`,
    lat: 28.63,
    lng: 77.24,
    primaryCategory: "trapped_or_injured",
    categories: ["trapped_or_injured"],
    duplicateOf: null,
    ...over,
  };
}
const centreOf = (out: ReturnType<typeof assignAll>, id: string) => out.assignments.find((a) => a.publicId === id)?.centreId;

test("critical gets the nearest unit, even before verification", () => {
  const r = report("critical", "new");
  const out = assignAll([r]);
  assert.equal(centreOf(out, r.publicId), "ito");
  assert.equal(out.assignments[0].unverified, true);
});

test("a less urgent report leaves the nearest centre's last unit for critical calls", () => {
  const a = report("moderate");
  const b = report("moderate");
  const out = assignAll([a, b]);
  assert.equal(centreOf(out, a.publicId), "ito"); // ITO had 2 ambulances to spare one
  assert.equal(centreOf(out, b.publicId), "kashmere"); // ITO's last one is kept
  assert.match(out.assignments[1].reason, /ITO is nearer/);
});

test("low severity goes to a centre with plenty of units, further away", () => {
  const r = report("low");
  assert.equal(centreOf(assignAll([r]), r.publicId), "lajpat");
});

test("a new critical report takes over a unit from a less urgent one", () => {
  const moderate = report("moderate");
  const c1 = report("critical");
  const c2 = report("critical");
  const out = assignAll([moderate, c1, c2]);
  assert.equal(centreOf(out, c1.publicId), "ito");
  assert.equal(centreOf(out, c2.publicId), "ito");
  assert.equal(centreOf(out, moderate.publicId), "kashmere");
});

test("unverified, closed, duplicate and out-of-range reports", () => {
  const waiting = report("high", "new");
  const resolved = report("critical", "resolved");
  const dup = report("critical", "new", { duplicateOf: "r1" });
  const far = report("high", "verified", { lat: 29.0, lng: 77.7 });
  const out = assignAll([waiting, resolved, dup, far]);
  assert.equal(out.assignments.find((a) => a.publicId === waiting.publicId)?.state, "waiting_verification");
  assert.equal(out.assignments.find((a) => a.publicId === far.publicId)?.state, "queued");
  assert.equal(out.assignments.length, 2);
});

test("the unit matches the hazard", () => {
  assert.equal(unitFor({ primaryCategory: "fire", categories: ["fire"] }), "fire");
  assert.equal(unitFor({ primaryCategory: "trapped_or_injured", categories: ["trapped_or_injured"] }), "ambulance");
  assert.equal(unitFor({ primaryCategory: "trapped_or_injured", categories: ["trapped_or_injured", "flood"] }), "rescue");
  assert.equal(unitFor({ primaryCategory: "structural_collapse", categories: ["structural_collapse"] }), "rescue");
});
