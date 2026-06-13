// The gate. BUILT DURING BUILD DAY.
//
// Two tiers, both reusing src/grader (the authoritative contract):
//   structuralGate(row)  — rule-validates an arbitrary corpus row against the grader's invariants
//                          (no per-row truth). Flagged rows are excluded but logged, never dropped.
//   goldReplay (replay.ts) — runs the real grade() against the 17 fixtures (method validation).

import { BLOCK_A_CLASSES, REFUSAL_CLASSES } from "../../grader/types.ts";
import { isTakeoutChannel, requiredCoreTokens } from "../../grader/normalize.ts";
import type { ScrapedRow, GateOutcome, Classification } from "./types.ts";

const VALID_CLASSES: ReadonlySet<string> = new Set<Classification>([
  "cema_consolidation", "blanket_not_attributable", "arms_length_purchase",
  "takeout_regional_bank", "takeout_new_securitization",
  "still_outstanding", "commitment_not_funded", "coop_unit_deed", "non_arms_length",
]);

const usable = (amount: number | null): boolean => amount !== null && amount !== 0;

/**
 * Structural gate for the general corpus: validate a row against the grader's invariants
 * WITHOUT a per-row truth. Every failure is a named flag (held out + logged, never silently dropped).
 */
export function structuralGate(row: ScrapedRow): GateOutcome {
  const flags: string[] = [];

  if (!VALID_CLASSES.has(row.classification)) flags.push(`classification not in closed enum: ${row.classification}`);

  // channel: literal closed enum where present (v1 emits null)
  if (row.channel !== null && !isTakeoutChannel(row.channel)) flags.push(`channel not a literal enum value: ${JSON.stringify(row.channel)}`);

  // amount present iff amount_reliable
  if (row.amount_reliable && !usable(row.amount)) flags.push("amount_reliable=true but no usable amount emitted");
  if (!row.amount_reliable && usable(row.amount)) flags.push(`usable amount on amount_reliable=false row: ${row.amount}`);

  // refusal => no dollar; not-attributable amount must never reach debt.loan_amount (model input)
  if (REFUSAL_CLASSES.has(row.classification) && usable(row.amount)) flags.push(`refusal emitted a dollar: ${row.amount}`);
  if (!row.amount_reliable && row.debt.loan_amount !== null) flags.push(`not-attributable amount leaked into debt.loan_amount: ${row.debt.loan_amount}`);

  // takeout lender (if present) must normalize to a core token
  if (row.lender !== null && requiredCoreTokens(row.lender).length === 0) flags.push("takeout lender yields no core token");

  // key discipline: Block A may have an empty bbl; Block B may not
  if (!BLOCK_A_CLASSES.has(row.classification) && row.bbl.trim() === "") flags.push("Block-B row has empty bbl");

  return { admitted: flags.length === 0, flags };
}

/** Classes the v1 scrape ATTEMPTS (the hard gate) vs DEFERS (shown reason-tagged, never silently skipped). */
export const ATTEMPTED_CLASSES: ReadonlySet<string> = new Set([
  "arms_length_purchase", "cema_consolidation", "blanket_not_attributable",
  "non_arms_length", "commitment_not_funded",
]);
export const DEFERRED_REASON: Record<string, string> = {
  takeout_regional_bank: "v2 — takeout channel/lender is debt-COUPON inference (loan quantity + LTV are recovered now)",
  takeout_new_securitization: "v2 — takeout channel/lender is debt-COUPON inference (loan quantity + LTV are recovered now)",
  still_outstanding: "v2 — pari-passu split note; no clean single amount in the public document_amt",
  // NOT a v1 extraction gap — a soft gold label. The parcel records in public ACRIS as CR/F1 with
  // family-trust grantors, i.e. reads as a non-arms-length family disposition. Both labels exclude
  // the comp from the engine, so the model input is unchanged either way.
  coop_unit_deed: "deferred — gold label not reproducible from public ACRIS; parcel records as non-arms-length family disposition",
};
