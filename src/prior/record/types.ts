// DecompositionRecord — the serialized contract between the TS engine and the Python
// analysis layer (architecture.md §3). Triptych-local types; no @sugar/* dependency.

import { type FinancingVector, debtCost } from "../engine/types.ts";
import type { NOISourceKind } from "../noi/types.ts";

export type BuyerArchetype = "core" | "value_add" | "private" | "owner_user";

/** Financing vector as recorded: the engine vector plus the computed convex debt cost k_d. */
export interface RecordFinancingVector {
  rf: number;
  gamma: number;
  d: number;
  ltv: number;
  hurdle: number;
  rate_type: "fixed" | "floating";
  /** k_d = rf + γ + d·(LTV/(1−LTV)), Eq. (1) — emitted for audit, recomputable. */
  k_d: number;
}

/** Three legs. null until the Shapley decomposition (Layer 4) populates them. */
export interface Legs {
  fundamentals: number | null;
  debt: number | null;
  equity: number | null;
  /** optional debt-leg split (the documented seam, model.md §5.4) */
  debt_split?: { rate: number; spread: number; ltv_availability: number } | null;
}

export interface DecompositionRecord {
  schema_version: string;
  solver: {
    method: "closed_form" | "numerical";
    interest_only: boolean;
    irr_check: number; // realized levered IRR at the entry node; must equal the entry hurdle
    residual: number; // NPV-at-hurdle residual at the entry node; ~0
  };

  transaction_id: string;
  property_type: string;
  buyer_archetype: BuyerArchetype;
  archetype_confidence?: number;

  entry_date: string;
  exit_date: string;
  entry_vintage: string;
  exit_vintage: string;
  hold_years: number;

  noi_source: NOISourceKind;
  in_place_noi_entry: number;
  in_place_noi_exit: number;
  noi_imputed: boolean;
  terminal_g: number;

  // ── DECOMPOSITION BASIS — re-origination FAIR VALUE Π(vintage), forward-to-anchor
  // (model.md §5.1). This is what the decomposition operates on. These are NOT realized
  // ownership-sequence prices; those, if present, live on `chain` below and must never be
  // conflated with these.
  repricing_value_entry: number; // Π(entry vintage) — fair value under entry conditions
  repricing_value_exit: number; // Π(exit vintage) — fair value under exit conditions
  delta_price: number; // = repricing_value_exit − repricing_value_entry
  implied_entry_cap: number; // forward cap on the entry re-pricing value: NOI_1/Π(entry)
  implied_exit_cap: number; // forward cap on the exit re-pricing value: NOI_1/Π(exit)
  implied_neutral_cap: number; // forward c* = D (model.md Eq. 4)

  legs: Legs;

  financing_entry: RecordFinancingVector;
  financing_exit: RecordFinancingVector;
  financing_neutral: RecordFinancingVector;

  // ── REALIZED CHAIN PRICES (optional, separate construct) ──
  /**
   * Realized ownership-sequence (chain) transaction prices — a SEPARATE construct from the
   * decomposition basis (a chain models actual holds / interim refis). Present only when a
   * chain context is attached. `chain_price_exit` coincides with `repricing_value_exit` by
   * construction (the exit node is re-originated to the anchor); `chain_price_entry` diverges
   * from `repricing_value_entry` (the realized entry price embeds the forced exit — the §4.1
   * circularity the anchor removes). Never use these as the decomposition basis.
   */
  chain?: { chain_price_entry: number; chain_price_exit: number } | null;
}

/** Build the recorded financing vector, computing k_d from Eq. (1). */
export function buildFinancingRecord(fv: FinancingVector): RecordFinancingVector {
  return {
    rf: fv.rf,
    gamma: fv.gamma,
    d: fv.d,
    ltv: fv.ltv,
    hurdle: fv.hurdle,
    rate_type: fv.rate_type,
    k_d: debtCost(fv),
  };
}

/**
 * Validate a record against the §3 schema + the §3.3 invariants. Returns a list of problems;
 * empty list ⇒ conformant. Leg-sum invariants are checked only once legs are populated
 * (they are null at Layer 3, before Shapley).
 */
export function validateRecord(rec: DecompositionRecord, tol = 1e-6): string[] {
  const problems: string[] = [];
  const finite = (x: unknown, name: string) => {
    if (typeof x !== "number" || !Number.isFinite(x)) problems.push(`${name} not a finite number: ${x}`);
  };
  const nonEmpty = (x: unknown, name: string) => {
    if (typeof x !== "string" || x.length === 0) problems.push(`${name} missing/empty`);
  };

  nonEmpty(rec.schema_version, "schema_version");
  nonEmpty(rec.transaction_id, "transaction_id");
  nonEmpty(rec.property_type, "property_type");
  nonEmpty(rec.entry_date, "entry_date");
  nonEmpty(rec.exit_date, "exit_date");
  nonEmpty(rec.entry_vintage, "entry_vintage");
  nonEmpty(rec.exit_vintage, "exit_vintage");

  const archetypes: BuyerArchetype[] = ["core", "value_add", "private", "owner_user"];
  if (!archetypes.includes(rec.buyer_archetype)) problems.push(`bad buyer_archetype: ${rec.buyer_archetype}`);
  const kinds: NOISourceKind[] = ["abs_ee", "scenario", "sugar"];
  if (!kinds.includes(rec.noi_source)) problems.push(`bad noi_source: ${rec.noi_source}`);

  for (const f of ["hold_years", "in_place_noi_entry", "in_place_noi_exit", "terminal_g",
    "repricing_value_entry", "repricing_value_exit", "delta_price",
    "implied_entry_cap", "implied_exit_cap", "implied_neutral_cap"] as const) {
    finite(rec[f], f);
  }
  finite(rec.solver?.irr_check, "solver.irr_check");
  finite(rec.solver?.residual, "solver.residual");

  // delta_price == Π(exit) − Π(entry)
  if (Math.abs(rec.delta_price - (rec.repricing_value_exit - rec.repricing_value_entry)) > tol * Math.max(1, Math.abs(rec.repricing_value_exit))) {
    problems.push("delta_price != repricing_value_exit − repricing_value_entry");
  }

  // optional realized chain prices: finite if present
  if (rec.chain !== undefined && rec.chain !== null) {
    finite(rec.chain.chain_price_entry, "chain.chain_price_entry");
    finite(rec.chain.chain_price_exit, "chain.chain_price_exit");
  }

  // k_d recomputes from Eq. (1) for each financing vector
  for (const [name, fv] of [["entry", rec.financing_entry], ["exit", rec.financing_exit], ["neutral", rec.financing_neutral]] as const) {
    if (!fv) { problems.push(`financing_${name} missing`); continue; }
    const recomputed = fv.rf + fv.gamma + fv.d * (fv.ltv / (1 - fv.ltv));
    if (Math.abs(recomputed - fv.k_d) > 1e-12 * Math.max(1, Math.abs(fv.k_d))) {
      problems.push(`financing_${name}.k_d (${fv.k_d}) != Eq.(1) recompute (${recomputed})`);
    }
  }

  // implied caps positive
  for (const f of ["implied_entry_cap", "implied_exit_cap", "implied_neutral_cap"] as const) {
    if (typeof rec[f] === "number" && rec[f] <= 0) problems.push(`${f} must be > 0, got ${rec[f]}`);
  }

  // legs present (object with the three keys), values number|null
  if (!rec.legs || !("fundamentals" in rec.legs) || !("debt" in rec.legs) || !("equity" in rec.legs)) {
    problems.push("legs object missing fundamentals/debt/equity keys");
  } else {
    const { fundamentals, debt, equity } = rec.legs;
    const populated = fundamentals !== null && debt !== null && equity !== null;
    if (populated) {
      const sum = (fundamentals as number) + (debt as number) + (equity as number);
      if (Math.abs(sum - rec.delta_price) > tol * Math.max(1, Math.abs(rec.delta_price))) {
        problems.push(`legs do not sum to delta_price: ${sum} vs ${rec.delta_price}`);
      }
      const ds = rec.legs.debt_split;
      if (ds) {
        const dsum = ds.rate + ds.spread + ds.ltv_availability;
        if (Math.abs(dsum - (debt as number)) > tol * Math.max(1, Math.abs(debt as number))) {
          problems.push(`debt_split does not sum to debt leg: ${dsum} vs ${debt}`);
        }
      }
    }
  }

  return problems;
}
