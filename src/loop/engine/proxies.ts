// Engine input proxies — DOCUMENTED and PUBLIC. BUILT DURING BUILD DAY.
//
// The decomposition engine (src/prior) consumes a financing vector + NOI per state. The LTV is
// REAL (CEMA-recovered from public records). These proxies supply the rest. Every one is a public,
// documented assumption — the prediction-error meter is labeled proxy-based for exactly this reason.
// The regime HEADLINE rests on relative attribution and is robust to the NOI level (brief §4); the
// proxies set magnitudes, not the qualitative split.

import type { FinancingVector, RateType } from "../../prior/engine/types.ts";
import type { DecompTemplate } from "../../prior/decomposition/index.ts";

/**
 * Base rate rf by calendar year — 10-year U.S. Treasury annual average (public, FRED DGS10),
 * rounded. This is the time-varying input that drives the DEBT force: ~1% in ZIRP-COVID vs ~4.3%
 * in higher-for-longer is the cheap→expensive debt transition the headline is about.
 */
const UST10_BY_YEAR: Record<number, number> = {
  2016: 0.018, 2017: 0.023, 2018: 0.029, 2019: 0.021,
  2020: 0.009, 2021: 0.014,
  2022: 0.030, 2023: 0.040,
  2024: 0.042, 2025: 0.043, 2026: 0.043,
};

export function rateProxy(isoDate: string): number {
  const y = Number(isoDate.slice(0, 4));
  return UST10_BY_YEAR[y] ?? 0.030; // fallback to a neutral ~3%
}

/** Multifamily input assumptions (public/market proxies). */
export const PROXY = {
  capRate: 0.05, // going-in cap used to impute NOI = price × capRate (NOI level; split-invariant)
  noiGrowth: 0.03, // per-year NOI growth proxy over the actual hold (the fundamentals driver)
  creSpread: 0.020, // γ — CRE credit spread over the base rate
  leverageConvexity: 0.010, // d — Pagliari Eq.(1) convexity coefficient (matches the engine neutral)
} as const;

export const RATE_TYPE: RateType = "fixed";

/** The neutral regime Φ* (the fixed terminal-anchor financing), shared across all counterfactuals. */
export const NEUTRAL: FinancingVector = {
  rf: 0.030, gamma: 0.020, d: 0.010, ltv: 0.65, hurdle: 0.10, rate_type: RATE_TYPE,
};

/** The forward valuation template: a 10-year hold, NOI growing at the proxy, 2% terminal growth. */
export const TEMPLATE: DecompTemplate = {
  hold: 10,
  growth: PROXY.noiGrowth,
  g: 0.02,
  neutral: NEUTRAL,
  rate_type: RATE_TYPE,
};
