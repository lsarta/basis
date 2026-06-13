// Corpus pipeline — REPLAY-GATED. BUILT DURING BUILD DAY.
//
// Sweeps a window of Manhattan AP (apartment-building) deeds, extracts each trade (deed price +
// CEMA-recovered loan + cohort), gates every row through the structural gate, and partitions into
// admitted / flagged (flagged rows are LOGGED, never silently dropped). REFUSES to run unless the
// gold replay is GREEN — ungated scraped data never enters the model.

import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fetchCandidateDeeds } from "./acris.ts";
import { extractParcel } from "./extract.ts";
import { structuralGate } from "./gate.ts";
import { replayResult } from "./replay.ts";
import { CACHE_DIR } from "./cache.ts";
import type { ScrapedRow } from "./types.ts";

export interface FlaggedRow {
  row: ScrapedRow;
  flags: string[];
}
export interface WindowResult {
  from: string;
  to: string;
  deeds: number;
  admitted: ScrapedRow[];
  flagged: FlaggedRow[];
}

/** Throws unless the gold replay reproduces every attempted fixture. The gate before the model. */
export async function assertReplayGreen(): Promise<void> {
  const r = await replayResult();
  if (!r.allPass) {
    throw new Error(
      `gold replay is RED (${r.passed}/${r.total} attempted) — corpus pull BLOCKED. ` +
        `Run \`npm run scrape:replay\`, fix the extraction, then retry.`,
    );
  }
}

/**
 * Sweep one window of Manhattan AP deeds and gate every produced row. Idempotent/resumable via the
 * cache (re-runs read from disk). Writes admitted.jsonl / flagged.jsonl under data/raw/acris/.
 */
export async function runWindow(opts: { from: string; to: string; limit?: number }): Promise<WindowResult> {
  await assertReplayGreen(); // gate before model

  const deeds = await fetchCandidateDeeds(opts);
  const admitted: ScrapedRow[] = [];
  const flagged: FlaggedRow[] = [];

  for (const d of deeds) {
    let rows: ScrapedRow[] = [];
    try {
      rows = await extractParcel(d.bbl, { deedDocId: d.master.document_id });
    } catch (e) {
      flagged.push({ row: stubRow(d.bbl, d.master.document_id), flags: [`extraction error: ${(e as Error).message}`] });
      continue;
    }
    for (const row of rows) {
      const gate = structuralGate(row);
      if (gate.admitted) admitted.push(row);
      else flagged.push({ row, flags: gate.flags });
    }
  }

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(join(CACHE_DIR, "admitted.jsonl"), admitted.map((r) => JSON.stringify(r)).join("\n") + "\n");
  writeFileSync(join(CACHE_DIR, "flagged.jsonl"), flagged.map((f) => JSON.stringify(f)).join("\n") + "\n");

  return { from: opts.from, to: opts.to, deeds: deeds.length, admitted, flagged };
}

function stubRow(bbl: string, document_id: string): ScrapedRow {
  return {
    bbl, document_id, doc_type: "DEED", classification: "arms_length_purchase", amount: null, amount_reliable: false,
    channel: null, lender: null, debt: { loan_amount: null, ltv: null, coupon: null }, cohort: "higher-for-longer",
    price: null, recovery_source_doc_id: null, recovery_doc_type: null, naive_loan: null, blanket_bbls: [],
    recorded_datetime: "", address: "", property_type: "",
  };
}
