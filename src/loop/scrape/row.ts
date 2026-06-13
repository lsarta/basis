// ScrapedRow assembly + invariant enforcement. BUILT DURING BUILD DAY.
//
// The single place where amount_reliable is turned into the model contract:
// amount_reliable=false => NO usable amount reaches the scored `amount` field OR debt.loan_amount.
// A not-attributable / commitment / blanket dollar is recorded only as provenance (naive_loan),
// never as a model input. Pure — no IO.

import type { Classification, RateCohort, ScrapedRow, DebtTerms } from "./types.ts";
import { REFUSAL_CLASSES } from "../../grader/types.ts";
import { cohortOf } from "./cohort.ts";

const REFUSAL = REFUSAL_CLASSES; // { blanket_not_attributable }

export interface RowParts {
  bbl: string;
  document_id: string;
  doc_type: string;
  classification: Classification;
  /** The modeled dollar for THIS instrument (price for a deed, senior for a cema). */
  amount: number | null;
  amount_reliable: boolean;
  /** The trade price (for ltv); independent of `amount`. */
  price: number | null;
  /** The recovered consolidated senior (reliable cema only); excluded when not attributable. */
  recoveredLoan: number | null;
  recoveredLoanReliable: boolean;
  recorded_datetime: string;
  property_type: string;
  address: string;
  recovery_source_doc_id: string | null;
  recovery_doc_type: string | null;
  naive_loan: number | null;
  blanket_bbls: string[];
}

/** Compute debt terms; coupon is ALWAYS null in v1 (deferred). Quantity excluded when unreliable. */
function debtFor(parts: RowParts): DebtTerms {
  // Only a reliable recovered senior is a usable loan quantity. Blanket / commitment / unreliable
  // amounts are not attributable and must NOT enter the model as debt.
  const loan_amount = parts.recoveredLoanReliable ? parts.recoveredLoan : null;
  let ltv: number | null;
  if (loan_amount !== null && parts.price) ltv = loan_amount / parts.price;
  else if (loan_amount === null && parts.recovery_source_doc_id === null) ltv = 0; // genuinely all-cash
  else ltv = null; // debt exists but is not attributable (blanket / commitment) — unknown, not zero
  return { loan_amount, ltv, coupon: null };
}

/**
 * Assemble a ScrapedRow, enforcing the amount_reliable contract. A refusal class
 * (blanket_not_attributable) or any unreliable amount yields a null scored `amount`.
 */
export function assembleRow(parts: RowParts): ScrapedRow {
  const isRefusal = REFUSAL.has(parts.classification);
  const reliable = parts.amount_reliable && !isRefusal;
  const amount = reliable ? parts.amount : null; // unreliable / refusal => emit nothing
  const cohort: RateCohort = cohortOf(parts.recorded_datetime);

  return {
    bbl: parts.bbl,
    document_id: parts.document_id,
    doc_type: parts.doc_type,
    classification: parts.classification,
    amount,
    amount_reliable: reliable,
    channel: null, // v1: deferred coupon inference
    lender: null, // v1: deferred
    debt: debtFor(parts),
    cohort,
    price: parts.price,
    recovery_source_doc_id: parts.recovery_source_doc_id,
    recovery_doc_type: parts.recovery_doc_type,
    naive_loan: parts.naive_loan,
    blanket_bbls: parts.blanket_bbls,
    recorded_datetime: parts.recorded_datetime,
    address: parts.address,
    property_type: parts.property_type,
  };
}
