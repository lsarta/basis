# BRIEF — Basis

**A commercial real estate valuation model that learns from public records. It reads NYC transactions, decomposes every price move into the three forces that actually drive it — the cost of debt, the property's income, and the return buyers demand — and gets sharper at valuing deals the more records it reads.**

Built on Opus 4.8, Claude Build Day, June 13 2026. Public data only. Fresh public repo.

---

## SCOPING DECISIONS (made after the docs were first drafted — these override conflicting language below)

1. **Product type is fixed to MULTIFAMILY for this build.** Every scraped deal is NYC multifamily. This controls away product-type heterogeneity so the regime axis is clean. Multifamily chosen because: highest ACRIS transaction volume (the scrape actually fills cohorts), CEMAs concentrate here (the hero beat and the product type agree), and the gold-set deals (incl. 300 W 44th) are already in this regime.

2. **The regime axis is RATE-VINTAGE COHORT, derived from recording/sale date** — not building class, not borough. Tag each deal into one of 3–4 rate cohorts spanning the 2016→2026 environment. This tag is free from public data; no proxy needed. Building class and borough are explicitly out of scope today — roadmap for "expand to all product types / all markets."

3. **The headline is REGIME SEPARATION, not pooled convergence.** As the model reads more deals, the three-force decomposition differs visibly across rate cohorts (debt force dominates the recent high-rate cohort; fundamentals/NOI force dominates earlier cohorts), and per-cohort decompositions stabilize as cohorts fill. Pooled parameter convergence is the FLOOR/fallback meter, not the lead. Prediction error is built but labeled proxy-based, led with only if clean by 1:30.

4. **Force attribution is relative and needs no NOI level; absolute price prediction does.** The Shapley split of a price move into the three forces foots to the total regardless of NOI level — the regime headline rests on this and needs no NOI proxy. Only the prediction-error meter needs an NOI input; for that meter use a documented public/proxy NOI assumption by cohort and label it proxy-based. The NOI dependency must never leak into the regime-separation headline.

---

## THE PROBLEM

When a commercial property's value moves, the headline reason is always "cap rates compressed" or "cap rates widened." But a cap rate is one number doing three different jobs, and on its own it cannot tell you which one moved:

- **Did the building's income grow?** (a real-economy story: leasing, rents, operations)
- **Did debt get cheaper?** (a rates-and-credit story: coupons, leverage, loan structure)
- **Did buyers accept a lower return?** (a sentiment story: the yield equity demands for the risk)

These are three completely different situations, each calling for a different decision. Underwrite to the wrong one and you've mispriced the risk. Yet the entire industry prices off the blended number and can't separate the forces. Worse: most valuation tools are static — they don't get better as the market generates new evidence.

## WHAT BASIS IS

A valuation **system**, not a one-shot model. Four stages wired into a loop:

1. **Scrape** — pull real NYC commercial transactions from public records (ACRIS).
2. **Decompose** — run each price move through a levered-return engine that separates it into the three forces (debt cost / NOI / required return), summing exactly to the total move.
3. **Test** — hold out the most recent transactions, predict them from the earlier ones, measure the error.
4. **Improve** — re-estimate the model as more data arrives, and show it get better.

The loop is the point. Every new transaction the system reads sharpens its estimates. It is a model that **compounds with public data**.

## THE ENGINE (how the decomposition works)

Price each transaction the way a buyer actually sets a bid: start from the levered return the buyer needs on their equity, then solve for the price that delivers it — with **no assumed exit cap rate** (the resale is priced the same way, recursively). Hold income and the required return fixed, make debt more expensive, and the price a buyer can pay falls; that fall is the debt force, isolated. Run each input through and the three forces reconcile to the total move exactly (a Shapley attribution — the one split that foots to the total regardless of order). The cap rate is a *derived output* of this process, not an input — which is the whole point: it reflects nothing real on its own.

## WHAT OPUS 4.8 DOES THAT'S HARD (the surprising-capability story)

Two things, both genuine judgment, not plumbing:

1. **Reading adversarial public records.** NYC's mortgage-recording tax pushes most large loans into Consolidation/Extension/Modification Agreements (CEMAs), where the recorded "mortgage" shows a small gap note while the true consolidated loan — often 6–12x larger — sits in a separate agreement. The model must select the correct consolidation instrument in a tangled chain (a parcel can carry a stale old agreement next to the live one) and read the real loan amount. Naive reads make a heavily-levered deal look all-cash.
2. **The self-improving loop itself.** The model re-estimates its own parameters as data grows and measures whether it actually improved — a closing loop the model runs and grades, not a human.

## THE DEMO — THE MONEY SHOT

The decomposition is **regime-conditional**, shown live on real public multifamily records. Scrape NYC multifamily deals, tag each by rate-vintage cohort, decompose each price move. The money shot: **two rate cohorts decompose into visibly different force-mixes** — the debt force dominates the recent high-rate cohort, the fundamentals/NOI force dominates an earlier cohort — a split the blended cap rate completely hides. As the model reads more records, it sorts deals into cohorts and the per-cohort decompositions stabilize and diverge from each other. The thing that improves is **regime resolution**, not an error bar.

**Headline + floor + stretch:**
- **Regime separation (HEADLINE):** same product type (multifamily), decomposed across rate vintages, the forces split differently by cohort. Rests on relative attribution — no NOI proxy needed. This is the thesis made visible: the blend hides which force moved, and which force moved is regime-dependent.
- **Parameter convergence (FLOOR):** the three-force estimates tighten as cohorts fill. Moves cleanly on small n almost by arithmetic — the safe fallback if regime cells come back too thin to separate. Honest about what it is: a sampling-distribution story, not the lead.
- **Prediction error (STRETCH, proxy-labeled):** held-out deal price error, falling as data grows. Needs an NOI proxy; labeled proxy-based; led with only if clean by 1:30.

Decide the lead by ~1:30 on what the real data does. The go/no-go for the headline: **at least two populated rate cohorts by 12:30.** If one cohort comes back with three deals, show two cohorts not four; if separation won't hold, fall back to the convergence floor. You always have a true, visible "it improves" story.

## DATA (all free, all public)

- NYC ACRIS via NYC Open Data SODA API (deeds = prices, mortgages/CEMAs = loan terms → real-trade LTV)
- NYC GeoSearch (address → BBL)
- NYC DOF rolling sales (independent price cross-check — the data-quality gate)

## TECH

TypeScript. The decomposition engine is reused as a component (prior work, in src/prior — see PROVENANCE); the ACRIS scrape and CEMA recovery are built today. Next.js for the API + thin client. Deploy to Vercel. A tool, not a dashboard.

## BUILD ORDER (loop-first, verification-gated)

1. **Stand up the data-quality gate first.** Load the gold set (disclosed pre-event fixtures — see PROVENANCE.md) and write the grader that scores scraped extraction against it. Scraped data does not enter the model until it passes the gate. (Grader hardening — flag rows with `amount_reliable=false` FAIL on any usable modeled amount, not merely unscored; Peapack scores channel+lender+classification with amount marked not-attributable; blanket row any-dollar=FAIL. See GRADER_SPEC.md.) This is the validity discipline that makes the whole loop trustworthy.
2. **Scrape stage:** ACRIS → clean **multifamily** transaction rows (deed price + CEMA-aware real loan amount + BBL), **each tagged by rate-vintage cohort (from recording date)**, passing the gate.
3. **Engine stage:** wire the decomposition engine to the live scraped rows (it has only ever run on static data — this is the connection that makes Basis real). **Pairing rule:** decompose a price move between two states = same-BBL, two valid arms-length deeds ordered by date. No valid pair → return "insufficient public record history," never force a decomposition.
4. **Test stage:** backtest harness — hold out a **fixed** set of recent deals (same holdout across every data-size step), predict from earlier, measure error.
5. **Improve stage:** at each data-size step (50 → 100 → 150) compute the headline (per-cohort decomposition separation + stabilization) and the floor (pooled convergence); emit the curves. Prediction-error meter built but proxy-labeled.
6. **Thin UI:** the regime-separation view (two cohorts, different force-mixes) + a "decompose this deal" lookup **preselected to 300 W 44th** (has the deed + M&CON package), not arbitrary address. Deploy continuously; commit constantly (git history = provenance).

## DONE = ALL TRUE (machine-verifiable)

- **Data-quality gate passes the gold set — exact pass threshold = all 17 rows by their per-class rule** (pinned to `goldset.csv`, so the grader can neither fail-forever nor pass-falsely):
  - **Block A — 5 CEMA recoveries:** 4 `cema_consolidation` amounts exact to the dollar (300 W 44th = `190000000`, NOT the stale 2007 `104000000` on the same parcel) + 1 `blanket_not_attributable` (169 W 83) where only the classification token is scored and ANY dollar amount on the row = FAIL.
  - **Block B — 12 deeds/takeouts/flags:** 5 `arms_length_purchase` deed prices exact (ACRIS = DOF to the dollar) + 3 takeouts (2 `takeout_regional_bank`, 1 `takeout_new_securitization`: `takeout_channel` exact token, `takeout_lender` normalized-core-token, amount scored only where `amount_reliable=true` — Webster/Wilmington true, Peapack false) + 4 flag exemplars (`still_outstanding`/pari-passu, `commitment_not_funded`, `coop_unit_deed`, `non_arms_length`).
  - **`amount_reliable`: 11 true / 6 false** — the grader scores `true_amount` only where `amount_reliable=true`.
  - **`partial_interest`: handled-but-unexemplified** — the grader supports the class, but no `percent_trans < 100` parcel exists in the verified data, so there are 0 rows (none fabricated). NOT a pass condition.
- The loop runs end to end: scrape → decompose → test → improve, on real ACRIS **multifamily** data
- **At least two populated rate cohorts decompose into visibly different force-mixes** (the regime headline) OR pooled parameter convergence improves across ≥3 data-size steps (the floor). One of these is demonstrably true.
- Prediction error uses a **fixed holdout** (same held-out deals at every step); labeled proxy-based if NOI is proxied
- Live URL responds; README lets a stranger rerun the loop
- **Stretch:** the "decompose this deal" lookup works on an arbitrary NYC address (default demo is preselected 300 W 44th)

## RUBRIC — how this is judged, how Basis answers

- **Impact (35%):** the industry prices off a blended number it can't decompose; Basis separates the three forces AND compounds with public data. Real users: CRE lenders, acquisitions, valuation.
- **Demo (35%):** the decomposition shown regime-conditional live on real records — two rate cohorts, same product type, different force-mixes the cap rate hides.
- **Opus 4.8 Use (15%):** judgment on adversarial documents (CEMA recovery — framed as the grader/loop forcing the prior extraction component to prove itself, NOT as event-built extraction) + the self-grading improvement loop. The "surprised even us" story.
- **Orchestration (15%):** gold-set-gated scrape, the loop as a repeatable harness, "rerun tomorrow" = point it at a new data window or a new county.
