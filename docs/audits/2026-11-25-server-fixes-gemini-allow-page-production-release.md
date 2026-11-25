# Production release, 2026-11-25 (release I: the server fixes, Gemini's Allow page, and the privacy page)


- **Owner decision:** the owner chose 417a, "release both" (the server fixes of #521 and the site update), in his Inbox
  at 2026-11-24T21:10:13Z and typed it in the coordinator's chat at 2026-11-24T21:22:33Z (in "402a 403 1b 2a 404a 415c
  416a 417a"); in the same chat he answered "Yes, include it" at 2026-11-24T21:44:36Z, a button of the question "Put the
  Gemini fix (#523) into tonight's release too?". The session that took the work over on 25 Nov asked again, as each
  chat needs its own yes: the owner chose "417a with the Gemini fix" in its question box at 2026-11-25T01:20:53Z, and
  the release ran in that session, done at 01:49:12 UTC, hours before the owner's news check (no host work from 04:40 to
  08:00 UTC). Only #521, #523 and the site update #524: not #520 (413a's research half, the HRP handover and the
  planner's new rule), which waits for runs in the owner's ChatGPT. No setting changes; the Gemini sign-in step log
  (`ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS=enabled`, on since release E2) stays on as it is.
- **What changed for people:**
  - **A failed Europe PMC search is answered from PubMed (#521).** When Europe PMC fails on its own side,
    `search_europe_pmc` now runs PubMed's search itself in the same call, with the same words, dates and page size,
    waiting 10 seconds at most after Europe PMC's own 20; PubMed's records and its own receipt come beside the failed
    envelope, and the result says what AskRigor did and what was still not searched. A query in Europe PMC's own syntax,
    a later page, a refused query or access, and any failure of PubMed's search leave the result as it was; a search
    Europe PMC answers is unchanged. Such a search is not flagged as an error, and the call record counts it as
    answered. (On 24 Nov an owner's test run got `europe_pmc_unreachable` three times; each result said to search PubMed
    with the same words, and the AI didn't.)
  - **A news card can quote an official page (#521).** For the owner's news check only (a dev account's call marked
    `findings_save` "off", the only call whose card can be staged), a quote from a public page the check read with
    `read_forum_thread`, an agency's notice say, is looked up in that page: the server reads it again (at most three
    pages a check), a quote found is signed `web_page`, and a changed or unreadable page leaves the line unchecked
    (`text_changed`, `text_unavailable`). `read_forum_thread`'s receipt now also signs `tx`, the first 32 hex characters
    of the SHA-256 of the text it returned. Nothing of the page is kept. Until now no quote from an official page could
    be checked, so such a card was never stored.
  - **The stored-plans catalog (#521).** The evidence repository's connections run with PostgreSQL's just-in-time
    compilation off (`-c jit=off`): for the stored-plans catalog behind `search_research_frontiers` it compiled 176
    functions on every call, and 9 calls timed out from 23 to 24 November (that this made them slow is inferred from the
    timing, not proven). A failed catalog call now leaves one log line with its class only (PostgreSQL's five-character
    code, `error` or `malformed`), never the query or the error's words.
  - **One sentence where a list is asked (#521).** A registration whose `later_inputs.framing.premise_doubts` is one
    sentence is read as a list of one (a blank one as none) instead of being refused; 65 of 176 test registrations on
    Claude wrote a sentence there and had to call again. The published shape and the tool lists are unchanged.
  - **The heading reader (#521).** A heading's closing colons, full stops and spaces are read once from the end, with
    the same answers (CodeQL's finding: a line of 60,000 full stops took 3 seconds).
  - **Gemini's Allow page (#523).** After Allow or Cancel, Gemini's sign-in answers the form with a page of AskRigor's
    own that goes on by itself (a refresh to the sign-in library's next step on this server, and a link, "continue to
    Google Gemini"), never with a redirect; the page holds that path only, anything else is refused, and the consent
    page's policy is `form-action 'self'` again, naming no Google address. The cause it answers: Chromium checks every
    hop of a form's redirect chain against the form page's `form-action`, and Google's relay redirects once more, to an
    address the policy didn't name, so the browser cancelled the chain, Google never got the one-time code, and a second
    Allow met "session expired" (the owner's links of 22, 23 and 24 Nov). Reproduced in Chromium with three local
    addresses, not with Google's relay. The step log kept before the switch shows the owner's try of 24 Nov: every step
    from Gemini's request at 21:21:02 UTC to the code issued to Google at 21:21:34, then no token call.
  - **The privacy notice (#524, the site release).** "Effective November 25, 2026"; in "Operational metadata", question
    417's sentence on the Gemini sign-in's step log, word for word, after "...comment text, user identifier, or
    credential."; the sentence that stood three sentences earlier now follows it and begins "Apart from that log, the
    only record of calls is". The roadmap's 23 and 24 November sections went live with it.
  - The same 35 tools (no app refresh), HRP 20.6.46 and Universal 20.5.46; no database, setting or plugin change.
- **Contents:** three merges since release H (`436ac046`, live since 24 Nov 14:07:54 UTC): **#522** (`75e71330`, release
  H's record, its index line and its roadmap line, at `86ec8c95`), **#521** (`960909a4` at its checked head
  `b3c301708e3e4c1ced3c97f0480a520ee660bda1`, merged 01:21:22 UTC) and **#523**, merged at 01:30:30 UTC as **M =
  `2ba3047d4c715924e6eb0833236d22f6cdfe8bc8`** (a merge commit at its checked head
  `fc0e7efa6223ca04066881557fe1c8ae2c6914c3`, #523's `0fcf2cb8` with main at `960909a4` merged in; tree equal; GitHub's
  7 checks passed). 33 files: #521's europe-pmc-sections.ts, forum-thread-links.ts, forum-tools.ts, news/{claims, day,
  web-page (new)}.ts, register-tools.ts, research-finalization-gate.ts, research-frontier-search-tool.ts,
  research-steering.ts, source-lines.ts, check-report-vocabulary.ts, packages/evidence-repository/src/postgres.ts,
  packages/sources/src/full-text-admission.ts, docs/design-decisions.md, docs/final-check.md, docs/privacy-data-map.md,
  the Atlas news plan and six test files; #523's gemini-sign-in/{oidc-provider.d.ts, pages.ts, routes.ts},
  docs/gemini-connector.md, a test file and its helper; #522's record, docs/INDEX.md and site/roadmap/index.html (live
  with the site release). Unchanged against `436ac046` (read-only git in build.sh and the render): packages/ but for
  postgres.ts (the pool's configuration only, diff `f45b74d65cc71a27`; the same 43 migrations) and
  full-text-admission.ts; infra/ (compose `15d3cc3a`, both role scripts release b's: review 68 functions, access 21),
  ops/, protocols/ (HRP 20.6.46 `d7dd9929...`, Universal 20.5.46), scripts/, .github, the plugin's packaged files, the
  tool-list fixtures (35 tools; mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini `9a334c4e7a117921`), every
  package.json, the lockfile, every Dockerfile and compose file, .nvmrc; site/ but for the roadmap page; the setting
  names the code reads, 164 at both. The site update **#524** merged after the build, at 01:42:51 UTC, as
  `d78223bb9e5c91f262235e0c5d9da6af07dbbca5` (at its head `335dd4343c67da08d82d238683617f99b3f95fc4`, tree equal: M
  merged in and the date set to the release day; GitHub's 7 checks passed): site/privacy/index.html and the tests that
  pin it (tests/public-site.test.ts, tests/release-packet.test.ts).
- **Before deploying:** GitHub's 7 checks, the complete gate among them, passed on each merge's checked head, #523's
  `fc0e7efa` with M's tree (build.sh reads them; progress.txt still names #516's head there, a leftover of release H's
  kit); no local tree, typecheck or tests (the laptop's memory). The kit's probes were tried first on release H's image
  with the merged code laid over it, no network (KIT_READY, 24 Nov 21:54:29 UTC): RELEASE_I_PROBE_OK (the probe's first
  version) with #523 and without it, failing on release H's own files; RELEASE_H, G, F, E and D, LEDGER_OFF,
  NEW_SETTINGS, PUBLIC_DOSSIERS_OFF, SAFETY_LIMITS, SAFETY_LIMITS_LIVE and PERSON_MARK all OK; build.sh's git and GitHub
  checks on made-up merges: BUILD_CHECKS_OK. The private-map checks were the pull requests' own (#521's and #523's,
  #524's pre-push hook); none over the whole range is in the kit. Each build waited for the resource check: RESOURCES_OK
  at 01:31:00 and 01:33:39 UTC (11.4 GiB available, swap 55%).
- **The first build stopped at 01:32:06 UTC, on the kit's own probe, and ran again.** Its git and GitHub checks passed
  at 01:30:58 and the image was built, but the Gemini check of the kit's release-i-probe.mjs failed on its own text
  matching, not on M's code, and nothing was sent to the host: tsc keeps comments, and #523's comment names
  `form-action` and Google's relay, which the check took for a policy set in the routes; and the check cut the consent
  decision's code at the next `const` indented by two spaces, but the compiled code indents by four, so the cut ran to
  the end of the file, into the sign-in hand-off's own `interactionFinished`. The coordinator read the compiled
  routes.js (`consentDecision` calls `moveOn` twice and `interactionFinished` never) and fixed the probe at 01:33:28
  (comments stripped; the function cut by its braces), which passes on M's code and fails on release H's. The rebuild
  started at 01:33:31; every image layer came from the build cache.
- **Source and image:** source archive SHA-256 `c416e5319ca6ef090e05551e807a971223bf0374af749d4620f0367e185c3c32`
  (11,487,599 bytes); image `sha256:343a0a3ba68bf7429f086f7a0fd37b93658cab10daa3bd0c12db79c0d452b383` (archive
  123,700,679 bytes, SHA-256 `4dd0c95dc4f8e4b82bbe0acaa39d4b2e3fc71089d7084398c8136c8b06f719db`), built at 01:34:21 UTC,
  copied to the host and BUILT at 01:35:27; during the rebuild the lowest available memory was 11,306 MiB and the
  highest swap 54%. The build refused unless the chain from M back to `436ac046` was exactly those three merges, each at
  its checked head with its tree, GitHub's record and passed checks and only its own files, and unless M changed nothing
  else and read no new setting name (BUILD_CHECKS_OK). On the image, no network, no setting: CANDIDATE_OK (/version HRP
  20.6.46 2026-11-22 `d7dd9929...`; one log line, none naming a credential class); RELEASE_I_PROBE_OK (a failed Europe
  PMC search with PubMed's 3 records, its receipt signing PubMed and the note, not flagged as an error; PubMed failing
  too, a Europe PMC field, a leading minus and a refused query left as before, and an answered search unchanged with
  PubMed not asked; the news card's lines found in the page, and the page read again once, for a dev account's call
  marked off, and neither for a call not marked off or for another account's; `-c jit=off` on the repository's
  connections; the catalog's failure line its class only, 3 of 3; the framing 4 of 4; headings 5 of 5 as before and
  60,000 full stops in 0 ms; Gemini's Allow page as above, 7 of 7 other addresses refused, the form answered by a page
  and not a redirect, the one policy `form-action 'self'`, no Google address in the routes, no
  Cross-Origin-Opener-Policy; the report vocabulary's new code name `text_changed`, HRP, Universal, and the three tool
  lists equal to release H's); the earlier releases' probes as regression checks: RELEASE_H, G, F, E and D_PROBE_OK,
  LEDGER_OFF_OK, NEW_SETTINGS_PROBE_OK, PUBLIC_DOSSIERS_OFF_OK, PERSON_MARK_PROBE_OK, SAFETY_LIMITS_PROBE_OK,
  SAFETY_LIMITS_LIVE_OK, SERVICE_READS_OK.
- **Before the switch, from outside (01:35:38 UTC, release H live):** the consent form's POST with `Origin: null`
  answered 400 ("This sign-in took too long or was opened in another browser.") with `Sec-Fetch-Site: same-origin` and
  403 ("incomplete or malformed") cross-site; each of the 9 public pages equal to the live site's 6b4722f1 files, and to
  M's but for the roadmap page (#522's line, not live); the Atlas signed out, 8 pages 200 (01:36:58).
- **Prior state (stage A, to 01:36:09 UTC; the host read at 01:36:01):** research-mcp on `436ac046`, healthy (started
  2026-11-24T14:07:54.55061141Z; image `sha256:e89ae764...`); runtime.env and the selector exactly as release H left
  them (SHA-256 `5472b669361b5dcc` and `30575733463a6946`; 104 names, every kept line as written, the step log line set
  in the service); the site release F's `6b4722f1`; the promotion timer enabled and active; 36 log lines, none naming an
  error. The image archive was copied, its checksum checked and the image loaded on the host with the build's ID. Stage
  B's own checks, read-only, as rendered for M (01:36:14 UTC): STAGE_B_PRECHECKS_OK. The 23 Gemini step lines were
  copied into the kit before the switch (01:37:06), the owner's try of 24 Nov 21:21 UTC among them; the newest sign-in
  step was 15,333 seconds old, past the kit's 10 minutes.
- **Switch (stage B, 01:37:07 to 01:37:58 UTC, at 2,835 quiet seconds; the newest call 00:49:42):** rollback tag
  `askrigor-research:rollback-pre-2ba3047d4c71` = 436ac046's image (`e89ae764f1ce`); the load skipped (stage A loaded it
  with the build's ID); READER_OK; rollback folder
  `/opt/askrigor/rollbacks/pre-2ba3047d4c715924e6eb0833236d22f6cdfe8bc8` with a dump (19,022,032 bytes); the promotion
  timer stopped; migrate complete with nothing new, run from the new image, whose repository connections ask for
  `jit=off` (so PostgreSQL took the option); both role scripts re-run with the same bytes (68 and 21 functions, exactly
  their scripts'); runtime.env's build line only (104 names, SHA-256 `ccefcfaab7641a9a`; the selector
  `54e7b24a4139c72b`); **research-mcp on M from 01:37:49 UTC** (docker's StartedAt on the host,
  2026-11-25T01:37:49.72264722Z), healthy, with the same 110 setting names and mounts, the switches read as before (the
  step log on, safety limits on, Atlas news in shadow) and 2 log lines, none naming an error.
- **Stage C (01:37:58 to 01:40:25 UTC):** /version names M with HRP 20.6.46 (`d7dd9929...`); 35 tools equal the fixture;
  the three compiled tool lists equal; the 9 site pages equal the live site's own files (6b4722f1, before the site
  release); the container: user node, read-only, all capabilities dropped, no new privileges, 1 GiB, 256 processes; the
  standard probe read as in release H, line for line but the build; in the live container RELEASE_I_PROBE_OK, JIT_OFF_OK
  (jit off on the service's own connections; the stored-plans catalog answered 6 of 6 calls in 55, 39, 13, 12, 12 and 14
  ms against its 1,500 ms limit, no failure line), RELEASE_H, G, F, D and E_PROBE_OK and READER_OK, the full-text,
  OpenAlex and shared-answers reads as in release H; LEDGER_OFF_OK and PUBLIC_DOSSIERS_OFF_OK in a container of the new
  image; the promotion ran once on M at 01:40:20 (success, exit 0; atlas_findings queue, 2 complete, 2 no pending
  promotion) and its timer is back on, next run 01:45:05 (not read again after); PROMOTION_OK.
- **Acceptance 1 (01:40:25 to 01:41:08 UTC): ACCEPTANCE_OK.** Through the public address: /version and the manifests
  from outside name M with HRP 20.6.46 `d7dd99297c422faa` and Universal 20.5.46 `e313306b09da7e35`, no out-of-date
  sentence (MANIFESTS_OK); 35 tools equal the fixture; E2's Gemini checks as regression checks (GEMINI_PUBLIC_OK);
  release H's (RELEASE_H_PUBLIC_OK: the refresh notice on /mcp and /mcp/gemini, the exact addresses 10 of 10, refused
  links and calls); RELEASE_I_PUBLIC_OK (three of the sign-in's error pages through the proxy: 400 with AskRigor's own
  policy, no Cross-Origin-Opener-Policy, `cache-control: no-store`, `referrer-policy: no-referrer`); USER_COUNT_OK;
  ATLAS_SIGNED_OUT_OK (12 finding pages, the dispute form 200); D-1001 404; /how-to-research 200; the 9 pages equal the
  live site's 6b4722f1; the host (ACCEPTANCE_HOST_OK): M healthy as the selector and the build line name it, 104 names,
  every kept line as written, the step log on and set in the service; the step log since the switch
  (STEP_LINES_NAMES_ONLY): 16 lines, all fixed names, and a random marker sent in every made-up value in none of the
  log's lines. Of 18 log lines one names an error: the step line of 01:40:39, "authorization error_page step=resume
  status=400 reason=authorization request has expired", the acceptance's own expired-sign-in probe (acceptance 2 wrote
  the same line at 01:48:44).
- **Readers (01:41:12 UTC):** M healthy since 01:37:49; the reviewer and the planner on, the second reader and the
  meaning judge not set; Gemini's sign-in enabled, its step log enabled, the secret set (not shown), no separate login
  client; Atlas news shadow; dossiers on, public dossiers and show-at-once off; the findings ledger on for dev accounts;
  safety limits on; the mark on since 2026-11-21T19:16:33Z (cap USD 1); the planner's timeout not set (45 seconds); 18
  log lines, the one naming an error the acceptance's probe above.
- **Plugin (01:41:14 UTC): PLUGIN_RECEIPT_OK.** The packaged files are unchanged since 436ac046 (8 in the merge, 0
  changed); the source copy and the installed copy (version label
  0.1.0+codex.20261106053949.hrp.20.6.40.universal.20.5.46, 8 files each) equal M's packaged files, and M's own receipt
  script reads both: package_sha256 `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`. No reinstall.
  The connector probe was the coordinator's own Claude connector, not Codex (2026-11-25T01:42:29Z, /mcp/claude,
  read-only; its two calls are in the call record at 01:42:18): 35 tools listed, tool_list_version `ad0494d60fd2376b`;
  HRP 20.6.46 (2026-11-22) `d7dd99297c422faa381ef4ecb0db1a95ed0ad27ed52a1f574fc458c47dab6e65` and Universal 20.5.46
  (2026-10-21) `e313306b09da7e359ea326a44c3850af020acbb2550c30bb2cddf46dc6074d9e`, both on build M, sign-in accepted,
  research ready, no sentence about an outdated tool list; CONNECTOR_PROBE_OK.
- **The way back (rollback read, 01:41:18 UTC):** the tag `rollback-pre-2ba3047d4c71` is 436ac046's image
  (`sha256:e89ae764...`); the folder (700 root:root) keeps both compose files, both role scripts, the dump, and the
  selector and runtime.env naming 436ac046 (104 lines, the step log line in it), which equals the live one but for the
  build line. To release H: `FORCE_ROLLBACK=1 ./rollback.sh` in the kit (the promotion timer stopped and disabled first,
  as AGENTS.md has a rollback do; the selector and runtime.env from the folder; research-mcp recreated on 436ac046's
  image), then `./host-read.sh post-rollback-read.sh post-rollback-read.log <M>`; no database change to undo. The site
  alone: `FORCE_ROLLBACK=1 ./site-rollback.sh` (6b4722f1's archive again, as release `-r2`; it recreates Caddy).
- **Site (01:43:01 to 01:48:30 UTC).** The first run-site.sh stopped at 01:43:01, at its archives step: the site
  worktree had not fetched #524's merge. After a fetch (the worktree at 335dd434, whose site/, ops/public-site, archive
  script, validator and package files equal d78223bb's) the rerun passed: the site archive
  `askrigor-site-d78223bb9e5c.tar.gz` (335,775 bytes, SHA-256
  `002119eef9688a645f80dfa11f1ba9969e0753f2541b12475209a85da48032d4`; its tar equal to `git archive` of d78223bb's site/
  and ops/public-site), 9 pages valid; the rollback archive `askrigor-site-rollback-6b4722f1ac0c.tar.gz` (335,367 bytes,
  `427c506740ed4663...`), byte for byte release F's own archive of 6b4722f1 (the log line calls it release b's, a
  leftover name); SITE_ARCHIVES_READY (01:43:16). Against the live site only site/privacy/index.html and
  site/roadmap/index.html differ. The kit waited for 300 quiet seconds (324 at 01:47:43; the two calls at 01:42:18 were
  the connector probe's). The site release (01:47:43 to 01:48:30): origin/main d78223bb; the archive's checksum checked
  on the host; Caddy's configuration valid; the Caddy container recreated (01:48:07) and release
  `d78223bb9e5c91f262235e0c5d9da6af07dbbca5` activated; the 9 pages equal its files; the roadmap's 24 and 23 November
  sections and the note naming 2026-11-23; the privacy page "Effective November 25, 2026" (the kit refuses a date other
  than the release day's), the terms still "Effective November 21, 2026", the new sentence and the moved one present
  once each; the proxy's rules the same by hash (`476cf4da7b08e075`, without secret, token or key lines) and the Atlas's
  answers the same before and after; the How to research menu item on 9 of 9 pages, the user count image, robots.txt;
  the Atlas through the apex, the research server through its own name with /version naming M; SITE_DONE.
- **Acceptance 2 (01:48:30 to 01:49:12 UTC): ACCEPTANCE_OK.** The same checks as acceptance 1, with the 9 pages equal to
  d78223bb's files (the heading above them in the log still says release H makes no site release, a leftover) and the
  roadmap's 23, 22 and 21 November sections live; the host the same; the step log since the switch: 32 lines, fixed
  names only, the marker in none; of 34 log lines 2 name an error, the two acceptances' expired-sign-in probes.
- **Limits (known, released as such):**
  - Gemini's Allow page was tried by the owner after the release, in a Chromium-based browser: the step log of
    01:54:34 to 01:56:50 UTC shows the sign-in, Allow, the code issued to Google, Google's token call answered, then
    initialize, tools/list and tools/call accepted at the Gemini connector. Those tool calls were answered with the
    connector's notice, because the AskRigor account that Gemini signed in as had not accepted the current free
    contributor notice, which a Gemini connection cannot show; that account is not the one the owner's other apps use.
    Not tried in Firefox or Safari.
  - A search answered from PubMed counts as answered in the call record, with its duration, not as refused with
    `europe_pmc_unreachable` (the privacy page keeps a code only with a refusal). A retry during an outage searches
    PubMed again; a plain query with a word and a colon right after it ("TNF: ...") reads as a Europe PMC field and
    keeps the old note.
  - A journal's own article page whose address holds no identifier could pass as an official page on a news card: the
    server can't tell an official body's page from another site's, and the meaning reading stands behind it.
  - jit=off reaches the evidence repository's connections only (the stored-plans catalog, and the migrate and promotion
    one-shots); the Atlas, access, review, community and dossier connections keep PostgreSQL's default.
  - The catalog's new failure line is a log line the privacy page doesn't name ("In routine operation it emits only a
    startup line."), as for the service's other failure lines; docs/privacy-data-map.md doesn't name it either.
  - How often ChatGPT writes a sentence where the framing asks a list isn't known.
  - Not seen on the real server: a real Europe PMC outage and a news run. The probes, in the image and in the live
    container, check both on invented cases.
- **Roadmap:** this record's pull request adds the 25 November section to "What's new" (the PubMed search, Gemini's
  Allow page, the privacy notice's sentence); it goes live with the next site release, on the owner's yes.
- **Next:** the owner tries Gemini once; the step lines show whether Google's token call comes; the step log goes off
  after a working link, and the privacy page's sentence with it, on a site release. Not changed by this record:
  docs/design-decisions.md (#521's two entries) and docs/privacy-data-map.md still say "not yet released" for #521's
  parts.
- **Kit:** `/home/joel/askrigor-releases/20261124-release-i/` (KIT_READY.md, progress.txt, chain.txt, every log; no
  RESULT.md). Some of its headings and messages still name release H, F or b, or say release I makes no site release
  (copied from earlier kits); the checks under them compare with the right build and files.
