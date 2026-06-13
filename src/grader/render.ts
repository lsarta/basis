// Human-readable rendering of a GradeReport. BUILT DURING BUILD DAY.
// Output only — no scoring logic lives here.

import type { GradeReport, RowResult, FieldResult } from "./types.ts";

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function fieldCell(f: FieldResult): string {
  if (f.status === "pass") return `${GREEN}✓${f.field}${RESET}`;
  if (f.status === "fail") return `${RED}✗${f.field}${RESET}`;
  return `${DIM}·${f.field}${RESET}`;
}

function rowLine(r: RowResult): string {
  const mark = r.pass ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
  const key = r.keyField === "document_id" ? `doc=${r.document_id}` : `(bbl=${r.bbl || "∅"},doc=${r.document_id})`;
  const fields = r.fields.map(fieldCell).join(" ");
  return `  ${mark}  ${DIM}[${r.block}]${RESET} ${pad(r.classification, 26)} ${pad(r.label, 22)} ${fields}\n        ${DIM}${pad("key " + key, 20)}${RESET}`;
}

export function renderReport(title: string, report: GradeReport): string {
  const out: string[] = [];
  out.push(`${BOLD}${title}${RESET}`);
  for (const r of report.rows) {
    out.push(rowLine(r));
    for (const reason of r.reasons) out.push(`        ${RED}↳ ${reason}${RESET}`);
  }
  const ok = report.allPass ? GREEN : RED;
  out.push(`  ${ok}${BOLD}composite: ${report.passed}/${report.total} pass${RESET}` +
    (report.failed ? `  ${RED}(${report.failed} fail)${RESET}` : ""));
  return out.join("\n");
}

/** One-line summary of which rows failed (by classification/label) — used by perturbation output. */
export function failedRows(report: GradeReport): RowResult[] {
  return report.rows.filter((r) => !r.pass);
}
