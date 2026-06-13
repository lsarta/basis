// LAYER 5 — INVARIANT GATE 5: stress validation.
// Adverse (2021→2024) regime: capital-markets leg lights up NEGATIVE with plausible
// magnitude. Favorable mirror (expensive→cheap debt): capital-markets leg flips POSITIVE 
// proving the engine tracks the actual regime direction, not a hardwired sign. Plus an exact
// matched-fundamentals symmetry: swapping the regime negates each capital-markets leg.

import { test } from "node:test";
import assert from "node:assert/strict";

import { type FinancingVector, type RateType, debtCost } from "../engine/types.ts";
import { decompose, type DecompState, type DecompTemplate } from "./index.ts";

const rate_type: RateType = "fixed";
const neutral: FinancingVector = { rf: 0.030, gamma: 0.020, d: 0.010, ltv: 0.65, hurdle: 0.10, rate_type };
const template: DecompTemplate = { hold: 5, growth: 0.03, g: 0.02, neutral, rate_type };

// The two regimes.
const CHEAP_2021 = { rf: 0.015, gamma: 0.018, d: 0.008, ltv: 0.70 }; // low rates, wide LTV
const EXPENSIVE_2024 = { rf: 0.042, gamma: 0.024, d: 0.012, ltv: 0.60 }; // high rates, tight LTV
const HURDLE_2021 = 0.09;
const HURDLE_2024 = 0.12;
const NOI_2021 = 1_000_000;
const NOI_2024 = 1_092_727; // = NOI_2021 · 1.03^3 (NOI grew over the 2021→2024 gap)

function show(label: string, r: { legs: { fundamentals: number; debt: number; equity: number }; entryPrice: number; exitPrice: number; deltaP: number }) {
  const cm = r.legs.debt + r.legs.equity;
  console.log(`\n=== ${label} ===`);
  console.log(`  Π(entry)=${r.entryPrice.toFixed(0)}  Π(exit)=${r.exitPrice.toFixed(0)}  ΔP=${r.deltaP.toFixed(0)}`);
  console.log(`  fundamentals=${r.legs.fundamentals.toFixed(0)}  debt=${r.legs.debt.toFixed(0)}  equity=${r.legs.equity.toFixed(0)}  capital-markets=${cm.toFixed(0)}`);
}

// ── GATE 5 (adverse): 2021 entry / 2024 exit — the negative-leverage horror story. ──
test("gate 5 (adverse): 2021→2024 capital-markets leg lights up NEGATIVE, plausible magnitude", () => {
  const entry: DecompState = { goingInNOI: NOI_2021, debt: CHEAP_2021, hurdle: HURDLE_2021 };
  const exit: DecompState = { goingInNOI: NOI_2024, debt: EXPENSIVE_2024, hurdle: HURDLE_2024 };
  const r = decompose(entry, exit, template);
  show("ADVERSE 2021→2024", r);
  const cm = r.legs.debt + r.legs.equity;

 // sign pattern
  assert.ok(r.legs.fundamentals > 0, "fundamentals must be POSITIVE (NOI grew)");
  assert.ok(r.legs.debt < 0, "debt leg must be NEGATIVE (debt got more expensive)");
  assert.ok(r.legs.equity < 0, "equity leg must be NEGATIVE (hurdle expanded)");
  assert.ok(cm < 0, "capital-markets net must be NEGATIVE");
 // capital markets OVERWHELMED fundamentals → value fell
  assert.ok(Math.abs(cm) > r.legs.fundamentals, "capital-markets drag should exceed the NOI gain");
  assert.ok(r.deltaP < 0, "ΔP should be negative (fair value fell)");
 // plausible magnitude: cap-markets drag is a double-digit % of fair value, not a rounding wisp
  const frac = Math.abs(cm) / r.entryPrice;
  assert.ok(frac > 0.05 && frac < 0.30, `cap-markets drag fraction implausible: ${frac}`);
 // legs sum to ΔP (exact)
  assert.ok(Math.abs(r.legs.fundamentals + cm - r.deltaP) < 1e-6 * Math.abs(r.deltaP));

 // documented breakdown (deterministic): ≈ +1.65M / −1.90M / −0.89M, net ≈ −1.14M
  assert.ok(Math.abs(r.legs.fundamentals - 1_652_094) < 2_000, `fundamentals ${r.legs.fundamentals}`);
  assert.ok(Math.abs(r.legs.debt - -1_902_380) < 2_000, `debt ${r.legs.debt}`);
  assert.ok(Math.abs(r.legs.equity - -892_128) < 2_000, `equity ${r.legs.equity}`);
});

// ── GATE 5 (favorable mirror): expensive-debt entry → cheap-debt exit. ──
test("gate 5 (favorable): expensive→cheap regime flips the capital-markets leg POSITIVE", () => {
  const entry: DecompState = { goingInNOI: NOI_2021, debt: EXPENSIVE_2024, hurdle: HURDLE_2024 };
  const exit: DecompState = { goingInNOI: NOI_2024, debt: CHEAP_2021, hurdle: HURDLE_2021 };
  const r = decompose(entry, exit, template);
  show("FAVORABLE expensive→cheap", r);
  const cm = r.legs.debt + r.legs.equity;

  assert.ok(r.legs.fundamentals > 0, "fundamentals still POSITIVE (NOI grew)");
  assert.ok(r.legs.debt > 0, "debt leg must FLIP POSITIVE (debt got cheaper)");
  assert.ok(r.legs.equity > 0, "equity leg must FLIP POSITIVE (hurdle compressed)");
  assert.ok(cm > 0, "capital-markets net must be POSITIVE (regime improved)");
  assert.ok(r.deltaP > 0, "ΔP should be strongly positive (cheap money + NOI growth)");
  assert.ok(Math.abs(r.legs.fundamentals + cm - r.deltaP) < 1e-6 * Math.abs(r.deltaP));
});

// ── Exact symmetry: with fundamentals MATCHED, swapping the regime negates each leg. ──
// Proves the sign is not hardwired — it is the regime direction, and the engine is symmetric.
test("gate 5 (symmetry): matched fundamentals ⇒ regime swap negates debt and equity legs exactly", () => {
  const noi = 1_000_000; // FIXED — fundamentals do not move
  const A = decompose(
    { goingInNOI: noi, debt: CHEAP_2021, hurdle: HURDLE_2021 },
    { goingInNOI: noi, debt: EXPENSIVE_2024, hurdle: HURDLE_2024 },
    template,
  );
  const B = decompose(
    { goingInNOI: noi, debt: EXPENSIVE_2024, hurdle: HURDLE_2024 },
    { goingInNOI: noi, debt: CHEAP_2021, hurdle: HURDLE_2021 },
    template,
  );
 // fundamentals leg is bit-exact zero in both (matched fundamentals)
  assert.equal(A.legs.fundamentals, 0);
  assert.equal(B.legs.fundamentals, 0);
 // A worsens (negative), B improves (positive)
  assert.ok(A.legs.debt < 0 && A.legs.equity < 0, "A (cheap→expensive) should be negative");
  assert.ok(B.legs.debt > 0 && B.legs.equity > 0, "B (expensive→cheap) should be positive");
 // and they are exact mirrors
  assert.ok(Math.abs(A.legs.debt + B.legs.debt) < 1e-6 * Math.abs(A.legs.debt), "debt legs not mirror-images");
  assert.ok(Math.abs(A.legs.equity + B.legs.equity) < 1e-6 * Math.abs(A.legs.equity), "equity legs not mirror-images");
  assert.ok(Math.abs(A.deltaP + B.deltaP) < 1e-6 * Math.abs(A.deltaP), "ΔP not mirror-image");
});

// Sanity: confirm the regime labels are what we think (leverage posture).
test("gate 5 (sanity): 2021 regime is cheaper debt than 2024", () => {
  const k2021 = debtCost({ ...CHEAP_2021, hurdle: HURDLE_2021, rate_type });
  const k2024 = debtCost({ ...EXPENSIVE_2024, hurdle: HURDLE_2024, rate_type });
  assert.ok(k2021 < k2024, `expected k_d(2021)=${k2021} < k_d(2024)=${k2024}`);
});
