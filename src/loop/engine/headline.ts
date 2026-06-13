// REGIME HEADLINE — model-implied relative force mix by exit cohort. BUILT DURING BUILD DAY.
//
// This is NOT a calibrated price decomposition (that is demo-pair.ts, the foots-to-the-dollar proof).
// Here we report the MODEL-IMPLIED RELATIVE FORCE MIX across same-BBL deed pairs, bucketed by the
// exit cohort (the move's regime), with an attrition waterfall as the honesty artifact.
//
// Framing guard (binding): the regime claim is led by the RATE force — real dated rates × real
// recovered LTV, the clean proxy-free leg. The REQUIRED-RETURN RESIDUAL absorbs NOI-proxy bias and is
// DESCRIPTIVE ONLY, never the headline signal. The defensible claim is "rate force dominates HFL-exit
// moves vs NOI/fundamentals dominating pre-2020-exit."
//
//   node --env-file-if-exists=.env src/loop/engine/headline.ts

import { collectSingleParcelAPDeeds, buildPairs, type Pair } from "../scrape/pairs.ts";
import { extractParcelAllDeeds } from "../scrape/extract.ts";
import { structuralGate } from "../scrape/gate.ts";
import { relativeDecompose, type RelativeForceMix } from "./relative.ts";
import { decomposePair, isSaneLtv } from "./wire.ts";
import { COHORTS } from "../scrape/cohort.ts";
import type { RateCohort, ScrapedRow } from "../scrape/types.ts";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", DIM = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";
const rule = (n = 100) => DIM + "─".repeat(n) + X;
const RANGE: Record<RateCohort, string> = { "pre-2020": "2016-2019", "ZIRP-COVID": "2020-2021", "hiking": "2022-2023", "higher-for-longer": "2024-2026" };
const usd = (n: number) => (n < 0 ? "-$" : "+$") + Math.round(Math.abs(n) / 1000).toLocaleString("en-US") + "k";
const pctShare = (n: number) => (n * 100).toFixed(0) + "%";
const pad = (s: string, n: number) => (s.length >= n ? s : s + " ".repeat(n - s.length));
const padL = (s: string, n: number) => (s.length >= n ? s : " ".repeat(n - s.length) + s);

interface Bucket {
  census: number; extracted: number; structuralPass: number; saneLtv: number;
  allCash: number; leveraged: number; badLtv: number; calibratedSane: number;
  rels: RelativeForceMix[]; // DATA survivors (the headline sample)
}
const emptyBucket = (): Bucket => ({ census: 0, extracted: 0, structuralPass: 0, saneLtv: 0, allCash: 0, leveraged: 0, badLtv: 0, calibratedSane: 0, rels: [] });

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** CALIBRATED diagnostic: does the price-inverting calibration converge to a sane required return? (NOT a filter.) */
function calibratedSane(entry: { price: number; date: string; ltv: number }, exit: { price: number; date: string; ltv: number }): boolean {
  try {
    const d = decomposePair(entry, exit);
    const conv = Math.abs(d.verify.entryPriceError) < 1 && Math.abs(d.verify.exitPriceError) < 1;
    const sane = d.hurdleEntry > -0.05 && d.hurdleEntry < 0.35 && d.hurdleExit > -0.05 && d.hurdleExit < 0.35;
    return conv && sane;
  } catch { return false; }
}

async function main(): Promise<void> {
  console.log(`${B}Basis — regime headline: model-implied relative force mix by exit cohort${X}`);
  console.log(`${DIM}NOT a calibrated decomposition (see demo-pair for that). Rate force = real dated rates × real recovered LTV;${X}`);
  console.log(`${DIM}required-return is a RESIDUAL (observed move − model move), descriptive only. NOI is a labeled proxy.${X}\n`);

  const { single } = await collectSingleParcelAPDeeds("2016-01-01", "2026-07-01");
  const { pairs } = buildPairs(single);

  // extract each unique paired parcel ONCE (cache-first), gate each deed.
  const bbls = [...new Set(pairs.map((p) => p.bbl))];
  const parcelRows = new Map<string, Map<string, ScrapedRow>>();
  let done = 0;
  for (const bbl of bbls) {
    try {
      const rows = await extractParcelAllDeeds(bbl);
      parcelRows.set(bbl, new Map(rows.map((r) => [r.document_id, r])));
    } catch { /* parcel extraction failed — leave absent; pairs on it count as not-extracted */ }
    if (++done % 10 === 0 || done === bbls.length) process.stderr.write(`\r  extracting paired parcels: ${done}/${bbls.length}…   `);
  }
  process.stderr.write("\n");

  const buckets = new Map<RateCohort, Bucket>(COHORTS.map((c) => [c, emptyBucket()]));
  for (const p of pairs) {
    const bk = buckets.get(p.exitCohort)!;
    bk.census++;
    const rows = parcelRows.get(p.bbl);
    const er = rows?.get(p.entry.document_id), xr = rows?.get(p.exit.document_id);
    if (!er || !xr) continue;
    bk.extracted++;
    if (er.classification !== "arms_length_purchase" || xr.classification !== "arms_length_purchase") continue;
    if (!structuralGate(er).admitted || !structuralGate(xr).admitted) continue;
    bk.structuralPass++;
    const eL = er.debt.ltv ?? 0, xL = xr.debt.ltv ?? 0;
    if (!isSaneLtv(eL) || !isSaneLtv(xL)) { bk.badLtv++; continue; } // unreliable loan/price attribution
    bk.saneLtv++;
    (eL === 0 && xL === 0) ? bk.allCash++ : bk.leveraged++;
    const entry = { price: p.entry.amount, date: p.entry.date, ltv: eL };
    const exit = { price: p.exit.amount, date: p.exit.date, ltv: xL };
    if (calibratedSane(entry, exit)) bk.calibratedSane++; // diagnostic only
    bk.rels.push(relativeDecompose(entry, exit)); // DATA survivor → headline sample
  }

  // ── per-cohort report ──
  for (const c of COHORTS) {
    const bk = buckets.get(c)!;
    const n = bk.rels.length;
    const head = c === "higher-for-longer" || c === "pre-2020" ? C : DIM;
    console.log(rule());
    console.log(`  ${head}${B}EXIT COHORT ${c} (${RANGE[c]})${X}    ${n >= 5 ? G : Y}${B}DATA survivors n=${n}${X}${n < 5 ? ` ${Y}(<5 — too thin to claim a force-mix; adapt framing)${X}` : ""}`);
    console.log(`  ${DIM}attrition: census ${bk.census} → extracted ${bk.extracted} → structural-pass ${bk.structuralPass} → sane-LTV ${bk.saneLtv}` +
      ` [all-cash ${bk.allCash} / leveraged ${bk.leveraged}]  (bad-LTV excluded ${bk.badLtv})  |  calibrated-sane ${bk.calibratedSane}/${n} (diagnostic)${X}`);
    if (n === 0) continue;

    // 3-force rollup — LEAD framing. signed dollars (mean per pair), then magnitude share.
    const d3 = { debt: mean(bk.rels.map((r) => r.rollup.debt)), noi: mean(bk.rels.map((r) => r.rollup.noi)), rr: mean(bk.rels.map((r) => r.rollup.required_return)) };
    const s3 = { debt: mean(bk.rels.map((r) => r.shares3.debt)), noi: mean(bk.rels.map((r) => r.shares3.noi)), rr: mean(bk.rels.map((r) => r.shares3.required_return)) };
    console.log(`  ${B}3-force rollup${X}  ${DIM}(mean per pair)${X}`);
    console.log(`    signed $:        ${pad("debt " + col(d3.debt), 28)} ${pad("NOI " + col(d3.noi), 26)} ${pad("req-return-residual " + col(d3.rr), 30)}`);
    console.log(`    magnitude share: ${pad("debt " + padL(pctShare(s3.debt), 4), 19)} ${pad("NOI " + padL(pctShare(s3.noi), 4), 17)} ${pad("req-return-residual " + padL(pctShare(s3.rr), 4), 26)} ${DIM}(sign above)${X}`);

    // 5-leg detail — the why.
    const d5: Record<string, number> = { rate: mean(bk.rels.map((r) => r.legs.rate)), spread: mean(bk.rels.map((r) => r.legs.spread)), ltv: mean(bk.rels.map((r) => r.legs.ltv_availability)), noi: mean(bk.rels.map((r) => r.legs.fundamentals)), rr: mean(bk.rels.map((r) => r.legs.required_return)) };
    const s5: Record<string, number> = { rate: mean(bk.rels.map((r) => r.shares5.rate)), spread: mean(bk.rels.map((r) => r.shares5.spread)), ltv: mean(bk.rels.map((r) => r.shares5.ltv_availability)), noi: mean(bk.rels.map((r) => r.shares5.fundamentals)), rr: mean(bk.rels.map((r) => r.shares5.required_return)) };
    console.log(`  ${DIM}5-leg detail   signed $:        rate ${col(d5.rate)} spread ${col(d5.spread)} ltv-avail ${col(d5.ltv)} NOI ${col(d5.noi)} req-ret-resid ${col(d5.rr)}${X}`);
    console.log(`  ${DIM}               magnitude share: rate ${padL(pctShare(s5.rate), 4)}  spread ${padL(pctShare(s5.spread), 4)}  ltv-avail ${padL(pctShare(s5.ltv), 4)}  NOI ${padL(pctShare(s5.noi), 4)}  req-ret-resid ${padL(pctShare(s5.rr), 4)}  (sign above)${X}`);
  }

  // ── regime claim, rate-force-led (honest) ──
  console.log("\n" + rule());
  const hfl = buckets.get("higher-for-longer")!, pre = buckets.get("pre-2020")!;
  const rateShare = (bk: Bucket) => mean(bk.rels.map((r) => r.shares3.debt)); // debt ≈ rate (spread 0) — the regime leg
  const noiShare = (bk: Bucket) => mean(bk.rels.map((r) => r.shares3.noi));
  console.log(`  ${B}REGIME CLAIM (rate-force-led, model-implied)${X}`);
  if (hfl.rels.length >= 5 && pre.rels.length >= 5) {
    console.log(`    HFL-exit   (n=${hfl.rels.length}): debt/rate magnitude share ${C}${pctShare(rateShare(hfl))}${X}   NOI share ${pctShare(noiShare(hfl))}   ${DIM}median hold ${medHold(hfl)}yr${X}`);
    console.log(`    pre-2020-exit (n=${pre.rels.length}): debt/rate magnitude share ${pctShare(rateShare(pre))}   NOI share ${C}${pctShare(noiShare(pre))}${X}   ${DIM}median hold ${medHold(pre)}yr${X}`);
    const holds = rateShare(hfl) > rateShare(pre) && noiShare(pre) >= noiShare(hfl);
    console.log(holds
      ? `  ${G}${B}✓ rate force is a larger share of HFL-exit moves than pre-2020-exit; NOI/fundamentals larger in pre-2020-exit.${X}`
      : `  ${Y}force-mix contrast NOT clean on this run — fall back to the exact-footing single-pair demo (demo-pair) + survival story (BUILD_PLAN floor).${X}`);
  } else {
    console.log(`  ${Y}One contrast bucket has <5 DATA survivors — do NOT claim the cohort headline. Fall back to demo-pair (exact calibrated decomposition, foots to the dollar) + this survival waterfall.${X}`);
  }
  console.log(`  ${DIM}required-return-residual is descriptive (absorbs NOI-proxy bias), never the headline signal.${X}`);
}

function medHold(bk: Bucket): string {
  const hs = bk.rels.map((r) => r.holdYears).sort((a, b) => a - b);
  if (!hs.length) return "—";
  const m = Math.floor(hs.length / 2);
  return ((hs.length % 2 ? hs[m] : (hs[m - 1] + hs[m]) / 2)).toFixed(1);
}
function col(n: number): string { return (n < 0 ? R : n > 0 ? G : DIM) + usd(n) + X; }

await main();
