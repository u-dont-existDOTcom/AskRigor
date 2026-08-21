# Custom GPT partial-answer escape repair

## Problem

A live Custom GPT answer declared the review partial, then presented a long conventional synthesis without completing the still-executable YouTube creator-content work, without exposing the required discovery/completion evidence, and while treating broad labels such as exercise and physical therapy as if they were single interventions. It also exposed internal status codes that are meaningful to implementers but not to ordinary users.

## Outcome

Make a substantive answer fail closed unless every required research module is either completed or has a genuine, explicit access boundary. A partial or bounded answer must not waive executable work. Evidence about exercise, rehabilitation, diet, or another umbrella class must be tied to discrete, described programs; an unspecified program cannot support a class-wide conclusion. User-facing prose must translate internal enums and receipt names into plain language.

## Implementation

1. Add sanitized regression cases for the partial-answer escape, program conflation, and internal-jargon leakage.
2. Strengthen the Project router and Forum Signal module with a pre-synthesis completion gate, program-specific discovery and comparison rules, and a plain-language presentation boundary.
3. Condense the skill instructions so the generated Custom GPT packet carries the same non-waivable controls within its size limit.
4. Regenerate synchronized Custom GPT artifacts and record the resulting hashes.
5. Run focused tests, the complete deterministic gate, site checks when affected, and independent review.
6. Publish through the repository workflow, deploy the verified result if the release surfaces change, and document the remaining signed-in Custom GPT editor boundary.

## Acceptance

- `partial`, inaccessible private communities, or one unavailable full text cannot justify skipping other executable required work.
- A substantive final cannot appear when required YouTube discovery, creator transcript verification, community auditing, or cross-layer work is executable but unfinished.
- Broad labels such as exercise or physical therapy are decomposed into materially different programs. If the source does not specify components, dose, supervision, population/stage, outcome, and horizon, the evidence is labeled program unspecified and cannot be generalized to the entire class.
- Discovery searches and candidate selection cover distinct program hypotheses when the option space plausibly contains them.
- Internal values such as `api_visible_complete`, `abstract_only`, and machine receipt field names are not shown in ordinary user-facing prose. They are translated into plain language and retained only in technical audit/debug output when explicitly requested.
- Generated instructions remain within the Custom GPT limit and all applicable gates pass.

## Recovery

Work remains isolated on `agent/gpt-partial-escape-repair-20260821`. Before merge, retain the source commit and branch as rollback points. Do not modify the owner's dirty primary checkout or credential-looking untracked files.
