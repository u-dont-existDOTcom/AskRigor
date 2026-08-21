# Compact claim citation display audit

Date: 2026-08-21

## Scope

This audit evaluates only citation presentation. It uses synthetic claims and
non-routable `example.invalid` URLs; it retains no private research, source
content, lesson body, or conversation text.

## Compared displays

1. Verbose: every claim is followed by a sentence such as “This claim is
   supported by Source 1,” with a longer sentence for inference.
2. Compact: a directly supported claim is itself linked; an indirect synthesis
   receives a linked `(inferred)` marker and another compact basis link when
   needed.
3. Grouped: three claims share numbered links at the end of a paragraph.

## Deterministic result

| Scenario | Claims | Compact links | Compact added words | Compact overhead | Verbose added words | Verbose overhead | Ambiguous grouped claims |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Short | 8 | 9 | 3 | 4% | 65 | 86% | 6 |
| Medium | 16 | 19 | 9 | 6% | 139 | 89% | 15 |
| Comparison | 24 | 28 | 12 | 5% | 204 | 86% | 24 |

The compact display retained the same link count and unambiguous mapping as the
verbose display while reducing citation narration to 4–6% word overhead. The
grouped display used fewer links, but became ambiguous whenever claims in the
same paragraph relied on different sources. Link count was therefore not the
useful burden measure; visible citation prose and mapping ambiguity were.

Executable reproduction:
`tests/custom-gpt-citation-density-benchmark.test.ts`.

## Product rule

- Cite decision-important, quantitative, comparative, safety-related, causal,
  contested, time-sensitive, or surprising factual claims.
- Put the link on the shortest meaningful phrase directly supported by the
  source; do not add a sentence explaining that a citation is present.
- Mark synthesis or extrapolation compactly as linked `(inferred)` and preserve
  every material source basis when more than one is used.
- Do not add decorative citations to stable connective reasoning,
  user-supplied facts, or ordinary transitions unless they become
  decision-important.
- Group links only when their claim mapping remains obvious.
- When important matched support is unavailable, label the claim unverified or
  omit it. Never attach an adjacent source as though it entailed the claim.

## Durable evidence

- Regression matrix:
  `docs/custom-gpt-citation-display-regression-v0.1.0.json`
- Instruction-surface regression:
  `tests/custom-gpt-citation-display-regression.test.ts`
- Density benchmark:
  `tests/custom-gpt-citation-density-benchmark.test.ts`
- Full Project contract: `project/PROJECT_INSTRUCTIONS.md`
- Forum output contract: `project/FORUM_SIGNAL_MODULE.md`
- Compact generated source: `skills/askrigor/SKILL.md`
- Generated Instructions SHA-256:
  `207249668ba176b0372422d61d9fe4f2096428db27a3b9b57e3d75ba525e4488`
- Generated Instructions length: 7,978 characters, leaving a 22-character
  buffer under the enforced 8,000-character editor limit.
- Synchronization-ledger SHA-256:
  `a85ea88ba9ab908431deb5fc5da25824b8390e48f8975798dde31b7d3febb928`
- Action OpenAPI SHA-256 (unchanged):
  `9a7e19fc4b9b3b8e7e330865925628da7deea54529800dfcf630626ee03efc31`
- Focused instruction, routing, packet, release, and compatibility acceptance:
  7 test files and 52 tests passed.
- Complete host test suite with a contention-tolerant 30-second per-test
  allowance: 62 test files passed with one declared live-file skip; 996 tests
  passed with five declared credential-gated skips. Typecheck and build passed.
- The exact default-timeout gate was also attempted under host load average
  above 17 on a four-core machine. It reached 991 passing tests and five
  unrelated 5-second timeouts; those four affected files then passed 44/44
  serially with the longer allowance. No timeout touched a changed source or
  citation regression. PR #47 supplied the clean-environment default-timeout
  proof: protected deterministic verification run `32507689060`, workflow-policy
  run `32507689167`, and CodeQL run `32507685987` passed.
- Public-site validation covered four pages. The unchanged deployment suite
  passed 28/28 with the contention-tolerant allowance; exact default-timeout
  retries encountered only the same host-load timeout boundary.
- Independent integration review found ambiguous legacy installation wording.
  After every owner receipt was scoped to the preceding 7,962-character
  artifact, final re-review reported merge-ready with no blocker or Important
  issue. The citation instruction contract and existing safety, research-completion,
  program-scope, plain-language, transport, and lesson-consent controls remained
  intact.
- The required pre-release lesson checkpoint at
  `2026-08-21T17:07:52.873Z` was available with 2 open candidates, 2 needing
  review, 0 accepted but not incorporated, 2 incorporated or closed, and 0
  deletion eligible. ARL-0007 is the candidate implemented by this change;
  ARL-0009 was not silently expanded into this task.
- PR #47 merged reviewed head
  `51e420c69b9e811d857977b95a310a93f4975637` as
  `7b6dac66a67bbfb43bcabbbbf37c5dd60a0dc7a3`. Exact post-merge deterministic
  verification run `32507846373`, workflow-policy run `32507846508`, and CodeQL
  run `32507846256` passed.
- ARL-0007 was then labeled `accepted` and `incorporated` and closed against that
  merged evidence. The post-closeout checkpoint at
  `2026-08-21T17:25:55.556Z` was available with 1 open candidate, 1 needing
  review, 0 accepted but not incorporated, 3 incorporated or closed, and 0
  deletion eligible. The remaining open candidate is outside this change.

## Current boundary

The repository can generate and test the instruction artifact, but cannot
inspect or edit the owner's signed-in Custom GPT editor. The previously
owner-reported installed Instructions remain the 7,962-character artifact with
SHA-256
`4fff01a07aa817941c5b8cd4c3b0ea2e79621901288140d6cf1056bf402312e5`.
The new 7,978-character artifact must be installed and exercised in a fresh GPT
chat before its product-interface behavior can be claimed.
