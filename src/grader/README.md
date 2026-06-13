# `src/grader` — the data-quality gate

**Built during Build Day (TypeScript).** Not prior work. Scores extraction output
against the disclosed gold set (`goldset.csv`). **Scraped data never enters the model
until it passes this gate** — it is the trust discipline that keeps the loop from
compounding garbage.

## Run

```bash
node src/grader/selftest.ts     # human-readable render: 17/17 + each perturbation
node --test src/grader/grade.test.ts   # machine-verifiable assertions
```

## Files

| file | role |
|---|---|
| `types.ts` | schema, closed enums, block/refusal sets — data only |
| `csv.ts` | RFC-4180 CSV parser + typed gold-set loader (header-validated) |
| `normalize.ts` | lender core-token normalization (§4) + literal channel match (§5) |
| `grade.ts` | the grader: per-row key selection, per-field scoring, composite |
| `render.ts` | terminal rendering of a `GradeReport` |
| `selftest.ts` | the self-test (clean 17/17 + perturbations + negatives) |
| `grade.test.ts` | the same, as `node --test` assertions |

## The seven rules (from `GRADER_SPEC.md`, all non-negotiable)

1. **Per-row key selection.** Block A (`cema_consolidation`, `blanket_not_attributable`)
   keys on `document_id`; Block B keys on `(bbl, document_id)`. Block membership is decided
   by **classification, not doc_type** (AGMT spans both blocks). 3 Block-A rows have an
   empty `bbl` by design — the grader never matches on an empty bbl.
2. **`(bbl, document_id)` join, never bbl alone.** `1010340037` appears twice (the 300 W 44th
   deed + its M&CON) and both predictions even share that bbl, so a bbl-only map would collide.
3. **Per-field scoring gated on `amount_reliable`.** `true_amount` is scored only where
   `amount_reliable=true` (11/17). On an `amount_reliable=false` row a usable modeled amount is
   a **FAIL** (not merely unscored); a null amount must not halt classification/channel/lender
   scoring. Peapack scores channel+lender+classification, amount not-attributable.
4. **Lender = normalized core-token.** uppercase → strip punctuation → collapse ws → drop
   corporate-suffix noise → require core token(s). `WILMINGTON TRUST` (two tokens, because
   `WILMINGTON` alone collides with Wilmington Savings); `WEBSTER`, `PEAPACK` (one token).
5. **Channel = literal closed enum.** `regional-bank balance sheet` | `new-securitization`,
   exact `===`, no normalization. A missing hyphen or trailing space FAILS.
6. **Never score `note`.** It deliberately carries dollar figures as documentation; grepping
   it would false-FAIL the blanket-refusal row on its own text.
7. **Refusal is a positive label.** `blanket_not_attributable` passes iff the engine emits that
   token; any dollar on the row = FAIL; an empty/"unknown" classification is a whiff (also FAIL),
   scored distinctly from a refusal.

## API

```ts
import { loadGoldset } from "./csv.ts";
import { grade, goldAsPredictions } from "./grade.ts";

const gold = loadGoldset();                 // GoldRow[] from repo-root goldset.csv
const report = grade(gold, predictions);    // predictions: Prediction[] from the extractor
report.allPass;                             // boolean — the gate
report.rows;                                // per-row pass/fail + per-field detail + reasons
```

A `Prediction` is one instrument's extraction `{ bbl?, document_id, classification?, amount?,
channel?, lender? }`. `goldAsPredictions(gold)` turns the fixture's own `true_*` values into
perfect predictions — the self-test's 17/17 input.
