// GOLD REPLAY — the v1 scrape's hard gate. BUILT DURING BUILD DAY.
//
// Runs the SAME extraction pipeline (extract -> adapter -> grade) against the 17 gold fixtures.
// Fetches each fixture parcel/document ONCE, caches it, then re-derives OFFLINE in seconds — so
// extraction logic iterates fast against known answers. Hard-gates on the ATTEMPTED rows; the
// DEFERRED rows (takeout channel/lender, pari-passu split, the coop soft-label) are shown
// reason-tagged, never skipped. Exit 1 on any attempted failure, with per-row expected-vs-got.
//
//   node --env-file-if-exists=.env src/loop/scrape/replay.ts   (or: npm run scrape:replay)

import { fileURLToPath } from "node:url";
import { loadGoldset } from "../../grader/csv.ts";
import { grade } from "../../grader/grade.ts";
import type { GoldRow, GradeReport } from "../../grader/types.ts";
import { extractParcel, extractDocument } from "./extract.ts";
import { toPrediction } from "./adapter.ts";
import { ATTEMPTED_CLASSES, DEFERRED_REASON } from "./gate.ts";
import { auditAttempted } from "./audit.ts";
import type { ScrapedRow } from "./types.ts";

const G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", DIM = "\x1b[2m", B = "\x1b[1m", X = "\x1b[0m";
const rule = (n = 96) => DIM + "─".repeat(n) + X;
const money = (n: number | null) => (n === null ? "—" : "$" + n.toLocaleString("en-US"));
const label = (g: GoldRow) => (g.note.match(/^([^;,]+)/)?.[1] ?? g.document_id).trim().slice(0, 22);

export interface ReplayData {
  gold: GoldRow[];
  attempted: GoldRow[];
  deferred: GoldRow[];
  byDoc: Map<string, ScrapedRow>;
  report: GradeReport;
}

/** Run the extraction over the fixtures and grade the attempted subset. No printing, no exit. */
export async function buildReplay(): Promise<ReplayData> {
  const gold = loadGoldset();
  const attempted = gold.filter((g) => ATTEMPTED_CLASSES.has(g.true_classification));
  const deferred = gold.filter((g) => !ATTEMPTED_CLASSES.has(g.true_classification));

  // Parcels with a bbl: deed-driven (pin the gold deed when the gold row is a deed-class).
  // Empty-bbl rows: document-driven. The AP/Manhattan corpus filter is NOT applied here.
  const deedDocByBbl = new Map<string, string>();
  for (const g of attempted) {
    if (g.bbl && ["arms_length_purchase", "coop_unit_deed", "non_arms_length"].includes(g.true_classification)) {
      deedDocByBbl.set(g.bbl, g.document_id);
    }
  }
  const scraped: ScrapedRow[] = [];
  for (const bbl of [...new Set(attempted.filter((g) => g.bbl).map((g) => g.bbl))]) {
    scraped.push(...(await extractParcel(bbl, { deedDocId: deedDocByBbl.get(bbl) })));
  }
  for (const g of attempted.filter((g) => g.bbl === "")) scraped.push(...(await extractDocument(g.document_id)));

  const byDoc = new Map(scraped.map((r) => [r.document_id, r]));
  const report = grade(attempted, scraped.map(toPrediction));
  return { gold, attempted, deferred, byDoc, report };
}

/** Lightweight gate result for the pipeline to consume. */
export async function replayResult(): Promise<{ allPass: boolean; passed: number; total: number }> {
  const { report, attempted } = await buildReplay();
  return { allPass: report.allPass, passed: report.passed, total: attempted.length };
}

function recoveredNote(sr: ScrapedRow): string {
  if (sr.classification === "blanket_not_attributable") return `${DIM}refused (blanket across ${sr.blanket_bbls.length} BBLs)${X}`;
  if (sr.classification === "commitment_not_funded") return `${DIM}refused (commitment ${money(sr.naive_loan)} > price)${X}`;
  if (sr.classification === "cema_consolidation") {
    const naive = sr.naive_loan ?? 0;
    const mult = naive > 0 && sr.amount ? `  [${(sr.amount / naive).toFixed(1)}x]` : naive === 0 ? "  [naive: all-cash]" : "";
    return `${DIM}recovered ${money(sr.amount)} via ${sr.recovery_doc_type} ${sr.recovery_source_doc_id}${mult}${X}`;
  }
  if (sr.classification === "arms_length_purchase") return `${DIM}price ${money(sr.amount)}${X}`;
  return `${DIM}${sr.classification}${X}`;
}

async function render(): Promise<void> {
  console.log(`${B}Basis v1 scrape — gold replay${X}  ${DIM}(extract -> grade against 17 fixtures; cache-first, offline after first run)${X}`);
  const data = await buildReplay();
  const { gold, attempted, deferred, byDoc, report } = data;
  const reportByDoc = new Map(report.rows.map((r) => [r.document_id, r]));

  console.log("\n" + rule());
  for (const g of gold) {
    const lbl = label(g);
    if (!ATTEMPTED_CLASSES.has(g.true_classification)) {
      console.log(`  ${Y}DEFER${X}  ${g.true_classification.padEnd(26)} ${lbl.padEnd(22)} ${DIM}${DEFERRED_REASON[g.true_classification] ?? ""}${X}`);
      continue;
    }
    const r = reportByDoc.get(g.document_id);
    const sr = byDoc.get(g.document_id);
    console.log(`  ${r?.pass ? `${G}PASS${X}` : `${R}FAIL${X}`}  ${g.true_classification.padEnd(26)} ${lbl.padEnd(22)} ${sr ? recoveredNote(sr) : `${R}no row produced${X}`}`);
    if (r && !r.pass) {
      for (const f of r.fields.filter((f) => f.status === "fail")) {
        console.log(`        ${R}↳ ${f.field}: expected ${JSON.stringify(f.expected ?? null)}  got ${JSON.stringify(f.got ?? null)}${X}`);
      }
      if (!sr) console.log(`        ${R}↳ extraction produced no row for ${g.document_id} (key not reproduced)${X}`);
    }
  }
  console.log(rule());
  console.log(`  ${report.allPass ? G : R}${B}attempted: ${report.passed}/${attempted.length} pass${X}` +
    `   ${Y}deferred: ${deferred.length}${X} ${DIM}(${deferred.map((d) => d.true_classification).join(", ")})${X}`);

  // grounding audit
  console.log("\n" + rule());
  console.log(`  ${B}GROUNDING AUDIT${X}  ${DIM}(public-record read vs gold label — softness even where the row passes)${X}`);
  const grounding = await auditAttempted(gold, byDoc);
  const labelByDoc = new Map(gold.map((g) => [g.document_id, label(g)]));
  for (const a of grounding) {
    const tag = a.grounding === "grounded" ? `${G}grounded${X}` : a.grounding === "soft" ? `${R}SOFT    ${X}` : `${Y}note    ${X}`;
    console.log(`  ${tag}  ${a.classification.padEnd(26)} ${(labelByDoc.get(a.document_id) ?? "").padEnd(22)} ${DIM}${a.note}${X}`);
  }
  const soft = grounding.filter((a) => a.grounding === "soft");

  console.log("\n" + rule());
  if (report.allPass) {
    console.log(`  ${G}${B}REPLAY GREEN${X} — the v1 extraction reproduces every attempted fixture. The corpus pull is unblocked.`);
    if (soft.length) console.log(`  ${R}${soft.length} soft label(s) flagged above${X} — grounded vs soft is the operator's call before scaling.`);
  } else {
    console.log(`  ${R}${B}REPLAY RED${X} — ${attempted.length - report.passed} attempted row(s) wrong (above). Fix the extraction; the corpus pull stays blocked.`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await render();
