// Layer 1 — the forward-node price solve (interest-only baseline).
//
// Levered IRR is the OUTPUT, not an input: we solve for the price P that makes the
// levered IRR equal the buyer's hurdle ρ — equivalently, NPV-at-hurdle = 0.
//
// Two independent implementations that must agree (invariant gate 1):
// • solveClosedForm — exploiting linearity in P (IO baseline).
// • solveNumerical — a general root-find on NPV(P), exploiting nothing.

import { type FinancingVector, debtCost } from "./types.ts";

/**
 * Levered equity NPV at the hurdle for a candidate price P (, Eq. 2),
 * interest-only baseline (debt balance constant = D, debt service = k_d·D each year).
 *
 * NPV(P) = −E + Σ_{t=1..H} (NOI_t − DS)/(1+ρ)^t + (P_exit − D)/(1+ρ)^H
 * with E = P(1−LTV), D = LTV·P, DS = k_d·D.
 *
 * Strictly decreasing in P (higher price ⇒ lower IRR ⇒ lower NPV at fixed hurdle).
 */
export function leveredNPV(
  price: number,
  noi: number[],
  fv: FinancingVector,
  pExit: number,
): number {
  const rho = fv.hurdle;
  const H = noi.length;
  const kd = debtCost(fv);
  const D = fv.ltv * price;
  const E = price * (1 - fv.ltv);
  const DS = kd * D;

  let npv = -E;
  for (let t = 1; t <= H; t++) {
    let cf = noi[t - 1] - DS;
    if (t === H) cf += pExit - D;
    npv += cf / Math.pow(1 + rho, t);
  }
  return npv;
}

/**
 * Closed-form solve (Eq. 3). Because k_d is independent of price, NPV-at-hurdle
 * is linear in P:
 *
 * Σ_{t=1..H} a_t·NOI_t + a_H·P_exit
 * P = ───────────────────────────────────────
 * (1 − LTV) + LTV·(k_d·A + a_H )
 *
 * a_t = (1+ρ)^{−t}, A = Σ a_t, a_H = (1+ρ)^{−H}.
 */
export function solveClosedForm(
  noi: number[],
  fv: FinancingVector,
  pExit: number,
): number {
  const rho = fv.hurdle;
  const H = noi.length;
  if (H < 1) throw new Error("noi must have at least one period");

  let A = 0;
  let pvNOI = 0;
  for (let t = 1; t <= H; t++) {
    const a = Math.pow(1 + rho, -t);
    A += a;
    pvNOI += a * noi[t - 1];
  }
  const aH = Math.pow(1 + rho, -H);
  const kd = debtCost(fv);

  const numerator = pvNOI + aH * pExit;
  const denominator = (1 - fv.ltv) + fv.ltv * (kd * A + aH);
  return numerator / denominator;
}

export interface NumericalOptions {
 /** absolute tolerance on the bracket width (price units) */
  tol?: number;
 /** max bisection iterations */
  maxIter?: number;
}

/**
 * General numerical solve: root-find on NPV(P) = 0 by bracketing + bisection.
 * Exploits only monotonicity (NPV decreasing in P), not the closed form — so agreement
 * with solveClosedForm is a genuine cross-check (invariant gate 1).
 */
export function solveNumerical(
  noi: number[],
  fv: FinancingVector,
  pExit: number,
  opts: NumericalOptions = {},
): number {
  const tol = opts.tol ?? 1e-7;
  const maxIter = opts.maxIter ?? 200;
  const npv = (p: number) => leveredNPV(p, noi, fv, pExit);

 // NPV(0) > 0 (positive PV of NOI + resale, no outlay). Expand hi until NPV(hi) < 0.
  let lo = 0;
  let hi = Math.max(1, pExit);
  let guard = 0;
  while (npv(hi) > 0) {
    hi *= 2;
    if (++guard > 1000) throw new Error("failed to bracket root (NPV never crosses zero)");
  }

  for (let i = 0; i < maxIter; i++) {
    const mid = 0.5 * (lo + hi);
    if (npv(mid) > 0) lo = mid;
    else hi = mid;
    if (hi - lo < tol) break;
  }
  return 0.5 * (lo + hi);
}

export interface SolveResult {
  price: number;
 /** NPV-at-hurdle residual at the solved price; ~0 confirms IRR == hurdle. */
  residual: number;
  method: "closed_form" | "numerical";
}

/** Solve via the closed form and report the residual (the IO baseline path). */
export function solveNode(
  noi: number[],
  fv: FinancingVector,
  pExit: number,
): SolveResult {
  const price = solveClosedForm(noi, fv, pExit);
  return { price, residual: leveredNPV(price, noi, fv, pExit), method: "closed_form" };
}

/**
 * The levered equity cash-flow stream at a given price (IO baseline):
 * [ −E, (NOI_1 − DS), …, (NOI_H − DS) + (P_exit − D) ].
 * Its IRR equals the hurdle when `price` is the solved price.
 */
export function equityCashflows(
  price: number,
  noi: number[],
  fv: FinancingVector,
  pExit: number,
): number[] {
  const kd = debtCost(fv);
  const D = fv.ltv * price;
  const DS = kd * D;
  const cf: number[] = [-price * (1 - fv.ltv)];
  for (let t = 1; t <= noi.length; t++) {
    let c = noi[t - 1] - DS;
    if (t === noi.length) c += pExit - D;
    cf.push(c);
  }
  return cf;
}

/**
 * IRR of a cash-flow stream (index = period), by bracketing + bisection. Assumes a
 * conventional stream (outflow then inflows) so NPV is monotone decreasing in the rate.
 * Used to independently confirm the solved price delivers the hurdle (irr_check).
 */
export function irr(cashflows: number[], tol = 1e-12, maxIter = 300): number {
  const npvAt = (r: number) =>
    cashflows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);

  let lo = -0.9; // rates below −90% are not meaningful here
  let hi = 1.0;
  let guard = 0;
  while (npvAt(hi) > 0) {
    hi *= 2;
    if (++guard > 1000) throw new Error("IRR: failed to bracket (no upper sign change)");
  }
  if (npvAt(lo) < 0) throw new Error("IRR: NPV already negative at lower bound");

  for (let i = 0; i < maxIter; i++) {
    const mid = 0.5 * (lo + hi);
    const v = npvAt(mid);
    if (v > 0) lo = mid;
    else hi = mid;
    if (hi - lo < tol) break;
  }
  return 0.5 * (lo + hi);
}
