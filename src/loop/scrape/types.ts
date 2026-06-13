// ACRIS scrape — types. BUILT DURING BUILD DAY (not prior work).
//
// The scrape emits rows in the grader's contract (src/grader/types.ts is authoritative).
// ScrapedRow is a SUPERSET of the grader's Prediction: it carries every grader-scored field
// plus public-record provenance (never scored) and the engine-facing debt/price payload.

import type { Classification, TakeoutChannel } from "../../grader/types.ts";

export type { Classification, TakeoutChannel };

/** Raw SODA rows are loosely typed maps of string fields. */
export type SodaRow = Record<string, string>;

/** Rate-vintage cohort, derived from recording date. User-locked, calendar-year cuts. */
export type RateCohort = "pre-2020" | "ZIRP-COVID" | "hiking" | "higher-for-longer";

/** ACRIS doc_type buckets used by CEMA recovery. */
export const DOC = {
  DEED: new Set(["DEED"]),
  MTGE: new Set(["MTGE"]), // a recorded mortgage — often only the new-money gap note
  CONSOL: new Set(["M&CON", "MCON"]), // CEMA core: the consolidated senior lives here
  AGMT: new Set(["AGMT"]), // overloaded: the consolidated total is sometimes recorded here
  ASSIGN: new Set(["ASST"]), // assignment of mortgage (old note -> new lender; a CEMA signature)
  SAT: new Set(["SAT", "SATIS"]), // satisfaction / payoff (chain-termination signal)
} as const;

/**
 * The debt the parcel carries on this trade. Quantity (loan_amount, ltv) is recovered now
 * from public records and is load-bearing; coupon is a v2 inference (cohort rate proxy /
 * takeout channel). `coupon: null` does NOT mean "no debt" — the LTV is real.
 */
export interface DebtTerms {
  loan_amount: number | null; // CEMA-recovered consolidated senior; null = all-cash / not attributable
  ltv: number | null; // loan_amount / price; null when price unknown; 0 when genuinely all-cash
  coupon: number | null; // ALWAYS null in v1 — deferred to v2 (do not synthesize)
}

/** One scraped instrument, in the grader's schema + provenance + engine payload. */
export interface ScrapedRow {
  // ── identity (grader join key) ──
  bbl: string; // "" allowed for document_id-keyed Block-A CEMAs
  document_id: string;

  // ── grader-scored semantics (must match GoldRow field meanings) ──
  doc_type: string;
  classification: Classification;
  amount: number | null; // the modeled dollar figure for THIS instrument; null = emitted nothing
  amount_reliable: boolean; // amount scored iff true; refusal/blanket/flags => false + amount null
  channel: TakeoutChannel | null; // v1: always null (deferred coupon inference)
  lender: string | null; // v1: always null (deferred)

  // ── engine payload ──
  debt: DebtTerms;
  cohort: RateCohort;
  price: number | null; // arms-length deed consideration

  // ── provenance — NEVER scored; for audit + the dry-run CEMA render ──
  recovery_source_doc_id: string | null; // which instrument the recovered amount came from
  recovery_doc_type: string | null; // "M&CON" | "AGMT" | "MTGE" | null
  naive_loan: number | null; // recorded-mortgage-only figure (the trap), for the naive-vs-recovered diff
  blanket_bbls: string[]; // >1 distinct BBL => blanket; row becomes a refusal
  recorded_datetime: string;
  address: string;
  property_type: string;
}

/** Outcome of the structural gate on one row. */
export interface GateOutcome {
  admitted: boolean;
  flags: string[]; // reasons a row was held out; empty when admitted
}
