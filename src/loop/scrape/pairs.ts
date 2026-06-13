// Same-BBL deed pairing — READ-ONLY. BUILT DURING BUILD DAY.
//
// Shared by the census (counts) and the engine wiring (the moves to decompose). Collects
// single-parcel AP deeds (portfolio detection across ALL property types) and forms consecutive
// same-BBL pairs. No extraction, no model input — just dates + BBLs + prices from cached SODA.

import { sodaKeyset, sodaPage } from "./soda.ts";
import { MASTER, LEGALS, legalsForDocuments, bblOf } from "./acris.ts";
import { cohortOf } from "./cohort.ts";
import type { RateCohort, SodaRow } from "./types.ts";

export interface APDeed {
  document_id: string;
  amount: number;
  date: string;
  bbl: string;
}

export interface Pair {
  bbl: string;
  entry: APDeed;
  exit: APDeed;
  entryCohort: RateCohort;
  exitCohort: RateCohort;
  holdYears: number;
  straddle: boolean;
}

export interface DeedCollection {
  totalDeeds: number;
  candidates: number; // AP-touching deeds
  single: APDeed[]; // single-parcel AP deeds
  portfolio: number; // multi-parcel / portfolio deeds (excluded from pairing)
}

const YEAR_MS = 365.25 * 86_400_000;
export const holdYears = (entryDate: string, exitDate: string) => (Date.parse(exitDate) - Date.parse(entryDate)) / YEAR_MS;

/**
 * Collect single-parcel AP deeds over [from,to). Portfolio detection counts a deed's TOTAL distinct
 * BBLs across ALL property types — a deed touching one AP parcel plus a non-AP parcel is multi-parcel,
 * never single-BBL. Cache-first; the heavy first run streams progress to stderr.
 */
export async function collectSingleParcelAPDeeds(from: string, to: string): Promise<DeedCollection> {
  const apLegals = await sodaKeyset(LEGALS, { where: "borough='1' AND property_type='AP'", select: "document_id", pageSize: 5000, label: "AP legals" });
  const apDocs = new Set(apLegals.map((r) => r.document_id));

  const startY = Number(from.slice(0, 4)), endY = Number(to.slice(0, 4));
  const masterDeeds: SodaRow[] = [];
  for (let y = startY; y <= endY; y++) {
    const page = await sodaPage(MASTER, {
      $select: "document_id,document_amt,recorded_datetime",
      $where:
        `doc_type='DEED' AND recorded_borough='1' AND document_amt>1000000 AND document_amt<2000000000 ` +
        `AND percent_trans=100 AND recorded_datetime>='${y}-01-01T00:00:00' AND recorded_datetime<'${y + 1}-01-01T00:00:00' ` +
        `AND recorded_datetime>='${from}T00:00:00' AND recorded_datetime<'${to}T00:00:00'`,
      $limit: 50000,
    });
    masterDeeds.push(...page);
    process.stderr.write(`\r  deeds ${startY}-${y}: ${masterDeeds.length.toLocaleString()}…   `);
  }
  process.stderr.write("\n");

  const candidates = masterDeeds.filter((d) => apDocs.has(d.document_id));
  const legals = await legalsForDocuments(candidates.map((d) => d.document_id), "portfolio legals");
  const parcelsByDoc = new Map<string, Set<string>>();
  for (const l of legals) {
    let s = parcelsByDoc.get(l.document_id);
    if (!s) { s = new Set(); parcelsByDoc.set(l.document_id, s); }
    s.add(bblOf(l));
  }

  const single: APDeed[] = [];
  let portfolio = 0;
  for (const d of candidates) {
    const s = parcelsByDoc.get(d.document_id);
    if (!s || s.size === 0) continue;
    if (s.size === 1) single.push({ document_id: d.document_id, amount: Number(d.document_amt), date: d.recorded_datetime, bbl: [...s][0] });
    else portfolio++; // multi-parcel / portfolio — a blended price is not a single-building move
  }
  return { totalDeeds: masterDeeds.length, candidates: candidates.length, single, portfolio };
}

/** Group single-parcel AP deeds by BBL; form consecutive-by-date pairs tagged by cohort. */
export function buildPairs(single: APDeed[]): { pairs: Pair[]; parcelsWith2: number; byBbl: Map<string, APDeed[]> } {
  const byBbl = new Map<string, APDeed[]>();
  for (const d of single) {
    let arr = byBbl.get(d.bbl);
    if (!arr) { arr = []; byBbl.set(d.bbl, arr); }
    arr.push(d);
  }
  const pairs: Pair[] = [];
  let parcelsWith2 = 0;
  for (const [bbl, ds] of byBbl) {
    if (ds.length < 2) continue;
    parcelsWith2++;
    ds.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i + 1 < ds.length; i++) {
      const entry = ds[i], exit = ds[i + 1];
      const entryCohort = cohortOf(entry.date), exitCohort = cohortOf(exit.date);
      pairs.push({ bbl, entry, exit, entryCohort, exitCohort, holdYears: holdYears(entry.date, exit.date), straddle: entryCohort !== exitCohort });
    }
  }
  return { pairs, parcelsWith2, byBbl };
}
