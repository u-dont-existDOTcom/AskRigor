# Production release, 2026-11-13 (six defects from a blind replay, the planner's day counts across a restart)

- **Owner decision:** released under the owner's standing permission of 12 Nov 2026 for releases that carry no
  tradeoff ("you can do releases without my yes if you don't think there's any downside to the decisions, and we
  can roll back if it looks like the release made things worse"). All of it is fixes. The owner was told at 15:36 UTC
  that the planner's day counts restarted with every release and that this would be fixed next.
- **Contents:** #448, after #447's merge:
  - `babb4cc0`: the release record of #447.
  - `6ef95bd5` (merged in from `main`): the hono update 4.13.13 to 4.13.18 (#449, Dependabot; owner answer 276a).
  - `5a0e87d2`: six of the seven defects that Codex and Claude reported on 13 Nov in a blind replay of old changes
    (owner-pages `askrigor/tool-radar/stage-02-greptile-code-review.md`, Experiment 1), each reproduced by a
    failing test first:
    - `packages/sources/src/forum-page.ts`: the bot-challenge check took time quadratic in the page's size on
      hostile markup (3.8 s on 128 KB of `<script` text; one of its three patterns cubic, 15 s on 16 KB). The
      three patterns are replaced by scans that give the same answers in one pass. The two slow patterns #441 had
      listed as known are replaced the same way: the tag scan (`startTags` in `candidate-full-text.ts`, 11 s on
      128 KB before) and the trailing-punctuation and fragment patterns of `forum-thread-links.ts` (14 s on a
      128 KB link before).
    - `apps/research-mcp/src/forum-tools.ts`: a forum page whose pager has no `rel` attributes read as complete,
      with no link to page 2, while its receipt signed it part read. The result says partial exactly when its
      receipt signs no end of the thread, and gives the next page's link when the page links it.
    - `apps/research-mcp/src/actions/research-routes.ts`: a per-video YouTube audit reply for the Action route
      passed the 60,000-byte limit once its coverage receipt was added and was refused after the caller's
      continuation handle was used up. The reply is measured whole and cut further before the handle is committed.
    - `apps/research-mcp/src/actions/treatment-landscape-coverage-route.ts`: a complete comment audit whose count
      differed from YouTube's own figure could never pass the per-video check; and two closing searches that
      failed counted as rounds that found nothing new, so discovery read as saturated.
    - `apps/research-mcp/src/youtube-community-audit.ts`: a comment sample cut to the reply's budget was labelled
      "all".

    The seventh defect (a video claims report sent twice to apps other than ChatGPT) is not in this release.
  - The same commit, the planning call (owner answer 298b): the day's spend and each account's number of plans
    survive a restart when `ASKRIGOR_RESEARCH_PLANNER_STATE_FILE` names a file: read once when the planner is
    made, replaced whole after every change, accounts under the first 16 hex characters of the SHA-256 of their
    key, nothing of a question. And `ASKED_REQUEST` says: only what the person wrote in this conversation, nothing
    from memory or from earlier conversations (round 8: one chat of five added a remembered reply, and the plan
    was made from it).
  - `edc9df8f`: two problems Codex's review found in `5a0e87d2`. The research session's controller, which calls
    the audit route inside the process, keeps its whole reply (`replyWithinActionLimit`, off for it); and a
    discovery batch closed by a terminal access boundary stays a closing round, so a ledger whose later searches
    were all refused for good can still finish.

  The tool list is unchanged (35 tools; fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`). No migration, role script, privacy-notice or site change. The compose overlay gains one
  writable mount, `/opt/askrigor/state/research-planner` at `/run/askrigor-research-planner`, and `runtime.env`
  one line, `ASKRIGOR_RESEARCH_PLANNER_STATE_FILE` (a path). The privacy data map's planner row names the file.
- **Before deploying:**
  - `npm run lessons:status` at 17:30:34 UTC: open 46; needs review 9; accepted but not incorporated 1; incorporated
    or closed 41; deletion eligible 1.
  - `npm run verify` on `edc9df8f`'s tree, Node 24.18.0: the typecheck, 6,586 tests passed and 6 skipped, and the
    build. Hosted checks on `edc9df8f`: Deterministic verification (5m 25s), workflow-policy, CodeQL and its four
    analyses, all passed. The private-map check found nothing to refuse.
  - Review: Codex, read-only, on `5a0e87d2`'s diff (the kit's `codex-review-448.md`). No difference found on
    normal pages for any replaced pattern; the two problems above, fixed in `edc9df8f` with a test each; and limits
    of the state file left as they are (a failed read or write falls back to memory; two planner instances would
    overwrite each other's counts, and the service runs one; a clock set back a day starts the day again; the file
    operations are synchronous). Greptile: no review ran and none was asked for (the owner's credit rule of 13 Nov).
  - The helper that made the forum fixes was stopped by a usage limit before it reported. The main session finished
    its last step (one older test brought in line with the pager fix), reran the forum tests and the full suite, and
    read the changes.
- **Source:** #448 merged at 17:36:30 UTC as `c60f3772cd7fe5893cf7db3d1b43a077ff644e2d`, whose tree equals the pull
  request head's. Source archive `askrigor-c60f3772cd7fe5893cf7db3d1b43a077ff644e2d.tar.gz`, SHA-256
  `a0bf5f4db5aac3ec449b74891a42e2efbbf6c36c7874646690fd91be1147c739`.
- **Image:** built from that archive at 17:36 to 17:37 UTC; id
  `sha256:af0e83ce4e14e3142b71234e87bf5f86bba5c5b71189b804d0d03f82a2c9beb4`, user `node`, workdir `/app`; the candidate
  started, answered `/version` and was removed; image archive 122,183,026 bytes, SHA-256
  `533b9d1aae76b8f51d20a1c1a7e656188dd234583e7d6aef3a01cc060ac4536a`.
- **Prior state (stage A, 17:39:12 UTC):** research-mcp on `28527285`, healthy; the promotion timer enabled; the
  compose overlay on the host is #446's (`e406048a`...); `runtime.env` 85 names, the planner's five lines; no
  planner state folder; 62 GB free.
- **Stage B (17:39:33 to 17:40:33 UTC):** the role scripts on the host equal reviewed versions, and the overlay is
  the prior reviewed one; the merged service's mounts are the six of before and the new writable one, and no
  other; the Claude key file and its folder are as #446 left them; the image archive verified and loaded (the id
  above); the forum reader's self-test passed; the timer stopped; a dump of 17,997,035 bytes (SHA-256
  `ff3c69a2e8073e9b`...); migrate complete with no new migration; both role scripts run from the release's bytes
  (36 and 15 functions, the boundaries as before); the prior image tagged
  `askrigor-research:rollback-pre-c60f3772cd7f` and the prior files kept under
  `/opt/askrigor/rollbacks/pre-c60f3772cd7fe5893cf7db3d1b43a077ff644e2d`; `runtime.env` 86 names: the build line
  changed and `ASKRIGOR_RESEARCH_PLANNER_STATE_FILE=/run/askrigor-research-planner/state.json` added (the planner's
  lines are six); the folder `/opt/askrigor/state/research-planner` made (mode 0700, owner 1000:1000); the overlay
  installed (`15d3cc3a`...); research-mcp recreated and started at **17:40:25 UTC**, healthy; the new mount is
  writable by the service; the planner, from the service's own settings: enabled, USD 1.5 a day, 20 new plans a
  day for an account.
- **The day's count carried over by hand, once:** this release's restart was the last to start the counts again, so
  stage B wrote the state file before the service started, for 13 Nov only: USD 0.84 spent so far and no account
  counts. The figure is an estimate: 12 registrations in the day's call record took over five seconds (the planning
  calls: two release checks, the five of round 7 and the five of round 8), at about 7 US cents each. The account's
  own count of plans could not be carried over (the file names accounts by a digest of their key), so it started
  again at this release.
- **Stage C (17:40:33 to 17:41:29 UTC):** `/version` names build `c60f3772`, HRP 20.6.41 and Universal 20.5.46; the
  live `/mcp` lists 35 tools and equals the frozen fixture; the three tool-list versions equal their fixtures; the
  in-image probes passed. The log differs from #447's only in hashes, times and the new writable mount.
- **Promotion:** the one-shot service found nothing pending; the timer was enabled again at 17:41:29 UTC.
- **The site:** not released (no site file changed). **Plugin:** no packaged file changed since `28527285` (0 of 8); the receipt is unchanged (`23afe490`...), and the installed copies equal the merge's.
- **Claude's connector, live (17:42 UTC, a dev account):** `inspect`'s `next_step` carries the new sentence: "Give
  only what they wrote in this conversation: nothing from memory or from earlier conversations, and no note or
  explanation of yours."
- **Connector probe (Codex's AskRigor app, a dev account), with one real plan:** 17:42:35 to 17:43:14 UTC: 35 tools; build `c60f3772`; `inspect` carries the new sentence about this
  conversation only. `register_plain_answer` with `asked` as given in #447's probe (a coffee an hour before bed): not
  refused, 16.4 seconds; `research_plan.about` "The question is whether one regular cup of coffee about an hour
  before bed delays falling asleep in someone who drinks coffee every day. ..."; `steering_choice` "none"; 1 search;
  `from_asked` true; five tasks. `plan_research` with the planner's menu: not refused, `ask` (no question named: the
  recommended tasks' time). "none_needed": refused, with the corrected input; "none": `go_on`, `say_reading_first`
  true. **The state file after that one plan (17:44 UTC):** the day 2026-11-13, USD 0.9140246 spent (0.84 carried
  over and 0.074 for the plan), one account counted with one plan; mode 0600, owner 1000:1000, 105 bytes, no
  temporary file left in the folder; no planner line in the service's log.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-c60f3772cd7f` (the image of
  `28527285`), restore `runtime.env` and `compose.living-evidence.yaml` from the rollback folder and recreate
  research-mcp. The state folder can stay: the earlier build does not read it.
- **Not in this release:** the seventh defect of the replay (a video claims report sent twice to apps other than
  ChatGPT); the other findings in the reviewers' outputs, which nobody has checked (about 36 in the first replay and
  about 60 in the second; two concern non-English search terms in the coverage route); the meaning judge's own day
  count, which is still in memory (it is off in production).
