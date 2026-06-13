// CSV parsing + gold-set loading. BUILT DURING BUILD DAY.
//
// A small RFC-4180 parser: quoted fields may contain commas and newlines, and a
// doubled quote ("") is a literal quote. The gold-set notes contain commas and
// dollar figures inside quotes, so a naive split(",") would corrupt them.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { GoldRow } from "./types.ts";

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let started = false; // whether the current row has any content yet

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
    started = false;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      started = true;
    } else if (ch === ",") {
      endField();
      started = true;
    } else if (ch === "\n") {
      endRow();
    } else if (ch === "\r") {
      // swallow; the following \n (or EOF) closes the row
    } else {
      field += ch;
      started = true;
    }
  }
  // flush a trailing field/row with no final newline
  if (started || field.length > 0) endRow();
  return rows;
}

const HEADER = [
  "bbl",
  "document_id",
  "doc_type",
  "true_classification",
  "true_amount",
  "takeout_channel",
  "takeout_lender",
  "amount_reliable",
  "note",
] as const;

function parseAmountCell(cell: string): number | null {
  const t = cell.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n)) {
    throw new Error(`gold set: true_amount is not a number: ${JSON.stringify(cell)}`);
  }
  return n;
}

function parseBool(cell: string, ctx: string): boolean {
  const t = cell.trim().toLowerCase();
  if (t === "true") return true;
  if (t === "false") return false;
  throw new Error(`gold set: amount_reliable must be true|false, got ${JSON.stringify(cell)} (${ctx})`);
}

/** Parse the raw CSV grid into typed GoldRows, validating the header against the spec schema. */
export function parseGoldset(text: string): GoldRow[] {
  const grid = parseCsv(text).filter((r) => !(r.length === 1 && r[0].trim() === ""));
  if (grid.length === 0) throw new Error("gold set is empty");
  const header = grid[0].map((h) => h.trim());
  if (header.length !== HEADER.length || HEADER.some((h, i) => header[i] !== h)) {
    throw new Error(`gold set header mismatch.\n  expected: ${HEADER.join(",")}\n  got:      ${header.join(",")}`);
  }
  const idx = Object.fromEntries(HEADER.map((h, i) => [h, i])) as Record<(typeof HEADER)[number], number>;

  return grid.slice(1).map((r, ri) => {
    const ctx = `row ${ri + 2}`;
    const row: GoldRow = {
      bbl: r[idx.bbl].trim(),
      document_id: r[idx.document_id].trim(),
      doc_type: r[idx.doc_type].trim(),
      true_classification: r[idx.true_classification].trim(),
      true_amount: parseAmountCell(r[idx.true_amount]),
      takeout_channel: r[idx.takeout_channel], // NOT trimmed — channel is matched literally (§5)
      takeout_lender: r[idx.takeout_lender].trim(),
      amount_reliable: parseBool(r[idx.amount_reliable], ctx),
      note: r[idx.note], // never scored, never trimmed
    };
    if (row.document_id === "") throw new Error(`gold set: empty document_id at ${ctx}`);
    return row;
  });
}

/** Default gold-set path: repo-root goldset.csv (two levels up from src/grader). */
export function defaultGoldsetPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "goldset.csv");
}

export function loadGoldset(path: string = defaultGoldsetPath()): GoldRow[] {
  return parseGoldset(readFileSync(path, "utf8"));
}
