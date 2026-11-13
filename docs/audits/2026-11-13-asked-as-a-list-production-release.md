# Production release, 2026-11-13 (the person's words may come as a list of messages)

- **Owner decision:** released under the owner's standing permission of 12 Nov 2026 for releases that carry no
  tradeoff ("you can do releases without my yes if you don't think there's any downside to the decisions, and we
  can roll back if it looks like the release made things worse"). It completes owner answer 298b's planning call,
  released the same day (#446).
- **Contents:** #447, two commits after #446's merge:
  - `c3311ecc`: the release record of #446, its `docs/INDEX.md` line, and round 7 in the plan.
  - `cca68a48`: `later_inputs.asked` is read as one text or as a list of 1 to 20 texts, joined in order with a
    blank line between them, within 6,000 characters in all; `inspect`'s request names both forms. In round 7,
    four of the five chats first sent a list and were refused once each.

  The tool list is unchanged (35 tools; fixtures mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini
  `9a334c4e7a117921`). No migration, role script, compose, settings, privacy-notice or site change; only the build
  line of `runtime.env` changes. The Claude key file installed by #446's release was not copied again: stage B
  checked it is as that release left it (mode 0400, owner 1000:1000, in a folder of mode 0750).
- **Before deploying:**
  - `npm run lessons:status` at 14:19:53 UTC (before #446): open 46; needs review 9; accepted but not incorporated
    1; incorporated or closed 41; deletion eligible 1. Not run again for this release, 70 minutes later.
  - `npm run verify` on `cca68a48`'s tree, Node 24.18.0: the typecheck, 6,541 tests passed and 6 skipped, and the
    build. Hosted checks on `cca68a48`: Deterministic verification (4m 57s), workflow-policy, CodeQL and its four
    analyses, all passed. The private-map check found nothing to refuse.
  - Greptile: no review ran and none was asked for (a small input change; the owner's credit rule of 13 Nov).
- **Source:** #447 merged at 15:26:44 UTC as `28527285c28cc1ed519493981ce9b651f9e93224`, whose tree equals the pull
  request head's. Source archive `askrigor-28527285c28cc1ed519493981ce9b651f9e93224.tar.gz`, SHA-256
  `e4d1a7d87531dc5fbdbcb6905becb3a92b54c5fa27a23e72cab195d229e5f2b4`.
- **Image:** built from that archive at 15:26 to 15:27 UTC; id
  `sha256:ea4a540705a5f1a510fc04bbdb8ba6d1ce9c7dee78140c8084ed71a34d916cf1`, user `node`, workdir `/app`; the candidate
  started, answered `/version` and was removed; image archive 122,156,720 bytes, SHA-256
  `bc281593101e6a9dfbcc55d3521a1c572afe7291be1f618bd9bbc3ec2d639eaa`.
- **Prior state (stage A, 15:29:20 UTC):** research-mcp on `e24f6d3b`, healthy; the promotion timer enabled; the
  planner's five lines in `runtime.env`; the key folder 750 1000:1000; 63 GB free.
- **Stage B (15:29:32 to 15:30:16 UTC):** the role scripts and the compose overlay on the host equal reviewed
  versions (the overlay is #446's, unchanged); the key file and its folder are as #446 left them, and no copy is
  in `/root`; the image archive verified and loaded (the id above); the forum reader's self-test passed; the timer
  stopped; a dump of 17,972,055 bytes (SHA-256 `e73a4ecbbda91ec5`...); migrate complete with no new migration;
  both role scripts run from the release's bytes; the prior image tagged
  `askrigor-research:rollback-pre-28527285c28c` and the prior files kept under
  `/opt/askrigor/rollbacks/pre-28527285c28cc1ed519493981ce9b651f9e93224`; `runtime.env` 85 names, the build line
  changed; research-mcp recreated and started at **15:30:08 UTC**, healthy; the planner, from the service's own
  settings: enabled, USD 1.5 a day, 20 new plans a day for an account.
- **Stage C (15:30:16 to 15:31:07 UTC):** `/version` names build `28527285`, HRP 20.6.41 and Universal 20.5.46; the
  live `/mcp` lists 35 tools and equals the frozen fixture; the three tool-list versions equal their fixtures; the
  in-image probes passed.
- **Promotion:** the one-shot service found nothing pending; the timer was enabled again at 15:31 UTC.
- **The site:** not released. **Plugin:** no packaged file changed since `e24f6d3b` (0 of 8); the receipt is
  unchanged.
- **Connector probe (Codex's AskRigor app, a dev account, 15:31:38 to 15:32:15 UTC), with one real plan:** 35 tools;
  build `28527285`. `register_plain_answer` with `asked` as a list of two messages (the question "does a coffee an
  hour before bed keep you from falling asleep?" and the answer "a regular cup, and I drink coffee every day"):
  not refused, 14.6 seconds; `research_plan.about` "The question asks whether a regular cup of coffee drunk an hour
  before bed delays falling asleep in someone who drinks coffee every day. ..."; `steering_choice` "none", since the
  list already carried the person's answer; 1 search; `from_asked` true. `plan_research` with the planner's menu:
  not refused. "none_needed": refused as on #446's build; "none": `go_on`, `say_reading_first` true.
- **Rollback:** point the selector back at `askrigor-research:rollback-pre-28527285c28c` (the image of
  `e24f6d3b`), restore `runtime.env` from the rollback folder and recreate research-mcp.
- **Known limit, found at this release:** the planner's count of the day's spend and of each account's plans is in
  process memory, so a restart starts both again. Two releases on 13 Nov each started them again; with about USD
  0.40 spent on the server before 15:30 UTC and USD 1.47 on the owner's computer, the day could in principle reach
  USD 3.37 against the owner's USD 3 if the server spent its whole USD 1.50 after 15:30 UTC. To do: keep the day's
  count across a restart.
