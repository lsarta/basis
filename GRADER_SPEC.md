# GRADER SPEC — Basis data-quality gate

**Build this FIRST tomorrow (BUILD_PLAN step 4). No extraction code until the grader exists and self-tests green against `goldset.csv`.**

The gold set is verified clean. These rules are NOT about data quality — they are about *reading the fixture correctly* so the grader can neither false-fail on its own data nor pass-falsely. Every rule below is read off the real `goldset.csv`.

Schema (9 columns): `bbl, document_id, doc_type, true_classification, true_amount, takeout_channel, takeout_lender, amount_reliable, note`

Pass = every one of the 17 rows passes its own per-class rule.

---

## 1. Per-row key selection — branch by block, never globally
- **Block A** (`cema_consolidation`, `blanket_not_attributable`) keys on **`document_id`**.
- **Block B** (deeds / takeouts / flags) keys on **`bbl`**.
- **3 rows have empty `bbl` by design** — the 3 document_id-keyed CEMA rows (204 Ave A `2025121500444030`, 627 W 142 `2025121700968004`, 339 E 19 `2025123100109002`). They score on amount, which needs no BBL.
- The grader must **NEVER attempt to match an empty BBL**. Select the join key per row by its block, not with one global rule. An empty BBL is a valid Block-A state, not a missing value.

## 2. BBL is not unique — join on (bbl, document_id)
- `1010340037` appears **twice**: the 300 W 44th **deed** (`2025121200273001`, `arms_length_purchase`) and the **M&CON** (`2025121200273005`, `cema_consolidation`) — the shared recording package, two real instruments on one parcel.
- No grader logic may assume one row per BBL. Dedupe and join on **`(bbl, document_id)`**, never `bbl` alone. A bbl-only join silently collapses or cross-matches these two rows.

## 3. Per-field scoring branches, gated on `amount_reliable`
- Takeouts come in two patterns:
  - **Webster / Wilmington** (`amount_reliable=true`): score **amount + channel + lender**.
  - **Peapack** (`amount_reliable=false`): score **channel + lender only** — but the row **still requires correct `true_classification`**.
- Branch on `amount_reliable` **per field**. A null/empty `true_amount` must **not** (a) make the row treated as refusal-style, nor (b) halt token (channel/lender/classification) scoring. `amount_reliable=false` means "do not score the amount on this row," nothing more.
- General rule across all rows: **score `true_amount` only where `amount_reliable=true`** (11 rows true, 6 rows false).

## 4. Lender normalization — core token, multi-word where needed
- Normalize: uppercase, strip punctuation, collapse whitespace, then check the **core entity token(s)** are present.
- Core tokens are **multi-word where a single word collides**: `WILMINGTON TRUST` (two tokens) — **not** `WILMINGTON` alone, which collides with Wilmington Savings Fund Society. `WEBSTER` is sufficient. `PEAPACK` is sufficient.
- Strip corporate suffixes as noise: `NATIONAL ASSOCIATION`, `AS TRUSTEE`, `N.A.`, etc. The fixture's `WILMINGTON TRUST, NATIONAL ASSOCIATION, AS TRUSTEE` must match an engine output of `WILMINGTON TRUST`.

## 5. Channel — literal closed enum, exact match, NO normalization
- `takeout_channel` is a **two-value closed enum**, matched **literally**:
  - `regional-bank balance sheet`
  - `new-securitization`
- Pin these as exact literals. Do **not** normalize, lowercase, or trim into the comparison — a trailing space, `regional bank` vs `regional-bank`, or `new securitization` vs `new-securitization` must **fail**, not silently pass. This is the softest field; make it the hardest.
- `takeout_channel` is populated on exactly the 3 takeout rows; blank elsewhere (blank is correct for non-takeouts, not a miss).

## 6. Never score the `note` column
- `note` is **free-text human documentation**. It deliberately contains dollar figures as context: `$5,511,152` (the blanket total), `$104M` / `$3,160,000` / `$240,000` (sibling-foil amounts), deed-pairing amounts, etc.
- Score the **typed `true_amount` column only**. A grader that greps prose for dollar figures would **false-FAIL the blanket-refusal row on its own note text** (the note names the very numbers the engine must refuse to emit).

## 7. Refusal is a positive label
- `blanket_not_attributable` rows (169 W 83, `2025121700383001`) **pass iff the engine emits that classification**.
- **Any dollar amount emitted for that row = FAIL** — even a "correct-looking" sibling figure ($3.16M M&CON or $240K gap note sit right on the parcel as foils).
- Refusal must be **distinguishable from a whiff** (found-nothing / extraction failure). "Not attributable" is an affirmative, correct answer; "I couldn't find anything" is a failure. Score them differently.

---

## Self-test before extraction
Feed the grader the gold set's own `true_*` values as if they were perfect predictions → **composite must be 17/17 pass**. Then perturb one field per rule (a bbl-only join on `1010340037`; an empty-BBL match attempt; a dollar in the blanket row; `regional bank` without the hyphen; `WILMINGTON` alone) → each must **FAIL the intended row and only that row**. If the clean fixture doesn't self-pass 17/17, the grader is misreading the data — fix the grader, never the gold set.

## Two gates — keep them distinct (the grader vs. the v1 extractor)
This spec defines the **grader**. The grader's correctness bar is **17/17 on correct extraction** (the self-test above) — it scores all 17 rows by their per-class rules and neither false-fails nor passes-falsely. That is a statement about the grader, not about any particular extractor.

The **v1 ACRIS scrape** is a separate artifact graded *by* this grader. Its `gold-replay` harness hard-gates on the **12 rows v1 attempts** — the 5 `arms_length_purchase` deeds, the 4 `cema_consolidation` amounts (incl. 300 W 44th `190000000` not `104000000`), the 1 `blanket_not_attributable` refusal, and the 2 structural flags (`non_arms_length`, `commitment_not_funded`). The **5 remaining rows are deferred to v2** and reported as such, never silently skipped:
- the **3 takeout rows** (`takeout_regional_bank` ×2, `takeout_new_securitization`) — their `takeout_channel`/`takeout_lender` is a **debt-coupon / lender-identity inference** deferred to v2; v1 still recovers the loan *amount* + LTV (debt quantity) where the loan is single-parcel and reliable;
- the **1 `still_outstanding`** pari-passu split note — not inferable from the public `document_amt` alone;
- the **1 `coop_unit_deed`** (2420 Morris Ave) — **a soft gold label, not a v1 extraction gap**: the parcel records in public ACRIS as `CR`/`F1` with family-trust grantors, i.e. reads as a non-arms-length family disposition. The replay tags it `deferred — gold label not reproducible from public ACRIS; parcel records as non-arms-length family disposition`. Both labels exclude the comp from the engine.

A deferred row is shown in the replay scoreboard tagged `DEFER` with its reason; it is **excluded from the model**, not passed through. The hard gate = every *attempted* row passes (verified GREEN). This keeps "the grader scores 17/17" and "the v1 scrape gates on 12" both true and non-contradictory: the first is the grader proving itself on correct input; the second is the v1 extractor proving how much of the correct input it can yet produce.

**Grounding audit.** Because the gold set was not row-by-row re-verified against public records, the replay also reports a per-row **grounding** verdict (public-record read vs. gold label): `grounded` (publicly supported), `soft` (gold label underdetermined/divergent from public ACRIS), or `note` (grounded but flagged — e.g. recovered from an overloaded `AGMT`, spans multiple lots, or `property_type` is not `AP`). This surfaces soft labels even where the row still passes on amount.
