// RELATIVE ATTRIBUTION — the model-implied force mix (NOT a calibrated decomposition). BUILT TODAY.
//
// This is the headline path. It is deliberately NOT the calibrated, price-inverted decomposition
// (that is `wire.decomposePair`, used only by demo-pair.ts, which foots to the dollar). Here we never
// invert and never calibrate ρ to the observed price — so the convexity proxy strain at high LTV
// cannot poison the result.
//
// Construction (per pair), with a SINGLE fixed reference required-return ρ0 (proxies.REF_HURDLE):
//   • Inputs:  NOI = proxy (price×cap, grown)         — LABELED proxy
//              rate rf = REAL, public 10y UST by date — the clean, proxy-free regime signal
//              spread γ, convexity d = proxy (constant → spread force ≈ 0)
//              LTV = REAL, CEMA-recovered
//              required return = ρ0 fixed (NEVER cohort-assigned, NEVER inverted)
//   • A 5-leg flat Shapley over {fundamentals, rate, spread, ltv_availability, equity} with the
//     equity coordinate pinned entry==exit==ρ0 (contributes exactly 0; only fixes the base hurdle).
//     The 4 non-zero "explained" legs sum to the MODEL move  M = Π(exit|ρ0) − Π(entry|ρ0).
//   • required-return force = observed ΔP − M  ── the RESIDUAL. It is what reconciles the real-rate +
//     real-LTV + proxied-NOI model to the actual price move. It absorbs the NOI-proxy bias, so it is
//     DESCRIPTIVE only — never the headline signal.
//
// The 4 explained legs do NOT foot to observed ΔP (they foot to M); the residual bridges the gap.
// Output of this module is a "model-implied relative force mix" — it does NOT "decompose" or "foot".

import {
  priceState, shapley, threeLegCoordinates, debtSplitCoordinates,
  type DecompState, type Coordinate, type Assignment,
} from "../../prior/decomposition/index.ts";
import { PROXY, TEMPLATE, REF_HURDLE, rateProxy } from "./proxies.ts";

export interface DeedEnd {
  price: number;
  date: string;
  ltv: number; // REAL CEMA-recovered loan / price; 0 = all-cash / no recorded debt
}

/** Signed dollar legs (model-implied). `required_return` is the residual (observed − model). */
export interface FiveLegs {
  fundamentals: number; // NOI (proxy)
  rate: number; // real dated rate × real LTV — the regime signal
  spread: number; // constant proxy ⇒ ≈ 0
  ltv_availability: number; // real LTV change
  required_return: number; // RESIDUAL: observed move − model move
}
export interface ThreeForce {
  noi: number;
  debt: number; // rate + spread + ltv_availability
  required_return: number; // residual
}

export interface RelativeForceMix {
  holdYears: number;
  noiEntry: number;
  noiExit: number;
  modelMove: number; // M = Π(exit|ρ0) − Π(entry|ρ0) = sum of the 4 explained legs
  observedMove: number; // exit.price − entry.price
  legs: FiveLegs; // signed dollars
  rollup: ThreeForce; // signed dollars
  shares5: FiveLegs; // magnitude shares abs(leg)/Σabs(legs); positive; sum to 1
  shares3: ThreeForce; // magnitude shares for the rollup
  leveraged: boolean; // any recorded debt at either end
}

const YEAR_MS = 365.25 * 86_400_000;

export function relativeDecompose(entry: DeedEnd, exit: DeedEnd): RelativeForceMix {
  const holdYears = (Date.parse(exit.date) - Date.parse(entry.date)) / YEAR_MS;

  // NOI: proxied going-in level, grown over the ACTUAL hold (the fundamentals driver). LABELED proxy.
  const noiEntry = entry.price * PROXY.capRate;
  const noiExit = noiEntry * Math.pow(1 + PROXY.noiGrowth, holdYears);

  // states at the FIXED reference ρ0 — real rate, real LTV, proxied NOI/spread/convexity.
  const entryState: DecompState = { goingInNOI: noiEntry, debt: { rf: rateProxy(entry.date), gamma: PROXY.creSpread, d: PROXY.leverageConvexity, ltv: entry.ltv }, hurdle: REF_HURDLE };
  const exitState: DecompState = { goingInNOI: noiExit, debt: { rf: rateProxy(exit.date), gamma: PROXY.creSpread, d: PROXY.leverageConvexity, ltv: exit.ltv }, hurdle: REF_HURDLE };

  // 5-leg coordinate set. threeLegCoordinates = [fundamentals, debt, equity]; debtSplitCoordinates =
  // [rate, spread, ltv_availability]. We take fundamentals + the 3 debt sub-legs + the equity leg
  // (pinned entry==exit==ρ0 ⇒ exactly 0, but it sets the base hurdle so priceState gets a defined ρ).
  const tl = threeLegCoordinates(entryState, exitState);
  const ds = debtSplitCoordinates(entryState, exitState);
  const coords: Coordinate[] = [tl[0], ...ds, tl[2]]; // fundamentals, rate, spread, ltv_availability, equity(0)

  const phi = shapley(coords, (a: Assignment) => priceState(a, TEMPLATE));

  const fundamentals = phi.fundamentals;
  const rate = phi.rate;
  const spread = phi.spread; // ≈ 0 (constant proxy)
  const ltv_availability = phi.ltv_availability;
  const modelMove = fundamentals + rate + spread + ltv_availability; // = M (the equity leg is 0)
  const observedMove = exit.price - entry.price;
  const required_return = observedMove - modelMove; // THE RESIDUAL

  const debt = rate + spread + ltv_availability;
  const legs: FiveLegs = { fundamentals, rate, spread, ltv_availability, required_return };
  const rollup: ThreeForce = { noi: fundamentals, debt, required_return };

  const a = Math.abs;
  const sum5 = a(fundamentals) + a(rate) + a(spread) + a(ltv_availability) + a(required_return) || 1;
  const sum3 = a(rollup.noi) + a(rollup.debt) + a(rollup.required_return) || 1;
  const shares5: FiveLegs = {
    fundamentals: a(fundamentals) / sum5, rate: a(rate) / sum5, spread: a(spread) / sum5,
    ltv_availability: a(ltv_availability) / sum5, required_return: a(required_return) / sum5,
  };
  const shares3: ThreeForce = { noi: a(rollup.noi) / sum3, debt: a(rollup.debt) / sum3, required_return: a(rollup.required_return) / sum3 };

  return { holdYears, noiEntry, noiExit, modelMove, observedMove, legs, rollup, shares5, shares3, leveraged: entry.ltv > 0 || exit.ltv > 0 };
}
