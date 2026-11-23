# Production release, 2026-11-21 (the planning call asks only when it must; the pause switch; balanced research's first menu)

- **Owner decision:** owner answer 399b, typed in the main session's chat on 21 Nov 2026 at 15:38:39 UTC: the release
  of all three changes of #502. Not the live pause test (the planning notes' step 4), which needs the owner's own OK.
- **Contents:** #502, merged at 16:20:12 UTC as `277c5a9970adad51ec0a3f0e68000144606f0a85` (parents `98ec69b9`, #501's
  merge, live since 15:34:58 UTC, and `4f42190d`, the checked head; the merge's tree equals the head's); 8 commits and 14
  files against `98ec69b9`.
  - The planning call's rubric 2026-11-21.1 (dev accounts): the plan names a question only for a fact only the person
    can give, when the decision is about one person or one thing, or when the person's words mean two things its search
    can't settle and one answer can't cover; otherwise it says which reading it took and gives a risky reading a task
    of its own.
  - The pause switch (owner answer 395b): the runtime-only `pause_research_planner` action with
    `later_inputs.pauseMinutes` (0 to 120), for a dev account's own planning call, ending at most two hours after it
    starts; held in memory only (a restart ends it); `inspect` says nothing of it; the account page shows it.
  - Balanced research (everyone's default): a research's first menu no longer waits for its length; the go-ahead has
    the AI say how it read the question and how long the research may take. Guided still asks; a named question, a
    changed menu, a re-plan and a later menu past 10 minutes ask as before.
  - No setting, migration, role script, compose, site, protocol, package or tool list change (checked from the diff
    against `98ec69b9`; no `ASKRIGOR_` name on any added line). `docs/privacy-data-map.md` gains the pause's in-memory
    record; the public privacy page is unchanged. Tool list versions as before: mcp `0d6016087ee4bc5a`, claude
    `ad0494d60fd2376b`, gemini `9a334c4e7a117921`.
- **Before deploying:** GitHub's seven checks passed on `4f42190d` (Deterministic verification, workflow-policy, CodeQL
  and its four analyses). Reviews (the planning session's folder
  `/home/joel/askrigor-releases/20261121-planner-measurement/pause-review/`): Codex's review of the pause ("fix first",
  three P1 and three P2) and its recheck (no P1 left); Fable's check against the design ("change first": take the pause
  out of what `inspect` tells the AI, done in `54984488`); Codex's review of the first-menu change ("fix first", two P1:
  a carried allocation could bypass the stop, and the opening came late; fixed in `232dc202`: the opening before the
  research, no mark bypass) and its recheck of `232dc202` ("ship", nothing left). The replay
  measurement with Opus, through the planner's own request:

  | Plans | Before | After |
  |---|---|---|
  | The owner's 15 plans | a question in 9 | a question in 0 |
  | 9 invented questions that need the person | not run | asked in 8 |
  | 13 that need none, in 4 languages | not run | asked in 0 |

  Lanes were unchanged, and so were the 3 of 15 plans with no web search; about USD 0.04 a plan, USD 2.75 in all on
  21 Nov. The kit's stage B database block on a throwaway PostgreSQL 17.6 (the live build's migrate and role scripts):
  DB_CHECK_LOCAL_OK at 16:17 UTC.
- **Source and image:** source archive SHA-256 `3a18ab12ef72d86c020436889fe6a6461ae1eecc99bc2e76afce57c2b942ba11`; image
  built 16:20:35 to 16:21:48 UTC, id `sha256:3ccbdfb2963efc8f8043ff708e425d8e4727a0ff52be0376c2757b1a040f3490`, user
  `node`, workdir `/app`; the disposable candidate answered `/healthz` and `/version` (HRP 20.6.43) and was removed; the
  findings ledger, settings and service-read probes passed in containers with no network; image archive 123,206,775
  bytes, SHA-256 `0a8b3899698be25511021dd33b0b926b9292529922ecdfdce429f77f7c50c3fe`.
- **Prior state (stage A, 16:22:58 UTC):** research-mcp on `98ec69b9`, healthy; the role scripts `41b02dbf` and
  `97cee2aa` (#501's, unchanged by #502); compose `15d3cc3a`; `runtime.env` 98 names, with #501's four lines as its stage
  D wrote them (the Gemini secret checked by form and `test -n` only), and the service reading the user count on,
  Gemini's sign-in on and news in shadow; the promotion timer enabled; the site on `98ec69b9`'s release. Before stage B:
  the newest call at 16:18:15 UTC; 329 quiet seconds at 16:23:45.
- **Stage B (16:23:45 to 16:24:30 UTC):** the earlier image tagged `askrigor-research:rollback-pre-277c5a9970ad`
  (`98ec69b9`'s image, `a68e144c`); the image loaded and checked against the build's id; the forum reader read through
  the new image; the prior files and a database dump (18,479,050 bytes, SHA-256 `cbb3eadb…`) kept in
  `/opt/askrigor/rollbacks/pre-277c5a9970adad51ec0a3f0e68000144606f0a85`; the promotion timer stopped; migrate recorded
  nothing new (0018 to 0039 and 0043 with their SHA-256); both role scripts re-run with the same bytes (42 and 28 GRANT,
  exactly 40 and 19 functions); the boundaries, dossiers, Gemini's table and the news objects as before (no news item
  yet); `runtime.env` changed in its build line only; **research-mcp recreated on the new image, started 16:24:22 UTC,
  healthy**, seeing the same 104 setting names and mounts as before and reading every switch as before.
- **Stage C (16:24:30 to 16:26:39 UTC):** `/version` names the build with HRP 20.6.43; the public tool list and all three
  tool list versions equal their fixtures; the site's eight pages equal the merge's files (no site change); the
  manifests, the protocol, the forum reader probe and the all-journal search as before; one log line, none with a
  credential-like marker; the promotion one-shot succeeded and the timer is enabled and active (its catch-up run at
  16:26:37 again showed no next run for a moment; the check reads it again and found 16:30:01).
- **Acceptance (16:26:57 to 16:27:13 UTC):** `/version` names the build; 35 tools, equal to the frozen list;
  `get_protocol_manifest` from outside names the build, with HRP 20.6.43 (`99f40aa2715dd60d`) and Universal 20.5.46
  (`e313306b09da7e35`) as before and no word that the tools are out of date; #501's Gemini sign-in paths and the user
  count ("fewer than 10" for both numbers) answer as before. `inspect` on the owner's account (about 16:27 UTC), read-only:
  the same fields and values as before the release (active free-contributor access with notice v6, the plain answer
  requested with its note, detailed lesson reports and findings saving on, the autonomous style), the same next step,
  and no word of a pause.
- **After:** the connector probe through Codex's installed AskRigor app (16:28 UTC, AskRigor's tools only): 35 tools,
  both manifests as above, the running build named. The plugin receipt (16:28:06) found no packaged file changed since
  the live build; the source and installed copies equal the merge's. The rollback read (16:28:12) found the rollback
  tag on `98ec69b9`'s image and the kept files (`runtime.env`, 98 lines, naming `98ec69b9` and holding #501's four lines;
  equal to the live one but its build line).
- **Rollback:** never migrate or run a role script: #502 changes neither. Stop and disable the promotion timer; restore
  the selector and `runtime.env` from the rollback folder (build line `98ec69b9`, #501's lines as they were); recreate
  research-mcp on `98ec69b9`'s image; check health and `/version`; enable the timer again. A running pause ends with the
  restart; nothing is stored that needs undoing; the site is unchanged.
- **Accepted:** the main session's word after the release. Not done: the live pause test (the owner's OK first). The
  roadmap's "What's new" carries the first-menu change in its 21 November fold. Release kit and logs, on the
  maintainer's laptop: `/home/joel/askrigor-releases/20261121-release-502/`.
