// Relative attribution — algebra + regime-signal tests (offline, pure). BUILT DURING BUILD DAY.

import { test } from "node:test";
import assert from "node:assert/strict";

import { relativeDecompose } from "./relative.ts";

const lev = (ltv: number) => ({ ltv });

test("4 explained legs sum to the model move; spread ≈ 0 (constant proxy)", () => {
  const r = relativeDecompose({ price: 10_000_000, date: "2020-06-01T00:00:00", ...lev(0.6) }, { price: 14_000_000, date: "2025-06-01T00:00:00", ...lev(0.6) });
  const explained = r.legs.fundamentals + r.legs.rate + r.legs.spread + r.legs.ltv_availability;
  assert.ok(Math.abs(explained - r.modelMove) < 1e-6, "explained legs must sum to model move M");
  assert.ok(Math.abs(r.legs.spread) < 1e-6, "spread is a constant proxy ⇒ ≈ 0");
});

test("required_return is the RESIDUAL: 5 legs sum to the OBSERVED move", () => {
  const r = relativeDecompose({ price: 10_000_000, date: "2020-06-01T00:00:00", ...lev(0.6) }, { price: 14_000_000, date: "2025-06-01T00:00:00", ...lev(0.55) });
  assert.equal(r.observedMove, 4_000_000);
  assert.ok(Math.abs(r.legs.required_return - (r.observedMove - r.modelMove)) < 1e-9, "required_return = observed − model");
  const five = r.legs.fundamentals + r.legs.rate + r.legs.spread + r.legs.ltv_availability + r.legs.required_return;
  assert.ok(Math.abs(five - r.observedMove) < 1e-6, "5 legs (incl residual) sum to observed move");
});

test("3-force rollup: debt = rate + spread + ltv_availability; rollup sums to observed", () => {
  const r = relativeDecompose({ price: 8_000_000, date: "2018-03-01T00:00:00", ...lev(0.7) }, { price: 9_500_000, date: "2024-09-01T00:00:00", ...lev(0.5) });
  assert.ok(Math.abs(r.rollup.debt - (r.legs.rate + r.legs.spread + r.legs.ltv_availability)) < 1e-9);
  assert.ok(Math.abs((r.rollup.noi + r.rollup.debt + r.rollup.required_return) - r.observedMove) < 1e-6);
});

test("all-cash pair: rate / spread / ltv forces are exactly 0 (no recorded debt)", () => {
  const r = relativeDecompose({ price: 6_000_000, date: "2021-01-01T00:00:00", ...lev(0) }, { price: 7_000_000, date: "2025-01-01T00:00:00", ...lev(0) });
  assert.equal(r.legs.rate, 0);
  assert.equal(r.legs.spread, 0);
  assert.equal(r.legs.ltv_availability, 0);
  assert.equal(r.leveraged, false);
  // only NOI (proxy) + required_return (residual) are non-zero
  assert.ok(Math.abs((r.legs.fundamentals + r.legs.required_return) - r.observedMove) < 1e-6);
});

test("magnitude shares are positive and sum to 1 (sign lives on the dollar legs)", () => {
  const r = relativeDecompose({ price: 12_000_000, date: "2019-06-01T00:00:00", ...lev(0.65) }, { price: 11_000_000, date: "2024-06-01T00:00:00", ...lev(0.6) });
  for (const v of Object.values(r.shares5)) assert.ok(v >= 0, "shares are non-negative");
  const s5 = Object.values(r.shares5).reduce((a, b) => a + b, 0);
  const s3 = Object.values(r.shares3).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(s5 - 1) < 1e-9 && Math.abs(s3 - 1) < 1e-9, "shares sum to 1");
});

test("RATE force is the regime signal: ZIRP→HFL rate leg ≫ within-pre-2020 rate leg (real dated rates)", () => {
  const zirpToHfl = relativeDecompose({ price: 10_000_000, date: "2020-06-01T00:00:00", ...lev(0.65) }, { price: 12_000_000, date: "2025-06-01T00:00:00", ...lev(0.65) });
  const withinPre = relativeDecompose({ price: 10_000_000, date: "2017-06-01T00:00:00", ...lev(0.65) }, { price: 12_000_000, date: "2018-06-01T00:00:00", ...lev(0.65) });
  // rates rose 0.9%→4.3% (ZIRP→HFL) vs 2.3%→2.9% (within pre-2020): a much larger NEGATIVE rate force.
  assert.ok(zirpToHfl.legs.rate < 0, "ZIRP→HFL rate force is negative (debt got more expensive)");
  assert.ok(Math.abs(zirpToHfl.legs.rate) > Math.abs(withinPre.legs.rate) * 3, "ZIRP→HFL rate force ≫ within-pre-2020");
});
