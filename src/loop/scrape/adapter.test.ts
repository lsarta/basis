// Adapter + row-invariant tests (offline, pure). BUILT DURING BUILD DAY.

import { test } from "node:test";
import assert from "node:assert/strict";

import { assembleRow, type RowParts } from "./row.ts";
import { toPrediction } from "./adapter.ts";

const base: RowParts = {
  bbl: "1010340037", document_id: "D", doc_type: "DEED",
  classification: "arms_length_purchase", amount: 218_600_000, amount_reliable: true,
  price: 218_600_000, recoveredLoan: 190_000_000, recoveredLoanReliable: true,
  recorded_datetime: "2025-12-16T00:00:00", property_type: "AP", address: "300 W 44 ST",
  recovery_source_doc_id: "2025121200273005", recovery_doc_type: "M&CON",
  naive_loan: null, blanket_bbls: [],
};

test("arms-length deed: amount = price, debt carries recovered senior + LTV, coupon null", () => {
  const r = assembleRow(base);
  assert.equal(r.amount, 218_600_000);
  assert.equal(r.amount_reliable, true);
  assert.equal(r.debt.loan_amount, 190_000_000);
  assert.ok(Math.abs((r.debt.ltv ?? 0) - 190 / 218.6) < 1e-6);
  assert.equal(r.debt.coupon, null); // v1 always null
  assert.deepEqual(toPrediction(r), { bbl: "1010340037", document_id: "D", classification: "arms_length_purchase", amount: 218_600_000, channel: null, lender: null });
});

test("blanket refusal: scored amount AND debt.loan_amount are null even if an amount was passed", () => {
  const r = assembleRow({ ...base, document_id: "B", doc_type: "AGMT", classification: "blanket_not_attributable", amount: 5_511_152, amount_reliable: true, price: null, recoveredLoan: 5_511_152, recoveredLoanReliable: false, recovery_source_doc_id: "B", recovery_doc_type: "AGMT", blanket_bbls: ["1004340054", "1012140106"] });
  assert.equal(r.amount, null, "refusal must emit no scored amount");
  assert.equal(r.debt.loan_amount, null, "not-attributable amount must NOT enter debt.loan_amount");
  assert.equal(r.amount_reliable, false);
  assert.equal(toPrediction(r).amount, null);
});

test("commitment_not_funded: unreliable amount excluded from model input (debt.loan_amount null)", () => {
  const r = assembleRow({ ...base, document_id: "C", doc_type: "MTGE", classification: "commitment_not_funded", amount: null, amount_reliable: false, price: 80_000_000, recoveredLoan: null, recoveredLoanReliable: false, recovery_source_doc_id: "C", recovery_doc_type: "MTGE", naive_loan: 116_000_000 });
  assert.equal(r.debt.loan_amount, null);
  assert.equal(r.debt.ltv, null, "debt exists but is not attributable => LTV unknown, not zero");
  assert.equal(r.naive_loan, 116_000_000, "the naive figure is kept as provenance only");
});

test("cema_consolidation row: amount = senior, reliable; debt.loan_amount = senior", () => {
  const r = assembleRow({ ...base, document_id: "2025121200273005", doc_type: "M&CON", classification: "cema_consolidation", amount: 190_000_000, amount_reliable: true, price: null, recoveredLoan: 190_000_000, recoveredLoanReliable: true });
  assert.equal(r.amount, 190_000_000);
  assert.equal(r.debt.loan_amount, 190_000_000);
  assert.equal(toPrediction(r).amount, 190_000_000);
});

test("all-cash deed: no financing => debt.loan_amount null, LTV exactly 0", () => {
  const r = assembleRow({ ...base, classification: "arms_length_purchase", recoveredLoan: null, recoveredLoanReliable: false, recovery_source_doc_id: null, recovery_doc_type: null });
  assert.equal(r.debt.loan_amount, null);
  assert.equal(r.debt.ltv, 0);
});

test("cohort derives from recording year", () => {
  assert.equal(assembleRow({ ...base, recorded_datetime: "2017-07-19T00:00:00" }).cohort, "pre-2020");
  assert.equal(assembleRow({ ...base, recorded_datetime: "2021-01-07T00:00:00" }).cohort, "ZIRP-COVID");
  assert.equal(assembleRow({ ...base, recorded_datetime: "2023-08-23T00:00:00" }).cohort, "hiking");
  assert.equal(assembleRow({ ...base, recorded_datetime: "2025-12-16T00:00:00" }).cohort, "higher-for-longer");
});
