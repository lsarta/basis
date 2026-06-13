# ENGINE + LOOP NOTES (Basis)

## The decomposition engine (reused — the brain)

Prices each transaction by the buyer's actual logic: start from the levered return needed on equity, solve for the price that delivers it, with NO assumed exit cap rate — the resale is re-priced the same way, recursively, terminating on a fundamentals anchor. The cap rate is a derived output, never an input.

Decomposition of a price MOVE between two states uses Shapley attribution over three inputs (debt cost, NOI, required return): the three forces foot to the total move exactly, order-independent, no leftover interaction term. The engine carries invariant tests (the three pieces sum to the total to the dollar; zero-attribution when an input is unchanged). Engine correctness is already verified — Basis is about running it on live data, not re-proving the math.

## The loop (the new thing built today)

```
ACRIS scrape (MULTIFAMILY only) ─→ data-quality gate (gold set) ─→ clean rows
     ─→ tag each by rate-vintage cohort (recording date)
     ─→ decomposition engine: per-cohort force attribution (relative, no NOI level)
     ─→ backtest: fixed holdout, predict, measure error (proxy-labeled)
     ─→ headline: per-cohort decompositions diverge + stabilize ─→ UI
     ─→ floor: pooled convergence (fallback)
```

Re-estimation = the model's priors (required-return level, debt-cost curve) are fit from the data; more transactions → tighter fit. The loop adds data in steps and recomputes.

## The meters (the demo's spine)

**Regime separation (HEADLINE).** Product type fixed to multifamily; regime axis = rate-vintage cohort from recording date (3–4 cohorts, 2016→2026). The three-force decomposition is regime-conditional: the debt force dominates the recent high-rate cohort, the fundamentals/NOI force dominates earlier cohorts. As data grows, deals sort into cohorts and per-cohort decompositions stabilize and diverge. This rests on RELATIVE attribution (the Shapley split foots to the total move regardless of NOI level) — no NOI proxy needed. This is the thesis made visible.

**Parameter convergence (FLOOR).** As k grows, CIs on the three-force estimates shrink. Moves cleanly on small n almost by arithmetic — a sampling-distribution story, not a learning story. Honest framing: this is the safe fallback if regime cells come back too thin to separate. NOT the headline; do not oversell a √n effect as the model learning.

**Prediction error (STRETCH, proxy-labeled).** Train on earliest-k, predict a FIXED holdout, measure MAPE. Needs an NOI input → use a documented public/proxy NOI assumption by cohort, labeled proxy-based. Led with only if clean by ~1:30.

## Training protocol (the prediction meter — make it estimable, not asserted)

- Sort eligible multifamily deals by recording/sale date.
- **Fixed holdout = the most recent N eligible deals, same set for every k.** (Otherwise the curve can improve because the test set changed, not because the model learned.)
- For each k in 50/100/150, train only on the earliest k non-holdout deals.
- For each training deal, invert the engine to infer the required-return value that explains the observed price, given NOI proxy, debt-rate proxy, and LTV.
- Fit a population required-return prior from those inferred values (median/mean + bootstrap CI), **segmented by rate cohort where cell size allows.**
- Predict each holdout deal by solving price using the k-trained prior. Metric = holdout MAPE vs. actual deed price.
- **Early sanity check (12:30):** confirm the per-deal inferred required-return values cluster sensibly WITHIN a cohort on the first ~50. If they're wild, the NOI proxy error is feeding the inversion and neither meter is safe — fall back to showing relative attribution per cohort only, which needs no inversion.

## The two-state pairing rule

The engine decomposes a price MOVE between two states. Pair on: same BBL, two valid arms-length deeds ordered by date, usable assumptions for both states. No valid pair → return "insufficient public record history." Never force a single-instrument decomposition into a fake move. The "decompose this deal" lookup defaults to 300 W 44th (deed + M&CON package present); arbitrary address is stretch.

## The data-quality gate (reused gold set — the trust)

The scraped data must be trustworthy before it feeds the model, or the loop compounds garbage. The gold set is the gate. Grader field-matching policy (per field, not global):
- **amounts: EXACT to the dollar.** The CEMA recovery's credibility IS dollar-exactness.
- **classification / channel tokens: EXACT, closed set.**
- **lender / entity names: NORMALIZED CORE-TOKEN** (uppercase, strip punctuation, collapse whitespace, check core entity token present — e.g. "WEBSTER", "WILMINGTON TRUST"). Corporate suffixes (N.A., AS TRUSTEE) are noise.
- **blanket / not-attributable rows: must REFUSE; any dollar figure = FAIL.** (A blanket agreement cross-collateralizing multiple parcels must not be attributed to one — the correct output is "not attributable.")

## CEMA recovery (built today in TS — the hard read)

NYC mortgage-recording-tax avoidance → most large loans are CEMAs: the recorded "mortgage" is a small gap note; the true consolidated loan sits in a consolidation agreement (M&CON / AGMT). Recovery = select the correct consolidation instrument in the active chain and read its amount from the SODA `document_amt` field (metadata, not OCR). CAUTION: a parcel can carry a stale older consolidation alongside the live one — select the MOST RECENT in the active chain. Naive recorded-mortgage reads understate the loan 6–12x and can flip a levered deal to "all-cash."

## Provenance discipline (non-negotiable)

The public repo contains only public-record-derivable fields. No servicer/CMBS-surveillance columns, no private-research data. The reused decomposition engine is a code component (disclosed, in src/prior); the ACRIS scrape, CEMA recovery, loop, harness, API, and UI are built today. Commit constantly — git history is the proof of what was built at the event.
