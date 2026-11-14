# Production release, 2026-11-14 (a follow-up that says to go on is not asked again for the menu's length)

- **Owner decision:** owner answer 304a. The owner reported on 14 Nov 2026 at 00:54 UTC (AskRigor#457) that a follow-up
  telling the AI to continue digging still got the menu question. Question 304, option a: "when your latest message
  tells the AI to go on, continue or dig deeper, and the plan has no question for you, the research goes on with the
  recommended tasks without asking. The planning call judges whether your message says that. A first question still
  follows the 10-minute rule. The cost: a follow-up can then run longer than 10 minutes before you hear back." The
  owner chose a in the Inbox on 14 Nov at 10:05 UTC and typed "304a" in chat, in the session that released, on 14 Nov
  at 20:36 UTC ("304a 305b but check note there"). The release waited for that: it changes the owner's 10-minute rule
  of 10 November (owner answer 284) for that one case.
- **Contents:** #462, after #461's merge:
  - `350dd566`: the release record of #461.
  - `e7382e2b`: the change. When the AI passes on more than one of the person's messages, AskRigor's planning call
    gets the newest one a second time (`latest_message`) and says whether it tells the AI to go on
    (`person_said_go_on`, rubric 2026-11-14.3). The plan's menu then carries a signed mark (`go_on_asked`) over its
    tasks as handed over and the plain answer's receipt. `plan_research` goes on without asking only for a balanced
    account, a plan with no question, no re-plan, the registered research target, a dev account while the planning
    call is on, and a mark that matches; it says so in its text and `next_step` (`went_on_as_asked`). Guided
    research, a plan with a question, a first question over 10 minutes, one text in place of a list, and a changed
    menu ask as before.

  The tool list is unchanged (35 tools). No migration, role script, compose, privacy-notice or settings change:
  `runtime.env` changes its build line only. The site was not released.
- **Before deploying:**
  - `npm run verify`, Node 24.18.0, on the commit's tree: the typecheck, 6,715 tests passed and 6 skipped, and the
    build. Hosted checks on `e7382e2b`: all seven passed (the last, Deterministic verification, at 11:22 UTC). The
    private-map check on the merged range (three commits against 40 maps) found nothing to refuse.
  - Review: Codex, read-only (the kit's `codex-review-462.md`). No defect in the rule itself, the mark's insertion,
    the schemas or the tests. Five findings, all fixed before the commit, each with a regression test: the mark
    covered only each task's kind, what it could change and its loop, so a swapped or lengthened task kept it (it now
    covers the task's text, sources and minutes too); a list's cache key could equal a pair of research target and
    likely question; `lane()` could read the older of two plans for one research target; an account taken off the dev
    list, or a planner switched off, still had its mark honoured; a corrected menu lost its mark. Codex also wrote
    the tests, in two passes (25 new tests). Greptile: no review ran and none was asked for (the owner's credit rule
    of 13 Nov).
  - Plan workers (free), 84 runs, then the API from the laptop: 26 planning calls, USD 2.15. On the API one plan made
    after "keep digging" ran no web search until the rubric said the newest message never replaces the search (then
    eight of eight searched), and two of this build's own wordings sent "research it fully" after a light look-up
    back to the light lane (both removed). The record is in `docs/superpowers/plans/2026-11-09-research-steering.md`.
  - `npm run lessons:status` was run after the release, at 20:54:54 UTC, not before it: open 50; needs review 13;
    accepted but not incorporated 1; incorporated or closed 41; deletion eligible 2. The issue lists were read before
    the merge, at 20:38 UTC: no bug report newer than AskRigor#459 and no lesson candidate newer than
    AskRigor-lessons#68.
- **Source:** #462 merged at 20:39:40 UTC as `006e0cbe87a07309d3d4a9ec389d67c8d362c011`, whose tree equals the pull
  request head's (`e7382e2b`); `main` had not moved since #461, and another agent's #460 was still open. Source
  archive `askrigor-006e0cbe87a07309d3d4a9ec389d67c8d362c011.tar.gz`, SHA-256
  `460d06535002dfafa53ade9d0ce76cf32891d6d2cbe3e7589975c1e53fb20db7`.
- **Image:** built from that archive at 20:39:56 to 20:41:04 UTC; id
  `sha256:3f9b178798793ba6451698f5a266e759e74112f527e6945fbdefcbd3833cf4ca`, user `node`, workdir `/app`; the candidate
  started, answered `/healthz` and `/version` and was removed; image archive 122,394,345 bytes, SHA-256
  `0096e7368f55d7e2779f8abb14e3979169018a31bd69db417a7fca83ebe3f327`.
- **Prior state (stage A):** (20:42:23 UTC) research-mcp on `17aed018`, healthy; the promotion timer enabled; the
  compose overlay and the two role scripts on the host are reviewed versions; `runtime.env` 90 names, the planner's
  six lines, no judge line; 62 GB free. Read at 20:43:31 UTC, before stage B: the planner's and the review's state
  files had last changed 621 and 524 minutes earlier (14 Nov: USD 0.66 and USD 0.61, one account); the call record
  held 5,330 rows; its two newest calls were this session's own reads at 20:40 UTC and the one before them was at
  12:01:28 UTC, so no research was in progress.
- **Stage B:** (20:43:43 to 20:44:30 UTC) the role scripts and the overlay on the host equal reviewed versions; the
  merged service's mounts are as expected; the image archive verified and loaded (the id above); the forum reader's
  self-test passed; the timer stopped; a dump of 18,020,612 bytes (SHA-256 `56f359e67d116272`...); migrate complete
  with nothing new to apply (`0035_research_menu_learning` recorded once, with its file's hash); both role scripts
  run from the release's bytes, the same files as before (36 and 15 functions); the boundaries from the catalog as at
  #461's release; learn mode's table: the reader cannot read it and PUBLIC cannot read it; it held one row and one
  account had learn mode on (the owner turned it on during the day). The prior image tagged
  `askrigor-research:rollback-pre-006e0cbe87a0` and the prior files kept under
  `/opt/askrigor/rollbacks/pre-006e0cbe87a07309d3d4a9ec389d67c8d362c011` (both read back on the host at 20:54:51
  UTC: the tag names the image of `17aed018`, and the kept selector and `runtime.env` name that build);
  `runtime.env` 90 names, the build line changed and nothing else; the overlay installed again with the same bytes;
  research-mcp recreated and started at **20:44:21 UTC**, healthy; the planner, from the service's own settings:
  enabled, USD 3 a day, 20 new plans a day for an account; the review: enabled, USD 3 a day, 20 reviews a day for
  an account; the planner's state read back: 14 Nov, USD 0.66 spent, one account counted.
- **Stage C:** (20:44:30 to 20:45:21 UTC) `/version` names build `006e0cbe`, HRP 20.6.41 and Universal 20.5.46; the
  live `/mcp` lists 35 tools and equals the frozen fixture; the three tool-list versions equal their fixtures; the
  in-image probes passed. The log differs from #461's in hashes, dates and times, and in one figure: the forum
  reader's thread probe read 28 of the thread's 195 comments (15 at #461's release, 96 at #453's; `state=read` each
  time).
- **Promotion:** the one-shot service found nothing pending; the timer was enabled again at 20:45:21 UTC.
- **The site:** not released. **Plugin:** receipt unchanged (0 of the 8 packaged files changed; the two installed
  copies equal the merge's).
- **Connector probe (Codex's AskRigor app, the owner's account), with two real plans:** (20:48:03 to 20:50:04 UTC)
  35 tools, build `006e0cbe`, HRP 20.6.41, no out-of-date sentence. Eight calls, AskRigor's tools only.
  - `inspect`: active, balanced, checking back after 10 minutes; "Learn mode is on for this account: AskRigor keeps 1
    of its menu choices"; the sentence on the person's words now ends "with more than one message, give the list".
  - A registration with the person's words as a list, "does a coffee an hour before bed keep you from falling
    asleep?" and then "keep digging": 13.3 seconds, lane `research`, no question, one search, five tasks,
    `person_said_go_on` true, and the menu carries the mark.
  - `plan_research` with that menu unchanged: `go_on`, recommended 4 to 16 minutes, `went_on_as_asked` true, and both
    its text and `next_step` say "AskRigor did not ask first".
  - The same menu with the mark's last character changed: `ask`, no `went_on_as_asked`.
  - The same words as one text ("... falling asleep? keep digging"): 6.8 seconds, no `person_said_go_on`, no mark,
    and `plan_research` answers `ask`.
  - Read on the host at 20:51:36 UTC: the planner's state: USD 0.75 for 12 plans on 14 Nov; the review's: USD 0.61
    for five reviews; the service's log has one line and none naming a failure. `research_menu_choices` held two
    rows: the second was kept at 20:49:30 UTC by a `plan_research` call that carried a person's answer, from another
    client of the same account on the ChatGPT route (an `inspect` at 20:49:15 UTC, that call, then research calls
    from 20:49:46 UTC on). The probe's own three `plan_research` calls carried no answer (read from its record of
    tool calls), so the probe kept nothing. All of the day's calls, from Codex's app, ChatGPT and this session's
    Claude connector, are under one account.
- **Seen during the release, not caused by it:** a first Atlas lookup at 20:43:41 UTC, before stage B, answered
  `partial` because the stored-plans catalog query failed (`living_evidence_repository_error`, retryable); the same
  lookup at 20:49:00 UTC answered `complete`. Four Europe PMC searches of that other client were refused at 20:51:11
  UTC with `europe_pmc_upstream_unavailable`; stage C's Europe PMC search had passed at 20:44 UTC and Europe PMC
  answered from the laptop at 20:54 UTC.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-006e0cbe87a0` (the image of `17aed018`),
  restore `runtime.env` from `/opt/askrigor/rollbacks/pre-006e0cbe87a07309d3d4a9ec389d67c8d362c011` and recreate
  research-mcp. Nothing else changed on the host. A menu the newer build signed carries a `go_on_asked` value the
  earlier build ignores, so such a menu asks again.
- **Not in this release:** every account (the planning call runs only for dev accounts); "research it fully" after a
  light look-up coming back as another light look-up (one of four paid runs with this build's rubric; first on the
  next build's list); the two things seen during the release (a retry for the stored-plans catalog query, and what
  four Europe PMC searches sent together do); the final check's own first-pass limit, as vague as the drafts #458
  describes; AskRigor#459 (two species treated as one); the light go-ahead's menu line; the seventh defect of the
  blind replay; a test in the owner's own ChatGPT (the owner's own research started on this build at 20:49 UTC).
