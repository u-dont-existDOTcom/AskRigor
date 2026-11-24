# The menu accounts for the quick answer's claims, and HRP's core handed over at registration (24 Nov 2026)

Owner answers 413a and 412a (24 Nov 2026). Two changes to research, built in one branch because both touch the same
registration texts, each behind a switch of its own, so a test round can tell their effects apart: the baseline, then
413a's wording, then 412a's core as well.

Status (24 Nov): built on `claude/claims-and-core-20261124` (stacked on #519, 413a's display half), switches off, not
released. The release needs the measurement below and the owner's yes.

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

A red team by Fable (24 Nov, 01:45 UTC) of 413a's draft wording and measurement: all six findings were taken. They are
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
  for word, with why, at most 120 characters).
- AskRigor's own plan (dev accounts): the same rubric with one paragraph at the end of step 3
  (`2026-11-22.3+claims.1`) and the same output schema with both fields required. A plan is kept under its rubric's
  version, so a plan of the one is never served as a plan of the other; `lane()` finds the newest kept under either. A
  plan names its claims by a SHA-256 of each, so a registration that keeps the hour's plan with other claims finds them
  again; a claim the plan does not know, and no task covers, is left out without a why.
- `plan_research`: with a readable receipt, `accountForClaims` says where each registered claim stands: the tasks that
  declare it, or left out with its words and why, or neither. The menu's text lists those no task covers after the tasks
  ("Not on this plan, so not checked: ..."), `researchMenu.claims` and `next_step` carry it to an app that reads only the
  structured content, and a task that covers a claim counts as one that could change how sure the answer is, in every
  decision made from the menu. The menu's digest, AskRigor's mark and the "you decide" call keep the tasks as given.

What is exact and what is not: numbers in range, digests and places are checked, in any language. Which points a person
would act on, whether a task really covers a claim and whether a reason is a good one are the model's. Nothing refuses a
menu for either field, and a placeholder sent back unchanged reads as not given.

**412a: HRP's core at registration** (`apps/research-mcp/src/hrp-core.ts`). On an account that has it, the registration's
result carries `hrp_core` (runtime output only): the bytes `load_protocol` serves for section "core", through one join
for both, with its version, SHA-256, the core's section names and the names of every other section for research. One
paragraph of its text and one sentence of `next_step` say where it is, to read it before the first search and follow it,
not to load it again, and to load a further section by name before the step that uses it. Every app but ChatGPT gets the
core's bytes as the result's last text, raw, besides the structured content. Not for a plain look-up (lane light or
aside), and not when `later_inputs.hrpCoreHeld` gives the core's digest, which the handover asks for on a second
registration.

Sizes: the result's usual 40,000 bytes cannot hold a core of 39,995. With it, ChatGPT's result (text and structured content
together) is at most 60,000 bytes; every other app's structured content at most 49,000 characters (Claude Code takes
50,000 inline) and the whole result at most 150,000. The variants are tried in order: what AskRigor holds for the
question whole, then less of it, then none, each with the core; then the same without the core, with a sentence to load
it first. Measured on 24 Nov with the real functions, the real core of HRP 20.6.46 and an invented question (a research
target of 212 characters, three claims): with the core, ChatGPT's result is 54,300 to 56,700 bytes, and 58,200 to 60,000
with the Atlas's three findings held for the question (all three shown, or two for an ordinary account with both switches
on); every other app's structured content is 46,400 to 47,800 characters and the whole result 101,400 to 107,800 bytes,
with room for none to two of those three findings, and for none with AskRigor's own plan. So for every app but ChatGPT
what the Atlas holds usually gives way to the core. The pull request has the table.

**Option c.** A registration that hands the core over signs the start of its SHA-256 (`hrp`) into the plain answer's
receipt; both receipts are signed before the plan is made, and the result, the menu and AskRigor's mark use the one that
is true of it. `load_protocol` with HRP's section "core", alone or among others, gives a `protocol_core` receipt in its text
(its published result is unchanged), and how to say at registration that the core is held. `finalize_research` adds one
note when research shows neither: a note about the call, never a step, a limit or a line of the panel, and not listed to
the reader with the findings ledger on. A `protocol_core` receipt is no research: it begins none and counts in no research
count.

**The switches and the window** (`apps/research-mcp/src/research-trial.ts`). `ASKRIGOR_CLAIM_ACCOUNTING` and
`ASKRIGOR_HRP_CORE`, each off (the default, and any other value), trial, dev or on. In mode trial a switch holds for a dev
account only while its test window has it on: `set_research_trial` (a runtime action, dev accounts only) with
`later_inputs.researchTrial` {claimAccounting, hrpCore, minutes}, 1 to 120 whole minutes from now and never more than 120
after the window began; 0 ends it. In this process's memory only, under the account's digest; a restart clears it, and
`inspect` says nothing of it. With both switches off every text and result is as before: 1,640 calls (`inspect`,
registrations, menus, protocol pages and final checks, both kinds of app, with AskRigor's planning call and without it)
gave the same bytes on ef980488 and on this branch, off and in mode trial with no window, but for four that name the new
things themselves: an error that lists the known actions or later inputs now lists the new ones, `set_research_trial` is
an action, and a later input `hrpCoreHeld` is read for nothing where it was refused as unknown.

Tests: `tests/claim-accounting.test.ts`, `tests/research-trial.test.ts`, `tests/hrp-core.test.ts`,
`tests/finalize-hrp-core.test.ts`. One existing test changed: `tests/later-inputs.test.ts` lists the two new later inputs.

## The measurement still to do, before any release question

413a, as the red team asked (its section 2):

- **Arms:** the old wording against the new for the registration request and its result, as tool results generated by the
  real functions with the frozen tool description in view; the AI's own menu as an arm; the planner's old rubric against
  the new (lane and search runs again, not only the new judgment). Claude through `claude -p` and GPT through
  `codex exec`, on the plans, no API; at least 3 repeats per question and arm.
- **Controls:** an old-against-old pair first, for the noise; a selection-only arm (claims picked from quick answers written
  once under the old wording) beside the natural one; omission recall (the important checkable sentences left
  unregistered); a check that quick answers do not get vaguer or shorter; judges from both companies, blind to the arm,
  one claim at a time.
- **Questions:** the owner's test questions and timing questions (development data), and a small set written before any
  output is seen: non-health, purely factual, a one-fact look-up, two or three premises, an emergency, a person who names
  tasks, two other languages, one in a non-Latin script.
- **Bar:** median claims at most 3 (shown beside the baseline's spread) and no rise in one-point answers padded to 2;
  claims a person would not act on cut by at least half outside the noise; omission recall not below baseline and the
  most specific checkable sentence registered at least as often; no fall in premise first, and no premise verdict ever in
  `left_out`; every claim accounted for on every menu; `left_out` at most about a third, each reason judged concrete by
  both judges in at least 80%; claims covered by a recommended task up outside the noise (the number that predicts fewer
  "did not check" lines); declared coverage judged true in at least 85%; menus: median tasks up by at most one, lanes
  unchanged, protected tasks kept.
- **Then** a few real runs through to the final note, counting "did not check" lines before and after, and a spot check in
  the owner's ChatGPT behind the switch. If the natural arm's quick answers get vaguer, the release question is held.

412a: the owner's ChatGPT, the same questions with the window's `hrpCore` off and on (and 413a's on for the second step),
answers judged with the arm hidden; how often the note is given is the count option c asks for. The order is the
baseline, 413a, then 412a, so 412a alone is never measured unless the fourth arm is added; the release question says so.

## What is not done

- No measurement has run: that the wording changes what ChatGPT does is unproven, and that fewer "did not check" lines
  follow from it is too.
- No release, server setting, migration, tool-list change, roadmap line or release record.
- A result that carries the core has little room for what AskRigor holds for the question (above), and nothing gives it
  later; whether that costs answers is for the test round to see.
- Whether the AI read the core it was given is not checked; the note says only what a receipt shows.
- Not combined with the public runner, the Custom GPT's Actions or Gemini's catalog, which have no plain-answer
  registration.
