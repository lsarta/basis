// ONE fully-worked decomposition on a REAL HFL-exit pair. BUILT DURING BUILD DAY.
//
// The gate before any across-pairs meter: take a real same-BBL deed pair whose exit is in
// higher-for-longer, recover the real CEMA LTV at each end, decompose the price move into the three
// forces, and CONFIRM the forces foot to the observed price move to the dollar (Shapley efficiency)
// AND the engine reproduces both observed deed prices (inversion). If this fails on pair one, the
// wiring is wrong — catch it here, not at pair 71.
//
//   node --env-file-if-exists=.env src/loop/engine/demo-pair.ts [maxParcels]

import { collectSingleParcelAPDeeds, buildPairs, type Pair } from "../scrape/pairs.ts";
import { extractParcelAllDeeds } from "../scrape/extract.ts";
import { structuralGate } from "../scrape/gate.ts";
import { decomposePair, type PairDecomposition } from "./wire.ts";
import { rateProxy, PROXY } from "./proxies.ts";
import { debtCost } from "../../prior/engine/types.ts";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", C = "\x1b[36m", DIM = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";
const rule = (n = 92) => DIM + "─".repeat(n) + X;
const usd = (n: number) => (n < 0 ? "-$" : "$") + Math.round(Math.abs(n)).toLocaleString("en-US");
const pct = (n: number) => (n * 100).toFixed(2) + "%";

interface Candidate { pair: Pair; entryLtv: number; exitLtv: number; address: string; decomp: PairDecomposition }

async function main(): Promise<void> {
  const maxParcels = process.argv[2] ? Number(process.argv[2]) : 18;
  console.log(`${B}Basis engine wiring — one real decomposition, foot to the dollar${X}`);
  console.log(`${DIM}deriving HFL-exit pairs (cached)…${X}`);

  const { single } = await collectSingleParcelAPDeeds("2016-01-01", "2026-07-01");
  const { pairs } = buildPairs(single);
  const hflExit = pairs.filter((p) => p.exitCohort === "higher-for-longer");
  console.log(`${DIM}${hflExit.length} HFL-exit pairs; extracting up to ${maxParcels} parcels to find a clean leveraged one…${X}\n`);

  const candidates: Candidate[] = [];
  let scanned = 0;
  for (const p of hflExit) {
    if (scanned >= maxParcels) break;
    scanned++;
    const rows = await extractParcelAllDeeds(p.bbl);
    const byDoc = new Map(rows.map((r) => [r.document_id, r]));
    const er = byDoc.get(p.entry.document_id), xr = byDoc.get(p.exit.document_id);
    // both ends must extract as clean arms-length deeds that pass the structural gate
    if (!er || !xr) continue;
    if (er.classification !== "arms_length_purchase" || xr.classification !== "arms_length_purchase") continue;
    if (!structuralGate(er).admitted || !structuralGate(xr).admitted) continue;
    const entryLtv = er.debt.ltv ?? 0, exitLtv = xr.debt.ltv ?? 0;
    const decomp = decomposePair({ price: p.entry.amount, date: p.entry.date, ltv: entryLtv }, { price: p.exit.amount, date: p.exit.date, ltv: exitLtv });
    candidates.push({ pair: p, entryLtv, exitLtv, address: xr.address || er.address, decomp });
  }

  // pick the cleanest demo pair: inversion converged (price errors tiny), sane inferred returns,
  // real leverage at the exit (so the debt force is meaningful), prefer a larger move.
  const sane = (d: PairDecomposition) =>
    Math.abs(d.verify.entryPriceError) < 1 && Math.abs(d.verify.exitPriceError) < 1 &&
    d.hurdleEntry > -0.05 && d.hurdleEntry < 0.30 && d.hurdleExit > -0.05 && d.hurdleExit < 0.30;
  const ranked = candidates
    .filter((c) => c.exitLtv > 0 && sane(c.decomp))
    .sort((a, b) => Math.abs(b.decomp.result.deltaP) - Math.abs(a.decomp.result.deltaP));
  const chosen = ranked[0] ?? candidates.filter((c) => c.exitLtv > 0).sort((a, b) => Math.abs(b.decomp.result.deltaP) - Math.abs(a.decomp.result.deltaP))[0] ?? candidates[0];

  if (!chosen) {
    console.log(`${R}No clean HFL-exit pair found in the first ${maxParcels} parcels. Increase maxParcels.${X}`);
    process.exitCode = 1;
    return;
  }

  // ── candidate summary (transparency) ──
  console.log(`${DIM}${candidates.length} HFL-exit pairs decomposed; ${ranked.length} with real exit leverage + sane inferred returns. Showing the largest:${X}`);

  const { pair: p, entryLtv, exitLtv, address, decomp: d } = chosen;
  const r = d.result, v = d.verify;
  const total = r.deltaP;
  const share = (leg: number) => (total !== 0 ? (leg / total * 100).toFixed(1) + "%" : "—");

  console.log("\n" + rule());
  console.log(`  ${B}${address || p.bbl}${X}  ${DIM}bbl ${p.bbl}  |  ${p.entryCohort} → ${p.exitCohort}  |  hold ${d.holdYears.toFixed(1)} yr${X}`);
  console.log(rule());
  console.log(`  ${B}ENTRY${X}  ${p.entry.date.slice(0, 10)}  price ${usd(p.entry.amount)}   LTV ${pct(entryLtv)} ${DIM}(CEMA-recovered)${X}`);
  console.log(`         NOI ${usd(d.noiEntry)} ${DIM}(proxy: price×${pct(PROXY.capRate)})${X}   base rate ${pct(rateProxy(p.entry.date))} ${DIM}(10y UST)${X}   debt cost ${pct(debtCost({ ...d.entryState.debt, hurdle: d.hurdleEntry, rate_type: "fixed" }))}`);
  console.log(`         ${C}inferred required return ρ = ${pct(d.hurdleEntry)}${X} ${DIM}(inverted so engine price = observed)${X}`);
  console.log(`  ${B}EXIT${X}   ${p.exit.date.slice(0, 10)}  price ${usd(p.exit.amount)}   LTV ${pct(exitLtv)} ${DIM}(CEMA-recovered)${X}`);
  console.log(`         NOI ${usd(d.noiExit)} ${DIM}(grown ${pct(PROXY.noiGrowth)}/yr over hold)${X}   base rate ${pct(rateProxy(p.exit.date))}   debt cost ${pct(debtCost({ ...d.exitState.debt, hurdle: d.hurdleExit, rate_type: "fixed" }))}`);
  console.log(`         ${C}inferred required return ρ = ${pct(d.hurdleExit)}${X}`);
  console.log(rule());
  console.log(`  ${B}engine reproduces observed prices (inversion):${X}  entry ${usd(r.entryPrice)} ${DIM}(err ${v.entryPriceError.toExponential(1)})${X}   exit ${usd(r.exitPrice)} ${DIM}(err ${v.exitPriceError.toExponential(1)})${X}`);
  console.log(`  ${B}observed price move ΔP = ${usd(total)}${X}`);
  console.log(rule());
  console.log(`  ${B}THREE-FORCE DECOMPOSITION${X}`);
  console.log(`    ${pad("fundamentals (NOI)        ", 28)} ${col(r.legs.fundamentals)}  ${DIM}${share(r.legs.fundamentals)}${X}`);
  console.log(`    ${pad("debt cost                 ", 28)} ${col(r.legs.debt)}  ${DIM}${share(r.legs.debt)}${X}`);
  console.log(`    ${pad("required return (equity)  ", 28)} ${col(r.legs.equity)}  ${DIM}${share(r.legs.equity)}${X}`);
  console.log(`    ${DIM}${"─".repeat(46)}${X}`);
  console.log(`    ${pad("Σ forces                  ", 28)} ${col(v.sigmaLegs)}`);
  console.log(`    ${pad("ΔP (observed)             ", 28)} ${usd(total)}`);
  const footOk = Math.abs(v.footError) < 0.5;
  console.log(`    ${footOk ? G : R}${B}foot error  Σ − ΔP = ${v.footError.toExponential(3)}  ${footOk ? "✓ foots to the dollar" : "✗ DOES NOT FOOT"}${X}`);
  console.log("\n" + rule());
  if (footOk && Math.abs(v.entryPriceError) < 1 && Math.abs(v.exitPriceError) < 1) {
    console.log(`  ${G}${B}VERIFIED${X} — engine calibrated to both real deed prices; three forces foot to the real price move to the dollar.`);
    console.log(`  ${DIM}NEXT (gated): repeat across all HFL-exit pairs (and the other exit-cohort buckets) for the regime headline.${X}`);
  } else {
    console.log(`  ${R}${B}NOT VERIFIED${X} — wiring issue (see errors above). Do not compute across pairs until this foots.`);
    process.exitCode = 1;
  }
}

function pad(s: string, n: number): string { return s.length >= n ? s : s + " ".repeat(n - s.length); }
function col(n: number): string { const s = usd(n); return (n < 0 ? R : n > 0 ? G : DIM) + pad(s, 16) + X; }

await main();
