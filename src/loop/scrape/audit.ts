// Grounding audit. BUILT DURING BUILD DAY.
//
// For each ATTEMPTED gold row that the scrape reproduces, independently re-read the public record
// and report whether the gold LABEL is strongly grounded in public ACRIS or is a SOFT label (the
// public read underdetermines or diverges from it). Surfaces which fixtures are publicly grounded
// vs. which carry hand-knowledge — even when the row still passes the grader. Reads cached data.

import { partiesForDocument } from "./acris.ts";
import { ATTEMPTED_CLASSES } from "./gate.ts";
import type { GoldRow } from "../../grader/types.ts";
import type { ScrapedRow } from "./types.ts";

export type Grounding = "grounded" | "soft" | "note";
export interface GroundingResult {
  document_id: string;
  classification: string;
  grounding: Grounding;
  note: string;
}

// Loose (audit-only) non-arms signals — broader than the strict classifier, to catch softness.
const LOOSE_NON_ARMS = [/\bTRUST\b/, /\bFAMILY\b/, /\bESTATE\b/, /IRREVOCABLE/, /\bLIVING\b/, /REVOCABLE/, /\bDECEASED\b/, /\bHEIRS?\b/];

export async function auditAttempted(gold: GoldRow[], byDoc: Map<string, ScrapedRow>): Promise<GroundingResult[]> {
  const out: GroundingResult[] = [];
  for (const g of gold) {
    if (!ATTEMPTED_CLASSES.has(g.true_classification)) continue;
    const sr = byDoc.get(g.document_id);
    if (!sr) { out.push({ document_id: g.document_id, classification: g.true_classification, grounding: "soft", note: "no row produced" }); continue; }

    if (g.true_classification === "arms_length_purchase") {
      const grantors = (await partiesForDocument(sr.document_id, "1")).map((p) => (p.name ?? "").toUpperCase());
      const grantees = new Set((await partiesForDocument(sr.document_id, "2")).map((p) => (p.name ?? "").toUpperCase().trim()));
      const looseHit = grantors.find((gr) => LOOSE_NON_ARMS.some((re) => re.test(gr)));
      const overlap = grantors.find((gr) => grantees.has(gr.trim()));
      if (looseHit) out.push({ document_id: sr.document_id, classification: g.true_classification, grounding: "soft", note: `grantor reads non-arms-ish: "${looseHit}" — labeled arms_length` });
      else if (overlap) out.push({ document_id: sr.document_id, classification: g.true_classification, grounding: "soft", note: `grantor==grantee overlap: "${overlap}"` });
      else if (sr.property_type !== "AP") out.push({ document_id: sr.document_id, classification: g.true_classification, grounding: "note", note: `property_type=${sr.property_type} (not AP — outside the corpus filter)` });
      else out.push({ document_id: sr.document_id, classification: g.true_classification, grounding: "grounded", note: `clean arms-length deed (AP, entity grantor)` });
    } else if (g.true_classification === "cema_consolidation") {
      const parts: string[] = [];
      if (sr.recovery_doc_type === "M&CON") parts.push("M&CON (dedicated consolidation instrument)");
      else parts.push(`recovered from ${sr.recovery_doc_type} (overloaded doc type) — gold doc_type=${g.doc_type} concurs`);
      const multiLot = sr.bbl === "";
      if (multiLot) parts.push("spans multiple lots; keyed by document_id, single-BBL attribution N/A");
      out.push({ document_id: sr.document_id, classification: g.true_classification, grounding: sr.recovery_doc_type === "M&CON" && !multiLot ? "grounded" : "note", note: parts.join("; ") });
    } else if (g.true_classification === "blanket_not_attributable") {
      out.push({ document_id: sr.document_id, classification: g.true_classification, grounding: "grounded", note: `spreader (SPRD) confirmed across ${sr.blanket_bbls.length} BBLs — true blanket` });
    } else if (g.true_classification === "commitment_not_funded") {
      out.push({ document_id: sr.document_id, classification: g.true_classification, grounding: "grounded", note: `recorded commitment ${sr.naive_loan?.toLocaleString("en-US")} exceeds deed price — refused` });
    } else if (g.true_classification === "non_arms_length") {
      const grantors = (await partiesForDocument(sr.document_id, "1")).map((p) => (p.name ?? "").toUpperCase());
      const hit = grantors.find((gr) => LOOSE_NON_ARMS.some((re) => re.test(gr)));
      out.push({ document_id: sr.document_id, classification: g.true_classification, grounding: hit ? "grounded" : "soft", note: hit ? `family/estate grantor: "${hit}"` : "no family/estate signal in grantors — soft" });
    }
  }
  return out;
}
