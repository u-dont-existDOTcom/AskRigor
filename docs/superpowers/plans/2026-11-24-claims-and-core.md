# The quick answer's claims on the menu, HRP's core at registration, and evidence one step away (24 Nov 2026)

Owner answers 413a and 412a, and promise P90 (24 Nov 2026). Three changes to research, built in one branch because they
touch the same registration texts and the same plan, each behind a switch of its own, so a test round can tell their
effects apart.

Status (24 Nov): built on `claude/claims-and-core-20261124` (AskRigor#520; 413a's display half, #519, is merged), switches
off, not released. A second model (Fable) reviewed the pull request on 24 Nov, 10:59 UTC, and red-teamed P90's rule; what it
found is fixed here or listed under "What is not done". A release needs the measurement below and the owner's yes.

## The decisions

- **413, option a, change both.** The owner, 23 Nov: "the 'askrigor checks' field was so useless, it said 'the plain
  answer would ahve said X, but askrigor didn't check that' like over and over and over, askrigor looks so useless lol".
  The display half is #519. The research half, as the question put it: at registration the AI is told to register only
  the points a person would act on (2 or 3, the question's own assumptions first), and each gets a research task or is
  said to be left out on the menu; the planner's rules get the same line. Its costs, as told: fewer points are compared,
  so a mistake outside those 2 or 3 goes unnoticed; research may run longer or spread thinner; nothing promises that "did
  not check" becomes rare, since the person's choices and time still decide what is checked.
- **412, option a, with option c.** "When the AI registers its plain answer, the result carries the core's exact text
  and names the further sections to fetch." Option c: "Fetching HRP gives a signed slip, and the final check adds a note
  when none is shown. It never blocks, so the six checks that can stop an answer stay six." Tested before and after in
  the owner's ChatGPT; a release question only if answers improve.
- **P90, the planner's rule.** A case of the owner's (kept privately) found that AskRigor's plan left out evidence on the
  same outcome by another route or setting. The rule's first draft was red-teamed; the narrower wording stands, behind a
  switch of its own, to be tested before it ships.
- **What is held is kept** (the coordinator, 24 Nov, on the review's F4). The Atlas's findings and the owner's pointers for
  the question exist nowhere else in the conversation; the core is one `load_protocol` call away. So the core goes in a
  result only beside all of it.

The red team by Fable (24 Nov, 01:45 UTC) of 413a's draft wording and measurement: all six findings were taken. They are
why the model declares which claims each task covers (A), why a task that covers a claim is never only detail (B), why
`left_out` carries a claim's words and is matched by digest (C), why only two grounds for leaving a claim out are given
(D), why the request asks for the most specific sentence and always for the one that answers the question (E), and why
the AI's own menu, every ordinary account's, gets the fields too (F).

## What is built

**413a: the menu accounts for every claim** (`apps/research-mcp/src/claim-accounting.ts`). On an account that has it:

- `inspect` asks for "the points of it the person would act on, decide by or repeat as fact: usually 2 or 3" in place of
  "its main claims". The limit of five stays, so "2 or 3" is guidance.
- `register_plain_answer` lists the claims from 1 and signs that into the receipt (`first`), so the final check's message
  about claims left out counts as it did. The screen's instructions, the menu's shape and `menu_outline` name a task's
  `claims` (the claims it could confirm or correct, by number) and the menu's `left_out` (each claim no task covers, word
  for word, with why, at most 120 characters). One task may cover several claims only where its own result could show
  each of them wrong: the task that reads a study covers the claim, the search that finds the study does not.
- AskRigor's own plan (dev accounts): the same rubric with one paragraph at the end of step 3
  (`2026-11-22.3+claims.2`) and the same output schema with both fields required. A plan is kept under its rubric's
  version, so a plan of the one is never served as a plan of the other. A plan names its claims by a SHA-256 of each, so a
  registration that keeps the hour's plan with other claims finds them again; a claim the plan does not know, and no task
  covers, is left out without a why. Where AskRigor made the plan, the registration and `inspect` say that the plan has
  accounted for the claims and is to be sent as given; nothing there asks the AI for a task or a `left_out` entry.
- `plan_research`: with a readable receipt, `accountForClaims` says where each registered claim stands: the tasks that
  declare it, or left out with its words and why, or neither. The menu's text lists those no task covers after the tasks
  ("Not on this plan, so not checked: ..."), or, where the tasks are ChatGPT's record for the answer, has the answer give
  them. `researchMenu.claims` and `next_step` carry it to an app that reads only the structured content, and a task that
  covers a claim counts as one that could change how sure the answer is, in every decision made from the menu. The menu's
  digest, AskRigor's mark and the "you decide" call keep the tasks as given.
- A later call for the same menu (its `menu_digest` names the same tasks) that declares no claim at all says nothing of any
  claim: no "Not on this plan" line, one problem that asks for the tasks' `claims` and `left_out` back, and no learn-mode
  choice when a detail task may have been recommended for a claim it covers. The ask's rule for the person's reply and the
  go-ahead name both, so that they are kept.
- A menu whose claims' numbers contain 0 is counted from 0, each number read one higher, and the problem says so; with the
  last claim's number beside the 0, none of its numbers is used, and the problem says that they start at 1.

What is exact and what is not: numbers in range, digests and places are checked, in any language. Which points a person
would act on, whether a task really covers a claim and whether a reason is a good one are the model's. Nothing refuses a
menu for either field, and a placeholder sent back unchanged reads as not given.

**412a: HRP's core at registration** (`apps/research-mcp/src/hrp-core.ts`). On an account that has it, the registration's
result carries `hrp_core` (runtime output only): the bytes `load_protocol` serves for section "core", through one join
for both, with its version, SHA-256, length in characters and last 60 characters (`ends_with`), the core's section names and
the names of every other section for research. One paragraph of its text says that they are the rules the research and its
answer are held to, to read all of them before the next call, to load the further sections the question needs in one
`load_protocol` call before the first search (after the person's answer, when the result says to ask first), and not to
load the core again unless what the AI sees does not end with `ends_with`; `next_step` says the same in short. Every app but
ChatGPT gets the core's bytes as the result's last text, raw, besides the structured content. Not for a plain look-up (lane
light or aside), and not when `later_inputs.hrpCoreHeld` gives the core's digest, which the handover asks for on a second
registration.

Where it goes: in the registration's result only when it fits beside everything AskRigor holds for the question. When it
doesn't and AskRigor planned the research, the registration says that it comes with plan_research's result or that that
result says to load it, its receipt signs so (`core`), and `plan_research`'s first menu (no `menu_digest`, no answer, no task
done) carries it, under the same size rules, with the `protocol_core` receipt `load_protocol` gives; a light menu gets none.
Otherwise a sentence says to load it first. `hrp_core_status` in both results' structured content says which: `here`,
`with_plan_research`, `load_it`, `already_held` or `not_for_this`.

Sizes: with the core, ChatGPT's result (text and structured content together) is at most 60,000 bytes; every other app's
structured content at most 49,000 characters (Claude Code takes 50,000 inline) and the whole result at most 150,000.
Measured on 24 Nov with the real functions, HRP 20.6.46's core of 39,995 bytes and an invented question (a research target
of 212 characters, three claims; "findings" are invented ones of about 680 bytes):

| Registration | App | Core alone: 0, 1, 2, 3 findings | Both switches: 0, 1, 2, 3 findings |
|---|---|---|---|
| no plan, dev account | ChatGPT | here 55,343, 58,109, 58,788, 59,465 | here 57,186, 59,952; load_it |
| no plan, ordinary account | ChatGPT | here 55,875, 58,641, 59,320, 59,997 | here 57,718; load_it |
| AskRigor's own plan, dev account | ChatGPT | here 54,685, 57,451, 58,130, 58,807 | here 54,815, 57,581, 58,260, 58,937 |
| no plan, dev account | other (structured) | here 46,646, 48,426; load_it | here 47,358; load_it |
| no plan, ordinary account | other | here 47,178, 48,958; load_it | here 47,890; load_it |
| AskRigor's own plan, dev account | other | here 47,548; with_plan_research | here 47,592; with_plan_research |

`plan_research`'s first menu, for AskRigor's own plan of five tasks on a dev account, without and with the core (core alone;
both switches add 130 to 290 bytes):

| The menu | ChatGPT | Other apps (structured) |
|---|---|---|
| goes on, nothing beside the menu | 7,470, here 52,622 | 3,161, here 47,060 |
| goes on, with what can stop the answer (dev accounts in production) | 11,934, here 57,086 | 6,023, load_it (49,922) |
| goes on, with that and the dossier's request | 21,181, load_it | 10,667, load_it |
| asks, nothing beside the menu | 13,284, here 58,436 | 5,836, load_it |
| asks, with what can stop the answer | 17,748, load_it | 8,698, load_it |

So what is held is never shortened for the core. For ChatGPT, the app of the test rounds, the registration of a planned
research carries both with three findings this long; `plan_research` has room in a round without the dossier's request that
goes on. Every other app's plan on a dev account ends with the sentence to load it, since what can stop the answer is in the
same result. The tool-list notice (398 bytes) is counted when an app's call brings it.

**Option c.** A registration that hands the core over signs the start of its SHA-256 (`hrp`) into the plain answer's
receipt; each receipt it may need is signed before the plan is made, and the result, the menu and AskRigor's mark use the
one that is true of it. `load_protocol` with HRP's section "core", alone or among others, gives a `protocol_core` receipt in
its text (its published result is unchanged), and how to say at registration that the core is held. `finalize_research`
adds one note when research shows neither: a note about the call, never a step, a limit or a line of the panel, and not
listed to the reader with the findings ledger on. It asks for no late load. A look-up AskRigor's own plan put in the light
lane gets no note, by the lane the draft's review looks up (an hour, in memory). A `protocol_core` receipt is no research:
it begins none and counts in no research count.

**P90: evidence one step away** (`apps/research-mcp/src/research-planner.ts`, `INDIRECT_RUBRIC_CHANGES`). Where
`ASKRIGOR_PLAN_INDIRECT` holds, the planner's rubric has three changes, in the red team's words: `about` says the nearest
meaning left out, or that none is, and never limits where evidence may come from; step 2 says the same; and in lane
research, when the call's own searches showed little or no direct evidence on an outcome the person asks about, the same
task, or one more within the step's limits, looks for the strongest evidence one step away and says that it is indirect. It
never displaces a task the person asked for, a serious risk's task or urgent safety work, and is left out when the person's
words confine the research. Off, the rubric is untouched. It combines with the claims' rule: each of the four combinations
is the rubric with only its own changes, under its own version (`+claims.2`, `+indirect.1`) and its own cache key, and
`lane()` finds the newest kept plan under any of them.

**The switches and the window** (`apps/research-mcp/src/research-trial.ts`). `ASKRIGOR_CLAIM_ACCOUNTING`,
`ASKRIGOR_HRP_CORE` and `ASKRIGOR_PLAN_INDIRECT`, each off (the default, and any other value), trial, dev or on. In mode
trial a switch holds for a dev account only while its test window has it on: `set_research_trial` (a runtime action, dev
accounts only) with `later_inputs.researchTrial` {claimAccounting, hrpCore, indirectEvidence, minutes}, 1 to 120 whole
minutes from now and never more than 120 after the window began; 0 ends it. In this process's memory only, under the
account's digest; a restart clears it, and `inspect` says nothing of it.

Off compared: 3,192 calls (`inspect`, registrations, menus with their answers, re-plans and "you decide" calls, protocol
pages and final checks; ChatGPT and another app; a dev and an ordinary account; the three styles; AskRigor's planning call in
each of its outcomes and off) gave the same bytes on main (ba0820ab) and on this branch, with the three switches unset, off
and in trial with no window, but for the tokens finalize_research draws at random in every call, which differ between two
runs of main too. Unlike main, an error that lists the known actions or later inputs lists the new ones, `set_research_trial`
is an action, and `hrpCoreHeld` is read for nothing where it was refused as unknown.

Tests: `tests/claim-accounting.test.ts`, `tests/research-trial.test.ts`, `tests/hrp-core.test.ts`,
`tests/finalize-hrp-core.test.ts`, `tests/indirect-evidence.test.ts`. One existing test changed: `tests/later-inputs.test.ts`
lists the two new later inputs.

## The measurement still to do, before any release question

In place of the larger plan of 24 Nov, the review's smallest set. The new questions were fixed before any arm ran; the
owner's test and timing questions are development data.

**What the owner's ChatGPT tests.** It is a dev account with the planner on, so its runs use AskRigor's own plan
(`CLAIMS_RUBRIC`), not the texts every other account gets (`CLAIMS_AT_THE_SCREEN`, the menu's shape). Either the planner is
paused (`pause_research_planner`) for the arm that stands for the public, or the release question says which path was tested.

**413a.**
- Offline, on plan workers, no API: the 12 new questions, old against new texts served as real tool results, 3 repeats, and
  old against old for the noise. By code: claims registered, each claim's place, the share covered by a task the real
  recommendation picks at the default time, registrations the real validator accepts. One blind judge: the share of claims
  a person would act on, omission recall, and whether the declared task could really show the claim wrong.
- In ChatGPT: 3 questions, off and on, 6 runs to the final note under "you decide", counting "did not check" lines, the only
  measure of what the owner complained about. It decides only together with the offline numbers, with the same direction in
  3 of 3. If the natural arm's quick answers get vaguer, the release question is held.

**412a.**
- 5 runs: the owner's case and one new health question with thin evidence, each before and after, and one repeat of the case
  "before", for the run-to-run noise.
- Exact, from the call record and the results: `hrp_core_status`, the further sections loaded, which, and before which step.
  Judged blind, in pairs: the case's own conditions, and for the second question which answer keeps the named HRP rules better.
- Offline only: the result's size with both switches on, and the cost on a look-up and a non-health question.

**P90.** Offline, the rubric with and without it through plan workers on the real bundle, 3 repeats, and old against old (the
planner's own search runs on the API, so this is a proxy and the write-up says so). Questions by kind: direct evidence thin;
plentiful, where nothing should be added; a look-up; an emergency; tasks the person named; a person who confines the route;
non-health; and two regression questions where step 2 rightly asks which thing is meant. By code: the number of tasks, the
lane, a question or none, `person_asked` tasks kept, `about` under 60 words, claims accounted for. One blind judge: does
`about` put any evidence out of bounds; does a task reach indirect evidence in people on the asked outcome and say it is
indirect; was a people's-reports, premise, serious-risk or claim task displaced. Bar: thin cases get the indirect reach in at
least 80%, the baseline shown; plentiful cases gain no task in at least 80%; lane and step 2 unchanged outside the noise; no
protected task displaced. The owner's case comes last, end to end, as development data.

**What makes a result worthless.**
- Effort or model differs between the arms: the setting on screen is recorded before each run, and the arms' order alternates.
- ChatGPT's memory carries one run into the next: temporary chats, or memory off.
- The window ends during a run, or the server restarts: check `researchMenu.claims` or `hrp_core_status` in each run's results.
- P90's switch, or any release, lands between "before" and "after".
- Wrong lines, contradictory instructions, or near findings dropped in one arm only (the review's F1 to F4, fixed here).
- The planner's hour: within an hour the 412a arms of one question share one plan (a useful control; say so), while the 413a
  and P90 arms never do (another rubric key), which adds the planner's noise to that comparison.
- Failed tool calls in one arm: count them.
- The core cut short in the app: ask the AI to quote its last line in the first run, and compare it with `ends_with`.

Dropped from the earlier plan: GPT through `codex exec` (it has the plugin's skill text, so it is not plain ChatGPT);
the selection-only arm, unless the natural arm improves while quick answers get shorter; the "both switches together" cell in
ChatGPT (offline, for size); French and Japanese in ChatGPT (offline only); "left_out reasons judged concrete by both
judges"; the 14 timing questions as arms.

## What is not done

- No measurement has run: that the wording changes what ChatGPT does, that fewer "did not check" lines follow, that the core
  improves answers and that P90's rule fixes its kind of miss without growing other plans are all unproven.
- No release, server setting, migration, tool-list change, roadmap line or release record.
- Not measured: how each app shows a result this large (the review's F5 and F6). One live call per app before `dev` or `on`.
- Recorded by the review, not changed: a second registration that says the core is held signs no digest, so without the
  earlier receipt the note is given (F8); the hour's plan does not know a claim added on a second registration, which is then
  said to be not on the plan (F9); a claim whose only task the person gives no time has no line of its own on a go-ahead,
  and only the final note says it was not checked (F10).
- A later call that keeps `left_out` but drops the tasks' `claims`, or the reverse, is read as it stands: only a call that
  declares no claim at all is known to have dropped them.
- The light lane the final check reads is the hour's, in memory: after a restart, or an hour, the note is given to a look-up.
- Whether the AI read the core it was given is not checked; the note says only what a receipt shows.
- Not combined with the public runner, the Custom GPT's Actions or Gemini's catalog, which have no plain-answer
  registration.
