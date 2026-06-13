// Layer 4 — three-leg Shapley attribution of price change.
//
// The decomposition operates on the single-state forward-to-anchor pricing map Π (
// §5.1): given a fundamentals level F, a debt vector Φ^debt and a hurdle ρ, Π prices a buyer
// who buys, holds `hold` years (NOI growing at `growth`), and sells at the Layer-2 anchor
// terminal price (under the fixed neutral regime Φ*). Crucially the anchor depends only on
// fundamentals + Φ*, NOT on Φ^debt or ρ — so the capital-markets coordinates enter Π only
// through the node solve, which is what makes the matched-regime invariant exact (§5.5).
//
// ΔP = Π(F_1, Φ^debt_1, ρ_1) − Π(F_0, Φ^debt_0, ρ_0), attributed by the SHAPLEY VALUE over
// the players {F, Φ^debt, ρ} — averaged marginal contribution over all orderings, so the legs
// sum to ΔP EXACTLY (Shapley efficiency) with no stranded interaction term (NOT a path).
//
// ── DOCUMENTED SEAM ─────────────────────────────────────────────────────
// The Shapley engine below takes an arbitrary list of `Coordinate` players over disjoint
// fields of the pricing assignment. The 3-leg version uses [fundamentals, debt, equity]. To
// split the debt leg into {rate, spread, LTV} later, swap the single `debt` coordinate for
// three coordinates (`rate`→rf, `spread`→γ,d, `ltv_availability`→ltv) — NO re-derivation, the
// same engine runs over the larger player set. `debtSplitCoordinates` builds them; wiring a
// nested sub-Shapley that sums to the 3-leg debt leg is left as the seam. ─────────────────

import { type RateType, type FinancingVector } from "../engine/types.ts";
import { solveClosedForm, equityCashflows, irr, leveredNPV } from "../engine/solve.ts";
import { terminalPrice, neutralCap } from "../anchor/index.ts";
import {
  type DecompositionRecord,
  type BuyerArchetype,
  buildFinancingRecord,
} from "../record/types.ts";
import type { NOISourceKind } from "../noi/types.ts";

/** The full set of pricing inputs a Shapley assignment fixes. */
export interface Assignment {
  goingInNOI: number; // fundamentals level
  rf: number;
  gamma: number;
  d: number;
  ltv: number;
  hurdle: number;
}

/** Fixed template shared by both endpoints (everything that is NOT a moving player). */
export interface DecompTemplate {
  hold: number;
  growth: number; // per-period NOI growth over the hold
  g: number; // long-run terminal growth for the anchor
  neutral: FinancingVector; // Φ*, held fixed across all counterfactuals
  rate_type: RateType;
}

/** One Shapley player: a set of assignment fields with an entry value and an exit value. */
export interface Coordinate {
  name: string;
  entry: Partial<Assignment>;
  exit: Partial<Assignment>;
}

/** A capital-markets state (debt-side vector + hurdle) plus the fundamentals level. */
export interface DecompState {
  goingInNOI: number;
  debt: { rf: number; gamma: number; d: number; ltv: number };
  hurdle: number;
}

/** Π — the single-state forward-to-anchor price. */
export function priceState(a: Assignment, t: DecompTemplate): number {
  const noiHold: number[] = [];
  for (let k = 1; k <= t.hold; k++) noiHold.push(a.goingInNOI * Math.pow(1 + t.growth, k));
  const terminalNOI = a.goingInNOI * Math.pow(1 + t.growth, t.hold);
  const pAnchor = terminalPrice(terminalNOI, t.g, t.neutral); // depends only on F + Φ*
  const fv: FinancingVector = {
    rf: a.rf, gamma: a.gamma, d: a.d, ltv: a.ltv, hurdle: a.hurdle, rate_type: t.rate_type,
  };
  return solveClosedForm(noiHold, fv, pAnchor);
}

function factorial(n: number): number {
  let f = 1;
  for (let i = 2; i <= n; i++) f *= i;
  return f;
}

/** All permutations of [0..n-1] (n small: 3 players → 6, 5 players → 120). */
function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  const out: number[][] = [];
  const rec = (prefix: number[], rest: number[]) => {
    if (rest.length === 0) { out.push(prefix); return; }
    for (let i = 0; i < rest.length; i++) {
      rec([...prefix, rest[i]], [...rest.slice(0, i), ...rest.slice(i + 1)]);
    }
  };
  rec([], Array.from({ length: n }, (_, i) => i));
  return out;
}

/**
 * Shapley values over the given coordinates, evaluated through `evalFn`. Returns one value
 * per coordinate name. Sum of values == evalFn(all-exit) − evalFn(all-entry) EXACTLY
 * (efficiency). A coordinate whose entry == exit contributes exactly 0 in every permutation.
 */
export function shapley(
  coords: Coordinate[],
  evalFn: (a: Assignment) => number,
): Record<string, number> {
  const n = coords.length;
 // all-entry base assignment (coords own disjoint fields and together cover all of them)
  let base: Assignment = {} as Assignment;
  for (const c of coords) base = { ...base, ...c.entry } as Assignment;

  const result: Record<string, number> = Object.fromEntries(coords.map((c) => [c.name, 0]));
  for (const perm of permutations(n)) {
    let asg: Assignment = { ...base };
    let prev = evalFn(asg);
    for (const idx of perm) {
      asg = { ...asg, ...coords[idx].exit };
      const cur = evalFn(asg);
      result[coords[idx].name] += cur - prev;
      prev = cur;
    }
  }
  const fact = factorial(n);
  for (const k of Object.keys(result)) result[k] /= fact;
  return result;
}

/** The three-leg player set: fundamentals, debt (rf,γ,d,LTV), equity (ρ). */
export function threeLegCoordinates(entry: DecompState, exit: DecompState): Coordinate[] {
  return [
    { name: "fundamentals", entry: { goingInNOI: entry.goingInNOI }, exit: { goingInNOI: exit.goingInNOI } },
    {
      name: "debt",
      entry: { rf: entry.debt.rf, gamma: entry.debt.gamma, d: entry.debt.d, ltv: entry.debt.ltv },
      exit: { rf: exit.debt.rf, gamma: exit.debt.gamma, d: exit.debt.d, ltv: exit.debt.ltv },
    },
    { name: "equity", entry: { hurdle: entry.hurdle }, exit: { hurdle: exit.hurdle } },
  ];
}

/**
 * SEAM (not wired into the headline 3 legs): the debt coordinate exploded into three.
 * Swapping `threeLegCoordinates`' debt entry for these yields a 5-leaf flat Shapley; a nested
 * sub-Shapley that sums to the 3-leg debt leg is the documented future step.
 */
export function debtSplitCoordinates(entry: DecompState, exit: DecompState): Coordinate[] {
  return [
    { name: "rate", entry: { rf: entry.debt.rf }, exit: { rf: exit.debt.rf } },
    { name: "spread", entry: { gamma: entry.debt.gamma, d: entry.debt.d }, exit: { gamma: exit.debt.gamma, d: exit.debt.d } },
    { name: "ltv_availability", entry: { ltv: entry.debt.ltv }, exit: { ltv: exit.debt.ltv } },
  ];
}

export interface DecompositionResult {
  legs: { fundamentals: number; debt: number; equity: number };
  entryPrice: number;
  exitPrice: number;
  deltaP: number;
}

/** Three-leg Shapley decomposition of ΔP between two states under a fixed template. */
export function decompose(
  entry: DecompState,
  exit: DecompState,
  template: DecompTemplate,
): DecompositionResult {
  const coords = threeLegCoordinates(entry, exit);
  const evalFn = (a: Assignment) => priceState(a, template);

 // endpoints
  let allEntry: Assignment = {} as Assignment;
  let allExit: Assignment = {} as Assignment;
  for (const c of coords) {
    allEntry = { ...allEntry, ...c.entry } as Assignment;
    allExit = { ...allExit, ...c.exit } as Assignment;
  }
  const entryPrice = evalFn(allEntry);
  const exitPrice = evalFn(allExit);

  const phi = shapley(coords, evalFn);
  return {
    legs: { fundamentals: phi.fundamentals, debt: phi.debt, equity: phi.equity },
    entryPrice,
    exitPrice,
    deltaP: exitPrice - entryPrice,
  };
}

export interface DecompMeta {
  schema_version?: string;
  transaction_id: string;
  property_type: string;
  buyer_archetype: BuyerArchetype;
  archetype_confidence?: number;
  noi_source: NOISourceKind;
  noi_imputed?: boolean;
  dates: { entry_date: string; exit_date: string; entry_vintage: string; exit_vintage: string };
}

function stateToFV(s: DecompState, t: DecompTemplate): FinancingVector {
  return { rf: s.debt.rf, gamma: s.debt.gamma, d: s.debt.d, ltv: s.debt.ltv, hurdle: s.hurdle, rate_type: t.rate_type };
}

/**
 * Build a DecompositionRecord with the three legs POPULATED. The entry/exit
 * prices are the single-state forward-to-anchor re-pricings Π(F_i, C_i) (NOT a chain's
 * realised node-to-node prices); delta_price is their difference and the legs sum to it.
 */
export function decompositionRecord(
  entry: DecompState,
  exit: DecompState,
  template: DecompTemplate,
  meta: DecompMeta,
  chain?: { chain_price_entry: number; chain_price_exit: number },
): DecompositionRecord {
  const r = decompose(entry, exit, template);

 // entry-node IRR check (the entry re-pricing solve must deliver the entry hurdle)
  const entryFV = stateToFV(entry, template);
  const noiHoldEntry: number[] = [];
  for (let k = 1; k <= template.hold; k++) noiHoldEntry.push(entry.goingInNOI * Math.pow(1 + template.growth, k));
  const pAnchorEntry = terminalPrice(entry.goingInNOI * Math.pow(1 + template.growth, template.hold), template.g, template.neutral);
  const entryIRR = irr(equityCashflows(r.entryPrice, noiHoldEntry, entryFV, pAnchorEntry));
  const entryResid = leveredNPV(r.entryPrice, noiHoldEntry, entryFV, pAnchorEntry);

  return {
    schema_version: meta.schema_version ?? "1.0.0",
    solver: { method: "closed_form", interest_only: true, irr_check: entryIRR, residual: entryResid },
    transaction_id: meta.transaction_id,
    property_type: meta.property_type,
    buyer_archetype: meta.buyer_archetype,
    ...(meta.archetype_confidence !== undefined ? { archetype_confidence: meta.archetype_confidence } : {}),
    entry_date: meta.dates.entry_date,
    exit_date: meta.dates.exit_date,
    entry_vintage: meta.dates.entry_vintage,
    exit_vintage: meta.dates.exit_vintage,
    hold_years: template.hold,
    noi_source: meta.noi_source,
    in_place_noi_entry: entry.goingInNOI,
    in_place_noi_exit: exit.goingInNOI,
    noi_imputed: meta.noi_imputed ?? false,
    terminal_g: template.g,
    repricing_value_entry: r.entryPrice,
    repricing_value_exit: r.exitPrice,
    delta_price: r.deltaP,
    implied_entry_cap: (entry.goingInNOI * (1 + template.growth)) / r.entryPrice,
    implied_exit_cap: (exit.goingInNOI * (1 + template.growth)) / r.exitPrice,
    implied_neutral_cap: neutralCap(template.neutral, template.g),
    legs: { fundamentals: r.legs.fundamentals, debt: r.legs.debt, equity: r.legs.equity },
    financing_entry: buildFinancingRecord(entryFV),
    financing_exit: buildFinancingRecord(stateToFV(exit, template)),
    financing_neutral: buildFinancingRecord(template.neutral),
    ...(chain !== undefined ? { chain } : {}),
  };
}
