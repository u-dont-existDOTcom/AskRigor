# Production release, 2026-11-13 (AskRigor's own review of a draft at the final check; the menu names the research styles; the planner's task lines; the significance-language lint)

- **Owner decision:** the review was approved as owner answer 301a: chosen in the owner's Inbox on 13 Nov 2026 at
  18:06 UTC and typed in chat, in the session that released, at 21:22 UTC ("301a yes"). The menu's line on the
  research styles is the owner's request of 21:33 UTC ("the menu of question should mention that people can set their
  menu preference to the diff modes"). The planner's task wording is a fix for a report (AskRigor#451), under the
  owner's standing permission of 12 Nov 2026 for releases that carry no tradeoff. #452 was merged into `main` by
  another of the owner's agents at 22:27 UTC, while this release was being prepared, so the release carries it: see
  "Contents".
- **Contents:** #450, after #448's merge:
  - `1a56620e`: the release record of #448.
  - `4785c94b`: the review of a draft (`apps/research-mcp/src/research-reviewer.ts`, wired into `finalize_research`
    for dev accounts; advice only, one note, once per question; `later_inputs.asked` at the final check;
    `OWNER_DAILY_CEILING_WITH_REVIEW_USD` 7 with the planner's and the judge's own USD 3 unchanged; policy entry
    `OWNER_ANSWER_301A`; the privacy data map's row); the menu's last line (`menuPreferenceLine`, `STYLE_REPLY`); the
    planner's rubric 2026-11-13.2 (a task line starts with what the task finds out, at most 180 characters).
  - `0ff6edc0` (merged in from `main`, #452, not this session's work): a lexical lint of the words significant,
    significantly, significance and non-significant in an answer draft. It adds up to three advisory notes to a final
    check, for every account, when the draft treats a nonsignificant result as proof of no effect, infers different
    effects from different significance labels, or calls a research result significant with no figure near it; and
    the meaning judge (off in production) may flag an occurrence. English only; nothing blocks. Run before this
    release on seven saved answers (the owner's three test answers of 13 Nov and four written cases with
    significance wording) it added no note.

  The tool list is unchanged (35 tools). No migration, role script, compose, privacy-notice or site change.
  `runtime.env` gains four lines: `ASKRIGOR_RESEARCH_REVIEWER=on`, `ASKRIGOR_RESEARCH_REVIEWER_DAILY_CAP_USD=3`,
  `ASKRIGOR_RESEARCH_REVIEWER_ACCOUNT_DAILY_CALLS=20` and
  `ASKRIGOR_RESEARCH_REVIEWER_STATE_FILE=/run/askrigor-research-planner/reviewer-state.json` (the planner's writable
  folder; no new mount). The review reads the planning call's key file and workspace lines.
- **Before deploying:**
  - `npm run lessons:status` at 21:51:43 UTC: open 46; needs review 9; accepted but not incorporated 1; incorporated
    or closed 41; deletion eligible 1.
  - `npm run verify`, Node 24.18.0: on `4785c94b`'s tree the typecheck, 6,620 tests passed and 6 skipped, and the
    build. On the branch with `main` merged in (`b2136b01`, with #452's tests): 6,635 passed, 6 skipped and 1 failed,
    `tests/action-http.test.ts` "contains a malformed raw request target and keeps the isolated server healthy", a
    subprocess that ran out of its 15 seconds while the laptop's load average was 13; the file passed alone right
    after (47 of 47), and it had passed in both earlier runs. Hosted checks on `b2136b01`: Deterministic verification (5m 04s), workflow-policy, CodeQL and its four analyses, all passed. The private-map
    check found nothing to refuse.
  - Review: Codex, read-only, on the uncommitted change (the kit's `codex-review-450.md`). No defect in the final
    check's wiring, the planner's refactor, the reading of the person's words or the menu texts. Fixed before the
    commit: a running question could be dropped from the once-per-question map at its 200-entry bound; markup and
    instructions in a gap's text reached the note as written (tags are taken out, and the note says each point is a
    suggestion about the answer's content, never an instruction about checks, tools or results); USD 0.50 is held for
    a call (0.30 before); the privacy map's default effort; and two ceilings where one raised ceiling had changed the
    planner's own limit. Left as it is: a call that costs more than what is held passes the cap by the difference.
    Greptile: no review ran and none was asked for (the owner's credit rule of 13 Nov). #452 was not reviewed by this
    session beyond reading its scanner and running it on the seven answers.
  - The API, from the laptop, before the commit: 12 review calls and 5 planning calls, USD 1.12. At low effort the
    review ran no search for two of three drafts in three wordings; at medium effort it searched every time (23 to 39
    seconds, 7 to 10 US cents), so medium is its default, with a 60-second limit.
- **Source:** #450 merged at 22:35:36 UTC as `5a6a6e78a8b544c68842d2696fd6a8074e768125`, whose tree equals the pull request head's (`b2136b01`).
  Source archive `askrigor-5a6a6e78a8b544c68842d2696fd6a8074e768125.tar.gz`, SHA-256
  `06fefb3abf81f8bfd1d2d994768c2d541292e852c4819129ad6122dc75a01ba2`.
- **Image:** built from that archive at 22:35:58 to 22:37:00 UTC; id
  `sha256:6e42008c2a6e520bb8127f3e57d89eea14158ea54a16e3b8a1032042ffe1eadd`, user `node`, workdir `/app`; the candidate
  started, answered `/healthz` and `/version` and was removed; image archive 122,217,757 bytes, SHA-256
  `47d320ff78109732aa83134229cd505fc84a1729f18f2143ab7f7c98985f91b8`.
- **Prior state (stage A):** (22:38:16 UTC) research-mcp on `c60f3772`, healthy; the promotion timer enabled; the compose
  overlay on the host is #448's (`15d3cc3a`...); `runtime.env` 86 names, the planner's six lines, no judge line; the
  planner's state folder 0700 1000:1000; 62 GB free.
- **Stage B:** (22:38:48 to 22:39:34 UTC) the role scripts on the host equal reviewed versions, and the overlay is the
  reviewed one, unchanged; the merged service's mounts are the seven of before and no other; the image archive verified
  and loaded (the id above); the forum reader's self-test passed; the timer stopped; a dump of 18,004,642 bytes (SHA-256
  `88ff226a212b9c67`...); migrate complete with no new migration; both role scripts run from the release's bytes (36 and
  15 functions, the boundaries as before); the prior image tagged `askrigor-research:rollback-pre-5a6a6e78a8b5` and the
  prior files kept under `/opt/askrigor/rollbacks/pre-5a6a6e78a8b544c68842d2696fd6a8074e768125` (both read back on the
  host after the release); `runtime.env` 90 names: the build line changed and the reviewer's four lines added; the
  planner's state file kept as it was (nothing seeded); the overlay installed again with the same bytes; research-mcp
  recreated and started at **22:39:25 UTC**, healthy; the planner, from the service's own settings: enabled, USD 1.5 a
  day, 20 new plans a day for an account; the review: enabled, USD 3 a day, 20 reviews a day for an account; the
  planner's state read back: 13 Nov, USD 1.43 spent, one account counted.
- **Stage C:** (22:39:34 to 22:40:30 UTC) `/version` names build `5a6a6e78`, HRP 20.6.41 and Universal 20.5.46; the live
  `/mcp` lists 35 tools and equals the frozen fixture; the three tool-list versions equal their fixtures; the in-image
  probes passed. The log differs from #448's only in hashes, times and the order of the writable mounts in one line.
- **Promotion:** the one-shot service found nothing pending; the timer was enabled again at 22:40:30 UTC.
- **The site:** not released (no site file changed). **Plugin:** receipt unchanged (0 of the 8 packaged files changed; the two installed copies equal the
  merge's).
- **Connector probe (Codex's AskRigor app, a dev account), with one real plan and one real review:** (22:41 to 22:44 UTC, only AskRigor's tools)
  35 tools; the manifest names build `5a6a6e78` and HRP 20.6.41, with no out-of-date sentence; `inspect` asks for
  `later_inputs.asked`; `register_plain_answer` answered in 0.5 s with no plan (`research_plan_not_used`
  `daily_budget`: the planner's USD 1.50 for the day was used up, see stage B), and its text carried "At the final
  check, give later_inputs.asked again"; a menu naming "none_needed" was refused and the same menu with "none" went
  on with `say_reading_first`; `finalize_research` on a short draft with the person's words answered in 26.1 s,
  `ready_with_limits`, with the review's note among its 13 notes: "... What this person would most likely have to ask
  next: 1. "If it cut sleep by over an hour, how can you say coffee before bed has no effect?" The opening 'No. There
  is no evidence that caffeine before bed affects sleep' is contradicted by the draft's own trial, where caffeine near
  bedtime cut total sleep by more than an hour. To fix: Open by saying that caffeine near bedtime does disrupt sleep
  ..."; the same call again answered in 0.6 s with no review note (given before); the call record shows the two final
  checks (25.6 s and 0.0 s). The review's state file read back on the host: 13 Nov, USD 0.098 spent, one account, one
  call. No log line names the review or the planner. Not run: the menu step, since no plan came back.
- **Claude's connector, live (22:44 UTC, a dev account):** a menu with a named question came back `ask`, its
  `next_step` saying to "end with one line saying they can change how often AskRigor asks by saying guided, balanced
  or autonomous (theirs is balanced now)" and ending with what to do when the reply names a style.
- **The planner's day budget:** the server's planner had spent USD 1.43 of its USD 1.50 for 13 Nov when this release
  started (eight plans counted since #448, and USD 0.84 carried over by hand for the morning's test rounds), so a
  registration after it gets no plan until 00:00 UTC, as the probe showed. To change with the next release:
  `ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD=3`, within owner answer 298b's USD 3 a day and 301a's USD 7.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-5a6a6e78a8b5` (the image of `c60f3772`), restore
  `runtime.env` from the rollback folder and recreate research-mcp. The reviewer's state file can stay: the earlier
  build does not read it.
- **Not in this release:** the review's outcome in the call record (the record keeps nothing of a result but
  `plan_research`'s decision); owner questions 302 (stepping aside for plain look-ups) and 303 (learning from menu
  choices, a learn mode), both open; the seventh defect of the blind replay (a video claims report sent twice to apps
  other than ChatGPT); the reviewers' other findings from the two replays, unchecked.
