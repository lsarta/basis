// CEMA recovery — unit tests (offline, pure). BUILT DURING BUILD DAY.

import { test } from "node:test";
import assert from "node:assert/strict";

import { selectSenior, classifyFinancing, isBlanketCandidate, bucketOf, type Candidate, type Instrument } from "./cema.ts";
import { paginateAll } from "./soda.ts";
import { bblOf } from "./acris.ts";

const cand = (o: Partial<Candidate> & { document_id: string; amount: number; recorded_datetime: string }): Candidate => ({
  doc_type: "M&CON",
  bbls: ["1010340037"],
  hasSpreader: false,
  ...o,
});

// ── THE KEYSTONE: recency beats magnitude (the fix over the prior max-amount selection). ──
test("selectSenior picks most-recent active consolidation, NOT the largest (300 W 44th)", () => {
  const stale = cand({ document_id: "2007072001245014", amount: 103_964_997, recorded_datetime: "2007-07-25T00:00:00" });
  const live = cand({ document_id: "2025121200273005", amount: 190_000_000, recorded_datetime: "2025-12-16T00:00:00" });
  // a fabricated STALE-BUT-LARGER foil — recency must still win
  const staleLarger = cand({ document_id: "2012030200117007", amount: 282_927_605, recorded_datetime: "2012-03-13T00:00:00" });

  const chosen = selectSenior([stale, staleLarger, live]);
  assert.equal(chosen?.document_id, "2025121200273005", "must select the live 2025 M&CON ($190M), not the larger 2012 AGMT");
  assert.equal(chosen?.amount, 190_000_000);
});

test("selectSenior drops satisfied liens and ignores zero/negative amounts", () => {
  const dead = cand({ document_id: "X", amount: 200_000_000, recorded_datetime: "2026-01-01T00:00:00", satisfied: true });
  const live = cand({ document_id: "Y", amount: 150_000_000, recorded_datetime: "2024-01-01T00:00:00" });
  assert.equal(selectSenior([dead, live])?.document_id, "Y");
  assert.equal(selectSenior([cand({ document_id: "Z", amount: 0, recorded_datetime: "2025-01-01T00:00:00" })]), null);
});

test("same-date tiebreak prefers M&CON over AGMT, then larger amount", () => {
  const agmt = cand({ document_id: "A", doc_type: "AGMT", amount: 200_000_000, recorded_datetime: "2025-12-16T00:00:00" });
  const mcon = cand({ document_id: "M", doc_type: "M&CON", amount: 190_000_000, recorded_datetime: "2025-12-16T00:00:00" });
  assert.equal(selectSenior([agmt, mcon])?.document_id, "M", "M&CON wins the tie even though the AGMT is larger");
});

// ── Blanket priority: refuse before recovering. ──
test("classifyFinancing refuses a spreader-blanket before selecting a senior (169 W 83)", () => {
  const ownMcon = cand({ document_id: "2025121700383005", doc_type: "M&CON", amount: 3_160_000, recorded_datetime: "2025-12-19T00:00:00", bbls: ["1012140106"] });
  const blanket = cand({ document_id: "2025121700383001", doc_type: "AGMT", amount: 5_511_152, recorded_datetime: "2025-12-19T00:00:00", bbls: ["1004340054", "1012140106"], hasSpreader: true });
  const r = classifyFinancing({ price: 4_250_000, windowInstruments: [], candidates: [ownMcon, blanket] });
  assert.equal(r.classification, "blanket_not_attributable");
  assert.equal(r.amount, null);
  assert.equal(r.amount_reliable, false);
  assert.equal(r.source_doc_id, "2025121700383001");
});

test("multi-parcel consolidation with NO spreader is attributable, not blanket (339 E 19)", () => {
  const c = cand({ document_id: "2025123100109002", doc_type: "AGMT", amount: 5_100_000, recorded_datetime: "2026-01-05T00:00:00", bbls: ["1009250023", "1018900069", "1018900070"], hasSpreader: false });
  assert.equal(isBlanketCandidate(c), false);
  const r = classifyFinancing({ price: null, windowInstruments: [], candidates: [c] });
  assert.equal(r.classification, "cema_consolidation");
  assert.equal(r.amount, 5_100_000);
  assert.equal(r.amount_reliable, true);
});

test("commitment-not-funded: recorded mortgage materially over price refuses the amount (860 Washington)", () => {
  const mtge: Instrument = { document_id: "2021010400526002", doc_type: "MTGE", amount: 116_000_000, recorded_datetime: "2021-01-12T00:00:00" };
  const r = classifyFinancing({ price: 80_000_000, windowInstruments: [mtge], candidates: [] });
  assert.equal(r.classification, "commitment_not_funded");
  assert.equal(r.amount, null);
  assert.equal(r.amount_reliable, false);
  assert.equal(r.source_doc_id, "2021010400526002");
  assert.equal(r.naive_loan, 116_000_000, "naive read is recorded for the dry-run diff, but not attributed");
});

test("all-cash / purchase-money yields no refusal class", () => {
  assert.equal(classifyFinancing({ price: 5_600_000, windowInstruments: [], candidates: [] }).classification, null);
});

// ── Paging: a 3-BBL blanket whose Legals cross a page boundary must still be fully seen. ──
test("paginateAll crosses a page boundary; a 3-BBL blanket is detected across it", async () => {
  // synthetic Legals for one document, split across two pages of size 2 (the 3rd BBL is on page 2)
  const pages: Record<string, string>[][] = [
    [
      { document_id: "D", borough: "1", block: "00925", lot: "0023" },
      { document_id: "D", borough: "1", block: "01890", lot: "0069" },
    ],
    [{ document_id: "D", borough: "1", block: "01890", lot: "0070" }], // short page => stop
  ];
  const legals = await paginateAll(2, (offset) => Promise.resolve(pages[offset / 2] ?? []));
  const bbls = [...new Set(legals.map(bblOf))].sort();
  assert.deepEqual(bbls, ["1009250023", "1018900069", "1018900070"], "all 3 BBLs survive the page boundary");

  const c: Candidate = { document_id: "D", doc_type: "AGMT", amount: 9_000_000, recorded_datetime: "2025-01-01T00:00:00", bbls, hasSpreader: true };
  assert.equal(isBlanketCandidate(c), true, "3-BBL + spreader => blanket, even across the page boundary");
});

test("bucketOf maps the CEMA doc types", () => {
  assert.equal(bucketOf("M&CON"), "CONSOL");
  assert.equal(bucketOf("AGMT"), "AGMT");
  assert.equal(bucketOf("SPRD"), "SPRD");
  assert.equal(bucketOf("DEED"), "DEED");
});
