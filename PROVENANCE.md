# PROVENANCE

## Reused components (disclosed)

Basis reuses one substantial piece of code the author built prior to this event:

1. **The decomposition engine** — a levered-return CRE valuation engine that prices each state by solving for the price that delivers the buyer's levered-IRR hurdle (no assumed exit cap rate; the resale is re-priced recursively, terminating on a fundamentals anchor), then splits a price move into three forces (debt cost / NOI / required return) via exact flat-Shapley attribution. Committed under `src/prior/` (the forward-node solver, the chain, the anchor, the Shapley decomposition, the scenario NOI source and types). Author's prior work, headered as such.

The author's prior NYC-research Python (an ACRIS deed↔mortgage join with CEMA detection) informs the **method** of the scrape built today, but is **not** part of this repo — it lives in a separate private research project and contains research-surface material (survivor analysis, corpus sweeps, the gold-set labeling pipeline) that is not public-record-derivable code. The Basis ACRIS scrape, CEMA recovery, gold-set grader, loop, API, and UI are **built during Build Day in TypeScript**, in `src/grader`, `src/loop`, `src/api`, `src/ui`.

Specifically: the CEMA recovery **algorithm** (select the most-recent consolidation in the active chain) derives from the author's prior Python research; the **TypeScript implementation, the bug-fix over the prior code's max-amount selection** (the prior reference picks the largest consolidation, which only coincidentally lands on the live senior — Basis selects by recency in a satisfaction-aware active chain), **and the integration into the gold-set gate are Build Day work.**

These are brought in as components, consistent with the event rule that prior work may be reused if clearly identified. **The Basis system — the scrape→decompose→test→improve loop, the self-improving harness, the API, and the UI — is built during Build Day.**

## Repo structure IS the provenance boundary

The reused components are committed INTO this public repo (the live app must not depend on any uncommitted external code — judges review what is demoed). The boundary is made unmistakable by directory structure, not by git history alone:

- `src/prior/` — reused prior work (the decomposition engine: solver, chain, anchor, Shapley decomposition, scenario NOI). Every file headered as prior work.
- `src/grader/`, `src/loop/`, `src/api/`, `src/ui/` — built during Build Day.

Git history (which begins at the event) shows the event-built code being written; the directory split shows which code is prior. Both together make the boundary impossible to misread. All six orchestration docs (`brief.md`, `BUILD_PLAN.md`, `ENGINE_NOTES.md`, `GRADER_SPEC.md`, `PROVENANCE.md`, `goldset.csv`) are in the first commit — they are part of the orchestration artifact the rubric values.

**Demo-language discipline on CEMA:** CEMA extraction is prior machinery. Frame the hero beat as "Claude built the grader, loop, and harness that force this prior extraction component to prove itself against the gold set before feeding the model" — NOT as Claude building CEMA recovery from scratch at the event.

## Gold-set fixtures (disclosed)

The labels in `goldset.csv` were hand-made by the author before the event by reading public NYC ACRIS records, and verified (deed prices cross-checked against NYC DOF rolling sales; the hardest CEMA recoveries hand-confirmed against the recorded agreements). They are included as disclosed pre-event test fixtures that act as the data-quality gate.

## What is NOT in this repo

No data from any private research project is included. The gold set and all scraped data contain only public-record-derivable fields (BBL, document id, document type, classification, public-record amounts). No servicer data, no CMBS surveillance fields, no proprietary research columns.

## Data sources (all free, all public)

- NYC ACRIS via the NYC Open Data SODA API
- NYC GeoSearch (address → BBL)
- NYC DOF rolling sales

No proprietary or paid data was used.
