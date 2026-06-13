// Basis data-quality gate — types. BUILT DURING BUILD DAY (not prior work).
//
// The grader scores an extraction's output (predictions) against the disclosed
// gold set (goldset.csv). Scraped data never enters the model until it passes.
// Every type and rule here is read off GRADER_SPEC.md — see that doc for the
// seven non-negotiable rules. This file is data only; logic lives in grade.ts.

/** The closed set of classification tokens that appear in the gold set. */
export type Classification =
  | "cema_consolidation"
  | "blanket_not_attributable"
  | "arms_length_purchase"
  | "takeout_regional_bank"
  | "takeout_new_securitization"
  | "still_outstanding"
  | "commitment_not_funded"
  | "coop_unit_deed"
  | "non_arms_length";

/**
 * Block A keys on `document_id`; Block B keys on `(bbl, document_id)` (GRADER_SPEC §1, §2).
 * Block membership is decided by classification — NOT by doc_type — because the
 * same doc_type (AGMT) appears in both blocks.
 */
export const BLOCK_A_CLASSES: ReadonlySet<string> = new Set([
  "cema_consolidation",
  "blanket_not_attributable",
]);

/** Refusal classifications: a positive label, distinguishable from a whiff (GRADER_SPEC §7). */
export const REFUSAL_CLASSES: ReadonlySet<string> = new Set([
  "blanket_not_attributable",
]);

/**
 * `takeout_channel` is a TWO-VALUE CLOSED ENUM, matched as a LITERAL with NO
 * normalization (GRADER_SPEC §5). A trailing space or a missing hyphen must FAIL.
 */
export const TAKEOUT_CHANNELS = [
  "regional-bank balance sheet",
  "new-securitization",
] as const;
export type TakeoutChannel = (typeof TAKEOUT_CHANNELS)[number];

/** One row of the gold set, parsed. `note` is documentation and is NEVER scored (§6). */
export interface GoldRow {
  /** May be "" for the document_id-keyed Block-A CEMAs — an empty bbl is a VALID state, not missing. */
  bbl: string;
  document_id: string;
  doc_type: string;
  true_classification: string;
  /** null when blank in the fixture. Scored only where `amount_reliable` is true (§3). */
  true_amount: number | null;
  /** "" when not a takeout. Populated on exactly the 3 takeout rows (§5). */
  takeout_channel: string;
  /** "" when not a takeout. */
  takeout_lender: string;
  amount_reliable: boolean;
  /** Free-text human documentation. Deliberately contains dollar figures. NEVER scored (§6). */
  note: string;
}

/**
 * What an extraction emits for ONE instrument, identified by (bbl, document_id).
 * `amount` accepts number | numeric string so we can detect a "usable modeled amount"
 * regardless of how the engine renders it. A missing/null amount means "emitted nothing".
 */
export interface Prediction {
  bbl?: string;
  document_id: string;
  classification?: string | null;
  amount?: number | string | null;
  channel?: string | null;
  lender?: string | null;
}

export type FieldName = "classification" | "amount" | "channel" | "lender";
export type FieldStatus = "pass" | "fail" | "not-scored";

export interface FieldResult {
  field: FieldName;
  status: FieldStatus;
  expected?: string;
  got?: string;
  reason?: string;
}

export interface RowResult {
  bbl: string;
  document_id: string;
  classification: string;
  /** Short address tag pulled from the note, for human-readable output only. */
  label: string;
  block: "A" | "B";
  keyField: "document_id" | "(bbl,document_id)";
  amount_reliable: boolean;
  pass: boolean;
  fields: FieldResult[];
  /** Human-readable failure reasons (empty when the row passes). */
  reasons: string[];
}

export interface GradeReport {
  total: number;
  passed: number;
  failed: number;
  allPass: boolean;
  rows: RowResult[];
}
