# Custom GPT partial-answer escape audit

Date: 2026-08-21

## Scope

This record captures only the generalized product behavior demonstrated by an owner-provided Custom GPT result. The private research answer, medical narrative, source excerpts, and conversation transcript are not stored here.

## Observed behavior

- The answer declared that important research modules were incomplete, then continued with a long synthesis that read like a completed conventional review.
- An unavailable full text and unaudited private communities were treated as a reason to stop even though public YouTube discovery, creator-content verification, and other research work remained executable.
- Exercise and physical therapy were largely discussed as umbrella classes. One condition-specific exception did not correct the broader conflation, and a single study comparator was allowed to stand in for materially different programs.
- The answer did not show evidence-frontier candidate selection, program-matched creator-content verification, a content-verified watchlist, or the required completion record.
- Internal implementation labels and status enums were exposed in ordinary prose, making the result harder to understand without improving the decision value.

## Repair contract

- A partial or bounded label never waives executable required work.
- A source-specific access gap narrows only that source or lane.
- Umbrella intervention classes must be decomposed into materially distinct programs. When source details are missing, the internal record marks the program unspecified; the reader-facing answer says that the program was not described well enough. That evidence cannot support a class-wide benefit, failure, comparison, or ranking.
- YouTube discovery searches and candidate selection must represent materially distinct program hypotheses when the current option space plausibly contains them.
- The ordinary answer is concise, names programs plainly, omits protocol/compliance preambles, and translates internal statuses into normal language. Raw enums and receipt keys are available only in an explicitly requested technical audit or debug export.
- Machine-readable completion records remain internal to synthesis and are not copied into ordinary user-facing prose.

## Durable regression evidence

- Sanitized fixture: `docs/custom-gpt-partial-answer-regression-v0.1.0.json`
- Executable test: `tests/custom-gpt-partial-answer-regression.test.ts`
- Full router contract: `project/PROJECT_INSTRUCTIONS.md`
- Forum implementation contract: `project/FORUM_SIGNAL_MODULE.md`
- Compact generated source: `skills/askrigor/SKILL.md`
- Generated Custom GPT Instructions SHA-256: `4fff01a07aa817941c5b8cd4c3b0ea2e79621901288140d6cf1056bf402312e5`
- Generated Instructions length: 7,962 characters, leaving a 38-character buffer under the enforced 8,000-character editor limit.
- Action OpenAPI SHA-256 (unchanged): `9a7e19fc4b9b3b8e7e330865925628da7deea54529800dfcf630626ee03efc31`
- Final focused acceptance: 7 test files and 54 tests passed.
- Complete host verification: typecheck and build passed; 60 test files passed with one declared live-file skip; 989 tests passed with five declared credential-gated skips.
- Public-site validation covered four pages and site-deployment tests passed 28/28.
- Independent final re-review found no blocker or Important issue after comparator scope, directional discovery, and recovery-evidence corrections.
- The required pre-release lesson checkpoint was available with 1 open candidate, 1 needs review, 0 accepted not incorporated, 2 incorporated or closed, and 0 deletion eligible; no queued lesson expanded or blocked this repair.

## Product boundary

Repository artifacts can be generated, tested, reviewed, published, and deployed from this environment. No available capability exposes the owner's signed-in Custom GPT editor. After reviewing the then-current 7,962-character Instructions (SHA-256 `4fff01a07aa817941c5b8cd4c3b0ea2e79621901288140d6cf1056bf402312e5`), the owner reported that exact artifact was already installed. This is an owner receipt, not independent editor inspection. The newer 7,978-character citation-display candidate is not installed. Running a fresh UI acceptance prompt remains the explicit external boundary.

## Repository closeout

- PR #44 merged the reviewed repair as `b8e110404130d1d1e85d56112b837c499106086e`.
- The exact post-merge deterministic verification (run `32464548386`), repository workflow policy (run `32464548449`), and CodeQL scan (run `32464548011`) passed.
- The merge changed no runtime, Action OpenAPI, protocol bytes, or public-site bytes, so no production redeployment was indicated. A read-only check at `2026-08-21T08:47:26Z` returned HTTP `200` from the public research health endpoint and privacy page.
- The required pre-closeout lesson checkpoint at `2026-08-21T08:48:17.337Z` remained available with 1 open candidate, 1 needing review, 0 accepted but not incorporated, 2 incorporated or closed, and 0 deletion eligible. No queued lesson expanded or blocked this closeout.
- At `2026-08-21T15:20:33Z`, after the then-current 7,962-character Instructions (SHA-256 `4fff01a07aa817941c5b8cd4c3b0ea2e79621901288140d6cf1056bf402312e5`) were displayed, the owner reported that exact artifact was already installed in the signed-in editor. The newer 7,978-character citation-display candidate is not installed. Its remaining acceptance boundary is exact installation and a fresh GPT UI run. No owner report, repository result, or direct-server result is relabeled as product-interface proof.
