# A test round's pause of the planning call, and the clean comparison it allows (21 Nov 2026)

Owner answer 395b (21 Nov 2026, typed in chat at 13:25 UTC): "Build the pause switch for test rounds and run the clean
comparison (release needs your yes)." The measurement of 21 Nov (owner-pages
`askrigor/planner-measurement/2026-11-21-report.md`) compared the planning call with a test round a week older and
with the owner's own chats from before 13 Nov, which asked other questions. Neither "without" side was clean, and
nothing could switch the call off for one account without a production setting change.

Status (21 Nov): built on `claude/planner-pause-20261121` (first commit 81d9ba5e at 14:42 UTC; the reviews' fixes
after it), not released. The release needs the owner's yes; the comparison runs only after it. Reviews:
`/home/joel/askrigor-releases/20261121-planner-measurement/pause-review/` (Codex: fix first, three races and the
renewal; Fable: say nothing of the pause in `inspect`, and four lines for the round's procedure). All are built.
Codex's recheck of the fixes found no P1 and two P2s (a cleanup timer per account, a pre-pause menu's light lane),
fixed after it with tests, not rechecked again (one repair, one recheck).

## What is built

- `pause_research_planner`, a runtime-only action of `manage_research_access` (the published tool list is unchanged,
  owner answer 189a), with `later_inputs.pauseMinutes`: whole minutes from now, 1 to 120, or 0 to end the pause.
  Only a dev account, only its own call, only while the call is on (`dev_account_required`, `planner_off`).
- While it runs, the account goes as with the call off (`activePlanner` in
  `apps/research-mcp/src/research-contributor-access-tool.ts`): no planning call at registration, no request for the
  person's words at `inspect`, no learn mode in `plan_research`'s menu, and no plan's lane at the final check
  (`research-planner.ts`, `plan` and `lane`). The review of a draft still runs, from the research target alone unless
  the AI passes the person's words: that is what the account gets with the call off.
- Starting a pause forgets what the hour kept of the account's plans and lanes, and registrations are numbered in
  the order they begin, so a "without" chat never takes the "with" chat's plan for the same words, during or after
  the pause, even at a final check that waits on a plan still being made. A call already running when it began still
  answers its own registration, and keeps no lane; a light lane in a menu handed over before the pause isn't honoured
  while it runs.
- Set again while it runs, a pause keeps its start and ends at most two hours after it.
- `inspect` says nothing of a pause, since every AI calls it before research. The pause's own result gives its end
  (`plannerPausedUntil`), and the owner's account page says the call is paused and until when.
- In process memory only, by the account's digest, until an hour after the pause's end; a restart ends every
  pause. Learn mode's setting can still be changed during a pause.
- Tests: `tests/research-planner.test.ts`, "a test round's pause of the planning call (owner answer 395b)".
- Docs: `docs/research-contributor-access.md`, `docs/privacy-data-map.md`, `docs/design-decisions.md`.

## The clean comparison, after the release

The owner's five test questions (the 21 Nov measurement's), both ways, twice: about 20 runs on his ChatGPT Extra
High quota, in his ChatGPT in the built-in browser, card saving off for the round as usual.

1. Tell the owner in the Inbox before a "without" window starts and when it ends: his own research in it goes
   without plans. Keep the windows away from the scheduled checks at 08:35 and 09:20 UTC.
2. One arm, five chats. Order alternates between rounds (round 1 with, then without; round 2 without, then with),
   since ChatGPT's memory carries test replies into later chats.
3. The "without" arm: `pause_research_planner` from the session's own AskRigor connector, with `pauseMinutes` long
   enough for its five chats (at most 120); its result gives the end. Then the five chats, then `pauseMinutes` 0.
4. No switch (a pause set or ended) until every chat of the arm before it has passed its final check: a "with" chat
   still working would lose its plan's lane.
5. After each arm, read the call record (`list_calls`) and note, per chat, a plan's lane or none. A "with" chat
   shows one and a "without" chat shows none; a chat that doesn't match its arm is thrown out and run again. If the
   ChatGPT chats don't appear in that record, stop: the pause was set on another account.
6. Each "with" chat needs a new planning call, since a pause forgets the plans before it. The owner's account gets
   10 new calls a day by default (`ASKRIGOR_RESEARCH_PLANNER_ACCOUNT_DAILY_CALLS`), shared with his own research:
   one round a UTC day. A "with" chat whose plan was not used (`research_plan_not_used`, the day's limit for
   example) counts in neither arm and is run again, on another day if need be, marked as such.
7. Judge each answer with its arm hidden, as the 21 Nov measurement did: read the way he meant, questions he didn't
   need, minutes, and his wanted answers. Report refusals or softened answers.
8. Report per round, with which arm came first, and show the spread between the two runs of the same arm beside the
   difference between the arms: one question's difference is within what ChatGPT varies from chat to chat. Say in
   the result that the review of a draft reads his words only in the "with" arm, so part of any gain may come from
   that.

What the comparison still cannot separate: ChatGPT's own variation from chat to chat (two rounds of five), and the
owner's own research during a "without" window, which goes without plans too.

## Release

Build `263048eb` plus this branch, after AskRigor#501 lands (rebase first). No setting, migration or tool-list change.
The release record says the action exists and that nothing changes for an account until a session pauses it.
Rollback: the previous image; a running pause ends with the restart.
