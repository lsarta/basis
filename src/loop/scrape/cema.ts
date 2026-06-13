// CEMA recovery — the hard read. BUILT DURING BUILD DAY.
//
// Algorithm provenance: the "most-recent consolidation in the active chain" idea derives from
// the author's prior Python research; this TS implementation, the recency selection (a bug-fix
// over the prior code's max-AMOUNT selection), the spreader-based blanket detection, and the
// commitment-vs-funded guard are Build Day work. Pure functions over already-fetched data —
// network/resolution lives in extract.ts, so this file is unit-testable offline.

import type { Classification } from "./types.ts";

export type Bucket = "DEED" | "MTGE" | "CONSOL" | "AGMT" | "ASSIGN" | "SAT" | "SPRD" | "OTHER";

export function bucketOf(docType: string): Bucket {
  const t = docType.toUpperCase();
  if (t === "DEED") return "DEED";
  if (t === "MTGE") return "MTGE";
  if (t === "M&CON" || t === "MCON") return "CONSOL"; // CEMA core: consolidated senior
  if (t === "AGMT") return "AGMT"; // overloaded; sometimes the consolidated total
  if (t === "ASST") return "ASSIGN"; // assignment (CEMA signature)
  if (t === "SAT" || t === "SATIS") return "SAT"; // payoff
  if (t === "SPRD") return "SPRD"; // spreader agreement = blanket signature
  return "OTHER";
}

export interface Instrument {
  document_id: string;
  doc_type: string;
  amount: number | null;
  recorded_datetime: string;
}

/** A consolidation candidate, resolved with the parcels it touches and whether a spreader spans them. */
export interface Candidate extends Instrument {
  bbls: string[]; // distinct BBLs the candidate's Legals span
  hasSpreader: boolean; // a SPRD with the same amount exists on those parcels
  satisfied?: boolean; // a later SAT retired this lien (active-chain filter)
}

const WINDOW_BACK_DAYS = 60;
const WINDOW_FWD_DAYS = 120;
const COMMITMENT_RATIO = 1.2; // recorded mortgage this much over price => commitment, not funded balance

const dayMs = 86_400_000;
function daysBetween(a: string, b: string): number {
  return (Date.parse(a) - Date.parse(b)) / dayMs;
}
export function inDeedWindow(recorded: string, deedDate: string): boolean {
  const d = daysBetween(recorded, deedDate);
  return d >= -WINDOW_BACK_DAYS && d <= WINDOW_FWD_DAYS;
}

/** A candidate is a blanket iff it cross-collateralizes >1 parcel via a spreader (SPRD). */
export function isBlanketCandidate(c: Candidate): boolean {
  return c.bbls.length > 1 && c.hasSpreader;
}

/**
 * Select the live senior: MOST-RECENT consolidation in the active chain (recency, NOT magnitude —
 * the fix over the prior max-amount selection). Drops satisfied liens. Tiebreak on equal dates:
 * prefer CONSOL (M&CON) over AGMT, then the larger amount (same closing package).
 */
export function selectSenior(candidates: Candidate[]): Candidate | null {
  const active = candidates.filter((c) => !c.satisfied && (c.amount ?? 0) > 0);
  if (active.length === 0) return null;
  return active.slice().sort((a, b) => {
    const dt = Date.parse(b.recorded_datetime) - Date.parse(a.recorded_datetime);
    if (dt !== 0) return dt; // most recent first
    const ba = bucketOf(a.doc_type) === "CONSOL" ? 0 : 1;
    const bb = bucketOf(b.doc_type) === "CONSOL" ? 0 : 1;
    if (ba !== bb) return ba - bb; // prefer M&CON over AGMT
    return (b.amount ?? 0) - (a.amount ?? 0); // then larger
  })[0];
}

export interface FinancingResult {
  classification: Extract<Classification, "cema_consolidation" | "blanket_not_attributable" | "commitment_not_funded"> | null;
  amount: number | null;
  amount_reliable: boolean;
  source_doc_id: string | null;
  source_doc_type: string | null;
  naive_loan: number | null; // recorded-mortgage-only figure (the trap) — provenance, never a model input
  blanket_bbls: string[];
}

/**
 * Classify the financing on a trade from the windowed instruments and the resolved consolidation
 * candidates. Priority: blanket (refuse) > consolidated senior (recover) > commitment anomaly
 * (refuse the over-stated commitment) > purchase-money/all-cash (no flag, debt-quantity only).
 */
export function classifyFinancing(args: {
  price: number | null;
  windowInstruments: Instrument[];
  candidates: Candidate[]; // already filtered to CONSOL(amt>0) + AGMT(amt>gap), resolved
}): FinancingResult {
  const { price, windowInstruments, candidates } = args;
  const mtges = windowInstruments.filter((i) => bucketOf(i.doc_type) === "MTGE" && (i.amount ?? 0) > 0);
  const naive_loan = mtges.length ? mtges.reduce((s, m) => s + (m.amount ?? 0), 0) : null;

  // 1. Blanket — any candidate spread across parcels via a spreader. Refuse; never attribute.
  const blanket = candidates.find(isBlanketCandidate);
  if (blanket) {
    return {
      classification: "blanket_not_attributable",
      amount: null,
      amount_reliable: false,
      source_doc_id: blanket.document_id,
      source_doc_type: blanket.doc_type,
      naive_loan,
      blanket_bbls: blanket.bbls,
    };
  }

  // 2. Consolidated senior — the recovered CEMA loan (recency-selected).
  const senior = selectSenior(candidates);
  if (senior) {
    return {
      classification: "cema_consolidation",
      amount: senior.amount,
      amount_reliable: true,
      source_doc_id: senior.document_id,
      source_doc_type: senior.doc_type,
      naive_loan,
      blanket_bbls: [],
    };
  }

  // 3. Commitment-not-funded — a recorded mortgage materially exceeding the price is a commitment
  //    ceiling, not a funded balance. Refuse the amount (do not feed it to the model).
  const maxMtge = mtges.slice().sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0];
  if (maxMtge && price && (maxMtge.amount ?? 0) > price * COMMITMENT_RATIO) {
    return {
      classification: "commitment_not_funded",
      amount: null,
      amount_reliable: false,
      source_doc_id: maxMtge.document_id,
      source_doc_type: maxMtge.doc_type,
      naive_loan,
      blanket_bbls: [],
    };
  }

  // 4. Purchase-money or all-cash — no refusal class; debt quantity (if any) handled by the caller.
  return {
    classification: null,
    amount: null,
    amount_reliable: false,
    source_doc_id: maxMtge?.document_id ?? null,
    source_doc_type: maxMtge?.doc_type ?? null,
    naive_loan,
    blanket_bbls: [],
  };
}
