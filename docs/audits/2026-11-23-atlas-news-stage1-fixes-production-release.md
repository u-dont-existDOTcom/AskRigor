# Production release, 2026-11-23 (release G: Atlas news, store the cards that match their checks)


- **Owner decision:** the owner typed "Yes, release 517" in the coordinator's chat at 2026-11-23T20:46:09Z, answering
  "Release the news card fixes (#517) once Codex's review passes?". The release went out on that typed yes, within his
  standing rule of 12 Nov 2026 that pure fixes may be released without asking and rolled back if worse. Only #517: not
  #516, #513 or #503. No setting changes; the Gemini sign-in step log (`ASKRIGOR_GEMINI_OAUTH_DIAGNOSTICS=enabled`, on
  since release E2) stays on as it is. Codex's review of #517 ran five rounds (20:40 to 21:51 UTC); its findings were
  fixed in `5dd3ce94`, `cd20d4f5`, `44cd883f` and `b8317693`, and round 5's one P2 was accepted as a known limit (below).
  run-g.sh started at 22:03:26 UTC on the coordinator's "GO, head b8317693".
- **What changed for people:** nothing they can see. The owner's daily news check sends AskRigor news cards, which are
  stored privately (Atlas news stage 1, shadow; no page reads them) only when their quotes check out word for word; on
  23 Nov 0 of 4 cards were stored, on 22 Nov 1 of 3. With this release the card's finding may have 24 words (about 20
  the aim; it was 12), a study of one group gives its comparison as "none" with the reason, the card's quotes are matched
  by exact rules of their own (a quote's own section label, looked for only in the section of that name; the spacing
  beside a dash; a sentence that ends in a web address; labels and headings in the text are read as for every other
  line, which is matched as before), a short news item the full-text tool admitted no copy of is read in its PubMed
  record, and the owner's day call names each item that leaves the seven-day order and why. The same 35 tools (no app
  refresh), HRP 20.6.46 and Universal 20.5.46, no database, setting, site or plugin change.
- **Contents:** one merge since release F (`6b4722f1`, live since 23 Nov 18:16:25 UTC): **#517**, merged at 21:56:43 UTC
  as **M = `41cc54d719760a058fae90be59c18e1e0b58f9b5`** (a merge commit at its checked head
  `b8317693a46196ed35ba92e41d8cdca532fdd7ff`, = refs/pull/517/head, tree equal; its six commits: `57f334ef` the five
  fixes, `a39d832c` the label rule, `5dd3ce94`, `cd20d4f5`, `44cd883f` and `b8317693` Codex's review rounds; GitHub's 7
  checks green, Deterministic verification to 21:37:18 UTC; main read as 6b4722f1 right before). Its 16 files:
  apps/research-mcp/src's check-report-vocabulary.ts, news/card.ts, news/claims.ts, news/day.ts, news/pubmed-fallback.ts
  (new), news/review.ts, news/staging.ts, register-tools.ts, research-finalization-gate.ts and source-lines.ts;
  docs/privacy-data-map.md; the stage 1 plan; packages/evidence-repository/src/atlas-news.ts; three test files.
  Unchanged against `6b4722f1` (read-only git in build.sh and the render): migrations and postgres.ts (0043's staging
  function bounds the card and the receipt claims by size only, so the longer finding, "none" and the PubMed record's
  PMID need no migration), infra/ (compose `15d3cc3a`, both role scripts release b's), ops/, protocols/ (HRP 20.6.46
  `d7dd9929...`, Universal 20.5.46), site/ (no site release), the plugin's packaged files, the tool-list fixtures (35
  tools; mcp `0d6016087ee4bc5a`, claude `ad0494d60fd2376b`, gemini `9a334c4e7a117921`), every package file, Dockerfile
  and compose file, .nvmrc.
- **Before deploying:** the private-map check over #517's six commits (40 maps from 2 files, 21:56:30 UTC): nothing to
  refuse. On a `git archive` tree of the release head with its own npm ci and tsc -b (its tree M's; 21:55 UTC), and again
  for M (21:57:12 to 21:58:40 UTC): packages/protocol's manifest built from M's protocols, HRP 20.6.46 of 2026-11-22 with
  SHA-256 `d7dd9929...`, the SHA-256 of M's file in git; release G's and F's probes on that build; `npm run typecheck`;
  9 test files, one at a time at --maxWorkers=2 (#517's three, the frozen tool lists, source lines, the final check,
  findings save, the release packet and the report vocabulary's test): 351 passed. Each heavy step waited for the
  owner's resource check to allow it (the laptop's swap had been at 95% at 21:11 UTC; 77% at the build).
- **Source and image:** source archive SHA-256 `69fb2ba7344be6d0e13656271dcb278bd20aea806ea5528eca3f5a2a7d7bd90c`
  (11,425,911 bytes); image `sha256:6b4cbeaca358f5a76ebbbfcdf681c9172df3862c745554c1f256caff3cbf88ca` (archive
  123,651,846 bytes, SHA-256 `ec17a747e41beea044a16ab776ef29a51d37906b7384704a357932629297dc45`), built after the
  resource check of 21:58:42 UTC, done 22:00:15 UTC. The build refused unless the first-parent chain from M back to `6b4722f1` was exactly #517's merge at its
  checked head with its tree and passed checks, and #517's files its own. On the image, no network, no setting:
  CANDIDATE_OK (/version HRP 20.6.46 2026-11-22 `d7dd9929...`); RELEASE_G_PROBE_OK (the news card's limits on invented
  cards, 24 and 25 words, 400 and 401 characters; "none" with and without its reason; the news matching, 21 invented
  quotes as the release head's own tests have them; the standard matching, 15 invented quotes, equal to release F's
  image; the PubMed fallback with a stub source; the news day; #517's report code names; HRP, Universal and the three
  tool lists as F's); the earlier releases' probes as regression checks: RELEASE_F_PROBE_OK, RELEASE_E_PROBE_OK,
  RELEASE_D_PROBE_OK, LEDGER_OFF_OK, NEW_SETTINGS_PROBE_OK, PUBLIC_DOSSIERS_OFF_OK, PERSON_MARK_PROBE_OK,
  SAFETY_LIMITS_PROBE_OK, SAFETY_LIMITS_LIVE_OK, SERVICE_READS_OK.
- **Prior state (stage A, 22:02:27 to 22:03:01 UTC):** research-mcp on `6b4722f1`, healthy (started 23 Nov 18:16:25 UTC);
  runtime.env and the selector exactly as release F left them (SHA-256 `538604961a24082a` and `728ffb25f52b0360`; 104
  names, E2's step log line as written and set in the service); the site release F's `6b4722f1` (all 9 pages equal M's).
  The image archive was copied (rsync, 22:02:15), its checksum checked and the image loaded on the host with the build's
  ID. Stage B's own checks, read-only, as rendered for M (22:03:08 UTC): STAGE_B_PRECHECKS_OK. The Gemini sign-in step
  lines were copied into the kit before the switch (11 lines; among them an owner try at 20:59 UTC: login sent_to_auth0,
  signed_in, consent shown, consent allowed, then library session_expired).
- **Switch (stage B, 22:03:49 to 22:04:40 UTC, at 1,256 quiet seconds; the newest call 21:42:41):** rollback tag
  `askrigor-research:rollback-pre-41cc54d71976` = 6b4722f1's image (`db44f0c38bfd`); the load skipped (stage A loaded it
  with the build's ID); rollback folder `/opt/askrigor/rollbacks/pre-41cc54d719760a058fae90be59c18e1e0b58f9b5` with a
  dump (18,982,515 bytes); the promotion timer stopped; migrate complete with nothing new; both role scripts re-run with
  the same bytes; runtime.env's build line only (104 names, SHA-256 `3bb8fbc3db9f4378`; the selector `3f07bbc84c7ef864`);
  **research-mcp on M from 22:04:32 UTC** (docker's StartedAt on the host, 2026-11-23T22:04:32.417Z), healthy, with the
  same 110 setting names and mounts, the switches read as before (the step log on, safety limits on) and the step log
  setting present in the service.
- **Stage C (22:04:40 to 22:07:15 UTC):** /version names M with HRP 20.6.46 (`d7dd9929...`); 35 tools equal the
  fixture; the three compiled tool lists equal; the 9 site pages equal M's (no site change); in the live container
  RELEASE_G_PROBE_OK, RELEASE_F_PROBE_OK, RELEASE_D_PROBE_OK, RELEASE_E_PROBE_OK and READER_OK; LEDGER_OFF_OK and
  PUBLIC_DOSSIERS_OFF_OK in a container of the new image; the promotion ran once on M at 22:07:11 (success; journal:
  atlas_findings queue, 2 complete, 2 no pending promotion) and its timer is back on (next run 22:10:14); PROMOTION_OK.
- **Acceptance (22:07:15 to 22:08:09 UTC): ACCEPTANCE_OK.** Through the public address: /version and the manifests from
  outside name M with HRP 20.6.46 `d7dd99297c422faa` and Universal 20.5.46 `e313306b09da7e35`, no out-of-date sentence
  (MANIFESTS_OK); 35 tools equal the fixture; E2's Gemini checks as regression checks (GEMINI_PUBLIC_OK); USER_COUNT_OK;
  ATLAS_SIGNED_OUT_OK (12 finding pages, the dispute form 200); D-1001 404; /how-to-research 200; the 9 pages equal M's,
  the roadmap's 22 and 21 November sections and its note as release F left them; the host (ACCEPTANCE_HOST_OK): M
  healthy as the selector and the build line name it, 104 names, every kept line as written, the step log line on and
  set in the service, its step lines seen (2 library session_expired, the acceptance's own).
- **Readers (22:08:16 UTC):** M healthy since 22:04:32; the reviewer and the planner on; Gemini's sign-in enabled, its
  step log enabled, the secret set (not shown), no separate login client; Atlas news shadow; safety limits on; the mark on
  since 2026-11-21T19:16:33Z; public dossiers and show-at-once off; log lines 4, none naming a failure class.
- **Plugin (22:08:18 UTC): PLUGIN_RECEIPT_OK.** The packaged files are unchanged since 6b4722f1; the source copy and the
  installed copy (version label 0.1.0+codex.20261106053949.hrp.20.6.40.universal.20.5.46, 8 files each) equal M's
  packaged files, and M's own scripts/plugin-package-receipt.mjs reads both: package_sha256
  `23afe4908e5a8425d316e99cbc8d24b119f53a27d827f03b92ddeb2ca5f24605`. No reinstall. The connector probe through the
  installed app (to 22:08:52 UTC; Codex, only AskRigor's tools): 35 tools; tool_list_version `0d6016087ee4bc5a`; HRP
  20.6.46 `d7dd99297c422faa` and Universal 20.5.46 `e313306b09da7e35`, both on build M; no out-of-date sentence.
- **The way back (rollback read, 22:08:25 UTC):** the tag `rollback-pre-41cc54d71976` is 6b4722f1's image
  (`sha256:db44f0c3...`); the folder (700 root:root) keeps compose, both role scripts, the dump, and the selector and
  runtime.env naming 6b4722f1 (104 lines, the step log line in it), which equals the live one but for the build line. To
  release F: `FORCE_ROLLBACK=1 ./rollback.sh` in the kit (the promotion timer stopped and disabled first, as AGENTS.md has
  a rollback do; the selector and runtime.env from the folder; research-mcp recreated on 6b4722f1's image). No database or
  site change to undo.
- **Limits (known, released as such):**
  - Codex's review round 5's one P2, accepted as a known limit (the PR body records it): setting aside the white space
    beside a dash turns "(never – smokers, 2020)" into "(never-smokers, 2020)", which the citation grammar both
    matchings share reads as authors and a year, so a quote may leave that parenthesis out. The compact form already
    passes the standard matching on origin/main, so this widens an inherited ambiguity of the citation grammar to its
    spaced form; narrowing the dash rule to figures broke a real case (a spaced em dash in prose), so the fix belongs in
    the shared citation grammar: a follow-up, not this release.
  - What the final approach gives up (b8317693, after the same class four rounds running): labels and headings in the
    text are read as the standard matching reads them, so a who-paid line after a label or a heading in the text is found
    only when the quote gives the label as the text prints it (the news check's writer is told).
  - The one case left that could end a sentence early: an abbreviation written onto the end of an address ("://", or
    "www." and a host name).
  - Not fixed here (the PR's list): the news check's own card instructions (outside this repository) still said 12 words
    and a numeric comparison; a quote that keeps a search copy's citation mark ("^{【94†36】}") or a literal HTML entity
    ("10&#x2009;000") is not found; a news item PubMed lists without an abstract matches only its title.
- **Next:** the news lane's own card instructions (outside this repository) change to 24 words and the "none"
  comparison with this release; the owner's daily news check stores its cards on the next run; this record and its
  roadmap comment in a pull request.
- **Kit:** `/home/joel/askrigor-releases/20261123-release-g/` (README-RELEASE.md, RESULT.md, every log).
