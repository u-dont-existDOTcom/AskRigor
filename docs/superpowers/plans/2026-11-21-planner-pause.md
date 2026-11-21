# A test round's pause of the planning call, and the clean comparison it allows (21 Nov 2026)

Owner answer 395b (21 Nov 2026, typed in chat at 13:25 UTC): "Build the pause switch for test rounds and run the clean
comparison (release needs your yes)." The measurement of 21 Nov (owner-pages
`askrigor/planner-measurement/2026-11-21-report.md`) compared the planning call with a test round a week older and
with the owner's own chats from before 13 Nov, which asked other questions. Neither "without" side was clean, and
nothing could switch the call off for one account without a production setting change.

Status (21 Nov, 14:45 UTC): built on `claude/planner-pause-20261121`, not released. The release needs the owner's yes;
the comparison runs only after it.

## What is built

- `pause_research_planner`, a runtime-only action of `manage_research_access` (the published tool list is unchanged,
  owner answer 189a), with `later_inputs.pauseMinutes`: whole minutes from now, 1 to 120, or 0 to end the pause.
  Only a dev account, only its own call, only while the call is on (`dev_account_required`, `planner_off`).
- While it runs, the account goes as with the call off (`activePlanner` in
  `apps/research-mcp/src/research-contributor-access-tool.ts`): no planning call at registration, no request for the
  person's words at `inspect`, no learn mode in `plan_research`'s menu, and no plan's lane at the final check
  (`research-planner.ts`, `plan` and `lane`). The review of a draft still runs, from the research target alone unless
  the AI passes the person's words: that is what the account gets with the call off.
- Starting a pause forgets what the hour kept of the account's plans and lanes, so a "without" chat never takes the
  "with" chat's plan for the same words, during or after the pause. A call already running when it began still
  answers its own registration, and keeps no lane.
- `inspect` says the call is paused and until when, without naming the action (so the person's own AI is never
  invited to end it), and `plannerPausedUntil` gives the time.
- In process memory only, by the account's digest; a restart ends every pause. Learn mode's setting can still be
  changed during a pause.
- Tests: `tests/research-planner.test.ts`, "a test round's pause of the planning call (owner answer 395b)".
- Docs: `docs/research-contributor-access.md`, `docs/privacy-data-map.md`, `docs/design-decisions.md`.

## The clean comparison, after the release

The owner's five test questions (the 21 Nov measurement's), both ways, twice: about 20 runs on his ChatGPT Extra
High quota, in his ChatGPT in the built-in browser, card saving off for the round as usual.

1. Before each round: `manage_research_access` `inspect` from the session's own AskRigor connector (the owner's
   account): the call is on, no pause runs.
2. One arm, five chats. Order alternates between rounds (round 1 with, then without; round 2 without, then with),
   since ChatGPT's memory carries test replies into later chats.
3. The "without" arm: `pause_research_planner` with `pauseMinutes` long enough for its five chats (at most 120),
   `inspect` to confirm the pause and its end, the five chats, `inspect` again (a restart ends the pause: a chat run
   without it is run again), then `pauseMinutes` 0.
4. Each "with" chat needs a new planning call, since a pause forgets the plans before it. The owner's account gets
   10 new calls a day by default (`ASKRIGOR_RESEARCH_PLANNER_ACCOUNT_DAILY_CALLS`), shared with his own research:
   one round a UTC day, or a "with" chat whose call was refused for the day's limit is run again the next day.
5. Judge each answer as the 21 Nov measurement did: read the way he meant, needless questions, minutes, and his
   wanted answers; report refusals or softened answers.

What the comparison still cannot separate: ChatGPT's own variation from chat to chat (two rounds of five), and the
owner's own research during a "without" window, which goes without plans too.

## Release

Build `263048eb` plus this branch, after AskRigor#501 lands (rebase first). No setting, migration or tool-list change.
The release record says the action exists and that nothing changes for an account until a session pauses it.
Rollback: the previous image; a running pause ends with the restart.
