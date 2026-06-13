// Small-window dry run. BUILT DURING BUILD DAY.
//
// Renders ACTUAL scraped rows for one recent month of Manhattan AP (apartment-building) deeds —
// the review-before-scaling step. Shows the CEMA recoveries side-by-side (naive vs recovered, with
// source doc + multiple), the structural-gate tally, and the cohort distribution. Replay-gated.
//
//   npm run scrape:dryrun                       (default: a recent month)
//   node --env-file-if-exists=.env src/loop/scrape/dryrun.ts 2026-04-01 2026-05-01 40

import { runWindow } from "./pipeline.ts";
import { COHORTS } from "./cohort.ts";
import type { ScrapedRow } from "./types.ts";

const G = "\x1b[32m", Y = "\x1b[33m", DIM = "\x1b[2m", B = "\x1b[1m", C = "\x1b[36m", X = "\x1b[0m";
const rule = (n = 100) => DIM + "─".repeat(n) + X;
const money = (n: number | null) => (n === null ? "—" : "$" + Math.round(n).toLocaleString("en-US"));
const pct = (n: number | null) => (n === null ? "—" : (n * 100).toFixed(0) + "%");
const pad = (s: string, n: number) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));

async function main(): Promise<void> {
  const from = process.argv[2] ?? "2026-05-01";
  const to = process.argv[3] ?? "2026-06-01";
  const limit = process.argv[4] ? Number(process.argv[4]) : 40;

  console.log(`${B}Basis scrape — dry run${X}  ${DIM}window ${from} → ${to}  |  Manhattan, property_type=AP  |  limit ${limit}${X}`);
  console.log(`${DIM}(replay-gated; cache-first)…${X}\n`);

  const res = await runWindow({ from, to, limit });
  console.log(`${B}${res.deeds}${X} single-parcel AP deeds in window  →  ${G}${res.admitted.length} admitted${X}  ${res.flagged.length ? Y : DIM}${res.flagged.length} flagged${X}`);

  if (res.admitted.length === 0) {
    console.log(`\n${Y}No admitted rows in this window.${X} ${DIM}Widen the window or check the filter (AP-only is narrow — many MF towers record as CR).${X}`);
    return;
  }

  // ── per-row table ──
  console.log("\n" + rule());
  console.log(`  ${DIM}${pad("cohort", 18)}${pad("bbl", 12)}${pad("classification", 22)}${pad("price", 16)}${pad("loan (LTV)", 18)}doc${X}`);
  for (const r of res.admitted) {
    console.log(`  ${pad(r.cohort, 18)}${pad(r.bbl || "∅", 12)}${pad(r.classification, 22)}${pad(money(r.price), 16)}${pad(`${money(r.debt.loan_amount)} (${pct(r.debt.ltv)})`, 18)}${DIM}${r.document_id}${X}`);
  }

  // ── CEMA recoveries rendered visibly (naive vs recovered) ──
  const recoveries = res.admitted.filter((r) => r.recovery_doc_type && (r.debt.loan_amount ?? 0) > 0 && materiallyDiffers(r));
  console.log("\n" + rule());
  console.log(`  ${B}CEMA recoveries${X} ${DIM}(naive recorded-mortgage read vs CEMA-recovered senior)${X}`);
  if (recoveries.length === 0) {
    console.log(`  ${DIM}none in this window where the recovered senior differs materially from the naive read.${X}`);
  } else {
    for (const r of recoveries) {
      const naive = r.naive_loan ?? 0;
      const rec = r.debt.loan_amount ?? 0;
      const mult = naive > 0 ? `${(rec / naive).toFixed(1)}x` : "all-cash→loan";
      console.log(`  ${C}${pad(r.address || r.bbl, 24)}${X} naive ${pad(naive === 0 ? "all-cash" : money(naive), 14)} ${B}→ recovered ${pad(money(rec), 16)}${X} ${Y}[${mult}]${X} ${DIM}via ${r.recovery_doc_type} ${r.recovery_source_doc_id}${X}`);
    }
  }

  // ── structural-gate tally ──
  if (res.flagged.length) {
    const byReason = new Map<string, number>();
    for (const f of res.flagged) for (const flag of f.flags) byReason.set(flag, (byReason.get(flag) ?? 0) + 1);
    console.log("\n" + rule());
    console.log(`  ${B}flagged (excluded, logged to data/raw/acris/flagged.jsonl)${X}`);
    for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${Y}${n}×${X} ${DIM}${reason}${X}`);
  }

  // ── cohort distribution + go/no-go ──
  console.log("\n" + rule());
  const dist = new Map<string, number>();
  for (const r of res.admitted) dist.set(r.cohort, (dist.get(r.cohort) ?? 0) + 1);
  const populated = COHORTS.filter((c) => (dist.get(c) ?? 0) > 0);
  console.log(`  ${B}cohort distribution (admitted)${X}`);
  for (const c of COHORTS) console.log(`  ${pad(c, 20)} ${pad(String(dist.get(c) ?? 0), 4)} ${DIM}${"▮".repeat(dist.get(c) ?? 0)}${X}`);
  console.log(`\n  ${populated.length >= 2 ? G : Y}≥2 populated cohorts: ${populated.length >= 2 ? "YES" : "NO"} (${populated.length})${X} ${DIM}— one month rarely spans cohorts; widen the window to fill them.${X}`);
}

function materiallyDiffers(r: ScrapedRow): boolean {
  const naive = r.naive_loan ?? 0;
  const rec = r.debt.loan_amount ?? 0;
  return Math.abs(rec - naive) > 1; // recovered senior differs from the naive recorded-mortgage read
}

await main();
