# Production release, 2026-11-13 (the question asked for at the screen taken back; owner answer 298b)

- **Owner decision:** the owner's answer 298b, chosen in their Inbox on 13 Nov 2026 at 13:07 UTC and typed in chat
  ("298b inbox") in the session that released. Option b of question 298: build AskRigor's own planning call for dev
  accounts, "and meanwhile take back the part of this morning's change that made the PITCH look-up ask you a
  question. The line saying how the AI read your question stays." Their reason (Inbox, 13:12 UTC): "it makes sense
  to me with limited info that we wouldn't want to include the change that messed up the PITCH look up". This
  release is the take-back; the planning call is its own release.
- **Contents:** #444, three commits after #442's merge:
  - `cca0e8c5`: the release record of #442, its `docs/INDEX.md` line, and round 6 in the plan.
  - `9397a769` (298b). `register_plain_answer` gives a dev account the words it gives every account:
    `RESEARCH_MENU_SHAPE_NAMED`, `QUESTION_IN_THE_MENU` and the dev-account argument of `framingGuidance`,
    `framingNextStep` and `registerPlainAnswer` are gone, and the menu's shape is one text again, with the SHA-256
    it had before 297c, pinned by a test. Kept from #442: a dev account's menu refused for its shape comes back
    with `steering_choice`'s place marked, and on every account an answer after the word none opens with how the AI
    read the question.
  - `dcb8f684`: `.greptile/config.json`, #443's file byte for byte, so that this branch's pull requests would get
    no automatic Greptile review (the owner's credit rule of 13 Nov).

  The tool list is unchanged (35 tools; fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`) and so are the server instructions, so no app needs a refresh. No migration, role script,
  compose, settings, privacy-notice or site change; only the build line of `runtime.env` changes.
- **Before deploying:**
  - `npm run verify` on `9397a769`'s tree, on Node 24.18.0 as CI runs it: the typecheck, 6,519 tests passed and 6
    skipped, and the build (13:43 UTC). A first run on the shell's default Node 26.8.1 had one failure, in
    `tests/action-http.test.ts` (a child process); that test passed alone, and the whole run passed on Node 24.
  - Hosted checks on `dcb8f684`: Deterministic verification (5m 34s), workflow-policy, CodeQL and its four
    analyses, all passed. The private-map check found nothing to refuse (2 commits).
  - Greptile: no review was asked for. Its GitHub app reviewed the pull request anyway when it was marked ready
    ("Base review": "9 files reviewed, 0 comments added"), with `.greptile/config.json` in the branch: the file
    set the effort to Base and did not stop the automatic review. No review thread was open at the merge.
  - `npm run lessons:status` was not run before this release. Run at 14:19:53 UTC, after it: open 46; needs review
    9; accepted but not incorporated 1; incorporated or closed 41; deletion eligible 1; the suggested-fix lane:
    nothing unrecorded. The same as before #442.
- **Source:** #444 merged at 13:52:00 UTC as `4fbd6c6b4c5692d9331920646a164ce88463a3d1`, whose tree equals the pull
  request head's. Source archive `askrigor-4fbd6c6b4c5692d9331920646a164ce88463a3d1.tar.gz`, SHA-256
  `e93d7daf40d6a3479358d64db84aa37d70c27904943d2afe506511af9641a64e`.
- **Image:** built from that archive at 13:52 to 13:53 UTC; id
  `sha256:7e744efe5cf801669368e67fd7cba3a2fe7328fba103befaa2087739e9a9a94c`, user `node`, workdir `/app`; the candidate
  started, answered `/version` and was removed; image archive 122,121,571 bytes, SHA-256
  `75640723f4220710428a20072d7670c31a83fafbe52d1e5df9291b0ba6550557`.
- **Prior state (stage A, 13:54:24 UTC):** research-mcp on `2e231949`, healthy; the site on the release of
  `2e231949`; the promotion timer enabled; 80 names in `runtime.env`; 63 GB free.
- **Stage B (13:55:26 to 13:56:08 UTC):** the two role scripts and compose on the host equal reviewed versions; the
  image archive verified and loaded (the id above); the forum reader's self-test passed (a search, a thread, a plain
  page that needs a browser); the timer stopped; a dump of 17,969,108 bytes (SHA-256 `d9f2fcfed59b6f01`...); migrate
  complete with no new migration; both role scripts run from the release's bytes (36 and 15 functions, exactly their
  scripts'); the prior image tagged `askrigor-research:rollback-pre-4fbd6c6b4c56` and the prior files kept under
  `/opt/askrigor/rollbacks/pre-4fbd6c6b4c5692d9331920646a164ce88463a3d1`; the selector set to
  `askrigor-research:4fbd6c6b4c5692d9331920646a164ce88463a3d1`; research-mcp recreated and started at
  **13:56:00 UTC**, healthy.
- **Stage C (13:56:08 to 13:57:11 UTC):** `/version` names build `4fbd6c6b`, HRP 20.6.41 and Universal 20.5.46; the
  live `/mcp` lists 35 tools and equals the frozen fixture; the three tool-list versions equal their fixtures; the
  in-image probes passed; the forum reader, the all-journal search and shared answers answered from production.
- **Promotion:** the one-shot service found nothing pending; the timer was enabled again at 13:57 UTC.
- **The site:** not released: no site file changed. **Plugin:** no packaged file changed since `2e231949` (0 of
  8); the source and the installed copy equal the merge's, receipt
  `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`, unchanged.
- **Connector probe (Codex's AskRigor app, a dev account, 13:57:46 to 13:58:19 UTC):** 35 tools;
  `tool_list_version` `0d6016087ee4bc5a` and no out-of-date sentence; HRP 20.6.41 (`e1705d3e958ea5d0`), build
  `4fbd6c6b`. `register_plain_answer`: not refused; neither its first text block nor `next_step` holds
  `steering_choice`; the text holds `steering_could_help`; `next_step` ends "Screen in a few calls (searches,
  abstracts, thread titles, the Atlas), then call action plan_research with later_inputs.researchMenu; its result
  says whether to ask the person first." A menu in a guessed shape: refused (`invalid_request`), with
  `corrected_later_inputs.researchMenu.steering_choice` "<the one question you would ask this person, or none>".
  The word none: `go_on`, `say_reading_first` true, and the reading's sentence at the end of `next_step`. A named
  question: `ask`, the question returned. The field left out: refused, "later_inputs.researchMenu.steering_choice:
  left out; name the one question you would ask this person, or write none".
- **Claude's connector:** not probed. This session's Claude connector stopped answering at about 13:19 UTC (every
  connector of the session, AskRigor's and others'); production answered `/healthz`, `/version` and both MCP
  routes throughout.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-4fbd6c6b4c56` (the image of
  `2e231949`), restore `runtime.env` from the rollback folder and recreate research-mcp.
- **The control on this build, in the owner's ChatGPT (13 Nov, 14:04:26 to 14:06:00 UTC; Extra High; chat
  `6af718d2-b62c-83e8-9668-8c6a8ba76fe4`): missed**, by the criteria the plan set before the run. The turn ended
  after about 90 seconds with the menu and no named question: "AskRigor has identified the PITCH trial (Hay et
  al., 2008, BMJ). It is requesting a research allocation before checking the reported diarrhoea percentage.",
  two tasks (2 minutes and 1 minute). Its first call already carried `steering_choice`, with the value
  `"none_needed"` and the reason "User supplied paper, trial and outcome; no material ambiguity or decision
  requires clarification"; AskRigor reads only the exact word none, took the value for a named question and asked.
  So the take-back did what it says (the registration no longer asks for the question; the AI wrote the field from
  ChatGPT's memory of earlier chats), and the look-up was still asked, by AskRigor's own reading of a value. Fixed
  in the next build: a value that is neither the word none nor a sentence is handed back for one of the two. The
  chat was left at the menu, so it checked and saved nothing.
- **Card saving during the check:** turned off at 13:59:50 UTC (through Codex's AskRigor app). Another caller on
  the owner's account turned it back on at 14:05:10 UTC and made research calls of its own (14:00:35 to 14:08:29
  UTC, a final check among them); the check's chat made none of those calls. Saving was on at 14:08:59 UTC.
