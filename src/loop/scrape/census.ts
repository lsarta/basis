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

import { collectSingleParcelAPDeeds, buildPairs } from "./pairs.ts";
import { cohortOf, COHORTS } from "./cohort.ts";
import type { RateCohort } from "./types.ts";

const G = "\x1b[32m", Y = "\x1b[33m", C = "\x1b[36m", DIM = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";
const rule = (n = 100) => DIM + "─".repeat(n) + X;
const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

const COHORT_RANGE: Record<RateCohort, string> = {
  "pre-2020": "2016-2019", "ZIRP-COVID": "2020-2021", "hiking": "2022-2023", "higher-for-longer": "2024-2026",
};

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

  const { totalDeeds, candidates, single, portfolio } = await collectSingleParcelAPDeeds(FROM, TO);
  const { pairs, parcelsWith2, byBbl } = buildPairs(single);

  // full-span ZIRP-entry -> HFL-exit (a 2020 sale and a later HFL sale count even with a 2022 sale between)
  let fullSpanZtoH = 0;
  for (const ds of byBbl.values()) {
    if (ds.length < 2) continue;
    const lastHfl = [...ds].reverse().find((d) => cohortOf(d.date) === "higher-for-longer");
    if (lastHfl && ds.some((d) => cohortOf(d.date) === "ZIRP-COVID" && d.date < lastHfl.date)) fullSpanZtoH++;
  }

  // ── REPORT ──
  console.log(`${B}${totalDeeds.toLocaleString()}${X} Manhattan deeds in span  →  ${B}${candidates.toLocaleString()}${X} touch an AP parcel  →  ` +
    `${G}${single.length.toLocaleString()} single-parcel AP deeds${X}  ${Y}${portfolio.toLocaleString()} portfolio/multi-parcel (excluded from pairing)${X}`);

  console.log("\n" + rule());
  console.log(`  ${B}single-parcel AP deeds per cohort${X} ${DIM}(the population that can form moves)${X}`);
  const deedsByCohort = new Map<RateCohort, number>();
  for (const d of single) deedsByCohort.set(cohortOf(d.date), (deedsByCohort.get(cohortOf(d.date)) ?? 0) + 1);
  for (const c of COHORTS) {
    const n = deedsByCohort.get(c) ?? 0;
    console.log(`  ${pad(c, 20)} ${pad(COHORT_RANGE[c], 11)} ${padL(n.toLocaleString(), 6)}  ${DIM}${"▮".repeat(Math.round(n / 60))}${X}`);
  }

  console.log("\n" + rule());
  console.log(`  ${B}same-BBL deed PAIRS by EXIT cohort${X} ${DIM}(the move's regime; the engine decomposes each pair)${X}`);
  console.log(`  ${DIM}${pad("exit cohort", 20)}${pad("range", 11)}${padL("pairs", 7)}${padL("intra", 8)}${padL("straddle", 10)}${padL("hold med/mean (yr)", 22)}${X}`);
  for (const c of COHORTS) {
    const ex = pairs.filter((p) => p.exitCohort === c);
    const intra = ex.filter((p) => !p.straddle).length;
    const holds = ex.map((p) => p.holdYears);
    const hi = c === "ZIRP-COVID" || c === "higher-for-longer" ? C : "";
    console.log(`  ${hi}${pad(c, 20)}${X}${pad(COHORT_RANGE[c], 11)}${padL(String(ex.length), 7)}${padL(String(intra), 8)}${padL(String(ex.length - intra), 10)}${padL(`${median(holds).toFixed(1)} / ${mean(holds).toFixed(1)}`, 22)}`);
  }
  const intraTotal = pairs.filter((p) => !p.straddle).length;
  console.log(`  ${DIM}total pairs ${pairs.length}  (${intraTotal} intra-cohort, ${pairs.length - intraTotal} straddle); ${parcelsWith2.toLocaleString()} parcels with ≥2 deeds${X}`);

  console.log("\n" + rule());
  console.log(`  ${B}entry → exit straddle matrix${X} ${DIM}(rows = entry cohort, cols = exit cohort; diagonal = intra-cohort)${X}`);
  console.log(`  ${DIM}${pad("entry ↓ / exit →", 20)}${COHORTS.map((c) => padL(c.slice(0, 9), 11)).join("")}${X}`);
  for (const er of COHORTS) {
    const cells = COHORTS.map((ec) => {
      const n = pairs.filter((p) => p.entryCohort === er && p.exitCohort === ec).length;
      const corner = er === "ZIRP-COVID" && ec === "higher-for-longer";
      return `${corner ? `${C}*` : er === ec ? DIM : ""}${padL(String(n), corner ? 10 : 11)}${X}`;
    });
    console.log(`  ${pad(er, 20)}${cells.join("")}`);
  }

  const adjacentZtoH = pairs.filter((p) => p.entryCohort === "ZIRP-COVID" && p.exitCohort === "higher-for-longer").length;
  console.log("\n" + rule());
  console.log(`  ${B}${C}headline corner — ZIRP-entry (2020-2021) → higher-for-longer-exit (2024-2026)${X}`);
  console.log(`  ${C}${padL(String(adjacentZtoH), 5)}${X} adjacent pairs ${DIM}(consecutive sales: bought ZIRP, sold next in HFL)${X}`);
  console.log(`  ${C}${padL(String(fullSpanZtoH), 5)}${X} full-span parcels ${DIM}(a ZIRP sale and a later HFL sale, even with an intervening sale between)${X}`);
  console.log(`  ${DIM}illustrative extreme case for the demo — NOT the statistical basis (the exit-cohort buckets are).${X}`);

  console.log("\n" + rule());
  const zirpExit = pairs.filter((p) => p.exitCohort === "ZIRP-COVID").length;
  const hflExit = pairs.filter((p) => p.exitCohort === "higher-for-longer").length;
  console.log(`  ${zirpExit > 0 && hflExit > 0 ? G : Y}${B}contrast cohorts populated: ZIRP-exit ${zirpExit} pairs, HFL-exit ${hflExit} pairs${X}`);
  console.log(`  ${DIM}NEXT (gated): per-parcel CEMA extraction on the paired parcels feeds the engine. No extraction run here.${X}`);
}

await main();
