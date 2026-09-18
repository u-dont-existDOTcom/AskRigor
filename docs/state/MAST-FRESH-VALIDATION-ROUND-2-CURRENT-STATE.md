# MAST Fresh Validation Round 2 current state

Task: `askrigor-mast-fresh-validation-round-2-20260918`

Branch: `task/mast-fresh-validation-round-2-20260918`

Owner-outcome status: `OPEN`

## Current boundary

Round 2 is in pre-generation implementation and freeze verification. No Round 2 benchmark response has been generated. The private dispatch seed exists outside the repository; only its commitment is public. The selected 12-family validation cohort and one-family limited reserve were derived from identifier-only Git-tree filenames.

## First recovery action

Run `npm run external-evaluation:mast-fresh-r2 -- verify-freeze --mast-git-dir <PINNED_MAST_BARE_GIT_DIR>`. Before response 1, the exact branch must be committed, pushed, covered by the complete deterministic gate, and green in the freeze pull request. Then create and validate the private CI receipt and run `seal-freeze`. Do not run `prepare-generation` before that receipt exists.

## Frozen execution topology

- 12 validation families, 4 arms, 3 trials: 144 generation slots.
- Generation: ChatGPT consumer GPT-5.6 Sol, Extra High, fresh ordinary unpersonalized chat, no tools.
- J1/J2: ChatGPT consumer GPT-5.6 Sol, Extra High.
- J3: ChatGPT consumer Latest, Pro, 5 of 5, only for score-vector disagreements.
- Successful captures are append-only and are never rerun.
- Raw judgments remain immutable; corrected/adjudicated artifacts are stored separately.
- Unblinding is unavailable until every required judgment and adjudication is sealed.

## Eligibility limitation

The pinned MAST DoNoHarm set contains 30 families. Ten are prior development/calibration data and seven produced Round 1 outputs. Thirteen remain semantically eligible. Selecting 12 leaves only `All008` as the reserve. It was mechanically read by Round 1 code but has no known semantic/model, generated-response, or rubric/judge exposure. This one family is not a broad independent confirmation cohort.

## Completion boundary

Green tests, a freeze commit, and a pull request do not complete the task. Completion requires 144 sealed responses, complete J1/J2 coverage, all triggered J3 adjudications, explicit unblinding, raw and clinically reconciled reports, a machine-readable final summary, and a PASS/FAIL/INDETERMINATE disposition under the frozen rule.
