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
  Under notice v5 (owner answer 253a, 2026-11-05; built, not yet released), a
  card's summary of what communities reported also holds links to the forum
  threads AskRigor read. This is the free product.
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

The version is `free-contributor-v5-2026-11-05` (owner answer 253a,
2026-11-05; wording the owner chose, built, not yet released). The server returns
the complete notice from `RESEARCH_USE_NOTICE`. Free mode activates only when
all four versioned agreement fields are literal `true`. Silence, inferred
consent, a different notice version, or a partially checked agreement is rejected.

Version 5 keeps every other sentence of v4 and changes the second sentence's
community summary to:

> ... and what public online communities reported, summarized without their posts or names: the communities, counts of what people reported, and links to the forum threads AskRigor read, never YouTube comments or video IDs.

The privacy page and terms say the same. A card saved for an account that
accepted only v4 stores no thread link; one saved under v5, or a paid private
user's yes to a save, stores each thread's link as the Atlas publishes it
(`docs/superpowers/plans/2026-11-05-atlas-research-behind.md`).

An account that accepted v1 to v4 inspects as `UNENROLLED`, and research tools
refuse it with `RESEARCH_ACCESS_REQUIRED`, until it accepts v5. Migration
`0028_research_use_notice_v5` widens the same constraint as 0011, 0016 and 0020
to admit all five versions, safely on repeated runs; it is renumbered when the
Atlas stack next takes in main. An image that reads only v1 to v4 fails the
access check of an account whose row carries v5, so an image rollback below v5
first runs `infra/living-evidence-production/research-use-notice-v5-hold.sql`,
which holds v5 rows in `research_use_notice_v5_hold` (migrator only) and marks
the accounts revoked, so the person can accept v4 there;
`research-use-notice-v5-restore.sql`, run once an image reading v5 serves again,
restores each account still exactly in the held state. The Docker acceptance is
`npm run contributor-access:notice-v5-rollback-acceptance`.

### Asked again only when the notice collects or publishes more (the owner, 6 November 2026)

The owner: "can we make it so that i don't have to keep accepting the askrigor notice every time you update? that's
annoying". Released 9 November 2026:

- **Each version declares whether it is material.** `RESEARCH_USE_NOTICE_CHANGES`
  (`packages/evidence-repository/src/research-use-notice-changes.ts`) lists every version, oldest first, with
  `material` (it collects or publishes more than the version before it) and what changed. The change that adds a
  version adds its entry, and its review checks the declaration: no code can tell from the words. Every version so far
  is material. Tests hold the list to the versions the access schema admits.
- **A wording-only version carries a yes forward.** An account's yes covers the current notice when every version
  after the one it accepted is not material (`researchUseNoticeCovered`, exact on versions). Such an account is
  active; nothing is written, so its row still says what the person accepted, when and how, and `inspect` returns
  `access.acceptance` with `current: "carried_forward"`, its text adding "This account's yes to notice <version>
  carries forward to <current>, which changed only wording." A material version asks again, as before, and research
  tools refuse with `RESEARCH_ACCESS_REQUIRED` and "It now collects or publishes more than the notice this account
  accepted". The findings library's thread links and the Atlas's publish-on-save check read the same coverage.
- **The owner's own login accepts each new version by the owner's standing instruction.** The owner's login is the one
  subject `ASKRIGOR_OAUTH_ALLOWED_SUBJECT` names, which the owner's review already admits; the service derives its
  account key once (`ownerSubjects`). Dev accounts are a test role, not an identity, and are never treated as the
  owner's. When that login's active free account meets a material version, the service accepts the current notice
  for it and records it: the notice version, its agreement, `activated_at` (the time) and `notice_accepted_by`
  `OWNER_STANDING_INSTRUCTION_2026_11_06`. It never enrolls, reactivates or switches a login: a never-enrolled,
  revoked or paid private owner login stays as it is. `inspect` says so: "The owner's standing instruction of 6
  November 2026 accepted notice <version> for this login at <time>."
- **The record.** Migration `0031_research_notice_acceptance` adds `notice_accepted_by` (`PERSON` or
  `OWNER_STANDING_INSTRUCTION_2026_11_06`) and `notice_accepted_at`, always equal to `activated_at`. A person's
  `accept_free_contributor` writes `PERSON`; the first run backfills `PERSON` for active free accounts, since until now
  only a person's yes made one. A trigger clears the pair whenever a write moves `activated_at` without it (an image
  from before 0031, or the hold and restore scripts), so a stale way of acceptance never stays: `acceptedBy` then reads
  `null`, not recorded. `access.acceptance` is runtime-only; the published tool lists don't change.

Version 4 (owner answer 171) kept every other sentence of v3 and made exactly
these three changes:

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

`inspect` returns the account's `access`: its status, mode, the current notice's
version and the notice itself. For an account whose research waits on the notice
(not enrolled, revoked, or active under an earlier notice, which `inspect` shows
as `UNENROLLED`), the result also carries `next_step`, which its text repeats
with the notice word for word: "Show the user this notice, word for word, and
ask whether they accept it for free research (or use paid private access if
they have it). Only after their yes, call manage_research_access with action
accept_free_contributor and agreement {noticeVersion: "<the current version>",
eligibleDeidentifiedResearchContributionRequired: true,
prohibitedPrivateAndRawContentExcluded: true,
proposalReviewAndNoAuthorityAcknowledged: true,
paidPrivateAlternativeAcknowledged: true}. Never accept for them." (The owner's
report of 6 November 2026: with their login not yet on the new notice, ChatGPT
only told them they couldn't use AskRigor; it never showed the notice or asked
them to agree.) `next_step` is a runtime-only result field; the published tool
lists don't change. An active account's `inspect` and the other actions'
results carry none.

## The plain answer first

Owner answer 190a (2026-10-27), extending 140b: every account with active
research access, including free contributor accounts, is asked by `inspect`
to register, before any research call, the
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
the MCP connector (`/mcp` and `/mcp/claude`) has this; Custom GPT Actions do not,
and Gemini's catalog does not list it. Neither the plain answer nor its comparison
is sent to the second reader or saved in a findings card or the Atlas.

Since 11 November 2026 (released 12 November), the request also asks for a quick
verdict on each checkable premise of the question (a fact, a cause, a comparison,
or that something can't be or hasn't been done), each in a sentence of its own,
first among the claims, as Universal `premise_integrity_and_truth_priority_gate`
rule 2 asks: the comparison then gives each premise an outcome the person sees.
A doubt in the framing that could be false, not only unclear, and is not yet a
claim asks for the plain answer again: before any research call, with the same
framing, when the research goes on; after the person's answer, without the framing,
when the result asks (the framing isn't stored, and a registration made before the
ask without it would cancel the ask, while one made after it with its questions
would ask them again; that registration's request for a framing is for the next
question). The screen searches once for what would show each premise
wrong. What counts as a premise, and which doubts could be false, stays the model's
judgment, in any language; no check logic changed.

## Research the person can steer (owner answer 279a, 9 November 2026; released the same day)

From the owner's report AskRigor#434. Three runtime-only actions and inputs (owner answer 189a keeps the published tool
list as it is), all on the MCP connector, and none a blocking check; the ask that ends the turn, since 11 November 2026,
was released on 12 November:

- **The framing, with the plain answer.** `register_plain_answer` takes `later_inputs.framing`: the question the person
  most likely means, up to three things in it that look inverted, unclear or possibly false, and up to three questions whose answers
  could redirect the research. Its result says first what to do next by the account's research style: ask those
  questions and end the turn (guided and balanced), with the doubts in the one line allowed before them; say which
  reading it takes and keep them for the first check-back (autonomous); confirm the question in one line, the doubts
  in it, and end the turn (guided, with nothing to ask); or say which reading it takes and go on. Then it screens
  cheaply, in about eight calls, and calls `plan_research`. Without a framing, the result asks for one next time. The
  framing is not stored or signed.
- **The menu of next tasks.** `plan_research` takes `later_inputs.researchMenu`: the research target, up to 12 tasks
  (each with its kind, how many sources, what it could change, and optionally a loop between people's reports and
  studies or the model's own time range), whether the person's choices could steer the research
  (`steering_could_help`, the model's judgment from the screen, with HRP's test for when approval is required: true
  when a choice the person could make, or something only they know, could materially change what the research checks,
  false only when the question already fixes all of that; left out, it counts as true), the one question the model
  would ask this person before researching, or the word none (`steering_choice`, at most 300 characters; owner answer
  296b, 13 November 2026: given, it decides in place of `steering_could_help`, a named question as true and none as
  false, and a dev account's short menu must carry it: below), the person's allocation
  once given, whether the person has answered the menu in a message of their own (`person_answered`, the model's own
  declaration, without which an allocation is not used: below), the tasks done, and optionally the
  plain answer's receipt. Each task gets a time range from its kind's
  planning estimate per source (`PLAN_TASK_MINUTES` in `apps/research-mcp/src/research-steering.ts`, measured on the
  timing runs of 9 November 2026); tasks that could change the conclusion are recommended first, then those that could
  change how sure it is, within the check-back allowance; detail alone is never recommended. Guided always asks;
  balanced asks when the recommended tasks could take more than about 10 minutes (the high end of their range) or the
  person's choices could steer the research, as they usually can unless the question is precise (owner answer 284, 10
  November 2026); autonomous goes on, and after the allowance checks what it has and gives that answer, ending with the
  open tasks as a numbered menu and the question whether to spend more time on them; a person's allocation is followed,
  in their own minutes as given (only AskRigor's own estimates are rounded for the menu; 12 November 2026).
  An allocation that names no task on the menu still open counts as none, so the menu recommends and decides as if
  none had come (11 November 2026); whether the menu may ask for a task near the top, which would renumber it, goes by
  whether an allocation or a done list was given at all. A re-plan (tasks done, and no allocation that counts as the
  person's answer) with something to recommend asks, unless the person chose autonomous research, so a new task comes
  back to the person and a task they skipped isn't done unasked (12 November 2026). A re-plan before any task was done
  has no done list, so each result also carries `researchMenu.menu_digest`, a digest of its task list keyed with the
  server's signing secret, which the next call passes back in `researchMenu.menu_digest`: when the call's tasks differ
  from it in number, or in any task's kind, what it could change or its loop, and the call carries no allocation that
  counts as the person's answer, the AI changed the menu on its own, so research that may ask asks and shows the
  changed menu (the review of 12 November 2026). A call with the person's allocation goes on with it, under every
  style, since they may have changed the menu themselves when they redirected the research (Greptile's review of 12
  November 2026: autonomous research dropped that allocation for the default tasks). A task's wording, sources and
  minutes are not compared, so a model that retypes the menu, or estimates a time again, isn't taken to have changed
  it. A call without a digest is planned as before.
  Since 11 November 2026 (the owner: "it's still not asking me any steering questions"), an ask ends the turn. Its
  text puts the stop first: the reason, worded as the person's own setting, and that the whole reply is the message
  that follows, after any urgent action, with no research call and no final check, since a question is not an answer
  (HRP's preflight-only exit, and `StructuredUserSteeringAndApproval`: when approval is required, begin no substantive
  source collection in the same response). Then the reply, ready to send: at most two sentences on the first look,
  said to be not yet checked, and one on what the person's choices could change when they could, or, since 13
  November 2026, the question the model named for them (`steering_choice`, below); the menu, one task
  per line, with the recommendation and the time to check and write the answer; and the question how to spend the
  time. It ends with what to do when the person replies: `plan_research` again with their allocation, the research
  target word for word as the menu gave it (or, when the plain answer's receipt shows it is not the registered one, as
  `register_plain_answer`'s result quoted it), "you decide" or "continue" meaning the recommended allocation, a changed
  question registered again with a framing of its own, and never an allocation the person did not give or leave to the
  AI. Since 12 November 2026 the rule says the allocation goes inside `researchMenu`, and when the ask recommends
  something for the registered target, the "you decide" call follows it, ready to copy: the same menu with the
  recommended allocation inside it, also given as the runtime field `you_decide_later_inputs` (in the owner's ChatGPT
  run, "you decide" took seven calls). Nothing else follows.
  An allocation is the person's answer only when the model declares it (round 3 of the owner's
  ChatGPT runs, 12 November 2026, on build 1d877300: the AI received the ask and 54 seconds later, in the same turn,
  sent the handed-over call itself; AskRigor said go on, and it researched for 17 minutes without the person, having
  "treated AskRigor's returned you_decide_later_inputs allocation as a usable default"): on dev accounts from 12
  November 2026 (#440), and on every account since 13 November 2026. Round 4 on the owner's account (13 November,
  00:03 to 00:39 UTC) showed no first turn going on with an allocation the person had not given, and a real "you
  decide" going on at the first `plan_research` call, while every other account still got the handed-over call as a
  usable default; so the requirement is every account's, a fix under the owner's standing rule for fixes, told to
  the owner that day with no objection. `plan_research` uses
  an allocation only with `person_answered` true in the menu, which says the person answered this menu in a message
  of their own, giving the allocation or leaving it to the AI. One sent with false or without it is not used: the
  result carries `researchMenu.allocation_not_used`, recommends AskRigor's own tasks and decides as if no allocation
  had come, so it asks again, and says so before anything else in its text and in `next_step`, and first among its
  `problems`: the menu still waits for the person, and if they have not replied since it was shown, this is still
  the turn of the ask. It is not an error and hands back no corrected call. A menu that goes on whatever the person
  says (autonomous research, or a short menu the model judged not steerable) goes on with AskRigor's own tasks and
  says they are not the person's choice. The handed-over call carries `"person_answered": "<true|false>"` after
  its allocation, to be replaced with whether the person has answered, and the judgment the menu gave
  (`steering_could_help`, `steering_choice`), so the call copied as it is is planned as the same menu: it asks again,
  and on a dev account it is not handed back for the question left out. The words true and
  false are read as the values, a `person_answered` beside the menu goes inside it, and the placeholder left in is
  read as not given; any other word is refused as unreadable. The rule for the person's answer, the call's own line,
  `next_step` and the way back after a stop each say that an allocation goes with `person_answered` true. AskRigor
  checks only that it was declared: whether the person answered is the model's knowledge, in any language, and no
  word of the person's is sent. On a dev account, a short menu that names no question is still handed back for it
  (owner answer 296b, next), whether or not it carries an allocation that is not used.
  On a dev account, a short menu names the question the model would ask the person, or none (owner answer 296b, 13
  November 2026). From 12 November (owner answer 294c, #440), a dev account's menu whose ask rested only on
  `steering_could_help` left out planned nothing until the model gave it, true or false. Round 4 of the owner's
  ChatGPT runs on that build (13 November, 00:03 to 00:39 UTC): the control, one figure from one named trial, got
  false and a checked answer in one turn, two open questions got true and asked, and two got false and went straight
  to a checked answer. Asked why, the model named a choice of the person's both times ("you could have clarified
  whether the comparison concerned Chinese AI-distillation attempts specifically or China's broader AI-development
  capabilities"; "You could have chosen a broader comparison of dietary interventions against antidepressant trials
  ... I selected the narrow approach myself"), and the owner: "for pewdiepie, i do recall it answered mostly the wrong
  question". So the menu takes `steering_choice`. On every account that gives it, a named question counts as
  `steering_could_help` true and the word none as false, whatever `steering_could_help` says beside it; with neither,
  `steering_could_help` is read as before. On a dev account, a menu whose decision rests on the judgment (planned as
  steerable it would ask, and planned as not steerable it would go on: read from the rule itself,
  `steeringChoiceLeftOut`) plans nothing until it carries one. A menu that gives the yes or no alone, true or false,
  or neither, is refused as `invalid_request`, with valid structured content and `corrected_later_inputs` built from
  the call's own, `"steering_choice": "<the one question you would ask this person, or none>"` marking its place
  before the tasks. The text and the error's message give the test (`STEERING_CHOICE`): try to name the question
  first; if one can be named, AskRigor asks the person first; none only when no such question can be named because
  the question itself fixes exactly what to look up, as with one result of one named study; and that every task on
  the menu is needed to answer is not by itself a reason for none, since the person may mean a different reading or
  comparison than the one the model picked. The placeholder left in is read as not given, exactly, so the call sent
  back unchanged is handed back again and not planned. Guided and autonomous research, tasks past 10 minutes, the
  person's declared allocation, a changed menu and a re-plan need no `steering_choice`, as they needed no judgment.
  When the menu asks and a question was named, whatever the reason for the ask, the result carries it as
  `researchMenu.steering_choice`; the reply the text hands over puts it to the person, in their language, in place
  of the general sentence on what their choices could change; `next_step` says to put it to them, right after "Ask
  the person now and end your turn"; the rule for the person's answer, and `next_step`, say that what they answer
  to that question decides what the research checks, so the tasks are done, and the answer written, for the reading
  or choice they gave, and that a reply that answers it and gives no allocation leaves the allocation to the AI, as
  "you decide" does (`NAMED_ANSWER_STEERS`: the rule covered only an allocation or a changed question, so an answer
  that keeps the question and picks a reading had no instruction, and one that gave no allocation had no way forward
  but the same ask again); and the handed-over "you decide" call keeps it.
  AskRigor checks only that a
  `steering_choice` was given and whether it is exactly the word none, in any letter case and without the spaces
  around it: none is a value of the field, not a judgment, and every other text is a named question, in any
  language, so what is unclear asks. It is a text the model writes, read in memory only; the person's reply to it is
  never sent. An account that is not a dev account and gives no `steering_choice` is planned as before.
  Since 13 November 2026 one kind of value is handed back, on every account: one that is neither the word none nor
  a sentence, when the menu's decision rests on it. In the check of the control on build `4fbd6c6b` the model wrote
  `"none_needed"`, AskRigor read it as a named question, and the look-up got the menu in place of its answer. The
  check is of the value's form, never of its meaning: a value that begins with the word none and goes on without a
  question mark (`none_needed`, `none.`, `none: the question is precise`), or a single run of ASCII letters,
  digits, `_`, `-`, `/` and `.` (`n/a`, `null`, `no`). The refusal (`invalid_request`) gives the call back in
  `corrected_later_inputs` with the field's place marked, to be filled with exactly none or the question; a menu
  the person has already answered, or one that asks or goes on either way, is planned as it came.
  Round 5 of the owner's ChatGPT runs, on the build that asked for that question only in a refusal (#441; 13
  November, 02:51 to 03:18 UTC): two open questions went straight to a checked answer, and in both the model's first
  call, sent before any result had asked for a question, already carried `steering_could_help` false with a reason;
  the refusal then got the word none, and asked afterwards the model named a question both times. Since owner
  answer 297c (13 November 2026), on a dev account, a menu refused because it could not be read comes back with
  `steering_choice`'s placeholder in `corrected_later_inputs` when the call named no question, the text and the
  error's message saying what replaces it, with the test, so the corrected call is planned and not handed back a
  second time. From 12:19 UTC that day to the next release, `register_plain_answer` also asked a dev account's
  model for the question where it first learns the menu (the menu's shape with `steering_choice` where the yes or no
  stands, and a last sentence in `next_step`). In round 6 the control, one figure of one named trial, then got a
  question in place of its answer: its first call already carried one, and asked why, the model said "none would
  have been the better choice". The owner took that part back the same day (owner answer 298b):
  `register_plain_answer` gives a dev account the words it gives every account, pinned by a test with the shape's
  SHA-256. And on every account, a menu that gives the word none and goes on carries
  `researchMenu.say_reading_first` true (runtime only), and its go-ahead, in the text and in `next_step`, is followed
  by "You named no question for this person, so before the answer itself say in one line, in their language, how
  you read their question: which meaning, comparison or situation you took it to be about. A reading they did not
  mean then shows at once." (`READING_FIRST`). A menu that asks, or one held back for its research target, does not
  carry it. How the question was read is the model's to say, in any language: AskRigor does not read the answer.
  A result that goes on says to do the tasks and then give the checked answer in the
  same turn, asks for a line before each task, sends a new fork that could change the conclusion back through
  `plan_research` with the tasks done and without the allocation, so the rule decides afresh (not in autonomous
  research, which checks and answers instead), says how to resume after a stop or a change of direction, asks for a
  task for each lead between people's reports and studies, and words the adjusted-variables look by the account's
  choice. With the plain answer's receipt it says whether the research
  target is the registered one, word for word but for case and spacing, and how many minutes have passed since. When
  it is not, the text says so, and since 13 November 2026 `next_step` does too, before any ask and in place of
  the go-ahead (Greptile's review of 12 November 2026, reproduced by an audit: `next_step` said only to do the tasks
  and finalize, or to ask, so an app that hands its model the structured content missed the correction, and the
  answer ended without the comparison with the quick answer): before any research call, `plan_research` again with
  the same menu and the research target word for word as `register_plain_answer`'s result quoted it, the words
  `finalize_research` takes too, or, when the question itself changed, the plain answer registered again for the new
  target with a framing, and the menu planned again; a menu that would have gone on says to do none of its tasks
  before that, in `next_step` and in its text alike (the text used to follow its warning with "Go on now"). Nothing
  of the menu is stored.
- **The menu as a model guesses it** (12 November 2026: in the owner's ChatGPT at Extra High, every run's
  `plan_research` was refused three to five times before one passed). Before the call's inputs are checked
  (`withResearchMenuReading`), the menu is read in its own names: a key whose snake_case form is a menu or task field
  is that field (`researchTarget`, `couldChange`), a task's `title` or `name` is its text when it gives none, one
  number for a task's `minutes` is the range `[n, n]`, a null optional field is left out, `user_allocation` and
  `allocations` are the allocation, and an allocation, done list or `person_answered` beside the menu in
  `later_inputs` goes inside it
  when it has none. Every other key is ignored, and the result names what was ignored or moved in one sentence, after
  its text and among its `problems`. Values stay strict: a task is an object, and `kind` and `could_change` are one of
  their values. A menu still not readable, or none, is refused with valid structured content (ChatGPT shows an error
  result without it only as "The tool failed internally"): its problems, and `corrected_later_inputs`, an example
  built from the call's own research target and task texts, with a placeholder listing the values wherever a kind or
  could_change is missing or not one of them.
- **The next step for apps that read only the structured content.** Claude Code hands its model a result's structured
  content and leaves out its text (`docs/claude-connector.md`). So `register_plain_answer` and `plan_research` also
  give their next step as `next_step`, a runtime field (owner answer 189a), as `inspect` does for the free-use notice:
  whether to ask the person and end the turn, or go on. `inspect`'s request for the plain answer opens with the run's
  shape: the plain answer with its framing, a short screen, `plan_research`, the tasks chosen, then `finalize_research`;
  when a result says to ask the person and wait, the reply is that question and the turn ends there.
- **The research style.** `set_research_steering` takes `later_inputs.researchSteering` (`style`: `guided`, `balanced`
  or `autonomous`; `checkBackMinutes`: 1 to 120; `adjustmentDetail`: `flagged` or `all`), any of them, for an active
  account; `inspect` shows it. Migration `0033_research_steering` stores the three choices on `research_use_accounts`,
  `balanced`, 10 and `flagged` by default, with a check on their values; saving or revoking the account leaves them
  as they are. A change writes only the parts it names, in one statement that keeps the others as stored at that
  moment, so two chats changing different parts at once both keep theirs (the review of 12 November 2026: the service
  read the whole style and wrote it back, so the later write undid the other's change); the account's other switches
  each write only their own column.

### AskRigor's own planning call, on dev accounts (owner answer 298b, 13 November 2026)

On a dev account, with the call switched on, AskRigor plans the research itself when the plain answer is registered:
one Claude API call that first searches the web (at most two searches) for what the question refers to, then says
what it is about, names the one question to put to the person before researching, or the word none, and lists two
to five research tasks (`apps/research-mcp/src/research-planner.ts`). The owner, 13 November: "perhaps the research
plan should be tried directly as an api call rather than hope the AI can figure it out". Rounds 4 to 6 of the
owner's ChatGPT runs had left that judgment to the person's AI, and it went wrong in a different place each round.

- **What the person's AI sends.** `inspect`, on a dev account while the call is on, asks for
  `later_inputs.asked` with the plain answer: the person's own words about the question, word for word and in
  order (their question, and after it any answer they gave to a question of the AI's about it), as one text or as
  a list with one message each (in round 7 four of five chats sent a list first and were refused once), at most
  6,000 characters in all. Only what the person wrote in this conversation: nothing from memory or from earlier
  conversations, and no note of the AI's (in round 8 one chat of five added a reply it remembered from an earlier
  chat, and the plan was made from it). A research target is the AI's wording, and in round 6 one already carried a
  reading the person did not mean. Without `asked` the plan is made from the research target, and the result asks
  for it next time.
  `asked` goes only with `register_plain_answer`; on any other account it is not used.
- **What comes back.** `register_plain_answer`'s first text and `next_step` say not to screen, give what the
  question is about (`research_plan.about`), and hand over the menu ready to send: `planned_later_inputs`, a
  `researchMenu` with the registered research target, the receipt just signed, the planner's `steering_choice`
  and its tasks. Sent as it is, `plan_research` plans it at once, by the account's style: a named question asks,
  and the reply puts it to the person with the menu; none goes on, and the answer opens with how the question was
  read. When the reading found differs from the plain answer's, the AI says so in one line, and registers again
  only when the research target itself names the wrong thing (the plan is kept for an hour for the same words).
- **The order of its tasks.** By how directly each could answer what the person asked, not by which source is best
  known: for harm or benefit in people, studies in people that compare come first, then series that give doses and
  counts, then what else could cause the same thing, and animal and cell studies after them; for what a
  preparation contains or how strong it is, measurements of that preparation; and a study the question names is
  read across all its doses or groups. Bug report #445 (13 November 2026): a first answer on a solvent's harm to
  children led with a cell study and a mouse study, and the trials and case series in people came only after the
  person challenged it.
- **It never blocks.** Off, over its budget, over the account's calls for the day, timed out, refused, failed or
  unreadable, the result is the one every account gets, and the AI screens and plans as before, with one sentence
  after the first text and `research_plan_not_used` naming why. At a day's limit the sentence asks the AI to tell
  the person so in one line, and `next_step` carries it too. A planner that throws, rejects or never settles is a
  failure like any other: the registration waits for it 125 seconds at most.
- **The cap.** A call is sent only while the day's cap has room for the USD 0.12 held for it, and that is settled
  with the call's real cost when the reply comes, on the day the call was sent. A call that timed out, or failed
  with no answer from the API, keeps what was held; one the API answered with an error status costs nothing. So
  the cap is passed only by a call that costs more than USD 0.12 (the dearest measured: USD 0.094), and its reply
  is limited to 8,000 output tokens. A refusal's category, as the API names it, is logged as a class.
- **Across a restart.** The day's spend and each account's count were numbers in process memory only, so a release
  or restart started both again and the cap could be passed on such a day. With
  `ASKRIGOR_RESEARCH_PLANNER_STATE_FILE` naming a file, the planner reads it once after the server starts and
  replaces it whole after every change. It holds the UTC day, the day's spend in USD with what is held for running
  calls, and each account's count under the first 16 hex characters of the SHA-256 of its account key: never the
  key itself, a question or a plan. A call that was running when the server stopped keeps the USD 0.12 held for
  it, as one that timed out does. A file for another day, or one that is missing, unreadable or not as the planner
  writes it, starts the day at zero; for one from a later day or of another form the log says
  `state_file_malformed`. A write that fails is logged once (`state_write_failed`) and the counts go on in memory,
  so it never fails a registration. Without the setting nothing is read or written.
- **Settings.** Off unless `ASKRIGOR_RESEARCH_PLANNER=on`, with the key read from the file
  `ASKRIGOR_RESEARCH_PLANNER_KEY_FILE` names (a read-only mounted secret), `ASKRIGOR_RESEARCH_PLANNER_WORKSPACE_ID`
  for an organization-scoped key, and optional `_MODEL` (`claude-opus-5-5` by default), `_EFFORT` (`low`, `medium`
  or `high`; `low` by default), `_DAILY_CAP_USD` (3 by default), `_ACCOUNT_DAILY_CALLS` (10 by default),
  `_TIMEOUT_SECONDS` (45 by default, at most 120) and `_STATE_FILE` (none by default). Its daily cap and the
  meaning judge's together may not pass the owner's USD 3 a day, or it stays off. A request the model's safety
  classifiers decline is answered by Anthropic's default fallback model in the same call
  (`fallbacks: "default"`); when the whole chain declines, the AI plans as before. The SDK's own logging and
  tracing are off for this client and the meaning judge's, whatever the environment says: at debug level the SDK
  logs requests and replies whole.
- **What it costs and keeps.** Paid from the owner's monthly Claude API credit
  (`governance/chat-work-authority-policy.json`, `OWNER_ANSWER_298B`). Measured on 13 November on the five test
  questions: 6 to 9 cents and 10 to 22 seconds a call with one or two searches. AskRigor stores nothing it sends or
  receives (`docs/privacy-data-map.md`). The Atlas account page lists it with its limits.
- **Not done.** Other accounts: the owner's direction is to give everyone the call, with about 10 a day for a free
  account and a word to the person when they are used up; that needs a ceiling for the spend and the free-use
  notice to say that the question goes to Anthropic, so it is the owner's next decision, after the trial. The
  call's reading is not checked against anything: it is one model's judgment, shown to the person's AI as such.

#### The three lanes (owner answer 302, 14 November 2026)

A one-figure look-up took nine minutes. The owner asked when AskRigor should step aside, and chose both answers
offered: step aside when AskRigor surely adds nothing, and a light lane when it may help but the question is still
light. So the planning call also names a lane for each question. This is for dev accounts only, while the planning
call is on.

- **research.** The research as before: the menu, its tasks and the final check with AskRigor's review of the draft.
- **light.** One fact that one named source states. The menu has one or two tasks and no method audit, and says
  `lane: "light"`. When it goes on, `plan_research` says to do only what the menu lists: open the source, find the
  line or table row, and quote it with where it stands. No method audit, no forum search, no second literature search and no
  findings card. Then one final check, and the answer in the same turn. The final check makes no review of the draft.
  The answer starts with this line, in the person's language: "AskRigor light look-up: the source was opened and the
  line quoted; nothing else was checked. Say 'research it fully' for more."
- **aside.** A plain look-up AskRigor's research would add nothing to. `register_plain_answer` still signs the plain
  answer and gives its receipt, but hands over no menu. The AI makes no research call, calls neither `plan_research`
  nor `finalize_research`, and answers as it would without AskRigor, naming its source. The answer starts with this
  sentence, in the person's language: "AskRigor says this question doesn't need AskRigor's research. Here is the
  regular AI's answer:" AskRigor checks nothing in that answer, and the AI may not say or imply that it did.
  AskRigor steps aside only when the planning call had the person's own words (`later_inputs.asked`): a plan made
  from the AI's research target alone cannot tell what the person asked, so it is not used, and the AI screens and
  plans as on every account.

The lane is the model's judgment. AskRigor only checks that the reply does not contradict itself: aside and light
only with the word none for the question, and light only with one or two tasks and no method audit. Anything else is
research, so in doubt AskRigor researches. A guided account is still asked first: the lane changes what the go-ahead
says, not whether the menu asks. When the person asks for the research ("research it fully", or whether the answer
is true or safe), the AI registers the plain answer again with their words and that request in `later_inputs.asked`.
New words get a new plan, so the full research can come back: the planning call's rubric puts a look-up the person
asked to have researched fully, or came back to asking more about, in the research lane. After a step-aside answer
and after a light look-up, the result tells the AI to do this. `research_plan.lane` names the lane in the registration's result.

#### What the plan asks the person, and what it leaves out (rubric 2026-11-14.1)

Two reports of 13 and 14 November 2026 (AskRigor#456, AskRigor#457): the plan asked a person to choose between
readings their own words had already chosen ("Could AI become conscious?": today's chatbots or any future AI?), and
to say which species to compare when they had asked which is best. The rubric now says:

- Never ask the person to make a choice their own words already make, or to choose how wide the research looks.
  "Best", "any", "ever" or a comparison with nothing named asks about the whole class. "Could it become" asks about
  the future. Of two readings where one contains the other, the wider one is planned.
- A question about the person is still asked: their condition and how severe it is, their age, what they have tried.
- An instruction that names where to look and what to judge by is precise enough to go on.
- Where a figure the person quotes comes from is the research's to find, not a question for them.
- A task whose result is part of what the person asked is never marked as detail, so the menu's recommendation
  keeps it (the expert forecasts were dropped for "Could AI become conscious?").
- A question whether something could happen or be made gets a task on the routes already being tried that differ in
  kind from the best-known one (computing with living neurons was left out).

These are the model's judgments, in the rubric's words; no word of a question is matched in code. On the API the
needless questions were gone in every run (two runs each); the test questions that should be asked still were, the
orange peel one in three runs of five (before, in each run seen). When the plan goes on without a question, the
answer still says first how it read the question.

### AskRigor's own review of a draft answer, on dev accounts (owner answer 301a, 13 November 2026)

On a dev account, with the call switched on, `finalize_research` given an answer draft also makes one Claude API call
of AskRigor's own that reads the person's words and the draft, may run two web searches, and names up to three gaps:
what this person would most likely have to ask next because the draft left it out, buried it, or put it more strongly
or more weakly than its own evidence supports (`apps/research-mcp/src/research-reviewer.ts`, whose rubric
was tried first on plan workers and then on the API). It is advice only: owner answers 193a, 195a and 217b allow no new blocking check, so the check's
status, next steps, receipts and findings card are the same with it as without it; it adds one note.

- **What the person's AI sends.** `later_inputs.asked` on `finalize_research`, read exactly as
  `register_plain_answer` reads its own (one text or a list with one message each, at most 6,000 characters in all).
  A registration result that carries the planner's texts says, while the review is on, to give it again at the final
  check with any later message of the person's about the question. Absent or unusable, the review reads the research
  target alone; it never makes a problem or a step. On any other account it is not used.
- **What it sends to Anthropic.** Today's date, the person's words (or null), the research target and the draft cut
  to 24,000 characters; no account key, receipt or other declaration.
- **What comes back.** What the searches showed a good answer names, which the reply must give first so that it
  rests on a search (the note does not carry it), and gaps, each with what is missing or wrong, the follow-up the person would otherwise ask, what
  to add, and its kind (`missing`, `wrong`, `overstated` or `understated`); at most three are kept, and a gap with an
  unusable field is dropped alone. The note lists them and asks the AI to revise the draft before answering, reading
  a study or figure it has not read when a few minutes cover it and otherwise saying in one line that it was not
  checked, and then to check the revised draft with `finalize_research` once more, unless that result's check is
  the turn's last (a repeat pass), when the changes are made in the answer with no further check. No gaps: the note
  says the review found nothing.
- **Once per question.** Keyed by a digest of the model, the effort, the rubric's version, the account key and the
  person's words (or the research target): while a call for it runs, and for an hour after it gave a review, the
  same question's next final check gets no review and no note, with no call and no count. A call that ended without a
  review frees it.
- **A "preliminary" answer that does not say what is left** (rubric 2026-11-14.1, AskRigor#458). The review's fifth
  point: a draft that calls itself preliminary, provisional or a first pass, or ends on more research being needed,
  without saying which sources or options were not yet looked at, what the next steps are in order, why they could
  change the conclusion, and whether that work is starting now or waits for the person's go-ahead.
- **Not for a light look-up** (owner answer 302). When the planning call's plan for the same account's same words,
  held for the hour in process memory, put the question in the light lane, the final check makes no review call and
  adds no note, and none of the account's reviews for the day is used. The final check is asked for the person's
  words with their later messages added, so the words may no longer be the plan's: the lane of the last plan made
  within the hour for the account's same research target then decides, compared as the final check compares a
  research target (case and spacing ignored). With other words and another research target there is no such plan,
  and the draft is reviewed as before. A light plan's registration does not ask for the person's words at the final
  check, since no review will read them. A light menu whose task the person gave no time is not a light look-up: it
  gets what any menu with nothing to do gets.
- **It never blocks.** Off, over its budget, over the account's calls for the day, timed out, refused, failed or
  unreadable, the check stands as it is, with a note that the review did not run and why in plain words.
- **The cap and settings.** Off unless `ASKRIGOR_RESEARCH_REVIEWER=on`, with the key read from the file
  `ASKRIGOR_RESEARCH_REVIEWER_KEY_FILE` names, or `ASKRIGOR_RESEARCH_PLANNER_KEY_FILE`'s when that is not set;
  `ASKRIGOR_RESEARCH_REVIEWER_WORKSPACE_ID`, or the planner's; and optional `_MODEL` (`claude-opus-5-5` by default),
  `_EFFORT` (`medium` by default), `_DAILY_CAP_USD` (3 by default), `_ACCOUNT_DAILY_CALLS` (10 by default),
  `_TIMEOUT_SECONDS` (60 by default, at most 120) and `_STATE_FILE` (none by default; the same form as the planner's,
  in its own file). Settings that are not valid are logged as a class and leave it off. Its daily cap with the
  meaning judge's and the planner's, each while it is on, may not pass the owner's USD 7 a day for all three, or it
  stays off (`daily_caps_exceed_owner_ceiling`); the planner's and the judge's keep their own USD 3 a day together.
  USD 0.50 is held for each call until its cost is known, as the planner holds
  its USD 0.12, and the reply is limited to 8,000 output tokens.
- **Measured on 13 November 2026.** On plan workers the rubric named, for the owner's five test answers, what the
  owner's own follow-up questions had asked for, and nothing for the one-figure look-up. On the API at low effort
  the same rubric ran no search for two of three drafts, in three wordings, and one reply named a trial from memory
  with the wrong comparison; at medium effort it searched every time (three drafts): 23 to 39 seconds, 7 to 10 US
  cents a review, no gap for the look-up. So the effort is medium, and the time limit 60 seconds.
- **What it costs and keeps.** Paid from the owner's monthly Claude API credit
  (`governance/chat-work-authority-policy.json`, `OWNER_ANSWER_301A`). AskRigor stores nothing it sends or receives
  (`docs/privacy-data-map.md`): only the question key's digest, in process memory for the hour, and the day's
  numbers, in process memory and in the state file when one is named.
- **Not done.** The call record does not yet show whether a final check was reviewed: it keeps no outcome of the
  planning call either, and adding one is a change to what it keeps. The Atlas account page does not list the review.

## The call record (owner answer 280a, 9 November 2026; released the same day)

So a person can tell "never called" from "called and refused" (AskRigor#434), the server keeps a content-free record of
each MCP tool call from a signed-in research account: the account key, the time, the tool, `manage_research_access`'s
action, the route, whether ChatGPT's signals came with it, the outcome (answered, refused with its fixed code, or
failed) and the time taken. Migration `0032_research_call_record` holds it; each row is deleted 7 days after its call,
by the account's next call and an hourly sweep. The runtime-only action `list_calls` shows the account its own calls,
newest first, and `inspect` names the action when the server keeps a record. Since 12 November 2026 (500 calls came to
about 85 KB, more than Claude's clients take in) a listing shows the calls that fit 40,000 bytes of text and structured
content as the app gets it, the tool-list notice included (`MCP_RESULT_MAX_BYTES`, the YouTube audit's budget), says
which it shows, and gives the time the next page starts from: the runtime-only `later_inputs.callsPage` (`before`,
`limit`) shows the calls received before that time, so pages don't shift as each listing is itself recorded, and they
reach past the newest 500; a page never ends inside calls received in the same millisecond (Greptile's review of 12
November 2026). Recording never delays or changes a
result, and a failed write is dropped silently. Calls without a valid sign-in and Custom GPT Action calls are not
recorded. The privacy page and `docs/privacy-data-map.md` ("The call record") describe it; the access role has INSERT,
SELECT and DELETE on the table only, and the canonical reader none.

Owner answer 289a (12 November 2026; released the same day): for an answered `plan_research` call the record also
keeps the decision AskRigor's own result made, `ask` or `go_on` (`researchMenu.next`), never anything the person or
the AI wrote. Migration `0034_research_call_record_plan_next` adds the nullable `plan_next` column, whose check admits
a value only on a `manage_research_access` row with action `plan_research`; `list_calls` shows it beside the action
("manage_research_access (plan_research: ask)"). The owner's call record of 11 November showed ChatGPT inspecting in 9
of 9 runs and never calling `plan_research`; with the decision kept, a record also tells an ask that was ignored from a
menu that said to go on.

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
  topic. Since owner answer 219b (2 November 2026) a finding is also held when
  it declares that it draws on YouTube comments (`draws_on_youtube_comments`) or,
  once the research read them, declares nothing; the finalization receipt signs
  which. They are kept until deleted (the owner's rule, 25 October: "don't
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

Migration `0031_research_notice_acceptance.sql` (the owner, 6 November 2026) adds how a free account's notice was
accepted, `notice_accepted_by` and `notice_accepted_at`, with its trigger and check (above, "Asked again only when the
notice collects or publishes more"); the access role's column grant names both.

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
- Whether a notice version is material is declared by hand in its change and checked in review; a version marked
  wording-only that in fact collects more would carry yeses forward wrongly.
- A row an image from before migration 0031 last wrote, or one the notice hold and restore scripts moved, shows its way
  of acceptance as not recorded (`acceptedBy` `null`) until the person or the owner's instruction accepts again.
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
