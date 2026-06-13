// Engine wiring — connect the scrape to the reused decomposition engine. BUILT DURING BUILD DAY.
//
// For a same-BBL deed PAIR (two arms-length deeds), calibrate each end to its REAL observed price by
// inverting the engine for the required-return ρ (priceState is monotone-decreasing in ρ), then run
// the reused 3-leg Shapley decomposition. Because each end is calibrated to its real price, ΔP is the
// ACTUAL price move and the three forces (debt / NOI / required-return) foot to it exactly.

import { priceState, decompose, type DecompState, type DecompositionResult } from "../../prior/decomposition/index.ts";
import { PROXY, TEMPLATE, rateProxy } from "./proxies.ts";

export interface DeedEnd {
  price: number;
  date: string; // ISO recording datetime
  ltv: number; // REAL CEMA-recovered loan / price (0 = all-cash)
}

interface Debt { rf: number; gamma: number; d: number; ltv: number }

/**
 * Invert the engine for the required-return ρ that reproduces `targetPrice` at the given NOI + debt.
 * priceState(ρ) is strictly decreasing, so bisection converges. Returns ρ and the price residual
 * (≈ 0 confirms the engine is calibrated to the real deed price).
 */
export function invertHurdle(goingInNOI: number, debt: Debt, targetPrice: number): { hurdle: number; residual: number } {
  const f = (h: number) => priceState({ goingInNOI, rf: debt.rf, gamma: debt.gamma, d: debt.d, ltv: debt.ltv, hurdle: h }, TEMPLATE);
  // ρ range admits low/negative required returns: a richly-priced deal (price above what positive
  // leverage justifies) IS a low-required-return signal — the equity force should capture it, not clamp.
  let lo = -0.15, hi = 0.60;
  if (targetPrice >= f(lo)) return { hurdle: lo, residual: f(lo) - targetPrice }; // price unreachably high even at min ρ
  if (targetPrice <= f(hi)) return { hurdle: hi, residual: f(hi) - targetPrice };
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > targetPrice) lo = mid; // price too high ⇒ need a higher hurdle
    else hi = mid;
    if (hi - lo < 1e-13) break;
  }
  const hurdle = 0.5 * (lo + hi);
  return { hurdle, residual: f(hurdle) - targetPrice };
}

export interface PairDecomposition {
  holdYears: number;
  noiEntry: number;
  noiExit: number;
  entryState: DecompState;
  exitState: DecompState;
  hurdleEntry: number;
  hurdleExit: number;
  result: DecompositionResult; // legs {fundamentals, debt, equity}, entryPrice, exitPrice, deltaP
  verify: {
    sigmaLegs: number;
    footError: number; // Σlegs − ΔP (Shapley efficiency ⇒ ≈ 0)
    entryPriceError: number; // engine entry price − observed entry deed price (inversion residual)
    exitPriceError: number; // engine exit price − observed exit deed price
  };
}

const YEAR_MS = 365.25 * 86_400_000;

/** A recovered LTV must be a sane fraction; outside this the loan/price attribution is unreliable. */
export const isSaneLtv = (ltv: number) => ltv >= 0 && ltv < 0.95;

/** Decompose the price move of one same-BBL deed pair into the three forces, calibrated to real prices. */
export function decomposePair(entry: DeedEnd, exit: DeedEnd): PairDecomposition {
  if (!isSaneLtv(entry.ltv) || !isSaneLtv(exit.ltv)) {
    throw new Error(`decomposePair: LTV out of [0,0.95) (entry ${entry.ltv}, exit ${exit.ltv}) — filter unreliable loan/price attributions before decomposing`);
  }
  const holdYears = (Date.parse(exit.date) - Date.parse(entry.date)) / YEAR_MS;

  // NOI: impute the going-in level from price × cap proxy; grow it over the ACTUAL hold (fundamentals).
  const noiEntry = entry.price * PROXY.capRate;
  const noiExit = noiEntry * Math.pow(1 + PROXY.noiGrowth, holdYears);

  // debt vector: REAL ltv + proxied rate (time-varying) / spread / convexity.
  const debtEntry: Debt = { rf: rateProxy(entry.date), gamma: PROXY.creSpread, d: PROXY.leverageConvexity, ltv: entry.ltv };
  const debtExit: Debt = { rf: rateProxy(exit.date), gamma: PROXY.creSpread, d: PROXY.leverageConvexity, ltv: exit.ltv };

  // required-return: invert each end to its real observed price.
  const hEntry = invertHurdle(noiEntry, debtEntry, entry.price);
  const hExit = invertHurdle(noiExit, debtExit, exit.price);

  const entryState: DecompState = { goingInNOI: noiEntry, debt: debtEntry, hurdle: hEntry.hurdle };
  const exitState: DecompState = { goingInNOI: noiExit, debt: debtExit, hurdle: hExit.hurdle };

  const result = decompose(entryState, exitState, TEMPLATE);
  const sigmaLegs = result.legs.fundamentals + result.legs.debt + result.legs.equity;

  return {
    holdYears, noiEntry, noiExit, entryState, exitState,
    hurdleEntry: hEntry.hurdle, hurdleExit: hExit.hurdle,
    result,
    verify: {
      sigmaLegs,
      footError: sigmaLegs - result.deltaP,
      entryPriceError: result.entryPrice - entry.price,
      exitPriceError: result.exitPrice - exit.price,
    },
  };
}
