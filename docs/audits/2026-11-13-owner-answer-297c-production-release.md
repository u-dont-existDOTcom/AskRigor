# Production release, 2026-11-13 (the question asked for at the screen, and the reading said first; owner answer 297c)

- **Owner decision:** the owner's answer 297c, chosen in their Inbox on 13 Nov 2026 at 11:29 UTC and typed in chat
  ("ok inbox... 291b 297c") in the session that released. Question 297 named the change (tell the AI about its one
  question up front on the owner's account, and have an answer after none open with how it read the question), its
  release to their account, and the five test prompts run again.
- **Contents:** #442, two commits after #441's merge:
  - `fbe2090f`: the release record of #441, its `docs/INDEX.md` line, and the roadmap's What's new fold for 13 November
    2026 (four entries, all released with #441).
  - `bed7ea06` (297c). On a dev account, `register_plain_answer`'s text gives the menu's shape with `steering_choice`
    and its test where the yes or no stands (`RESEARCH_MENU_SHAPE_NAMED`), and its `next_step` ends with what the field
    is (`QUESTION_IN_THE_MENU`); a menu refused for its shape comes back with `steering_choice`'s placeholder in
    `corrected_later_inputs` when the call named no question, and the text and the message say what replaces it. On
    every account, a menu that gives the word none and goes on carries `researchMenu.say_reading_first` (runtime
    only), and its go-ahead, in the text and in `next_step`, is followed by `READING_FIRST`; not while the menu asks,
    and not while its research target holds the tasks back.

  The tool list is unchanged (35 tools; fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`) and so are the server instructions, so no app needs a refresh. No migration, role script,
  compose, settings or privacy-notice change; only the build line of `runtime.env` changes. The site changes by the
  What's new fold alone.
- **Before deploying:**
  - `npm run lessons:status` at 12:13:20 UTC: open 46; needs review 9; accepted but not incorporated 1; incorporated
    or closed 41; deletion eligible 1; the suggested-fix lane and its pull requests: nothing unrecorded.
  - `npm run verify` on `bed7ea06`'s tree: the typecheck, 6,519 tests passed and 6 skipped (361 files), and the build.
    Hosted checks on `bed7ea06`: Deterministic verification (5m 27s), workflow-policy, CodeQL and its four analyses,
    all passed. The private-map check found nothing to refuse.
  - Every other account's words: 304 comparisons of `main`'s source with this one (three styles, five framings, nine
    menus that do not carry none: the plan, its text and next step; the refusal's example and text) differ nowhere,
    and a test pins `RESEARCH_MENU_SHAPE` by its SHA-256.
  - Greptile: its local review of `bed7ea06` against `origin/main`, 5 of 5, "No actionable issues were found."; on
    the pull request it reused that review ("The code matches this PR, so no new review ran"). No review thread was
    open at the merge.
- **Source:** #442 merged at 12:14:05 UTC as `2e231949f6f90996b26e0527098127f8e3b474b5`, whose tree equals the pull
  request head's. Source archive `askrigor-2e231949f6f90996b26e0527098127f8e3b474b5.tar.gz`, SHA-256
  `d9f2258b1374f40df6f044edcefbd73f2f91ce5c8d79cfe9f90771c37320f95c`.
- **Image:** built from that archive at 12:14 to 12:15 UTC; id
  `sha256:16e06d33c8405e80d2655c41fe05bf4577d83eb2838a14349b45897a2231fbec`, user `node`, workdir `/app`; the candidate
  started, answered `/version` and was removed; image archive 122,122,119 bytes, SHA-256
  `97cd887df3dc4db7dbc3d0304948570e386852294ccfc233173e120b5140e4f4`.
- **Prior state (stage A, 12:17:52 UTC):** research-mcp on `ea3a9283`, healthy; the site on the release of `1d877300`;
  the promotion timer enabled; 80 names in `runtime.env`; 63 GB free.
- **Stage B (12:18:36 to 12:19:21 UTC):** the two role scripts and compose on the host equal reviewed versions; the
  image archive verified and loaded (the id above); the forum reader's self-test passed (a search, a thread, a plain
  page that needs a browser); the timer stopped; a dump of 17,930,037 bytes (SHA-256 `228ab6da514a3ae0`...); migrate
  complete with no new migration; both role scripts run from the release's bytes (36 and 15 functions, exactly their
  scripts'); the prior image tagged `askrigor-research:rollback-pre-2e231949f6f9` and the prior files kept under
  `/opt/askrigor/rollbacks/pre-2e231949f6f90996b26e0527098127f8e3b474b5`; the selector set to
  `askrigor-research:2e231949f6f90996b26e0527098127f8e3b474b5`; research-mcp recreated and started at
  **12:19:14 UTC**, healthy.
- **Stage C (12:19:21 to 12:20:11 UTC):** `/version` names build `2e231949`, HRP 20.6.41 and Universal 20.5.46; the
  live `/mcp` lists 35 tools and equals the frozen fixture; the three tool-list versions equal their fixtures; the
  in-image probes passed (protocol loads, a final check that passes with limits, full-text routes); the container
  runs read-only as `node` with every capability dropped.
- **Promotion:** the one-shot service found nothing pending; the timer was enabled again at 12:20:11 UTC.
- **The site (12:20:51 to 12:21:14 UTC):** release `2e231949f6f90996b26e0527098127f8e3b474b5` installed and activated
  (archive 325,807 bytes, SHA-256 `354756cf053e4997`...; its tar equals the separately built one); every public page
  equals the merge's file, and `askrigor.com/roadmap` shows the fold "13 November 2026".
- **Plugin (12:21:14 UTC):** no packaged file changed since `ea3a9283` (0 of 8); the source and the installed copy
  equal the merge's, receipt `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`, unchanged.
- **Connector probe (Codex's AskRigor app, a dev account, 12:21:01 to 12:22:28 UTC):** 35 tools; `tool_list_version`
  `0d6016087ee4bc5a` and no out-of-date sentence; HRP 20.6.41 (`e1705d3e958ea5d0`), build `2e231949`.
  `register_plain_answer`: not refused; its first text block holds "steering_choice, the one question you would ask
  this person" and not `steering_could_help`; `next_step` ends "In that menu, steering_choice is the one question you
  would ask this person before researching, because their answer could change what the research checks; try to name
  it first, and write the word none only when the question itself fixes exactly what to look up." A menu in a guessed
  shape: refused (`invalid_request`), `corrected_later_inputs.researchMenu.steering_choice` is "<the one question you
  would ask this person, or none>", and the message holds "Try to name that question first". The word none: `go_on`,
  `steering_could_help` false, `say_reading_first` true, and `next_step` ends "You named no question for this person,
  so before the answer itself say in one line, in their language, how you read their question: which meaning,
  comparison or situation you took it to be about. A reading they did not mean then shows at once." A named question:
  `ask`, the question returned, no `say_reading_first`. The field left out: refused, "later_inputs.researchMenu.
  steering_choice: left out; name the one question you would ask this person, or write none".
- **Claude's connector (a dev account, 12:21 UTC):** the same four steps gave the same results on `/mcp/claude`.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-2e231949f6f9` (the image of `ea3a9283`),
  restore `runtime.env` from the rollback folder and recreate research-mcp; the site's previous release
  (`1d877300`) is still installed beside the new one.
- **After the release, the five test prompts again in the owner's ChatGPT (13 Nov, 12:22 to 12:45 UTC; Extra High; card
  saving off from 12:25:21 to 12:45:03 UTC; the log is `/home/joel/askrigor-releases/20261112-439/chatgpt-runs-12nov.md`,
  round 6).** By the plan's criteria, 2 of 5 (round 5: 3 of 5), with different questions failing.
  - **The control asked** ("do you want the percentage of children who experienced diarrhoea at least once, or the
    total number of diarrhoea episodes?"), then gave the same checked answer (31 of 156, 19.9%) after the reply,
    about 9 minutes over two turns. Asked why: "none would have been the better choice."
  - **Orange peel asked** (which soil problem), for the first time since round 4, and Syrian rue asked (the route);
    a reply that only answered the question went on at once both times, and rue's check passed (round 5: not).
  - **PewDiePie and SMILES wrote none** in their first call and went straight to a checked answer. Both answers
    opened with the reading ("I'm comparing PewDiePie's Ajax with the reported Chinese attempts to extract OpenAI's
    hidden reasoning."; "I interpret your question as asking whether the SMILES trial demonstrated that dietary
    improvement is four times more effective against depression than antidepressant medication."). PewDiePie's none
    rested on "earlier conversation context": ChatGPT's memory of round 5's test chat.
  - **Cost:** one refused call per first menu on all five (round 5: 2, 2, 2, 2, 1): every first call already carried
    `steering_choice`.
  - **Read against the owner's wanted answers:** the SMILES answer says "No" again, where the owner's best answers
    were "closer to yes but more nuanced"; the PewDiePie answer explains what he says he did and takes the reading
    the owner did not mean. Every finished answer said how its key study was read.
  - **What it shows:** asking the person's AI earlier did not steady its judgment; it moved the misses. Offline, on
    the same five questions, one model call with up to two web searches wrote none for the control (2 of 2) and named
    a question for the four open ones (8 of 8); with the question alone it took Ajax for a football club (6 of 6).
    The owner, in chat during the round: "perhaps the research plan should be tried directly as an api call rather
    than hope the AI can figure it out". Owner question 298.
