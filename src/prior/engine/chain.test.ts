// LAYER 3 — INVARIANT GATE 3 (updated for the price-concept rename)
// A chain runs end-to-end and produces REALIZED ownership-sequence prices; irr_check ==
// hurdle at EACH node (entry and exit both solved); the exit is SOLVED, not capitalised; and
// realized chain prices ride on the record's SEPARATE `chain` field (never the Π basis).

import { test } from "node:test";
import assert from "node:assert/strict";

import { type FinancingVector, type RateType } from "./types.ts";
import { priceChain, type ChainSpec } from "./chain.ts";
import { solveClosedForm } from "./solve.ts";
import { neutralCap } from "../anchor/index.ts";
import { validateRecord } from "../record/types.ts";
import { decompositionRecord, type DecompState, type DecompTemplate } from "../decomposition/index.ts";
import { ScenarioNOISource } from "../noi/scenario/index.ts";

const rate_type: RateType = "fixed";

const entryFin: FinancingVector = { rf: 0.015, gamma: 0.018, d: 0.008, ltv: 0.70, hurdle: 0.09, rate_type };
const exitFin: FinancingVector = { rf: 0.042, gamma: 0.024, d: 0.012, ltv: 0.60, hurdle: 0.12, rate_type };
const neutral: FinancingVector = { rf: 0.030, gamma: 0.020, d: 0.010, ltv: 0.65, hurdle: 0.10, rate_type };

function exampleSpec(): ChainSpec {
  return {
    transaction_id: "TX-DEMO-0001",
    noiSource: new ScenarioNOISource({ in_place_noi: 1_000_000, growth: 0.03, property_type: "multifamily", max_horizon: 20 }),
    nodes: [
      { financing: entryFin, hold_years: 3 }, // entry owner holds 3y
      { financing: exitFin, hold_years: 5 }, // exit owner holds 5y, resale = anchor
    ],
    terminal: { g: 0.02, neutral },
  };
}

test("gate 3: chain produces realized entry/exit prices and terminates on the anchor", () => {
  const { chainPrices, detail } = priceChain(exampleSpec());
  assert.ok(Number.isFinite(chainPrices.chain_price_entry) && Number.isFinite(chainPrices.chain_price_exit));
  assert.equal(chainPrices.chain_price_entry, detail.nodePrices[0]);
  assert.equal(chainPrices.chain_price_exit, detail.nodePrices[1]);
 // last node's resale is the anchor terminal price
  assert.ok(Math.abs(detail.nodes[detail.nodes.length - 1].pExit - detail.pTerminal) < 1e-9);
});

test("gate 3: irr_check == hurdle at EACH node (entry and exit both solved)", () => {
  const { detail } = priceChain(exampleSpec());
  for (const n of detail.nodes) {
    assert.ok(Math.abs(n.irr - n.hurdle) < 1e-7, `node ${n.index}: irr ${n.irr} != hurdle ${n.hurdle}`);
    assert.ok(Math.abs(n.residual) < 1e-6 * Math.abs(n.price), `node ${n.index}: residual too large`);
  }
});

test("gate 3: the exit is SOLVED to the exit hurdle, not capitalised by a typed-in cap", () => {
  const spec = exampleSpec();
  const { chainPrices, detail } = priceChain(spec);
  const exitHoldNOI = detail.nodes[1].hold_noi;
  const reExit = solveClosedForm(exitHoldNOI, spec.nodes[1].financing, detail.pTerminal);
  assert.ok(Math.abs(reExit - chainPrices.chain_price_exit) < 1e-9, "exit price is not the exit owner's own solve");

  const naiveCapPrice = exitHoldNOI[0] / neutralCap(spec.terminal.neutral, spec.terminal.g);
  assert.ok(
    Math.abs(naiveCapPrice - chainPrices.chain_price_exit) > 1e-3 * chainPrices.chain_price_exit,
    "exit price coincidentally equals a typed-in-cap valuation (should be a hurdle solve)",
  );
});

test("gate 3: a 3-node chain (interim owner) terminates on the anchor; all nodes solved", () => {
  const base = exampleSpec();
  const interim: FinancingVector = { rf: 0.03, gamma: 0.02, d: 0.01, ltv: 0.65, hurdle: 0.105, rate_type };
  const { detail } = priceChain({ ...base, nodes: [base.nodes[0], { financing: interim, hold_years: 4 }, base.nodes[1]] });
  assert.equal(detail.nodes.length, 3);
  for (const n of detail.nodes) assert.ok(Math.abs(n.irr - n.hurdle) < 1e-7, `3-node: node ${n.index} irr != hurdle`);
  assert.ok(Math.abs(detail.nodes[2].pExit - detail.pTerminal) < 1e-9);
});

test("gate 3: realized chain prices ride on the record's SEPARATE `chain` field (not the Π basis)", () => {
  const spec = exampleSpec();
  const { chainPrices } = priceChain(spec);

 // Build a decomposition record (Π basis) and ATTACH the realized chain prices.
  const tmpl: DecompTemplate = { hold: 5, growth: 0.03, g: 0.02, neutral, rate_type };
  const entry: DecompState = { goingInNOI: 1_000_000, debt: { rf: entryFin.rf, gamma: entryFin.gamma, d: entryFin.d, ltv: entryFin.ltv }, hurdle: entryFin.hurdle };
  const exit: DecompState = { goingInNOI: 1_092_727, debt: { rf: exitFin.rf, gamma: exitFin.gamma, d: exitFin.d, ltv: exitFin.ltv }, hurdle: exitFin.hurdle };
  const rec = decompositionRecord(entry, exit, tmpl, {
    transaction_id: "TX-DEMO-0001",
    property_type: "multifamily",
    buyer_archetype: "value_add",
    noi_source: "scenario",
    dates: { entry_date: "2021-06-01", exit_date: "2024-06-01", entry_vintage: "2021Q2", exit_vintage: "2024Q2" },
  }, chainPrices);

  assert.deepEqual(validateRecord(rec), []);
 // chain prices are on the separate field, distinct from the Π basis
  assert.equal(rec.chain?.chain_price_entry, chainPrices.chain_price_entry);
  assert.equal(rec.chain?.chain_price_exit, chainPrices.chain_price_exit);
  assert.notEqual(rec.chain?.chain_price_entry, rec.repricing_value_entry); // diverge at entry
 // coincidence at exit: Π(exit) == chain exit price (same hold, growth, financing, anchor)
  assert.ok(Math.abs((rec.repricing_value_exit) - (chainPrices.chain_price_exit)) < 1e-6 * rec.repricing_value_exit,
    `expected Π(exit) ≈ chain exit price; got ${rec.repricing_value_exit} vs ${chainPrices.chain_price_exit}`);
});
