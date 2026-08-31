# Public evidence-gap intake implementation plan

## Objective

Advance the completed synthetic evidence-gap loop into the smallest real
self-serve intake: members of the public fill out the form as best they can,
partial cases remain usable and labeled partial, raw cases remain private, and
an authenticated AskRigor/GPT path can examine the submissions as unverified
leads.

## Owner correction controlling scope

Do not turn the product into an invite-only pilot, institutional research
program, staffing plan, jurisdiction program, or generic community system.
Those constraints came from an assistant-authored directive rather than the
owner. Preserve only proportionate privacy, security, consent, withdrawal,
missingness, provenance, comparator, and noncausal safeguards needed by the
actual public form.

## Work

1. Add a disabled-by-default private PostgreSQL record and service for
   pseudonymous public submissions.
2. Serve the prolactinoma page and four short intake stages from the existing
   research HTTP application.
3. Save the unprompted account before optional candidate fields; accept empty
   structured detail as `PARTIAL`.
4. Keep public metadata free of submission content; provide authenticated
   participant inspection/withdrawal and a separate private GPT review feed.
5. Exercise service, authorization, privacy, migration, HTTP, and real headless
   Brave behavior; run the complete deterministic gate.
6. Preserve the result on a task branch and stacked pull request. Do not deploy
   externally without the separately accurate public privacy and runtime
   release boundary.

## Recovery

- Parent implementation branch:
  `task/issue-150-synthetic-gap-loop-20260831`
- Parent implementation commit:
  `86a70cdff4f34f53f935dbedf837313f95c2a9cf`
- Task branch: `task/public-evidence-gap-intake-20260831`
- The migration is additive; the feature does not activate without complete
  runtime configuration.
