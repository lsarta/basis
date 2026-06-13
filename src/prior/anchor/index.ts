// Layer 2 — the terminal fundamentals anchor.
//
// The terminal node is priced as the STEADY-STATE FIXED POINT of the Layer-1 solve:
// an asset whose NOI grows at g forever, financed under the neutral regime Φ*, re-sold each
// period at a price that also grows at g. Imposing H=1, NOI_1 = NOI_0(1+g), P_next = P(1+g)
// in Eq. (3) and solving for P gives (derivation):
//
// P = NOI_1 / D, D = (1−LTV*)(1+ρ*) + LTV*(1+k_d*) − (1+g)
//
// where NOI_1 = NOI_0(1+g) is the forward (year-1) NOI. D is the FORWARD neutral cap rate
// (NOI_1 / P), matching the model's cap-rate convention c_k ≡ NOI_{k,1}/P_k.
//
// ── Cap convention: FORWARD (resolved). ─────────────────────────────────────────────────
// c* = NOI_1/P_N = D is the forward cap, consistent with,
// Eq. (4) (now in forward form) and Eq. (5). The earlier Eq.(4)/Eq.(5) conflict (Eq. 4 had
// been written in trailing form, D/(1+g), which combined with Eq. 5 overpriced by (1+g)) was
// fixed in in favour of forward, with §3.4 as the tiebreaker. `neutralCapTrailing`
// (= D/(1+g)) is retained only for reconciling against trailing-quoted comps. ─────────────

import { type FinancingVector, debtCost } from "../engine/types.ts";

/**
 * Steady-state denominator D = (1−LTV*)(1+ρ*) + LTV*(1+k_d*) − (1+g).
 * Equivalently D = (ρ* − g) + LTV*·(k_d* − ρ*) — the unlevered cap (ρ*−g) plus the
 * leverage term LTV*·(k_d*−ρ*) that the §4.4 sign cross-check is about.
 */
export function terminalDenominator(fv: FinancingVector, g: number): number {
  const kd = debtCost(fv);
  const D = (1 - fv.ltv) * (1 + fv.hurdle) + fv.ltv * (1 + kd) - (1 + g);
  if (D <= 0) {
    throw new Error(
      `terminal denominator D=${D} ≤ 0 (ρ*=${fv.hurdle}, g=${g}, ltv=${fv.ltv}, k_d=${kd}); ` +
        `price would be non-positive/infinite`,
    );
  }
  return D;
}

/** Forward neutral cap rate c* = NOI_1/P_N = D (canonical; convention). */
export function neutralCap(fv: FinancingVector, g: number): number {
  return terminalDenominator(fv, g);
}

/** Trailing neutral cap = NOI_0/P_N = D/(1+g) = as currently written. */
export function neutralCapTrailing(fv: FinancingVector, g: number): number {
  return terminalDenominator(fv, g) / (1 + g);
}

/**
 * Terminal price P_N = NOI_N·(1+g) / c* (Eq. 5, forward convention).
 * This is the exact steady-state fixed point of the Layer-1 solve (proven in the test).
 */
export function terminalPrice(
  noiN: number,
  g: number,
  fv: FinancingVector,
): number {
  return (noiN * (1 + g)) / neutralCap(fv, g);
}
