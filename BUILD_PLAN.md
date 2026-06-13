# BUILD DAY — STEP BY STEP (Basis)

Targets are guides, not rails. One rule when you drift: **protect the 4:00 PM wrap, cut scope not the loop.** The loop running thin beats any single stage built deep. The demo is the loop improving — protect that above all.

---

## BEFORE YOU LEAVE (~8:15 AM)
- [ ] This folder has: `brief.md`, `goldset.csv`, `PROVENANCE.md`, `BUILD_PLAN.md`, `ENGINE_NOTES.md`, `GRADER_SPEC.md`
- [ ] Laptop + phone charged, charger + ID
- [ ] Know where the reused code lives: the decomposition engine in `~/triptych/src` (engine, decomposition, anchor, scenarios, noi) — copy into `src/prior/`, headered. The ACRIS/CEMA scrape is BUILT TODAY in TS; the prior Python research (`~/triptych/analysis`) is reference-only, never copied in.
- [ ] BART to Embarcadero

## 9:00–10:30 — ARRIVE, LOAD, DON'T BUILD
- [ ] Check in (ID, wristband). Wifi: `Claude Build Day` / `problemsolvers`
- [ ] Get the $500 credit link → API key into `.env`
- [ ] Connectivity test: ACRIS token + Anthropic key both return data (commands below)
- [ ] Discord #announcements for any ripples
- [ ] Sit through kickoff. You're loaded, not behind.

## 10:30–11:00 — REPO + GATE FIRST
1. `gh repo create basis --public --clone && cd basis`
2. Copy in ALL SIX docs (`brief.md`, `BUILD_PLAN.md`, `ENGINE_NOTES.md`, `GRADER_SPEC.md`, `PROVENANCE.md`, `goldset.csv`) + reused components under `src/prior/` (headered as prior work). First commit. (The docs are orchestration artifacts the rubric values; the `src/prior/` split is the provenance boundary — see PROVENANCE.md.)
3. Open Claude Code. **Drop in `brief.md`.** Answer its questions.
4. **First build = the data-quality gate:** the grader that scores extraction vs `goldset.csv` (under `src/grader/`). Scraped data enters the model only after passing this. Hardening: flag rows (`amount_reliable=false`) FAIL on any usable modeled amount; Peapack scores channel+lender+classification, amount marked not-attributable; blanket any-dollar=FAIL. Self-test green (17/17 clean + each perturbation fails only its row) before any extraction.

## 11:00–12:30 — SCRAPE + ENGINE (stages 1–2 of the loop)
- **Scrape (built today in TS):** build the ACRIS scrape + CEMA recovery → clean **multifamily** transaction rows (deed price + real CEMA-aware loan + BBL), **each tagged by rate-vintage cohort (recording date, 3–4 cohorts)**, gated by the grader. Use the prior Python (`~/triptych/analysis/transactions/gate1_nyc_join.py`) as a read-only method reference for the deed↔mortgage join + CEMA detection — do not copy it in.
- **Engine:** wire the decomposition engine to the LIVE scraped rows. Pairing rule: same-BBL, two valid arms-length deeds ordered by date; no valid pair → "insufficient public record history," never a forced decomposition. This is the keystone — the engine has only ever run on static data.
- **CHECKPOINT 12:30 — (a) does the engine decompose a real scraped multifamily deal? (b) are there ≥2 populated rate cohorts? (c) do the per-deal inferred required-return values cluster sensibly within a cohort?** (a)+(b) yes → the regime headline is alive. (b) thin → fall to the convergence floor. (c) wild → NOI proxy is poisoning the inversion; show relative per-cohort attribution only (needs no inversion). Show the RENDERED rows and values, not a description.

## 12:30–1:30 — TEST + IMPROVE (stages 3–4 — the demo's spine), through lunch
- **Headline (regime separation):** show ≥2 rate cohorts decomposing into different force-mixes; across data-size steps the per-cohort decompositions stabilize and diverge. Rests on relative attribution — no NOI proxy.
- **Floor (parameter convergence):** pooled three-force CIs shrink across steps. The fallback if cohorts are too thin.
- **Stretch (prediction error):** backtest with a FIXED holdout (same deals every step), train earliest-k, MAPE. Proxy-labeled (NOI proxy by cohort).
- Eat while it runs. Glance between bites.
- **CHECKPOINT 1:30 — does the regime headline hold (≥2 cohorts, visibly different mixes)?** Yes → that leads. No → lead with the convergence floor. Either way you have a true "it improves" story.

## 1:30–2:45 — THIN UI + DEPLOY
- The regime-separation view (≥2 cohorts, different force-mixes — the one screen that matters) plus a "decompose this deal" lookup **preselected to 300 W 44th** (deed + M&CON package; arbitrary address is stretch only).
- `vercel` deploy **early**, keep redeploying. Live URL at 2:00 you improve beats a perfect local build that won't deploy at 4:30.
- **CHECKPOINT 2:45 — is the URL live and does the regime view render on real data?** Yes → effectively done, rest is polish. UI fighting you → demo the loop from the CLI/API; the loop is the impact, the UI is the wrapper.

## 2:45–3:15 — LOCK THE DEMO
- Stop building. Walk the demo twice:
  1. "Here's multifamily, decomposed across rate vintages" → cohort A vs cohort B, different force-mixes
  2. "Add more deals, re-tag, re-decompose" → cohorts fill, decompositions stabilize and stay separated — the regime structure holds
  3. The "decompose this deal" lookup (300 W 44th) as the kicker — one deal, the three forces, and the CEMA-recovered $190M senior behind it
- Confirm the headline (regime separation, or convergence floor if thin). Fix only what's flaky. Repo public, `src/prior/` headered.

## 3:15–4:00 — RECORD + WRITE
- 1-min video: the regime separation (two cohorts, different mixes — the cap rate hides this), then the CEMA-recovery moment as the "hard public-records reading" beat. **Framing: the decomposition engine is reused prior work; the ACRIS scrape, CEMA recovery, and gold-set grader are built today. The hard-capability story is the gold-set-gated grader + the CEMA recovery the model performs on adversarial records, both event-built.** Two takes, pick one.
- Submission text: the three-force problem, regime-conditional decomposition, the gold-set-gated self-grading loop.

## 4:00–4:45 — SUBMIT (don't wait for 5:00)
- Form: public repo, live URL, video, team. Open URL in incognito to confirm it loads. Submit.

## 4:45–5:00 — BREATHE

---

## MINIMUM SUBMITTABLE PRODUCT (if the day slips)
Scrape → decompose runs on real multifamily ACRIS data + ≥2 rate cohorts showing different force-mixes (or, if cohorts are thin, the convergence floor improving across 3 steps) + a live URL. That alone is the "regime-conditional valuation model" story. If even that won't cooperate: the engine decomposing one real scraped multifamily deal into three forces, live, is still a strong standalone demo.

### Hard cutovers (operational, not conceptual)
- **12:30 — no stable live scrape:** use a cached public ACRIS multifamily sample, disclosed as public data. Don't burn the afternoon on scrape plumbing.
- **12:30 — inferred required-returns wild:** drop the inversion, show relative per-cohort attribution only (no NOI proxy needed).
- **1:30 — regime separation won't hold (cohorts too thin):** lead with the convergence floor.
- **2:15 — UI not deployed:** ship a JSON/API run-viewer + static chart instead of the interactive view.
- **3:15 — stop building, start recording.** (Not 3:30 — recording always runs long.)

---

## THREE RULES THAT RESOLVE EVERY DRIFT
1. **Gate before model** — ungated scraped data corrupts the loop silently; the grader is the trust.
2. **Loop thin before any stage deep** — all four stages connected beats one stage perfect.
3. **4:00 is the wall** — scope shrinks, the loop and its verification never do. When the regime headline wobbles, fall to the convergence floor; never fake separation that isn't in the data.

---

## TERMINAL — connectivity test (at venue)
```bash
set -a; source .env; set +a
curl -s "https://data.cityofnewyork.us/resource/bnx9-e6tj.json?\$limit=1" \
  -H "X-App-Token: $NYC_APP_TOKEN" | head -c 300; echo
curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-opus-4-8","max_tokens":16,"messages":[{"role":"user","content":"ping"}]}' | head -c 300; echo
```

## TERMINAL — pre-flight (tonight)
```bash
claude update && claude --version
gh auth status
vercel whoami
node --version   # 20+
```

## .env (fill at venue)
```
NYC_APP_TOKEN=...
ANTHROPIC_API_KEY=...
```
