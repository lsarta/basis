// ACRIS three-dataset join. BUILT DURING BUILD DAY.
//
// Method reimplemented (not copied) from the author's prior Python research
// (~/triptych/analysis/transactions/gate1_nyc_join.py): drive from Master, resolve Legals
// for BBL + property_type, pull all instruments on a parcel, resolve Parties. Join on document_id.
//
//   Master  bnx9-e6tj  document_id, doc_type, document_amt, recorded_datetime, document_date, percent_trans
//   Legals  8h5j-fqxa  document_id -> borough/block/lot (BBL), property_type, street_number/name, easement
//   Parties 636b-3b5g  document_id -> name, party_type (1=grantor/seller, 2=grantee/buyer or lender)

import { sodaPage, sodaAll } from "./soda.ts";
import type { SodaRow } from "./types.ts";

export const MASTER = "bnx9-e6tj";
export const LEGALS = "8h5j-fqxa";
export const PARTIES = "636b-3b5g";

/** A 10-digit BBL = borough(1) + block(5, zero-padded) + lot(4, zero-padded). */
export function bblOf(legal: SodaRow): string {
  const boro = String(legal.borough ?? "").trim();
  const block = String(legal.block ?? "").trim().padStart(5, "0");
  const lot = String(legal.lot ?? "").trim().padStart(4, "0");
  return `${boro}${block}${lot}`;
}

export function splitBbl(bbl: string): { borough: string; block: string; lot: string } {
  return { borough: bbl.slice(0, 1), block: bbl.slice(1, 6), lot: bbl.slice(6, 10) };
}

const num = (x: string | undefined): number | null => {
  if (x === undefined || x === null || String(x).trim() === "") return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
};
export const amt = (row: SodaRow): number | null => num(row.document_amt);

function quoteIn(values: string[]): string {
  return "(" + values.map((v) => `'${v.replace(/'/g, "''")}'`).join(",") + ")";
}

/** Every Legals record for one document — paged to EXHAUSTION (blanket detection depends on it). */
export async function legalsForDocument(documentId: string): Promise<SodaRow[]> {
  return sodaAll(LEGALS, {
    $select: "document_id,borough,block,lot,property_type,street_number,street_name,easement,air_rights",
    $where: `document_id='${documentId}'`,
  });
}

/** Distinct BBLs a document touches (>1 => blanket / cross-collateralized). */
export async function bblsForDocument(documentId: string): Promise<string[]> {
  const legs = await legalsForDocument(documentId);
  return [...new Set(legs.map(bblOf))].sort();
}

/** Every document_id recorded against a parcel (full instrument history), paged to exhaustion. */
export async function documentsOnBbl(bbl: string): Promise<string[]> {
  const { borough, block, lot } = splitBbl(bbl);
  // Try zero-padded block/lot first; ACRIS Legals stores them padded.
  const legs = await sodaAll(LEGALS, {
    $select: "document_id",
    $where: `borough='${borough}' AND block='${block}' AND lot='${lot}'`,
  });
  return [...new Set(legs.map((l) => l.document_id))];
}

/** Master records for a set of document_ids (chunked IN-lists). */
export async function mastersForDocuments(ids: string[]): Promise<SodaRow[]> {
  const out: SodaRow[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const got = await sodaPage(MASTER, {
      $select: "document_id,doc_type,document_amt,recorded_datetime,document_date,percent_trans,recorded_borough",
      $where: `document_id in ${quoteIn(chunk)}`,
      $limit: 5000,
    });
    out.push(...got);
  }
  return out;
}

export async function masterForDocument(documentId: string): Promise<SodaRow | null> {
  const rows = await mastersForDocuments([documentId]);
  return rows[0] ?? null;
}

/** Parties on a document, optionally filtered to a party_type ("1"=grantor/seller, "2"=grantee/buyer/lender). */
export async function partiesForDocument(documentId: string, partyType?: string): Promise<SodaRow[]> {
  const rows = await sodaAll(PARTIES, {
    $select: "document_id,name,party_type,address_1,city,state,zip",
    $where: `document_id='${documentId}'`,
  });
  return partyType ? rows.filter((r) => r.party_type === partyType) : rows;
}

/**
 * Corpus driver: recent Manhattan (borough='1') apartment-building (property_type='AP') deeds.
 * Single-parcel, real consideration, percent_trans=100. Returns deeds joined to their Legals.
 * NOTE: the corpus AP/Manhattan filter lives HERE and is never applied to the gold replay.
 */
export async function fetchCandidateDeeds(opts: {
  from: string; // ISO date inclusive
  to: string; // ISO date exclusive
  limit?: number;
}): Promise<Array<{ master: SodaRow; legal: SodaRow; bbl: string }>> {
  const deeds = await sodaAll(MASTER, {
    $select: "document_id,doc_type,document_amt,recorded_datetime,document_date,percent_trans",
    $where:
      `doc_type='DEED' AND document_amt>1000000 AND document_amt<2000000000 AND percent_trans=100 ` +
      `AND recorded_datetime>='${opts.from}T00:00:00' AND recorded_datetime<'${opts.to}T00:00:00'`,
    $order: "recorded_datetime desc",
  });
  const picked: Array<{ master: SodaRow; legal: SodaRow; bbl: string }> = [];
  const seenBbl = new Set<string>();
  for (const d of deeds) {
    const legs = await legalsForDocument(d.document_id);
    if (legs.length !== 1) continue; // exclude portfolio / multi-parcel deeds
    const L = legs[0];
    if (L.borough !== "1") continue; // Manhattan, off Legals
    if (L.easement === "Y") continue;
    if (L.property_type !== "AP") continue; // APARTMENT BUILDING = institutional multifamily
    const bbl = bblOf(L);
    if (seenBbl.has(bbl)) continue; // one trade per parcel in the sample
    seenBbl.add(bbl);
    picked.push({ master: d, legal: L, bbl });
    if (opts.limit && picked.length >= opts.limit) break;
  }
  return picked;
}
