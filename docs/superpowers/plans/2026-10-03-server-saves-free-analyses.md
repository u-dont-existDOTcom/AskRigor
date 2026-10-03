# The server saves free users' checked analyses itself

Date: 2026-10-03. Status: **IN PROGRESS** on
`claude/server-saves-free-analyses-20261003`.

## Owner outcome

- **The decision (30 Sep).** The free tier saves what AskRigor learns from
  its users' research, and the owner reviews every item before it is
  accepted. Findings cards already work this way: `finalize_research` saves a
  free contributor's card itself.
- **The gap.** Study and review analyses reach the review inbox only when
  the AI calls `submit_research_contribution` with a hand-built
  `SOURCE_ANALYSIS` payload. That is a long contract, so most analyses are
  probably lost.
- **The queue item.** The owner questions page lists "Save free research
  without relying on the model" as next. Its default: the server sends them
  itself, the same way as the findings cards. No new data type, so no new
  wording.

## Corrected scope (3 Oct, owner page question 26)

- **Analyses:** the server can save each validated study or review analysis
  by itself, and this plan builds that.
- **Search maps** (`RESEARCH_FRONTIER`) cannot be built by the server. It
  keeps no copy of the searches: receipts sign only query digests. They stay
  the AI's job through `submit_research_contribution`, as today.

## Design

1. **When:** after `validate_study_method_audit` or
   `validate_review_method_audit` succeeds on MCP, for an account in active
   free contributor mode (`researchUseAccount`). Never for paid private, and
   never without an active account.
2. **What:**
   - The server reads the exact document the check used
     (`OpenFullTextExecutor.readAuditMaterial`).
   - It builds the `SOURCE_ANALYSIS` contribution:
     `createValidatedStudyAuditContribution` for studies, which the admin
     import already uses, and a new review counterpart with rubric
     `review_method_v1`.
   - It submits the contribution through the same `submitProposal` path as
     the tool. The same privacy checks run, and the proposal waits for the
     owner's review.
3. **Freshness:** the contribution records a "current" freshness check, and
   its policy asks for a retraction check no older than 72 hours. So the
   server runs Crossref's integrity check (`checkRetractionStatus`) for the
   DOI first.
   - A retracted or withdrawn source, or a failed check, is not saved, and
     the reason is reported.
   - A source with no DOI is not saved, as in the admin import.
4. **Idempotent:** the contribution is deterministic: the same audit gives
   the same payload hash. So a repeated validation replays instead of
   duplicating.
5. **Never in the way:** the save waits at most 10 seconds, like the findings
   save. It never changes or fails the validation result.
   - The result gains a `review_inbox` status: saved, already saved,
     unconfirmed, or not saved with a reason.
   - Reused repository audits are skipped, because they are already in the
     repository.
6. **Instructions:** the AI no longer needs to send analyses by hand.
   - The server instructions (at Claude's 2,048-character cutoff) and the
     skill say the server saves validated analyses, and that the AI submits
     only the search map.
   - Submissions the AI still makes by hand differ in their payload hash, so
     they can duplicate one the server already saved. The tool description
     says so.

## Tests

- **Free account:** a validated study audit enters the inbox with the
  converter's exact payload, and a repeated validation replays it.
- **No save:** paid private, no account, an inactive account, no DOI, a
  retracted source, a failed retraction check, and a reused audit.
- **The save never blocks:** a slow store returns `unconfirmed` within the
  deadline, and a failing store leaves the validation intact.
- **Review analyses:** the converter output passes
  `livingEvidenceContributionSchema` and the proposal privacy checks.
- **Instructions:** the server instructions stay at or under 2,048
  characters and the skill under its word budget.

## Release

This joins the next backend release (owner question 26). The privacy data
map records that the server, not the AI, submits validated analyses for free
contributors. The data categories are unchanged, so the public notice needs
no new wording; the release re-checks that.
