# Scale results explained in the answer (owner bug report, 2026-10-07)

Branch `claude/scale-result-interpretation-20261007`. Nothing merges or deploys without the owner's approval on the owner
questions page.

## The report

The owner pasted GPT's analysis of an AskRigor research answer that said a treatment "improved insomnia by 2.9 ISI
points" and did not explain the scale. GPT found two things:

1. **The answer went out without passing the final check.** `finalize_research` still returned `not_ready`, and GPT
   delivered the answer anyway. That failure is on the client side; AskRigor cannot stop a client from answering. A
   possible later aid: a short check code that passing answers carry and users can look up. It goes to the owner as its
   own question.
2. **The enforcement gap.** HRP and Universal already require decision-relevant statistics and unfamiliar terms to be
   understandable, stating meaning, comparison, direction, magnitude, endpoint, horizon and uncertainty. But the final
   check has nothing that verifies that a score on a rating scale or questionnaire was made interpretable. GPT's
   regression pair:
   - **must fail:** "Treatment improved insomnia by 2.9 ISI points."
   - **acceptable:** "ISI runs from 0–28, with lower scores meaning less insomnia. The treatment average was 6.8 versus
     9.7 with placebo—a 2.9-point advantage. That is a modest difference: it moved the group average from the
     subthreshold-insomnia range to just below the clinical cutoff, but it is smaller than the roughly 6-point
     within-person change commonly used as a benchmark for clearly meaningful improvement."

## Design

Whether a sentence explains a scale is a judgment, so it is not repaired with a word list. The model declares, and the
server checks the declaration exactly against the answer, as with `absence_claims`. Each check is on digits and
quoted sentences, so it works in any language.

`finalize_research` gains `scale_results`. With `answer_draft` it is required, and an empty list means the answer
reports no scale scores. Each entry has:

- `quote`: the answer's sentence or sentences that report and explain the result, copied from `answer_draft`;
- `scale`: the scale's name or abbreviation as the answer writes it;
- `range`: `{ min, max }`, the scale's possible range;
- `better`: `lower` or `higher`;
- `values`: 1 to 4 numbers the quote reports, such as the group scores and the difference;
- `benchmark`: either `{ value, kind }`, where kind is `minimal_important_difference`, `clinical_cutoff` or `other`,
  or `"none_established"`.

The exact checks:

1. The quote occurs in `answer_draft`, using the same matching as `absence_claims`.
2. The scale name occurs in the quote.
3. Both range endpoints, every declared value and the benchmark value occur in the quote as numbers:
   - Digits from any script count.
   - A decimal point or comma counts as the separator.
   - Values compare by absolute value.
   - Ranges written "0–28", "0-28" or "0 to 28" all work.

The answer's statement of `better`, and whether the magnitude wording fits, stay the model's declaration.

The limit: a scale result the AI does not declare is invisible to the server, the same limit as `absence_claims`.

## Tests

- **GPT's pair:** the bad sentence fails (no range, no comparison values, no benchmark); the acceptable paragraph
  passes.
- **Other languages and formats:** a French version with a decimal comma ("2,9 points"); Arabic-Indic digits; and an
  en dash, a hyphen and "to" in ranges.
- **Missing parts:** `scale_results` absent with `answer_draft` gives a next step; a quote not in the answer fails;
  a missing scale name fails; `none_established` needs no benchmark number.
- **Endpoint:** every rule through the real MCP endpoint, as in #285.

## Status

| Step | State |
| --- | --- |
| Plan | Done (2026-10-07) |
| Implementation | Codex, then Claude's review |
| Release | Owner question |

## Implementation

Changed files:

- `apps/research-mcp/src/research-finalization-gate.ts`: declaration, required-with-draft next step, shared quote matching,
  and exact scale-name, range, value and benchmark checks.
- `apps/research-mcp/src/unicode-numbers.ts`: one-time Unicode decimal-digit table, unsigned extraction and absolute
  comparison with a `1e-9` tolerance.
- `apps/research-mcp/src/register-tools.ts` and `docs/tool-inventory-v0.1.0.json`: descriptive tool text and regenerated
  33-tool inventory after typecheck.
- `docs/privacy-data-map.md`: request-local inputs, with no storage or logging.
- `tests/finalize-scale-results.test.ts` and `tests/unicode-numbers.test.ts`: new tests.
- `tests/research-finalization-gate.test.ts`, `tests/mcp-tools.test.ts`, `tests/findings-save.test.ts`,
  `tests/analysis-staging.test.ts` and `tests/finalize-product-review-requirement.test.ts`: empty scale declarations in
  existing answer fixtures.
- This plan: implementation record.

Test names: `Unicode unsigned numbers`; `finalize_research scale_results through the gate` and
`finalize_research scale_results through the MCP endpoint`, including `blocks GPT's unexplained ISI sentence and
accepts its explained paragraph`, missing declarations and quoted parts, French decimal commas, Arabic-Indic digits,
all three range formats, `none_established`, absolute-value tolerance, malformed declarations and the pinned
descriptive catalog text. Every gate rule is also exercised through the real HTTP MCP endpoint on loopback.
The targeted run passed: 7 test files, 255 tests. Full `npm run verify` passed on Node 24.18.0 (exit 0): typecheck,
207 test files passed / 1 skipped, 2,380 tests passed / 6 skipped, and build. Final diff whitespace checks passed.

Unable to retrieve the live Universal architecture bootstrap or GitHub lesson-queue status because the owner
explicitly prohibited external network access. No protocol edits, commits, merges or deployments were made.
