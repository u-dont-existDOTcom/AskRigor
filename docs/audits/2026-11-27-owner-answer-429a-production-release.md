# Production release, 2026-11-27 (release J: the free-use notice in Gemini's own sign-in, 419a's terms page, and the privacy page)

- **Owner decision:** the owner chose 429a, "Yes: merge the four and release it", typed in the coordinator's chat at
  2026-11-27T20:25:36Z (question 429, "Release the Gemini fix: AskRigor shows its free-use notice during Gemini's
  sign-in?"): merge #529, #526, #531 and #532 in that order, then a server release with migration 0044 and the privacy
  page's new sentences; rollback: the previous image, after mapping the new label back. Nothing else: no setting change,
  no Auth0 change (419a's post-login Action stays in the repository, not installed: its own question), no new
  environment variable (`ASKRIGOR_AUTH0_TERMS_SECRET` stays unset, so `/account/terms` answers 503 and nothing links to
  it), no tool-list change. The Gemini sign-in step log (`ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS=enabled`, on since release
  E2) stays on as it is.
- **What changed for people:**
  - **Gemini's sign-in shows AskRigor's free-use notice (#532).** Gemini can't show the notice in its chat, so an
    account used only through Gemini could never accept it, and every research call there was refused (the owner's
    tries of 27 Nov: "gemini is still not working"). After the person signs in and before "Connect Google Gemini to
    AskRigor?", an account whose yes doesn't cover the current notice is shown it, word for word, on AskRigor's own page,
    with "Accept and continue" and "Decline". Accept records the yes as `accept_free_contributor` does, noted
    `PERSON_SIGN_IN_PAGE`, only for the notice version shown, then the consent step says it was recorded; Decline
    records nothing and the consent step follows all the same (Gemini connects; research stays refused until the notice
    is accepted or paid private access is active). Each step's form token answers once: a double press gets the same
    answer, the other answer is refused, a Decline never becomes a yes. An account whose yes covers the current notice,
    the owner's own login and an active paid private account go straight to the consent step, as before (its page
    byte for byte release I's but for two stylesheet rules used only by a note). A research refusal on Gemini for want
    of the notice now tells the person to remove AskRigor in Gemini's settings and add it again.
  - **419a's terms page (#531), not reachable yet.** `/account/terms`, AskRigor's page for the notice right after a
    first sign-in, between Auth0's post-login Action and Auth0's `/continue`, is in the code and answers 503 until the
    owner decides on the Action and its secret. Migration 0044 widens 0031's notice acceptance check, under its own
    name, to admit `PERSON_SIGN_IN_PAGE`, and adds `research_terms_page_answers` (a token's SHA-256, its first answer and
    when it can no longer be used; nothing that names a person), reached only by the research-access role, whose script
    now grants select, insert and delete on it.
  - **The Atlas clock test fix (#529):** the finding page passes its own clock to the person-claim marks.
  - **The privacy notice (the site release, from this record's own pull request, after the server).** "Effective November 27, 2026"; in "Connecting Google Gemini",
    #532's sentences: the notice shown before the choice, what Accept records (the notice version, the time, and that the
    yes was given on that page), that Decline records nothing, and the one-way fingerprint of the step's form kept with
    the answer for about eleven minutes. The roadmap's 25 November fold (release I's) and 15 November fold (#473's
    record, #526) went live with it, and the fold for this release.
  - The same 35 tools (no app refresh), HRP 20.6.46 and Universal 20.5.46; no setting or plugin change.
- **Contents:** six merges since release I (`2ba3047d`, live since 25 Nov 01:37:49 UTC): #524 (`d78223bb`, release I's
  privacy page, live since its site release), #525 (`e3c3a31a`, release I's record and roadmap line), #529 (`ead32cb0`,
  at `1db1b871`), #526 (`209f586c`, at `afd87d11`), #531 (`f7360595`, at `7ed124fc`: the reader-role guard of 0044 that
  GitHub's real-database acceptance asked for) and #532, merged at 21:04:28 UTC (its commit time) as **M =
  `63a5688b21e546f906f064b5cd3e5629e97a0627`** (at `61bc8640`, #532's head with main merged in; tree equal; GitHub's 7
  checks passed on each head). Against `2ba3047d`: packages/, infra/, ops/ and scripts/ change in exactly twelve files
  (migration 0044, SHA-256 `eabb34ea5243004270fb1fc099276d17cf1a857a54d6892dcd8f44d3f2a93f4e`; the evidence
  repository's index.ts, postgres.ts (0044 last of 44), research-contributor-access.ts and terms-page-answers.ts; the
  access role script `804ed034...`, three lines added; the infra README's 0044 section; the Auth0 Action's three files;
  two acceptance scripts); the setting names the code reads are release I's 164 and `ASKRIGOR_AUTH0_TERMS_SECRET`;
  protocols/, the tool-list fixtures, the plugin's packaged files, the lockfile, every Dockerfile and compose file
  unchanged.
- **Before deploying:** GitHub's 7 checks passed on each merge's head (build.sh reads them: BUILD_CHECKS_OK at
  21:08:41 UTC in the kit's first check of M, the log's write time, and again at 21:21:51 UTC before the build). The kit's checks on M's tree before the build (KIT_READY, 27 Nov): its own image of the same tree, no
  network: CANDIDATE_OK, RELEASE_J_PROBE_OK (Gemini's notice step through its real routes and authorization server, a
  browser behind the proxy's no-referrer: shown, accepted, declined, another version shown, asked nothing of three kinds
  of accounts, a store that doesn't answer; /account/terms 503; migration 0044 last of 44), failing on release I's
  image as it must; RELEASE_I, H, G, F, E and D, LEDGER_OFF, NEW_SETTINGS, PUBLIC_DOSSIERS_OFF, PERSON_MARK,
  SAFETY_LIMITS, SAFETY_LIMITS_LIVE and SERVICE_READS all OK. On a throwaway PostgreSQL 17.6 built as production's
  (release I's migrate and role scripts, an account accepted in an AI app): stage B's 0044 gate, M's migrate twice, M's
  role scripts, stage B's database block as rendered (DB_CHECKS_OK), M's code recording a `PERSON_SIGN_IN_PAGE` yes and a
  token's one answer as the access role, the reader refused the new table, release I's code unable to read that
  account, the rollback's mapping, then release I's code reading both accounts and release I's migrate recording nothing
  new: DB_CHECK_LOCAL_OK.
- **The go and the build:** the release helper read the clock at 21:21:16 UTC on the coordinator's GO for the release's
  second phase; the resource check said a heavy job was fine at 21:21:53 (12.0 GiB available, swap 19%).
- **Source and image:** source archive SHA-256 `521b030bc4507286bc348afdb262fdaed79c6081c88a4a0d93c9b9e66754ebe7`
  (11,567,844 bytes); image `sha256:0a3e0e6ac60a3c0a3e741e4377cbb22bd632855b9c67050fefb4e5b486f2173e` (archive
  123,741,024 bytes, SHA-256 `1622302acacdcfacc60bb2a71bbcf0adb770dfbcc86be62fab4f7a22ef8013e1`), built at 21:22:47 UTC
  (every layer from the build cache), copied to the host and BUILT at 21:23:54; during the build the lowest available
  memory was 11,701 MiB and the highest swap 18%. The build refused unless the chain from M back to `2ba3047d` was exactly
  the six merges, each at its checked head with its tree, GitHub's record and passed checks and only its own files, and
  unless M changed nothing else and read no setting name but `ASKRIGOR_AUTH0_TERMS_SECRET`. On the image, no network, no
  setting: CANDIDATE_OK (/version HRP 20.6.46 2026-11-22 `d7dd9929...`; `/account/terms` 503; one log line, none naming a
  credential class); RELEASE_J_PROBE_OK (as above; the consent page for an accepted account release I's byte for byte but
  for the two `.note` rules, 89 bytes, and release I's headers); the earlier releases' probes as regression checks:
  RELEASE_I, H, G, F, E and D_PROBE_OK, LEDGER_OFF_OK, NEW_SETTINGS_PROBE_OK, PUBLIC_DOSSIERS_OFF_OK, PERSON_MARK_PROBE_OK,
  SAFETY_LIMITS_PROBE_OK, SAFETY_LIMITS_LIVE_OK, SERVICE_READS_OK.
- **Before the switch, from outside (21:24:15 UTC, release I live):** the consent form's POST with `Origin: null`
  answered 400 ("This sign-in took too long or was opened in another browser.") same-origin and 403 ("incomplete or
  malformed") cross-site; each of the 9 public pages equal to the live site's d78223bb files, and to M's but for the
  privacy and roadmap pages (not live until the site release).
- **Prior state (stage A, the host read at 21:24:38 UTC):** research-mcp on `2ba3047d`, healthy (started
  2026-11-25T01:37:49.72264722Z; image `sha256:343a0a3b...`); runtime.env and the selector exactly as release I left them
  (SHA-256 `ccefcfaab7641a9a` and `54e7b24a4139c72b`; 104 names, every kept line as written, the step log line set in the
  service, no `ASKRIGOR_AUTH0_TERMS` line); the site release I's `d78223bb`; the promotion timer enabled and active. The
  image archive was copied, its checksum checked and the image loaded on the host with the build's ID. Stage B's own
  checks, read-only, as rendered for M (21:24:51 UTC): STAGE_B_PRECHECKS_OK (the review role script release b's, as M's;
  the access role script release b's, for step 6 to replace; 0044 not applied yet). The 159 Gemini step lines were copied
  into the kit before the switch, the owner's tries of 27 Nov among them; the newest sign-in step was at 16:59:50 UTC (a
  token issued to Google), 15,935 seconds old, past the kit's 10 minutes.
- **Switch (stage B, 21:25:25 to 21:26:18 UTC, at 1,274 quiet seconds):** rollback tag
  `askrigor-research:rollback-pre-63a5688b21e5` = 2ba3047d's image (`343a0a3ba68b`); the load skipped (stage A loaded it
  with the build's ID); READER_OK; rollback folder `/opt/askrigor/rollbacks/pre-63a5688b21e546f906f064b5cd3e5629e97a0627`
  with a dump taken before 0044 (19,113,175 bytes, SHA-256 `0bb555f5583e0667...`); the promotion timer stopped; migrate
  complete, 0044 applied and recorded (`eabb34ea52430042`); the review role script re-run with its same bytes (70 grants)
  and the access role script's new bytes written in place, read back from the database container and run (31 grants);
  stage B's database block: each role may run exactly its script's functions (68 and 21), the access role's table rights
  with `research_terms_page_answers` select, insert and delete, 0044's check admitting `PERSON`, `PERSON_SIGN_IN_PAGE` and
  the owner's instruction, the new table's three columns and two indexes, no right on it for the reader, PUBLIC or the
  review role, and the earlier boundaries as before; runtime.env's build line only (104 names, SHA-256
  `8554384f6e41ee05`; the selector `9f826b9176d38fb0`); **research-mcp on M from 21:26:10 UTC** (docker's StartedAt on
  the host, 2026-11-27T21:26:10.121781368Z), healthy, with the same 110 setting names and mounts and the switches read as
  before (the step log on, safety limits on, Atlas news in shadow); `ASKRIGOR_AUTH0_TERMS_SECRET` not in the service;
  inside it `/account/terms` answered 503 and the notice step's address 405 (POST only); 2 log lines, none naming an
  error.
- **Stage C (21:26:18 to 21:28:25 UTC):** /version names M with HRP 20.6.46 (`d7dd9929...`); 35 tools equal the fixture;
  the three compiled tool lists equal; the 9 site pages equal the live site's own files (d78223bb, before the site
  release); the container: user node, read-only, all capabilities dropped, no new privileges, 1 GiB, 256 processes; in
  the live container RELEASE_J_PROBE_OK (without its whole-server part), RELEASE_I_PROBE_OK, JIT_OFF_OK, RELEASE_H, G, F,
  D and E_PROBE_OK and READER_OK; LEDGER_OFF_OK and PUBLIC_DOSSIERS_OFF_OK in a container of the new image; the promotion
  ran once on M (success, exit 0: the atlas_findings queue, 2 complete and 2 with nothing pending) and its timer is back
  on (next run 21:30:07 UTC). The log's headers for release I's and H's probes carry the next release's letter (a
  renaming in the kit); their verdict lines are their own.
- **Acceptance through https://mcp.askrigor.com (21:28:25 to 21:29:14 UTC; its host part read at 21:29:08):** /version
  names M with HRP 20.6.46; `get_protocol_manifest` from outside for HRP and Universal names M, with no sentence about an
  out-of-date tool list; /mcp: 35 tools equal to the frozen fixture; E2's Gemini checks (the four metadata addresses and
  the resource metadata, the consent POST 400 same-origin and 403 cross-site, /mcp/gemini initializes with 22 tools, a
  made-up token 401 naming the metadata); release H's (the refresh notice word for word, the exact addresses 10 of 10,
  refused links and calls); release I's (the sign-in's error pages 400 with AskRigor's policy and no
  Cross-Origin-Opener-Policy); **release J's own:** `/account/terms` GET and POST 503, with no form, cookie or redirect;
  the notice step's address answers GET with 405 (POST only), a cross-site POST with 403 and a same-site POST with no
  session with 400 (session_expired), each with AskRigor's policy; 16 of 16 public pages, Atlas and sign-in pages and
  metadata documents read, none linking `/account/terms` (RELEASE_J_PUBLIC_OK); the user count, the signed-out Atlas (12
  finding pages, no problem), the write-ups' route 404 and How to research 200; the 9 pages equal d78223bb's; the host: M
  healthy as the selector and the build line name it, 104 names, every kept line as written, no `ASKRIGOR_AUTH0_TERMS` line
  or secret, 503 and 405 inside the service; the step log since the switch: 18 lines, fixed names only, the acceptance's
  marker in none: ACCEPTANCE_OK.
- **Readers, plugin receipt, connector probe, rollback read:** the readers (21:29:18 UTC): every switch as before, the
  terms secret not set, no notice step line yet; PLUGIN_RECEIPT_OK (8 packaged files, none changed since `2ba3047d`; the
  source copy and the installed copy equal M's); the coordinator's Claude connector probe (/mcp/claude, 21:29:50 UTC):
  CONNECTOR_PROBE_OK (35 tools, `tool_list_version` `ad0494d60fd2376b`, HRP 20.6.46 `d7dd9929...`, Universal 20.5.46
  `e313306b...`, build M, sign-in accepted, research access ready, no out-of-date sentence); the rollback read (21:29:24
  UTC): the tag is 2ba3047d's image, the folder's selector and runtime.env name 2ba3047d and the kept runtime.env equals
  the live one but the build line, the site d78223bb. J_READS_DONE at 21:29:24.
- **The site:** from the merge of this record's own pull request, after the server: the site commit's archive and
  d78223bb's for a rollback (byte for byte release I's), 300 quiet seconds, the install (Caddy recreated), every page
  against the commit's own files, then the second acceptance; its time and result go into the next records update.
- **Rollback (not used):** `FORCE_ROLLBACK=1 ./rollback.sh` in `/home/joel/askrigor-releases/20261127-release-j`: the
  promotion timer stopped, every account noted `PERSON_SIGN_IN_PAGE` mapped to `PERSON` as the migrator (counts only)
  before release I's image serves, the selector and runtime.env from `/opt/askrigor/rollbacks/pre-<M>`, research-mcp on
  `2ba3047d`'s image (tagged `askrigor-research:rollback-pre-63a5688b21e5`), the mapping again right after the switch,
  then no row may hold the label. 0044 stays (additive; undo no migration), with its table and the access role's grant.
  The site alone: `FORCE_ROLLBACK=1 ./site-rollback.sh` (d78223bb's archive again).
- **Not checked:** a real Gemini link through Google's relay with the notice step (the owner's step: remove AskRigor in
  Gemini, add it again, sign in and accept the notice); Firefox and Safari.
