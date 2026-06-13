// Grader gate — machine-verifiable via `node --test`. BUILT DURING BUILD DAY.
// Mirrors selftest.ts as assertions (selftest.ts is the human-readable render).

import { test } from "node:test";
import assert from "node:assert/strict";

import { loadGoldset } from "./csv.ts";
import { grade, goldAsPredictions } from "./grade.ts";
import { lenderMatches, channelMatches, requiredCoreTokens } from "./normalize.ts";
import type { Prediction } from "./types.ts";

const gold = loadGoldset();
const DOC = {
  mcon_300w44: "2025121200273005",
  deed_300w44: "2025121200273001",
  blanket_169w83: "2025121700383001",
  cema_204avea: "2025121500444030",
  webster: "2025120401159003",
  peapack: "2026031300594005",
  wilmington: "2024111900621001",
};

function mutate(docId: string, fn: (p: Prediction) => Prediction): Prediction[] {
  return goldAsPredictions(gold).map((p) => (p.document_id === docId ? fn({ ...p }) : p));
}
function failedDocs(preds: Prediction[]): string[] {
  return grade(gold, preds).rows.filter((r) => !r.pass).map((r) => r.document_id);
}

test("fixture shape: 17 rows, 11 amount_reliable=true", () => {
  assert.equal(gold.length, 17);
  assert.equal(gold.filter((r) => r.amount_reliable).length, 11);
  // 1010340037 appears twice (deed + M&CON) — bbl is NOT unique.
  assert.equal(gold.filter((r) => r.bbl === "1010340037").length, 2);
  // 3 rows have empty bbl by design.
  assert.equal(gold.filter((r) => r.bbl === "").length, 3);
});

test("CLEAN fixture self-passes 17/17", () => {
  const r = grade(gold, goldAsPredictions(gold));
  assert.ok(r.allPass, JSON.stringify(r.rows.filter((x) => !x.pass), null, 2));
  assert.equal(r.passed, 17);
});

const perturbations: Array<[string, string, (p: Prediction) => Prediction]> = [
  ["P1 bbl-only-join (deed amount)", DOC.deed_300w44, (p) => ({ ...p, amount: 104000000 })],
  ["P2 empty-BBL match (204 Ave A amount)", DOC.cema_204avea, (p) => ({ ...p, amount: 6556000 })],
  ["P3 dollar in blanket row", DOC.blanket_169w83, (p) => ({ ...p, amount: 3160000 })],
  ["P4 channel missing hyphen", DOC.webster, (p) => ({ ...p, channel: "regional bank balance sheet" })],
  ["P5 WILMINGTON alone", DOC.wilmington, (p) => ({ ...p, lender: "WILMINGTON" })],
  ["P6 Peapack lender wrong", DOC.peapack, (p) => ({ ...p, lender: "WEBSTER" })],
  ["P7 Peapack usable amount", DOC.peapack, (p) => ({ ...p, amount: 5000000 })],
  ["P8 Peapack classification wrong", DOC.peapack, (p) => ({ ...p, classification: "takeout_new_securitization" })],
  ["P9 blanket whiff (empty classification)", DOC.blanket_169w83, (p) => ({ ...p, classification: "" })],
];

for (const [name, docId, fn] of perturbations) {
  test(`perturbation ${name} fails ONLY its intended row`, () => {
    assert.deepEqual(failedDocs(mutate(docId, fn)), [docId]);
  });
}

test("note-column rule: rows whose note carries $ figures still PASS (§6)", () => {
  const r = grade(gold, goldAsPredictions(gold));
  for (const doc of [DOC.blanket_169w83, "2016122701566007" /* 1384 Broadway */]) {
    assert.ok(r.rows.find((x) => x.document_id === doc)!.pass);
  }
});

test("lender normalization: core tokens and collision guard (§4)", () => {
  assert.deepEqual(requiredCoreTokens("WILMINGTON TRUST, NATIONAL ASSOCIATION, AS TRUSTEE"), ["WILMINGTON", "TRUST"]);
  assert.deepEqual(requiredCoreTokens("WEBSTER BANK, NATIONAL ASSOCIATION"), ["WEBSTER"]);
  assert.deepEqual(requiredCoreTokens("PEAPACK PRIVATE BANK & TRUST"), ["PEAPACK"]);
  assert.ok(lenderMatches("WILMINGTON TRUST, NATIONAL ASSOCIATION, AS TRUSTEE", "WILMINGTON TRUST"));
  assert.ok(!lenderMatches("WILMINGTON TRUST, NATIONAL ASSOCIATION, AS TRUSTEE", "WILMINGTON"));
  assert.ok(lenderMatches("WEBSTER BANK, NATIONAL ASSOCIATION", "WEBSTER"));
});

test("channel match is literal — no normalization (§5)", () => {
  assert.ok(channelMatches("regional-bank balance sheet", "regional-bank balance sheet"));
  assert.ok(!channelMatches("regional-bank balance sheet", "regional bank balance sheet"));
  assert.ok(!channelMatches("regional-bank balance sheet", "regional-bank balance sheet ")); // trailing space
  assert.ok(!channelMatches("new-securitization", "new securitization"));
});
