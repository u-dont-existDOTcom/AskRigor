# Production release, 2026-11-21 (the public user count, Gemini's sign-in, Atlas news stage 1 in shadow)

- **Owner decision:** owner answers 393b, 394a and 397a, typed in the main session's chat (session 54b594ed, second
  Claude account) on 21 Nov 2026 at 13:25:27 UTC: "393b 394a 395b 396b 397a 398a". 393b: release the public user count
  and show it now (small numbers as "fewer than 10"). 394a: release Gemini's sign-in as built (a new database table, a
  server setting and a secret made on the server, never shown), then a test with a Gemini app; the Add page's Gemini
  section waits for that test. 397a: release Atlas news stage 1's server part with news private (shadow). Nothing else
  was authorized (no other setting, no database change beyond migrate and the two role scripts, nothing of 366b, 365
  or 348a, no paid API).
- **Contents:** #501, merged at 14:45:11 UTC as `98ec69b94d82140169ab5edc0b23ebef0fef5446` (parents `263048eb`, the live
  build since 19 Nov, and `05972b29`, the checked head; the merge's tree equals the head's). It merges #498
  (`e9b865b0`), #499 (`1db9689e`) and #500 (`59476285`) onto main, then holds back the Add page (`c2e97957`) and dates the
  privacy notice (`05972b29`); 26 commits and 67 files against `263048eb`.
  - The public user count (#498, 393b): `ASKRIGOR_PUBLIC_USER_COUNTS=on`; the home page shows the research server's
    image (`/atlas/users.svg`) and links the text page `/atlas/users`; numbers under 10 read "fewer than 10".
  - Gemini's sign-in (#499, 394a): AskRigor's own authorization server for Google's Gemini app at
    `https://mcp.askrigor.com/oauth/gemini`, for `/mcp/gemini`; migration `0039_gemini_oauth_store` (one table, sealed
    rows); the access role's SELECT, INSERT, UPDATE and DELETE on it; `ASKRIGOR_GEMINI_OAUTH=enabled` and
    `ASKRIGOR_GEMINI_OAUTH_SECRET`, made on the host and never shown. Its login uses the Atlas's Auth0 application.
  - Atlas news, stage 1 (#500, 397a): migration `0043_atlas_news_items` (two tables, a sequence, four SECURITY DEFINER
    functions; no role holds a table right); the access role runs `stage_atlas_news_card`, the review role
    `commit_atlas_news_day`, `withdraw_atlas_news_items` and `inspect_atlas_news`; `ASKRIGOR_ATLAS_NEWS=shadow`.
    Nothing shows publicly; the news check's own part is on the laptop.
  - The privacy notice: the user count and "Connecting Google Gemini" sections, effective November 21, 2026. The terms
    (November 16, 2026) and the Add page are unchanged.
  - Packages: oidc-provider 9.15.0. The tool list is unchanged (35 tools; tool list versions mcp `0d6016087ee4bc5a`,
    claude `ad0494d60fd2376b`, gemini `9a334c4e7a117921`).
- **Before deploying:** GitHub's seven checks passed at `05972b29` (the main session's reading before the merge). The
  release kit's own checks, on the laptop: a throwaway PostgreSQL 17.6 (production's image) given `263048eb`'s migrate
  (its image) and role scripts, then the merge's migrate (additive: no existing function, column, constraint, index or
  trigger changed; exactly 0039's and 0043's objects added), its role scripts (nothing taken away), stage B's own
  database checks, the acceptance queries and stage D's query, `263048eb`'s migrate replayed (nothing changed), and the
  merge's own PostgreSQL acceptance (PASS, 121 checks) and Gemini's sign-in acceptance (PASS): LOCAL_DB_CHECK_OK, last
  run at 15:29:12 UTC. One read-only Codex review of the kit (15:10 to 15:15 UTC, "fix first"): six findings (three P1,
  three P2), all fixed before the host was touched beyond read-only looks.
- **Source and image:** source archive SHA-256 `a7bde97e9fb7b7c07bfe021e4bfe07ee96642d9e8432451fe8f2d2ffe1c8f492`; image
  built 15:26:19 to 15:27:15 UTC, id `sha256:a68e144c39112eed928b0413662c781ca80f818904f8cd79bad53058544f7bc0`, user
  `node`, workdir `/app`; the findings ledger probe (LEDGER_OFF_OK), the settings probe (with no setting all three
  switches off; with the four lines, in the probe's own process, the user count on, Gemini's sign-in on with issuer
  `https://mcp.askrigor.com/oauth/gemini`, news in shadow; the three start refusals) and the service reads passed in
  containers with no network; the disposable candidate answered `/healthz` and `/version` (HRP 20.6.43, Universal
  20.5.46) with one log line and none naming a credential class, and was removed; image archive 123,193,898 bytes,
  SHA-256 `f6477463ac9b865fc501b3a1a2ebf35c64f9c112e9fd5106b0bff9760c392b6f`.
- **Prior state (stage A, 15:28:13 UTC):** research-mcp on `263048eb`, healthy; compose `15d3cc3a` and the role scripts
  `1649203c` and `3292cbcf`; `runtime.env` 94 names, with `ASKRIGOR_OAUTH_ENABLED=true` and the Atlas Auth0 client id
  and secret (one line each), none of the four new names and no Gemini sign-in line; the service's own reading: research
  access and review configured; the promotion timer enabled; the site on `bc71b90e`'s release; 61 GB free. Stage A's
  first run (15:24 UTC) had stopped on its own precondition: it counted the Gemini video tool's
  `ASKRIGOR_GEMINI_API_KEY` and `ASKRIGOR_GEMINI_BILLING` as sign-in lines; the kit was narrowed to the sign-in's names
  and stage A passed again. Before stage B (15:31:32 UTC): a research session in ChatGPT, newest call 15:29:05 UTC, 14
  calls in 30 minutes, no active database connection of the service; the kit waited for 300 quiet seconds (15:34:05)
  and read 304 seconds right before stage B.
- **Stage B (15:34:09 to 15:35:07 UTC):** the earlier image tagged `askrigor-research:rollback-pre-98ec69b94d82`
  (`263048eb`'s image, `eb514fc9`); the image loaded and checked against the build's id; the forum reader read through
  the new image; the prior files and a database dump (18,436,028 bytes, SHA-256 `7d08c50a…`) kept in
  `/opt/askrigor/rollbacks/pre-98ec69b94d82140169ab5edc0b23ebef0fef5446`; the promotion timer stopped; migrate recorded
  `0039_gemini_oauth_store` (`2e5aba940fab5c74`) and `0043_atlas_news_items` (`51a498d216b6c5fe`) with the notice check
  still admitting v6; both role scripts run (review 42 GRANT, exactly its 40 functions; access 28 GRANT, exactly its 19);
  the boundaries, the dossiers, Gemini's table (no right for the reader, PUBLIC or the review role) and the news objects
  (no right but the owner's; no item) as expected; `runtime.env` changed in its build line only; **research-mcp
  recreated on the new image, started 15:34:58 UTC, healthy**, seeing the same 100 setting names and mounts as before,
  with the three new switches off.
- **Stage C, first run (15:35:29 to 15:37:32 UTC), not passed:** run-bc.sh had stopped at 15:35:07 with exit 126 because
  the laptop's run-c.sh lacked its executable bit (nothing on the host was involved); stage C was then started by hand.
  Every check passed (`/version` names the build with HRP 20.6.43; the public tool list and all three tool list
  versions equal their fixtures; the site's eight pages still `263048eb`'s; the findings ledger probe) and the
  promotion one-shot succeeded, but the check of the timer's next run failed: the timer is Persistent with a
  five-minute calendar, its 15:35 run was missed while stage B had it off, and enabling it at 15:37:32 started a
  catch-up run at once (15:37:33 to 15:37:34, success), for which `systemctl list-timers` shows no next run for a
  moment. A read-only look at 15:38:14 showed the timer enabled and active, next run 15:40:08. The check now reads the
  next run again for up to 60 seconds.
- **Stage C, second run (15:39:52 to 15:41:39 UTC), on the main session's word:** the same checks passed (the protocol
  loads; the free contributor notice reads `free-contributor-v6-2026-11-15`; the forum reader probe and the all-journal
  search passed; one log line, none with a credential-like marker); the promotion one-shot succeeded ("no pending
  promotion"); the timer enabled and active, next run 15:45:10.
- **Stage D (15:41:51 to 15:42:20 UTC):** before any change, the preflight (the service's own code on its own
  environment) read the research-access and review configurations and Gemini's settings as they would be: issuer
  `https://mcp.askrigor.com/oauth/gemini`, the Atlas's Auth0 application. `runtime.env` was kept as
  `runtime.env.before-stage-d` in the rollback folder; the four lines were written (the secret made on the host with
  `openssl rand 32 | basenc --base64url | tr -d =` and written from a variable, never shown); `runtime.env` 98 names
  (94 before). **research-mcp recreated at 15:42:07 UTC, healthy**; it sees the four names (the secret checked by
  `test -n` only) and its other 100 setting names unchanged, and reads the user count on, Gemini's sign-in on and news
  in shadow; `/version` names the build; the public tool list unchanged (35 tools). The automatic undo was not needed.
- **Site (15:42:29 to 15:42:58 UTC; installed at 15:42:42):** the public-site archive of the merge (tar SHA-256
  `a425865dc1dcbf30bd80b00c3879927bb0f32d4c720582ab4bb7d9b88cfdf143`, equal to `git archive` of the merge, made with the
  merge's own script and validator) activated as release `98ec69b9…` (before: `bc71b90e…`); every checked page equals
  the merge's file and the Add page equals `263048eb`'s; the privacy notice reads "Effective November 21, 2026", the
  terms "Effective November 16, 2026"; the home page carries the user count image; the Atlas answers through the apex.
- **Acceptance (15:43:02 to 15:43:13 UTC):** `/version` names the build. Gemini: the four metadata addresses and the
  resource metadata answer 200 naming the issuer `https://mcp.askrigor.com/oauth/gemini`; `/mcp/gemini` without a token
  initializes (22 tools); a made-up token gets 401 whose challenge names
  `https://mcp.askrigor.com/.well-known/oauth-protected-resource/mcp/gemini`; `/mcp` answers as before (35 tools, equal to
  the frozen list). The user count: the home page shows the image and the footer link; the image and
  `https://askrigor.com/atlas/users` read "fewer than 10" for both numbers (AskRigor accounts; used it in the past 7
  days). News: no item (`SELECT state, count(*) … GROUP BY state` returns no rows); the grants on the new tables,
  sequence and functions are as the runbook says. No account record was read.
- **After:** the readers' read (15:43:22) shows the user count on, Gemini's sign-in enabled with its secret set (not
  shown) and no diagnostics or separate login client, news in shadow, and the earlier switches as before. The plugin
  receipt (15:43:24) found no packaged file changed since the live build; the source and installed copies equal the
  merge's (no reinstall). The rollback read (15:43:28) found the rollback tag on `263048eb`'s image and the kept files
  (`runtime.env` with 94 lines naming `263048eb`, none of the four lines; `runtime.env.before-stage-d` naming the build,
  none of the four).
- **Accepted:** the main session's own check after the release: `/version` names the build, `/atlas/users` reads
  "fewer than 10" for both numbers, the privacy notice reads November 21, Gemini's resource metadata answers, its
  connector's `list_news_items` returns an empty day and `get_protocol_manifest` reports the tool list current. The news
  check's own stage 1 switch (on the laptop) went on at 15:46:19 UTC.
- **Rollback:** never migrate or run a role script; 0039 and 0043 are additive and stay, and `263048eb` never reads
  their tables. The four settings alone: `stage-d-undo-host.sh` puts `runtime.env.before-stage-d` back and recreates
  research-mcp (any Gemini link ends with its secret). Gemini alone: remove its two lines and recreate; to end every link
  for good, `DELETE FROM living_evidence.gemini_oauth_store;` as the migrator, only on the owner's word. News alone:
  `ASKRIGOR_ATLAS_NEWS=off` and recreate. The image: the selector and `runtime.env` from the rollback folder, then
  recreate research-mcp on `263048eb`'s image, with the timer stopped meanwhile; then the site with the kit's
  `site-rollback.sh` (an archive of `263048eb`'s site, made with its own validator).
- **Not yet done:** the Auth0 callback `https://mcp.askrigor.com/oauth/gemini/callback` in the Atlas's application
  (the owner's); the test with a real Gemini app (394a); after it, the Add page's Gemini section and the roadmap's line
  for Gemini's sign-in go public together, in one site release. Release kit and logs, on the maintainer's laptop:
  `/home/joel/askrigor-releases/20261121-release-498-499-500/`.
