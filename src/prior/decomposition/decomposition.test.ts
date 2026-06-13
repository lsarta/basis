// LAYER 4 — INVARIANT GATES 4a, 4b (headline correctness layer).

import { test } from "node:test";
import assert from "node:assert/strict";

import { type FinancingVector, type RateType, debtCost } from "../engine/types.ts";
import {
  decompose,
  decompositionRecord,
  type DecompState,
  type DecompTemplate,
} from "./index.ts";
import { validateRecord } from "../record/types.ts";

const rate_type: RateType = "fixed";
const neutral: FinancingVector = { rf: 0.030, gamma: 0.020, d: 0.010, ltv: 0.65, hurdle: 0.10, rate_type };
const template: DecompTemplate = { hold: 5, growth: 0.03, g: 0.02, neutral, rate_type };

// ── GATE 4a: the three legs sum to ΔP exactly, across the full grid. ──
test("gate 4a: legs sum to ΔP exactly (scenario grid)", () => {
  const noiPairs = [[1_000_000, 1_092_727], [800_000, 800_000], [1_500_000, 1_300_000]];
  const debts = [
    { rf: 0.015, gamma: 0.018, d: 0.008, ltv: 0.70 },
    { rf: 0.042, gamma: 0.024, d: 0.012, ltv: 0.60 },
    { rf: 0.030, gamma: 0.020, d: 0.010, ltv: 0.65 },
  ];
  const hurdles = [0.08, 0.10, 0.14];

  let cases = 0;
  for (const [n0, n1] of noiPairs) {
    for (const de of debts) for (const dx of debts) {
      for (const he of hurdles) for (const hx of hurdles) {
        const entry: DecompState = { goingInNOI: n0, debt: de, hurdle: he };
        const exit: DecompState = { goingInNOI: n1, debt: dx, hurdle: hx };
        const r = decompose(entry, exit, template);
        const sum = r.legs.fundamentals + r.legs.debt + r.legs.equity;
        assert.ok(
          Math.abs(sum - r.deltaP) < 1e-6 * Math.max(1, Math.abs(r.deltaP)),
          `legs do not sum to ΔP: sum=${sum} ΔP=${r.deltaP}`,
        );
        cases++;
      }
    }
  }
  assert.equal(cases, noiPairs.length * debts.length * debts.length * hurdles.length * hurdles.length);
});

// ── GATE 4b: MATCHED-REGIME INVARIANT (the headline proof). ──
// Entry financing == exit financing (same rf, γ, d, LTV, hurdle) ⇒ BOTH capital-markets legs
// are IDENTICALLY ZERO. Proven per ; flipping bit-identical coordinates yields a
// bit-identical assignment, so each marginal is exactly 0.0 → the leg is exactly 0.0.
test("gate 4b: matched regime ⇒ debt leg AND equity leg are identically zero", () => {
  const debt = { rf: 0.028, gamma: 0.021, d: 0.011, ltv: 0.64 };
  const hurdle = 0.105;
 // Fundamentals DO move (NOI grew); only capital markets are held matched.
  for (const [n0, n1] of [[1_000_000, 1_159_274], [900_000, 1_200_000], [2_000_000, 1_500_000]]) {
    const entry: DecompState = { goingInNOI: n0, debt, hurdle };
    const exit: DecompState = { goingInNOI: n1, debt, hurdle };
    const r = decompose(entry, exit, template);

 // EXACT zero (bit-exact), not approximate.
    assert.equal(r.legs.debt, 0, `debt leg leaked: ${r.legs.debt}`);
    assert.equal(r.legs.equity, 0, `equity leg leaked: ${r.legs.equity}`);
 // ... and fundamentals carries all of ΔP.
    assert.ok(
      Math.abs(r.legs.fundamentals - r.deltaP) < 1e-9 * Math.max(1, Math.abs(r.deltaP)),
      `fundamentals != ΔP under matched regime: ${r.legs.fundamentals} vs ${r.deltaP}`,
    );
  }
});

// Matched regime with debt-side matched but hurdle moved ⇒ debt leg zero, equity leg nonzero.
test("gate 4b (corollary): debt-only match zeroes the debt leg, equity leg can be nonzero", () => {
  const debt = { rf: 0.028, gamma: 0.021, d: 0.011, ltv: 0.64 };
  const entry: DecompState = { goingInNOI: 1_000_000, debt, hurdle: 0.09 };
  const exit: DecompState = { goingInNOI: 1_100_000, debt, hurdle: 0.13 };
  const r = decompose(entry, exit, template);
  assert.equal(r.legs.debt, 0, `debt leg should be exactly 0 (debt matched): ${r.legs.debt}`);
  assert.ok(Math.abs(r.legs.equity) > 1e-3, "equity leg should be nonzero (hurdle moved)");
});

// ── The 2021→2024 sign-pattern check the user asked for. ──
test("2021→2024: +fundamentals, −debt, −equity (cap-markets net negative), summing to ΔP", () => {
  const entry: DecompState = { goingInNOI: 1_000_000, debt: { rf: 0.015, gamma: 0.018, d: 0.008, ltv: 0.70 }, hurdle: 0.09 };
  const exit: DecompState = { goingInNOI: 1_092_727, debt: { rf: 0.042, gamma: 0.024, d: 0.012, ltv: 0.60 }, hurdle: 0.12 };
  assert.ok(debtCost({ ...entry.debt, hurdle: entry.hurdle, rate_type }) < entry.hurdle, "entry should be positive leverage");
  assert.ok(debtCost({ ...exit.debt, hurdle: exit.hurdle, rate_type }) < exit.hurdle, "exit still positive leverage (k_d<ρ)");

  const r = decompose(entry, exit, template);
  const capMkts = r.legs.debt + r.legs.equity;

  console.log("\n=== 2021→2024 three-leg decomposition (forward-to-anchor re-pricing) ===");
  console.log(`  entryPrice  Π(2021) : ${r.entryPrice.toFixed(0)}`);
  console.log(`  exitPrice   Π(2024) : ${r.exitPrice.toFixed(0)}`);
  console.log(`  ΔP                  : ${r.deltaP.toFixed(0)}`);
  console.log(`  leg: fundamentals   : ${r.legs.fundamentals.toFixed(0)}   (NOI grew)`);
  console.log(`  leg: debt           : ${r.legs.debt.toFixed(0)}`);
  console.log(`  leg: equity         : ${r.legs.equity.toFixed(0)}`);
  console.log(`  capital-markets net : ${capMkts.toFixed(0)}`);
  console.log(`  Σ legs              : ${(r.legs.fundamentals + capMkts).toFixed(0)}  (== ΔP)`);

  assert.ok(r.legs.fundamentals > 0, "fundamentals leg must be POSITIVE (NOI grew)");
  assert.ok(r.legs.debt < 0, "debt leg must be NEGATIVE (debt got more expensive)");
  assert.ok(r.legs.equity < 0, "equity leg must be NEGATIVE (hurdle expanded)");
  assert.ok(capMkts < 0, "capital-markets legs must be net NEGATIVE");
  assert.ok(Math.abs((r.legs.fundamentals + capMkts) - r.deltaP) < 1e-6 * Math.max(1, Math.abs(r.deltaP)), "legs must sum to ΔP");
});

// ── Record population: legs land on a schema-conformant record. ──
test("gate 4: decomposition record validates with legs populated and summing to delta_price", () => {
  const entry: DecompState = { goingInNOI: 1_000_000, debt: { rf: 0.015, gamma: 0.018, d: 0.008, ltv: 0.70 }, hurdle: 0.09 };
  const exit: DecompState = { goingInNOI: 1_092_727, debt: { rf: 0.042, gamma: 0.024, d: 0.012, ltv: 0.60 }, hurdle: 0.12 };
  const rec = decompositionRecord(entry, exit, template, {
    transaction_id: "TX-DECOMP-0001",
    property_type: "multifamily",
    buyer_archetype: "value_add",
    noi_source: "scenario",
    dates: { entry_date: "2021-06-01", exit_date: "2024-06-01", entry_vintage: "2021Q2", exit_vintage: "2024Q2" },
  });
  assert.deepEqual(validateRecord(rec), [], "decomposition record not schema-conformant");
  assert.ok(rec.legs.fundamentals !== null && rec.legs.debt !== null && rec.legs.equity !== null, "legs populated");
  assert.ok(Math.abs(rec.solver.irr_check - entry.hurdle) < 1e-7, "entry irr_check != entry hurdle");
});
