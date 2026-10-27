# Reciprocal research access and contribution proposals

Status: implementation contract for the 2026-09-01 vertical slice

## Product rule

AskRigor has two research-use modes:

- **Free contributor.** The person explicitly agrees that what AskRigor learns
  from their use is saved: eligible deidentified structured research progress
  may be submitted to AskRigor's shared living-evidence repository, and each
  finished research answer's findings card is saved to AskRigor's private
  findings library for review (owner decision Q11, 2026-09-30; see
  `docs/privacy-data-map.md`), unless the AI declares its findings personal
  only (owner answer 156a, 2026-10-22). Under notice v4 (owner answer 171,
  2026-10-25; built, not yet released), free cards publish on save in AskRigor's
  public Atlas, written without the person and marked "Not checked by supervisors
  yet" until the owner reviews them. Signed-in people can vote and comment.
  This is the free product.
- **Paid private.** No research progress is submitted. Research findings and
  lesson feedback are saved only when the user accepts saving them for that
  answer. The answer's offer to save its findings ends with "Saved findings
  that AskRigor's owner accepts may be published in AskRigor's public Atlas,
  written without you." (owner answers 159 and 160b). This mode activates only
  when the account already has a verified entitlement. The current slice
  offers no price, payment provider, or checkout.

This is an ordinary product access choice. It is not an institutional research
program, a study-enrollment system, a public forum, or a claim that product
usage itself is scientific evidence.

## Exact notice

The version is `free-contributor-v4-2026-10-25` (owner answer 171,
2026-10-25; exact wording approved, built, not yet released). The server returns
the complete notice from `RESEARCH_USE_NOTICE`. Free mode activates only when
all four versioned agreement fields are literal `true`. Silence, inferred
consent, a different notice version, or a partially checked agreement is rejected.

Version 4 keeps every other sentence of v3 and makes exactly these three changes:

> Your findings cards are published in AskRigor's public Atlas as soon as they are saved, written without you and marked "Not checked by supervisors yet" until AskRigor's owner has reviewed them, and people who sign in can vote and comment on them.

> If you ask to delete a findings card, everything that ties it to you is removed, and the card leaves the Atlas unless AskRigor's owner has already accepted its findings; no reason is needed.

> An accepted finding stays while it is valid: it is corrected or taken down when someone shows it is wrong, and rewritten or removed if it could identify anyone.

The privacy page and terms distinguish free cards published on save from paid
private findings published only after acceptance, and give the approved votes
and comments wording. The paid save offer keeps its own acceptance sentence.
The pages' effective dates are left for the release.

The first version, `free-contributor-v1-2026-09-01`, did not mention findings
cards; the second, `free-contributor-v2-2026-09-30`, did not mention the public
Atlas or what deleting a card removes. The third,
`free-contributor-v3-2026-10-22`, described publication after acceptance. An
account that accepted any of them inspects as `UNENROLLED`, and research tools
refuse it with `RESEARCH_ACCESS_REQUIRED`, until it accepts v4. Migration
`0020_research_use_notice_v4` widens the same constraint as 0011 and 0016 to
admit all four versions, safely on repeated runs. The one-shot admin `migrate`
applies it before an image offering v4 serves.

An image that reads only v1 to v3 fails the access check of an account whose
row carries v4, so an image rollback below v4 first runs
`infra/living-evidence-production/research-use-notice-v4-hold.sql`. It copies
each v4 account row unchanged into `research_use_notice_v4_hold`, which only
the migrator can read, and marks the account revoked. The person can accept
that image's notice (v3) or activate an entitled paid private account.
`research-use-notice-v4-restore.sql`, run only once an image reading v4 serves
again, restores each account still exactly in the held state and empties the
table. An account changed meanwhile keeps its newer row and is asked to accept
v4 as usual. The hold is not a revocation: pending proposals stay pending;
entitlements, proposals, Atlas rows and account settings stay unchanged.
The v3 pair remains available for a target reading only v1 and v2, and the v2
pair for one reading only v1. The runbook gives the hold/image/hold and
migrate/image/restore order, and the Docker acceptance is
`npm run contributor-access:notice-v4-rollback-acceptance`.

`manage_research_access` is the OAuth-scoped operation for `inspect`,
`accept_free_contributor`, `activate_paid_private`, `revoke`,
`register_plain_answer`, `set_plain_answer_note`, `set_detailed_lesson_reports`,
and the dev-only `set_findings_save`. It is declared
as a write to MCP clients. Revocation blocks later research calls and withdraws
every still-pending proposal from that account. It does not silently rewrite an
already accepted deidentified canonical record.

## The plain answer first

Owner answer 140b (2026-10-20): a paid private account, or an account the
server's settings list in `ASKRIGOR_DEV_ACCOUNT_KEYS` (comma-separated account
references, the 12 characters `manage_research_access` shows the signed-in
user, or whole research account keys), is asked by `inspect` to register, before any research call, the
short answer it would give without AskRigor's tools. `register_plain_answer`
takes that text (at most 1,500 characters), one to five claims, each one or
more whole sentences copied exactly from the text (at most 250 characters), and
the research target, and returns a signed `plain_answer` research receipt: a
16-character digest of each claim (so its size is the same in any language),
the text's SHA-256, the target's digest, an HMAC binding it to the account and
the issue order. It holds no text of the plain answer and is never stored.
`finalize_research` then asks, when the account's receipt for the same target
was issued before every research receipt of the call, for
`plain_answer_comparison` (each claim copied as registered, and confirmed,
corrected, qualified or not checked; each change with the answer's sentence and
what backs it, checked against the call's receipts) and writes the note the
answer ends with, quoting the claims. Without such a receipt there is no note
and nothing is held back. `set_plain_answer_note`
turns the note off or on; migration `0013_research_plain_answer_note` stores the
choice in `research_use_accounts.plain_answer_note`, on by default. The note
setting removes only the note: the plain answer still guides the research. Only
the MCP connector (`/mcp` and `/mcp/claude`) has this; Custom GPT Actions do not.

## Detailed lesson reports

Owner question 154 (2026-10-21): "i would not give everyone a long report like
that in chat unless they turn that on in askrigor settings". Detailed lesson
reports are off by default for every account. When the user asks,
`set_detailed_lesson_reports` with `detailedLessonReports` true turns them on
for an active account and false turns them off; migration
`0015_research_detailed_lesson_reports` stores only that choice, in
`research_use_accounts.detailed_lesson_reports`, and saving or revoking the
account leaves it as it is, as with the plain-answer note. `inspect` shows it
for an active account (`detailedLessonReports`). Only with it on does the
connector's `submit_lesson_candidate` accept a lesson's optional
`detailed_report` (steps, what happened and what was expected, causes with
confidence, the parts of AskRigor to change, a proposed change, up to five
invented test cases and what stays uncertain, at most 10,000 characters in
all), which passes the lesson's privacy screen and is stored only in the private
lessons repository. A lesson carrying one without a research account, or with
the setting off, is refused with `detailed_report_refused`
(`detailed_reports_off`) and nothing is stored; the model sends the lesson again
without it. The data flow is in `docs/privacy-data-map.md`.

With that setting off, every connector lesson still carries its required
existing-rule inventory, generalized observed and expected behavior, specific
part to change and invented regression. A stopped final check's signed, masked
report can also accompany it without this setting. These short diagnostics pass
the existing privacy screen; the setting continues to control only the optional
model-authored detailed report.

## Findings-card saving for dev accounts

Owner answer 171, default 5: findings-card saving is on by default. An active dev account listed in
`ASKRIGOR_DEV_ACCOUNT_KEYS` can turn it off with `manage_research_access` action `set_findings_save` and
`findingsSave: false`, and back on with `findingsSave: true`. Other accounts receive `dev_account_required` and
their setting stays as it was. `inspect` shows `findingsSave` only to an active dev account. Migration
`0023_research_findings_save_switch` stores only this boolean choice in `research_use_accounts.findings_save`;
saving or revoking the account preserves it. The research-access role can update this setting alongside the
other account settings and the columns used for enrollment and revocation, with no update right on the account
key or creation time.

With saving off, a free contributor's final check still checks the findings card, caveats and answer as before,
but skips the card save and reports "not saved: this dev account's card saving is off". The regression harness
turns the setting off before a run and on after it, and the release record shows both. The setting does not change
paid-private saves or research-map and source-analysis contributions. This adds no connector tool; the catalog
stays at 33.

## Identity boundary

Auth0 authenticates the connected account and supplies a stable OAuth subject.
AskRigor never stores that raw subject or an email/contact field in the research
repository. A server-held secret derives:

```text
HMAC-SHA-256("askrigor:research-use-account:v1\0" || oauth_subject)
```

Only the 64-character result is stored as `account_key`. Account/mode records
remain separate from the proposal JSON. The proposal JSON is forbidden from
containing an account identity.

The configured owner subject is no longer a global allowlist for ordinary
research users. It remains an independent allowlist inside
`review_evidence_gap_submissions` and `review_research_contribution`; a public
user cannot obtain cross-user case or proposal review merely by carrying
`cases:review` in a token.

## Proposal boundary

`submit_research_contribution` is available only in active free-contributor
mode. It accepts one of three strict payload shapes:

1. `RESEARCH_FRONTIER`: formal discovery lanes, exact coverage windows and
   receipts, candidates and decisions, open/blocked trails, and partial state.
2. `SOURCE_ANALYSIS`: a source-bound study-method or review-method analysis,
   including the complete performed AskRigor-authored analysis when available,
   its exact hashes/receipts, domain findings, limitations, and future-analysis
   items.
3. `TOPIC_LINK` (owner answer 138b): two canonical topics, each named by its
   ID and key, one relation (`same`, `narrower`, `broader` or `related`) and a
   deidentified rationale. See "Merging" below.

Partial formal corpora are accepted and labeled `partial`; incomplete coverage
does not make observed records ineligible. A topic-only narrative is not a
source-analysis proposal. YouTube, Reddit, forums, and other community-source
records remain outside this durable boundary.

Every proposal repeats literal false markers for:

- raw chat;
- prompt text;
- account identity in the payload;
- private health narratives;
- upload content;
- raw source content;
- raw provider responses; and
- community data.

The existing prohibited-key walk, exact contribution schemas, whole-analysis
hash, deidentified-query hash, formal-provider constraints, and a basic obvious
contact/credential screen run before storage. These deterministic checks reduce
risk but do not prove complete deidentification; this is one reason proposals
remain pending review.

The contact screen reads the free field names under `receipts[].details` as well
as values. Its street-address pattern is an English street-suffix list, so it
misses addresses written in other languages and also refuses some ordinary
research text, such as "900 mg St. John's wort", "12 month ln ratio" or
"2 patients seen by dr". The refusal names the pattern that matched, so the
sender can reword.

A proposal these checks refuse comes back with every problem found (owner
question 127): each with its field path, its rule, what the contract expects
there and an example from AskRigor's own example records, bounded and in a fixed
order, privacy rules first. It never repeats a value sent, and a key the contract
does not define is shown as `*`. The tool description carries every record shape,
because ChatGPT's app shows the model no part of `payload`'s type; Claude's
surface also publishes the strict schema. Refusals by account (sign-in, mode, paid
private) still come first.

## No automatic evidence authority

The public runtime can insert only into `research_contribution_proposals`.
New rows are `PENDING_REVIEW`. It has no insert/update authority on canonical
analysis, claim, source, assessment, or frontier tables. A proposal does not
become evidence, raise evidence quality, establish causality, or become current
knowledge merely because it exists or is repeated.

`review_research_contribution` lets the allowlisted owner inspect one exact
proposal, query its status, or accept/reject it with a reason. Acceptance and
creation of a hash-bound `PENDING` promotion intent occur in the same database
transaction. Rejection creates no intent. The owner tool returns no account key
and has no canonical writer credential.

Canonical promotion remains a separate privileged operation. The one-shot
`living-evidence-admin promote-accepted` command locks one pending intent,
reruns the strict contribution preparation, dispatches to the
`contribute`, `contributeFrontier` or `contributeTopicLink` writer, and stores an exact stable-JSON
receipt and SHA-256. A crash after the canonical writer commits but before the
intent receipt commits leaves the intent pending; retry uses the canonical
writer's existing idempotency key and then completes the receipt. The command
promotes at most one intent per invocation. The deployed hardened five-minute
timer invokes only this command without arguments or a shell; it does not
change the review or scientific-decision boundary.

Owner answer 138b (2026-10-20): "a conflicting record is marked failed with its
reason and stops blocking the queue, and run times in any valid format are
accepted at promotion." The writer compares stored dates and times with the
payload's as values in SQL, so `...:00Z`, `...+02:00` and microseconds name the
instant they name. When the writer refuses the exact payload because it
conflicts with what the append-only store holds, the intent ends `FAILED` with
one code from a closed list (`RESEARCH_CONTRIBUTION_PROMOTION_FAILURE_CODES`,
the same list as migration `0012`'s check) and its failure time, and the same
invocation tries the next accepted intent, at most 20 failures per invocation.
A lost connection, a timeout, a serialization failure or an unexpected error
leaves the intent `PENDING` for the next activation. The owner review `inspect`
and `status` actions show a failed promotion and its code
(`accepted_promotion_failed`), and the admin receipt lists each failed intent's
UUIDs, kind and code. A latent collision the writer used to meet as a raw
constraint error now has its own code: `TOPIC_KEY_CONFLICT`,
`RESEARCH_FRONTIER_QUESTION_CONFLICT`, `FRONTIER_LANE_KEY_CONFLICT`,
`FRONTIER_CANDIDATE_IDENTITY_CONFLICT`, `SOURCE_FAMILY_IDENTITY_CONFLICT` and
`SOURCE_VERSION_IDENTITY_CONFLICT`.

## Merging (owner answer 138b)

Owner answer 138b (2026-10-20): "exact merging (the same topic, question or
study continues the existing record; a finished version replaces the same
account's draft; related records shown when you review), plus merging by
meaning (the AI may declare two differently worded topics the same, linked on
your acceptance, nothing moved or deleted)". Every check below is exact; none
judges meaning, so each works in any language.

**A frontier continues the canonical records it names.** Before a
`RESEARCH_FRONTIER` proposal is stored, the service reads the canonical store
through the public runtime's read-only reader and reconciles the frontier by
exact identity: the topic by its key (keeping the canonical topic's ID and
label); the question and frontier by ID, or by the exact normalized question and
all six dimensions within the topic; a lane by key when its provider, source
class and coverage basis match; a candidate by the hash of its identifiers, as a
new version chained to the candidate's current version. Passes and trails stay
as sent. The result lists each ID set to a canonical one (`proposal.reconciled`,
IDs only, all already public through the catalog tools), and the stored payload
and its hash are the reconciled ones, which the owner reviews. A canonical ID
named with other content is refused with a field-level problem
(`canonical_conflict` or `canonical_missing`). When the reader cannot be read,
the frontier is filed as sent (`canonicalCheck: "unavailable"`).

**A second audit of a study joins the study's record.** An analysis the server
files after `finalize_research` is its own analysis, keyed by its audit and
protocols, so two audits of one study never both claim an `initial` version.
When the source's identifiers name one canonical source family and no
identifier conflicts, the analysis carries that family's ID, title, version of
the same bytes and freshness policy. An audit the canonical store already holds
under the same protocols, or one this account already filed, is not filed
again. Whether one audit supersedes another stays a human judgment.

**A finished version replaces the account's own draft.** An optional
`supersedesProposalId` names this account's own pending proposal of the same
kind. Accepting the new proposal rejects that draft, with the reason
"superseded by <id>", in the same transaction; rejecting it leaves the draft.
A database trigger refuses any other UUID with one problem
(`superseded_proposal`) that says nothing about whether the UUID names another
account's proposal.

**The review shows what is related, and what promotion would meet.**
`review_research_contribution` `inspect` returns `related.proposals`: the other
proposals pending review or queued for promotion that share the topic key or
ID, the frontier, the question, the source family, or a candidate or source
identifier, by proposal ID, kind, state and the kinds of identity shared (at
most 25 shown, with a count of the rest), never an account key or another
proposal's content. It also returns `related.canonical`, the canonical records
sharing those identities (IDs only), and `preflight`: a read-only dry run of
the canonical writer's identity checks that names each conflict by its failure
code and payload path (`clear`, `conflicts`, `replay` or `unavailable`). The
proposals come through `inspect_research_contribution_context`; the canonical
records and the preflight through the public runtime's read-only reader.
Nothing in them is stored.

**Merging by meaning is a topic link.** Whether two differently worded topics
are the same, or one is narrower than, broader than or related to the other, is
the model's declaration and the owner's judgment at review; the review text
says so. The intake checks only what is exact, against the canonical store: both
topics exist under the IDs and keys named, they differ, and no stored link
contradicts or repeats this one (topics linked as the same have no hierarchy
between them, a hierarchy runs one way and makes no cycle, a link is not stored
twice, no third topic already has the alias "same" would write, and the link's
UUID is new). A link is not filed when the canonical reader cannot be read. On
promotion the canonical writer repeats those checks under its lock and appends a
`topic_link_contributions` row: for `same`, each topic's label as the other's
alias, which `search_research_frontiers` reads; otherwise one `topic_edges` row
under the link's UUID. It never moves, changes or deletes either topic or
anything filed under it. A conflict ends the promotion `FAILED` with
`TOPIC_LINK_CONFLICT`, `TOPIC_ALIAS_CONFLICT`, `TOPIC_LINK_TOPIC_MISSING`,
`TOPIC_LINK_ID_CONFLICT` or `TOPIC_LINK_IDEMPOTENCY_KEY_PAYLOAD_MISMATCH`.

## Atlas findings review (owner answers 159 and 160b)

Built, not yet released: Atlas phase 2 parts A to D
(`docs/superpowers/plans/2026-10-22-atlas-phase-2-design.md`). The owner
accepts saved findings cards' findings into the Atlas through eight more
actions on the same owner-only `review_research_contribution`, which stays one
of 33 tools. They are flat fields with one rule set per action:

- `list_findings`: the open cards waiting for a decision, ten per page (a
  `cursor` continues), those beyond a quick answer first and then the oldest;
  any Atlas intent the writer refused comes first, with its code in plain
  words, and the count of intents waiting for the writer.
- `inspect_finding`: with `card`, the card's `cardSha256` and each item with
  the save that counts (the card or a later save of it), its verified bases,
  what it would become, whether its exact wording key makes it a re-check of a
  current finding, and its decision; with `finding` or `lead` as well, a dry run
  of every check on that item, its sources checked with the providers. With
  `atlasNumber`, an accepted finding's status, version, label, links and
  intents.
- `accept_finding`: the finding, or an open lead, as the AI declares its topic
  (`topicKey`, with `topicLabel` for a new topic) and its numbers. A finding
  with no verified basis is accepted as a lead (3b). A card finding whose
  normalized question and claim match a current finding's records a re-check of
  that finding instead. Atlas phase 3 (built, not yet released; design
  `docs/superpowers/plans/2026-10-22-atlas-phase-3-design.md`, section 5): the
  card's topic, numbers block, kind, subject, subject type and direction are
  used by default, and `topicKey`, `numbers`, `kind`, `subject`, `subjectType`
  and `direction` change them; a card saved before these fields needs all of
  them (`topic_missing`, `numbers_missing`, `card_fields_missing`), and a search
  that found nothing has direction `descriptive` (`card_fields_contradict`). Its
  searches come only from the card and stay only while its kind stays
  `nothing_found`. An open lead takes none of the four; a re-check changes none.
- `edit_finding`: before acceptance, an accept with the owner's wording
  (`wording`, `appliesTo`, `whyNotUsual`, `whatWouldChangeIt`, `question`,
  `sources`, `numbers`); after it, with `atlasNumber` and `version`, a
  correction with a public dated `note`, or, with `correction: false`, a wording
  fix (5a); either may declare or change the four fields, and a version holds
  all four or none. With
  `eraseWording: true` (decision 7, when the owner judges the
  wording could identify a person) the new wording becomes a new general
  version and every earlier version's wording is erased; sent with no new
  wording, it erases the earlier versions' wording if any is left.
- `reject_finding`: the owner's private `reason`, which never leaves the
  decision row.
- `withdraw_finding`: takes an accepted finding down, with a public dated
  `note`. With `eraseWording: true` the withdrawal is followed by the erasure of
  every version's wording, the note included, which leaves the finding
  "withdrawn, wording removed" with its date; a finding already withdrawn needs
  no note.
- `link_findings`: `same_as`, `narrows`, `contradicts` (with what the two
  disagree on) or `replaces`, with the AI's `rationale`; `unlink` withdraws a
  stored link with a note.
- `forget_card` (decision 7): with `card` (`ARF-0142`), whenever its
  contributor asks and with no reason, removes what ties the card to them:
  its decision rows, and on GitHub the person's cards found by the card's
  research-thread key, which are stripped to a locked tombstone, and their later
  saves on other cards. Another person's later save on those cards is re-filed
  as a card of its own first; when the named card holds one, the call asks for
  `confirm: true`, since that saver was told the card's id too. The findings
  accepted from the cards stay while they are valid. The App cannot delete an
  issue, so the reply links each stripped issue for the owner to delete; the
  same call again answers `card_forgotten` once GitHub answers 404 or 410 for
  every one, and `card_forget_waiting_for_owner` until then. It also deletes
  the cards' held YouTube findings (below).
- Held YouTube findings (owner answer 173, built, not yet released): the
  findings drawn from YouTube comments that a saved card leaves out are held
  apart from the card for the owner's review; so are those of a card whose
  findings all rest on them, which is not saved as a card, with its question and
  topic. They are kept until deleted (the owner's rule, 25 October: "don't
  delete the summaries unless YT tells us to do that"): nothing deletes one by
  its age. `inspect_finding` on a card lists its held findings
  (`card.heldYoutubeFindings`) with the day each was saved, and
  `list_youtube_findings` lists those with no card (`heldWithoutCard`), newest
  first, 25 saves a page (`cursor` with its `nextCursor` for the next); they are
  never items, so no decision takes one. `delete_youtube_findings` with `card`
  deletes a card's, and with `cardSha256` a save's with no card;
  `delete_all_youtube_findings` deletes every one at once, for the day YouTube
  asks, and answers `needs_confirmation`, deleting nothing, unless the call says
  `confirm: true`. `move_youtube_findings` with `cards` (such as `["ARF-0007"]`)
  moves every finding drawn from YouTube comments of cards stored before into
  the held findings, each with its own save's time, and rewrites the card and
  its later saves as saved today without them; it changes nothing on a card
  whose findings all rest on YouTube comments or where a decision names a
  finding the move would remove or renumber, and lists the GitHub edit histories
  for the owner to clear.

Each decision on a card item carries the `cardSha256` from its inspect: when
the card or its later saves changed since, the call answers `card_changed` and
records nothing. A card item is decided once; the same request again replays
the decision, and a different one is `decision_conflict`. A change to an
accepted finding names its `version`, and an older one answers
`version_stale`. While the writer has not stored an earlier intent the change
depends on, the call answers `try_again_later` and records nothing.

Code checks only what is exact (part B): which save counts and its verified
basis, community evidence (`community_only` is refused; a finding that also
rested on audited comments needs `confirm`), every source's provider record and
retraction status, the declared numbers against the wording, the privacy screen
and the `ARF-` guard over every text an intent would store, the exact wording
key, and the rules for links. The topic, the numbers and the links are the AI's
declarations, and the owner accepts or rejects. A call the checks stop is not a
tool error: `needs_confirmation` asks for `confirm: true` after the owner reads
what the call names (a retracted source, then bound as context only; an
expression of concern, a correction, or a status the providers could not settle;
audited comments), `checks_not_passed` lists each problem with its code
and what to change, and `try_again_later` says a provider could not be reached.
Nothing is recorded in any of them.

A passed decision is recorded with `decide_atlas_card_item`, the decision row
and its hash-bound accept or re-check intent in one transaction; a later change
with `record_atlas_finding_intent`. The tool returns the outcome
`finding_queued` with the F number and the label it will take; the same
request sent again after the writer has run answers `finding_written` or
`finding_write_failed`, and an inspect shows the intent's status. The call never
writes canonical evidence (`canonicalEvidenceChangedByThisCall` is always
false). The existing one-shot `living-evidence-admin promote-accepted` command
promotes the contribution queue first, then at most one Atlas intent per
invocation (choice 7), oldest first, through the canonical writer; the
five-minute timer runs it unchanged. A refused intent ends `FAILED` with one
code from migration `0017`'s list (`ATLAS_LINK_PAIR_TAKEN`, `ATLAS_LINK_CYCLE`
and `ATLAS_LINK_ALREADY_RECORDED` among them), and the owner's corrected
request is recorded as its retry.

The card is kept in step on GitHub through the same App: each decision as a
comment with a hidden `askrigor-findings-decision` marker (never the owner's
reason), and, once every finding of the card has a decision, the `reviewed`
label in place of `pending-review` and the issue closed as completed. A GitHub
write that fails is redone, matched by its marker, on the next inspect or list.

The actions answer `atlas_review_closed` and read nothing unless
`ASKRIGOR_ATLAS_REVIEW` is `enabled`, which the release sets once migration
`0017`, the review role's grants and the promotion timer are verified; with the
switch on and the store or the findings repository not configured, they answer
`review_service_unavailable`. The tool is declared `destructiveHint: true`
(choice 6).

Erasing wording (part D) is recorded as an `erase` intent: with a revision or a
withdrawal, both are recorded in one transaction, and the runner applies them in
order, one per run. The runner writes an `atlas_redactions` row for each version
erased and calls `erase_atlas_wording()`, the one function the append-only
guard lets change a canonical row, and in the same transaction clears the same
texts from the finished intents that name the finding. An erasure of every
version of a finding that is not withdrawn ends `FAILED` with
`ATLAS_ERASE_NOT_WITHDRAWN`, a stale one with `ATLAS_VERSION_STALE`, and the
next intent goes on. The runner cannot reach GitHub, so the owner's call names
the cards that still hold the original wording and suggests `forget_card` for
each; `inspect_finding` shows which versions' wording is removed and repeats
it. The privacy data map's "Atlas findings: owner review" section gives the
erasure's exact scope and the forget path's steps and limits.

## Database model

Migration `0009_research_contributor_access.sql` creates:

| Table | Stored data | Public runtime authority |
| --- | --- | --- |
| `research_use_accounts` | HMAC account key, active/revoked state, mode, exact notice/agreement, timestamps | select/insert/update |
| `research_private_entitlements` | HMAC account key, verified source, active/revoked state, optional hashed external reference, validity window | select only |
| `research_contribution_proposals` | HMAC account key outside payload JSON, kind, strict payload/hash, false privacy markers, partial label, review state/timestamps | select/insert only |

The role receives execute permission on one security-definer function that can
only turn pending rows for the supplied HMAC account key into `WITHDRAWN`.
The service derives that key from the authenticated OAuth subject and never
accepts it from a client. Account revocation and pending withdrawal commit in
one database transaction. A database trigger also refuses a proposal unless
its account is still active in free-contributor mode, closing a concurrent
late-submit race.
It cannot grant an entitlement, accept/reject a proposal, write canonical
evidence, delete/truncate data, create objects, or read unrelated repository
tables.

Migration `0010_research_contribution_review.sql` adds the
`research_contribution_promotions` outbox and two security-definer functions.
Migration `0012_research_contribution_merging.sql` adds the `FAILED` state,
`failure_code` and `failed_at`, the proposal's optional
`supersedes_proposal_id` with its same-account trigger, the `TOPIC_LINK` kind,
the append-only canonical `topic_link_contributions` table (written only by the
canonical writer), and a third security-definer function,
`inspect_research_contribution_context`, which returns what the review needs
beyond 0010's projection as one JSON object and never an account key.
The distinct `askrigor_research_review` database role receives only schema use
and execute permission on those exact inspect/decide/context functions. It has no
direct table privilege. The functions omit `account_key`, lock a proposal for
each decision, require the owner-reviewed payload hash and a nonempty reason,
and bind an accepted intent to the proposal kind and hash with a composite
foreign key. The separate admin writer retains its existing canonical write
authority and processes the outbox independently.

Migration `0017_atlas_findings.sql` (Atlas phase 2) adds the private review
state, `atlas_card_decisions` (the only rows that name a card) and the
`atlas_finding_intents` outbox, and the append-only Atlas tables the canonical
writer alone writes. The review role gains execute permission on five more
security-definer functions, `inspect_atlas_cards`, `decide_atlas_card_item`,
`record_atlas_finding_intent`, `inspect_atlas_finding_intents` and
`forget_atlas_cards` (used by `forget_card`), and still no direct table
privilege. The writer-only `erase_atlas_wording()` and its helpers are not
granted to it. The privacy data map's "Atlas findings: owner review" section
lists what each holds. Migration `0018_atlas_card_fields.sql` (Atlas phase 3)
adds three nullable columns to `atlas_finding_versions` (kind, subject type and
the searches that found nothing), and new bodies for `atlas_redaction_permits`
and `erase_atlas_wording` that erase the searches' queries too; the review
role's grants are unchanged. Migration `0019_held_youtube_findings.sql` (owner
answer 173) adds the private `held_youtube_findings` table and six
security-definer functions: the research-access role may execute
`hold_youtube_findings` (at a save) and `purge_expired_held_youtube_findings`;
the review role those two, `inspect_held_youtube_findings`,
`inspect_cardless_held_youtube_findings`, `delete_held_youtube_findings` and
`delete_cardless_held_youtube_findings`. Neither has a direct privilege on the
table, and the reader's default-privilege SELECT on it is removed.

## Runtime and failure behavior

When the OAuth resource server is configured, every ordinary MCP research
operation requires `research:use` and an active mode. The two mode/proposal
operations also require `research:use`; case and contribution review retain
`cases:review` plus the owner-subject allowlist. Invalid/stale tokens,
unregistered/revoked access,
expired private entitlement, an unavailable access store, and malformed
proposals fail closed.

A refusal says why, to the caller only. With no sign-in it says the call
carried none. With a refused token it names a fixed class taken from the
verifier's exact error identity: `expired`, `wrong_audience`, `wrong_issuer`,
`not_a_signed_token` (for example an opaque token issued without this API's
audience), `bad_signature`, `client_not_allowed`, `subject_not_allowed`,
`invalid_claims` or `unverifiable` (AskRigor could not check it). With no
mode chosen it names the `manage_research_access` inspect call. Nothing is
logged, and the token and its claims are never returned.

ChatGPT showed every refused research call only as "The tool failed
internally" (owner reports, 2026-10-03 and 2026-10-06), so `get_protocol_manifest`,
which needs no sign-in, also reports the connection: `connection.sign_in`
(`absent`, `refused` with `sign_in_refusal`, or `accepted`),
`connection.research_access` (`ready`, `sign_in_needed`, `permission_missing`,
`mode_not_chosen`, `revoked`, `entitlement_inactive` or `unavailable`) and a
`next_step` sentence, which its text repeats. Its security schemes list
`noauth` and then `oauth2` with `research:use`, so a signed-in client sends its
token with it. The field is absent where `/mcp` has no OAuth and on Action
calls.

Legacy public research Action routes are removed from the effective Action
catalog when OAuth research access is active so they cannot bypass the mode
choice. The lesson-feedback Action remains separately governed. The Gemini
compatibility catalog remains at 22 tools and does not expose the mode,
proposal-submission, proposal-review, catalog-search, or case-review operations;
the primary ChatGPT/Codex plugin is the supported surface for this slice.

## Known limitations and next slice

- There is no checkout or self-service purchase flow.
- The protected owner-review, one-shot promotion runner, and hardened five-
  minute accepted-intent scheduler are deployed. The timer processes at most
  one already accepted exact-hash intent per activation; manual invocation
  remains available for immediate handling or rollback operation.
- The deterministic privacy screen cannot recognize every indirect identifier.
- Pending proposal retention is operator-managed rather than automatically
  expiring in this slice.
- Exact merging joins only exact matches: a question worded differently, or a
  study with a conflicting identifier, stays its own record. A topic link joins
  differently worded topics, not questions or studies.
- An accepted topic link stays in the append-only store; there is no record yet
  that withdraws a wrong one.
- The findings actions stay closed until the release turns on
  `ASKRIGOR_ATLAS_REVIEW`. Forgetting a card and erasing a finding's wording
  come with Atlas phase 2 part D; until then a card with decisions is deleted
  by hand, and its decision rows stay.
- A re-check is found only by the exact normalized wording key; a finding worded
  differently is its own finding, which the AI may link.
- A refused Atlas intent stays in `list_findings` until the owner's corrected
  request is recorded as its retry.

The scheduler release evidence is in
`audits/2026-09-01-promotion-scheduler-production-release.md` and its machine
JSON. It does not alter scientific review, proposal contents, or canonical
writer semantics.
