// LAYER 1 — INVARIANT GATE 1
// Closed-form solve == numerical solve on the interest-only baseline (within float tol),
// across a grid of scenarios; and the solved price's levered IRR equals the hurdle.

import { test } from "node:test";
import assert from "node:assert/strict";

import { type FinancingVector, type RateType } from "./types.ts";
import {
  solveClosedForm,
  solveNumerical,
  equityCashflows,
  irr,
  leveredNPV,
} from "./solve.ts";
import { ScenarioNOISource } from "../noi/scenario/index.ts";
import { expandNOI } from "../noi/types.ts";

// Grid over the inputs that matter for the solve.
const ltvs = [0, 0.5, 0.65, 0.75];
const hurdles = [0.08, 0.12, 0.18];
const growths = [0, 0.02, 0.04];
const horizons = [3, 5, 10];
const rf = 0.03;
const gamma = 0.02;
const d = 0.01;
const rate_type: RateType = "fixed";
const inPlaceNOI = 1_000_000;

function buildNOI(growth: number, H: number): number[] {
  const src = new ScenarioNOISource({
    in_place_noi: inPlaceNOI,
    growth,
    property_type: "office",
    max_horizon: H,
  });
  return expandNOI(src.noiFor({ horizon: H }), H);
}

test("gate 1: closed-form == numerical on the IO baseline (scenario grid)", () => {
  let cases = 0;
  for (const ltv of ltvs) {
    for (const hurdle of hurdles) {
      for (const growth of growths) {
        for (const H of horizons) {
          const fv: FinancingVector = { rf, gamma, d, ltv, hurdle, rate_type };
          const noi = buildNOI(growth, H);
 // A plausible exit price so the solve has a resale leg.
          const pExit = inPlaceNOI * 12;

          const pc = solveClosedForm(noi, fv, pExit);
          const pn = solveNumerical(noi, fv, pExit, { tol: 1e-9, maxIter: 300 });

 // relative agreement between the two independent methods
          const relErr = Math.abs(pc - pn) / Math.abs(pc);
          assert.ok(
            relErr < 1e-7,
            `closed-form vs numerical mismatch: ltv=${ltv} hurdle=${hurdle} g=${growth} H=${H} ` +
              `pc=${pc} pn=${pn} relErr=${relErr}`,
          );
          cases++;
        }
      }
    }
  }
  assert.equal(cases, ltvs.length * hurdles.length * growths.length * horizons.length);
});

test("gate 1: solved price delivers the hurdle (levered IRR == ρ) and residual ~0", () => {
  for (const ltv of ltvs) {
    for (const hurdle of hurdles) {
      const fv: FinancingVector = { rf, gamma, d, ltv, hurdle, rate_type };
      const noi = buildNOI(0.03, 5);
      const pExit = inPlaceNOI * 13;
      const p = solveClosedForm(noi, fv, pExit);

 // NPV-at-hurdle residual must be ~0 at the solved price.
      const resid = leveredNPV(p, noi, fv, pExit);
      assert.ok(
        Math.abs(resid) < 1e-6 * Math.abs(p),
        `residual too large: ltv=${ltv} hurdle=${hurdle} resid=${resid} p=${p}`,
      );

 // Independent confirmation: the IRR of the levered equity stream equals the hurdle.
      const cf = equityCashflows(p, noi, fv, pExit);
      const realizedIRR = irr(cf);
      assert.ok(
        Math.abs(realizedIRR - hurdle) < 1e-7,
        `IRR != hurdle: ltv=${ltv} hurdle=${hurdle} irr=${realizedIRR}`,
      );
    }
  }
});
