import { test } from "node:test";
import assert from "node:assert/strict";
import { REASON_NOT_REAL } from "../src/lib/triage";
import { factCheck, publicIdsFrom, shortId } from "../src/lib/verify";
import type { HistoryEntry } from "../src/lib/types";

const filed: HistoryEntry = { action: "filed", at: "2026-10-29T08:00:00.000Z" };
const verified: HistoryEntry = { action: "verified", at: "2026-10-29T08:20:00.000Z" };
const base = { status: "new" as const, history: [filed], reviewReasons: [] as string[], corroborations: 0 };

test("only a control-room action earns the verified badge", () => {
  assert.equal(factCheck(base).verdict, "pending");
  // Triage marks duplicates "verified" on its own; without a human action it stays pending.
  assert.equal(factCheck({ ...base, status: "verified" }).verdict, "pending");
  const v = factCheck({ ...base, status: "verified", history: [filed, verified] });
  assert.equal(v.verdict, "verified");
  assert.equal(v.verifiedAt, verified.at);
  assert.equal(factCheck({ ...base, status: "dispatched", history: [filed, { action: "dispatched", at: verified.at }] }).verdict, "verified");
});

test("reopened or rejected reports lose the badge", () => {
  assert.equal(factCheck({ ...base, status: "new", history: [filed, verified, { action: "new", at: verified.at }] }).verdict, "pending");
  assert.equal(factCheck({ ...base, status: "rejected", history: [filed, verified] }).verdict, "false");
});

test("checks reflect review reasons and corroboration without exposing them", () => {
  const fc = factCheck({ ...base, reviewReasons: ["Matches an older photo: Assam floods, 2022", REASON_NOT_REAL], corroborations: 2 });
  const byLabel = Object.fromEntries(fc.checks.map((c) => [c.label, c.result]));
  assert.equal(byLabel["Matches a known old disaster photo"], "fail");
  assert.equal(byLabel["Looks like a screenshot, edit or photo of a screen"], "fail");
  assert.equal(byLabel["Photo date matches the report (when the camera recorded one)"], "pass");
  assert.equal(byLabel["2 other people reported the same incident nearby"], "pass");
  assert.equal(byLabel["Not checked by a control-room responder yet"], "open");
  assert.ok(!fc.checks.some((c) => c.label.includes("Assam")), "captions and reasons stay private");
});

test("short ids round-trip and reject anything else", () => {
  assert.equal(shortId("raahat/reports/tg_ab12_1700000000000"), "tg_ab12_1700000000000");
  assert.deepEqual(publicIdsFrom("tg_ab12_1700000000000"), ["raahat/reports/tg_ab12_1700000000000", "tg_ab12_1700000000000"]);
  assert.deepEqual(publicIdsFrom("../secret"), []);
  assert.deepEqual(publicIdsFrom("a/b"), []);
  assert.deepEqual(publicIdsFrom(""), []);
});
