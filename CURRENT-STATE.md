# AskRigor current state

## Active owner task: instruction optimization (2026-09-26)

The owner started a new task in a Claude Code session: make AskRigor at least as
rigorous with far less instruction text and more server-enforced rules, so it
can run well on GPT consumer chats as well as Claude. Plan, owner decisions, and
status: `docs/superpowers/plans/2026-09-26-instruction-optimization.md`.
Phase 0 findings: `docs/audits/2026-09-26-instruction-optimization-phase0.md`.
Checkpoint (2026-09-27, branch `claude/askrigour-instruction-optimization-cffyp2`,
draft PR #246, nothing merged or deployed): section-based protocol loading; signed
research receipts and the `finalize_research` completion gate on MCP; MCP result
size budgets for YouTube audits and full-text pages; compact pseudonymous comment
records; HRP 20.6.0 (process, output and meta sections consolidated, no method
change; review at `docs/audits/2026-09-26-hrp-20.6.0-consolidation.md`); HRP
20.6.1 (owner-directed: a capped first pass with open leads replaces the fixed
8-video / 6-program minimum, enforced by `finalize_research` and the landscape
checker); HRP 20.6.2 (owner-approved: ten method sections shortened with the
same meaning, after two independent meaning reviews); HRP 20.6.3 (conformance
with 20.6.1: a final self-check, a regression case, the Project router and the
Forum Signal module still stated the old minimum or told the model to keep
widening during a first pass); HRP 20.6.4 (owner-approved from the owner's
lesson of 2026-09-26: a source's advice to avoid or reduce a treatment is read in
its own use context, maintenance or rescue, before any safety label); HRP 20.6.5
(owner-directed: a deeper-research offer says what it would focus on and what it
could change, and a prompt longer than about 60 words comes on request, "Show me
the full deeper-research prompt and help me fine-tune it", instead of being
pasted); HRP 20.6.6 (owner-approved 2026-09-29, for speed: a first pass
stops at about three fully audited videos or two rounds instead of six and four,
also briefly searches the dominant community outside YouTube and an independent
one, skips the treatment-coverage lock with a provisional comparison and no final
ranking, and ends by offering a deeper study review and deeper community research
with two or three focuses each; `finalize_research` enforces all of it); YouTube
receipts on MCP name their lock for YouTube only, and `finalize_research` needs the
community map and searches of the dominant community and an independent one
(the owner's HGH versus testosterone bug report), and checks each cited Reddit
thread's existence, subreddit and title with Reddit's public embed endpoint
(owner question 3, 2026-09-29: Reddit stays a ChatGPT feature, with no
registered Reddit app); on MCP the
treatment-coverage check builds its ledger from signed receipts (option A,
owner-chosen); a coverage-checker fix from the smoke-run replay
(first-pass breadth gaps become open leads, and complete grouped blocker lists
replace eleven messages per call); Universal 20.5.30
(owner-approved: precise clinical terms replace the euphemism rule) and 20.5.31
(owner correction, 2026-09-29: a failure class found again after a fix, by
anyone, stops local fixes), on top of main's task-mode integration (Universal
20.5.27, merged in on 2026-09-30, which moved this branch's Universal numbers up
by one; records written before then call them 20.5.27 to 20.5.30); HRP 20.6.7
(owner-approved: a small result set is read record by record before anything is
called not located, outcomes are searched by components and mechanisms, and a
mixed exposure is searched by its parts); Universal 20.5.32 (owner report: a
validated correction of a recurring AskRigor failure brings a separate proposed
lesson and a consented save, and the corrections section is always loaded); the
connector's `submit_lesson_candidate` tool (owner decision: lessons are not
GPT-only; same service, screen, limits and private queue as the lesson Action);
HRP 20.6.8 and Universal 20.5.33 (owner, 2026-09-30, "review and merge what
makes sense": 15 of the 24 lessons from the geosmin and humic-acid thread were
only partly covered and are now exact recorded edits, listed in the plan; the
other 9 were already covered); HRP 20.6.9 and Universal 20.5.34 (owner questions
27 to 29, 2026-10-03: the owner's shopping module joins Universal with duplicated
logic merged into one home per check, the claim-integrity checks Universal lacked
plus HRP's pre-delivery research claim check, and lesson 17's coupling,
subgroup-null and forum-direction rules; exact recorded edits in
`tests/fixtures/protocol-edits/2026-10-03-owner-protocol-changes.json`); HRP 20.6.10 (owner question 30,
proposed 2026-10-03, merged only on the owner's approval: product reviews as community evidence, with review
platforms mapped, product and ingredient kept apart, review counts and selection recorded, and carers'
observations kept as their own cohort; exact recorded edits in
`tests/fixtures/protocol-edits/2026-10-03-forum-review-platforms.json`); HRP 20.6.11 and Universal 20.5.35
(candidates on the PTI development branch, 2026-10-04, not approved: proactive troubleshooting, where a safe,
reversible discriminating test or fix is proposed early, judged by the matched provocation, with bounded credit
for combinations and a self-test safety boundary; exact recorded edits in
`tests/fixtures/protocol-edits/2026-10-04-pti-candidate.json`, plan in
`docs/superpowers/plans/2026-10-04-proactive-troubleshooting-intelligence.md`); the Gemini scout's research target written in
English, with the person's language passed separately (owner decision 6: A); a
findings library (owner decisions Q9 to Q11, 2026-09-30: for a free contributor
account `finalize_research` needs a findings card with the answer and saves the
checked card with a version stamp to a private review queue, with nothing asked
of the user, and a later card from the same account on the same research target
replaces the earlier one; a paid-private answer offers the save, and
`save_research_findings`, the 32nd tool, saves it only after the user's yes;
both tools are declared writes; the free contributor notice moves to version 2,
with migration 0011; the owner approved the wording, which the privacy and terms
pages take on the go-live day; closed until `ASKRIGOR_FINDINGS_LIBRARY=enabled`,
which waits for deploy approval; the owner created the private
`AskRigor-findings` repository and added it to the GitHub App on 2026-10-01); title identity checked by exact comparison, with
rewordings left to the research model (owner correction, 2026-09-29: word
lists were brittle and English-only); answer checks that work in any language
(same correction: the model quotes the answer's sentences for each community
finding and the gate checks the answer shows them, an answer not in English
gives each caveat in its language with the caveat's links, and the English
"best option" word list is gone, leaving the no-ranking caveat); absence
claims bounded by what was searched (owner's geosmin report, 2026-09-30: an
answer that says something was not found names the databases searched and
what the search did not cover, a null result rests on audited studies, a
PubMed or Europe PMC search that finds 50 or fewer records returns all of them,
and the community audit is skipped only for HRP's non-trigger cases); scout-first
discovery (owner-approved: the Gemini scout finds videos, comment-named remedies
go back to it as `rediscovery_leads`, and the YouTube survey is the fallback,
because YouTube search is capped at 100 calls a day per project). Claude test runner and blinded Opus judge under
`evaluation/instruction-optimization/`. Open questions for the owner live on one
private page, kept current (link in the plan). Open work: the GPT route (owner
approved the relay; Custom GPT work is dropped where it limits the design); the
held-out comparison is done, and the new version passes its rule. It won
overall and on safety in the knee pair (30 Sep, at twice the time and plan
usage) and in the Hashimoto pair (1 Oct, 1.6 times the time, 1.5 times the
plan usage). The Hashimoto pair ran without the Gemini scout because of a
local harness permission, since fixed in the runner. A supplementary scout-on
rerun of that question, made after the decision, also won (it confirms
nothing). Results and limits are in the plan. Merged and
deployed on 2026-10-01 (owner question 19): production serves the merge
`5640e6d2`, recorded in `docs/audits/2026-10-01-pr246-production-release.md`.
The approved privacy and terms wording went live at 20:18 UTC, and the
findings library opened at 20:19 UTC (owner question 21). The MAST
records below are unchanged; the owner set aside a full MAST rerun for this task.

## Authority and parent task

Read `AGENTS.md` and `governance/chat-work-authority-policy.json` first.
The parent task is `askrigor-external-evaluation-contribution-v1` and remains OPEN.
This entrypoint reports operational status; it is not an execution grant, a
scientific verdict, or a release receipt.

## Last validated repository integration

PR #190 uses branch `task/mast-four-arm-zero-spend-harness-20260901`.
The accepted integration checkpoint is `9d88e7f23e52efa4d077168f19103aa66521cff9`,
tree `c893be468f09d92f7e77a1ce33de041f724ad0a4`, integrating accepted main
`7fb852758e01df60203f102d784c95e76ff9177b`.
Local verification and the ordinary hosted integration checks passed.
PR #190 remains draft and unmerged pending Project Manager source review.
These results apply to that checkpoint, not automatically to later edits.
Universal 20.5.18 is preserved from accepted main; HRP remains byte-identical.
This source checkpoint does not establish deployment or product acceptance.

## Current execution boundary

Every new controlled execution requires a current source-bound directive and fresh
authenticated runtime admission for that exact scope. Historical directives,
commands, and admission receipts grant no present execution allowance.
The retained `currentSlice` and earlier execution fields in `tasks/ACTIVE-TASK.json`
are historical records. Its separate `repositoryIntegration` record concerns
repository integration only; it does not reopen historical execution.
Calibration remains CLOSED_BLOCKED; no further browser diagnostic is authorized.
No new screenshot, upload, probe, generation, evaluation, rescoring,
or alteration of historical evidence or attempt counts is authorized here.
Reasoning Selection implementation and lesson promotion remain separate.
Paid model API inference remains forbidden; the external spend ceiling is USD 0.
Internal supervisory routing must not require owner relay.

## Recovery references

`docs/audits/2026-09-07-pr190-queue-reconciliation-v2.json` records the integration
pre-validation snapshot; PR #190's persisted implementation return records its
subsequent commit and check identities. Do not reinterpret snapshot fields as
newly pending work or repeat completed operations.
`docs/state/MAST-FOUR-ARM-BASE-BLINDED-EVALUATION-CURRENT-STATE.md` and
`docs/superpowers/plans/2026-09-06-mast-four-arm-base-post-gate-closeout.md`
retain chronological evidence. Earlier instructions there remain historical
unless explicitly reopened by a new source-bound directive and fresh admission.
Retain all original receipts and private artifacts unchanged; do not republish
private paths, payloads, or scientific findings in this entrypoint.
