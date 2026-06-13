// SELF-TEST — run BEFORE any extraction. BUILT DURING BUILD DAY.
//
// GRADER_SPEC "Self-test before extraction":
//   1. Feed the gold set's own true_* values back as perfect predictions → 17/17.
//   2. Perturb one field per rule → each must FAIL its intended row and ONLY that row.
//   3. (Task) Negative cases for the Peapack per-field branch and the note-column rule.
//
// If the clean fixture does not self-pass 17/17, the grader is misreading the data —
// fix the grader, never the gold set.
//
// Run:  node src/grader/selftest.ts   (or: npm run grader:selftest)

import assert from "node:assert/strict";
import { loadGoldset } from "./csv.ts";
import { grade, goldAsPredictions } from "./grade.ts";
import { renderReport, failedRows } from "./render.ts";
import type { GoldRow, Prediction } from "./types.ts";

// ── Stable document ids (the join identity component that disambiguates) ──
const DOC = {
  mcon_300w44: "2025121200273005", // M&CON, cema_consolidation, bbl 1010340037 (shared)
  deed_300w44: "2025121200273001", // DEED, arms_length_purchase, bbl 1010340037 (shared)
  blanket_169w83: "2025121700383001", // AGMT, blanket_not_attributable (refusal)
  cema_204avea: "2025121500444030", // AGMT, cema_consolidation, EMPTY bbl
  webster: "2025120401159003", // takeout_regional_bank, reliable amount
  peapack: "2026031300594005", // takeout_regional_bank, amount NOT attributable
  wilmington: "2024111900621001", // takeout_new_securitization, reliable amount
  broadway1384: "2016122701566007", // still_outstanding, note carries $34,019,709 / $88M
} as const;

const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const rule = (n = 78) => DIM + "─".repeat(n) + RESET;

function withMutation(
  preds: Prediction[],
  docId: string,
  mutate: (p: Prediction) => Prediction,
): Prediction[] {
  let hit = false;
  const out = preds.map((p) => {
    if (p.document_id !== docId) return p;
    hit = true;
    return mutate({ ...p });
  });
  if (!hit) throw new Error(`perturbation targeted a missing document_id: ${docId}`);
  return out;
}

let failures = 0;

/** Run one perturbation, render it, and assert it fails EXACTLY the intended document id. */
function perturb(opts: {
  name: string;
  rule: string;
  intendedDoc: string;
  mutate: (p: Prediction) => Prediction;
  gold: GoldRow[];
  clean: Prediction[];
}): void {
  const { name, rule: specRule, intendedDoc, mutate, gold, clean } = opts;
  const preds = withMutation(clean, intendedDoc, mutate);
  const report = grade(gold, preds);
  const fails = failedRows(report);
  const failedDocs = fails.map((r) => r.document_id);
  const ok = failedDocs.length === 1 && failedDocs[0] === intendedDoc;

  console.log("\n" + rule());
  console.log(`${BOLD}${name}${RESET}  ${DIM}(${specRule})${RESET}`);
  // Render only the affected + intended rows so the localization is legible.
  const focus = new Set([intendedDoc, ...failedDocs]);
  const focusReport = { ...report, rows: report.rows.filter((r) => focus.has(r.document_id)) };
  console.log(renderReport("  affected rows:", focusReport).split("\n").slice(1).join("\n"));
  const verdict = ok
    ? `${GREEN}✓ fails ONLY its intended row${RESET}`
    : `${RED}✗ EXPECTED only ${intendedDoc} to fail, got [${failedDocs.join(", ") || "none"}]${RESET}`;
  console.log(`  → ${verdict}   ${DIM}(other ${report.passed} rows still pass)${RESET}`);
  if (!ok) failures++;
  // Hard invariant: the other 16 rows must remain green.
  assert.equal(report.passed, gold.length - 1, `${name}: expected exactly one failing row`);
  assert.deepEqual(failedDocs, [intendedDoc], `${name}: wrong row failed`);
}

function main(): void {
  const gold = loadGoldset();

  // ── 0. Sanity: the fixture shape the spec pins. ──
  const reliableTrue = gold.filter((r) => r.amount_reliable).length;
  console.log(`${BOLD}Basis data-quality gate — self-test${RESET}`);
  console.log(`${DIM}gold rows: ${gold.length}  |  amount_reliable true/false: ${reliableTrue}/${gold.length - reliableTrue}${RESET}`);
  assert.equal(gold.length, 17, "expected 17 gold rows");
  assert.equal(reliableTrue, 11, "expected 11 amount_reliable=true rows");

  // ── 1. CLEAN: perfect predictions → 17/17. ──
  console.log("\n" + rule());
  console.log(`${BOLD}STEP 1 — clean fixture fed back as perfect predictions${RESET}`);
  const clean = goldAsPredictions(gold);
  const cleanReport = grade(gold, clean);
  console.log(renderReport("", cleanReport));
  assert.ok(cleanReport.allPass, "CLEAN fixture must self-pass 17/17 — grader is misreading the data");
  assert.equal(cleanReport.passed, 17, "clean composite must be 17/17");

  // ── 2. PERTURBATIONS — one field per rule, each fails only its intended row. ──
  console.log("\n" + rule());
  console.log(`${BOLD}STEP 2 — perturbations (each must fail ONLY its intended row)${RESET}`);

  // §2 — join on (bbl, document_id), never bbl alone. 1010340037 carries BOTH the DEED and
  // the M&CON; the two predictions even share bbl 1010340037, so a bbl-only map would collide.
  // Corrupting the DEED's amount must localize to the DEED, not bleed into the M&CON.
  perturb({
    name: "P1 · bbl-only-join hazard on 1010340037 (DEED amount corrupted)",
    rule: "§2 join on (bbl,document_id), never bbl alone",
    intendedDoc: DOC.deed_300w44,
    mutate: (p) => ({ ...p, amount: 104000000 }), // the stale 2007 figure — wrong for the deed
    gold, clean,
  });

  // §1 — per-row key selection; never match an empty BBL. The 3 CEMAs all carry bbl="";
  // keyed by document_id they stay distinct. Corrupting 204 Ave A must localize to it alone.
  perturb({
    name: "P2 · empty-BBL match attempt (204 Ave A amount corrupted)",
    rule: "§1 Block A keys on document_id; never match an empty BBL",
    intendedDoc: DOC.cema_204avea,
    mutate: (p) => ({ ...p, amount: 6556000 }), // off by $48 from 6556048
    gold, clean,
  });

  // §7 — refusal is a positive label; ANY dollar on the blanket row = FAIL.
  perturb({
    name: "P3 · a dollar in the blanket-refusal row (sibling foil $3,160,000)",
    rule: "§7 refusal: any dollar = FAIL",
    intendedDoc: DOC.blanket_169w83,
    mutate: (p) => ({ ...p, amount: 3160000 }), // the on-parcel M&CON foil from the note
    gold, clean,
  });

  // §5 — channel is a literal closed enum; the missing hyphen must FAIL.
  perturb({
    name: "P4 · 'regional bank' without the hyphen (Webster channel)",
    rule: "§5 channel literal, no normalization",
    intendedDoc: DOC.webster,
    mutate: (p) => ({ ...p, channel: "regional bank balance sheet" }),
    gold, clean,
  });

  // §4 — lender core token; WILMINGTON alone collides with Wilmington Savings → must FAIL.
  perturb({
    name: "P5 · 'WILMINGTON' alone (missing the load-bearing TRUST)",
    rule: "§4 lender core-token, multi-word where a single word collides",
    intendedDoc: DOC.wilmington,
    mutate: (p) => ({ ...p, lender: "WILMINGTON" }),
    gold, clean,
  });

  // ── 3. EXTRA NEGATIVES — Peapack per-field branch + the note-column rule + whiff. ──
  console.log("\n" + rule());
  console.log(`${BOLD}STEP 3 — extra negative cases (Peapack branch, note column, whiff)${RESET}`);

  // Peapack: amount_reliable=false but the row STILL requires correct channel+lender+classification.
  perturb({
    name: "P6 · Peapack lender wrong (per-field branch still scores lender on an unreliable-amount row)",
    rule: "§3 Peapack scores channel+lender+classification; amount not-attributable",
    intendedDoc: DOC.peapack,
    mutate: (p) => ({ ...p, lender: "WEBSTER" }),
    gold, clean,
  });

  // Peapack: a usable modeled amount on the not-attributable row = FAIL (not merely unscored).
  perturb({
    name: "P7 · Peapack emits a usable amount (amount marked not-attributable → any dollar = FAIL)",
    rule: "§3 + brief hardening: usable amount on amount_reliable=false = FAIL",
    intendedDoc: DOC.peapack,
    mutate: (p) => ({ ...p, amount: 5000000 }),
    gold, clean,
  });

  // Peapack: classification still required even though amount is unreliable.
  perturb({
    name: "P8 · Peapack classification wrong (unreliable amount must not halt classification scoring)",
    rule: "§3 a null amount must not halt token/classification scoring",
    intendedDoc: DOC.peapack,
    mutate: (p) => ({ ...p, classification: "takeout_new_securitization" }),
    gold, clean,
  });

  // Whiff vs refusal: an empty classification on the blanket row is a WHIFF, not a refusal → FAIL.
  perturb({
    name: "P9 · blanket row whiff (empty classification ≠ refusal — positive label required)",
    rule: "§7 refusal distinguishable from a whiff",
    intendedDoc: DOC.blanket_169w83,
    mutate: (p) => ({ ...p, classification: "" }),
    gold, clean,
  });

  // Note-column rule (§6): the note deliberately carries dollar figures the engine must NOT
  // emit. A grader that grepped the note would FALSE-FAIL these rows. With clean predictions
  // they must PASS — proving the note column is never scored.
  console.log("\n" + rule());
  console.log(`${BOLD}P10 · note-column rule — dollar figures in note must NOT score (§6)${RESET}`);
  const noteRows: GoldRow[] = [
    gold.find((r) => r.document_id === DOC.blanket_169w83)!,
    gold.find((r) => r.document_id === DOC.broadway1384)!,
  ];
  for (const r of noteRows) {
    const res = cleanReport.rows.find((x) => x.document_id === r.document_id)!;
    const dollars = (r.note.match(/\$[\d,]+(?:\.\d+)?[MK]?/g) ?? []).join("  ");
    const verdict = res.pass ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
    console.log(`  ${verdict}  ${r.true_classification}  ${DIM}note $-figures: ${dollars}${RESET}`);
    console.log(`        ${DIM}↳ scored true_amount only (${r.amount_reliable ? r.true_amount : "not-attributable"}); note ignored${RESET}`);
    assert.ok(res.pass, `note-column rule: ${r.true_classification} must pass despite dollar figures in note`);
    if (!res.pass) failures++;
  }

  // ── Verdict ──
  console.log("\n" + rule());
  if (failures === 0) {
    console.log(`${GREEN}${BOLD}SELF-TEST GREEN${RESET} — 17/17 clean; each perturbation failed only its intended row.`);
    console.log(`${DIM}The gate is armed. Scraped data may now be graded against it.${RESET}`);
  } else {
    console.log(`${RED}${BOLD}SELF-TEST RED${RESET} — ${failures} check(s) failed.`);
    process.exitCode = 1;
  }
}

main();
