// Pairing census — READ-ONLY analytics. BUILT DURING BUILD DAY.
//
// Answers the only question that decides whether the engine has moves to decompose: how many
// SAME-BBL arms-length deed PAIRS exist per rate cohort, and are they intra-cohort or straddling
// two regimes? Counts deeds + pairs only — NO CEMA extraction, NO model input, NO admitted.jsonl.
// The expensive per-parcel extraction stays gated behind operator go-ahead after these counts.
//
//   npm run scrape:census                 (default span 2016-01 .. 2026-07)
//   node --env-file-if-exists=.env src/loop/scrape/census.ts
//
// Cohort boundaries (recording year), printed in the output so the reader sees them:
//   pre-2020 = 2016-2019 | ZIRP-COVID = 2020-2021 | hiking = 2022-2023 | higher-for-longer = 2024-2026

import { sodaKeyset, sodaPage } from "./soda.ts";
import { MASTER, LEGALS, legalsForDocuments, bblOf } from "./acris.ts";
import type { SodaRow } from "./types.ts";
import { cohortOf, COHORTS } from "./cohort.ts";
import type { RateCohort } from "./types.ts";

const G = "\x1b[32m", Y = "\x1b[33m", C = "\x1b[36m", DIM = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";
const rule = (n = 100) => DIM + "─".repeat(n) + X;
const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

const COHORT_RANGE: Record<RateCohort, string> = {
  "pre-2020": "2016-2019",
  "ZIRP-COVID": "2020-2021",
  "hiking": "2022-2023",
  "higher-for-longer": "2024-2026",
};

interface APDeed { document_id: string; amount: number; date: string; bbl: string; }
interface Pair { bbl: string; entryCohort: RateCohort; exitCohort: RateCohort; holdYears: number; straddle: boolean; }

const YEAR_MS = 365.25 * 86_400_000;
const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

async function main(): Promise<void> {
  const FROM = process.argv[2] ?? "2016-01-01";
  const TO = process.argv[3] ?? "2026-07-01";
  console.log(`${B}Basis — pairing census${X}  ${DIM}span ${FROM} .. ${TO}  |  Manhattan, AP-touching deeds${X}`);
  console.log(`${DIM}cohorts (recording year): ${COHORTS.map((c) => `${c} ${COHORT_RANGE[c]}`).join("  |  ")}${X}`);
  console.log(`${DIM}read-only; SODA cache-first; NO extraction, NO model input…${X}\n`);

  // 1. AP-touching document universe (Manhattan, property_type=AP). Keyset-paged at 5000/page
  //    (~3s each; deep $offset on the property_type filter times out). Dedup doc_ids into a Set.
  const apLegals = await sodaKeyset(LEGALS, { where: "borough='1' AND property_type='AP'", select: "document_id", pageSize: 5000, label: "AP legals" });
  const apDocs = new Set(apLegals.map((r) => r.document_id));

  // 2. arms-length-ish deed universe (deed-level proxy: DEED + $ band + percent_trans=100), pulled
  //    PER YEAR (date-filtered single pages — avoids the slow document_id-ordered 10-year scan).
  const startY = Number(FROM.slice(0, 4)), endY = Number(TO.slice(0, 4));
  const masterDeeds: SodaRow[] = [];
  for (let y = startY; y <= endY; y++) {
    const lo = `${y}-01-01T00:00:00`, hi = `${y + 1}-01-01T00:00:00`;
    const page = await sodaPage(MASTER, {
      $select: "document_id,document_amt,recorded_datetime",
      $where:
        `doc_type='DEED' AND recorded_borough='1' AND document_amt>1000000 AND document_amt<2000000000 ` +
        `AND percent_trans=100 AND recorded_datetime>='${lo}' AND recorded_datetime<'${hi}' ` +
        `AND recorded_datetime>='${FROM}T00:00:00' AND recorded_datetime<'${TO}T00:00:00'`,
      $limit: 50000,
    });
    masterDeeds.push(...page);
    process.stderr.write(`\r  deeds ${startY}-${y}: ${masterDeeds.length.toLocaleString()}…   `);
  }
  process.stderr.write("\n");

  // 3. candidates = deeds that touch an AP parcel.
  const candidates = masterDeeds.filter((d) => apDocs.has(d.document_id));

  // 4. PORTFOLIO DETECTION — fetch ALL Legals (every property type) per candidate; count TOTAL distinct
  //    BBLs. single-parcel ONLY when total distinct BBLs == 1 (one AP + any non-AP parcel => portfolio).
  const legals = await legalsForDocuments(candidates.map((d) => d.document_id), "portfolio legals");
  const parcelsByDoc = new Map<string, { all: Set<string>; ap: Set<string> }>();
  for (const l of legals) {
    let e = parcelsByDoc.get(l.document_id);
    if (!e) { e = { all: new Set(), ap: new Set() }; parcelsByDoc.set(l.document_id, e); }
    const bbl = bblOf(l);
    e.all.add(bbl);
    if (l.property_type === "AP") e.ap.add(bbl);
  }

  const single: APDeed[] = [];
  let portfolio = 0;
  for (const d of candidates) {
    const e = parcelsByDoc.get(d.document_id);
    if (!e || e.all.size === 0) continue;
    if (e.all.size === 1) single.push({ document_id: d.document_id, amount: Number(d.document_amt), date: d.recorded_datetime, bbl: [...e.all][0] });
    else portfolio++; // multi-parcel / portfolio — never paired (a blended price is not a single-building move)
  }

  // 5. group single-parcel AP deeds by BBL; consecutive-by-date pairs.
  const byBbl = new Map<string, APDeed[]>();
  for (const d of single) {
    let arr = byBbl.get(d.bbl);
    if (!arr) { arr = []; byBbl.set(d.bbl, arr); }
    arr.push(d);
  }
  const pairs: Pair[] = [];
  let parcelsWith2 = 0;
  let fullSpanZtoH = 0; // parcels with a ZIRP deed and a LATER higher-for-longer deed (intervening sales ignored)
  for (const [bbl, ds] of byBbl) {
    if (ds.length < 2) continue;
    parcelsWith2++;
    ds.sort((a, b) => a.date.localeCompare(b.date));
    for (let i = 0; i + 1 < ds.length; i++) {
      const entryCohort = cohortOf(ds[i].date), exitCohort = cohortOf(ds[i + 1].date);
      pairs.push({ bbl, entryCohort, exitCohort, holdYears: (Date.parse(ds[i + 1].date) - Date.parse(ds[i].date)) / YEAR_MS, straddle: entryCohort !== exitCohort });
    }
    // full-span ZIRP-entry -> HFL-exit (a 2020 sale and a 2025 sale count even with a 2022 sale between)
    const hasZirp = ds.some((d) => cohortOf(d.date) === "ZIRP-COVID");
    const lastHfl = [...ds].reverse().find((d) => cohortOf(d.date) === "higher-for-longer");
    if (hasZirp && lastHfl && ds.some((d) => cohortOf(d.date) === "ZIRP-COVID" && d.date < lastHfl.date)) fullSpanZtoH++;
  }

  // ── REPORT ──
  console.log(`${B}${masterDeeds.length.toLocaleString()}${X} Manhattan deeds in span  →  ${B}${candidates.length.toLocaleString()}${X} touch an AP parcel  →  ` +
    `${G}${single.length.toLocaleString()} single-parcel AP deeds${X}  ${Y}${portfolio.toLocaleString()} portfolio/multi-parcel (excluded from pairing)${X}`);

  // deeds per cohort
  console.log("\n" + rule());
  console.log(`  ${B}single-parcel AP deeds per cohort${X} ${DIM}(the population that can form moves)${X}`);
  const deedsByCohort = new Map<RateCohort, number>();
  for (const d of single) deedsByCohort.set(cohortOf(d.date), (deedsByCohort.get(cohortOf(d.date)) ?? 0) + 1);
  for (const c of COHORTS) {
    const n = deedsByCohort.get(c) ?? 0;
    console.log(`  ${pad(c, 20)} ${pad(COHORT_RANGE[c], 11)} ${padL(n.toLocaleString(), 6)}  ${DIM}${"▮".repeat(Math.round(n / 60))}${X}`);
  }

  // pairs by exit cohort (the move's regime) + intra/straddle + holding period
  console.log("\n" + rule());
  console.log(`  ${B}same-BBL deed PAIRS by EXIT cohort${X} ${DIM}(the move's regime; the engine decomposes each pair)${X}`);
  console.log(`  ${DIM}${pad("exit cohort", 20)}${pad("range", 11)}${padL("pairs", 7)}${padL("intra", 8)}${padL("straddle", 10)}${padL("hold med/mean (yr)", 22)}${X}`);
  for (const c of COHORTS) {
    const ex = pairs.filter((p) => p.exitCohort === c);
    const intra = ex.filter((p) => !p.straddle).length;
    const holds = ex.map((p) => p.holdYears);
    const hi = c === "ZIRP-COVID" || c === "higher-for-longer" ? `${C}` : "";
    console.log(`  ${hi}${pad(c, 20)}${X}${pad(COHORT_RANGE[c], 11)}${padL(String(ex.length), 7)}${padL(String(intra), 8)}${padL(String(ex.length - intra), 10)}${padL(`${median(holds).toFixed(1)} / ${mean(holds).toFixed(1)}`, 22)}`);
  }
  const intraTotal = pairs.filter((p) => !p.straddle).length;
  console.log(`  ${DIM}total pairs ${pairs.length}  (${intraTotal} intra-cohort, ${pairs.length - intraTotal} straddle); ${parcelsWith2.toLocaleString()} parcels with ≥2 deeds${X}`);

  // entry -> exit straddle matrix
  console.log("\n" + rule());
  console.log(`  ${B}entry → exit straddle matrix${X} ${DIM}(rows = entry cohort, cols = exit cohort; diagonal = intra-cohort)${X}`);
  console.log(`  ${DIM}${pad("entry ↓ / exit →", 20)}${COHORTS.map((c) => padL(c.slice(0, 9), 11)).join("")}${X}`);
  for (const er of COHORTS) {
    const cells = COHORTS.map((ec) => {
      const n = pairs.filter((p) => p.entryCohort === er && p.exitCohort === ec).length;
      const star = er === "ZIRP-COVID" && ec === "higher-for-longer" ? `${C}*` : er === ec ? `${DIM}` : "";
      return `${star}${padL(String(n), er === "ZIRP-COVID" && ec === "higher-for-longer" ? 10 : 11)}${X}`;
    });
    console.log(`  ${pad(er, 20)}${cells.join("")}`);
  }

  // the headline corner
  const adjacentZtoH = pairs.filter((p) => p.entryCohort === "ZIRP-COVID" && p.exitCohort === "higher-for-longer").length;
  console.log("\n" + rule());
  console.log(`  ${B}${C}headline corner — ZIRP-entry (2020-2021) → higher-for-longer-exit (2024-2026)${X}`);
  console.log(`  ${C}${padL(String(adjacentZtoH), 5)}${X} adjacent pairs ${DIM}(consecutive sales: bought ZIRP, sold next in HFL)${X}`);
  console.log(`  ${C}${padL(String(fullSpanZtoH), 5)}${X} full-span parcels ${DIM}(a ZIRP sale and a later HFL sale, even with an intervening sale between)${X}`);
  console.log(`  ${DIM}this is the cleanest regime-transition move for the demo: zero-rate purchase priced out in higher-for-longer.${X}`);

  // go / no-go
  console.log("\n" + rule());
  const zirpExit = pairs.filter((p) => p.exitCohort === "ZIRP-COVID").length;
  const hflExit = pairs.filter((p) => p.exitCohort === "higher-for-longer").length;
  const ok = zirpExit > 0 && hflExit > 0;
  console.log(`  ${ok ? G : Y}${B}contrast cohorts populated: ZIRP-exit ${zirpExit} pairs, HFL-exit ${hflExit} pairs${X}`);
  console.log(`  ${DIM}NEXT (gated): per-parcel CEMA extraction on the paired parcels feeds the engine — awaiting go-ahead. No extraction run here.${X}`);
}

await main();
