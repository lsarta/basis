# `src/loop/scrape` — ACRIS scrape + CEMA recovery

**Built during Build Day (TypeScript).** Produces clean NYC **multifamily** transaction rows —
deed price + CEMA-aware real loan + BBL + rate-vintage cohort — in the grader's schema, gated
before anything enters the model. Method reimplemented (not copied) from the author's prior Python
research; the recency-selection bug-fix and the gate integration are Build Day work (see PROVENANCE.md).

## Run

```bash
npm run scrape:replay     # the hard gate — must be GREEN before any corpus pull (offline after 1st run)
npm run scrape:dryrun     # one recent month of Manhattan AP deeds, rendered for review
node --test "src/loop/scrape/*.test.ts"
```

`scrape:replay` is the artifact that must be green. It is **standalone and offline** (fetches the 17
fixture parcels once, caches them, then re-derives in seconds), so extraction logic iterates fast.

## The gate (two tiers, both reuse `src/grader`)

- **`structuralGate(row)`** (`gate.ts`) — rule-validates an arbitrary corpus row against the grader's
  invariants (classification ∈ enum, channel literal, amount present iff `amount_reliable`,
  refusal ⇒ no dollar, not-attributable amount never reaches `debt.loan_amount`, Block-A/B key
  discipline). Flagged rows are **excluded but logged** (`flagged.jsonl`), never silently dropped.
- **gold replay** (`replay.ts`) — runs the real `grade()` against the fixtures. **Hard-gates on the
  12 attempted rows; 5 deferred rows are shown reason-tagged.** `pipeline.runWindow` refuses to run
  unless replay is green (`assertReplayGreen`).

### Attempted (12, hard gate) vs deferred (5, disclosed)
- **Attempted:** 5 `arms_length_purchase`, 4 `cema_consolidation` (incl. 300 W 44th $190M not $104M),
  1 `blanket_not_attributable`, 1 `commitment_not_funded`, 1 `non_arms_length`.
- **Deferred:** 3 takeout rows (channel/lender = v2 debt-**coupon** inference; loan **quantity** + LTV
  are recovered now), 1 `still_outstanding` (pari-passu split), 1 `coop_unit_deed` (**soft gold label**
  — records in public ACRIS as CR/F1 family disposition).

The replay also prints a **grounding audit**: per attempted row, is the gold label `grounded` in
public ACRIS, `soft`, or a `note` (grounded but flagged — AGMT-sourced / multi-lot / non-AP)?

## CEMA recovery (`cema.ts`) — the hard read

A recorded MTGE is often only the new-money gap note; the consolidated senior sits on an M&CON (or
an overloaded AGMT). Recovery selects the **most-recent consolidation in the active chain** (recency,
**not** magnitude — the fix over the prior code) within the trade window, recovering the senior from
the SODA `document_amt`. A consolidation cross-collateralizing parcels via a **spreader (SPRD)** is a
**blanket** → `blanket_not_attributable` (never attributed to one parcel). A recorded mortgage
materially over the deed price is a **commitment**, not a funded balance → refused.

## Files

| file | role |
|---|---|
| `types.ts` | `ScrapedRow` (incl. `debt:{loan_amount,ltv,coupon}`), SODA shapes, cohorts, doc buckets |
| `cohort.ts` | `cohortOf` — 4 rate-vintage cohorts (pre-2020 / ZIRP-COVID / hiking / higher-for-longer) |
| `cache.ts` | idempotent disk cache under `data/raw/acris/` (gitignored) |
| `soda.ts` | SODA client — backoff, 429/Retry-After, paging-to-exhaustion (`paginateAll`) |
| `acris.ts` | the 3-dataset join (Master/Legals/Parties); `fetchCandidateDeeds` = AP/Manhattan corpus filter |
| `cema.ts` | recovery: recency selection, blanket (spreader), commitment guard — pure, unit-tested |
| `classify.ts` | deed classification (coop / non-arms-length / arms-length) — pure |
| `row.ts` | `assembleRow` — enforces the `amount_reliable` contract + debt-quantity exclusion |
| `adapter.ts` | `toPrediction` — projection into the grader contract |
| `gate.ts` | `structuralGate` + attempted/deferred sets |
| `audit.ts` | grounding audit (public-record read vs gold label) |
| `extract.ts` | IO driver: `extractParcel` (deed-driven), `extractDocument` (standalone consolidation) |
| `replay.ts` | the gold-replay gate (`buildReplay` / `replayResult` / render) |
| `pipeline.ts` | replay-gated corpus sweep → admitted/flagged jsonl |
| `dryrun.ts` | small-window reporter (rows + CEMA recoveries + gate tally + cohort distribution) |

## Note on the corpus filter (AP vs CR — kept honest)

The corpus filter is `property_type='AP'` (apartment building), `borough='1'`. The grounding audit
found the gold's arms-length deeds are **not all AP** — 300 W 44th (the hero) and 1905 Third record
as `CR` (commercial real estate), because large MF towers often code commercial.

**v1 cohort population is AP-coded institutional multifamily for product-type purity** (this excludes
sub-10-unit coops/walk-ups by design). **CR-coded MF towers — including the 300 W 44th hero — are
demoed via the preselected "decompose this deal" lookup, not the cohort sweep.** Widening to
`CR`-with-a-residential-guard is the roadmap toward all-CRE. This keeps the AP/CR distinction explicit
rather than hiding that the hero is not in the swept population.
