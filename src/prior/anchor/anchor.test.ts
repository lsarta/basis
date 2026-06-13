// LAYER 2 — INVARIANT GATES 2a, 2b (+ self-consistency of the fixed point).

import { test } from "node:test";
import assert from "node:assert/strict";

import { type FinancingVector, type RateType, debtCost } from "../engine/types.ts";
import { neutralCap, neutralCapTrailing, terminalPrice } from "./index.ts";
import { solveClosedForm } from "../engine/solve.ts";

const rate_type: RateType = "fixed";

// ── Self-consistency: the anchor price is the EXACT fixed point of the Layer-1 solve. ──
// In steady state (H=1, NOI_1 = NOI_0(1+g), P_exit = P_N(1+g)), feeding the anchor price
// back through solveClosedForm must reproduce it. This ties Layer 2 to Layer 1 and proves
// the price is correct independent of any cap-rate convention.
test("layer 2 self-consistency: terminalPrice is the fixed point of solveClosedForm", () => {
  const g = 0.02;
  const noi0 = 1_000_000;
  const grid: FinancingVector[] = [];
  for (const ltv of [0, 0.4, 0.6, 0.75]) {
    for (const hurdle of [0.07, 0.10, 0.14]) {
      grid.push({ rf: 0.03, gamma: 0.015, d: 0.01, ltv, hurdle, rate_type });
    }
  }
  for (const fv of grid) {
    const pN = terminalPrice(noi0, g, fv);
 // one-period steady-state hold: NOI_1 grown, resale grown at g
    const noi1 = noi0 * (1 + g);
    const pExit = pN * (1 + g);
    const reproduced = solveClosedForm([noi1], fv, pExit);
    const relErr = Math.abs(reproduced - pN) / Math.abs(pN);
    assert.ok(
      relErr < 1e-10,
      `not a fixed point: ltv=${fv.ltv} hurdle=${fv.hurdle} pN=${pN} reproduced=${reproduced} relErr=${relErr}`,
    );
 // And the reported forward cap must equal NOI_1 / P_N.
    const cFwd = neutralCap(fv, g);
    assert.ok(Math.abs(cFwd - noi1 / pN) < 1e-12 * cFwd, "forward cap != NOI_1/P_N");
 // Trailing cap must equal NOI_0 / P_N.
    assert.ok(
      Math.abs(neutralCapTrailing(fv, g) - noi0 / pN) < 1e-12 * cFwd,
      "trailing cap != NOI_0/P_N",
    );
  }
});

// ── GATE 2a: unlevered reduction c* ≈ ρ* − g when LTV* = 0. ──
test("gate 2a: unlevered neutral cap reduces to ρ* − g", () => {
  const g = 0.02;
  for (const hurdle of [0.06, 0.08, 0.10, 0.12]) {
    const fv: FinancingVector = { rf: 0.03, gamma: 0.02, d: 0.01, ltv: 0, hurdle, rate_type };
    const cFwd = neutralCap(fv, g);
 // Forward convention: c* = ρ* − g EXACTLY when unlevered.
    assert.ok(
      Math.abs(cFwd - (hurdle - g)) < 1e-12,
      `forward c* != ρ*−g: hurdle=${hurdle} c*=${cFwd} ρ*−g=${hurdle - g}`,
    );
 // Trailing convention (Eq. 4 as written): (ρ*−g)/(1+g) ≈ ρ*−g within O(g·(ρ*−g)).
    const cTrail = neutralCapTrailing(fv, g);
    assert.ok(
      Math.abs(cTrail - (hurdle - g)) < (hurdle - g) * g, // ≈ within the (1+g) wedge
      `trailing c* not ≈ ρ*−g: hurdle=${hurdle} c*=${cTrail}`,
    );
  }
});

// ── GATE 2b: the §4.4 SIGN CROSS-CHECK. ──
// The leverage effect on price must AGREE between two INDEPENDENT places:
// (anchor) terminal term LTV*·(k_d*−ρ*) → its effect on terminalPrice vs the unlevered anchor
// (node) the same fv run through the Layer-1 solveClosedForm vs its unlevered counterpart
// Pivot is k_d == ρ in BOTH. Positive leverage (k_d<ρ) compresses the cap / RAISES price;
// negative leverage (k_d>ρ) expands the cap / LOWERS price.

function anchorPriceEffect(fv: FinancingVector, g: number, noiN: number): number {
  const levered = terminalPrice(noiN, g, fv);
  const unlevered = terminalPrice(noiN, g, { ...fv, ltv: 0 });
  return levered - unlevered;
}
function nodePriceEffect(
  fv: FinancingVector,
  noi: number[],
  pExit: number,
): number {
  const levered = solveClosedForm(noi, fv, pExit);
  const unlevered = solveClosedForm(noi, { ...fv, ltv: 0 }, pExit);
  return levered - unlevered;
}

test("gate 2b: anchor and node agree on the SIGN of the leverage effect (both directions)", () => {
  const g = 0.02;
  const noiN = 1_000_000;
  const noi = [1_020_000, 1_040_400, 1_061_208, 1_082_432, 1_104_081]; // 2% growth, H=5
  const pExit = 13_000_000;

 // Positive-leverage case: k_d < ρ.
  const posFv: FinancingVector = { rf: 0.03, gamma: 0.01, d: 0.005, ltv: 0.6, hurdle: 0.10, rate_type };
  assert.ok(debtCost(posFv) < posFv.hurdle, `expected positive leverage, k_d=${debtCost(posFv)}`);
  const posAnchor = anchorPriceEffect(posFv, g, noiN);
  const posNode = nodePriceEffect(posFv, noi, pExit);
  assert.ok(posAnchor > 0, `positive leverage must RAISE anchor price, got ${posAnchor}`);
  assert.ok(posNode > 0, `positive leverage must RAISE node price, got ${posNode}`);
  assert.equal(Math.sign(posAnchor), Math.sign(posNode), "pos-leverage sign disagreement");

 // Negative-leverage case: k_d > ρ.
  const negFv: FinancingVector = { rf: 0.04, gamma: 0.02, d: 0.01, ltv: 0.7, hurdle: 0.05, rate_type };
  assert.ok(debtCost(negFv) > negFv.hurdle, `expected negative leverage, k_d=${debtCost(negFv)}`);
  const negAnchor = anchorPriceEffect(negFv, g, noiN);
  const negNode = nodePriceEffect(negFv, noi, pExit);
  assert.ok(negAnchor < 0, `negative leverage must LOWER anchor price, got ${negAnchor}`);
  assert.ok(negNode < 0, `negative leverage must LOWER node price, got ${negNode}`);
  assert.equal(Math.sign(negAnchor), Math.sign(negNode), "neg-leverage sign disagreement");
});

test("gate 2b (pivot): k_d == ρ ⇒ leverage has ~zero price effect in BOTH places", () => {
  const g = 0.02;
  const noiN = 1_000_000;
  const noi = [1_020_000, 1_040_400, 1_061_208];
  const pExit = 13_000_000;
 // Construct k_d == ρ exactly: rf+γ+d·(ltv/(1−ltv)) = ρ. With ltv=0.5 → d·1 = ρ−rf−γ.
  const rf = 0.04, gamma = 0.02, ltv = 0.5, hurdle = 0.08;
  const d = hurdle - rf - gamma; // d·(0.5/0.5)=d ⇒ k_d = ρ
  const fv: FinancingVector = { rf, gamma, d, ltv, hurdle, rate_type };
  assert.ok(Math.abs(debtCost(fv) - hurdle) < 1e-15, `k_d should equal ρ, got ${debtCost(fv)}`);

  const a = anchorPriceEffect(fv, g, noiN);
  const n = nodePriceEffect(fv, noi, pExit);
  assert.ok(Math.abs(a) < 1e-6, `anchor price effect should ~0 at pivot, got ${a}`);
  assert.ok(Math.abs(n) < 1e-6, `node price effect should ~0 at pivot, got ${n}`);
});
