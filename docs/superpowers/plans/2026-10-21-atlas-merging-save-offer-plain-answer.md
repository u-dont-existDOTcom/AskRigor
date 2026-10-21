# Owner answers 138b, 139c and 140b: Atlas merging, the save offer, and the plain answer first

Date: 2026-10-21. Status: **PLANNED**, on local branch `build-next-20261021` from `0dfd8623` (the head of
AskRigor#350, which the owner's 141a releases first). Nothing here is merged, released or deployed; the release is a
later owner decision. The branch is pushed to `claude/askrigour-instruction-optimization-cffyp2` only after #350 has
merged, and opened as a new pull request.

## Authority and scope

The owner's answers of 20 Oct, word for word from the owner questions page (master copy
`owner-pages/askrigor/OWNER-QUESTIONS.md`):

- **138b:** "exact merging (the same topic, question or study continues the existing record; a finished version
  replaces the same account's draft; related records shown when you review), plus merging by meaning (the AI may
  declare two differently worded topics the same, linked on your acceptance, nothing moved or deleted), plus the fix:
  a conflicting record is marked failed with its reason and stops blocking the queue, and run times in any valid format
  are accepted at promotion."
- **139c:** "the save offer appears when a finding rests on work a quick answer can't do and says what was done; free
  answers end with "Saved to AskRigor's findings library for review as ARF-0042."; and the answer asks whether to file
  the research map to the Atlas when the research did such work."
- **140b:** "for paid and dev accounts at once. Before research, the AI writes the short answer it would give without
  AskRigor's tools and AskRigor signs it with the time; the research checks each of its claims and looks beyond them;
  and the answer ends with a short note quoting the plain answer and saying what changed and what backs each change, on
  by default, with a per-account setting to turn it off. Your account is marked dev in the server's settings."

Question text, for meaning: 138 (options a to c), 139 (a to d) and 140 (a to c) on the page, first asked in the
owner-pages commits `0be3334` and `b996a8b`. The design analysis behind them is the read-only report of 20 Oct
(sections 1.3, 1.4, 2.5 designs A to C, 3.2 and 3.3 designs S1 to S3), summarized below where a builder needs it.

**Open, so not built yet:** question 143 (asked 21 Oct, default 143a): who is asked whether to file the research map.
Paid private accounts file nothing today, and `site/privacy/index.html` says "Paid private mode submits no research
progress"; asking them needs a new consented filing path and a privacy-page change. Free accounts' maps are already
meant to be filed without asking. Build every part below that does not depend on 143; the research-map part comes
after the answer (section 4).

Question 142 (open, default 142A) concerns #350's key-name screen and does not change this plan.

## Rules every part follows

- Meaning goes to the model, or to an exact check of what it declares; checks work in any language; no word lists
  judge meaning (AGENTS.md code review rules).
- No new tool: the catalog stays at 33 tools (`tests/mcp-tools.test.ts`, the plugin receipts). New behavior goes into
  existing tools' inputs, actions and results.
- `SERVER_INSTRUCTIONS` (`apps/research-mcp/src/config.ts`) is 2,047 of its 2,048 allowed characters: new guidance
  goes into tool descriptions and results, or replaces wording there.
- Privacy: nothing new is collected or exported by accident. Every stored field and every new recipient is in
  `docs/privacy-data-map.md` in the same commit; receipts stay signed tokens that are never stored.
- No paid model API call, no production change, no push before #350 merges.
- Pending and canonical stay apart: a pending proposal is never evidence, and the owner reviews every payload hash
  that promotion writes.
- Each part ends with `npm run verify` green and its own commit with the session trailers.

## 1. 138b, the promotion fix (first: it unblocks the two held filings)

Found 20 Oct: a filing whose run time is valid but written without milliseconds passes intake and fails at
promotion. The canonical writer compares stored times with the payload's strings:

- `packages/evidence-repository/src/postgres.ts`, `research_runs`: `run.started_at.toISOString() !==
  contribution.run.startedAt` and the same for `completed_at` (about lines 1231 and 1232) throw
  `RESEARCH_RUN_CONFLICT`;
- the same file, `source_versions`: `(version.retrieved_at?.toISOString() ?? null) !== source.retrievedAt` (about line
  1542) throws `SOURCE_VERSION_ID_CONFLICT`.

The contract accepts any `z.string().datetime({ offset: true })` (`contracts.ts:5`), so `...:00Z`, `...+02:00` and
microseconds all reach these lines.

Build:

1. Compare every stored time with a payload time as an instant, in SQL (`started_at = $n::timestamptz`, `retrieved_at
   IS NOT DISTINCT FROM $n::timestamptz`), so offsets and microseconds compare exactly. Search the whole writer for
   other string comparisons of stored times (`toISOString()`, `::text` reads used in conflict checks) and fix each the
   same way. Payload bytes stay as submitted: the reviewed hash binds them.
2. A promotion `FAILED` state (migration `0012_*`): `FAILED` joins `PENDING` and `COMPLETED`, with `failure_code` (a
   closed list of the writer's deterministic conflict codes, never free text or payload content) and `failed_at`. A
   deterministic conflict ends that intent as `FAILED` and promotion moves to the next intent; a transient error
   (connection, timeout, serialization failure) leaves it `PENDING` for the next timer run. The admin log line and the
   review tool's `inspect` name the fixed code. Today a failure rolls back, stays `PENDING`, is retried first every
   run (oldest first) and blocks every later intent, and the log shows only `ADMIN_OPERATION_FAILED`.
3. Correct `docs/privacy-data-map.md`'s "Owner-accepted contribution promotion" row, which lists
   "pending/claimed/completed/failed promotion state; bounded attempt metadata" while the table holds only `PENDING`
   and `COMPLETED`: after this build it lists exactly what exists.
4. Tests: a run time without milliseconds, one with an offset and one with microseconds each promote; an idempotent
   replay still replays; a different instant still conflicts; a conflicting intent ends `FAILED` with its code and the
   next accepted intent promotes in the same run; a transient error stays `PENDING`. Update
   `scripts/research-contributor-access-postgres-acceptance.mts`, `scripts/living-evidence-task-acceptance.mts`
   (the expected migration list) and the scheduler runbook strings.

## 2. 138b, exact merging and merging by meaning

### 2.1 Exact continuation at submission (the report's design B)

`submit_research_contribution` reconciles a frontier payload with canonical records before the proposal is stored, by
exact identity only, using the read-only canonical reader already in the process:

- topic by `canonical_key` (keep the canonical topic ID and label);
- question and frontier by ID, or by the exact normalized question plus its dimension tuple (population,
  program_or_exposure, comparator, outcome, horizon, setting) within the topic;
- lanes by key, when the coverage basis matches (the SQL refuses mixed bases);
- candidates by identity hash, as new versions chained to the current head;
- trails and passes stay as contributed.

The result reports which IDs were reconciled (IDs only). The latent collisions the report found (a new UUID for an
existing topic key, question, lane key or candidate identity) then continue the record instead of failing at
promotion.

Server-filed source analyses (`actions/study-audit-reuse.ts`, `actions/review-audit-contribution.ts`,
`analysis-staging.ts`): resolve the source family by an identifier with no conflicting identifier, reuse the canonical
title and version metadata, and file a second audit of the same study as its own analysis under that family (keyed by
its audit), so neither audit claims a second `initial` version and neither hides the other. "Supersedes" stays a human
judgment. Make the staged payload hash independent of the staging clock where the same audit is staged twice.

Same-account drafts: an optional `supersedesProposalId` names the account's own pending proposal of the same kind.
Accepting the new proposal rejects the old one, "superseded by <id>", in the same transaction (owner question 48's
manual flow). The submitting model may learn of canonical matches (already public through the catalog tools) and of
its own account's pending proposals, never of another account's pending proposal.

### 2.2 Related records at review

`review_research_contribution` `inspect` adds `related`: other pending proposals and canonical records that share the
topic key, frontier or question ID, or a candidate or source identifier (proposal IDs only, never account keys), and a
promotion preflight: a read-only dry run of the writer's identity checks, naming any conflict before acceptance. The
review role gets one new security-definer function and grant
(`infra/living-evidence-production/provision-research-review-role.sh`).

### 2.3 Merging by meaning (the report's design C)

A new proposal kind, `TOPIC_LINK`, through the existing `submit_research_contribution`: the model declares that
canonical topic X and topic Y are `same`, `narrower`, `broader` or `related`, naming both by their canonical
identifiers. The server checks exactly: both exist in the canonical store, they differ, the relation is one of the
four, and no existing edge contradicts it. On acceptance the canonical writer appends a `topic_aliases` row (for
`same`) or a `topic_edges` row; it never moves or deletes either side. The catalog search already reads aliases.
The judgment of meaning is the model's, in any language, and the owner's at review.

### 2.4 Documents and tests

`docs/living-evidence-repository-threat-model.md` (a wrong-merge row), `docs/privacy-data-map.md` (rows on pending
proposals, review and promotion), `docs/research-contributor-access.md`, `docs/research-contribution-promotion-scheduler.md`,
one sentence in `skills/askrigor/SKILL.md` (under its word budget, `tests/plugin-package.test.ts`). Tests as listed in
the report's design A and B file lists, plus: two audits of one DOI promote without a collision; a continuation of a
canonical frontier passes the contract and promotes; `supersedesProposalId` rejects only the account's own pending
proposal; `related` never carries an account key; a `TOPIC_LINK` with a missing topic, a self link or a bad relation
is refused with field-level problems (127a's format).

## 3. 139c, the save offer and the saved line

### 3.1 Work a quick answer can't do, checked exactly

For each findings-card finding, `finalize_research` derives its verified basis from fields the card already has and
receipts in the same call (no new input field):

- `full_text_audit`: one of its sources has a study or review method-audit receipt in this call;
- `comment_audit`: one of its sources is a video whose comments were audited;
- `bounded_absence`: its `answer_quote` equals the quote of an accepted `absence_claims` entry;
- `research_correction`: its `answer_quote` equals a `corrections[].change` with `by_user: false`.

The bases are signed into the finalization receipt and stamped in the saved card. They show depth, not that a finding
is better; the model's `why_not_usual` stays on the card for the owner's review.

### 3.2 What the user sees

- **Paid private** (findings mode `offer`): the offer appears only when at least one finding has a basis, and names
  what was done with server-written counts, in the answer's language when it is not English, for example: "These
  findings rest on full-text audits of 2 studies and audited comments on 3 videos, work a quick answer does not do. If
  you want them saved to AskRigor's findings library for review, say yes; nothing is saved otherwise." Only the bases
  present are named. With no basis there is no offer line; the receipt still signs the checked card, so the user can
  still ask.
- **Free** (findings mode `save`): saving stays automatic (owner question 11). A card with a basis gets a
  `beyond-quick-answer` label and lists each finding's basis, so the owner reviews those first. When the server's save
  confirms, the finalize result tells the model to end the answer, just before the check line, with "Saved to
  AskRigor's findings library for review as ARF-0042." (the real card ID). An unconfirmed save gives no ID and no
  line.
- Tests: bases derived, including a non-English quote match; an offer only with a basis; the free line with the
  card's ID; `docs/privacy-data-map.md`'s findings-library section says what is stored and when the offer appears.

## 4. 139c, asking to file the research map (after question 143)

- **143a (default):** paid private accounts are asked in the offer sentence, so one yes saves the card and files the
  research map (a deidentified `RESEARCH_FRONTIER` proposal for the owner's review, never the chat); this needs a
  consented filing path for paid accounts (a literal per-answer consent like `save_research_findings`'
  `yes_to_this_save`), and changes `site/privacy/index.html`, the terms where they say the same, and the data map.
  Free accounts are not asked: when the research did such work and no frontier was filed in it, the final check
  reminds the model to file the map.
- **143b:** every account is asked; a free user's no means the map is not filed.
- **143c:** no question: the free reminder only; paid accounts keep filing nothing.

## 5. 140b, the plain answer first

- **Which accounts:** paid private accounts, and accounts marked dev in a server setting
  (`ASKRIGOR_DEV_ACCOUNT_KEYS`, a comma-separated list of research account keys; not a secret). The owner's account
  key goes into production's `runtime.env` at the release that ships this, as 140b says.
- **Registration, before research:** for those accounts, `manage_research_access`'s `inspect` result asks the model,
  before any research call, to write the short answer it would give without AskRigor's tools and register it through
  a new `manage_research_access` action: its text and its claims, each claim a sentence quoted exactly from the text
  (bounded counts and lengths). AskRigor returns a signed plain-answer receipt holding the claims, the text's digest
  and the issue time and order; it is never stored. The result also says to treat each claim as something to check,
  confirm or correct, and to look beyond it.
- **The final check:** with a plain-answer receipt issued before every research receipt in the call,
  `finalize_research` asks for a comparison declaration: for each claim, confirmed, corrected, qualified or not
  checked, and each change tied to the answer sentence that states it (an exact quote) and to a basis from 3.1,
  checked exactly against the call's receipts. The server then writes the note from the declaration, quoting the plain
  answer's claims exactly, for example: "Without AskRigor, a quick answer would have said that X. This research found
  Y, from full-text reads of 2 trials." The model copies it, in the answer's language, at the end of the answer before
  the check line. With no receipt, or one issued after research began, there is no note and nothing blocks the answer;
  the result tells the model why.
- **Turning the note off:** a per-account setting through `manage_research_access` (stored, default on, in the
  research access store with its own migration and data-map row). Off removes the note only; the plain answer still
  guides the research.
- **Surfaces:** the MCP connector (`/mcp` and `/mcp/claude`). Custom GPT Actions do not get it.
- **Privacy:** the plain answer lives only in the signed receipt and in the answer; the data map says so, and lists
  the stored setting and the dev list.
- **Tests:** a dev account and a paid account are asked to register, a free one is not; a receipt issued after a
  research receipt gives no note; a declared change without its basis is refused with its problem named; the note
  quotes the registered claims exactly; the setting turns the note off and back on; the catalog stays at 33 tools.

## 6. 146b, the Gemini model as a server setting (owner, 21 Oct)

The owner's answer "146b" (a test of Gemini 4 for the YouTube scout and the video reader, at most $30 from the owner's
Google credits). The first plan, a one-off script run inside the production server with its key, was refused by this
session's safety check at 13:40 UTC, before anything ran; the owner then chose "do the proper server switch".

- **Settings:** `ASKRIGOR_GEMINI_SCOUT_MODEL`, `ASKRIGOR_GEMINI_SCOUT_THINKING`, `ASKRIGOR_GEMINI_VIDEO_MODEL` and
  `ASKRIGOR_GEMINI_VIDEO_THINKING`, each from a closed list (models `gemini-3.6-flash` and `gemini-4-argon`; thinking
  `low`, `medium` and `high`); unset means today's `gemini-3.6-flash` at `medium`. An unknown value fails closed to the
  default and is logged once, by name only.
- **Prices per model:** the scout's cost accounting (`calculateGeminiScoutNanoUsd`) and the video reader's use each
  model's own prices, from one table with its source and date (Google's price page, read 21 Oct: `gemini-3.6-flash`
  $0.75 and $3.75 per million input and output tokens through 31 Dec; `gemini-4-argon` $2 and $10 through 30 Nov, then
  $4 and $20; searches past 5,000 a month $14 per 1,000). A price that changes on a date carries the date.
- **The trial, dev accounts only:** `scout_gemini_youtube_candidates` (and the video reader's tool) accept an optional
  `model_trial` naming one arm (`current`, `gemini-4-low`, `gemini-4-high`); any account not listed in
  `ASKRIGOR_DEV_ACCOUNT_KEYS` is refused with one fixed code; the result names the arm and its real cost; it is charged
  to the same monthly ledger. No new tool; the tool inventory is regenerated.
- **The test after release:** 10 DEVELOPMENT scout questions and 4 videos of at most 20 minutes, each in the three
  arms through the owner's dev account, judged blind (relevance, real and firsthand candidates, variety, invented or
  wrong videos for the scout; claim accuracy against the video for the reader), with cost and time per run, stopping
  before $30. Switching the default model is a separate owner question.

## 7. 147a, a lead's other full-text routes (owner, 21 Oct)

The owner's answer "147a" to UDA #411 (`2026-10-21-source-access-cross-connector-debug`): when a study that could
change the answer stays a lead (`acquire_open_full_text` returns `possibly_useful_lead`), the result names the next
step: use another full-text tool the host has connected, asking the user first when it costs credits; the final check
accepts, for each decision-important lead, whether another route was tried, read it, was unavailable, or was not used
because of its cost (the model's declaration; the server cannot see the host's other apps, and says so); and a study
read through another tool is reported as "read through another tool, not audited by AskRigor", never as abstract-only
and never as an AskRigor audit. The owner library's access rules do not change, and no proprietary text from another
tool goes into a contribution. The skill gets one sentence (under its word budget). Acceptance runs in the owner's
ChatGPT with InfoAccess connected, because the release tests forbid other apps' tools.

## 8. 148a, other tools' text in an answer (owner's connector questions, 21 Oct)

A model-behavior rule under 148a, not a method change: research tools from other providers connected beside AskRigor
may suggest studies to check, but their summaries, rankings and "consensus" scores are not evidence; only sources
AskRigor's tools fetched and receipted count, and text read through another tool is reported as in part 7. Another
tool's promotional or sign-up text, footers and citation-format demands stay out of an AskRigor answer, and in
paid-private mode the model does not send the research to another tool's reporting call (Scite's `report_citations`
asks for every cited and excluded source with reasons). One sentence each in the connector instructions and
`finalize_research`'s description, under their word budgets, and in the skill. Test material from the owner's
connectors, checked 21 Oct: Wiley Scholar Gateway's `render_contract` asks for a footer ending "Using Claude? Connect
to the new Wiley Scholar Gateway connector...", and its passages lose the dash in ranges ("18–60 years" came back as
"1860 years"), which the reported-figures plausibility check should catch if such a figure is copied.

## Order and release

1. Part 1 (the promotion fix), then part 2, on one branch: they share migration `0012`.
2. Parts 3 and 5 on another branch: they share the final check.
3. Part 4 (143a), the account reference, and 145a's settlement, in separate builders.
4. Part 6 after 145a's settlement (both change the scout's cost accounting); parts 7 and 8 after part 4 (all three
   change the final check).
5. One pull request after #350 merges, with the release steps of question 124 and a PostgreSQL acceptance run of the
   two held filings' shapes (run times without milliseconds) before the owner accepts them.
