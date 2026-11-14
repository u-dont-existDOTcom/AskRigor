# Production release, 2026-11-14 (learn mode for a person's own menu choices; the plan's lane in the call record; no step-aside without a web search)

- **Owner decision:** learn mode is owner answer 303a. The owner asked for it in chat on 13 Nov 2026 at 21:46 UTC ("can
  we also learn from users menu choices (especially if they give reasons), and let users turn on learn mode for their
  own menu choices?"), chose option a in the Inbox on 14 Nov at 02:18 UTC ("learn mode on your account now, inside the
  week's trial. It keeps your own choices and reasons and nothing of anyone else's.") and typed "303a" in chat, in the
  session that released, on 14 Nov at 10:07 UTC ("303a inbox"). The release waited for that: it keeps something new
  about a person. The lane in the call record and the step-aside guard carry no tradeoff and went out with it under
  the owner's standing permission of 12 Nov 2026.
- **Contents:** #461, after #453's merge:
  - `fd204aa0`: the release record of #453. `afb8a349`: 14 Nov named as a date whose releases change nothing people
    would notice, in the comment the public "What's new" page keeps for such dates.
  - `75654d2d`: learn mode. A switch on the account (`research_use_accounts.learn_menu_choices`, off by default),
    turned on only on a dev account while AskRigor's own planning call is on, and turned off for any account in any
    state, which deletes what was kept. While it is on, each `plan_research` call that carries the person's answer
    keeps one row in `research_menu_choices`: the lane, whether it was "you decide", each task's kind, what it could
    change, whether it was recommended and the minutes given, and the person's reason in their own words (cleaned, at
    most 300 characters); the newest 20; no task wording, no research target, no answer. The planning call reads them
    as `menu_history` (rubric 2026-11-14.2). The call record keeps the lane the plan gave a `register_plain_answer`
    call (`plan_lane`), and `list_calls` shows it. AskRigor does not step aside on a plan made without a web search.

  The tool list is unchanged (35 tools). One migration, `0035_research_menu_learning`, and the access role's script
  (INSERT, SELECT and DELETE on the new table; UPDATE on the new column). No compose, privacy-notice or settings
  change: `runtime.env` changes its build line only. One site file changed by a comment line and the site was not
  released.
- **Before deploying:**
  - `npm run lessons:status` at 10:12:17 UTC: open 50; needs review 13; accepted but not incorporated 1; incorporated
    or closed 41; deletion eligible 2. No bug report or lesson candidate newer than those of #453's record.
  - `npm run verify`, Node 24.18.0, on the commit's tree: the typecheck, 6,690 tests passed and 6 skipped (366
    files, and one skipped), and the build. Hosted checks on `75654d2d`: Deterministic verification, workflow-policy,
    CodeQL and its four analyses, all passed. The private-map check on the merged range (four commits against
    40 maps) found nothing to refuse.
  - `npm run contributor-access:postgres-acceptance` on a real Postgres: PASS, with six answers kept at once (the
    newest 20 stay 20) and "off" after a revoke. Its first start failed on the database container's own start-up
    race; the second run passed.
  - Review: Codex, read-only, on the uncommitted change (the kit's `codex-review-461.md`). No defect in the grants,
    the role script, the aside guards, the call record's lane, the schemas or the added tests. Six findings, all
    fixed before the commit: "off" was refused for a revoked account; two answers at the same moment could leave 21
    rows; a correction echoed the person's raw reason; a reason of 301 characters refused the menu on any account;
    "you decide" was misread when a task had a zero-minute estimate; minutes were cut at 240. Left as it is: the
    migration validates a CHECK on the call record under a lock, as 0034 did (5,234 rows at the release). Greptile:
    no review ran and none was asked for (the owner's credit rule of 13 Nov).
  - Plan workers (free) with written histories, then the API from the laptop: 13 planning calls, USD 0.73. With a
    history of skipped forum tasks the call ran no web search, three runs of three, until the rubric said the history
    never replaces the search (then five of five); it then dropped the forum task, until the rubric said to keep such
    a task last, marked as detail (two of two). The record is in
    `docs/superpowers/plans/2026-11-09-research-steering.md`.
- **Source:** #461 merged at 10:10:50 UTC as `17aed0188b762b4091edf1b3ffafb821aa01200f`, whose tree equals the pull
  request head's (`75654d2d`); `main` had not moved since #453. Source archive
  `askrigor-17aed0188b762b4091edf1b3ffafb821aa01200f.tar.gz`, SHA-256
  `82b32bc86f03761eda643645d1125974c939b8aa806e0819228e54d292d20063`.
- **Image:** built from that archive at 10:11:57 to 10:12:54 UTC; id
  `sha256:4a2b282df0b3202e9fe7f21e4534542bf6c18f2e21e20c9ca7739aaa276f1577`, user `node`, workdir `/app`; the candidate
  started, answered `/healthz` and `/version` and was removed; image archive 122,380,658 bytes, SHA-256
  `fc6b9f63c5720eda6ada7bfabd74ed6a228ea1b9502c6eead8c4b174841f43a4`.
- **Prior state (stage A):** (10:14:09 UTC) research-mcp on `cf89e911`, healthy; the promotion timer enabled; the
  compose overlay and the two role scripts on the host are reviewed versions (the access role's `7f361afa`...);
  `runtime.env` 90 names, the planner's six lines, no judge line; 62 GB free. Read at 10:14:49 UTC, before stage B:
  the planner's and the review's state files had last changed 398 and 397 minutes earlier (14 Nov: USD 0.53 for
  eight plans and USD 0.31 for three reviews, one account); the call record held 5,234 rows, its newest call at
  09:21:07 UTC and none in the last 30 minutes, so no research was in progress.
- **Stage B:** (10:15:19 to 10:16:04 UTC) the role scripts and the overlay on the host equal reviewed versions; the
  merged service's mounts are as expected; the image archive verified and loaded (the id above); the forum reader's
  self-test passed; the timer stopped; a dump of 18,007,668 bytes (SHA-256 `c7d4f62eaac9edbf`...), taken before the
  migration; migrate complete, `0035_research_menu_learning` recorded with the release file's hash
  (`72e5f10d6505a520`...); both role scripts run from the release's bytes (the access role's is new, `a01e4178`...;
  36 and 15 functions as before); the boundaries from the catalog: the access role's table rights are those of
  before and DELETE, INSERT and SELECT on `research_menu_choices`, its column rights those of before and
  `learn_menu_choices`, the review role holds none, the reader reads neither the held YouTube findings nor the call
  record; and for the new table: the reader cannot read it, PUBLIC cannot read it, it holds no row, and no account
  has learn mode on. The prior image tagged `askrigor-research:rollback-pre-17aed0188b76` and the prior files kept
  under `/opt/askrigor/rollbacks/pre-17aed0188b762b4091edf1b3ffafb821aa01200f` (both read back on the host at
  10:18:02 UTC: the tag names the image of `cf89e911`, and the kept files are the earlier selector, the earlier
  `runtime.env` and the earlier access role's script); `runtime.env` 90 names, the build line changed and nothing
  else; the overlay installed again with the same bytes; research-mcp recreated and started at **10:15:55 UTC**,
  healthy; the planner, from the service's own settings: enabled, USD 3 a day, 20 new plans a day for an account;
  the review: enabled, USD 3 a day, 20 reviews a day for an account; the planner's state read back: 14 Nov, USD 0.53
  spent, one account counted.
- **Stage C:** (10:16:04 to 10:17:00 UTC) `/version` names build `17aed018`, HRP 20.6.41 and Universal 20.5.46; the
  live `/mcp` lists 35 tools and equals the frozen fixture; the three tool-list versions equal their fixtures; the
  in-image probes passed. The log differs from #453's in hashes, dates and times, and in one figure: the forum
  reader's thread probe read 15 of the thread's 195 comments (96 at #453's release; `state=read` both times, and the
  same 15 in stage B's self-test before the switch).
- **Promotion:** the one-shot service found nothing pending; the timer was enabled again at 10:17:00 UTC.
- **The site:** not released. **Plugin:** receipt unchanged (0 of the 8 packaged files changed; the two installed
  copies equal the merge's).
- **Connector probe (Codex's AskRigor app, the owner's dev account), with one real plan:** (10:18:21 to 10:19:16 UTC)
  35 tools, build `17aed018`, HRP 20.6.41, no out-of-date sentence.
  - `inspect` before: "Learn mode is off for this account, so AskRigor keeps none of its menu choices; only when the
    person asks, action set_research_steering with later_inputs.researchSteering.learnMenuChoices true turns it on."
    The research style: balanced, checking back after 10 minutes.
  - `set_research_steering` with `learnMenuChoices` true: "Learn mode is on: AskRigor now keeps this account's menu
    choices (which tasks, how many minutes, and the person's reason when they give one, in their own words, the last
    20) and gives them to its own planning call. Say "learn mode off" to stop and delete them." The style stayed
    balanced. `inspect`: "AskRigor keeps 0 of its menu choices".
  - A registration with the person's words "does a coffee an hour before bed keep you from falling asleep?": 15.1
    seconds, lane `research`, no question, one search, five tasks (two that could change the conclusion, two the
    confidence, a forum task marked detail). `plan_research` with that menu unchanged: `ask`; its text ends with
    "Learn mode is on: I remember your choices", and `next_step` names `person_reason`.
  - `plan_research` again with the person's answer (task 1 for 5 minutes, `person_answered` true, `person_reason`
    "release check: only the first task, I want the short version" and the menu's digest): `go_on`. `inspect`:
    "AskRigor keeps 1 of its menu choices".
  - `set_research_steering` with `learnMenuChoices` false: "Learn mode is off, and what was kept of this account's
    menu choices is deleted." `inspect`: off again, the style still balanced.
  - `list_calls`: "manage_research_access (register_plain_answer: research) · answered · 15.1 s", then
    "(plan_research: ask)" and "(plan_research: go_on)".
  - Read on the host at 10:20:48 UTC: `research_menu_choices` holds no row, no account has learn mode on, one call
    record row carries a lane; the planner's state: USD 0.61 for nine plans on 14 Nov; the review's: USD 0.31 for
    three reviews; the service's log has one line and none naming a failure.

  Learn mode was left off on the owner's account: the person turns it on by saying so.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-17aed0188b76` (the image of `cf89e911`),
  restore `runtime.env` from `/opt/askrigor/rollbacks/pre-17aed0188b762b4091edf1b3ffafb821aa01200f` and recreate
  research-mcp. The earlier image reads neither the new table nor the new columns, and the migration and the access
  role's grants stay. If an account has learn mode on by then, run the runbook's two statements after the rollback
  (infra README, the paragraph on 0035), so that what was kept is deleted as promised.
- **Not in this release:** learn mode changes the plan only, and the menu still asks as before; a follow-up that says
  "continue" going on without the menu (owner question 304, option a chosen in the Inbox on 14 Nov at 10:05 UTC:
  being built, its release needs "304a" typed in chat); learning from everyone's choice structure (part 1 of
  question 303, due with the trial's numbers on 20 Nov); a real person's history in the planning call (the tests
  used written ones); the final check's own first-pass limit, as vague as the drafts #458 describes; AskRigor#459
  (two species treated as one); the light go-ahead's menu line; the seventh defect of the blind replay.
