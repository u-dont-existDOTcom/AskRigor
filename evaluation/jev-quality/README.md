# AskRigor: Jev research-quality evaluation (offline, nonauthoritative)

## Purpose

Test whether Jev adds **incremental** detection of answer-quality failures that
AskRigor's existing checks miss. Exact-rule compliance alone is not enough.
Compare against current existing checks **and** a separately blinded stronger
model using the same evidence. A detected issue must be independently checked
for correctness and practical importance; a raw flag is not validated research.

**Status: SOURCE IMPLEMENTED / NO REAL MODEL RESULTS.** This folder contains
14 deidentified **development reconstructions** drawn from documented failure
classes (AskRigor issues #445, #456, #457, #458, #459), including four negative
controls to measure false alarms. The reconstructions are not the actual
preserved original model responses and cannot by themselves prove first-turn
performance. All 14 are DEVELOPMENT, and none is untouched confirmation.

## Existing cases

- DMSO source relevance: missing human comparators, dose-response, mixing
  infusions with people, causal source roles, surrogate overreach, and freezing
  versus warm-exposure tradeoffs
- User-facing research quality: unnecessary clarification, unsupported
  'preliminary' without continuation, misidentified Psilocybe taxa, and omitted
  expert forecasts / cultured-neuron computing
- Negative controls: valid mechanism-only answers, completed narrow summaries,
  cautious risk accounting, and a genuinely necessary scope clarification

The candidate must decide from the **question + factual context + proposed
answer**, and never see `gold.json`, issue provenance, earlier reviewer
judgments, or a predicted verdict in its first independent pass.

## Running the offline tests

No provider calls or paid credits are used by any command here.

```sh
cd evaluation/jev-quality
python3 -m unittest -v test_pilot.py
python3 pilot.py prepare --out /tmp/jev-askrigor-blind-packets.jsonl
python3 pilot.py score --out /tmp/jev-askrigor-scoring.json
```

The initial report must show **zero Jev and zero stronger-model comparisons**.
It would be incorrect to fill those fields with passing local unit-test counts.

## Subsequent model comparison (capped provider authority)

The owner authorized **USD 1.00 total incremental Jev evaluation spending**
on 15 November 2026, across Mission Control and AskRigor (not $1 per model,
session or day). Use the **same private, persistent** budget ledger and the
`scripts/jev-budgeted-evaluator.py` runner in UDA's Mission Control source.
That runner checks the official Decisions model catalog automatically and
chooses the latest price-eligible pinned Jev (currently 1.14) before 1.13;
it fails closed on repeated calls, ambiguous usage, budget exhaustion,
account/key failures or unexpected higher model prices. The user's account
reported existing prepaid credit, but **no working key is currently available
to this isolated runner**, so no actual inference was performed.

1. Use the deidentified blind packets. Each Jev request uses OpenRouter's
   existing Decisions/Noul input contract and a fixed 0.5 classification
   threshold. Validate the actual Jev schema/endpoint against current provider
   documentation before any paid inference. Never send raw patient material,
   contact data, source-private full text, account IDs, or credentials.
2. Independently score the existing AskRigor checks (or a fresh version frozen
   to the case) as the `existing` baseline. Do not fabricate their outputs.
3. If explicitly authorized under the **current** provider and spending
   policy, run one Jev response per case and collect response ID, actual
   provider success/failure, usage cost and latency. **No automatic retry on
   ambiguous failures.** If the Jev endpoint is still failing, stop rather
   than repeatedly spending.
4. Use the same blind factual packet with a stronger-model evaluator from an
   authorized plan-entitled surface. An inability to programmatically use it
   is UNKNOWN rather than a fictitious comparison. No extra paid model calls
   without explicit spend authority.
5. Freeze each independent pass before exposing `gold.json`. Store parsed
   results as JSONL rows:
   `{"case_id":"...","model":"existing|jev|stronger","status":"OK|ERROR|NOT_RUN","flags":["..."],"response_id":"...","cost_usd":0.0001,"latency_ms":100}`.
   A Jev OK row requires `response_id`. A failed provider call requires
   `status:"ERROR"`, a fallback identity when available, and no flags.
6. To normalize a **previously obtained** raw Jev response file:

```sh
python3 pilot.py ingest-jev --input /private/path/jev-responses.jsonl --out /private/path/jev-predictions.jsonl
python3 pilot.py score --predictions /private/path/all-observations.jsonl --out /private/path/report.json
```

With the owner-authorized USD 1.00 shared runner, first create the frozen
AskRigor blind packets using the command above in an owner-private directory,
then invoke the single budgeted evaluator on the **same** packets and ledger
(the script selects 1.14 before 1.13 without an owner version-selection prompt).
The runner will refuse paid inference if the exact authorized OpenRouter key
is unavailable and record zero spent; do not copy keys from a protected service.
After any successful run, export its saved typed decisions without any new
provider request:

```sh
python3 scripts/jev-budgeted-evaluator.py export-askrigor \
  --out /private/jev-versioned-results.jsonl
cd /path/to/AskRigor/evaluation/jev-quality
python3 pilot.py score --predictions /private/jev-versioned-results.jsonl \
  --jev-version typesafe/jev-1.14 --out /private/jev-1.14-score.json
python3 pilot.py score --predictions /private/jev-versioned-results.jsonl \
  --jev-version typesafe/jev-1.13 --out /private/jev-1.13-score.json
```

The score counts each case once **per pinned model version**; if two Jev
versions appear without `--jev-version`, it refuses rather than silently
pooling them. Provider responses are deduplicated by response_id/fallback
identity; missing results remain UNKNOWN. Detection gains, newly introduced
errors, benign controls, latency and cost must be compared on matched cases.
Results from the diagnostic DEVELOPMENT cohort and later genuinely held-out
cases must be reported **separately**.

## Interpretation and stopping

- **Useful** requires independently confirmed incremental high-value problems
  caught vs existing AskRigor, with acceptable false alarms and marginal cost,
  and a plausible advantage over stronger-model review.
- Passing deliberately designed development cases is **not** confirmation.
  Gather genuine later unprompted real AskRigor failures only when authorized
  and privacy-safe; freeze the checker and scoring before those cases.
- Do not add another mandatory blocking `finalize_research` gate merely because
  this diagnostic flags something. AskRigor's protocol/source/citation authority
  remains intact. This test changes no live research, public Atlas findings,
  clinical advice, automation schedule, model selection or release status.
- This is an evaluation harness and fixtures, **not a live Jev integration**.
  The existing Jev HTTP failure pattern and applicable zero-incremental-spend
  boundaries must be resolved before any provider runs.

## Recorded first execution

Offline suite: **10/10 tests passing** on 15 November 2026 after adding
imported-response coverage. Fourteen deidentified blind packets were created;
the scored report correctly has **zero actual Jev or stronger-model observations**.
No Jev or stronger-model inference was performed.
