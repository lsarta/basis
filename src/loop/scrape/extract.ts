// Extraction driver (IO). BUILT DURING BUILD DAY.
//
// Two entry points, both producing grader-shaped ScrapedRows:
//   extractParcel(bbl)    — deed-driven: recover this trade's financing (senior selection,
//                           blanket/commitment), emit the deed row + the financing row.
//   extractDocument(id)   — document-driven: a standalone consolidation (the empty-bbl CEMAs).
// Network goes through acris.ts (cache-first); the classification logic is the pure cema/classify/row.

import {
  documentsOnBbl, mastersForDocuments, masterForDocument, legalsForDocument,
  bblsForDocument, partiesForDocument, bblOf, amt,
} from "./acris.ts";
import {
  bucketOf, classifyFinancing, inDeedWindow, type Candidate, type Instrument,
} from "./cema.ts";
import { classifyDeed } from "./classify.ts";
import { assembleRow, type RowParts } from "./row.ts";
import type { ScrapedRow, SodaRow } from "./types.ts";

const toInstrument = (m: SodaRow): Instrument => ({
  document_id: m.document_id,
  doc_type: m.doc_type ?? "",
  amount: amt(m),
  recorded_datetime: m.recorded_datetime ?? "",
});

const addressOf = (legal: SodaRow | undefined): string =>
  legal ? `${legal.street_number ?? ""} ${legal.street_name ?? ""}`.trim() : "";

/** Does a spreader (SPRD) of this amount sit on any of these parcels? => blanket signature. */
async function hasSpreaderForAmount(bbls: string[], amount: number | null): Promise<boolean> {
  if (amount === null) return false;
  for (const bbl of bbls) {
    const masters = await mastersForDocuments(await documentsOnBbl(bbl));
    if (masters.some((m) => bucketOf(m.doc_type ?? "") === "SPRD" && Math.abs((amt(m) ?? NaN) - amount) < 1)) {
      return true;
    }
  }
  return false;
}

/** Resolve a consolidation instrument into a Candidate (parcels touched + spreader present). */
async function resolveCandidate(instr: Instrument): Promise<Candidate> {
  const bbls = await bblsForDocument(instr.document_id);
  const hasSpreader = bbls.length > 1 ? await hasSpreaderForAmount(bbls, instr.amount) : false;
  return { ...instr, bbls, hasSpreader };
}

/**
 * Deed-driven extraction for one parcel. If `deedDocId` is given it is used as the trade deed
 * (replay pins the gold deed); otherwise the most-recent real deed on the parcel is the trade.
 */
export async function extractParcel(bbl: string, opts: { deedDocId?: string } = {}): Promise<ScrapedRow[]> {
  const ids = await documentsOnBbl(bbl);
  const masters = await mastersForDocuments(ids);
  const instruments = masters.map(toInstrument);

  const deeds = masters.filter((m) => bucketOf(m.doc_type ?? "") === "DEED" && (amt(m) ?? 0) > 0);
  const deedMaster = opts.deedDocId
    ? masters.find((m) => m.document_id === opts.deedDocId)
    : deeds.slice().sort((a, b) => (b.recorded_datetime ?? "").localeCompare(a.recorded_datetime ?? ""))[0];
  if (!deedMaster) return []; // no qualifying deed — caller handles document-driven cases

  const deedDate = deedMaster.recorded_datetime ?? "";
  const price = amt(deedMaster);
  const deedLegals = await legalsForDocument(deedMaster.document_id);
  const deedLegal = deedLegals[0];
  const propertyType = deedLegal?.property_type ?? "";
  const address = addressOf(deedLegal);

  // window the trade
  const windowInstruments = instruments.filter((i) => i.recorded_datetime && inDeedWindow(i.recorded_datetime, deedDate));
  const gap = windowInstruments
    .filter((i) => bucketOf(i.doc_type) === "MTGE" && (i.amount ?? 0) > 0)
    .reduce((s, m) => s + (m.amount ?? 0), 0);
  const rawCandidates = windowInstruments.filter((i) => {
    const b = bucketOf(i.doc_type);
    if (b === "CONSOL") return (i.amount ?? 0) > 0;
    if (b === "AGMT") return (i.amount ?? 0) > 0 && (i.amount ?? 0) > gap; // AGMT-overload guard
    return false;
  });
  const candidates: Candidate[] = [];
  for (const c of rawCandidates) candidates.push(await resolveCandidate(c));

  const fin = classifyFinancing({ price, windowInstruments, candidates });

  // deed-row classification (coop / non-arms / arms-length)
  const grantors = (await partiesForDocument(deedMaster.document_id, "1")).map((p) => p.name ?? "");
  const grantees = (await partiesForDocument(deedMaster.document_id, "2")).map((p) => p.name ?? "");
  const deedClass = classifyDeed({ propertyType, grantorNames: grantors, granteeNames: grantees });

  const cemaReliable = fin.classification === "cema_consolidation";
  const rows: ScrapedRow[] = [];

  rows.push(assembleRow({
    bbl, document_id: deedMaster.document_id, doc_type: deedMaster.doc_type ?? "DEED",
    classification: deedClass,
    amount: deedClass === "arms_length_purchase" ? price : null,
    amount_reliable: deedClass === "arms_length_purchase",
    price,
    recoveredLoan: cemaReliable ? fin.amount : null,
    recoveredLoanReliable: cemaReliable,
    recorded_datetime: deedDate, property_type: propertyType, address,
    recovery_source_doc_id: fin.source_doc_id, recovery_doc_type: fin.source_doc_type,
    naive_loan: fin.naive_loan, blanket_bbls: fin.blanket_bbls,
  }));

  // financing row (cema / blanket / commitment), keyed on the recovered/selected document
  if (fin.classification && fin.source_doc_id) {
    const srcMaster = masters.find((m) => m.document_id === fin.source_doc_id);
    rows.push(assembleRow({
      bbl, document_id: fin.source_doc_id, doc_type: fin.source_doc_type ?? srcMaster?.doc_type ?? "",
      classification: fin.classification,
      amount: fin.amount, amount_reliable: fin.amount_reliable,
      price: null,
      recoveredLoan: cemaReliable ? fin.amount : null, recoveredLoanReliable: cemaReliable,
      recorded_datetime: srcMaster?.recorded_datetime ?? deedDate, property_type: propertyType, address,
      recovery_source_doc_id: fin.source_doc_id, recovery_doc_type: fin.source_doc_type,
      naive_loan: fin.naive_loan, blanket_bbls: fin.blanket_bbls,
    }));
  }
  return rows;
}

/** Document-driven extraction: a standalone consolidation document (the empty-bbl gold CEMAs). */
export async function extractDocument(docId: string): Promise<ScrapedRow[]> {
  const master = await masterForDocument(docId);
  if (!master) return [];
  const legals = await legalsForDocument(docId);
  const bbls = [...new Set(legals.map(bblOf))].sort();
  const instr = toInstrument(master);
  const candidate = await resolveCandidate(instr);

  const fin = classifyFinancing({ price: null, windowInstruments: [instr], candidates: [candidate] });
  // For a standalone consolidation, classifyFinancing yields blanket (if spreader) or cema (senior).
  const cls = fin.classification ?? "cema_consolidation";
  const reliable = cls === "cema_consolidation";

  return [assembleRow({
    bbl: bbls.length === 1 ? bbls[0] : "", // multi-parcel consolidation: keyed by document_id (bbl left empty)
    document_id: docId, doc_type: master.doc_type ?? "",
    classification: cls,
    amount: reliable ? instr.amount : null, amount_reliable: reliable,
    price: null,
    recoveredLoan: reliable ? instr.amount : null, recoveredLoanReliable: reliable,
    recorded_datetime: master.recorded_datetime ?? "", property_type: legals[0]?.property_type ?? "",
    address: addressOf(legals[0]),
    recovery_source_doc_id: fin.source_doc_id ?? docId, recovery_doc_type: master.doc_type ?? "",
    naive_loan: fin.naive_loan, blanket_bbls: cls === "blanket_not_attributable" ? bbls : [],
  })];
}
