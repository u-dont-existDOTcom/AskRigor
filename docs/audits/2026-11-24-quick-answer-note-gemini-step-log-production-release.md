# Production release, 2026-11-24 (release H: the quick-answer note, and the Gemini step log after Allow)


- **Owner decision:** the owner answered "Yes, release both" in the coordinator's chat at 2026-11-24T13:19:44Z (a button
  of the question "Release the note fix with the Gemini step log now?", whose choices were "Yes, release both" and "Only
  the note fix"); earlier he chose 413a (the note) and 411b, typed again in that chat at 2026-11-24T13:36:31Z. Only #519
  and #516: not #520, #521, #513 or #503. No setting changes; the Gemini sign-in step log
  (`ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS=enabled`, on since release E2) stays on as it is. The release ran on the
  coordinator's "GO, M 436ac046" (13:50 UTC) and, after stage C's first try stopped (below), on its "GO C" (14:10:49
  UTC).
- **What changed for people:** the note that compares a checked answer with the quick answer it would have been without
  AskRigor now leads with what the research corrected, then what it qualified, then what it confirmed, and closes with
  the points it did not check in one line, and those it says it checked without showing what backs them in another (the
  owner, 23 Nov, of the note saying "did not check that" over and over). When an app's copy of AskRigor's tools is out
  of date, the sentence the AI passes on now names the steps: in ChatGPT Settings, Plugins, AskRigor, Refresh tools; in
  Claude a new chat, then disconnect and connect AskRigor. Nobody sees the rest: while the step log is on, each step of
  a Gemini link after Allow leaves a line of fixed names (the code's issue, Google's token and revocation calls, each
  research call that carries a token), never a value; and, whether it is on or off, the sign-in answers only at its
  exact addresses and methods (404 and 405 otherwise). The same 35 tools (no app refresh), HRP 20.6.46 and Universal
  20.5.46, no database, setting, site or plugin change.
- **Contents:** three merges since release G (`41cc54d7`, live since 23 Nov 22:04:32 UTC): **#518** (`a723bbff`, release
  F's and G's records and the roadmap page, at `ef60def2`), **#519** (`ba0820ab` at its checked head
  `ef980488dd477a0371e108761b024c49b6fdb50d`, merged 13:20:37 UTC) and **#516**, merged at 13:37:05 UTC as **M =
  `436ac046a1d0b9322e8d521770b8df747a8d6fae`** (a merge commit at its checked head
  `44e2fb117cc57fb9ed123c3a59d66df74c706ef9`, = refs/pull/516/head, tree equal; GitHub's 7 checks passed). 24 files:
  #519's research-finalization-gate.ts, docs/design-decisions.md, docs/final-check.md and its test; #516's
  gemini-sign-in/{diagnostics (new), google-client, index, provider, routes}.ts and oidc-provider.d.ts, server.ts,
  tool-list-currency.ts, check-report-vocabulary.ts, docs/gemini-connector.md, docs/privacy-data-map.md,
  docs/suggested-fixes-ledger.md and four test files; #518's two records, docs/INDEX.md and site/roadmap/index.html (not
  live). Unchanged against `41cc54d7` (read-only git in build.sh and the render): packages/ (migrations, postgres.ts),
  infra/ (compose `15d3cc3a`, both role scripts release b's), ops/, protocols/ (HRP 20.6.46 `d7dd9929...`, Universal
  20.5.46), scripts/, .github, the plugin's packaged files, the tool-list fixtures (35 tools; mcp `0d6016087ee4bc5a`,
  claude `ad0494d60fd2376b`, gemini `9a334c4e7a117921`), every package file, Dockerfile and compose file, .nvmrc; the
  setting names the code reads, 164 at both.
- **Before deploying:** GitHub's complete gate on #516's head, whose tree is M's (build.sh checks both); no local tree,
  typecheck or tests (the coordinator: the laptop's memory). The release's own probes were tried first on release G's
  image with M's changed files over it: all as expected there, and release H's probe failing on release G's own files in
  every part that is H's. The private-map check over 41cc54d7..44e2fb11: 19 commits, 40 maps from 2 files, nothing to
  refuse. The build waited for the owner's resource check (swap 88% at 13:50 UTC, 84% at 14:00:20).
- **Source and image:** source archive SHA-256 `5bf31c1b49a50990c365bea437d324103f2240437cfa9c4f7c1b59d4031aab2c`
  (11,449,233 bytes); image `sha256:e89ae764f1cea3f138d216c44c94c6a443cb6ca8a05f0294d892504a6d2b78c4` (archive
  123,670,684 bytes, SHA-256 `519bda2f3717721612a890058a8dfb05fc66eaa169988699f917c097dff4cbb7`), done 14:02:26 UTC;
  during the build the lowest available memory was 9,245 MiB and the highest swap 84%. The build refused unless the
  chain from M back to `41cc54d7` was exactly those three merges, each at its checked head with its tree, GitHub's
  record and passed checks and only its own files, and unless M changed nothing else and read no new setting name. On
  the image, no network, no setting: CANDIDATE_OK (/version HRP 20.6.46 2026-11-22 `d7dd9929...`); RELEASE_H_PROBE_OK
  (the note word for word on 9 invented answers; the step log's lines, 15 of 15 fixed names with no value the requests
  carried; 10 of 10 address variants refused with no line; the refresh notice word for word; the report vocabulary, HRP,
  Universal and the three tool lists); the earlier releases' probes as regression checks: RELEASE_G, F, E and
  D_PROBE_OK, LEDGER_OFF_OK, NEW_SETTINGS_PROBE_OK, PUBLIC_DOSSIERS_OFF_OK, PERSON_MARK_PROBE_OK,
  SAFETY_LIMITS_PROBE_OK, SAFETY_LIMITS_LIVE_OK, SERVICE_READS_OK.
- **Before the switch, through the proxy (13:51 UTC, again at 14:05:29):** on release G the ten address variants
  answered as the same code does on a local listener, and the production Caddyfile's path-changing directives are all
  page rewrites of askrigor.com: the proxy changes no path and no method, so the exact-address rule refuses no real
  link.
- **Prior state (stage A, 14:05:29 to 14:06:21 UTC):** research-mcp on `41cc54d7`, healthy (started 23 Nov 22:04:32
  UTC); runtime.env and the selector exactly as release G left them (SHA-256 `3bb8fbc3db9f4378` and `3f07bbc84c7ef864`;
  104 names, the step log line as written and set in the service); the site release F's `6b4722f1`. The image archive
  was copied (rsync, 14:05:24), its checksum checked and the image loaded on the host with the build's ID. Stage B's own
  checks, read-only, as rendered for M (14:06:30 UTC): STAGE_B_PRECHECKS_OK. The 6 Gemini step lines were copied into
  the kit before the switch (none of them a sign-in step).
- **Switch (stage B, 14:07:07 to 14:08:05 UTC, at 1,549 quiet seconds; the newest call 13:41:05):** rollback tag
  `askrigor-research:rollback-pre-436ac046a1d0` = 41cc54d7's image (`6b4cbeaca358`); the load skipped (stage A loaded it
  with the build's ID); rollback folder `/opt/askrigor/rollbacks/pre-436ac046a1d0b9322e8d521770b8df747a8d6fae` with a
  dump (19,017,332 bytes); the promotion timer stopped; migrate complete with nothing new; both role scripts re-run with
  the same bytes; runtime.env's build line only (104 names, SHA-256 `5472b669361b5dcc`; the selector
  `30575733463a6946`); **research-mcp on M from 14:07:54 UTC** (docker's StartedAt on the host,
  2026-11-24T14:07:54.550Z), healthy, with the same 110 setting names and mounts, the switches read as before (the step
  log on, safety limits on) and the step log setting present in the service.
- **Stage C stopped at 14:09:03 UTC on its first try, and was run again on the coordinator's word.** Two of its checks
  from the laptop (the anonymous tool count and the tool list against the fixture) could not open a connection to
  mcp.askrigor.com within 10 seconds (Node's UND_ERR_CONNECT_TIMEOUT); that is no answer, so stage C's host part (the
  probes, the promotion) did not run. The curl checks of the same run, before and after, were answered, and both checks
  read again by hand at 14:09:29 gave 35 tools equal to the fixture. The kit stops at a failed check and rolls back only
  when the live service is worse: M was live and healthy, so nothing was rolled back; the promotion timer, which stage B
  stops, stayed off until stage C passed. The coordinator answered "GO C" at 14:10:49: stage C ran again with one kit
  change made in between (a connection that could not be made is tried at most twice more, 10 seconds apart; any answer,
  right or wrong, stands; it was not needed), and so did the rest.
- **Stage C (14:10:50 to 14:13:23 UTC):** /version names M with HRP 20.6.46 (`d7dd9929...`); 35 tools equal the fixture;
  the three compiled tool lists equal; the 9 site pages equal the live site's own files; in the live container
  RELEASE_H_PROBE_OK, RELEASE_G, F, D and E_PROBE_OK and READER_OK; LEDGER_OFF_OK and PUBLIC_DOSSIERS_OFF_OK in a
  container of the new image; the promotion ran once on M at 14:13:18 (success; atlas_findings queue, 2 complete, 2 no
  pending promotion) and its timer is back on (next run 14:15:10); PROMOTION_OK. Read again at 14:17:21: the timer fired
  at 14:15:11 (success, exit 0), next run 14:20:06.
- **Acceptance (14:13:23 to 14:14:44 UTC): ACCEPTANCE_OK.** Through the public address: /version and the manifests from
  outside name M with HRP 20.6.46 `d7dd99297c422faa` and Universal 20.5.46 `e313306b09da7e35`, no out-of-date sentence
  (MANIFESTS_OK); 35 tools equal the fixture; E2's Gemini checks as regression checks (GEMINI_PUBLIC_OK);
  RELEASE_H_PUBLIC_OK (the refresh notice word for word on /mcp and /mcp/gemini; the sign-in's exact addresses, 10 of
  10; refused links and calls with made-up values); USER_COUNT_OK; ATLAS_SIGNED_OUT_OK (12 finding pages, the dispute
  form 200); D-1001 404; /how-to-research 200; the 9 pages equal the live site's, the roadmap's 22 and 21 November
  sections and its note as release F left them; the host (ACCEPTANCE_HOST_OK): M healthy as the selector and the build
  line name it, 104 names, every kept line as written, the step log on and set in the service; the step log since the
  switch (STEP_LINES_NAMES_ONLY): 12 lines, all fixed names, and a random marker sent in every made-up value in none of
  the log's lines.
- **Readers (14:14:52 UTC):** M healthy since 14:07:54; the reviewer and the planner on; Gemini's sign-in enabled, its
  step log enabled, the secret set (not shown), no separate login client; Atlas news shadow; safety limits on; the mark
  on since 2026-11-21T19:16:33Z; public dossiers and show-at-once off; log lines 14, none naming a failure class.
- **Plugin (14:14:54 UTC): PLUGIN_RECEIPT_OK.** The packaged files are unchanged since 41cc54d7; the source copy and the
  installed copy (version label 0.1.0+codex.20261106053949.hrp.20.6.40.universal.20.5.46, 8 files each) equal M's
  packaged files, and M's own scripts/plugin-package-receipt.mjs reads both: package_sha256
  `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`. No reinstall. The connector probe was the
  coordinator's own Claude connector, not Codex (14:18 UTC, /mcp/claude, read-only, tool_list_version
  `ad0494d60fd2376b`): HRP 20.6.46 `d7dd99297c422faa381ef4ecb0db1a95ed0ad27ed52a1f574fc458c47dab6e65` and Universal
  20.5.46 `e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e`, both on build M, contract 2026-10-07,
  sign-in accepted, research ready, no sentence about an outdated tool list; the tool count was not listed there (stage
  C read 35).
- **The way back (rollback read, 14:16:44 UTC):** the tag `rollback-pre-436ac046a1d0` is 41cc54d7's image
  (`sha256:6b4cbeac...`); the folder (700 root:root) keeps compose, both role scripts, the dump, and the selector and
  runtime.env naming 41cc54d7 (104 lines, the step log line in it), which equals the live one but for the build line. To
  release G: `FORCE_ROLLBACK=1 ./rollback.sh` in the kit (the promotion timer stopped and disabled first, as AGENTS.md
  has a rollback do; the selector and runtime.env from the folder; research-mcp recreated on 41cc54d7's image). No
  database or site change to undo. Two repairs in the kit, tried on the laptop with stand-ins for docker, systemctl and
  compose: release G's rollback stopped before restoring anything when the container was down, and its run took a
  service that did not answer for "stage B did not switch".
- **Limits (known, released as such):**
  - The note keeps each claim quoted exactly but no longer the order registered (kept since 31 Oct); #519 is the display
    half of 413a, and the research half is #520, not in this release.
  - Not seen from outside: the note in a real answer (it needs a signed-in research account). The probes, in the image
    and in the live container, check it word for word on 9 invented answers.
  - Not seen either: a real Gemini link and Google's own token call. The owner's next try writes the step lines; only
    refused, made-up calls were made.
  - The final check's other refresh sentence (a missing field when the tool list may be old) still says only "refreshing
    AskRigor in the app's settings".
  - The final check's report vocabulary gained seven plain code names (authorization, consent, library, login, resource,
    revocation, u), so a masked report shows those words as they are.
- **Site:** not released. Main's roadmap page has the 23 and 24 November sections (this record's pull request adds the
  second), which go live with the next site release, on the owner's yes.
- **Next:** the owner tries Gemini once; the step lines name the failing step; then the fix; the step log goes off after
  a working link.
- **Draft for the public privacy page (not in the page and not published; for the owner's yes to a site release):** in
  "Operational metadata", after "...user identifier, or credential.": "While the cause of a failing Gemini connection is
  being found, a second log, off by default, is on for Gemini’s sign-in: at each step of a connection, and at each
  research call that carries a Gemini sign-in, it writes the time and fixed words, counts and status codes only (the
  step and how it ended, which parts of the request came and of what kind, coarse time ranges, the type of call, and the
  reason for a failure in words set in advance), never an identifier, code, token, web address, header value, account,
  tool name, or anything you ask or are answered." With it, "The only record of calls is" in that paragraph becomes
  "Apart from that log, the only record of calls is", and the page's effective date and the tests that pin it change on
  the release day, as on 21 November (`05972b29`). Until then neither the page nor the live site says it;
  docs/privacy-data-map.md does (#516).
- **Kit:** `/home/joel/askrigor-releases/20261124-release-h/` (README-RELEASE.md, RESULT.md, every log).
