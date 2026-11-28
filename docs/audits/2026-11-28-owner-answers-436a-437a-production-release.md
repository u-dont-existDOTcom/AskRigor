# Production release, 2026-11-28 (releases K and L: the error log and its box, Gemini's name and report tool, the Add page's Gemini steps, the support page's addresses, the full-protocol switch released off)

- **Owner decision:** the owner typed "436a 437a" in the coordinator's chat at 2026-11-28T17:51:38Z. Question 436, a:
  "release all three now" (release K: #539, the error log; #540, Gemini: AskRigor's name without version numbers and a
  report tool; #541, the Add page's Gemini steps, its menu step as written, fixed later if the owner names the menu).
  Question 437, a: "Release all four right after K" (release L: #550, the unticked box at the notice; #549, the support
  page's addresses and link; #551, the full-protocol switch released off, with #520's hand-over; #552, 435a's plan built
  in the background). Nothing else; every setting a pull request adds keeps the value its pull request and question name.
- **#552 is held, not released:** it could not be merged after #551 without a code decision (#551 and #520 changed the
  registration flow that #552 moves into the background: the plan's menu for a receipt, claim accounting and HRP's core
  hand-over). The coordinator, at 18:05 UTC: go on without #552; the other coordinator session rebuilds it on main after
  #551, and it goes out with the next release. Releasing five of the six approved items stays inside 436a and 437a.
- **What changed for people:**
  - **The error log (#539, 432 1b and 433a).** Research tool calls that end in an error, and calls over 10 seconds even
    when they succeed, are logged: the time, how long, the tool, the app if known (ChatGPT, Claude, Gemini, other,
    unknown), public paper numbers (PMID, PMCID, DOI), and for a failed call a fixed error kind and source and the
    search's shape (fields filled, word counts, options). The words of a failed search are kept only for an account that
    has turned on "Keep my failed searches", for six named search tools with a known, non-YouTube destination, after a
    screen takes out e-mail addresses, links, domains, IP addresses and long digit runs (anything else it flags drops the
    words). Never kept: account, user, session or request IDs, IP addresses, credentials, raw errors, results, answers or
    source text. Every entry is deleted after 30 days (an hourly sweep and one at startup). The owner's developer
    accounts start on (through the existing developer-account list); every other account starts off
    (`ASKRIGOR_KEEP_FAILED_SEARCHES_DEFAULT` unset). The Atlas account page has the switch ("Research privacy": "Keep my
    failed searches", On/Off).
  - **The box at the notice (#550, 434a).** Where people accept AskRigor's notice (the sign-in step, and Gemini's sign-in),
    one unticked box: "Help fix AskRigor: keep my failed searches for 30 days". Ticked with Accept, it turns the
    preference on; unticked, Decline, a replayed link or a doubled value change nothing. In chat, `accept_free_contributor`
    takes `keepFailedSearches: true` (in `later_inputs` only) on the person's own yes.
  - **Gemini (#540).** AskRigor's display name is "AskRigor" alone on every surface (the machine name and version field
    keep their form); Gemini's catalog gains `submit_lesson_candidate` (23 tools, under Gemini's 25,000 bytes; no
    research tool removed; `finalize_research` stays out). **Gemini users reconnect once** (remove AskRigor in Gemini's
    settings, add it again) to load the new list. ChatGPT's and Claude's 35 tools are unchanged: no refresh there.
  - **The Add page (#541):** how to add AskRigor to Gemini (the server address `https://mcp.askrigor.com/mcp/gemini`,
    signing in, accepting the notice, allowing Gemini, and what to do if Gemini says the connection failed). Its menu
    step is in general words, as 436a allows, until the owner names the menu.
  - **The support page (#549):** `/donate`, `/donations`, `/donation` and `/sponsor`, with or without a trailing slash,
    answer 301 to `/support`; every page's footer says "Support AskRigor", and the home page has the link under its
    introduction; the Atlas pages' footer too.
  - **The full-protocol switch (#551, with #520), released off:** `ASKRIGOR_FULL_PROTOCOL`, `ASKRIGOR_HRP_CORE`,
    `ASKRIGOR_CLAIM_ACCOUNTING` and `ASKRIGOR_PLAN_INDIRECT` are unset, so every text and result is as before; nothing
    changes until the owner's measurement and its own question. `set_research_trial` gains `fullProtocol` in its
    `later_inputs`; the frozen tool lists are unchanged.
  - **The privacy notice (the site release, after the server):** "Effective November 28, 2026"; #539's 433a words
    (owner-pages `askrigor/error-log/privacy-words-1b.md`, after Codex's review) and #550's sentence ("You can turn it on
    when you accept AskRigor's notice, and on or off at any time on your Atlas account page.").
  - HRP 20.6.46 and Universal 20.5.46 unchanged.
- **Database:** migration 0045 (`0045_research_error_log`, SHA-256
  `edb6ecb429707075ac0173776feece2292f819ebba4b9d34002d78d74d3915d7`): the UNLOGGED table `research_error_log` (no row
  contents in the WAL, replicas or physical backups; eleven columns, twelve checks, a time index; the table's own check
  refuses search words for YouTube or Gemini sources) and the nullable boolean `keep_failed_searches` on
  `research_use_accounts`; guarded grants. The research-access role script (`8f074c3b...`, ten lines added) grants the
  runtime INSERT and DELETE on the log, SELECT on `received_at` only (never the words) and UPDATE on the new column. The
  group role `askrigor_error_log_reader` was made NOLOGIN, with no member, before the migration (the infra runbook's
  step), so 0045 gave it USAGE on the schema and SELECT on the log and nothing else. **No login or password was made for
  anyone: who may read the log is the owner's decision**, after which a maintainer login is made a member of that role
  and `scripts/read-research-error-log.mts` can be used.
- **Contents:** seven merges since release J (`63a5688b`, live since 27 Nov 21:26 UTC): #533 (`16c82be6`, release J's
  site, live since its site release), #539 (`a5f09bf1`, at `b13eed10`), #550 (`f69df332`, at `0eeb9924`, retargeted to
  main after #539), #540 (`5bc6ca55`, at `06de50db`), #541 (`b4530bc1`, at `183360f5`), #549 (`6bac88ae`, at `dbcf6b75`)
  and #551, merged at 18:43:50 UTC as **M = `6c6a93567ac6cfb07dcde3ac1646e2f31bd6ac31`** (at `2f05a6e7`: main merged into
  the branch by hand, because GitHub's update could not merge one conflict, #550's `keepFailedSearches` guard and #551's
  `researchTrial` guard at the same place: both kept, nothing else changed by hand). Each pull request was marked ready,
  brought up to date with main and merged at its checked head after its 7 checks passed and main's tip was read. Against
  `63a5688b`: packages/, infra/, ops/ and scripts/ change in exactly thirteen files (migration 0045; the evidence
  repository's index.ts, postgres.ts (0045 last of 45), research-contributor-access.ts and research-error-log.ts; the
  access role script, ten lines added; the infra README's error log section; the public site's Caddyfile; five scripts);
  the setting names the code reads are release J's 165 and the five above; the mcp and claude tool lists, protocols/, the
  plugin's packaged files, the lockfile, every Dockerfile and compose file unchanged; Gemini's list is #540's.
- **Before deploying (Phase 1, the kit `/home/joel/askrigor-releases/20261128-release-kl`):** BUILD_CHECKS_OK on M; on an
  image of M's tree (`eef1458f`), no network, no setting: CANDIDATE_OK, RELEASE_KL_PROBE_OK (the error log's entry
  builder, screen, preference rule and store; the box; Gemini's 23 tools and the title; the four switches off; the Atlas
  footer; HRP and Universal; the three tool lists; failing on release J's image, as it must), release J's, I's, H's, G's,
  F's, E's and D's probes and the other regression probes (two pins changed on purpose: Gemini's list, the migration list
  of 45). On a throwaway PostgreSQL 17.6 built as production's (release J's migrate, role scripts and two accounts):
  stage B's gates, the NOLOGIN reader role, M's migrate twice, M's role scripts, stage B's database block as rendered,
  M's code writing the box's choice, the account switch and the error log as the access role (an entry older than 720
  hours refused, words for YouTube or Gemini refused by the table, the words unreadable to the runtime, the 30-day
  sweep), the reader and review roles refused the log, a throwaway login in the reader role read the log and nothing
  else (there only), and the rollback (release J's code reading and writing accounts on the migrated database, the log
  emptied by the rollback's own two statements, release J's migrate recording nothing new): DB_CHECK_LOCAL_OK.
- **Source and image:** source archive SHA-256 `651889be3f794186151bdee91abbfa84665a3f3b5907678fa2f05aa8167af797`
  (11,696,953 bytes); image `sha256:f7057bb74d28eb7b597ba26460d214478dc7c9852f360521d257a5b197634c8e` (archive
  123,842,435 bytes, SHA-256 `7370079e606b225069a1a8721b31502e39b79592d846faa0935c23a72d224115`), built at 18:46:44 UTC
  (the lowest available memory during it 9,657 MiB, the highest swap 41%), copied to the host and BUILT at 18:47:55. On
  the image: CANDIDATE_OK, RELEASE_KL_PROBE_OK and every regression probe OK, SERVICE_READS_OK.
- **Prior state (stage A, 18:48 UTC):** research-mcp on `63a5688b`, healthy; runtime.env (`8554384f6e41ee05`, 104
  names) and the selector (`9f826b9176d38fb0`) exactly as release J left them; the site 16c82be6; the timer on; every
  kept line as written; no line of the five new settings; `ASKRIGOR_ATLAS_REVIEW=enabled` kept; the role
  `askrigor_error_log_reader` not there yet. Read-only, for #539's runbook: **no host job runs pg_dump** (cron, systemd
  units, /usr/local, /opt/askrigor but its rollbacks, site and state); the one timer naming a backup is Debian's own
  `dpkg-db-backup` (the package database, not PostgreSQL); the database's statement logging keeps no row payloads
  (`log_statement` none, `log_min_duration_statement` -1, `log_parameter_max_length_on_error` 0). The kit's own
  rollback dump (stage B, step 3) was taken before 0045, so it holds no error log; a later kit's dump should add
  `--exclude-table-data=living_evidence.research_error_log` (the runbook). Volume snapshots at the hosting provider, if
  any, are not visible from the host.
- **The switch (stage B, 18:49:33 to 18:50:33 UTC, 14,280 quiet seconds before it; the newest Gemini sign-in step 19.7
  hours old):** the rollback tag `rollback-pre-6c6a93567ac6` (release J's image `0a3e0e6ac60a`); the rollback folder with
  a dump (19,170,283 bytes, SHA-256 `f87c296e98f5c0dd...`); the promotion timer stopped; step 4b: the role
  `askrigor_error_log_reader` made NOLOGIN, no member; migrate (0045 applied); both role scripts (the access role's new
  bytes); stage B's database checks (0045 unlogged, its columns, checks and index, the access role's rights, the reader
  role's, the earlier migrations' boundaries); runtime.env's build line only (104 names, `54a3c65ea71affc6`); the
  selector (`822d4267bf2e3d6b`); research-mcp recreated on M at 18:50:23 UTC, healthy, with the same 110 setting names
  and mounts, the kept lines read as before, the five new settings read as off, `/account/terms` 503 and Gemini's notice
  step on.
- **Stage C (18:52:57 UTC):** /version names M with HRP 20.6.46; /mcp 35 tools equal to the fixture, title "AskRigor";
  /mcp/gemini 23 tools equal to #540's fixture, title "AskRigor"; the three compiled lists equal their fixtures; release
  K+L's probe and J's, I's, H's, G's, F's, E's and D's in the live container OK; the findings ledger and public dossiers
  probes OK; the promotion run once (success) and its timer back on (PROMOTION_OK).
- **Acceptance 1 (18:53:53 UTC):** every check passed but one item of the signed-out Atlas read: the finding page
  P-1233 shows a mark ("Unverified claim of a conflict of interest", on "The university that ran it owns the brand.") and
  is not kept out of search engines. The code does this on purpose since release b (19 Nov, unchanged here): only an
  unread finding, a waiting sentence or an unverified claim about a person makes a page noindex; a claim about an
  organization keeps its mark and stays indexable (the page is in the sitemap; it is a reviewed finding, "Checked by
  supervisors", so indexed under 224a). The kit's check, from release b, asks noindex for any mark: the acceptance
  check's own over-strict expectation, to fix in the next kit; release J's and I's acceptances never met such a page
  among the twelve they read. The coordinator accepted it as not this release's; the live service is not worse; not
  rolled back. The release's own checks passed (RELEASE_KL_PUBLIC_OK,
  ACCEPTANCE_HOST_OK: the five settings off in the service, the log unlogged, the reader role without login or member,
  no row older than 720 hours).
- **After:** the readers (the five new settings not set, `ASKRIGOR_ATLAS_REVIEW` enabled as before, the error log empty
  at 18:55 UTC, the reader role NOLOGIN without member), the plugin receipt (PLUGIN_RECEIPT_OK: the source copy and the
  installed copy equal M's packaged files, 8 files) and the rollback read (the tag is release J's image; the kept
  runtime.env equals the live one but for the build line; the site 16c82be6).
- **Rollback, ready and not used:** `FORCE_ROLLBACK=1 ./rollback.sh` in the kit: the selector and runtime.env from
  `/opt/askrigor/rollbacks/pre-6c6a93567ac6cfb07dcde3ac1646e2f31bd6ac31`, research-mcp on release J's image, then the
  error log emptied as the migrator (#539's runbook: release J's image has no sweep); 0045, the column and the NOLOGIN
  role stay. The site alone: `./site-rollback.sh` (release J's own archive of 16c82be6).
- **Not done here:** the connector probe through a signed-in app and `inspect` on the owner's accounts (no
  full-protocol line expected), by the coordinator; Gemini users reconnect once; who may read the error log (the owner's
  decision: no login exists); #552, held for the next release.
