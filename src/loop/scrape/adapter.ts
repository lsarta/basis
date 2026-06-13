// ScrapedRow -> grader Prediction. BUILT DURING BUILD DAY.
//
// The single projection into the grader's contract. Mirrors src/grader goldAsPredictions
// EXACTLY: emit a scored amount only when amount_reliable is true; channel/lender only when
// present (v1: always null). Pure.

import type { Prediction } from "../../grader/types.ts";
import type { ScrapedRow } from "./types.ts";

export function toPrediction(row: ScrapedRow): Prediction {
  return {
    bbl: row.bbl,
    document_id: row.document_id,
    classification: row.classification,
    amount: row.amount_reliable ? row.amount : null, // unreliable => emit nothing (matches the gold discipline)
    channel: row.channel,
    lender: row.lender,
  };
}
