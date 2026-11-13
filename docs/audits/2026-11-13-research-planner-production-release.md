# Production release, 2026-11-13 (AskRigor's own planning call on dev accounts; owner answer 298b)

- **Owner decision:** the owner's answer 298b, chosen in their Inbox on 13 Nov 2026 at 13:07 UTC and typed in chat
  ("298b inbox") in the session that released: "build it for your account and try it for a week beside today's way".
  Question 298 named what is sent ("the question and the AI's quick answer to Anthropic, and search words drawn
  from them to its web search"), the funding ("from your Claude API credit, under the USD 3 a day cap you set for
  the meaning judge") and the scope ("On your account only"). The key is the one the owner gave on 2 Nov 2026 for
  AskRigor's use on dev accounts (owner answer 221). The value that is neither none nor a question, and the SDK's
  logging, are fixes, released under the owner's standing permission of 12 Nov 2026.
- **Contents:** #446, four commits after #444's merge:
  - `c61461e5`: the release record of #444 and its `docs/INDEX.md` line.
  - `503a7814`: the planning call (`apps/research-mcp/src/research-planner.ts`), `later_inputs.asked`,
    `register_plain_answer`'s `research_plan` and `planned_later_inputs` on a dev account, `inspect`'s request for
    the person's words, the Atlas account page's row, the policy's `OWNER_ANSWER_298B`, the privacy map's row, the
    compose overlay's read-only mount for the key; and `steeringChoiceUnclear`: on every account, a
    `steering_choice` that is neither the word none nor a sentence is handed back when the menu's decision rests
    on it.
  - `4d8e8f83` and `088c425c`: what the two reviews changed (below), the order of the call's tasks (bug report
    #445), and a refusal's category logged as a class.

  The tool list is unchanged (35 tools; fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`) and so are the server instructions, so no app needs a refresh: `asked` is a later input and
  the new result fields are runtime only. No migration, role script, privacy-notice or site change. New on the
  host: one read-only mount, one key file, and five settings.
- **Before deploying:**
  - `npm run lessons:status` at 14:19:53 UTC: open 46; needs review 9; accepted but not incorporated 1;
    incorporated or closed 41; deletion eligible 1; the suggested-fix lane: nothing unrecorded. One new bug report
    since the last check, #445 (13:30 UTC, first-answer quality on a question about a solvent's harm to children):
    its first point, the order of sources, went into the call's instructions; the rest is open.
  - `npm run verify` on `088c425c`'s tree, Node 24.18.0: the typecheck, 6,540 tests passed and 6 skipped (363
    files), and the build. Hosted checks on `088c425c`: Deterministic verification (5m 26s), workflow-policy,
    CodeQL and its four analyses, all passed. The private-map check found nothing to refuse.
  - Reviews, on four named risks (privacy, the key, money, never blocking): mine, and Codex's on `503a7814`
    (`codex exec`, read-only). Changed for them: the SDK's logging and tracing off for the planner's client and
    the meaning judge's (at debug level the SDK logs requests and replies whole); USD 0.12 held against the day's
    cap for each running call, a call sent only while the cap has room for it, and counted toward the day it was
    sent; a failure with no answer from the API keeps what was held; a reply limited to 8,000 output tokens; a
    planner that throws at once or never settles cannot fail or hang a registration; a plan whose question is
    neither the word none nor a sentence is not used; a plan leaves memory at the hour in an idle process too.
    Not changed: a question of one bare word, or one that begins with the word none and has no question mark, is
    handed back like `none_needed`, and the refusal says how to write it.
  - Greptile: no review ran and no credit was spent. With `.greptile/config.json` in `main` since #444, its app
    no longer reviews a pull request when it opens.
  - The call on the API before the release (13 Nov, 13:50 to 14:39 UTC; 26 calls, 24 answered; USD 1.47 of the
    owner's credit): 5 of 5 on the owner's five questions, on which its wording was tuned, and 7 of 8 wider ones
    as expected; 10 to 22 seconds and 6 to 9 cents a call with one or two searches. One call on a question about
    a solvent's harm to children was refused by the model's safety classifiers and answered on the next try.
- **Source:** #446 merged at 14:54:35 UTC as `e24f6d3b1c1fd2a5681b21fff171132f86fead07`, whose tree equals the pull
  request head's. Source archive `askrigor-e24f6d3b1c1fd2a5681b21fff171132f86fead07.tar.gz`, SHA-256
  `289c89f29adebe99cd39916262c8a3c55b33eedd313ca88f26744233038c0c0a`.
- **Image:** built from that archive at 14:54 to 14:55 UTC; id
  `sha256:5558e36cf384ba64ef0025d588a2c6c44135920de9958d9557865249cdfbae74`, user `node`, workdir `/app`; the candidate
  started, answered `/version` and was removed; image archive 122,160,210 bytes, SHA-256
  `4b9890875574235a139dcda38bf5be6c6ae7119ebdaa6f99405f9645f1ab36b1`.
- **Prior state (stage A, 14:57:00 UTC):** research-mcp on `4fbd6c6b`, healthy; the site on the release of
  `2e231949`; the promotion timer enabled; 80 names in `runtime.env`, none of them the planner's or the judge's; no
  key folder; 63 GB free. The key file was copied to `/root` by `scp`, mode 0600, 107 bytes, its form checked on
  the owner's computer first and never printed.
- **Stage B (14:57:19 to 14:58:00 UTC):** the two role scripts on the host equal reviewed versions, and the compose
  overlay the one of #444; the merged service's mounts are the five it had and the new read-only one; the key file
  in `/root` has the expected form; the meaning judge is off; the image archive verified and loaded (the id
  above); the forum reader's self-test passed; the timer stopped; a dump of 17,971,510 bytes (SHA-256
  `218a5f3e6d34760a`...); migrate complete with no new migration; both role scripts run from the release's bytes
  (36 and 15 functions, exactly their scripts'); the prior image tagged `askrigor-research:rollback-pre-e24f6d3b1c1f`
  and the prior files kept under `/opt/askrigor/rollbacks/pre-e24f6d3b1c1fd2a5681b21fff171132f86fead07`;
  `runtime.env` 85 names: the build line changed and five added (`ASKRIGOR_RESEARCH_PLANNER=on`, its key file
  inside the mount, the API workspace, `ASKRIGOR_RESEARCH_PLANNER_DAILY_CAP_USD=1.5`,
  `ASKRIGOR_RESEARCH_PLANNER_ACCOUNT_DAILY_CALLS=20`); the key installed as `/opt/askrigor/state/claude-api/key`,
  mode 0400, owner 1000:1000, 106 bytes, in a folder of mode 0750, and the copy in `/root` removed; the compose
  overlay installed (SHA-256 `e406048a9b7f6600`...); research-mcp recreated and started at **14:57:53 UTC**,
  healthy; the key's mount is read-only and the service reads the file; the planner, made from the service's own
  settings with no call to the API: enabled, USD 1.5 a day, 20 new plans a day for an account; no log line names
  the planner.
- **Stage C (14:58:00 to 14:59:10 UTC):** `/version` names build `e24f6d3b`, HRP 20.6.41 and Universal 20.5.46; the
  live `/mcp` lists 35 tools and equals the frozen fixture; the three tool-list versions equal their fixtures; the
  in-image probes passed; the forum reader, the all-journal search and shared answers answered from production.
- **Promotion:** the one-shot service found nothing pending; the timer was enabled again at 14:59 UTC.
- **The site:** not released: no site file changed. **Plugin:** no packaged file changed since `4fbd6c6b` (0 of
  8); receipt `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`, unchanged.
- **Connector probe (Codex's AskRigor app, a dev account, 14:59:40 to 15:00:23 UTC), with one real plan:** 35
  tools; `tool_list_version` `0d6016087ee4bc5a`; build `e24f6d3b`. `inspect`: its text holds `later_inputs.asked`,
  and `next_step` is the request for the person's words. `register_plain_answer` with `asked` "does a coffee an
  hour before bed keep you from falling asleep?": 14.5 seconds, not refused; `research_plan.about` "The question
  asks whether drinking a coffee about an hour before bed makes it take longer to fall asleep. Studies show that
  caffeine taken before bed makes falling asleep take longer, by about 9 minutes on average in one meta-analysis.
  The assistant assumed a 200 mg dose of caffeine in healthy adults, but the person did not say how strong the
  coffee is or whether they drink coffee every day."; `steering_choice` "Do you mean a regular cup of caffeinated
  coffee, an espresso or decaf, and do you usually drink coffee every day?"; 1 search; `from_asked` true; 5 tasks;
  the first text holds "do not screen" and not "Screen first:". `plan_research` with `planned_later_inputs` as
  given: not refused, `ask`, the planner's question returned, the target matches the plain answer. A menu with
  `steering_choice` "none_needed": refused (`invalid_request`), "later_inputs.researchMenu.steering_choice:
  "none_needed" is neither the word none nor a question; write exactly none, or the one question you would ask
  this person, written out as a sentence with its question mark", with the field's place marked; with "none":
  `go_on`, `say_reading_first` true.
- **Claude's connector:** not probed: this session's Claude connectors were still not answering (since about
  13:19 UTC; a call at 14:36 UTC failed with status 500).
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-e24f6d3b1c1f` (the image of
  `4fbd6c6b`), restore `runtime.env` and the compose overlay from the rollback folder and recreate research-mcp:
  the planner's five lines and the mount go with them. The key file stays in `/opt/askrigor/state/claude-api`,
  read by nothing; remove it by hand if the call is not to return.
- **After the release, the five test prompts in the owner's ChatGPT (13 Nov, 15:03 to 15:11 UTC; GPT-6 at
  "Instant", the only effort the owner's account offered: "Limite d'utilisation atteinte"; card saving off from
  14:10:11 to 15:11:52 UTC; the notes are `/home/joel/askrigor-releases/20261113-444/round7-notes.md`).** Not
  comparable with rounds 5 and 6 on effort.
  - **The plan arrived in all five** (11.7 to 20.1 seconds), and each chat sent it to `plan_research` as given: no
    refused menu. Four chats first sent `asked` as a list and were refused once (fixed in the next build).
  - **The control** wrote none and answered in one turn with the right figures (31 of 156, 19.9%), without the
    line on how it read the question and without a passed final check (one call, `not_ready`, not repeated).
  - **The four open questions** each ended their first turn with the planner's question and the menu, 1.3 to 2.3
    minutes after the message; a reply that answered the question went on (4 of 4). The PewDiePie chat knew Ajax
    as his AI model.
  - **After the go-ahead, on Instant, the AI did almost none of the tasks and never called the final check** (0
    of 4): one to three AskRigor searches, no paper read through AskRigor, an answer about 90 seconds after the
    reply, each saying it was not validated. The Syrian rue chat, asked: "the visible research calls do not
    establish that I retrieved and verified those studies".
  - **Read against the owner's wanted answers:** the PewDiePie answer takes the reading the owner meant and gives
    his claims first; the SMILES answer opens with 1.16 against 0.30 and the 46 of 67 on medication, with no
    AMMEND or HELFIMED; the Syrian rue answer has the 1999 oil measurements and that they are of solvent-extracted
    oil.
  - **Spend:** six planning calls on the server (the probe's and the round's five), about USD 0.4 of the day's
    USD 1.50.
