// Financing vector Φ and the convex debt cost (Eq. 1).

export type RateType = "fixed" | "floating";

/** The financing vector Φ carried by a node. Market-level, vintage-dated. */
export interface FinancingVector {
 /** base / risk-free rate */
  rf: number;
 /** γ — base CRE credit spread */
  gamma: number;
 /** leverage-convexity coefficient (Eq. 1) */
  d: number;
 /** attainable loan-to-value, in [0, 1) */
  ltv: number;
 /** ρ — required levered IRR hurdle (equity leg) */
  hurdle: number;
 /** regime variable, NOT a buyer attribute */
  rate_type: RateType;
}

/**
 * Convex debt cost, Pagliari (2019) Eq. (1):
 * k_d = rf + γ + d · (LTV / (1 − LTV) )
 * Depends on the financing vector only — NOT on price.
 */
export function debtCost(fv: FinancingVector): number {
  if (fv.ltv < 0 || fv.ltv >= 1) {
    throw new Error(`ltv must be in [0, 1), got ${fv.ltv}`);
  }
  return fv.rf + fv.gamma + fv.d * (fv.ltv / (1 - fv.ltv));
}
